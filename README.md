# slog709

Batch-convert Sony **ILCE-7SM3 (A7S III)** S-Log3 / S-Gamut3.Cine `.MP4` footage to **Rec.709** using FFmpeg.

## Features

- Recursively scans input directories (all subfolders)
- Preserves folder structure in output
- Never modifies original files — creates converted copies only
- Parallel processing with configurable concurrency (default: 4)
- Progress bar with ETA
- Optional `.cube` LUT for highest color accuracy
- Built-in S-Log3 → Rec.709 filter chain when no LUT is supplied
- Dry-run mode
- Resume mode (skip existing outputs)
- JSON conversion report
- Graceful interrupt handling (SIGINT / SIGTERM)

## Requirements

- **Node.js 20+**
- **FFmpeg** with `libx264` and `lut3d` filter support

## Installation

### macOS

```bash
# Install FFmpeg
brew install ffmpeg

# Clone and install slog709
cd slog709
npm install
npm run build
npm link   # optional — installs `slog709` globally
```

### Run without linking

```bash
npm run dev -- convert --input "/path/to/footage" --output "/path/to/output"
# or after build:
node dist/index.js convert --input "..." --output "..."
```

## Usage

### With a LUT (recommended for best color)

```bash
slog709 convert \
  --input "/Volumes/Footage" \
  --output "/Volumes/Footage_REC709" \
  --lut "/Users/me/LUTs/SLog3_to_Rec709.cube"
```

### Built-in S-Log3 → Rec.709 conversion (no LUT)

```bash
slog709 convert \
  --input "/Volumes/Footage" \
  --output "/Volumes/Footage_REC709" \
  --concurrency 8
```

### Dry-run (preview commands without converting)

```bash
slog709 convert \
  --input "/Volumes/Footage" \
  --output "/Volumes/Footage_REC709" \
  --dry-run
```

### Resume (skip files already converted)

```bash
slog709 convert \
  --input "/Volumes/Footage" \
  --output "/Volumes/Footage_REC709" \
  --resume
```

### Custom report path

```bash
slog709 convert \
  --input "/Volumes/Footage" \
  --output "/Volumes/Footage_REC709" \
  --report "/tmp/conversion-report.json"
```

## CLI Options

| Option | Description |
|--------|-------------|
| `-i, --input <path>` | Source directory containing `.MP4` files (required) |
| `-o, --output <path>` | Output directory for converted files (required) |
| `-l, --lut <path>` | Optional `.cube` LUT file |
| `-c, --concurrency <n>` | Parallel jobs (default: 4, max: 64) |
| `--dry-run` | Print planned FFmpeg commands without executing |
| `--resume` | Skip output files that already exist |
| `-r, --report <path>` | Write JSON report to custom path |

## FFmpeg Commands

**With LUT:**

```bash
ffmpeg -i input.mp4 \
  -vf "lut3d=/path/to/lut.cube" \
  -c:v libx264 -crf 18 -preset medium \
  -c:a copy \
  output.mp4
```

**Without LUT (built-in filter):**

Applies Sony S-Log3 log decode, S-Gamut3.Cine → Rec.709 gamut matrix, and Rec.709 gamma 2.4 encode via FFmpeg `geq`, `colorchannelmixer`, and `eq` filters.

## Conversion Report

After each run, a JSON report is written (default: `.slog709-report.json` in the current directory):

```json
{
  "totalFiles": 120,
  "processed": 118,
  "failed": 2,
  "durationSeconds": 3842.5
}
```

## Camera Assumptions

| Property | Value |
|----------|-------|
| Camera | Sony ILCE-7SM3 (A7S III) |
| Color Space | S-Gamut3.Cine |
| Gamma | S-Log3 |
| Target | Rec.709 Gamma 2.4 |

## Project Structure

```
src/
├── index.ts                    # CLI entry point
├── cli/program.ts              # Commander.js setup
├── handlers/convert-handler.ts # Command handler
├── services/
│   ├── conversion-service.ts   # Orchestration
│   ├── file-scanner-service.ts # Recursive .MP4 discovery
│   ├── progress-service.ts     # Progress bar + ETA
│   └── report-service.ts       # JSON report
├── ffmpeg/
│   ├── ffmpeg-command-builder.ts
│   ├── ffmpeg-executor.ts      # execa wrapper
│   └── ffmpeg-filters.ts       # S-Log3 filter chain
├── validation/                 # Zod schemas
├── utils/                      # Paths, logging
└── types/
tests/
├── path-validation.test.ts
└── ffmpeg-command-builder.test.ts
```

## Development

```bash
npm install
npm test          # run unit tests
npm run lint      # type-check
npm run build     # compile TypeScript
```

## Error Handling

| Error | Behavior |
|-------|----------|
| FFmpeg not found | Exits with install instructions |
| Invalid/missing LUT | Exits before processing |
| Corrupt video | Logs failure, continues other jobs |
| Permission denied | Logs error with path |
| SIGINT / SIGTERM | Stops new jobs, saves partial report |

## Performance Notes

- Designed for 500+ clips
- Videos are streamed through FFmpeg (never loaded into memory)
- Tune `--concurrency` to match CPU cores and storage throughput

## License

MIT
