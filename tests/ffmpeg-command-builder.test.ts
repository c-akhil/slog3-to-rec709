import { describe, expect, it } from 'vitest';
import {
  buildFfmpegCommand,
  formatFfmpegCommand,
} from '../src/ffmpeg/ffmpeg-command-builder.js';
import { ENCODE_ARGS, SLOG3_TO_REC709_FILTER } from '../src/ffmpeg/ffmpeg-filters.js';

describe('FFmpeg command builder', () => {
  const inputPath = '/Volumes/Footage/2024/clip.MP4';
  const outputPath = '/Volumes/Footage_REC709/2024/clip.MP4';

  it('builds LUT-based conversion command', () => {
    const lutPath = '/Users/me/LUTs/SLog3_to_Rec709.cube';
    const command = buildFfmpegCommand({
      inputPath,
      outputPath,
      lutPath,
    });

    expect(command.executable).toBe('ffmpeg');
    expect(command.args).toContain('-i');
    expect(command.args).toContain(inputPath);
    expect(command.args).toContain(outputPath);

    const vfIndex = command.args.indexOf('-vf');
    expect(vfIndex).toBeGreaterThan(-1);
    expect(command.args[vfIndex + 1]).toBe(`lut3d=${lutPath}`);
    expect(command.args).toContain('-c:v');
    expect(command.args).toContain('libx264');
    expect(command.args).toContain('-crf');
    expect(command.args).toContain('18');
    expect(command.args).toContain('-preset');
    expect(command.args).toContain('medium');
    expect(command.args).toContain('-c:a');
    expect(command.args).toContain('copy');
    expect(command.filterDescription).toContain('lut3d');
  });

  it('builds built-in S-Log3 to Rec.709 filter when no LUT is supplied', () => {
    const command = buildFfmpegCommand({
      inputPath,
      outputPath,
    });

    const vfIndex = command.args.indexOf('-vf');
    expect(command.args[vfIndex + 1]).toBe(SLOG3_TO_REC709_FILTER);
    expect(command.filterDescription).toContain('built-in');
  });

  it('uses -n flag when overwrite is disabled', () => {
    const command = buildFfmpegCommand(
      { inputPath, outputPath },
      { overwrite: false },
    );

    expect(command.args[0]).toBe('-n');
  });

  it('uses -y flag when overwrite is enabled', () => {
    const command = buildFfmpegCommand(
      { inputPath, outputPath },
      { overwrite: true },
    );

    expect(command.args[0]).toBe('-y');
  });

  it('includes metadata preservation arguments', () => {
    const command = buildFfmpegCommand({ inputPath, outputPath });

    expect(command.args).toContain('-map_metadata');
    expect(command.args).toContain('-map_chapters');
    expect(command.args).toContain('use_metadata_tags');
  });

  it('includes explicit metadata tags when snapshot is provided', () => {
    const command = buildFfmpegCommand({
      inputPath,
      outputPath,
      metadataSnapshot: {
        formatTags: { artist: 'Sony Camera' },
        streams: [
          {
            index: 0,
            codecType: 'video',
            tags: { creation_time: '2024-01-01T12:00:00.000000Z' },
          },
        ],
        hasSubtitleStreams: false,
      },
    });

    expect(command.args).toContain('artist=Sony Camera');
    expect(command.args).toContain('-metadata:s:v:0');
    expect(command.args).toContain('creation_time=2024-01-01T12:00:00.000000Z');
  });

  it('includes all required encode arguments', () => {
    const command = buildFfmpegCommand({ inputPath, outputPath });

    for (const arg of ENCODE_ARGS) {
      expect(command.args).toContain(arg);
    }
  });

  it('formats command as a readable shell string', () => {
    const command = buildFfmpegCommand({
      inputPath: '/path/with spaces/in.mp4',
      outputPath,
    });

    const formatted = formatFfmpegCommand(command);
    expect(formatted.startsWith('ffmpeg')).toBe(true);
    expect(formatted).toContain('"/path/with spaces/in.mp4"');
  });

  it('escapes special characters in LUT paths', () => {
    const lutPath = "/Users/me/My LUTs/SLog3.cube";
    const command = buildFfmpegCommand({
      inputPath,
      outputPath,
      lutPath,
    });

    const vfIndex = command.args.indexOf('-vf');
    expect(command.args[vfIndex + 1]).toContain("My LUTs");
  });
});
