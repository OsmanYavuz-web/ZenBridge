import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { ProxyConfig, ChatCompletionRequest } from './types/index.ts';
import { DEFAULT_CONFIG } from './config.ts';
import { Router } from './core/router.ts';
import { OpenCodeService } from './services/opencode.service.ts';
import { ModelService } from './services/model.service.ts';
import { ChatService } from './services/chat.service.ts';
import { OPENAPI_SPEC, getSwaggerHtml } from './docs.ts';
import { getDashboardHtml } from './dashboard.ts';

export class ProxyServer {
  private readonly config: ProxyConfig;
  private readonly router: Router;
  private readonly openCodeService: OpenCodeService;
  private readonly modelService: ModelService;
  private readonly chatService: ChatService;
  private readonly startTime = Date.now();
  private server?: Server;

  constructor(options: Partial<ProxyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.openCodeService = new OpenCodeService(this.config.opencodeBaseUrl);
    this.modelService = new ModelService(this.openCodeService);
    this.chatService = new ChatService(
      this.openCodeService,
      this.modelService,
      this.config.defaultModel
    );
    this.router = new Router();

    this.setupMiddlewares();
    this.setupRoutes();
  }

  private setupMiddlewares(): void {
    // 1. CORS Middleware
    this.router.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, x-api-key, x-session-id, x-directory, x-opencode-directory, x-workspace, x-opencode-workspace, x-auto-approve, x-opencode-auto-approve, x-permission'
      );
      res.setHeader(
        'Access-Control-Expose-Headers',
        'x-session-id, x-directory, x-opencode-directory, x-auto-approve'
      );

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      return next();
    });

    // 2. Authentication Middleware (if apiKey configured)
    this.router.use((req, res, next) => {
      if (!this.config.apiKey) return next();

      const authHeader = req.headers['authorization'] || '';
      const apiKeyHeader = req.headers['x-api-key'] || '';
      const bearerToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : String(authHeader).trim();
      const providedKey = bearerToken || apiKeyHeader;

      if (providedKey !== this.config.apiKey) {
        Router.sendJson(res, 401, {
          error: {
            message: 'Invalid or missing API key.',
            type: 'invalid_request_error',
            code: 'invalid_api_key',
          },
        });
        return;
      }

      return next();
    });

    // 3. Body Parsing Middleware (for POST/DELETE requests)
    this.router.use(async (req, res, next) => {
      if (req.method === 'POST') {
        req.body = await Router.parseBody(req);
      }
      return next();
    });
  }

  private setupRoutes(): void {
    // Health & System Info
    const getSystemStatus = async () => {
      const health = await this.openCodeService.checkHealth();
      const models = await this.modelService.getModels();
      const host = this.config.host === '0.0.0.0' ? '127.0.0.1' : this.config.host;
      const baseUrl = `http://${host}:${this.config.port}`;
      const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);

      return {
        health,
        models,
        uptimeSeconds,
        baseUrl,
        json: {
          status: 'ok',
          service: 'ZenBridge',
          version: '1.0.0',
          opencode_connected: health.ok,
          opencode_url: this.config.opencodeBaseUrl,
          openai_base_url: `${baseUrl}/v1`,
          docs_url: `${baseUrl}/docs`,
          default_model: this.config.defaultModel,
          available_models_count: models.length,
          uptime_seconds: uptimeSeconds,
          endpoints: [
            'GET /v1/models',
            'POST /v1/chat/completions',
            'GET /v1/sessions',
            'DELETE /v1/sessions',
            'GET /v1/sessions/:id',
            'DELETE /v1/sessions/:id',
            'GET /health',
            'GET /docs',
            'GET /openapi.json',
          ],
        },
      };
    };

    // Root landing (HTML Dashboard for browsers, JSON for curl/api)
    this.router.get('/', async (req: any, res: any) => {
      const accept = req.headers?.accept || '';

      if (this.config.disablePublicUi) {
        if (accept.includes('text/html')) {
          Router.sendHtml(res, 200, 'ZenBridge');
        } else {
          Router.sendJson(res, 200, { service: 'ZenBridge' });
        }
        return;
      }

      const { health, models, uptimeSeconds, json } = await getSystemStatus();

      if (accept.includes('text/html')) {
        const html = getDashboardHtml({
          service: 'ZenBridge',
          version: '1.0.0',
          status: 'ok',
          opencodeUrl: this.config.opencodeBaseUrl,
          opencodeConnected: health.ok,
          availableModelsCount: models.length,
          defaultModel: this.config.defaultModel,
          port: this.config.port,
          host: this.config.host,
          uptimeSeconds,
          models,
        });
        Router.sendHtml(res, 200, html);
      } else {
        Router.sendJson(res, 200, json);
      }
    });

    this.router.get('/health', async (_req: any, res: any) => {
      const { json } = await getSystemStatus();
      Router.sendJson(res, 200, json);
    });

    // Swagger & OpenAPI Docs (only registered when disablePublicUi is false)
    if (!this.config.disablePublicUi) {
      this.router.get('/openapi.json', (_req: any, res: any) => {
        Router.sendJson(res, 200, OPENAPI_SPEC);
      });

      const handleDocs = (_req: any, res: any) => {
        Router.sendHtml(res, 200, getSwaggerHtml());
      };
      this.router.get('/docs', handleDocs);
      this.router.get('/swagger', handleDocs);
      this.router.get('/v1', handleDocs);
      this.router.get('/v1/docs', handleDocs);
    }

    // Helper to extract query parameters from URLSearchParams or object
    const getParam = (req: any, param: string): string | undefined => {
      if (!req.query) return undefined;
      if (typeof req.query.get === 'function') {
        const val = req.query.get(param);
        return val ? String(val).trim() : undefined;
      }
      const val = req.query[param];
      return val ? String(val).trim() : undefined;
    };

    const getDirectory = (req: any): string | undefined => {
      const val = req.headers['x-directory'] || req.headers['x-opencode-directory'] || getParam(req, 'directory');
      return val ? String(val).trim() : undefined;
    };

    const getWorkspace = (req: any): string | undefined => {
      const val = req.headers['x-workspace'] || req.headers['x-opencode-workspace'] || getParam(req, 'workspace');
      return val ? String(val).trim() : undefined;
    };

    // List Models (OpenAI Format with Health & Quota info)
    const handleModels = async (_req: any, res: any) => {
      const models = await this.modelService.getModels();
      const modelsData = models.map((m) => ({
        id: m.id,
        object: 'model',
        created: 1710000000,
        owned_by: m.provider,
        permission: [],
        root: m.id,
        parent: null,
        context_window: m.context_window || 64000,
        status: m.health?.status || 'healthy',
        healthy: m.health?.healthy !== false,
        latency_ms: m.health?.latency_ms,
        last_checked: m.health?.last_checked,
      }));

      Router.sendJson(res, 200, {
        object: 'list',
        data: modelsData,
      });
    };

    this.router.get('/v1/models', handleModels);
    this.router.get('/models', handleModels);

    // Session Management Endpoints
    this.router.get('/v1/sessions', async (req: any, res: any) => {
      const directory = getDirectory(req);
      const workspace = getWorkspace(req);
      const sessions = await this.openCodeService.listSessions(directory, workspace);
      Router.sendJson(res, 200, {
        object: 'list',
        data: sessions,
      });
    });

    const handleDeleteAllSessions = async (req: any, res: any) => {
      const directory = getDirectory(req);
      const workspace = getWorkspace(req);
      const result = await this.openCodeService.deleteAllSessions(directory, workspace);
      Router.sendJson(res, 200, result);
    };
    this.router.delete('/v1/sessions', handleDeleteAllSessions);
    this.router.delete('/sessions', handleDeleteAllSessions);

    this.router.get('/v1/sessions/:id', async (req: any, res: any) => {
      const sessionId = req.params?.id;
      if (!sessionId) {
        Router.sendJson(res, 400, {
          error: { message: 'Session ID is required', type: 'invalid_request_error', code: 400 },
        });
        return;
      }

      const directory = getDirectory(req);
      const workspace = getWorkspace(req);
      const session = await this.openCodeService.getSession(sessionId, directory, workspace);
      if (!session) {
        Router.sendJson(res, 404, {
          error: { message: `Session '${sessionId}' not found`, type: 'invalid_request_error', code: 404 },
        });
        return;
      }

      Router.sendJson(res, 200, session);
    });

    this.router.delete('/v1/sessions/:id', async (req: any, res: any) => {
      const sessionId = req.params?.id;
      if (!sessionId) {
        Router.sendJson(res, 400, {
          error: { message: 'Session ID is required', type: 'invalid_request_error', code: 400 },
        });
        return;
      }

      const directory = getDirectory(req);
      const workspace = getWorkspace(req);
      const success = await this.openCodeService.deleteSession(sessionId, directory, workspace);
      Router.sendJson(res, 200, {
        deleted: success,
        id: sessionId,
      });
    });

    // Chat Completions (OpenAI Format)
    const handleCompletions = async (req: any, res: any) => {
      const body = (req.body || {}) as ChatCompletionRequest;
      const { messages, stream = false } = body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        Router.sendJson(res, 400, {
          error: {
            message: 'Invalid request: "messages" array is required and must not be empty.',
            type: 'invalid_request_error',
            param: 'messages',
            code: 400,
          },
        });
        return;
      }

      // Check header fallback for session_id if omitted in body
      if (!body.session_id && req.headers['x-session-id']) {
        body.session_id = String(req.headers['x-session-id']).trim();
      }

      // Check header/query fallback for directory if omitted in body
      if (!body.directory) {
        const dir = getDirectory(req);
        if (dir) {
          body.directory = dir;
        }
      }

      // Check header/query fallback for workspace if omitted in body
      if (!body.workspace) {
        const ws = getWorkspace(req);
        if (ws) {
          body.workspace = ws;
        }
      }

      // Check header fallback for auto_approve if omitted in body
      if (body.auto_approve === undefined && body.auto_approve_permissions === undefined && body.allow_all_permissions === undefined) {
        const autoApproveHeader = req.headers['x-auto-approve'] || req.headers['x-opencode-auto-approve'];
        if (autoApproveHeader === 'true' || autoApproveHeader === '1' || autoApproveHeader === true) {
          body.auto_approve = true;
        }
      }

      if (stream) {
        const streamGenerator = this.chatService.streamChat(body);
        await Router.streamSSE(res, streamGenerator);
      } else {
        const result = await this.chatService.completeChat(body);
        if (result.session_id) {
          res.setHeader('x-session-id', result.session_id);
        }
        if (body.directory) {
          res.setHeader('x-directory', body.directory);
        }
        Router.sendJson(res, 200, result);
      }
    };

    this.router.post('/v1/chat/completions', handleCompletions);
    this.router.post('/chat/completions', handleCompletions);
  }

  async start(port = this.config.port, host = this.config.host): Promise<any> {
    this.server = createServer((req: IncomingMessage, res: ServerResponse) => this.router.handle(req, res));

    return new Promise((resolve, reject) => {
      this.server!.listen(port, host, () => {
        if (this.config.disablePublicUi) {
          console.log(`🚀 ZenBridge: http://${host}:${port} (Upstream: ${this.config.opencodeBaseUrl})`);
        } else {
          console.log(`\n======================================================`);
          console.log(`🚀 ZenBridge`);
          console.log(`🌐 Server URL:         http://${host}:${port}`);
          console.log(`📡 OpenCode Upstream:  ${this.config.opencodeBaseUrl}`);
          console.log(`🔗 OpenAI Endpoint:    http://${host}:${port}/v1`);
          console.log(`📖 Swagger UI Docs:    http://${host}:${port}/docs`);
          console.log(`======================================================\n`);
        }
        resolve(this.server!.address());
      });
      this.server!.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

export function createProxyServer(options: Partial<ProxyConfig> = {}) {
  const proxy = new ProxyServer(options);
  return {
    start: (port?: number, host?: string) => proxy.start(port, host),
    stop: () => proxy.stop(),
  };
}

// Direct CLI start if invoked as script
if (process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'))) {
  const app = new ProxyServer();
  app.start();
}
