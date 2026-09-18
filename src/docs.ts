/**
 * OpenAPI 3.0 Specification & Swagger UI HTML Generator
 */

export const OPENAPI_SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'ZenBridge API',
    version: '1.0.0',
    description:
      'Universal OpenAI-compatible API Gateway for OpenCode free models. Enables integration with Cursor, Continue, LibreChat, Open WebUI, and standard OpenAI SDKs.',
    contact: {
      name: 'Osman Yavuz',
      url: 'https://github.com/OsmanYavuz-web',
      email: 'omnyvz.yazilim@gmail.com',
    },
  },
  servers: [
    {
      url: '/',
      description: 'Current ZenBridge Server',
    },
  ],
  tags: [
    { name: 'Models', description: 'Available AI model discovery endpoints' },
    { name: 'Chat', description: 'OpenAI-compatible Chat Completion endpoints' },
    { name: 'Sessions', description: 'Stateful conversation session management' },
    { name: 'System', description: 'Server health and information' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Check server health and OpenCode upstream connection',
        responses: {
          '200': {
            description: 'Server status and metadata',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    service: { type: 'string', example: 'ZenBridge' },
                    opencode_connected: { type: 'boolean', example: true },
                    available_models_count: { type: 'integer', example: 8 },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/v1/models': {
      get: {
        tags: ['Models'],
        summary: 'List available OpenAI-compatible models (auto-discovered)',
        responses: {
          '200': {
            description: 'List of models',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    object: { type: 'string', example: 'list' },
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', example: 'model-id' },
                          object: { type: 'string', example: 'model' },
                          owned_by: { type: 'string', example: 'opencode' },
                          context_window: { type: 'integer', example: 128000 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/v1/chat/completions': {
      post: {
        tags: ['Chat'],
        summary: 'Create chat completions (Streaming & Non-Streaming)',
        description: 'Send messages to OpenCode free models. Supports `session_id` to continue multi-turn conversations.',
        parameters: [
          {
            name: 'x-session-id',
            in: 'header',
            required: false,
            description: 'Optional OpenCode session ID to continue an existing conversation',
            schema: { type: 'string' },
          },
          {
            name: 'x-directory',
            in: 'header',
            required: false,
            description: 'Target project working directory for OpenCode session & file context',
            schema: { type: 'string', example: '/home/user/my-project' },
          },
          {
            name: 'x-opencode-directory',
            in: 'header',
            required: false,
            description: 'Alternative header for target project directory in OpenCode',
            schema: { type: 'string', example: '/home/user/my-project' },
          },
          {
            name: 'directory',
            in: 'query',
            required: false,
            description: 'Target project working directory as query parameter',
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['messages'],
                example: {
                  model: 'auto',
                  directory: '/home/user/my-project',
                  messages: [
                    {
                      role: 'user',
                      content: 'Hello, how are you today?',
                    },
                  ],
                  stream: false,
                },
                properties: {
                  model: {
                    type: 'string',
                    example: 'auto',
                    description: 'Target model ID (e.g. auto, random, or any model ID from /v1/models)',
                  },
                  session_id: {
                    type: 'string',
                    example: 'ses_123abc456',
                    description: 'Optional session ID to continue a previous conversation',
                  },
                  directory: {
                    type: 'string',
                    example: '/home/user/my-project',
                    description: 'Target project working directory for OpenCode execution context',
                  },
                  workspace: {
                    type: 'string',
                    example: 'wrk_default',
                    description: 'Optional OpenCode workspace identifier',
                  },
                  stream: {
                    type: 'boolean',
                    example: false,
                    description: 'If true, stream responses via Server-Sent Events (SSE)',
                  },
                  include_reasoning: {
                    type: 'boolean',
                    example: false,
                    description: 'If true, include internal chain-of-thought in reasoning_content field',
                  },
                  reasoning_effort: {
                    type: 'string',
                    enum: ['low', 'medium', 'high'],
                    description: 'Depth / effort level of model reasoning process',
                  },
                  messages: {
                    type: 'array',
                    description: 'List of conversation messages with role (system, user, assistant) and content',
                    items: {
                      type: 'object',
                      required: ['role', 'content'],
                      properties: {
                        role: { type: 'string', enum: ['system', 'user', 'assistant'] },
                        content: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Successful completion response (or SSE stream if stream: true)',
            headers: {
              'x-session-id': {
                schema: { type: 'string' },
                description: 'OpenCode Session ID used/created for this conversation',
              },
            },
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', example: 'chatcmpl-123' },
                    session_id: { type: 'string', example: 'ses_123abc456' },
                    object: { type: 'string', example: 'chat.completion' },
                    model: { type: 'string', example: 'auto' },
                    choices: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          message: {
                            type: 'object',
                            properties: {
                              role: { type: 'string', example: 'assistant' },
                              content: { type: 'string', example: 'Hello! I am ready to assist you.' },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/v1/sessions': {
      get: {
        tags: ['Sessions'],
        summary: 'List all past conversation sessions',
        responses: {
          '200': {
            description: 'List of open sessions from OpenCode',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    object: { type: 'string', example: 'list' },
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', example: 'ses_123abc456' },
                          title: { type: 'string', example: 'User prompt title' },
                          createdAt: { type: 'string' },
                          updatedAt: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      delete: {
        tags: ['Sessions'],
        summary: 'Delete all conversation sessions',
        responses: {
          '200': {
            description: 'All sessions successfully deleted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    deleted: { type: 'boolean', example: true },
                    count: { type: 'integer', example: 3 },
                    total: { type: 'integer', example: 3 },
                    ids: {
                      type: 'array',
                      items: { type: 'string', example: 'ses_123abc456' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/v1/sessions/{id}': {
      get: {
        tags: ['Sessions'],
        summary: 'Get session details & message history by Session ID',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Session ID',
            schema: { type: 'string', example: 'ses_123abc456' },
          },
        ],
        responses: {
          '200': {
            description: 'Session details',
          },
          '404': {
            description: 'Session not found',
          },
        },
      },
      delete: {
        tags: ['Sessions'],
        summary: 'Delete / close a conversation session by ID',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Session ID to delete',
            schema: { type: 'string', example: 'ses_123abc456' },
          },
        ],
        responses: {
          '200': {
            description: 'Session successfully deleted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    deleted: { type: 'boolean', example: true },
                    id: { type: 'string', example: 'ses_123abc456' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

/**
 * Returns HTML string with embedded Swagger UI
 */
export function getSwaggerHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ZenBridge - Swagger API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #0d1117;
      --bg-secondary: #161b22;
      --border-color: #30363d;
      --text-main: #c9d1d9;
      --accent-color: #58a6ff;
    }
    body {
      margin: 0;
      padding: 0;
      background-color: var(--bg-primary);
      color: var(--text-main);
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .custom-header {
      background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
      padding: 1.25rem 2rem;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    }
    .brand-title {
      font-size: 1.35rem;
      font-weight: 700;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .badge {
      background: #238636;
      color: #fff;
      font-size: 0.75rem;
      padding: 0.2rem 0.6rem;
      border-radius: 9999px;
      font-weight: 600;
    }
    .nav-links a {
      color: var(--accent-color);
      text-decoration: none;
      font-size: 0.9rem;
      margin-left: 1.5rem;
      font-weight: 500;
      transition: color 0.2s;
    }
    .nav-links a:hover {
      color: #79c0ff;
      text-decoration: underline;
    }
    #swagger-ui {
      max-width: 1200px;
      margin: 1.5rem auto;
      padding: 0 1rem 3rem 1rem;
    }
    /* Swagger Dark Mode Overrides */
    .swagger-ui .topbar { display: none !important; }
    .swagger-ui .info .title { color: #58a6ff !important; font-family: 'Outfit', sans-serif !important; }
    .swagger-ui .info p, .swagger-ui .info li { color: #8b949e !important; }
    .swagger-ui .scheme-container { background: var(--bg-secondary) !important; border: 1px solid var(--border-color); border-radius: 8px; }
    .swagger-ui .opblock { border-radius: 8px !important; margin-bottom: 1rem !important; border: 1px solid var(--border-color) !important; }
    .swagger-ui .opblock-summary { border-radius: 8px !important; }
    .swagger-ui .opblock .opblock-summary-operation-id, .swagger-ui .opblock .opblock-summary-path, .swagger-ui .opblock .opblock-summary-description {
      color: #e6edf3 !important;
      font-family: 'JetBrains Mono', monospace !important;
    }
  </style>
</head>
<body>
  <header class="custom-header">
    <div class="brand-title">
      <span>🌐 ZenBridge</span>
      <span class="badge">OpenAI v1</span>
    </div>
    <nav class="nav-links">
      <a href="/openapi.json" target="_blank">📄 OpenAPI JSON</a>
      <a href="/health" target="_blank">🩺 Health Check</a>
      <a href="/v1/models" target="_blank">🤖 Models List</a>
      <a href="/v1/sessions" target="_blank">💬 Sessions</a>
    </nav>
  </header>

  <div id="swagger-ui"></div>

  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout",
        defaultModelsExpandDepth: -1,
        docExpansion: "list"
      });
    };
  </script>
</body>
</html>`;
}
