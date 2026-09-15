import { randomUUID } from 'node:crypto';
import type {
  OpenAIMessage,
  ChatCompletionResponse,
  ChatCompletionChunk,
} from '../types/index.ts';

export interface FormattedPrompt {
  promptText: string;
  parts: Array<{ type: 'text'; text: string }>;
  systemPrompt?: string;
}

export class OpenAITransformer {
  /**
   * Convert OpenAI messages array into consolidated OpenCode prompt parts
   */
  static formatMessagesToPrompt(messages: OpenAIMessage[] = []): FormattedPrompt {
    if (!Array.isArray(messages) || messages.length === 0) {
      return {
        promptText: '',
        parts: [{ type: 'text', text: '' }],
      };
    }

    // Extract any system prompt
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const systemPrompt = systemMessages
      .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
      .filter(Boolean)
      .join('\n\n');

    if (nonSystemMessages.length === 1 && nonSystemMessages[0].role === 'user') {
      const rawContent = nonSystemMessages[0].content;
      const text = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
      return {
        promptText: text,
        parts: [{ type: 'text', text }],
        systemPrompt: systemPrompt || undefined,
      };
    }

    const formattedLines: string[] = [];
    for (const msg of nonSystemMessages) {
      const role = (msg.role || 'user').toUpperCase();
      let content = '';

      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = msg.content
          .map((part) => (typeof part === 'string' ? part : part?.text || ''))
          .filter(Boolean)
          .join('\n');
      } else if (msg.content) {
        content = JSON.stringify(msg.content);
      }

      switch (role) {
        case 'ASSISTANT':
          formattedLines.push(`[Assistant]:\n${content}\n`);
          break;
        default:
          formattedLines.push(`[User]:\n${content}\n`);
          break;
      }
    }

