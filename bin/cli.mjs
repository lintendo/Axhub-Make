#!/usr/bin/env node

import { handleCliError, runCli } from '../src/server/cli.ts';

runCli()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    process.exitCode = handleCliError(error);
  });
