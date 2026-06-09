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
- Resume mode (idempotent — skips only verified successes via state file)
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

If you haven't run `npm link`, use one of these from the project directory:

```bash
npm start -- convert --input "./input-videos" --output "./output-videos"
# or:
node dist/index.js convert --input "./input-videos" --output "./output-videos"
# or during development:
npm run dev -- convert --input "./input-videos" --output "./output-videos"
```

## Sample Usages

### Quick start (local folders)

Place `.MP4` files in `input-videos/`. Converted files appear in `output-videos/` with the same folder structure.

```bash
npm start -- convert \
  --input "./input-videos" \
  --output "./output-videos"
```

### With Sony Look Profile LUT (recommended)

Download Sony's official S-Log3 / S-Gamut3.Cine look profiles and place them in the project (or anywhere on disk). For standard Rec.709 output, use **`1_SGamut3CineSLog3_To_LC-709.cube`**:

```bash
npm start -- convert \
  --input "./input-videos" \
  --output "./output-videos" \
  --lut "./SonyLookProfiles_SLog3_SGamut3Cine/1_SGamut3CineSLog3_To_LC-709.cube"
```

| LUT file | Look |
|----------|------|
| `1_SGamut3CineSLog3_To_LC-709.cube` | Standard Rec.709 (recommended) |
| `2_SGamut3CineSLog3_To_LC-709TypeA.cube` | Rec.709 Type A |
| `3_SGamut3CineSLog3_To_SLog2-709.cube` | S-Log2 in Rec.709 space |
| `4_SGamut3CineSLog3_To_Cine+709.cube` | Cinematic Rec.709 |

After `npm link`, the same command works with the global binary:

```bash
slog709 convert \
  --input "./input-videos" \
  --output "./output-videos" \
  --lut "./SonyLookProfiles_SLog3_SGamut3Cine/1_SGamut3CineSLog3_To_LC-709.cube"
```

### External drive (batch archive)

```bash
slog709 convert \
  --input "/Volumes/Footage/2024/Wedding" \
  --output "/Volumes/Footage_REC709/2024/Wedding" \
  --lut "./SonyLookProfiles_SLog3_SGamut3Cine/1_SGamut3CineSLog3_To_LC-709.cube" \
  --concurrency 8
```

Subfolders are preserved automatically:

```
input-videos/
├── Ceremony/C4400.MP4
└── Reception/C4401.MP4

output-videos/
├── Ceremony/C4400.MP4
└── Reception/C4401.MP4
```

### Built-in conversion (no LUT)

Uses FFmpeg color filters when no `.cube` file is supplied. Handy for testing; a LUT gives better color accuracy.

```bash
npm start -- convert \
  --input "./input-videos" \
  --output "./output-videos" \
  --concurrency 4
```

### Dry-run (preview FFmpeg commands)

Prints the exact FFmpeg command for each file without writing any output:

```bash
npm start -- convert \
  --input "./input-videos" \
  --output "./output-videos" \
  --lut "./SonyLookProfiles_SLog3_SGamut3Cine/1_SGamut3CineSLog3_To_LC-709.cube" \
  --dry-run
```

Example output:

```
[dry-run] Ceremony/C4400.MP4
  → ffmpeg -y -hide_banner ... -vf "lut3d=..." -c:v libx264 -crf 18 ...
```

### Resume interrupted batch (idempotent)

Resume uses a state file (default: `<output>/.slog709-state.json`) to track each file. With `--resume`:

- **Skipped:** files marked `success` in the state file, with a valid output on disk
- **Re-processed:** failed, interrupted, or partial outputs
- **Safe to re-run:** running the same command multiple times continues where it left off

```bash
npm start -- convert \
  --input "../pre-wedding" \
  --output "./output-videos" \
  --lut "./SonyLookProfiles_SLog3_SGamut3Cine/1_SGamut3CineSLog3_To_LC-709.cube" \
  --concurrency 1 \
  --resume
```

Custom state file path:

```bash
npm start -- convert \
  --input "../pre-wedding" \
  --output "./output-videos" \
  --state "./output-videos/conversion-state.json" \
  --resume
```

Example state entry:

```json
{
  "version": 1,
  "input": "/Users/akhilkumar/akhil/pre-wedding",
  "output": "/Users/akhilkumar/akhil/orginal-videos/output-videos",
  "files": {
    "Ceremony/C4400.MP4": {
      "status": "success",
      "relativePath": "Ceremony/C4400.MP4",
      "inputSize": 134485475,
      "outputSize": 98234112,
      "updatedAt": "2026-06-09T10:30:00.000Z"
    },
    "Ceremony/C4401.MP4": {
      "status": "interrupted",
      "error": "Interrupted",
      "updatedAt": "2026-06-09T10:31:00.000Z"
    }
  }
}
```

### Custom report path

```bash
npm start -- convert \
  --input "./input-videos" \
  --output "./output-videos" \
  --report "./reports/run-2024-06-09.json"
```

### Full example (all options)

```bash
slog709 convert \
  --input "/Volumes/Footage" \
  --output "/Volumes/Footage_REC709" \
  --lut "./SonyLookProfiles_SLog3_SGamut3Cine/1_SGamut3CineSLog3_To_LC-709.cube" \
  --concurrency 8 \
  --resume \
  --report "./reports/conversion-report.json"
```

## CLI Options

| Option | Description |
|--------|-------------|
| `-i, --input <path>` | Source directory containing `.MP4` files (required) |
| `-o, --output <path>` | Output directory for converted files (required) |
| `-l, --lut <path>` | Optional `.cube` LUT file |
| `-c, --concurrency <n>` | Parallel jobs (default: 4, max: 64) |
| `--dry-run` | Print planned FFmpeg commands without executing |
| `--resume` | Skip files recorded as `success` in the state file |
| `-s, --state <path>` | Resume state JSON (default: `<output>/.slog709-state.json`) |
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
