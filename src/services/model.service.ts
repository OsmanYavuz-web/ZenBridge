import type { ModelHealthInfo, ModelHealthStatus, ModelMetadata } from '../types/index.ts';
import { getFallbackModelInfo } from '../config.ts';
import { OpenCodeService } from './opencode.service.ts';

export class ModelService {
  private cachedModels: ModelMetadata[] = [];
  private lastFetchTime = 0;
  private readonly ttlMs: number;
  private readonly openCodeService: OpenCodeService;
  private readonly healthMap: Map<string, ModelHealthInfo> = new Map();

  constructor(openCodeService: OpenCodeService, ttlMs: number = 30000) {
    this.openCodeService = openCodeService;
    this.ttlMs = ttlMs;
  }

  /**
   * Record a successful response for a model (Passive tracking, zero quota overhead)
   */
  recordSuccess(modelId: string, latencyMs: number): void {
    const norm = modelId.trim().toLowerCase();
    this.healthMap.set(norm, {
      status: 'healthy',
      healthy: true,
      latency_ms: Math.round(latencyMs),
      last_checked: Date.now(),
      consecutive_failures: 0,
      error_message: undefined,
    });
  }

  /**
   * Record a failure (timeout, rate-limit, 5xx) for a model (Passive tracking)
   */
  recordFailure(modelId: string, errorMessage?: string): void {
    const norm = modelId.trim().toLowerCase();
    const existing = this.healthMap.get(norm);
    const failures = (existing?.consecutive_failures || 0) + 1;
    const status: ModelHealthStatus = failures >= 2 ? 'rate_limited' : 'degraded';

    this.healthMap.set(norm, {
      status,
      healthy: false,
      latency_ms: existing?.latency_ms,
      last_checked: Date.now(),
      consecutive_failures: failures,
      error_message: errorMessage || 'Model request timed out or rate limit reached',
    });
  }

  /**
   * Get health status for a specific model ID
   */
  getHealthInfo(modelId: string): ModelHealthInfo {
    const norm = modelId.trim().toLowerCase();
    const info = this.healthMap.get(norm);
    if (info) return info;

    return {
      status: 'healthy',
      healthy: true,
      last_checked: Date.now(),
      consecutive_failures: 0,
    };
  }

  /**
   * Get all active models dynamically from OpenCode with enriched health status
   */
  async getModels(forceRefresh = false): Promise<ModelMetadata[]> {
    const now = Date.now();
    if (forceRefresh || now - this.lastFetchTime > this.ttlMs || this.cachedModels.length === 0) {
      const dynamic = await this.openCodeService.fetchProvidersAndModels();
      if (dynamic && dynamic.length > 0) {
        this.cachedModels = dynamic;
        this.lastFetchTime = now;
      }
    }

    // Enrich models with current health metrics
    return this.cachedModels.map((m) => {
      const health = this.getHealthInfo(m.id);
      return {
        ...m,
        health,
      };
    });
  }

  /**
   * Resolve a model by its ID, or intelligently pick the healthiest & fastest free model in auto mode
   */
  async resolveModel(modelId?: string): Promise<ModelMetadata> {
    const models = await this.getModels();
    const normalized = (modelId || '').trim().toLowerCase();

    // 1. Auto / Random load-balancing selection with smart quota & health detection
    if (!normalized || normalized === 'auto' || normalized === 'random') {
      const freeModels = models.filter((m) => (m.cost ?? 0) === 0 || m.id.toLowerCase().includes('free'));
      const candidatePool = freeModels.length > 0 ? freeModels : models;

      // Filter healthy candidates
      const healthyCandidates = candidatePool.filter((m) => m.health?.healthy !== false);

      if (healthyCandidates.length > 0) {
        // Sort by lowest latency (fastest responding healthy model)
        const sorted = [...healthyCandidates].sort((a, b) => {
          const latA = a.health?.latency_ms ?? 99999;
          const latB = b.health?.latency_ms ?? 99999;
          return latA - latB;
        });

        // Pick between the top fastest healthy models (load-balanced)
        const topCount = Math.min(2, sorted.length);
        const picked = sorted[Math.floor(Math.random() * topCount)];
        return picked;
      }

      // If all models are degraded/rate-limited, pick the one with the lowest failure count
      const leastFailed = [...candidatePool].sort((a, b) => {
        const failA = a.health?.consecutive_failures ?? 0;
        const failB = b.health?.consecutive_failures ?? 0;
        return failA - failB;
      });

      if (leastFailed.length > 0) {
        return leastFailed[0];
      }

      return getFallbackModelInfo('auto');
    }

    // 2. Specific model lookup (exact match)
    const match = models.find((m) => m.id.toLowerCase() === normalized);
    if (match) return match;

    // 3. Fuzzy match (partial model name matching full dynamic model name)
    const fuzzyMatch = models.find(
      (m) =>
        m.id.toLowerCase().includes(normalized) ||
        normalized.includes(m.id.toLowerCase())
    );
    if (fuzzyMatch) return fuzzyMatch;

    return getFallbackModelInfo(modelId);
  }
}