    const promptText = formattedLines.join('\n').trim();
    return {
      promptText,
      parts: [{ type: 'text', text: promptText }],
      systemPrompt: systemPrompt || undefined,
    };
  }

  /**
   * Format only the latest message for existing session continuation
   */
  static formatLatestMessage(messages: OpenAIMessage[] = []): FormattedPrompt {
    if (!Array.isArray(messages) || messages.length === 0) {
      return {
        promptText: '',
        parts: [{ type: 'text', text: '' }],
      };
    }

    const lastMsg = messages[messages.length - 1];
    let content = '';
    if (typeof lastMsg.content === 'string') {
      content = lastMsg.content;
    } else if (Array.isArray(lastMsg.content)) {
      content = lastMsg.content
        .map((part) => (typeof part === 'string' ? part : part?.text || ''))
        .filter(Boolean)
        .join('\n');
    } else if (lastMsg.content) {
      content = JSON.stringify(lastMsg.content);
    }

    const systemMessages = messages.filter((m) => m.role === 'system');
    const systemPrompt = systemMessages
      .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
      .filter(Boolean)
      .join('\n\n');

    return {
      promptText: content,
      parts: [{ type: 'text', text: content }],
      systemPrompt: systemPrompt || undefined,
    };
  }

  /**
   * Remove explicit reasoning XML tags (<think>...</think>) produced by reasoning models
   */
  static cleanReasoning(text: string): string {
    if (!text || typeof text !== 'string') return '';

    let cleaned = text;

    // 1. Strip full <think>...</think>, <thought>...</thought>, <reasoning>...</reasoning> tags
    cleaned = cleaned.replace(/<(?:think|thought|reasoning)>[\s\S]*?<\/(?:think|thought|reasoning)>\s*/gi, '');

    // 2. Strip orphaned opening content preceding a closing tag (e.g. "Thought here...</think>")
    cleaned = cleaned.replace(/^[\s\S]*?<\/(?:think|thought|reasoning)>\s*/i, '');

    // 3. Strip dangling unclosed <think> tag if stream was cut off
    cleaned = cleaned.replace(/<(?:think|thought|reasoning)>[\s\S]*$/gi, '');

    return cleaned.trim();
  }

  /**
   * Extract both text content and reasoning content from OpenCode response payload
   */
  static extractResponsePayload(payload: unknown): { content: string; reasoningContent?: string } {
    if (!payload) return { content: '' };

    let content = '';
    let reasoning = '';

    if (typeof payload === 'string') {
      try {
        const parsed = JSON.parse(payload);
        return this.extractResponsePayload(parsed);
      } catch {
        content = payload;
      }
    } else if (typeof payload === 'object') {
      const obj = payload as Record<string, unknown>;

      if (Array.isArray(obj.parts)) {
        for (const part of obj.parts) {
          if (!part) continue;
          if (typeof part === 'string') {
            content += part;
          } else if (typeof part === 'object') {
            const p = part as Record<string, unknown>;
            const text = String(p.text || '');
            if (p.type === 'reasoning') {
              reasoning += text;
            } else {
              content += text;
            }
          }
        }
      } else if (obj.message) {
        if (typeof obj.message === 'string') content = obj.message;
        else if (typeof obj.message === 'object') return this.extractResponsePayload(obj.message);
      } else if (typeof obj.content === 'string') {
        content = obj.content;
      } else if (typeof obj.text === 'string') {
        content = obj.text;
      } else if (typeof obj.response === 'string') {
        content = obj.response;
      } else {
        content = JSON.stringify(payload);
      }
    }

    const cleanedContent = this.cleanReasoning(content);
    return {
      content: cleanedContent,
      reasoningContent: reasoning ? reasoning.trim() : undefined,
    };
  }

  /**
   * Extract assistant response text from any OpenCode response payload
   */
  static extractTextFromOpenCodeResponse(payload: unknown, shouldClean = true): string {
    const { content } = this.extractResponsePayload(payload);
    return shouldClean ? this.cleanReasoning(content) : content;
  }

  /**
   * Create standard OpenAI Chat Completion object.
   * @param promptText - The raw prompt text, used to estimate prompt_tokens separately.
   */
  static createCompletionResponse(
    textContent: string,
    modelId: string,
    sessionId?: string,
    reasoningContent?: string,
    completionId: string = `chatcmpl-${randomUUID()}`,
    promptText: string = ''
  ): ChatCompletionResponse {
    const created = Math.floor(Date.now() / 1000);
    const promptChars = promptText.length;
    const completionChars = textContent.length + (reasoningContent?.length || 0);
    const promptTokens = Math.max(1, Math.ceil(promptChars / 4));
    const completionTokens = Math.max(1, Math.ceil(completionChars / 4));

    const messagePayload: { role: string; content: string; reasoning_content?: string } = {
      role: 'assistant',
      content: textContent,
    };

    if (reasoningContent && reasoningContent.trim()) {
      messagePayload.reasoning_content = reasoningContent.trim();
    }

    return {
      id: completionId,
      session_id: sessionId,
      object: 'chat.completion',
      created,
      model: modelId,
      choices: [
        {
          index: 0,
          message: messagePayload,
          logprobs: null,
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    };
  }

  /**
   * Format OpenAI SSE chunk for streaming responses
   */
  static formatStreamChunk(
    deltaContent: string,
    modelId: string,
    completionId: string,
    finishReason: 'stop' | 'length' | null = null,
    sessionId?: string,
    reasoningDelta?: string,
    role?: string
  ): string {
    const created = Math.floor(Date.now() / 1000);
    const deltaPayload: { role?: string; content?: string; reasoning_content?: string } = {};

    if (role) {
      deltaPayload.role = role;
    }

    if (finishReason) {
      // empty delta on finish
    } else if (reasoningDelta !== undefined) {
      deltaPayload.reasoning_content = reasoningDelta;
    } else if (deltaContent !== undefined) {
      deltaPayload.content = deltaContent;
    }

    const payload: ChatCompletionChunk = {
      id: completionId,
      session_id: sessionId,
      object: 'chat.completion.chunk',
      created,
      model: modelId,
      choices: [
        {
          index: 0,
          delta: deltaPayload,
          logprobs: null,
          finish_reason: finishReason,
        },
      ],
    };

    return `data: ${JSON.stringify(payload)}\n\n`;
  }
}
