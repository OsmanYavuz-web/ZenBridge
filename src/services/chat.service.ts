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
  /**
   * Complete chat request (Non-Streaming) with smart health tracking and auto-failover
   */
  async completeChat(request: ChatCompletionRequest, retryAttempt = 0): Promise<ChatCompletionResponse> {
    const targetModel = request.model?.trim() || this.defaultModel;
    const modelInfo = await this.modelService.resolveModel(targetModel);
    const isExistingSession = Boolean(request.session_id && request.session_id.trim());
    const includeReasoning = Boolean(request.include_reasoning || request.show_reasoning || request.reasoning);
    const variant = request.variant || request.reasoning_effort;
    const isAuto = !request.model || request.model.trim().toLowerCase() === 'auto' || request.model.trim().toLowerCase() === 'random';

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

    const startTime = Date.now();
    let response: Response;
    try {
      response = await this.openCodeService.sendMessage(
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
    } catch (err: any) {
      this.modelService.recordFailure(modelInfo.id, err.message);
      if (isAuto && retryAttempt < 2) {
        return this.completeChat(request, retryAttempt + 1);
      }
      throw err;
    }

    let rawJson: any;
    try {
      rawJson = await response.json();
    } catch (parseErr: any) {
      this.modelService.recordFailure(modelInfo.id, 'Failed to parse JSON response from upstream');
      if (isAuto && retryAttempt < 2) {
        return this.completeChat(request, retryAttempt + 1);
      }
      throw new Error(`Invalid JSON response from upstream: ${parseErr.message}`);
    }

    if (rawJson?.error || rawJson?.type === 'error') {
      const errMsg = rawJson?.error?.message || rawJson?.message || JSON.stringify(rawJson.error || rawJson);
      this.modelService.recordFailure(modelInfo.id, errMsg);
      if (isAuto && retryAttempt < 2) {
        return this.completeChat(request, retryAttempt + 1);
      }
      throw new Error(`Model '${modelInfo.id}' error: ${errMsg}`);
    }

    const { content, reasoningContent } = OpenAITransformer.extractResponsePayload(rawJson);

    if (!content && !reasoningContent) {
      this.modelService.recordFailure(modelInfo.id, 'Empty response from model');
      if (isAuto && retryAttempt < 2) {
        return this.completeChat(request, retryAttempt + 1);
      }
    } else {
      this.modelService.recordSuccess(modelInfo.id, Date.now() - startTime);
    }

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
   * Streaming chat completion using async generator with smart health tracking
   */
  async *streamChat(request: ChatCompletionRequest, retryAttempt = 0): AsyncGenerator<string, void, unknown> {
    const targetModel = request.model?.trim() || this.defaultModel;
    const modelInfo = await this.modelService.resolveModel(targetModel);
    const isExistingSession = Boolean(request.session_id && request.session_id.trim());
    const includeReasoning = Boolean(request.include_reasoning || request.show_reasoning || request.reasoning);
    const variant = request.variant || request.reasoning_effort;
    const directory = request.directory?.trim();
    const workspace = request.workspace?.trim();
    const permissions = this.resolvePermissions(request);
    const isAuto = !request.model || request.model.trim().toLowerCase() === 'auto' || request.model.trim().toLowerCase() === 'random';

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

    const startTime = Date.now();
    let response: Response;
    try {
      response = await this.openCodeService.sendMessage(
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
    } catch (err: any) {
      this.modelService.recordFailure(modelInfo.id, err.message);
      if (isAuto && retryAttempt < 2) {
        yield* this.streamChat(request, retryAttempt + 1);
        return;
      }
      yield OpenAITransformer.formatStreamChunk(`\n[ZenBridge Error: Model '${modelInfo.id}' failed: ${err.message}]`, modelInfo.id, completionId, 'stop', sessionId);
      yield 'data: [DONE]\n\n';
      return;
    }

    const contentType = response.headers?.get('content-type') || '';
    const isSSE = contentType.includes('text/event-stream');
    let emittedAnyContent = false;

    if (isSSE && response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let lineBuffer = '';
      let initialRoleEmitted = false;

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
                if (parsed.error || parsed.type === 'error') {
                  const errorMsg = parsed.error?.message || parsed.message || JSON.stringify(parsed);
                  this.modelService.recordFailure(modelInfo.id, errorMsg);
                  if (!emittedAnyContent && isAuto && retryAttempt < 2) {
                    yield* this.streamChat(request, retryAttempt + 1);
                    return;
                  }
                  yield OpenAITransformer.formatStreamChunk(`\n[ZenBridge Error: ${errorMsg}]`, modelInfo.id, completionId, 'stop', sessionId);
                  yield 'data: [DONE]\n\n';
                  return;
                }

                const { content: deltaContent, reasoningContent: deltaReasoning } =
                  OpenAITransformer.extractResponsePayload(parsed);

                if (!initialRoleEmitted && (deltaContent || deltaReasoning)) {
                  yield OpenAITransformer.formatStreamChunk('', modelInfo.id, completionId, null, sessionId, undefined, 'assistant');
                  initialRoleEmitted = true;
                }

                if (includeReasoning && deltaReasoning) {
                  emittedAnyContent = true;
                  yield OpenAITransformer.formatStreamChunk('', modelInfo.id, completionId, null, sessionId, deltaReasoning);
                }
                if (deltaContent) {
                  emittedAnyContent = true;
                  yield OpenAITransformer.formatStreamChunk(deltaContent, modelInfo.id, completionId, null, sessionId);
                }
              } catch {
                if (!initialRoleEmitted) {
                  yield OpenAITransformer.formatStreamChunk('', modelInfo.id, completionId, null, sessionId, undefined, 'assistant');
                  initialRoleEmitted = true;
                }
                emittedAnyContent = true;
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
              if (parsed.error || parsed.type === 'error') {
                const errorMsg = parsed.error?.message || parsed.message || JSON.stringify(parsed);
                this.modelService.recordFailure(modelInfo.id, errorMsg);
              } else {
                const { content: deltaContent, reasoningContent: deltaReasoning } =
                  OpenAITransformer.extractResponsePayload(parsed);
                if (includeReasoning && deltaReasoning) {
                  emittedAnyContent = true;
                  yield OpenAITransformer.formatStreamChunk('', modelInfo.id, completionId, null, sessionId, deltaReasoning);
                }
                if (deltaContent) {
                  emittedAnyContent = true;
                  yield OpenAITransformer.formatStreamChunk(deltaContent, modelInfo.id, completionId, null, sessionId);
                }
              }
            } catch { /* ignore malformed tail */ }
          }
        }

        if (emittedAnyContent) {
          this.modelService.recordSuccess(modelInfo.id, Date.now() - startTime);
        } else {
          this.modelService.recordFailure(modelInfo.id, 'Stream ended with no content');
          if (isAuto && retryAttempt < 2) {
            yield* this.streamChat(request, retryAttempt + 1);
            return;
          }
        }
      } catch (streamErr: any) {
        this.modelService.recordFailure(modelInfo.id, streamErr.message);
        if (!emittedAnyContent && isAuto && retryAttempt < 2) {
          yield* this.streamChat(request, retryAttempt + 1);
          return;
        }
        yield OpenAITransformer.formatStreamChunk(`\n[ZenBridge Stream Error: ${streamErr.message}]`, modelInfo.id, completionId, 'stop', sessionId);
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

      if (rawJson?.error || rawJson?.type === 'error') {
        const errorMsg = rawJson?.error?.message || rawJson?.message || JSON.stringify(rawJson);
        this.modelService.recordFailure(modelInfo.id, errorMsg);
        if (isAuto && retryAttempt < 2) {
          yield* this.streamChat(request, retryAttempt + 1);
          return;
        }
        yield OpenAITransformer.formatStreamChunk(`\n[ZenBridge Error: ${errorMsg}]`, modelInfo.id, completionId, 'stop', sessionId);
        yield 'data: [DONE]\n\n';
        return;
      }

      const { content: fullText, reasoningContent } = OpenAITransformer.extractResponsePayload(rawJson);

      if (!fullText && !reasoningContent) {
        this.modelService.recordFailure(modelInfo.id, 'Empty response from model');
        if (isAuto && retryAttempt < 2) {
          yield* this.streamChat(request, retryAttempt + 1);
          return;
        }
      } else {
        this.modelService.recordSuccess(modelInfo.id, Date.now() - startTime);
      }

      yield OpenAITransformer.formatStreamChunk('', modelInfo.id, completionId, null, sessionId, undefined, 'assistant');

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
