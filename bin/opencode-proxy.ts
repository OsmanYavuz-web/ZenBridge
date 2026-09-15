#!/usr/bin/env -S node --experimental-strip-types

/**
 * ZenBridge CLI Executable (Modern TypeScript)
 */

import { ProxyServer } from '../src/server.ts';
import { DEFAULT_CONFIG } from '../src/config.ts';
import { OpenCodeService } from '../src/services/opencode.service.ts';
import { ModelService } from '../src/services/model.service.ts';

const args = process.argv.slice(2);

function printHelp(): void {
  console.log(`
ZenBridge - OpenAI-compatible API bridge for OpenCode free models

Usage:
  zenbridge [options]
  npx zenbridge [options]
  opencode-proxy [options]

Options:
  -p, --port <port>             Port to listen on (default: 8080)
  -h, --host <host>             Host address to bind to (default: 127.0.0.1)
  -u, --opencode-url <url>      OpenCode upstream server URL (default: http://127.0.0.1:4096)
  -k, --api-key <key>           Optional API Key for authenticating incoming proxy requests
  -l, --list-models             List all supported free models and exit
  --disable-public-ui           Disable HTML Dashboard and Swagger UI endpoints
  --help                        Display this help message
  -v, --version                 Show version number

Environment Variables:
  PORT                          Listen port
  HOST                          Bind host address
  OPENCODE_BASE_URL             OpenCode server URL
  API_KEY                       Optional API key authentication
  DISABLE_PUBLIC_UI             Disable Swagger and HTML Dashboard (true/false)

Examples:
  zenbridge --port 8080
  zenbridge --opencode-url http://127.0.0.1:4096 --port 3000 --disable-public-ui
`);
}

let port = DEFAULT_CONFIG.port;
let host = DEFAULT_CONFIG.host;
let opencodeBaseUrl = DEFAULT_CONFIG.opencodeBaseUrl;
let apiKey = DEFAULT_CONFIG.apiKey;
let disablePublicUi = DEFAULT_CONFIG.disablePublicUi;
let listModels = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--help') {
    printHelp();
    process.exit(0);
  } else if (arg === '-v' || arg === '--version') {
    console.log('ZenBridge v1.0.0 (TypeScript Edition)');
    process.exit(0);
  } else if (arg === '--disable-public-ui') {
    disablePublicUi = true;
  } else if (arg === '-l' || arg === '--list-models') {
    listModels = true;
  } else if ((arg === '-p' || arg === '--port') && args[i + 1]) {
    port = parseInt(args[++i], 10);
  } else if ((arg === '-h' || arg === '--host') && args[i + 1]) {
    host = args[++i];
  } else if ((arg === '-u' || arg === '--opencode-url') && args[i + 1]) {
    opencodeBaseUrl = args[++i];
  } else if ((arg === '-k' || arg === '--api-key') && args[i + 1]) {
    apiKey = args[++i];
  }
}

async function main(): Promise<void> {
  if (listModels) {
    const openCodeService = new OpenCodeService(opencodeBaseUrl);
    const modelService = new ModelService(openCodeService);

    const models = await modelService.getModels(true);
    console.log('\n================ OpenCode Models ================');
    if (models.length === 0) {
      console.log(`No models found at ${opencodeBaseUrl}.`);
      console.log('Make sure "opencode serve --port 4096" is running.');
    } else {
      console.log(`Available Models (${models.length}):\n`);
      models.forEach((m) => {
        console.log(`  • ${m.id.padEnd(32)} [${m.provider}] - ${m.name} (Context: ${m.context_window?.toLocaleString() || 'N/A'})`);
      });
    }
    console.log('=================================================\n');
    process.exit(0);
  }

  const server = new ProxyServer({
    port,
    host,
    opencodeBaseUrl,
    apiKey,
    disablePublicUi,
  });

  await server.start();
}

main().catch((err: unknown) => {
  console.error('ZenBridge error:', err);
  process.exit(1);
});
