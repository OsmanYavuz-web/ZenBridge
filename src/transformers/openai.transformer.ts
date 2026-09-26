import { randomUUID } from 'node:crypto';
import type {
  OpenAIMessage,
  OpenCodePart,
  FilePartInput,
  TextPartInput,
  ChatCompletionResponse,
  ChatCompletionChunk,
} from '../types/index.ts';

export interface FormattedPrompt {
  promptText: string;
  parts: OpenCodePart[];
  systemPrompt?: string;
}

export class OpenAITransformer {
  /**
   * Helper to infer MIME type from data URI or URL extension
   */
  static inferMimeType(url: string, defaultType = 'application/octet-stream'): string {
    if (!url || typeof url !== 'string') return defaultType;
    const dataMatch = url.match(/^data:([^;,]+)(?:;base64)?,/i);
    if (dataMatch && dataMatch[1]) {
      return dataMatch[1].toLowerCase();
    }

    const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
    if (cleanUrl.endsWith('.png')) return 'image/png';
    if (cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg')) return 'image/jpeg';
    if (cleanUrl.endsWith('.webp')) return 'image/webp';
    if (cleanUrl.endsWith('.gif')) return 'image/gif';
    if (cleanUrl.endsWith('.svg')) return 'image/svg+xml';
    if (cleanUrl.endsWith('.pdf')) return 'application/pdf';
    if (cleanUrl.endsWith('.json')) return 'application/json';
    if (cleanUrl.endsWith('.txt') || cleanUrl.endsWith('.md') || cleanUrl.endsWith('.ts') || cleanUrl.endsWith('.js')) {
      return 'text/plain';
    }
    if (cleanUrl.endsWith('.mp3')) return 'audio/mp3';
    if (cleanUrl.endsWith('.wav')) return 'audio/wav';
    if (cleanUrl.endsWith('.mp4')) return 'video/mp4';

    return defaultType;
  }

  /**
   * Parse message content (string or array of multimodal parts) into consolidated text and OpenCode parts
   */
  static parseContentParts(content: OpenAIMessage['content']): { textContent: string; parts: OpenCodePart[] } {
    if (typeof content === 'string') {
      return {
        textContent: content,
        parts: [{ type: 'text', text: content }],
      };
    }

    if (!Array.isArray(content) || content.length === 0) {
      const text = content ? JSON.stringify(content) : '';
      return {
        textContent: text,
        parts: [{ type: 'text', text }],
      };
    }

    const textParts: string[] = [];
    const openCodeParts: OpenCodePart[] = [];

    for (const part of content) {
      if (!part) continue;

      if (typeof part === 'string') {
        textParts.push(part);
        continue;
      }

      const pType = String(part.type || '').toLowerCase();

      if (pType === 'text') {
        const txt = String(part.text || '');
        if (txt) textParts.push(txt);
      } else if (pType === 'image_url') {
        const imgObj = part.image_url as Record<string, unknown> | string | undefined;
        const url = typeof imgObj === 'string' ? imgObj : String(imgObj?.url || part.url || '');
        const mime = OpenAITransformer.inferMimeType(url, 'image/jpeg');
        const filename = (typeof imgObj === 'object' ? imgObj?.filename : undefined) || part.filename as string | undefined;
        if (url) {
          openCodeParts.push({
            type: 'file',
            mime,
            url,
            filename: typeof filename === 'string' ? filename : undefined,
          });
        }
      } else if (pType === 'image') {
        const url = String(part.url || part.image || (part.data ? `data:${part.mime_type || part.mime || 'image/png'};base64,${part.data}` : ''));
        const mime = String(part.mime_type || part.mime || OpenAITransformer.inferMimeType(url, 'image/jpeg'));
        const filename = typeof part.filename === 'string' ? part.filename : undefined;
        if (url) {
          openCodeParts.push({
            type: 'file',
            mime,
            url,
            filename,
          });
        }
      } else if (pType === 'file' || pType === 'document' || pType === 'media') {
        const fileObj = part.file as Record<string, unknown> | undefined;
        const url = String(part.url || fileObj?.url || (part.data ? `data:${part.mime || part.mime_type || 'application/octet-stream'};base64,${part.data}` : ''));
        const mime = String(part.mime || part.mime_type || fileObj?.mime || OpenAITransformer.inferMimeType(url, 'application/octet-stream'));
        const filename = (typeof part.filename === 'string' ? part.filename : undefined) ||
          (typeof fileObj?.filename === 'string' ? fileObj.filename : undefined) ||
          (typeof part.name === 'string' ? part.name : undefined);
        if (url) {
          openCodeParts.push({
            type: 'file',
            mime,
            url,
            filename,
            source: part.source as Record<string, unknown> | undefined,
          });
        }
      } else if (pType === 'input_audio') {
        const audioObj = part.input_audio as Record<string, unknown> | undefined;
        const data = String(audioObj?.data || part.data || '');
        const format = String(audioObj?.format || part.format || 'wav');
        const url = data ? `data:audio/${format};base64,${data}` : String(part.url || '');
        const filename = (typeof part.filename === 'string' ? part.filename : undefined) || `audio.${format}`;
        if (url) {
          openCodeParts.push({
            type: 'file',
            mime: `audio/${format}`,
            url,
            filename,
          });
        }
      } else if (pType === 'agent') {
        openCodeParts.push({
          type: 'agent',
          name: String(part.name || ''),
          source: part.source as Record<string, unknown> | undefined,
        });
      } else if (pType === 'subtask') {
        openCodeParts.push({
          type: 'subtask',
          prompt: String(part.prompt || ''),
          description: String(part.description || ''),
        });
      } else if (part.text) {
        textParts.push(String(part.text));
      } else if (part.url) {
        const url = String(part.url);
        openCodeParts.push({
          type: 'file',
          mime: OpenAITransformer.inferMimeType(url),
          url,
          filename: typeof part.filename === 'string' ? part.filename : undefined,
        });
      }
    }

    const textContent = textParts.join('\n').trim();
    const finalParts: OpenCodePart[] = [];
    if (textContent) {
      finalParts.push({ type: 'text', text: textContent });
    }
    finalParts.push(...openCodeParts);

    // If no text and no files, return single empty text part
    if (finalParts.length === 0) {
      finalParts.push({ type: 'text', text: '' });
    }

    return {
      textContent,
      parts: finalParts,
    };
  }

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
      const { textContent, parts } = this.parseContentParts(nonSystemMessages[0].content);
      return {
        promptText: textContent,
        parts: parts.length > 0 ? parts : [{ type: 'text', text: textContent }],
        systemPrompt: systemPrompt || undefined,
      };
    }

