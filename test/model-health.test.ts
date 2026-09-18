import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ModelService } from '../src/services/model.service.ts';
import { OpenCodeService } from '../src/services/opencode.service.ts';
import type { ModelMetadata } from '../src/types/index.ts';

describe('Model Health & Smart Load Balancer Tests', () => {
  const dummyOpenCodeService = {
    baseUrl: 'http://127.0.0.1:4096',
    fetchProvidersAndModels: async (): Promise<ModelMetadata[]> => [
      {
        id: 'fast-model-free',
        name: 'Fast Model',
        provider: 'OpenCode Zen',
        providerID: 'opencode',
        cost: 0,
        context_window: 100000,
      },
      {
        id: 'slow-model-free',
        name: 'Slow Model',
        provider: 'OpenCode Zen',
        providerID: 'opencode',
        cost: 0,
        context_window: 100000,
      },
      {
        id: 'limited-model-free',
        name: 'Limited Model',
        provider: 'OpenCode Zen',
        providerID: 'opencode',
        cost: 0,
        context_window: 100000,
      },
    ],
    createSession: async () => 'ses_dummy',
    deleteSession: async () => true,
  } as unknown as OpenCodeService;

  it('1. Initializes models with default healthy state', async () => {
    const service = new ModelService(dummyOpenCodeService, 1000);
    const models = await service.getModels();
    assert.strictEqual(models.length, 3);
    for (const m of models) {
      assert.strictEqual(m.health?.status, 'healthy');
      assert.strictEqual(m.health?.healthy, true);
    }
  });

  it('2. Records success and latency correctly', async () => {
    const service = new ModelService(dummyOpenCodeService, 1000);
    service.recordSuccess('fast-model-free', 120);
    service.recordSuccess('slow-model-free', 1500);

    const infoFast = service.getHealthInfo('fast-model-free');
    assert.strictEqual(infoFast.status, 'healthy');
    assert.strictEqual(infoFast.healthy, true);
    assert.strictEqual(infoFast.latency_ms, 120);

    const infoSlow = service.getHealthInfo('slow-model-free');
    assert.strictEqual(infoSlow.status, 'healthy');
    assert.strictEqual(infoSlow.healthy, true);
    assert.strictEqual(infoSlow.latency_ms, 1500);
  });

  it('3. Records failures and degrades/rate-limits model', async () => {
    const service = new ModelService(dummyOpenCodeService, 1000);
    service.recordFailure('limited-model-free', 'HTTP 429 Rate Limited');

    let info = service.getHealthInfo('limited-model-free');
    assert.strictEqual(info.status, 'degraded');
    assert.strictEqual(info.healthy, false);
    assert.strictEqual(info.consecutive_failures, 1);

    // Second consecutive failure marks as rate_limited
    service.recordFailure('limited-model-free', 'Timeout');
    info = service.getHealthInfo('limited-model-free');
    assert.strictEqual(info.status, 'rate_limited');
    assert.strictEqual(info.healthy, false);
    assert.strictEqual(info.consecutive_failures, 2);
  });

  it('4. auto mode routes to the fastest healthy model and avoids rate-limited model', async () => {
    const service = new ModelService(dummyOpenCodeService, 1000);
    service.recordSuccess('fast-model-free', 100);
    service.recordSuccess('slow-model-free', 800);
    service.recordFailure('limited-model-free', 'Quota Exceeded');
    service.recordFailure('limited-model-free', 'Quota Exceeded');

    // Run resolution multiple times to ensure it consistently picks healthy models
    for (let i = 0; i < 10; i++) {
      const resolved = await service.resolveModel('auto');
      assert.notStrictEqual(resolved.id, 'limited-model-free', 'Should never pick rate-limited model');
      assert.ok(
        resolved.id === 'fast-model-free' || resolved.id === 'slow-model-free',
        'Must pick from healthy pool'
      );
    }
  });

  it('5. Recovers model back to healthy when recordSuccess is called', async () => {
    const service = new ModelService(dummyOpenCodeService, 1000);
    service.recordFailure('limited-model-free', 'Timeout');
    service.recordFailure('limited-model-free', 'Timeout');
    assert.strictEqual(service.getHealthInfo('limited-model-free').healthy, false);

    service.recordSuccess('limited-model-free', 250);
    const recovered = service.getHealthInfo('limited-model-free');
    assert.strictEqual(recovered.status, 'healthy');
    assert.strictEqual(recovered.healthy, true);
    assert.strictEqual(recovered.consecutive_failures, 0);
    assert.strictEqual(recovered.latency_ms, 250);
  });
});
