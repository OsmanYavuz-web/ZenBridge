import type { ModelMetadata, ProxyConfig } from './types/index.ts';

// Auto-load .env file if present in Node 20+
try {
  if (typeof (process as any).loadEnvFile === 'function') {
    (process as any).loadEnvFile();
  }
} catch {
  // Ignore if .env is missing or invalid
}

export const DEFAULT_CONFIG: ProxyConfig = {
  port: parseInt(process.env.PORT || '8080', 10),
  host: process.env.HOST || '127.0.0.1',
  opencodeBaseUrl: process.env.OPENCODE_BASE_URL || 'http://127.0.0.1:4096',
  apiKey: process.env.API_KEY || '',
  defaultProviderId: 'opencode',
  defaultModel: process.env.DEFAULT_MODEL || 'auto',
  disablePublicUi: process.env.DISABLE_PUBLIC_UI === 'true',
};

export function getFallbackModelInfo(modelId: string = 'auto'): ModelMetadata {
  return {
    id: modelId,
    name: modelId,
    provider: 'OpenCode',
    providerID: DEFAULT_CONFIG.defaultProviderId,
    cost: 0,
    context_window: 64000,
  };
}
