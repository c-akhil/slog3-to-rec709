# slog709

Batch-convert Sony **ILCE-7SM3 (A7S III)** S-Log3 / S-Gamut3.Cine `.MP4` footage to **Rec.709** using FFmpeg.

Cross-platform CLI for **macOS**, **Windows**, and **Linux**.

## Features

- Recursively scans input directories for `.MP4` videos and still images (`.JPG`, `.PNG`, `.HEIC`, etc.)
- Preserves folder structure in output
- Never modifies original files — creates converted copies only
- Parallel processing with configurable concurrency (default: 4)
- Progress bar with ETA
- Optional `.cube` LUT for highest color accuracy
- Automatic metadata and timestamp preservation (container, stream, filesystem)
- Built-in S-Log3 → Rec.709 filter chain when no LUT is supplied
- Dry-run mode
- Resume mode (idempotent — skips only verified successes via state file)
- JSON conversion report
- Graceful interrupt handling (SIGINT / SIGTERM)

## Requirements

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **FFmpeg** with `libx264`, `lut3d`, and `ffprobe` support — must be available on your `PATH`

Verify both are installed:

```bash
node --version    # v20.0.0 or higher
ffmpeg -version
```

## Installation

slog709 runs on **macOS**, **Windows**, and **Linux**. Clone the repo, install dependencies, and build:

```bash
git clone <repo-url> slog709
cd slog709
npm install
npm run build
```

Optional — install the `slog709` command globally:

```bash
npm link
```

### macOS

