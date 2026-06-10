export interface ConversionReport {
  totalFiles: number;
  processed: number;
  failed: number;
  metadataIssues: number;
  durationSeconds: number;
}

export interface ConvertOptions {
  input: string;
  output: string;
  lut?: string;
  concurrency: number;
  dryRun: boolean;
  resume: boolean;
  reportPath?: string;
  statePath?: string;
}

export type MediaType = 'video' | 'image';

export interface MediaJob {
  inputPath: string;
  outputPath: string;
  relativePath: string;
  mediaType: MediaType;
}

/** @deprecated Use MediaJob */
export type VideoJob = MediaJob;

export type FileJobStatus = 'pending' | 'processing' | 'success' | 'failed' | 'interrupted';

export interface InputFingerprint {
  size: number;
  mtimeMs: number;
}

export interface FileStateEntry {
  status: FileJobStatus;
  relativePath: string;
  inputPath: string;
  outputPath: string;
  inputSize: number;
  inputMtimeMs: number;
  outputSize?: number;
  updatedAt: string;
  error?: string;
}

export interface ConversionState {
  version: 1;
  input: string;
  output: string;
  lut?: string;
  startedAt: string;
  updatedAt: string;
  files: Record<string, FileStateEntry>;
}

export type JobResult =
  | { status: 'success'; inputPath: string; outputPath: string }
  | { status: 'skipped'; inputPath: string; outputPath: string; reason: string }
  | { status: 'failed'; inputPath: string; outputPath: string; error: string };

import type { MediaMetadataSnapshot } from './metadata.js';

export interface FfmpegEncodeOptions {
  inputPath: string;
  outputPath: string;
  lutPath?: string;
  mediaType?: MediaType;
  metadataSnapshot?: MediaMetadataSnapshot;
}

export interface FfmpegCommand {
  executable: string;
  args: string[];
  filterDescription: string;
}
