/**
 * Core Type Definitions for OpenAI & OpenCode
 */

declare global {
  // eslint-disable-next-line no-var
  var process: any;
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | string;
  content: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
  name?: string;
}

export interface PermissionRule {
  permission: string;
  pattern: string;
  action: 'allow' | 'deny' | 'ask';
}

export interface ChatCompletionRequest {
  model?: string;
  messages: OpenAIMessage[];
  stream?: boolean;
  include_reasoning?: boolean;
  show_reasoning?: boolean;
  reasoning?: boolean;
  reasoning_effort?: 'low' | 'medium' | 'high' | string;
  variant?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  session_id?: string;
  directory?: string;
  workspace?: string;
  agent?: string;
  auto_approve?: boolean;
  auto_approve_permissions?: boolean;
  allow_all_permissions?: boolean;
  permission?: PermissionRule[];
}

export interface ChatCompletionChoice {
  index: number;
  message: {
    role: string;
    content: string;
    reasoning_content?: string;
  };
  logprobs: null;
  finish_reason: 'stop' | 'length' | 'content_filter' | null;
}

export interface ChatCompletionResponse {
  id: string;
  session_id?: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatCompletionChunkChoice {
  index: number;
  delta: {
    role?: string;
    content?: string;
    reasoning_content?: string;
  };
  logprobs: null;
  finish_reason: 'stop' | 'length' | null;
}

export interface ChatCompletionChunk {
  id: string;
  session_id?: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
}

export interface ModelMetadata {
  id: string;
  name: string;
  provider: string;
  providerID: string;
  cost?: number;
  context_window?: number;
  capabilities?: Record<string, unknown>;
}

export interface OpenCodeProviderResponse {
  providers?: Array<{
    id?: string;
    name?: string;
    models?: Record<string, {
      id?: string;
      name?: string;
      providerID?: string;
      cost?: number;
      limit?: { context?: number };
      context_window?: number;
      capabilities?: Record<string, unknown>;
    }>;
  }>;
}

export interface ProxyConfig {
  port: number;
  host: string;
  opencodeBaseUrl: string;
  apiKey: string;
  defaultProviderId: string;
  defaultModel: string;
  disablePublicUi?: boolean;
}
