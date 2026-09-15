#!/usr/bin/env node

/**
 * ZenBridge CLI Executable (Pure JS Runner calling TypeScript source)
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliTsPath = join(__dirname, 'opencode-proxy.ts');

const child = spawn(
  process.execPath,
  ['--experimental-strip-types', cliTsPath, ...process.argv.slice(2)],
  {
    stdio: 'inherit',
  }
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
