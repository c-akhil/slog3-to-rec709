import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'node:path';
import { compareMetadata, flattenMetadata } from '../ffmpeg/metadata-args-builder.js';
import { FfprobeService } from '../ffmpeg/ffprobe-service.js';
import type {
  FilesystemTimestampResult,
  MediaMetadataSnapshot,
  MetadataMismatch,
  MetadataVerificationResult,
} from '../types/metadata.js';
import { logger } from '../utils/logger.js';

export class MetadataService {
  private readonly ffprobe: FfprobeService;
  private readonly cancelSignal?: AbortSignal;

  constructor(cancelSignal?: AbortSignal) {
    this.cancelSignal = cancelSignal;
    this.ffprobe = new FfprobeService('ffprobe', cancelSignal);
  }

  async verifyAvailable(): Promise<void> {
    await this.ffprobe.verifyAvailable();
  }

  async extractSourceMetadata(sourcePath: string): Promise<MediaMetadataSnapshot> {
    return this.ffprobe.extractMetadata(sourcePath);
  }

  async preserveAfterConversion(sourcePath: string, outputPath: string): Promise<{
    verification: MetadataVerificationResult;
    filesystem: FilesystemTimestampResult;
  }> {
    const sourceMetadata = await this.ffprobe.extractMetadata(sourcePath);

    if (sourceMetadata.hasSubtitleStreams) {
      logger.warn(
        `Subtitle stream metadata cannot be copied for ${path.basename(sourcePath)}: output contains re-encoded video/audio only.`,
      );
    }

    let outputMetadata = await this.ffprobe.extractMetadata(outputPath);
    let mismatches = compareMetadata(sourceMetadata, outputMetadata);

    if (mismatches.length > 0) {
      await this.remuxMetadataFromSource(outputPath, sourcePath);
      outputMetadata = await this.ffprobe.extractMetadata(outputPath);
      mismatches = compareMetadata(sourceMetadata, outputMetadata);
    }

    await this.preserveFilesystemTimestamps(sourcePath, outputPath);
    const filesystem = await this.verifyFilesystemTimestamps(sourcePath, outputPath);

    const verification: MetadataVerificationResult = {
      matched: flattenMetadata(sourceMetadata).length - mismatches.length,
      mismatches,
      subtitleMetadataSkipped: sourceMetadata.hasSubtitleStreams,
    };

    this.logVerificationResult(path.basename(sourcePath), verification, filesystem);

    return { verification, filesystem };
  }

  private async remuxMetadataFromSource(outputPath: string, sourcePath: string): Promise<void> {
    const tempPath = `${outputPath}.metadata.tmp.mp4`;

    try {
      await execa(
        'ffmpeg',
        [
          '-y',
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          outputPath,
          '-i',
          sourcePath,
          '-map',
          '0:v:0',
          '-map',
          '0:a:0?',
          '-map_metadata',
          '1',
          '-map_metadata:s:v',
          '1:s:v',
          '-map_metadata:s:a',
          '1:s:a',
          '-c',
          'copy',
          '-movflags',
          'use_metadata_tags',
          tempPath,
        ],
        { reject: true, cancelSignal: this.cancelSignal },
      );

      await fs.move(tempPath, outputPath, { overwrite: true });
    } catch (error) {
      await fs.remove(tempPath).catch(() => undefined);
      throw error;
    }
  }

  async preserveFilesystemTimestamps(sourcePath: string, outputPath: string): Promise<void> {
    const sourceStat = await fs.stat(sourcePath);
    await fs.utimes(outputPath, sourceStat.atime, sourceStat.mtime);

    if (process.platform === 'darwin') {
      await this.preserveMacOsTimestamps(sourcePath, outputPath, sourceStat.birthtime);
      return;
    }

    if (process.platform === 'win32') {
      await this.preserveWindowsTimestamps(sourcePath, outputPath);
    }
  }

  private async preserveMacOsTimestamps(
    sourcePath: string,
    outputPath: string,
    birthtime: Date,
  ): Promise<void> {
    if (birthtime.getTime() <= 0) {
      return;
    }

    const formatted = formatSetFileDate(birthtime);
    try {
      await execa('SetFile', ['-d', formatted, '-m', formatted, outputPath], { reject: false });
    } catch {
      await execa('touch', ['-r', sourcePath, outputPath], { reject: false });
    }
  }

  private async preserveWindowsTimestamps(sourcePath: string, outputPath: string): Promise<void> {
    const script =
      '$src=Get-Item -LiteralPath $args[0]; $dst=Get-Item -LiteralPath $args[1]; ' +
      '$dst.CreationTime=$src.CreationTime; $dst.LastWriteTime=$src.LastWriteTime; ' +
      '$dst.LastAccessTime=$src.LastAccessTime';

    await execa('powershell', ['-NoProfile', '-Command', script, sourcePath, outputPath], {
      reject: false,
    });
  }

  private async verifyFilesystemTimestamps(
    sourcePath: string,
    outputPath: string,
  ): Promise<FilesystemTimestampResult> {
    const sourceStat = await fs.stat(sourcePath);
    const outputStat = await fs.stat(outputPath);

    const mtimePreserved = Math.abs(outputStat.mtimeMs - sourceStat.mtimeMs) < 2000;
    const birthtimeSupported = sourceStat.birthtimeMs > 0 && outputStat.birthtimeMs > 0;
    const birthtimePreserved =
      birthtimeSupported && Math.abs(outputStat.birthtimeMs - sourceStat.birthtimeMs) < 2000;

    return {
      mtimePreserved,
      birthtimePreserved,
      birthtimeSupported,
    };
  }

  private logVerificationResult(
    fileName: string,
    verification: MetadataVerificationResult,
    filesystem: FilesystemTimestampResult,
  ): void {
    if (verification.mismatches.length === 0) {
      logger.info(`Metadata preserved for ${fileName} (${verification.matched} field(s)).`);
    } else {
      logger.warn(
        `Metadata incomplete for ${fileName}: ${verification.mismatches.length} field(s) could not be copied.`,
      );
      for (const mismatch of verification.mismatches) {
        logMismatch(mismatch);
      }
    }

    if (!filesystem.mtimePreserved) {
      logger.warn(`Modified timestamp could not be fully preserved for ${fileName}.`);
    }

    if (filesystem.birthtimeSupported && !filesystem.birthtimePreserved) {
      logger.warn(`Created timestamp could not be fully preserved for ${fileName}.`);
    }
  }
}

function logMismatch(mismatch: MetadataMismatch): void {
  if (mismatch.reason === 'missing') {
    logger.warn(
      `  [${mismatch.scope}] ${mismatch.key}: missing in output (source="${truncate(mismatch.sourceValue)}")`,
    );
    return;
  }

  logger.warn(
    `  [${mismatch.scope}] ${mismatch.key}: mismatch (source="${truncate(mismatch.sourceValue)}", output="${truncate(mismatch.outputValue ?? '')}")`,
  );
}

function truncate(value: string, max = 80): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
}

function formatSetFileDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}
