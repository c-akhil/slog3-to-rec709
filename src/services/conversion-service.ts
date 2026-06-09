import fs from 'fs-extra';
import pLimit from 'p-limit';
import type { ConvertOptions, ConversionReport, JobResult, VideoJob } from '../types/index.js';
import { FfmpegExecutor } from '../ffmpeg/ffmpeg-executor.js';
import { buildFfmpegCommand, formatFfmpegCommand } from '../ffmpeg/ffmpeg-command-builder.js';
import {
  ensureOutputDirectory,
  FileScannerService,
  isValidExistingOutput,
  verifyOutputCreated,
} from './file-scanner-service.js';
import { ProgressService, summarizeResults } from './progress-service.js';
import { createEmptyReport, ReportService } from './report-service.js';
import { isOutputInsideInput } from '../utils/paths.js';
import { logger } from '../utils/logger.js';

export class ConversionService {
  private readonly scanner = new FileScannerService();
  private readonly reportService = new ReportService();
  private readonly progress = new ProgressService();
  private readonly abortController = new AbortController();
  private interrupted = false;

  constructor(private readonly ffmpeg = new FfmpegExecutor()) {
    this.registerSignalHandlers();
  }

  async convert(options: ConvertOptions): Promise<ConversionReport> {
    const startTime = Date.now();

    if (isOutputInsideInput(options.input, options.output)) {
      throw new Error(
        'Output directory must not be inside the input directory (would re-process converted files).',
      );
    }

    await this.ensureInputAccessible(options.input);
    await fs.ensureDir(options.output);

    if (!options.dryRun) {
      await this.ffmpeg.verifyAvailable();
      if (options.lut) {
        await this.ffmpeg.verifyLut(options.lut);
      }
    } else if (options.lut) {
      await this.ffmpeg.verifyLut(options.lut);
    }

    const jobs = await this.scanner.scan(options.input, options.output);

    if (jobs.length === 0) {
      logger.warn('No .MP4 files found in input directory.');
      const emptyReport = createEmptyReport(0);
      await this.reportService.write(emptyReport, options.reportPath);
      return emptyReport;
    }

    logger.info(`Found ${jobs.length} .MP4 file(s) to process.`);

    if (options.dryRun) {
      return this.runDryRun(jobs, options, startTime);
    }

    const pendingJobs = await this.filterJobs(jobs, options.resume);
    const skippedCount = jobs.length - pendingJobs.length;

    if (skippedCount > 0) {
      logger.info(`Skipping ${skippedCount} existing output file(s) (resume mode).`);
    }

    if (pendingJobs.length === 0) {
      logger.info('All files already converted. Nothing to do.');
      const report: ConversionReport = {
        ...createEmptyReport(jobs.length),
        durationSeconds: (Date.now() - startTime) / 1000,
      };
      await this.reportService.write(report, options.reportPath);
      return report;
    }

    this.progress.start(pendingJobs.length);
    const limit = pLimit(options.concurrency);
    const executor = new FfmpegExecutor({ cancelSignal: this.abortController.signal });

    const results: JobResult[] = [];

    // Record skipped jobs in results
    if (options.resume && skippedCount > 0) {
      const pendingSet = new Set(pendingJobs.map((j) => j.inputPath));
      for (const job of jobs) {
        if (!pendingSet.has(job.inputPath)) {
          results.push({
            status: 'skipped',
            inputPath: job.inputPath,
            outputPath: job.outputPath,
            reason: 'Output already exists',
          });
        }
      }
    }

    try {
      await Promise.all(
        pendingJobs.map((job) =>
          limit(async () => {
            if (this.interrupted) {
              return;
            }

            const result = await this.processJob(job, executor, options);
            results.push(result);
            this.progress.tick(job.relativePath);

            if (result.status === 'success') {
              logger.success(`Converted: ${job.relativePath}`);
            } else if (result.status === 'failed') {
              logger.error(`Failed: ${job.relativePath} — ${result.error}`);
            }
          }),
        ),
      );
    } finally {
      this.progress.stop();
    }

    const summary = summarizeResults(results);
    const report: ConversionReport = {
      totalFiles: jobs.length,
      processed: summary.processed,
      failed: summary.failed,
      durationSeconds: (Date.now() - startTime) / 1000,
    };

    const reportFile = await this.reportService.write(report, options.reportPath);
    logger.info(`Report written to ${reportFile}`);

    if (this.interrupted) {
      logger.warn('Conversion interrupted. Partial results saved to report.');
    }

    if (report.failed > 0) {
      throw new Error(`Conversion completed with ${report.failed} failure(s). See report for details.`);
    }

    return report;
  }

