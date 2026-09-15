import type { ModelMetadata, OpenCodeProviderResponse } from '../types/index.ts';
import { getFallbackModelInfo } from '../config.ts';

export class OpenCodeService {
  readonly baseUrl: string;

  constructor(baseUrl: string = 'http://127.0.0.1:4096') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Health check to upstream OpenCode.
   * Uses GET /session (read-only) to avoid creating phantom sessions on every poll.
   */
  async checkHealth(): Promise<{ ok: boolean; status?: number; error?: string }> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.baseUrl}/session`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return { ok: res.ok, status: res.status };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  /**
   * Fetch active providers & models from /config/providers
   */
  async fetchProvidersAndModels(): Promise<ModelMetadata[]> {
    try {
      const res = await fetch(`${this.baseUrl}/config/providers`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) return [];

      const data = (await res.json()) as OpenCodeProviderResponse;
      const models: ModelMetadata[] = [];

      if (data?.providers && Array.isArray(data.providers)) {
        for (const provider of data.providers) {
          const providerId = provider.id || 'opencode';
          const providerName = provider.name || providerId;

          if (provider.models && typeof provider.models === 'object') {
            for (const [key, item] of Object.entries(provider.models)) {
              models.push({
                id: item.id || key,
                name: item.name || key,
                provider: providerName,
                providerID: item.providerID || providerId,
                cost: item.cost ?? 0,
                context_window: item.limit?.context || item.context_window || 64000,
                capabilities: item.capabilities,
              });
            }
          }
        }
      }

      return models;
    } catch {
      return [];
    }
  }

  /**
   * Create a session in OpenCode
   */
  async createSession(title: string = 'proxy-request', agent?: string): Promise<string> {
    let res: Response;
    const body: Record<string, unknown> = { title: title.slice(0, 80) };
    if (agent && agent.trim()) {
      body.agent = agent.trim();
    }
    try {
      res = await fetch(`${this.baseUrl}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      if (err.code === 'ECONNREFUSED' || err.cause?.code === 'ECONNREFUSED') {
        throw new Error(
          `Cannot connect to OpenCode server at ${this.baseUrl}. Please ensure 'opencode serve --port 4096' is running.`
        );
      }
      throw err;
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to create OpenCode session (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    const sessionId = data.id || data.session_id || data.sessionId;
    if (!sessionId) {
      throw new Error(`OpenCode returned unexpected session payload: ${JSON.stringify(data)}`);
    }

    return sessionId;
  }

  /**
   * Send a message to an existing session
   */
  async sendMessage(
    sessionId: string,
    modelId: string,
    parts: Array<{ type: string; text: string }>,
    metadata?: ModelMetadata,
    systemPrompt?: string,
    variant?: string
  ): Promise<Response> {
    const modelInfo = metadata || getFallbackModelInfo(modelId);
    const payload: Record<string, unknown> = {
      model: {
        providerID: modelInfo.providerID || 'opencode',
        modelID: modelInfo.id || modelId,
      },
      parts: parts.length > 0 ? parts : [{ type: 'text', text: '' }],
    };

    if (systemPrompt && systemPrompt.trim()) {
      payload.system = systemPrompt.trim();
    }

    if (variant && variant.trim()) {
      payload.variant = variant.trim();
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/session/${encodeURIComponent(sessionId)}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      if (err.code === 'ECONNREFUSED' || err.cause?.code === 'ECONNREFUSED') {
        throw new Error(
          `Lost connection to OpenCode server at ${this.baseUrl}. Please ensure 'opencode serve --port 4096' is running.`
        );
      }
      throw err;
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenCode message request failed (${res.status}): ${errText}`);
    }

    return res;
  }

  /**
   * List all sessions from OpenCode
   */
  async listSessions(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/session`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  /**
   * Get session details by ID from OpenCode
   */
  async getSession(sessionId: string): Promise<any | null> {
    try {
      const res = await fetch(`${this.baseUrl}/session/${encodeURIComponent(sessionId)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /**
   * Delete a session by ID in OpenCode
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/session/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Delete all sessions in OpenCode
   */
  async deleteAllSessions(): Promise<{ deleted: boolean; count: number; total: number; ids: string[] }> {
    const sessions = await this.listSessions();
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return { deleted: true, count: 0, total: 0, ids: [] };
    }

    const sessionIds: string[] = sessions
      .map((s) => (typeof s === 'string' ? s : s?.id || s?.session_id || s?.sessionId))
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const deleteResults = await Promise.allSettled(
      sessionIds.map(async (id) => {
        const success = await this.deleteSession(id);
        return { id, success };
      })
    );

    const deletedIds: string[] = [];
    for (const res of deleteResults) {
      if (res.status === 'fulfilled' && res.value.success) {
        deletedIds.push(res.value.id);
      }
    }

    return {
      deleted: true,
      count: deletedIds.length,
      total: sessionIds.length,
      ids: deletedIds,
    };
  }
}

