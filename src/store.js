/**
 * Small persistence layer. Uses a Workers KV namespace when one is bound as
 * THERMO (cross-colo, survives deploys, lets /admin/pin work globally).
 * Without KV it degrades to a per-isolate memory map plus the Cache API, which
 * is enough for a proof of concept but resets whenever the isolate recycles.
 */
const mem = new Map();

export function makeStore(env) {
  const kv = env.THERMO ?? null;
  const key = (k) => `v1:${k}`;
  const get = async (k) => {
    if (kv) return kv.get(key(k), 'json');
    return mem.has(key(k)) ? mem.get(key(k)) : null;
  };
  const put = async (k, v, ttlSeconds) => {
    if (kv) return kv.put(key(k), JSON.stringify(v), ttlSeconds ? { expirationTtl: ttlSeconds } : undefined);
    mem.set(key(k), v);
  };
  const del = async (k) => { if (kv) return kv.delete(key(k)); mem.delete(key(k)); };
  return {
    backend: kv ? 'kv' : 'memory',
    getLastGood: (side) => get(`last:${side}`),
    setLastGood: (side, v) => put(`last:${side}`, v, 60 * 60 * 24 * 30),
    getPin: (side) => get(`pin:${side}`),
    setPin: (side, values, { ttlSeconds = null, setAt = Date.now() } = {}) =>
      put(`pin:${side}`, { values, setAt, expiresAt: ttlSeconds ? setAt + ttlSeconds * 1000 : null }, ttlSeconds || undefined),
    clearPin: (side) => del(`pin:${side}`),
  };
}
