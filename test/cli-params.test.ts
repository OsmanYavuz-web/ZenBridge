import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';

function runCli(args: string[], waitMs = 1500): Promise<{ stdout: string; stderr: string; child: ReturnType<typeof spawn> }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn('node', ['--experimental-strip-types', 'bin/opencode-proxy.ts', ...args], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: undefined, API_KEY: undefined },
    });

    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });

    setTimeout(() => {
      resolve({ stdout, stderr, child });
    }, waitMs);
  });
}

describe('Comprehensive CLI Parameter Verification', () => {
  it('1. --help displays help text', async () => {
    const { stdout, child } = await runCli(['--help'], 800);
    child.kill();
    assert.match(stdout, /ZenBridge - OpenAI-compatible API bridge/);
    assert.match(stdout, /--port <port>/);
    assert.match(stdout, /--api-key <key>/);
  });

  it('2. -v and --version displays version', async () => {
    const { stdout: vOut, child: c1 } = await runCli(['-v'], 800);
    c1.kill();
    assert.match(vOut, /ZenBridge v1\.0\.0/);

    const { stdout: verOut, child: c2 } = await runCli(['--version'], 800);
    c2.kill();
    assert.match(verOut, /ZenBridge v1\.0\.0/);
  });

  it('3. -l and --list-models fetches and prints models from upstream', async () => {
    const { stdout, child } = await runCli(['-l', '--opencode-url', 'http://127.0.0.1:4096'], 1200);
    child.kill();
    assert.match(stdout, /Available Models/);
    assert.match(stdout, /OpenCode Models/);
  });

  it('4. -p / --port and -h / --host configures custom listening socket', async () => {
    const testPort = 8781;
    const { stdout, child } = await runCli(['-p', String(testPort), '-h', '127.0.0.1'], 1200);
    try {
      assert.match(stdout, new RegExp(`http://127.0.0.1:${testPort}`));
      const res = await fetch(`http://127.0.0.1:${testPort}/health`);
      assert.strictEqual(res.status, 200);
      const data = await res.json() as any;
      assert.strictEqual(data.status, 'ok');
    } finally {
      child.kill();
    }
  });

  it('5. -k / --api-key enforces authentication', async () => {
    const testPort = 8782;
    const apiKey = 'test-secret-12345';
    const { child } = await runCli(['--port', String(testPort), '--api-key', apiKey], 1200);
    try {
      // Unauthenticated request -> 401
      const unauthRes = await fetch(`http://127.0.0.1:${testPort}/v1/models`);
      assert.strictEqual(unauthRes.status, 401);
      const unauthJson = await unauthRes.json() as any;
      assert.strictEqual(unauthJson.error.code, 'invalid_api_key');

      // Authenticated with Bearer Header -> 200
      const authRes = await fetch(`http://127.0.0.1:${testPort}/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      assert.strictEqual(authRes.status, 200);

      // Authenticated with x-api-key Header -> 200
      const xKeyRes = await fetch(`http://127.0.0.1:${testPort}/v1/models`, {
        headers: { 'x-api-key': apiKey },
      });
      assert.strictEqual(xKeyRes.status, 200);
    } finally {
      child.kill();
    }
  });

  it('6. --disable-public-ui hides dashboard and swagger documentation', async () => {
    const testPort = 8783;
    const { stdout, child } = await runCli(['--port', String(testPort), '--disable-public-ui'], 1200);
    try {
      assert.match(stdout, /ZenBridge: http:\/\/127\.0\.0\.1:8783/);

      // GET /docs -> 404
      const docsRes = await fetch(`http://127.0.0.1:${testPort}/docs`);
      assert.strictEqual(docsRes.status, 404);

      // GET /openapi.json -> 404
      const openApiRes = await fetch(`http://127.0.0.1:${testPort}/openapi.json`);
      assert.strictEqual(openApiRes.status, 404);

      // GET / with HTML accept header -> minimal text
      const rootHtmlRes = await fetch(`http://127.0.0.1:${testPort}/`, {
        headers: { Accept: 'text/html' },
      });
      assert.strictEqual(rootHtmlRes.status, 200);
      const rootText = await rootHtmlRes.text();
      assert.strictEqual(rootText, 'ZenBridge');

      // API still works
      const modelsRes = await fetch(`http://127.0.0.1:${testPort}/v1/models`);
      assert.strictEqual(modelsRes.status, 200);
    } finally {
      child.kill();
    }
  });

  it('7. -u / --opencode-url sets upstream server', async () => {
    const testPort = 8784;
    const customUpstream = 'http://127.0.0.1:4096';
    const { stdout, child } = await runCli(['--port', String(testPort), '-u', customUpstream], 1200);
    try {
      assert.match(stdout, new RegExp(customUpstream));
      const res = await fetch(`http://127.0.0.1:${testPort}/health`);
      const data = await res.json() as any;
      assert.strictEqual(data.opencode_url, customUpstream);
    } finally {
      child.kill();
    }
  });
});