    const formattedLines: string[] = [];
    const fileParts: OpenCodePart[] = [];

    for (const msg of nonSystemMessages) {
      const role = (msg.role || 'user').toUpperCase();
      const { textContent, parts } = this.parseContentParts(msg.content);

      // Collect file parts from messages
      for (const p of parts) {
        if (p.type !== 'text') {
          fileParts.push(p);
        }
      }

      let displayContent = textContent;
      const attachedFiles = parts.filter((p) => p.type === 'file') as FilePartInput[];
      if (attachedFiles.length > 0 && !displayContent.includes('[Attached:')) {
        const fileNames = attachedFiles.map((f) => f.filename || f.mime).join(', ');
        displayContent = displayContent ? `${displayContent}\n[Attached: ${fileNames}]` : `[Attached: ${fileNames}]`;
      }

      switch (role) {
        case 'ASSISTANT':
          formattedLines.push(`[Assistant]:\n${displayContent}\n`);
          break;
        default:
          formattedLines.push(`[User]:\n${displayContent}\n`);
          break;
      }
    }

    const promptText = formattedLines.join('\n').trim();
    const allParts: OpenCodePart[] = [{ type: 'text', text: promptText }, ...fileParts];

    return {
      promptText,
      parts: allParts,
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
    const { textContent, parts } = this.parseContentParts(lastMsg.content);

    const systemMessages = messages.filter((m) => m.role === 'system');
    const systemPrompt = systemMessages
      .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
      .filter(Boolean)
      .join('\n\n');

    return {
      promptText: textContent,
      parts: parts.length > 0 ? parts : [{ type: 'text', text: textContent }],
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
