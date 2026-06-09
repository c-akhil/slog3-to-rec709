#!/usr/bin/env node

import { createProgram } from './cli/program.js';

async function main(): Promise<void> {
  const program = createProgram();
  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  if (error instanceof Error && error.message) {
    process.stderr.write(`${error.message}\n`);
  }
  process.exit(process.exitCode ?? 1);
});
