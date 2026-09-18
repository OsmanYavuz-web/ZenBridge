import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer, type Server } from 'node:http';
import { ProxyServer } from '../src/server.ts';
import { getFallbackModelInfo } from '../src/config.ts';
import { OpenAITransformer } from '../src/transformers/openai.transformer.ts';
import { OpenCodeService } from '../src/services/opencode.service.ts';
import { ModelService } from '../src/services/model.service.ts';
import { ChatService } from '../src/services/chat.service.ts';

describe('ZenBridge Tests', () => {
  let mockOpenCodeServer: Server;
  const mockOpenCodePort = 4199;
  let proxyServer: ProxyServer;
  const proxyPort = 8199;
  const recordedRequests: Array<{ method: string; pathname: string; searchParams: URLSearchParams }> = [];

  before(async () => {
    // Setup Mock OpenCode Server
    mockOpenCodeServer = createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://127.0.0.1:${mockOpenCodePort}`);
      recordedRequests.push({
        method: req.method || 'GET',
        pathname: url.pathname,
        searchParams: url.searchParams,
      });

      if (req.method === 'GET' && url.pathname === '/config/providers') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            providers: [
              {
                id: 'opencode',
                name: 'OpenCode Custom',
                models: {
                  'quantum-v1-free': {
                    id: 'quantum-v1-free',
                    name: 'Quantum V1 Free',
                    providerID: 'opencode',
                    cost: 0,
                    limit: { context: 256000 },
                  },
                  'mimo-v2.5-free': {
                    id: 'mimo-v2.5-free',
                    name: 'MiMo V2.5 Free',
                    providerID: 'opencode',
                    cost: 0,
                    limit: { context: 200000 },
                  },
                  'nemotron-3.5-lightning-free': {
                    id: 'nemotron-3.5-lightning-free',
                    name: 'Nemotron 3.5 Lightning Free',
                    providerID: 'opencode',
                    cost: 0,
                    limit: { context: 262144 },
                  },
                },
              },
            ],
          })
        );
        return;
      }

      if (req.method === 'POST' && url.pathname === '/session') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'ses_mock123' }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/session') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([{ id: 'ses_mock123', title: 'Test Mock Session', createdAt: '2026-09-14' }]));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/session/ses_mock123') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'ses_mock123', title: 'Test Mock Session', messages: [] }));
        return;
      }

      if (req.method === 'DELETE' && url.pathname.startsWith('/session/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === 'POST' && url.pathname.startsWith('/session/ses_mock123/message')) {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          const parsed = JSON.parse(body);
          const modelId = parsed.model?.modelID || 'unknown';
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              parts: [
                { type: 'reasoning', text: 'Step by step thought process' },
                { type: 'text', text: `Response from ${modelId}` },
              ],
            })
          );
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise((resolve) => mockOpenCodeServer.listen(mockOpenCodePort, '127.0.0.1', resolve));

    // Setup TypeScript Proxy Server
    proxyServer = new ProxyServer({
      port: proxyPort,
      host: '127.0.0.1',
      opencodeBaseUrl: `http://127.0.0.1:${mockOpenCodePort}`,
      disablePublicUi: false,
    });

    await proxyServer.start(proxyPort, '127.0.0.1');
  });

  after(async () => {
    if (proxyServer) await proxyServer.stop();
    if (mockOpenCodeServer) {
      await new Promise((resolve) => mockOpenCodeServer.close(resolve));
    }
  });

  describe('Transformer & Model Service Tests', () => {
    it('formats single user message properly', () => {
      const res = OpenAITransformer.formatMessagesToPrompt([{ role: 'user', content: 'Hello TS' }]);
      assert.strictEqual(res.promptText, 'Hello TS');
      assert.strictEqual(res.parts[0].text, 'Hello TS');
    });

    it('formats multi-turn messages with roles', () => {
      const res = OpenAITransformer.formatMessagesToPrompt([
        { role: 'system', content: 'You are TS assistant' },
        { role: 'user', content: 'First query' },
        { role: 'assistant', content: 'First response' },
        { role: 'user', content: 'Follow up' },
      ]);
      assert.strictEqual(res.systemPrompt, 'You are TS assistant');
      assert.ok(res.promptText.includes('[Assistant]:\nFirst response'));
      assert.ok(res.promptText.includes('[User]:\nFollow up'));
    });

    it('extracts text from OpenCode parts structure and ignores ReasoningPart', () => {
      const text = OpenAITransformer.extractTextFromOpenCodeResponse({
        parts: [
          { type: 'reasoning', text: 'Internal model reasoning that should be omitted' },
          { type: 'text', text: 'Clean user-facing message' },
        ],
      });
      assert.strictEqual(text, 'Clean user-facing message');
    });

    it('cleans reasoning XML tags from model output without mutating natural text', () => {
      const input1 = '<think>I should tell a joke</think>Temel ile Dursun bir gün...';
      assert.strictEqual(OpenAITransformer.cleanReasoning(input1), 'Temel ile Dursun bir gün...');

      const input2 = '<thought>Internal model thought process</thought>Burada geçerli yanıt yer alır.';
      assert.strictEqual(OpenAITransformer.cleanReasoning(input2), 'Burada geçerli yanıt yer alır.');

      const input3 = 'Orphaned thought lead</think>Sarımsak bir gün domatesle karşılaşır: "Alo, alo!"';
      assert.strictEqual(OpenAITransformer.cleanReasoning(input3), 'Sarımsak bir gün domatesle karşılaşır: "Alo, alo!"');

      const input4 = 'Doğrudan Türkçe temiz metin: The user wants to learn Node.js 20. I will explain it.';
      assert.strictEqual(
        OpenAITransformer.cleanReasoning(input4),
        'Doğrudan Türkçe temiz metin: The user wants to learn Node.js 20. I will explain it.'
      );
    });

    it('formats only the latest message with formatLatestMessage', () => {
      const res = OpenAITransformer.formatLatestMessage([
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First reply' },
        { role: 'user', content: 'Latest follow-up message' },
      ]);
      assert.strictEqual(res.promptText, 'Latest follow-up message');
      assert.strictEqual(res.parts[0].text, 'Latest follow-up message');
    });

    it('ModelService resolves and caches models from /config/providers', async () => {
      const openCodeService = new OpenCodeService(`http://127.0.0.1:${mockOpenCodePort}`);
      const modelService = new ModelService(openCodeService);
      const models = await modelService.getModels();

      assert.ok(models.some((m) => m.id === 'quantum-v1-free'));
      assert.ok(models.some((m) => m.id === 'mimo-v2.5-free'));
    });

    it('ModelService auto-resolves a free model when modelId is empty, auto, or random', async () => {
      const openCodeService = new OpenCodeService(`http://127.0.0.1:${mockOpenCodePort}`);
      const modelService = new ModelService(openCodeService);

      const autoModel = await modelService.resolveModel('auto');
      assert.ok(autoModel);
      assert.strictEqual(autoModel.cost ?? 0, 0);

      const emptyModel = await modelService.resolveModel('');
      assert.ok(emptyModel);
      assert.strictEqual(emptyModel.cost ?? 0, 0);
    });
  });

  describe('ChatService Tests', () => {
    it('completes chat non-streaming', async () => {
      const openCodeService = new OpenCodeService(`http://127.0.0.1:${mockOpenCodePort}`);
      const modelService = new ModelService(openCodeService);
      const chatService = new ChatService(openCodeService, modelService);

      const resp = await chatService.completeChat({
        model: 'mimo-v2.5-free',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      assert.strictEqual(resp.object, 'chat.completion');
      assert.strictEqual(resp.model, 'mimo-v2.5-free');
      assert.strictEqual(resp.session_id, 'ses_mock123');
      assert.ok(resp.choices[0].message.content.includes('Response from mimo-v2.5-free'));
    });

    it('completes chat with existing session_id', async () => {
      const openCodeService = new OpenCodeService(`http://127.0.0.1:${mockOpenCodePort}`);
      const modelService = new ModelService(openCodeService);
      const chatService = new ChatService(openCodeService, modelService);

      const resp = await chatService.completeChat({
        model: 'mimo-v2.5-free',
        session_id: 'ses_mock123',
        messages: [
          { role: 'user', content: 'Previous msg' },
          { role: 'assistant', content: 'Previous reply' },
          { role: 'user', content: 'Follow-up question' },
        ],
      });

      assert.strictEqual(resp.object, 'chat.completion');
      assert.strictEqual(resp.session_id, 'ses_mock123');
      assert.ok(resp.choices[0].message.content.includes('Response from mimo-v2.5-free'));
    });

    it('streams chat using async generator', async () => {
      const openCodeService = new OpenCodeService(`http://127.0.0.1:${mockOpenCodePort}`);
      const modelService = new ModelService(openCodeService);
      const chatService = new ChatService(openCodeService, modelService);

      const chunks: string[] = [];
      for await (const chunk of chatService.streamChat({
        model: 'mimo-v2.5-free',
        messages: [{ role: 'user', content: 'Stream' }],
      })) {
        chunks.push(chunk);
      }

      assert.ok(chunks.length > 0);
      assert.ok(chunks[chunks.length - 1].includes('[DONE]'));
    });

    it('returns reasoning_content when include_reasoning is true', async () => {
      const openCodeService = new OpenCodeService(`http://127.0.0.1:${mockOpenCodePort}`);
      const modelService = new ModelService(openCodeService);
      const chatService = new ChatService(openCodeService, modelService);

      const resp = await chatService.completeChat({
        model: 'mimo-v2.5-free',
        messages: [{ role: 'user', content: 'Explain logic' }],
        include_reasoning: true,
      });

      assert.strictEqual(resp.choices[0].message.content, 'Response from mimo-v2.5-free');
      assert.strictEqual(resp.choices[0].message.reasoning_content, 'Step by step thought process');
    });
  });

  describe('HTTP REST API Endpoints Tests', () => {
    it('GET / with Accept: text/html returns Landing Dashboard HTML', async () => {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/`, {
        headers: { Accept: 'text/html,application/xhtml+xml' },
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('content-type')?.includes('text/html'));
      const html = await res.text();
      assert.ok(html.includes('ZenBridge'));
      assert.ok(html.includes('Universal OpenAI Gateway'));
      assert.ok(html.includes('OpenCode Connected'));
    });

    it('GET /health returns 200 with enriched service info and docs URLs', async () => {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/health`);
      assert.strictEqual(res.status, 200);
      const json: any = await res.json();
      assert.strictEqual(json.status, 'ok');
      assert.strictEqual(json.opencode_connected, true);
      assert.ok(json.openai_base_url.includes('/v1'));
      assert.ok(json.docs_url.includes('/docs'));
      assert.strictEqual(typeof json.uptime_seconds, 'number');
    });

    it('GET /v1/models returns OpenAI model list with dynamic and static models', async () => {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/models`);
      assert.strictEqual(res.status, 200);
      const json: any = await res.json();
      assert.strictEqual(json.object, 'list');
      assert.ok(json.data.some((m: any) => m.id === 'quantum-v1-free'));
      assert.ok(json.data.some((m: any) => m.id === 'nemotron-3.5-lightning-free'));
    });

    it('POST /v1/chat/completions (Non-Streaming) without model auto-selects free model and returns session_id', async () => {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'No model specified' }],
          stream: false,
        }),
      });

      assert.strictEqual(res.status, 200);
      const json: any = await res.json();
      assert.strictEqual(json.object, 'chat.completion');
      assert.ok(typeof json.model === 'string' && json.model.length > 0);
      assert.strictEqual(json.session_id, 'ses_mock123');
      assert.strictEqual(res.headers.get('x-session-id'), 'ses_mock123');
    });

    it('POST /v1/chat/completions with session_id in request body continues existing session', async () => {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'mimo-v2.5-free',
          session_id: 'ses_mock123',
          messages: [
            { role: 'user', content: 'First message' },
            { role: 'assistant', content: 'First reply' },
            { role: 'user', content: 'Second message' },
          ],
        }),
      });

      assert.strictEqual(res.status, 200);
      const json: any = await res.json();
      assert.strictEqual(json.session_id, 'ses_mock123');
      assert.strictEqual(res.headers.get('x-session-id'), 'ses_mock123');
    });

    it('POST /v1/chat/completions with x-session-id in header continues existing session', async () => {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': 'ses_mock123',
        },
        body: JSON.stringify({
          model: 'mimo-v2.5-free',
          messages: [{ role: 'user', content: 'Header session continuation' }],
        }),
      });

      assert.strictEqual(res.status, 200);
      const json: any = await res.json();
      assert.strictEqual(json.session_id, 'ses_mock123');
    });

    it('POST /v1/chat/completions (Streaming SSE)', async () => {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'quantum-v1-free',
          messages: [{ role: 'user', content: 'Stream please' }],
          stream: true,
        }),
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('content-type')?.includes('text/event-stream'));
      const text = await res.text();
      assert.ok(text.includes('data: '));
      assert.ok(text.includes('[DONE]'));
    });

    it('POST /v1/chat/completions returns 400 for empty messages array', async () => {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [] }),
      });
      assert.strictEqual(res.status, 400);
      const json: any = await res.json();
      assert.strictEqual(json.error.code, 400);
    });

    it('POST /v1/chat/completions returns 400 for invalid JSON body', async () => {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ malformed json: }',
      });
      assert.strictEqual(res.status, 400);
      const json: any = await res.json();
      assert.strictEqual(json.error.code, 400);
    });

    it('GET /v1/sessions returns session list from OpenCode', async () => {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/sessions`);
      assert.strictEqual(res.status, 200);
      const json: any = await res.json();
      assert.strictEqual(json.object, 'list');
      assert.ok(Array.isArray(json.data));
      assert.strictEqual(json.data[0].id, 'ses_mock123');
    });

    it('GET /v1/sessions/:id returns single session detail', async () => {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/sessions/ses_mock123`);
      assert.strictEqual(res.status, 200);
      const json: any = await res.json();
      assert.strictEqual(json.id, 'ses_mock123');
      assert.strictEqual(json.title, 'Test Mock Session');
    });

    it('DELETE /v1/sessions/:id deletes session', async () => {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/sessions/ses_mock123`, {
        method: 'DELETE',
      });
      assert.strictEqual(res.status, 200);
      const json: any = await res.json();
      assert.strictEqual(json.deleted, true);
      assert.strictEqual(json.id, 'ses_mock123');
    });

    it('DELETE /v1/sessions deletes all sessions', async () => {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/sessions`, {
        method: 'DELETE',
      });
      assert.strictEqual(res.status, 200);
      const json: any = await res.json();
      assert.strictEqual(json.deleted, true);
      assert.strictEqual(typeof json.count, 'number');
      assert.ok(json.count >= 1);
      assert.ok(Array.isArray(json.ids));
      assert.ok(json.ids.includes('ses_mock123'));
    });

    it('GET /openapi.json returns valid OpenAPI 3.0 specification', async () => {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/openapi.json`);
      assert.strictEqual(res.status, 200);
      const json: any = await res.json();
      assert.strictEqual(json.openapi, '3.0.3');
      assert.ok(json.paths['/v1/chat/completions']);
      assert.ok(json.paths['/v1/sessions']);
    });

    it('GET /docs, /swagger, and /v1 return HTML with Swagger UI', async () => {
      const resDocs = await fetch(`http://127.0.0.1:${proxyPort}/docs`);
      assert.strictEqual(resDocs.status, 200);
      const htmlDocs = await resDocs.text();
      assert.ok(htmlDocs.includes('SwaggerUIBundle'));
      assert.ok(htmlDocs.includes('ZenBridge'));

      const resSwagger = await fetch(`http://127.0.0.1:${proxyPort}/swagger`);
      assert.strictEqual(resSwagger.status, 200);
      const htmlSwagger = await resSwagger.text();
      assert.ok(htmlSwagger.includes('SwaggerUIBundle'));

      const resV1 = await fetch(`http://127.0.0.1:${proxyPort}/v1`);
      assert.strictEqual(resV1.status, 200);
      const htmlV1 = await resV1.text();
      assert.ok(htmlV1.includes('SwaggerUIBundle'));
    });

    it('GET /unknown-route returns 404', async () => {
      const res = await fetch(`http://127.0.0.1:${proxyPort}/unknown-route`);
      assert.strictEqual(res.status, 404);
      const json: any = await res.json();
      assert.strictEqual(json.error.code, 404);
    });
  });

  describe('Security: DISABLE_PUBLIC_UI Tests', () => {
    let secureServer: ProxyServer;
    const securePort = 8299;

    before(async () => {
      secureServer = new ProxyServer({
        port: securePort,
        host: '127.0.0.1',
        opencodeBaseUrl: `http://127.0.0.1:${mockOpenCodePort}`,
        disablePublicUi: true,
      });
      await secureServer.start();
    });

    after(async () => {
      await secureServer.stop();
    });

    it('GET / with Accept: text/html returns minimal ZenBridge text', async () => {
      const res = await fetch(`http://127.0.0.1:${securePort}/`, {
        headers: { Accept: 'text/html' },
      });
      assert.strictEqual(res.status, 200);
      const text = await res.text();
      assert.strictEqual(text, 'ZenBridge');
    });

    it('GET / with Accept: application/json returns minimal { service: "ZenBridge" }', async () => {
      const res = await fetch(`http://127.0.0.1:${securePort}/`, {
        headers: { Accept: 'application/json' },
      });
      assert.strictEqual(res.status, 200);
      const json: any = await res.json();
      assert.strictEqual(json.service, 'ZenBridge');
    });

    it('GET /docs returns clean 404', async () => {
      const res = await fetch(`http://127.0.0.1:${securePort}/docs`);
      assert.strictEqual(res.status, 404);
      const json: any = await res.json();
      assert.strictEqual(json.error.code, 404);
    });

    it('GET /openapi.json returns clean 404', async () => {
      const res = await fetch(`http://127.0.0.1:${securePort}/openapi.json`);
      assert.strictEqual(res.status, 404);
      const json: any = await res.json();
      assert.strictEqual(json.error.code, 404);
    });

    it('API endpoints (/v1/models) remain accessible when UI is disabled', async () => {
      const res = await fetch(`http://127.0.0.1:${securePort}/v1/models`);
      assert.strictEqual(res.status, 200);
      const json: any = await res.json();
      assert.strictEqual(json.object, 'list');
    });
  });

  describe('Directory & Workspace Context Forwarding Tests', () => {
    it('POST /v1/chat/completions with X-Directory header forwards ?directory= to OpenCode session & message', async () => {
      recordedRequests.length = 0;
      const targetDir = '/home/user/my-awesome-project';

      const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Directory': targetDir,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Explain this codebase' }],
        }),
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('x-directory'), targetDir);

      const sessionReq = recordedRequests.find((r) => r.method === 'POST' && r.pathname === '/session');
      assert.ok(sessionReq, 'OpenCode /session POST must be called');
      assert.strictEqual(sessionReq.searchParams.get('directory'), targetDir);

      const msgReq = recordedRequests.find((r) => r.method === 'POST' && r.pathname.includes('/message'));
      assert.ok(msgReq, 'OpenCode message POST must be called');
      assert.strictEqual(msgReq.searchParams.get('directory'), targetDir);
    });

    it('POST /v1/chat/completions with X-Opencode-Directory header forwards ?directory=', async () => {
      recordedRequests.length = 0;
      const targetDir = '/wsl/projects/app';

      const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Opencode-Directory': targetDir,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Check files' }],
        }),
      });

      assert.strictEqual(res.status, 200);
      const sessionReq = recordedRequests.find((r) => r.method === 'POST' && r.pathname === '/session');
      assert.ok(sessionReq);
      assert.strictEqual(sessionReq.searchParams.get('directory'), targetDir);
    });

    it('POST /v1/chat/completions with directory & workspace in body forwards both query parameters', async () => {
      recordedRequests.length = 0;
      const targetDir = '/home/dev/app';
      const targetWs = 'wrk_dev_123';

      const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directory: targetDir,
          workspace: targetWs,
          messages: [{ role: 'user', content: 'Run test' }],
        }),
      });

      assert.strictEqual(res.status, 200);
      const sessionReq = recordedRequests.find((r) => r.method === 'POST' && r.pathname === '/session');
      assert.ok(sessionReq);
      assert.strictEqual(sessionReq.searchParams.get('directory'), targetDir);
      assert.strictEqual(sessionReq.searchParams.get('workspace'), targetWs);
    });

    it('GET /v1/sessions forwards directory & workspace query parameters', async () => {
      recordedRequests.length = 0;
      const targetDir = '/home/dev/app';

      const res = await fetch(`http://127.0.0.1:${proxyPort}/v1/sessions?directory=${encodeURIComponent(targetDir)}`);
      assert.strictEqual(res.status, 200);

      const listReq = recordedRequests.find((r) => r.method === 'GET' && r.pathname === '/session');
      assert.ok(listReq);
      assert.strictEqual(listReq.searchParams.get('directory'), targetDir);
    });
  });
});
