import type { IncomingMessage, ServerResponse } from 'node:http';

export type RouteHandler = (
  req: IncomingMessage & { body?: any; query?: URLSearchParams; params?: Record<string, string> },
  res: ServerResponse
) => Promise<void> | void;

export type Middleware = (
  req: IncomingMessage & { body?: any; query?: URLSearchParams; params?: Record<string, string> },
  res: ServerResponse,
  next: () => Promise<void>
) => Promise<void> | void;

interface Route {
  method: string;
  path: string;
  handler: RouteHandler;
}

export class Router {
  private routes: Route[] = [];
  private middlewares: Middleware[] = [];

  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  get(path: string, handler: RouteHandler): this {
    this.routes.push({ method: 'GET', path, handler });
    return this;
  }

  post(path: string, handler: RouteHandler): this {
    this.routes.push({ method: 'POST', path, handler });
    return this;
  }

  delete(path: string, handler: RouteHandler): this {
    this.routes.push({ method: 'DELETE', path, handler });
    return this;
  }

  options(path: string, handler: RouteHandler): this {
    this.routes.push({ method: 'OPTIONS', path, handler });
    return this;
  }

  async handle(
    req: IncomingMessage & { body?: any; query?: URLSearchParams; params?: Record<string, string> },
    res: ServerResponse
  ): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = url.pathname;
    req.query = url.searchParams;
    req.params = {};

    let middlewareIndex = 0;

    const next = async (): Promise<void> => {
      if (middlewareIndex < this.middlewares.length) {
        const current = this.middlewares[middlewareIndex++];
        await current(req, res, next);
      } else {
        await this.dispatch(req, res, pathname);
      }
    };

    try {
      await next();
    } catch (err: any) {
      const statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
      if (!res.headersSent) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      }
      res.end(
        JSON.stringify({
          error: {
            message: err.message || 'Internal server error occurred.',
            type: statusCode >= 500 ? 'api_error' : 'invalid_request_error',
            code: statusCode,
          },
        })
      );
    }
  }

  private async dispatch(
    req: IncomingMessage & { body?: any; params?: Record<string, string> },
    res: ServerResponse,
    pathname: string
  ): Promise<void> {
    const method = req.method?.toUpperCase();

    for (const route of this.routes) {
      if (route.method !== method) continue;

      if (route.path === '*' || route.path === pathname) {
        req.params = {};
        await route.handler(req, res);
        return;
      }

      // Check parameterized route (e.g. /v1/sessions/:id)
      if (route.path.includes(':')) {
        const routeSegments = route.path.split('/').filter(Boolean);
        const pathSegments = pathname.split('/').filter(Boolean);

        if (routeSegments.length === pathSegments.length) {
          const params: Record<string, string> = {};
          let match = true;

          for (let i = 0; i < routeSegments.length; i++) {
            if (routeSegments[i].startsWith(':')) {
              const paramName = routeSegments[i].slice(1);
              params[paramName] = decodeURIComponent(pathSegments[i]);
            } else if (routeSegments[i] !== pathSegments[i]) {
              match = false;
              break;
            }
          }

          if (match) {
            req.params = params;
            await route.handler(req, res);
            return;
          }
        }
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: {
          message: 'Not Found',
          type: 'invalid_request_error',
          code: 404,
        },
      })
    );
  }

  /**
   * Helper to parse incoming JSON body safely
   */
  static async parseBody(req: IncomingMessage, limitBytes = 10 * 1024 * 1024): Promise<any> {
    return new Promise((resolve, reject) => {
      let raw = '';
      let bytes = 0;

      req.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > limitBytes) {
          const err = new Error('Payload too large (exceeds 10MB limit)') as any;
          err.statusCode = 413;
          reject(err);
          return;
        }
        raw += chunk;
      });

      req.on('end', () => {
        if (!raw.trim()) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (err: any) {
          const parseErr = new Error(`Invalid JSON body: ${err.message}`) as any;
          parseErr.statusCode = 400;
          reject(parseErr);
        }
      });

      req.on('error', reject);
    });
  }

  /**
   * Helper to send JSON responses
   */
  static sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * Helper to stream Server-Sent Events (SSE) from an async generator
   */
  static async streamSSE(res: ServerResponse, generator: AsyncGenerator<string, void, unknown>): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let isAborted = false;
    res.on('close', () => {
      isAborted = true;
    });

    for await (const chunk of generator) {
      if (isAborted || res.writableEnded) {
        break;
      }
      res.write(chunk);
    }

    if (!res.writableEnded) {
      res.end();
    }
  }

  /**
   * Helper to send HTML responses
   */
  static sendHtml(res: ServerResponse, statusCode: number, html: string): void {
    res.writeHead(statusCode, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(html);
  }
}
