export interface ConversionReport {
  totalFiles: number;
  processed: number;
  failed: number;
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
}

export interface VideoJob {
  inputPath: string;
  outputPath: string;
  relativePath: string;
}

export type JobResult =
  | { status: 'success'; inputPath: string; outputPath: string }
  | { status: 'skipped'; inputPath: string; outputPath: string; reason: string }
  | { status: 'failed'; inputPath: string; outputPath: string; error: string };

export interface FfmpegEncodeOptions {
  inputPath: string;
  outputPath: string;
  lutPath?: string;
}

export interface FfmpegCommand {
  executable: string;
  args: string[];
  filterDescription: string;
}
