import { describe, it, expect, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { createSentinelPlugin } from '../src/index.js';

describe('dispatch integration', () => {
  it('posts to localDispatchBase+webhookPath with bearer token', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('https://api.github.com')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({ type: 'PushEvent' })
        } as any;
      }
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) } as any;
    });

    const oldFetch = globalThis.fetch;
    // @ts-ignore
    globalThis.fetch = fetchMock;

    try {
      const plugin = createSentinelPlugin({
        allowedHosts: ['api.github.com'],
        localDispatchBase: 'http://127.0.0.1:18789',
        dispatchAuthToken: 'test-token',
        stateFilePath: path.join(os.tmpdir(), `sentinel-dispatch-test-${Date.now()}-${Math.random()}.json`),
        limits: { maxWatchersTotal: 10, maxWatchersPerSkill: 10, maxConditionsPerWatcher: 10, maxIntervalMsFloor: 1 }
      });

      await plugin.init();
      await plugin.manager.create({
        id: 'w1',
        skillId: 'skills.x',
        enabled: true,
        strategy: 'http-poll',
        endpoint: 'https://api.github.com/events',
        intervalMs: 1,
        match: 'all',
        conditions: [{ path: 'type', op: 'eq', value: 'PushEvent' }],
        fire: {
          webhookPath: '/hooks/agent',
          eventName: 'evt',
          payloadTemplate: { event: '${event.name}' }
        },
        retry: { maxRetries: 0, baseMs: 100, maxMs: 100 }
      });

      await new Promise((r) => setTimeout(r, 20));
      await plugin.manager.disable('w1');

      const dispatchCalls = fetchMock.mock.calls.filter((c) => String(c[0]).startsWith('http://127.0.0.1:18789/hooks/agent'));
      expect(dispatchCalls.length).toBeGreaterThan(0);
      const opts = dispatchCalls[0][1] as any;
      expect(opts.headers.authorization).toBe('Bearer test-token');
    } finally {
      globalThis.fetch = oldFetch;
    }
  });
});
