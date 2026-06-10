import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'node:path';
import { buildFfmpegCommand } from './ffmpeg-command-builder.js';
import { FfprobeService } from './ffprobe-service.js';
import type { FfmpegEncodeOptions } from '../types/index.js';

export class FfmpegNotFoundError extends Error {
  constructor() {
    super(
      'FFmpeg executable not found. Install FFmpeg and ensure it is available on your PATH.\n' +
        'macOS: brew install ffmpeg',
    );
    this.name = 'FfmpegNotFoundError';
  }
}

export class LutNotFoundError extends Error {
  constructor(lutPath: string) {
    super(`LUT file not found or not readable: ${lutPath}`);
    this.name = 'LutNotFoundError';
  }
}

export interface FfmpegExecutorOptions {
  executable?: string;
  cancelSignal?: AbortSignal;
}

export class FfmpegExecutor {
  private readonly executable: string;
  private readonly cancelSignal?: AbortSignal;
  private readonly ffprobe: FfprobeService;

  constructor(options: FfmpegExecutorOptions = {}) {
    this.executable = options.executable ?? 'ffmpeg';
    this.cancelSignal = options.cancelSignal;
    this.ffprobe = new FfprobeService('ffprobe', options.cancelSignal);
  }

  async verifyAvailable(): Promise<void> {
    try {
      await execa(this.executable, ['-version'], { cancelSignal: this.cancelSignal });
      await this.ffprobe.verifyAvailable();
    } catch (error) {
      if (this.isMissingExecutable(error)) {
        throw new FfmpegNotFoundError();
      }
      throw error;
    }
  }

  async verifyLut(lutPath: string): Promise<void> {
    const resolved = path.resolve(lutPath);
    try {
      await fs.access(resolved, fs.constants.R_OK);
    } catch {
      throw new LutNotFoundError(resolved);
    }

    if (!resolved.toLowerCase().endsWith('.cube')) {
      throw new Error(`LUT file must have a .cube extension: ${resolved}`);
    }
  }

  async convert(options: FfmpegEncodeOptions, overwrite = true): Promise<void> {
    const inputPath = path.resolve(options.inputPath);
    const outputPath = path.resolve(options.outputPath);
    const metadataSnapshot =
      options.metadataSnapshot ?? (await this.ffprobe.extractMetadata(inputPath));

    const command = buildFfmpegCommand(
      {
        inputPath,
        outputPath,
        lutPath: options.lutPath ? path.resolve(options.lutPath) : undefined,
        mediaType: options.mediaType ?? 'video',
        metadataSnapshot,
      },
      { executable: this.executable, overwrite },
    );

    await execa(command.executable, command.args, {
      cancelSignal: this.cancelSignal,
      reject: true,
    });
  }

  private isMissingExecutable(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const errnoError = error as NodeJS.ErrnoException;
    return errnoError.code === 'ENOENT' || errnoError.message.includes('ENOENT');
  }
}
