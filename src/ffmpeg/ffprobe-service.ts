import { execa } from 'execa';
import type { MediaMetadataSnapshot } from '../types/metadata.js';

interface FfprobeStream {
  index?: number;
  codec_type?: string;
  tags?: Record<string, string>;
}

interface FfprobeFormat {
  tags?: Record<string, string>;
}

interface FfprobeJson {
  format?: FfprobeFormat;
  streams?: FfprobeStream[];
}

export class FfprobeNotFoundError extends Error {
  constructor() {
    super(
      'ffprobe executable not found. Install FFmpeg (includes ffprobe) and ensure it is on your PATH.',
    );
    this.name = 'FfprobeNotFoundError';
  }
}

export class FfprobeService {
  constructor(
    private readonly executable = 'ffprobe',
    private readonly cancelSignal?: AbortSignal,
  ) {}

  async verifyAvailable(): Promise<void> {
    try {
      await execa(this.executable, ['-version'], { cancelSignal: this.cancelSignal });
    } catch (error) {
      if (isMissingExecutable(error)) {
        throw new FfprobeNotFoundError();
      }
      throw error;
    }
  }

  async extractMetadata(filePath: string): Promise<MediaMetadataSnapshot> {
    const { stdout } = await execa(
      this.executable,
      [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        '-show_chapters',
        filePath,
      ],
      { cancelSignal: this.cancelSignal },
    );

    const parsed = JSON.parse(stdout) as FfprobeJson;
    const streams = (parsed.streams ?? []).map((stream) => ({
      index: stream.index ?? 0,
      codecType: stream.codec_type ?? 'unknown',
      tags: normalizeTags(stream.tags),
    }));

    return {
      formatTags: normalizeTags(parsed.format?.tags),
      streams,
      hasSubtitleStreams: streams.some((stream) => stream.codecType === 'subtitle'),
    };
  }
}

function normalizeTags(tags?: Record<string, string>): Record<string, string> {
  if (!tags) {
    return {};
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (value !== undefined && value !== '') {
      normalized[key] = String(value);
    }
  }
  return normalized;
}

function isMissingExecutable(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errnoError = error as NodeJS.ErrnoException;
  return errnoError.code === 'ENOENT' || errnoError.message.includes('ENOENT');
}
