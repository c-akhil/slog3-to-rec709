import { describe, expect, it } from 'vitest';
import {
  validateInputDirectory,
  validateLutFile,
  validateOutputDirectory,
} from '../src/handlers/convert-handler.js';
import {
  escapeFfmpegFilterPath,
  isMp4File,
  isImageFile,
  getMediaType,
  isOutputInsideInput,
  isValidPathString,
  mapInputToOutput,
} from '../src/utils/paths.js';
import { convertOptionsSchema } from '../src/validation/convert-options.schema.js';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';

describe('path validation', () => {
  it('identifies .mp4 files case-insensitively', () => {
    expect(isMp4File('clip.MP4')).toBe(true);
    expect(isMp4File('clip.mp4')).toBe(true);
    expect(isMp4File('clip.Mp4')).toBe(true);
    expect(isMp4File('clip.mov')).toBe(false);
    expect(isMp4File('clip.mp4.bak')).toBe(false);
  });

  it('identifies supported image files case-insensitively', () => {
    expect(isImageFile('thumb.JPG')).toBe(true);
    expect(isImageFile('photo.heic')).toBe(true);
    expect(isImageFile('clip.MP4')).toBe(false);
  });

  it('detects media type from extension', () => {
    expect(getMediaType('clip.MP4')).toBe('video');
    expect(getMediaType('thumb.JPG')).toBe('image');
    expect(getMediaType('sidecar.XML')).toBe(null);
  });

  it('maps input paths to output paths preserving structure', () => {
    const inputRoot = '/Volumes/Footage';
    const outputRoot = '/Volumes/Footage_REC709';
    const inputFile = '/Volumes/Footage/2024/01/DSC_0001.MP4';

    expect(mapInputToOutput(inputRoot, outputRoot, inputFile)).toBe(
      path.join(outputRoot, '2024', '01', 'DSC_0001.MP4'),
    );
  });

  it('detects when output is nested inside input', () => {
    expect(isOutputInsideInput('/Volumes/Footage', '/Volumes/Footage/rec709')).toBe(true);
    expect(isOutputInsideInput('/Volumes/Footage', '/Volumes/Footage_REC709')).toBe(false);
    expect(isOutputInsideInput('/Volumes/Footage', '/Volumes/Footage')).toBe(true);
  });

  it('rejects paths containing null bytes', () => {
    expect(isValidPathString('/valid/path')).toBe(true);
    expect(isValidPathString('/bad\0path')).toBe(false);
    expect(isValidPathString('')).toBe(false);
  });

  it('escapes paths for FFmpeg filter expressions', () => {
    const windowsStyle = "C:\\Users\\me\\LUTs\\SLog3.cube";
    const escaped = escapeFfmpegFilterPath(windowsStyle);
    expect(escaped).toContain('\\\\');
  });

  it('validates convert options with zod', () => {
    const result = convertOptionsSchema.safeParse({
      input: '/in',
      output: '/out',
      concurrency: 4,
      dryRun: false,
      resume: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid concurrency values', () => {
    const result = convertOptionsSchema.safeParse({
      input: '/in',
      output: '/out',
      concurrency: 0,
      dryRun: false,
      resume: false,
    });
    expect(result.success).toBe(false);
  });
});

describe('filesystem validation helpers', () => {
  it('validates existing input directory', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slog709-test-'));
    await expect(validateInputDirectory(tmpDir)).resolves.toBe(true);
    await expect(validateInputDirectory(path.join(tmpDir, 'missing'))).resolves.toBe(false);
    await fs.remove(tmpDir);
  });

  it('validates LUT file extension and existence', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slog709-lut-'));
    const lutPath = path.join(tmpDir, 'test.cube');
    await fs.writeFile(lutPath, 'TITLE "Test"\n');

    await expect(validateLutFile(lutPath)).resolves.toBe(true);
    await expect(validateLutFile(path.join(tmpDir, 'test.3dl'))).resolves.toBe(false);
    await fs.remove(tmpDir);
  });

  it('accepts non-existent output directory as valid target', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slog709-out-'));
    const newOutput = path.join(tmpDir, 'new-output');
    await expect(validateOutputDirectory(newOutput)).resolves.toBe(true);
    await fs.remove(tmpDir);
  });
});
