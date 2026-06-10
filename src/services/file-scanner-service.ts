import fs from 'fs-extra';
import path from 'node:path';
import type { MediaJob } from '../types/index.js';
import { getMediaType, isConvertibleMediaFile, mapInputToOutput } from '../utils/paths.js';

export class FileScannerService {
  /**
   * Recursively scans inputRoot for .MP4 videos and supported still images,
   * mapping each to an output path that preserves the relative folder structure.
   */
  async scan(inputRoot: string, outputRoot: string): Promise<MediaJob[]> {
    const resolvedInput = path.resolve(inputRoot);
    const resolvedOutput = path.resolve(outputRoot);
    const jobs: MediaJob[] = [];

    await this.walk(resolvedInput, async (filePath) => {
      const mediaType = getMediaType(filePath);
      if (!mediaType) {
        return;
      }

      const relativePath = path.relative(resolvedInput, filePath);
      jobs.push({
        inputPath: filePath,
        outputPath: mapInputToOutput(resolvedInput, resolvedOutput, filePath),
        relativePath,
        mediaType,
      });
    });

    jobs.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    return jobs;
  }

  countByType(jobs: MediaJob[]): { videos: number; images: number } {
    let videos = 0;
    let images = 0;
    for (const job of jobs) {
      if (job.mediaType === 'video') {
        videos += 1;
      } else {
        images += 1;
      }
    }
    return { videos, images };
  }

  private async walk(dir: string, onFile: (filePath: string) => Promise<void>): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      const errnoError = error as NodeJS.ErrnoException;
      if (errnoError.code === 'EACCES' || errnoError.code === 'EPERM') {
        throw new Error(`Permission denied reading directory: ${dir}`);
      }
      throw error;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.walk(fullPath, onFile);
      } else if (entry.isFile() && isConvertibleMediaFile(fullPath)) {
        await onFile(fullPath);
      }
    }
  }
}

/**
 * Returns true when output exists and appears to be a valid non-empty file.
 */
export async function isValidExistingOutput(outputPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(outputPath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

/**
 * Ensures the parent directory for outputPath exists.
 */
export async function ensureOutputDirectory(outputPath: string): Promise<void> {
  await fs.ensureDir(path.dirname(outputPath));
}

/**
 * Verifies that output was created successfully after FFmpeg completes.
 */
export async function verifyOutputCreated(outputPath: string): Promise<void> {
  const exists = await isValidExistingOutput(outputPath);
  if (!exists) {
    throw new Error(`Output file was not created or is empty: ${outputPath}`);
  }
}
