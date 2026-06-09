import fs from 'fs-extra';
import path from 'node:path';
import type { ConversionReport } from '../types/index.js';

export class ReportService {
  async write(report: ConversionReport, reportPath?: string): Promise<string> {
    const destination =
      reportPath ?? path.join(process.cwd(), '.slog709-report.json');

    const payload: ConversionReport = {
      totalFiles: report.totalFiles,
      processed: report.processed,
      failed: report.failed,
      durationSeconds: Math.round(report.durationSeconds * 100) / 100,
    };

    await fs.ensureDir(path.dirname(path.resolve(destination)));
    await fs.writeJson(destination, payload, { spaces: 2 });
    return path.resolve(destination);
  }
}

export function createEmptyReport(totalFiles: number): ConversionReport {
  return {
    totalFiles,
    processed: 0,
    failed: 0,
    durationSeconds: 0,
  };
}
