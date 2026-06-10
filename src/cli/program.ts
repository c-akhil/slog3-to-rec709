import { Command } from 'commander';
import { ConvertHandler } from '../handlers/convert-handler.js';

export function registerConvertCommand(program: Command): void {
  program
    .command('convert')
    .description(
      'Batch-convert Sony A7S III S-Log3 (.MP4) footage and stills (.JPG, etc.) to Rec.709 using FFmpeg',
    )
    .requiredOption('-i, --input <path>', 'Source directory containing .MP4 and image files')
    .requiredOption('-o, --output <path>', 'Output directory for converted files')
    .option('-l, --lut <path>', 'Optional .cube LUT for color conversion')
    .option(
      '-c, --concurrency <number>',
      'Number of parallel FFmpeg jobs (default: 4)',
      '4',
    )
    .option('--dry-run', 'Print planned conversions without executing FFmpeg', false)
    .option('--resume', 'Skip files recorded as successfully converted in the state file', false)
    .option('-r, --report <path>', 'Path for JSON conversion report')
    .option(
      '-s, --state <path>',
      'Path for resume state JSON (default: <output>/.slog709-state.json)',
    )
    .action(async (options) => {
      const handler = new ConvertHandler();
      await handler.handle(options);
    });
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name('slog709')
    .description(
      'CLI tool to batch-convert Sony ILCE-7SM3 (A7S III) S-Log3 footage to Rec.709',
    )
    .version('1.0.0');

  registerConvertCommand(program);

  return program;
}
