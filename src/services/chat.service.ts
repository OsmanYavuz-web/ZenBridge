import { randomUUID } from 'node:crypto';
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ModelMetadata,
  PermissionRule,
} from '../types/index.ts';
import { OpenCodeService } from './opencode.service.ts';
import { ModelService } from './model.service.ts';
import { OpenAITransformer } from '../transformers/openai.transformer.ts';

export class ChatService {
  private readonly openCodeService: OpenCodeService;
  private readonly modelService: ModelService;
  private readonly defaultModel: string;

  constructor(
    openCodeService: OpenCodeService,
    modelService: ModelService,
    defaultModel: string = 'auto'
  ) {
    this.openCodeService = openCodeService;
    this.modelService = modelService;
    this.defaultModel = defaultModel;
  }

  /**
   * Non-streaming chat completion
   */
  async completeChat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const targetModel = request.model?.trim() || this.defaultModel;
    const modelInfo = await this.modelService.resolveModel(targetModel);
    const isExistingSession = Boolean(request.session_id && request.session_id.trim());
    const includeReasoning = Boolean(request.include_reasoning || request.show_reasoning || request.reasoning);
    const variant = request.variant || request.reasoning_effort;

    const { parts, systemPrompt, promptText } = isExistingSession
      ? OpenAITransformer.formatLatestMessage(request.messages)
      : OpenAITransformer.formatMessagesToPrompt(request.messages);

    const directory = request.directory?.trim();
    const workspace = request.workspace?.trim();
    const permissions = this.resolvePermissions(request);

    const sessionId = isExistingSession
      ? request.session_id!.trim()
      : await this.openCodeService.createSession(
          this.deriveSessionTitle(request.messages),
          request.agent?.trim(),
          directory,
          workspace,
          permissions
        );

    const response = await this.openCodeService.sendMessage(
      sessionId,
      modelInfo.id,
      parts,
      modelInfo,
      systemPrompt,
      variant,
      directory,
      workspace,
      request.agent?.trim()
    );

    const rawJson = await response.json();
    const { content, reasoningContent } = OpenAITransformer.extractResponsePayload(rawJson);

    return OpenAITransformer.createCompletionResponse(
      content,
      modelInfo.id,
      sessionId,
      includeReasoning ? reasoningContent : undefined,
      undefined,
      promptText
    );
  }

  /**
   * Streaming chat completion using async generator
   */
  async *streamChat(request: ChatCompletionRequest): AsyncGenerator<string, void, unknown> {
    const targetModel = request.model?.trim() || this.defaultModel;
    const modelInfo = await this.modelService.resolveModel(targetModel);
    const isExistingSession = Boolean(request.session_id && request.session_id.trim());
    const includeReasoning = Boolean(request.include_reasoning || request.show_reasoning || request.reasoning);
    const variant = request.variant || request.reasoning_effort;
    const directory = request.directory?.trim();
    const workspace = request.workspace?.trim();
    const permissions = this.resolvePermissions(request);

    const { parts, systemPrompt } = isExistingSession
      ? OpenAITransformer.formatLatestMessage(request.messages)
      : OpenAITransformer.formatMessagesToPrompt(request.messages);

    const completionId = `chatcmpl-${randomUUID()}`;
    const sessionId = isExistingSession
      ? request.session_id!.trim()
      : await this.openCodeService.createSession(
          this.deriveSessionTitle(request.messages),
          request.agent?.trim(),
          directory,
          workspace,
          permissions
        );

    // Yield initial role chunk immediately per OpenAI streaming specification
    yield OpenAITransformer.formatStreamChunk('', modelInfo.id, completionId, null, sessionId, undefined, 'assistant');

    const response = await this.openCodeService.sendMessage(
      sessionId,
      modelInfo.id,
      parts,
      modelInfo,
      systemPrompt,
      variant,
      directory,
      workspace,
      request.agent?.trim()
    );

    const contentType = response.headers?.get('content-type') || '';
    const isSSE = contentType.includes('text/event-stream');

    if (isSSE && response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let lineBuffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = (lineBuffer + chunk).split('\n');
          lineBuffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith('data:')) {
              const dataStr = trimmed.replace(/^data:\s*/, '');
              if (dataStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(dataStr);
                const { content: deltaContent, reasoningContent: deltaReasoning } =
                  OpenAITransformer.extractResponsePayload(parsed);

                if (includeReasoning && deltaReasoning) {
                  yield OpenAITransformer.formatStreamChunk('', modelInfo.id, completionId, null, sessionId, deltaReasoning);
                }
                if (deltaContent) {
                  yield OpenAITransformer.formatStreamChunk(deltaContent, modelInfo.id, completionId, null, sessionId);
                }
              } catch {
                yield OpenAITransformer.formatStreamChunk(dataStr, modelInfo.id, completionId, null, sessionId);
              }
            }
          }
        }

        const remaining = lineBuffer.trim();
        if (remaining.startsWith('data:')) {
          const dataStr = remaining.replace(/^data:\s*/, '');
          if (dataStr && dataStr !== '[DONE]') {
            try {
              const parsed = JSON.parse(dataStr);
              const { content: deltaContent, reasoningContent: deltaReasoning } =
                OpenAITransformer.extractResponsePayload(parsed);
              if (includeReasoning && deltaReasoning) {
                yield OpenAITransformer.formatStreamChunk('', modelInfo.id, completionId, null, sessionId, deltaReasoning);
              }
              if (deltaContent) {
                yield OpenAITransformer.formatStreamChunk(deltaContent, modelInfo.id, completionId, null, sessionId);
              }
            } catch { /* ignore malformed tail */ }
          }
        }
      } catch {
        // Reader threw
      }
    } else {
      let rawJson: any;
      try {
        rawJson = await response.json();
      } catch {
        const text = await response.text();
        try {
          rawJson = JSON.parse(text);
        } catch {
          rawJson = { parts: [{ type: 'text', text }] };
        }
      }

      const { content: fullText, reasoningContent } = OpenAITransformer.extractResponsePayload(rawJson);

      if (includeReasoning && reasoningContent) {
        yield OpenAITransformer.formatStreamChunk('', modelInfo.id, completionId, null, sessionId, reasoningContent);
      }

      // Stream text in small chunks (simulated typewriter stream for streaming clients)
      const chunkSize = 16;
      for (let i = 0; i < fullText.length; i += chunkSize) {
        const chunk = fullText.slice(i, i + chunkSize);
        yield OpenAITransformer.formatStreamChunk(chunk, modelInfo.id, completionId, null, sessionId);
      }
    }

    yield OpenAITransformer.formatStreamChunk('', modelInfo.id, completionId, 'stop', sessionId);
    yield 'data: [DONE]\n\n';
  }

  private resolvePermissions(request: ChatCompletionRequest): PermissionRule[] | undefined {
    if (request.permission && Array.isArray(request.permission) && request.permission.length > 0) {
      return request.permission;
    }
    if (request.auto_approve || request.auto_approve_permissions || request.allow_all_permissions) {
      return [
        {
          permission: '*',
          pattern: '*',
          action: 'allow',
        },
      ];
    }
    return undefined;
  }

  private deriveSessionTitle(messages: ChatCompletionRequest['messages']): string {
    const firstUser = messages?.find((m) => m.role === 'user');
    if (!firstUser) return 'chat';
    if (typeof firstUser.content === 'string') return firstUser.content.slice(0, 50);
    return 'chat';
  }
}