  private async runDryRun(
    jobs: VideoJob[],
    options: ConvertOptions,
    startTime: number,
  ): Promise<ConversionReport> {
    logger.info('Dry-run mode — no files will be modified.');

    for (const job of jobs) {
      const command = buildFfmpegCommand({
        inputPath: job.inputPath,
        outputPath: job.outputPath,
        lutPath: options.lut,
      });
      logger.info(`[dry-run] ${job.relativePath}`);
      logger.info(`  → ${formatFfmpegCommand(command)}`);
    }

    const report = {
      ...createEmptyReport(jobs.length),
      durationSeconds: (Date.now() - startTime) / 1000,
    };

    const reportFile = await this.reportService.write(report, options.reportPath);
    logger.info(`Dry-run report written to ${reportFile}`);
    return report;
  }

  private async filterJobs(jobs: VideoJob[], resume: boolean): Promise<VideoJob[]> {
    if (!resume) {
      return jobs;
    }

    const pending: VideoJob[] = [];
    for (const job of jobs) {
      const exists = await isValidExistingOutput(job.outputPath);
      if (!exists) {
        pending.push(job);
      }
    }
    return pending;
  }

  private async processJob(
    job: VideoJob,
    executor: FfmpegExecutor,
    options: ConvertOptions,
  ): Promise<JobResult> {
    try {
      await ensureOutputDirectory(job.outputPath);

      const outputExists = await isValidExistingOutput(job.outputPath);
      if (options.resume && outputExists) {
        return {
          status: 'skipped',
          inputPath: job.inputPath,
          outputPath: job.outputPath,
          reason: 'Output already exists',
        };
      }

      await executor.convert(
        {
          inputPath: job.inputPath,
          outputPath: job.outputPath,
          lutPath: options.lut,
        },
        !options.resume,
      );

      await verifyOutputCreated(job.outputPath);

      return {
        status: 'success',
        inputPath: job.inputPath,
        outputPath: job.outputPath,
      };
    } catch (error) {
      const message = formatJobError(error);

      // Clean up partial output on failure
      try {
        await fs.remove(job.outputPath);
      } catch {
        // ignore cleanup errors
      }

      return {
        status: 'failed',
        inputPath: job.inputPath,
        outputPath: job.outputPath,
        error: message,
      };
    }
  }

  private async ensureInputAccessible(inputRoot: string): Promise<void> {
    try {
      await fs.access(inputRoot, fs.constants.R_OK);
    } catch {
      throw new Error(`Input directory not found or not readable: ${inputRoot}`);
    }
  }

  private registerSignalHandlers(): void {
    const handleInterrupt = (): void => {
      if (this.interrupted) {
        return;
      }
      this.interrupted = true;
      logger.warn('\nInterrupt received — finishing in-flight jobs and stopping new ones...');
      this.abortController.abort();
    };

    process.once('SIGINT', handleInterrupt);
    process.once('SIGTERM', handleInterrupt);
  }
}

function formatJobError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return 'Interrupted';
    }

    const execaError = error as Error & { stderr?: string; shortMessage?: string };
    if (execaError.stderr) {
      return execaError.stderr.trim() || execaError.message;
    }

    return error.message;
  }

  return String(error);
}
