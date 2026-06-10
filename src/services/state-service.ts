import fs from 'fs-extra';
import path from 'node:path';
import type {
  ConversionState,
  ConvertOptions,
  FileJobStatus,
  FileStateEntry,
  InputFingerprint,
  MediaJob,
} from '../types/index.js';

export const STATE_FILENAME = '.slog709-state.json';
export const STATE_VERSION = 1 as const;

export function resolveStatePath(outputDir: string, customPath?: string): string {
  return customPath ? path.resolve(customPath) : path.join(path.resolve(outputDir), STATE_FILENAME);
}

export function createEmptyState(options: Pick<ConvertOptions, 'input' | 'output' | 'lut'>): ConversionState {
  const now = new Date().toISOString();
  return {
    version: STATE_VERSION,
    input: path.resolve(options.input),
    output: path.resolve(options.output),
    lut: options.lut ? path.resolve(options.lut) : undefined,
    startedAt: now,
    updatedAt: now,
    files: {},
  };
}

export function isRunCompatible(
  state: ConversionState,
  options: Pick<ConvertOptions, 'input' | 'output' | 'lut'>,
): boolean {
  const input = path.resolve(options.input);
  const output = path.resolve(options.output);
  const lut = options.lut ? path.resolve(options.lut) : undefined;

  return state.input === input && state.output === output && state.lut === lut;
}

/**
 * Resume skips a file only when it previously completed successfully, the output
 * still exists, and the source file has not changed since that success.
 */
export function shouldSkipFile(
  resume: boolean,
  entry: FileStateEntry | undefined,
  outputValid: boolean,
  inputFingerprint: InputFingerprint,
): boolean {
  if (!resume || !entry || entry.status !== 'success' || !outputValid) {
    return false;
  }

  return (
    entry.inputSize === inputFingerprint.size &&
    entry.inputMtimeMs === inputFingerprint.mtimeMs
  );
}

export interface StateLoadResult {
  service: StateService;
  created: boolean;
  incompatible: boolean;
}

export class StateService {
  private state: ConversionState;
  private readonly statePath: string;
  private writeLock: Promise<void> = Promise.resolve();

  private constructor(statePath: string, state: ConversionState) {
    this.statePath = statePath;
    this.state = state;
  }

  static async load(
    options: Pick<ConvertOptions, 'input' | 'output' | 'lut' | 'statePath'>,
  ): Promise<StateLoadResult> {
    const statePath = resolveStatePath(options.output, options.statePath);

    if (!(await fs.pathExists(statePath))) {
      return {
        service: new StateService(statePath, createEmptyState(options)),
        created: true,
        incompatible: false,
      };
    }

    try {
      const loaded = (await fs.readJson(statePath)) as ConversionState;

      if (loaded.version !== STATE_VERSION || !isRunCompatible(loaded, options)) {
        return {
          service: new StateService(statePath, createEmptyState(options)),
          created: false,
          incompatible: true,
        };
      }

      return {
        service: new StateService(statePath, loaded),
        created: false,
        incompatible: false,
      };
    } catch {
      return {
        service: new StateService(statePath, createEmptyState(options)),
        created: false,
        incompatible: true,
      };
    }
  }

  getPath(): string {
    return this.statePath;
  }

  getEntry(relativePath: string): FileStateEntry | undefined {
    return this.state.files[relativePath];
  }

  async classifyJobs(
    jobs: MediaJob[],
    resume: boolean,
    isOutputValid: (outputPath: string) => Promise<boolean>,
    getInputFingerprint: (inputPath: string) => Promise<InputFingerprint>,
  ): Promise<{ pending: MediaJob[]; skipped: MediaJob[] }> {
    const pending: MediaJob[] = [];
    const skipped: MediaJob[] = [];

    for (const job of jobs) {
      const entry = this.getEntry(job.relativePath);
      const outputValid = await isOutputValid(job.outputPath);
      const inputFingerprint = await getInputFingerprint(job.inputPath);

      if (shouldSkipFile(resume, entry, outputValid, inputFingerprint)) {
        skipped.push(job);
      } else {
        pending.push(job);
      }
    }

    return { pending, skipped };
  }

  async markStatus(
    job: MediaJob,
    status: FileJobStatus,
    extras: {
      inputFingerprint: InputFingerprint;
      outputSize?: number;
      error?: string;
    },
  ): Promise<void> {
    await this.mutate(() => {
      const entry: FileStateEntry = {
        status,
        relativePath: job.relativePath,
        inputPath: job.inputPath,
        outputPath: job.outputPath,
        inputSize: extras.inputFingerprint.size,
        inputMtimeMs: extras.inputFingerprint.mtimeMs,
        outputSize: extras.outputSize,
        updatedAt: new Date().toISOString(),
        error: extras.error,
      };

      if (status === 'success') {
        delete entry.error;
      }

      this.state.files[job.relativePath] = entry;
    });
  }

  private async mutate(work: () => void | Promise<void>): Promise<void> {
    this.writeLock = this.writeLock.then(async () => {
      await work();
      this.state.updatedAt = new Date().toISOString();
      await this.writeAtomic();
    });

    await this.writeLock;
  }

  private async writeAtomic(): Promise<void> {
    await fs.ensureDir(path.dirname(this.statePath));
    const tempPath = `${this.statePath}.tmp`;
    await fs.writeJson(tempPath, this.state, { spaces: 2 });
    await fs.move(tempPath, this.statePath, { overwrite: true });
  }
}

export async function readInputFingerprint(inputPath: string): Promise<InputFingerprint> {
  const stat = await fs.stat(inputPath);
  return {
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

export async function readOutputSize(outputPath: string): Promise<number | undefined> {
  try {
    const stat = await fs.stat(outputPath);
    return stat.isFile() ? stat.size : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Removes a partial or stale output file before re-processing.
 */
export async function removePartialOutput(outputPath: string): Promise<void> {
  try {
    await fs.remove(outputPath);
  } catch {
    // ignore cleanup errors
  }
}
