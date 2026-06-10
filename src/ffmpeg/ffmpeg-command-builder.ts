import path from 'node:path';
import type { FfmpegCommand, FfmpegEncodeOptions, MediaType } from '../types/index.js';
import type { MediaMetadataSnapshot } from '../types/metadata.js';
import { escapeFfmpegFilterPath } from '../utils/paths.js';
import {
  buildImageMetadataCopyArgs,
  buildMetadataCopyArgs,
} from './metadata-args-builder.js';
import {
  buildImageEncodeArgs,
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
  const mediaType = options.mediaType ?? 'video';
  if (mediaType === 'image') {
    return buildImageFfmpegCommand(options, buildOptions);
  }

  return buildVideoFfmpegCommand(options, buildOptions);
}

function buildVideoFfmpegCommand(
  options: FfmpegEncodeOptions,
  buildOptions: BuildCommandOptions,
): FfmpegCommand {
  const executable = buildOptions.executable ?? 'ffmpeg';
  const overwrite = buildOptions.overwrite ?? true;

  const videoFilter = buildVideoFilter(options);

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
    ...buildMetadataArgs('video', options.metadataSnapshot),
    options.outputPath,
  ];

  return {
    executable,
    args,
    filterDescription: describeFilter(options),
  };
}

function buildImageFfmpegCommand(
  options: FfmpegEncodeOptions,
  buildOptions: BuildCommandOptions,
): FfmpegCommand {
  const executable = buildOptions.executable ?? 'ffmpeg';
  const overwrite = buildOptions.overwrite ?? true;
  const videoFilter = buildVideoFilter(options);

  const args: string[] = [
    overwrite ? OVERWRITE_ARG : NO_OVERWRITE_ARG,
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    options.inputPath,
    '-vf',
    videoFilter,
    ...buildImageEncodeArgs(options.outputPath),
    ...buildMetadataArgs('image', options.metadataSnapshot),
    options.outputPath,
  ];

  return {
    executable,
    args,
    filterDescription: describeFilter(options),
  };
}

function buildVideoFilter(options: FfmpegEncodeOptions): string {
  return options.lutPath
    ? `lut3d=${escapeFfmpegFilterPath(path.resolve(options.lutPath))}`
    : SLOG3_TO_REC709_FILTER;
}

function describeFilter(options: FfmpegEncodeOptions): string {
  return options.lutPath
    ? `lut3d (${options.lutPath})`
    : 'built-in S-Log3/S-Gamut3.Cine → Rec.709';
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

function buildMetadataArgs(
  mediaType: MediaType,
  snapshot?: MediaMetadataSnapshot,
): string[] {
  if (mediaType === 'image') {
    if (!snapshot) {
      return ['-map_metadata', '0'];
    }
    return buildImageMetadataCopyArgs(snapshot);
  }

  if (!snapshot) {
    return ['-map_metadata', '0', '-map_chapters', '0', '-movflags', 'use_metadata_tags'];
  }

  return buildMetadataCopyArgs(snapshot);
}
