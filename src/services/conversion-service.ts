import fs from 'fs-extra';
import pLimit from 'p-limit';
import type { ConvertOptions, ConversionReport, JobResult, MediaJob } from '../types/index.js';
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
import {
  readInputFingerprint,
  readOutputSize,
  removePartialOutput,
  shouldSkipFile,
  StateService,
} from './state-service.js';
import { MetadataService } from './metadata-service.js';
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
      logger.warn('No supported media files found in input directory (.MP4, .JPG, .PNG, etc.).');
      const emptyReport = createEmptyReport(0);
      await this.reportService.write(emptyReport, options.reportPath);
      return emptyReport;
    }

    const { videos, images } = this.scanner.countByType(jobs);
    const parts = [];
    if (videos > 0) {
      parts.push(`${videos} video(s)`);
    }
    if (images > 0) {
      parts.push(`${images} image(s)`);
    }
    logger.info(`Found ${jobs.length} file(s) to process (${parts.join(', ')}).`);

    const stateLoad = await StateService.load(options);
    const state = stateLoad.service;

    if (stateLoad.incompatible) {
      logger.warn(
        'Existing state file does not match current input/output/LUT settings. Starting a fresh run.',
      );
    }

    if (!options.dryRun) {
      logger.info(`State file: ${state.getPath()}`);
    }

    if (options.dryRun) {
      return this.runDryRun(jobs, options, state, startTime);
    }

    const { pending: pendingJobs, skipped: skippedJobs } = await state.classifyJobs(
      jobs,
      options.resume,
      isValidExistingOutput,
      readInputFingerprint,
    );

    if (options.resume && skippedJobs.length > 0) {
      logger.info(`Skipping ${skippedJobs.length} successfully converted file(s) (resume mode).`);
    }

    if (options.resume && pendingJobs.length > 0) {
      const partialCount = await this.countPartialOutputs(pendingJobs);
      if (partialCount > 0) {
        logger.info(`Re-processing ${partialCount} partial or incomplete file(s).`);
      }
    }

    const results: JobResult[] = skippedJobs.map((job) => ({
      status: 'skipped',
      inputPath: job.inputPath,
      outputPath: job.outputPath,
      reason: 'Previously converted successfully',
    }));

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
    const metadataService = new MetadataService(this.abortController.signal);
    let metadataIssues = 0;

    try {
      await Promise.all(
        pendingJobs.map((job) =>
          limit(async () => {
            if (this.interrupted) {
              return;
            }

            const result = await this.processJob(job, executor, metadataService, options, state);
            results.push(result);
            this.progress.tick(job.relativePath);

            if (result.status === 'success') {
              metadataIssues += result.metadataIssues ?? 0;
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
      metadataIssues,
      durationSeconds: (Date.now() - startTime) / 1000,
    };

    const reportFile = await this.reportService.write(report, options.reportPath);
    logger.info(`Report written to ${reportFile}`);

    if (metadataIssues > 0) {
      logger.warn(`${metadataIssues} metadata field(s) could not be fully preserved. See logs above.`);
    }

    if (this.interrupted) {
      logger.warn('Conversion interrupted. Re-run with --resume to continue from state file.');
    }

    if (report.failed > 0) {
      throw new Error(`Conversion completed with ${report.failed} failure(s). See report for details.`);
    }

    return report;
  }

  private async runDryRun(
    jobs: MediaJob[],
    options: ConvertOptions,
    state: StateService,
    startTime: number,
  ): Promise<ConversionReport> {
    logger.info('Dry-run mode — no files will be modified.');

    for (const job of jobs) {
      const entry = state.getEntry(job.relativePath);
      const outputValid = await isValidExistingOutput(job.outputPath);
      const inputFingerprint = await readInputFingerprint(job.inputPath);
      const skip = shouldSkipFile(options.resume, entry, outputValid, inputFingerprint);

      const command = buildFfmpegCommand({
        inputPath: job.inputPath,
        outputPath: job.outputPath,
        lutPath: options.lut,
        mediaType: job.mediaType,
      });

      const action = skip ? '[dry-run] skip' : '[dry-run] convert';
      logger.info(`${action} ${job.relativePath}`);
      if (!skip) {
        logger.info(`  → ${formatFfmpegCommand(command)}`);
      }
    }

    const report = {
      ...createEmptyReport(jobs.length),
      durationSeconds: (Date.now() - startTime) / 1000,
    };

    const reportFile = await this.reportService.write(report, options.reportPath);
    logger.info(`Dry-run report written to ${reportFile}`);
    return report;
  }

  private async countPartialOutputs(pendingJobs: MediaJob[]): Promise<number> {
    let count = 0;
    for (const job of pendingJobs) {
      try {
        await fs.access(job.outputPath);
        count += 1;
      } catch {
        // no partial file on disk
      }
    }
    return count;
  }

  private async processJob(
    job: MediaJob,
    executor: FfmpegExecutor,
    metadataService: MetadataService,
    options: ConvertOptions,
    state: StateService,
  ): Promise<JobResult & { metadataIssues?: number }> {
    const inputFingerprint = await readInputFingerprint(job.inputPath);

    try {
      await ensureOutputDirectory(job.outputPath);

      const entry = state.getEntry(job.relativePath);
      const outputValid = await isValidExistingOutput(job.outputPath);
      if (shouldSkipFile(options.resume, entry, outputValid, inputFingerprint)) {
        return {
          status: 'skipped',
          inputPath: job.inputPath,
          outputPath: job.outputPath,
          reason: 'Previously converted successfully',
        };
      }

      await removePartialOutput(job.outputPath);
      await state.markStatus(job, 'processing', { inputFingerprint });

      await executor.convert(
        {
          inputPath: job.inputPath,
          outputPath: job.outputPath,
          lutPath: options.lut,
          mediaType: job.mediaType,
        },
        true,
      );

      await verifyOutputCreated(job.outputPath);

      const { verification } = await metadataService.preserveAfterConversion(
        job.inputPath,
        job.outputPath,
        job.mediaType,
      );

      const outputSize = await readOutputSize(job.outputPath);
      await state.markStatus(job, 'success', { inputFingerprint, outputSize });

      return {
        status: 'success',
        inputPath: job.inputPath,
        outputPath: job.outputPath,
        metadataIssues: verification.mismatches.length,
      };
    } catch (error) {
      const message = formatJobError(error);
      const interrupted = this.interrupted || message === 'Interrupted';

      await removePartialOutput(job.outputPath);
      await state.markStatus(job, interrupted ? 'interrupted' : 'failed', {
        inputFingerprint,
        error: message,
      });

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
