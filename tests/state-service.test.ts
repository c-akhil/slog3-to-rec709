import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import {
  createEmptyState,
  isRunCompatible,
  resolveStatePath,
  shouldSkipFile,
  StateService,
} from '../src/services/state-service.js';
import type { FileStateEntry } from '../src/types/index.js';

describe('state-service', () => {
  const runOptions = {
    input: '/in',
    output: '/out',
    lut: '/lut.cube',
  };

  it('resolves default state path inside output directory', () => {
    expect(resolveStatePath('/out')).toBe(path.join('/out', '.slog709-state.json'));
  });

  it('resolves custom state path', () => {
    expect(resolveStatePath('/out', '/tmp/state.json')).toBe('/tmp/state.json');
  });

  it('detects incompatible runs', () => {
    const state = createEmptyState(runOptions);
    expect(isRunCompatible(state, runOptions)).toBe(true);
    expect(isRunCompatible(state, { ...runOptions, input: '/other' })).toBe(false);
    expect(isRunCompatible(state, { ...runOptions, lut: undefined })).toBe(false);
  });

  it('skips only successful files when resume is enabled', () => {
    const entry: FileStateEntry = {
      status: 'success',
      relativePath: 'clip.MP4',
      inputPath: '/in/clip.MP4',
      outputPath: '/out/clip.MP4',
      inputSize: 100,
      inputMtimeMs: 123,
      updatedAt: new Date().toISOString(),
    };

    const fingerprint = { size: 100, mtimeMs: 123 };

    expect(shouldSkipFile(true, entry, true, fingerprint)).toBe(true);
    expect(shouldSkipFile(false, entry, true, fingerprint)).toBe(false);
    expect(shouldSkipFile(true, { ...entry, status: 'failed' }, true, fingerprint)).toBe(false);
    expect(shouldSkipFile(true, { ...entry, status: 'interrupted' }, true, fingerprint)).toBe(false);
    expect(shouldSkipFile(true, { ...entry, status: 'processing' }, true, fingerprint)).toBe(false);
    expect(shouldSkipFile(true, entry, false, fingerprint)).toBe(false);
    expect(shouldSkipFile(true, entry, true, { size: 999, mtimeMs: 123 })).toBe(false);
  });

  it('classifies pending vs skipped jobs from state', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slog709-state-'));
    const inputDir = path.join(tmpDir, 'in');
    const outputDir = path.join(tmpDir, 'out');
    await fs.ensureDir(inputDir);
    await fs.ensureDir(outputDir);

    const successInput = path.join(inputDir, 'done.MP4');
    const failedInput = path.join(inputDir, 'failed.MP4');
    await fs.writeFile(successInput, 'success-source');
    await fs.writeFile(failedInput, 'failed-source');

    const successOutput = path.join(outputDir, 'done.MP4');
    await fs.writeFile(successOutput, 'converted-output');

    const successStat = await fs.stat(successInput);

    const options = { input: inputDir, output: outputDir };
    const { service } = await StateService.load(options);

    await service.markStatus(
      {
        inputPath: successInput,
        outputPath: successOutput,
        relativePath: 'done.MP4',
      },
      'success',
      {
        inputFingerprint: { size: successStat.size, mtimeMs: successStat.mtimeMs },
        outputSize: (await fs.stat(successOutput)).size,
      },
    );

    await service.markStatus(
      {
        inputPath: failedInput,
        outputPath: path.join(outputDir, 'failed.MP4'),
        relativePath: 'failed.MP4',
      },
      'failed',
      {
        inputFingerprint: { size: 1, mtimeMs: 1 },
        error: 'ffmpeg error',
      },
    );

    const jobs = [
      {
        inputPath: successInput,
        outputPath: successOutput,
        relativePath: 'done.MP4',
      },
      {
        inputPath: failedInput,
        outputPath: path.join(outputDir, 'failed.MP4'),
        relativePath: 'failed.MP4',
      },
      {
        inputPath: path.join(inputDir, 'new.MP4'),
        outputPath: path.join(outputDir, 'new.MP4'),
        relativePath: 'new.MP4',
      },
    ];

    await fs.writeFile(jobs[2].inputPath, 'new-source');

    const { pending, skipped } = await service.classifyJobs(
      jobs,
      true,
      async (outputPath) => {
        try {
          const stat = await fs.stat(outputPath);
          return stat.isFile() && stat.size > 0;
        } catch {
          return false;
        }
      },
      async (inputPath) => {
        const stat = await fs.stat(inputPath);
        return { size: stat.size, mtimeMs: stat.mtimeMs };
      },
    );

    expect(skipped.map((job) => job.relativePath)).toEqual(['done.MP4']);
    expect(pending.map((job) => job.relativePath)).toEqual(['failed.MP4', 'new.MP4']);

    await fs.remove(tmpDir);
  });

  it('persists state updates atomically', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slog709-state-write-'));
    const inputDir = path.join(tmpDir, 'in');
    const outputDir = path.join(tmpDir, 'out');
    await fs.ensureDir(inputDir);
    await fs.ensureDir(outputDir);

    const inputPath = path.join(inputDir, 'clip.MP4');
    await fs.writeFile(inputPath, 'source');
    const stat = await fs.stat(inputPath);

    const options = { input: inputDir, output: outputDir };
    const { service } = await StateService.load(options);

    await service.markStatus(
      {
        inputPath,
        outputPath: path.join(outputDir, 'clip.MP4'),
        relativePath: 'clip.MP4',
      },
      'processing',
      {
        inputFingerprint: { size: stat.size, mtimeMs: stat.mtimeMs },
      },
    );

    const statePath = service.getPath();
    const saved = await fs.readJson(statePath);
    expect(saved.files['clip.MP4'].status).toBe('processing');

    await fs.remove(tmpDir);
  });
});
