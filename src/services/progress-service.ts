import cliProgress from 'cli-progress';
import type { JobResult } from '../types/index.js';

export class ProgressService {
  private bar: cliProgress.SingleBar | null = null;
  private startTime = 0;
  private completed = 0;

  start(total: number, label = 'Converting'): void {
    this.completed = 0;
    this.startTime = Date.now();

    this.bar = new cliProgress.SingleBar(
      {
        format:
          `${label} |{bar}| {percentage}% | {value}/{total} files | ETA: {eta_formatted} | {filename}`,
        hideCursor: true,
        clearOnComplete: false,
        stopOnComplete: true,
      },
      cliProgress.Presets.shades_classic,
    );

    this.bar.start(total, 0, { filename: 'starting...' });
  }

  tick(filename: string): void {
    this.completed += 1;
    this.bar?.update(this.completed, { filename: truncate(filename, 40) });
  }

  stop(): void {
    this.bar?.stop();
    this.bar = null;
  }

  getElapsedSeconds(): number {
    return (Date.now() - this.startTime) / 1000;
  }
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `…${value.slice(-(maxLength - 1))}`;
}

export function summarizeResults(results: JobResult[]): {
  processed: number;
  failed: number;
  skipped: number;
} {
  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const result of results) {
    switch (result.status) {
      case 'success':
        processed += 1;
        break;
      case 'failed':
        failed += 1;
        break;
      case 'skipped':
        skipped += 1;
        break;
    }
  }

  return { processed, failed, skipped };
}