Install FFmpeg with [Homebrew](https://brew.sh):

```bash
brew install ffmpeg
```

Example paths:

| Path type | Example |
|-----------|---------|
| Local folder | `./input-videos` |
| External drive | `/Volumes/Footage` |
| Home directory | `~/Footage` |

### Windows

Install FFmpeg using one of:

```powershell
# winget (recommended)
winget install Gyan.FFmpeg

# Chocolatey
choco install ffmpeg

# Scoop
scoop install ffmpeg
```

Example paths:

| Path type | Example |
|-----------|---------|
| Local folder | `.\input-videos` |
| Drive root | `D:\Footage` |
| Path with spaces | `"D:\My Footage\pre-wedding"` |

Use **PowerShell** or **Command Prompt**. In PowerShell, line continuation is `` ` `` (backtick):

```powershell
npm start -- convert `
  --input "D:\pre-wedding" `
  --output "D:\output-videos"
```

In Command Prompt, use `^` for line continuation:

```cmd
npm start -- convert ^
  --input "D:\pre-wedding" ^
  --output "D:\output-videos"
```

### Linux

Install FFmpeg with your package manager:

```bash
# Debian / Ubuntu
sudo apt update && sudo apt install ffmpeg

# Fedora
sudo dnf install ffmpeg

# Arch
sudo pacman -S ffmpeg
```

Example paths:

| Path type | Example |
|-----------|---------|
| Local folder | `./input-videos` |
| Mounted drive | `/mnt/footage` |
| Home directory | `~/Footage` |

### Run without `npm link`

From the project directory, on any OS:

```bash
npm start -- convert --input "./input-videos" --output "./output-videos"
```

Alternatives:

```bash
node dist/index.js convert --input "./input-videos" --output "./output-videos"
npm run dev -- convert --input "./input-videos" --output "./output-videos"   # development
```

After `npm link`, use the global command:

```bash
slog709 convert --input "./input-videos" --output "./output-videos"
```

## Sample Usages

Examples below use **bash** syntax (`\` line continuation). See the [Windows](#windows) section for PowerShell/CMD variants.

### Quick start (local folders)

Place `.MP4` files in `input-videos/`. Converted files appear in `output-videos/` with the same folder structure.

```bash
npm start -- convert \
  --input "./input-videos" \
  --output "./output-videos"
```

**Windows (PowerShell):**

```powershell
npm start -- convert `
  --input ".\input-videos" `
  --output ".\output-videos"
```

### With Sony Look Profile LUT (recommended)

Download Sony's official S-Log3 / S-Gamut3.Cine look profiles and place them in the project (or anywhere on disk). For standard Rec.709 output, use **`1_SGamut3CineSLog3_To_LC-709.cube`**:

```bash
npm start -- convert \
  --input "./input-videos" \
  --output "./output-videos" \
  --lut "./SonyLookProfiles_SLog3_SGamut3Cine/1_SGamut3CineSLog3_To_LC-709.cube"
```

**Windows (PowerShell):**

```powershell
npm start -- convert `
  --input ".\input-videos" `
  --output ".\output-videos" `
  --lut ".\SonyLookProfiles_SLog3_SGamut3Cine\1_SGamut3CineSLog3_To_LC-709.cube"
```

| LUT file | Look |
|----------|------|
| `1_SGamut3CineSLog3_To_LC-709.cube` | Standard Rec.709 (recommended) |
| `2_SGamut3CineSLog3_To_LC-709TypeA.cube` | Rec.709 Type A |
| `3_SGamut3CineSLog3_To_SLog2-709.cube` | S-Log2 in Rec.709 space |
| `4_SGamut3CineSLog3_To_Cine+709.cube` | Cinematic Rec.709 |

### External drive / large batch

**macOS:**

```bash
slog709 convert \
  --input "/Volumes/Footage/2024/Wedding" \
  --output "/Volumes/Footage_REC709/2024/Wedding" \
  --lut "./SonyLookProfiles_SLog3_SGamut3Cine/1_SGamut3CineSLog3_To_LC-709.cube" \
  --concurrency 8
```

**Windows:**

```powershell
slog709 convert `
  --input "E:\Footage\2024\Wedding" `
  --output "E:\Footage_REC709\2024\Wedding" `
  --lut ".\SonyLookProfiles_SLog3_SGamut3Cine\1_SGamut3CineSLog3_To_LC-709.cube" `
  --concurrency 8
```

**Linux:**

```bash
slog709 convert \
  --input "/mnt/footage/2024/Wedding" \
  --output "/mnt/footage_rec709/2024/Wedding" \
  --lut "./SonyLookProfiles_SLog3_SGamut3Cine/1_SGamut3CineSLog3_To_LC-709.cube" \
  --concurrency 8
```

Subfolders are preserved automatically:

```
input-videos/
├── Ceremony/C4400.MP4
└── M4ROOT/THMBNL/C4422T01.JPG

output-videos/
├── Ceremony/C4400.MP4
└── M4ROOT/THMBNL/C4422T01.JPG
```

Supported still-image formats: `.JPG`, `.JPEG`, `.PNG`, `.HEIC`, `.HEIF`, `.TIF`, `.TIFF`, `.ARW`, `.WEBP` (including Sony `M4ROOT/THMBNL/` thumbnails).

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

### One video at a time

```bash
npm start -- convert \
  --input "./input-videos" \
  --output "./output-videos" \
  --lut "./SonyLookProfiles_SLog3_SGamut3Cine/1_SGamut3CineSLog3_To_LC-709.cube" \
  --concurrency 1
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
  "input": "/path/to/pre-wedding",
  "output": "/path/to/output-videos",
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

## Platform Notes

| Topic | macOS / Linux | Windows |
|-------|---------------|---------|
| Path separators | `/` | `\` (both work when quoted) |
| Line continuation | `\` | `` ` `` in PowerShell, `^` in CMD |
| External drives | `/Volumes/Name` (macOS), `/mnt/...` (Linux) | `D:\`, `E:\`, etc. |
| Global CLI | `npm link` → `slog709` | Same — npm adds `slog709.cmd` |
| State file | `<output>/.slog709-state.json` | Same |
| Interrupt | `Ctrl+C` (SIGINT) | `Ctrl+C` |

Paths with spaces must be quoted on all platforms: `"D:\My Footage"`, `"/Volumes/My Drive"`.

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
  "metadataIssues": 3,
  "durationSeconds": 3842.5
}
```

## Metadata Preservation

Every converted file automatically:

1. Copies container and stream metadata from the source via FFmpeg (`-map_metadata`, explicit `-metadata` tags, chapters)
2. Re-applies any missing metadata in a lossless remux pass when needed
3. Preserves filesystem modified/created timestamps where the OS allows it
4. Verifies source vs output metadata with `ffprobe` and logs any fields that could not be copied

Fields that cannot be preserved (for example subtitle-stream metadata when only video/audio are output) are logged as limitations. See the conversion report `metadataIssues` count and per-file log output.

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
│   ├── report-service.ts       # JSON report
│   ├── state-service.ts        # Idempotent resume state
│   └── metadata-service.ts     # Metadata/timestamp preservation
├── ffmpeg/
│   ├── ffmpeg-command-builder.ts
│   ├── ffmpeg-executor.ts      # execa wrapper
│   ├── ffmpeg-filters.ts       # S-Log3 filter chain
│   ├── ffprobe-service.ts      # Metadata extraction
│   └── metadata-args-builder.ts
├── validation/                 # Zod schemas
├── utils/                      # Paths, logging
└── types/
tests/
├── path-validation.test.ts
├── ffmpeg-command-builder.test.ts
├── metadata-args-builder.test.ts
└── state-service.test.ts
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
