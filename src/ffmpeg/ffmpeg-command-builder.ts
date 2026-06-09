import path from 'node:path';
import type { FfmpegCommand, FfmpegEncodeOptions } from '../types/index.js';
import { escapeFfmpegFilterPath } from '../utils/paths.js';
import {
  ENCODE_ARGS,
  NO_OVERWRITE_ARG,
  OVERWRITE_ARG,
  SLOG3_TO_REC709_FILTER,
} from './ffmpeg-filters.js';

export interface BuildCommandOptions {
  executable?: string;
  overwrite?: boolean;
}

/**
 * Builds the FFmpeg argument list for a single S-Log3 → Rec.709 conversion job.
 */
export function buildFfmpegCommand(
  options: FfmpegEncodeOptions,
  buildOptions: BuildCommandOptions = {},
): FfmpegCommand {
  const executable = buildOptions.executable ?? 'ffmpeg';
  const overwrite = buildOptions.overwrite ?? true;

  const videoFilter = options.lutPath
    ? `lut3d=${escapeFfmpegFilterPath(path.resolve(options.lutPath))}`
    : SLOG3_TO_REC709_FILTER;

  const args: string[] = [
    overwrite ? OVERWRITE_ARG : NO_OVERWRITE_ARG,
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    options.inputPath,
    '-vf',
    videoFilter,
    ...ENCODE_ARGS,
    options.outputPath,
  ];

  return {
    executable,
    args,
    filterDescription: options.lutPath ? `lut3d (${options.lutPath})` : 'built-in S-Log3/S-Gamut3.Cine → Rec.709',
  };
}

/**
 * Returns a human-readable representation of the FFmpeg command.
 */
export function formatFfmpegCommand(command: FfmpegCommand): string {
  const quotedArgs = command.args.map((arg) =>
    /\s/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg,
  );
  return [command.executable, ...quotedArgs].join(' ');
}
