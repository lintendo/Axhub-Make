#!/usr/bin/env node

import { CliUsageError, runCli } from '../src/server/cli.ts';

runCli()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = error instanceof CliUsageError ? error.exitCode : 1;
  });
