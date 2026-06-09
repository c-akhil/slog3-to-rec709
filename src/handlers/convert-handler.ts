import fs from 'fs-extra';
import path from 'node:path';
import { ConversionService } from '../services/conversion-service.js';
import {
  cliConvertOptionsSchema,
  convertOptionsSchema,
} from '../validation/convert-options.schema.js';
import type { ConvertOptions } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { ZodError } from 'zod';

export class ConvertHandler {
  constructor(private readonly conversionService = new ConversionService()) {}

  async handle(rawOptions: unknown): Promise<void> {
    const parsed = this.parseOptions(rawOptions);

    logger.info(`Input:  ${parsed.input}`);
    logger.info(`Output: ${parsed.output}`);
    if (parsed.lut) {
      logger.info(`LUT:    ${parsed.lut}`);
    }
    logger.info(`Concurrency: ${parsed.concurrency}`);
    if (parsed.dryRun) {
      logger.info('Mode: dry-run');
    }
    if (parsed.resume) {
      logger.info('Mode: resume (skip successfully converted files)');
    }
    if (parsed.statePath) {
      logger.info(`State:  ${parsed.statePath}`);
    }

    try {
      const report = await this.conversionService.convert(parsed);
      logger.info(
        `Done — processed: ${report.processed}, failed: ${report.failed}, ` +
          `metadata issues: ${report.metadataIssues}, duration: ${report.durationSeconds}s`,
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  private parseOptions(raw: unknown): ConvertOptions {
    const cliResult = cliConvertOptionsSchema.safeParse(raw);
    if (!cliResult.success) {
      throw cliResult.error;
    }

    const options: ConvertOptions = {
      input: path.resolve(cliResult.data.input),
      output: path.resolve(cliResult.data.output),
      lut: cliResult.data.lut ? path.resolve(cliResult.data.lut) : undefined,
      concurrency: cliResult.data.concurrency,
      dryRun: cliResult.data.dryRun,
      resume: cliResult.data.resume,
      reportPath: cliResult.data.report ? path.resolve(cliResult.data.report) : undefined,
      statePath: cliResult.data.state ? path.resolve(cliResult.data.state) : undefined,
    };

    const validated = convertOptionsSchema.safeParse(options);
    if (!validated.success) {
      throw validated.error;
    }

    return validated.data;
  }

  private handleError(error: unknown): never {
    if (error instanceof ZodError) {
      const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n');
      logger.error(`Invalid options:\n${messages}`);
      process.exitCode = 1;
      throw error;
    }

    if (error instanceof Error) {
      logger.error(error.message);
      process.exitCode = 1;
      throw error;
    }

    logger.error(String(error));
    process.exitCode = 1;
    throw error;
  }
}

export async function validateInputDirectory(inputPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(inputPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function validateOutputDirectory(outputPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(outputPath);
    return stat.isDirectory();
  } catch {
    // Output directory may not exist yet — that is acceptable
    return true;
  }
}

export async function validateLutFile(lutPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(lutPath);
    return stat.isFile() && lutPath.toLowerCase().endsWith('.cube');
  } catch {
    return false;
  }
}
