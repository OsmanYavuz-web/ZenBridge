import type { ModelMetadata } from '../types/index.ts';
import { getFallbackModelInfo } from '../config.ts';
import { OpenCodeService } from './opencode.service.ts';

export class ModelService {
  private cachedModels: ModelMetadata[] = [];
  private lastFetchTime = 0;
  private readonly ttlMs: number;
  private readonly openCodeService: OpenCodeService;

  constructor(openCodeService: OpenCodeService, ttlMs: number = 30000) {
    this.openCodeService = openCodeService;
    this.ttlMs = ttlMs;
  }

  /**
   * Get all active models dynamically from OpenCode
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

    return this.cachedModels;
  }

  /**
   * Resolve a model by its ID, or pick a random free model if omitted / auto / random
   */
  async resolveModel(modelId?: string): Promise<ModelMetadata> {
    const models = await this.getModels();
    const normalized = (modelId || '').trim().toLowerCase();

    // 1. Auto / Random load-balancing selection across active free models
    if (!normalized || normalized === 'auto' || normalized === 'random') {
      const freeModels = models.filter((m) => (m.cost ?? 0) === 0 || m.id.toLowerCase().includes('free'));
      const candidatePool = freeModels.length > 0 ? freeModels : models;

      if (candidatePool.length > 0) {
        const randomIndex = Math.floor(Math.random() * candidatePool.length);
        return candidatePool[randomIndex];
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

