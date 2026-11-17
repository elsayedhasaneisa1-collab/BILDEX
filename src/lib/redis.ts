type MemoryEntry = { value: string; expiresAt: number };
const memory = new Map<string, MemoryEntry>();
const MEMORY_LIMIT = 3000;
const largeMemory = new Map<string, MemoryEntry>();
const LARGE_MEMORY_LIMIT = 20;

function redisConfig() {
  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL || "").replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN || "";
  return url && token ? { url, token } : null;
}

async function redisCommand<T>(command: (string | number)[]) {
  const config = redisConfig();
  if (!config) return { configured: false as const, ok: false, result: null as T | null };
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
      cache: "no-store",
      signal: AbortSignal.timeout(1800),
    });
    if (!response.ok) return { configured: true as const, ok: false, result: null as T | null };
    const payload = (await response.json()) as { result?: T; error?: string };
    if (payload.error) return { configured: true as const, ok: false, result: null as T | null };
    return { configured: true as const, ok: true, result: payload.result ?? null };
  } catch {
    return { configured: true as const, ok: false, result: null as T | null };
  }
}

function memoryGet(key: string) {
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memory.delete(key);
    return null;
  }
  memory.delete(key);
  memory.set(key, entry);
  return entry.value;
}

function memorySet(key: string, value: string, ttlSeconds: number) {
  memory.delete(key);
  memory.set(key, { value, expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000 });
  while (memory.size > MEMORY_LIMIT) {
    const oldest = memory.keys().next().value;
    if (!oldest) break;
    memory.delete(oldest);
  }
}

function encode(value: unknown): unknown {
  if (value instanceof Date) return { __buildex_date: value.toISOString() };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
  }
  return value;
}

function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.__buildex_date === "string" && Object.keys(record).length === 1) return new Date(record.__buildex_date);
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, decode(item)]));
  }
  return value;
}

export async function cacheRemember<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  const namespaced = `buildex:cache:${key}`;
  const redis = await redisCommand<string>(["GET", namespaced]);
  if (redis.ok && typeof redis.result === "string") {
    try { return decode(JSON.parse(redis.result)) as T; } catch {}
  }
  if (!redis.ok) {
    const cached = memoryGet(namespaced);
    if (cached !== null) {
      try { return decode(JSON.parse(cached)) as T; } catch { memory.delete(namespaced); }
    }
  }

  const value = await loader();
  const serialized = JSON.stringify(encode(value)) ?? "null";
  if (redis.ok) {
    const saved = await redisCommand(["SET", namespaced, serialized, "EX", Math.max(1, ttlSeconds)]);
    if (!saved.ok) memorySet(namespaced, serialized, ttlSeconds);
  } else {
    memorySet(namespaced, serialized, ttlSeconds);
  }
  return value;
}

export async function localCacheRemember<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  const namespaced = `buildex:local:${key}`;
  const entry = largeMemory.get(namespaced);
  if (entry && entry.expiresAt > Date.now()) {
    largeMemory.delete(namespaced);
    largeMemory.set(namespaced, entry);
    try { return decode(JSON.parse(entry.value)) as T; } catch { largeMemory.delete(namespaced); }
  } else if (entry) {
    largeMemory.delete(namespaced);
  }
  const value = await loader();
  largeMemory.set(namespaced, { value: JSON.stringify(encode(value)) ?? "null", expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000 });
  while (largeMemory.size > LARGE_MEMORY_LIMIT) {
    const oldest = largeMemory.keys().next().value;
    if (!oldest) break;
    largeMemory.delete(oldest);
  }
  return value;
}

export async function cacheDelete(key: string) {
  const namespaced = `buildex:cache:${key}`;
  await redisCommand(["DEL", namespaced]);
  memory.delete(namespaced);
  largeMemory.delete(`buildex:local:${key}`);
}

export async function redisRateLimit(key: string, limit: number, windowMs: number): Promise<number | null> {
  const script = "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; return n";
  const result = await redisCommand<number>(["EVAL", script, 1, `buildex:rate:${key}`, Math.max(1000, windowMs)]);
  return result.ok && typeof result.result === "number" ? result.result : null;
}

export async function redisClaimOnce(key: string, ttlSeconds: number): Promise<boolean | null> {
  const result = await redisCommand<string>(["SET", `buildex:once:${key}`, "1", "NX", "EX", Math.max(1, ttlSeconds)]);
  if (!result.ok) return null;
  if (result.result === "OK") return true;
  if (result.result === null) return false;
  return null;
}

export async function redisReleaseClaim(key: string) {
  await redisCommand(["DEL", `buildex:once:${key}`]);
}

