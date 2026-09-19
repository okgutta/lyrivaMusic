/// <reference types="node" />
// providers 集成测试：用假 fetch 验证限速、并发上限与 Retry-After 处理。
// providers.ts → stores.ts 在模块加载时读 Spicetify.LocalStorage，故先注入桩。
const storage = new Map<string, string>();
(globalThis as any).Spicetify = {
  LocalStorage: {
    get: (key: string) => storage.get(key) ?? null,
    set: (key: string, value: string) => storage.set(key, value),
    remove: (key: string) => storage.delete(key),
  },
};
(globalThis as any).window = { _spicy_lyrics_metadata: undefined };

const {
  $customApiBaseUrl,
  $customApiKey,
  $customApiModel,
  $translationConcurrency,
  $translationProvider,
} = await import("../../stores.ts");
const { translateLines } = await import("./providers.ts");

$translationProvider.set("custom");
$customApiBaseUrl.set("http://localhost:9999/v1");
$customApiKey.set("test-key");
$customApiModel.set("test-model");
$translationConcurrency.set(3);

interface Call {
  at: number;
  lines: string[];
  inFlight: number;
}

let failures = 0;
let passed = 0;
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) passed++;
  else {
    failures++;
    console.error(`FAIL: ${name}`, detail ?? "");
  }
}

const realFetch = globalThis.fetch;

/** 假 fetch：回显标记 + 前缀"译"，并记录每次调用的时间与同时在途数 */
function stubFetch(
  calls: Call[],
  options: {
    delayMs?: number;
    respond?: (callIndex: number, lines: string[]) => Response | null;
  } = {}
) {
  let inFlight = 0;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const payload = String(body.messages[1].content);
    const lines = payload.split("\n");
    inFlight++;
    calls.push({ at: Date.now(), lines, inFlight });
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    const override = options.respond?.(calls.length - 1, lines);
    inFlight--;
    if (override) return override;
    const echoed = lines
      .map((line) => {
        const marker = line.match(/^(\[\[SPICY_TR_[^\]]+\]\])/);
        return marker ? marker[1] + "译" + line.slice(marker[1].length) : line;
      })
      .join("\n");
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: echoed } }],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      }),
      { status: 200 }
    );
  }) as typeof fetch;
}

const source = (count: number) => Array.from({ length: count }, (_, i) => `line ${i + 1}`);

// ── 并发上限 ────────────────────────────────────────────────────────────────
{
  const calls: Call[] = [];
  // 请求耗时远大于最小间隔，才能真正观察到并发是否被限制住
  stubFetch(calls, { delayMs: 300 });
  $translationConcurrency.set(1);
  const result = await translateLines(source(25), "zh-CN");

  check(
    "串行时同时只有一个请求在途",
    Math.max(...calls.map((c) => c.inFlight)) === 1,
    calls.length
  );
  check("25 行按上限切成 2 块", calls.length === 2, calls.length);
  check(
    "所有行都拿到译文",
    result.lines.every((line) => line.startsWith("译")),
    result.lines
  );
  check("无失败块", result.metrics.failedChunks === 0);
  check("usage 累加(每块 1+2+3)", result.metrics.totalTokens === 6, result.metrics);
}

// ── 并发数生效 ──────────────────────────────────────────────────────────────
{
  const calls: Call[] = [];
  stubFetch(calls, { delayMs: 300 });
  $translationConcurrency.set(3);
  const result = await translateLines(source(25), "zh-CN");

  check(
    "并发 3 时 3 个请求同时在途",
    Math.max(...calls.map((c) => c.inFlight)) === 3,
    calls.length
  );
  check("并发 3 切成 3 块", calls.length === 3, calls.length);
  check("并发下结果顺序仍按原文对齐", result.lines[0] === "译line 1", result.lines[0]);
  check("并发下末尾行也对齐", result.lines[24] === "译line 25", result.lines[24]);
}

// ── 多波次：块数远多于并发数时，在途请求数仍被并发数卡住 ────────────────────
{
  const calls: Call[] = [];
  stubFetch(calls, { delayMs: 200 });
  $translationConcurrency.set(2);
  const result = await translateLines(source(200), "zh-CN");

  check("200 行按上限切成 10 块", calls.length === 10, calls.length);
  check(
    "块数多于并发数时仍有请求排队（未被一次性打满）",
    Math.max(...calls.map((c) => c.inFlight)) === 2,
    Math.max(...calls.map((c) => c.inFlight))
  );
  check(
    "多波次结果全部对齐",
    result.lines.every((line, i) => line === `译line ${i + 1}`)
  );
  check("多波次无失败块", result.metrics.failedChunks === 0);
}

// ── 全局最小请求间隔 ────────────────────────────────────────────────────────
{
  const calls: Call[] = [];
  stubFetch(calls);
  $translationConcurrency.set(1);
  await translateLines(source(25), "zh-CN");

  const gaps = calls.slice(1).map((call, i) => call.at - calls[i].at);
  check(
    "连续请求之间保持最小间隔",
    gaps.every((gap) => gap >= 90),
    gaps
  );
}

// ── Retry-After 生效 ────────────────────────────────────────────────────────
{
  const calls: Call[] = [];
  let retried = false;
  stubFetch(calls, {
    respond: (index) => {
      if (index !== 0) return null;
      retried = true;
      // retry-after: 0 → 立刻重试，测试无需真的等待
      return new Response("{}", { status: 429, headers: { "retry-after": "0" } });
    },
  });
  $translationConcurrency.set(1);
  const result = await translateLines(source(3), "zh-CN");

  check("429 后按 Retry-After 重试", retried && calls.length === 2, calls.length);
  check(
    "重试成功后拿到译文",
    result.lines.every((line) => line.startsWith("译"))
  );
  check("重试成功不计入失败块", result.metrics.failedChunks === 0);
}

// ── 超长 Retry-After 不空等 ──────────────────────────────────────────────────
{
  const calls: Call[] = [];
  stubFetch(calls, {
    respond: () => new Response("{}", { status: 429, headers: { "retry-after": "3600" } }),
  });
  $translationConcurrency.set(1);
  const started = Date.now();
  const result = await translateLines(source(3), "zh-CN");
  const elapsed = Date.now() - started;

  check("超长 Retry-After 立即放弃而非空等", elapsed < 2000, `${elapsed}ms`);
  check("不重试确定性放弃", calls.length === 1, calls.length);
  check("失败块被记录", result.metrics.failedChunks === 1, result.metrics);
  check("失败时保留原文", result.lines[0] === "line 1", result.lines[0]);
}

// ── 不可重试的 4xx ──────────────────────────────────────────────────────────
{
  const calls: Call[] = [];
  stubFetch(calls, { respond: () => new Response("{}", { status: 401 }) });
  $translationConcurrency.set(1);
  const result = await translateLines(source(3), "zh-CN");

  check("401 不重试", calls.length === 1, calls.length);
  check("401 记为失败块", result.metrics.failedChunks === 1, result.metrics);
}

// ── 空行定点补译 ────────────────────────────────────────────────────────────
{
  const calls: Call[] = [];
  stubFetch(calls, {
    respond: (index, lines) => {
      if (index !== 0) return null;
      // 首块故意丢掉中间那行，模拟模型漏标记（保留其余行的真实标记）
      const echoed = lines
        .map((line, i) => {
          if (i === 1) return "";
          const marker = line.match(/^(\[\[SPICY_TR_[^\]]+\]\])/);
          return marker ? marker[1] + "译" + line.slice(marker[1].length) : line;
        })
        .filter(Boolean)
        .join("\n");
      return new Response(JSON.stringify({ choices: [{ message: { content: echoed } }] }), {
        status: 200,
      });
    },
  });
  $translationConcurrency.set(1);
  const result = await translateLines(["one", "two", "three"], "zh-CN");

  check("漏行触发定点补译", calls.length === 2, calls.length);
  check("补译只重发缺失的那一行", calls[1].lines.length === 1, calls[1].lines);
  check("缺失行被补上", result.lines[1].startsWith("译"), result.lines);
  check(
    "同块内已成功的行未被丢弃",
    result.lines[0].startsWith("译") && result.lines[2].startsWith("译")
  );
  check("补译成功不计入失败块", result.metrics.failedChunks === 0, result.metrics);
}

// ── 服务的临时故障仍走逐行兜底 ───────────────────────────────────────────────
{
  const calls: Call[] = [];
  stubFetch(calls, {
    respond: (_index, lines) => {
      // 整块请求一律 503，单行请求放行 —— 逐行兜底应能救回全部行
      return lines.length > 1 ? new Response("{}", { status: 503 }) : null;
    },
  });
  $translationConcurrency.set(1);
  const result = await translateLines(["one", "two", "three"], "zh-CN");

  check(
    "503 触发逐行兜底",
    calls.some((call) => call.lines.length === 1),
    calls.length
  );
  check(
    "逐行兜底救回所有行",
    result.lines.every((line) => line.startsWith("译")),
    result.lines
  );
  check("逐行兜底成功后无失败块", result.metrics.failedChunks === 0, result.metrics);
}

// ── 鉴权失败不做逐行重发（避免无意义的请求放大） ─────────────────────────────
{
  const calls: Call[] = [];
  stubFetch(calls, { respond: () => new Response("{}", { status: 403 }) });
  $translationConcurrency.set(1);
  const result = await translateLines(["one", "two", "three"], "zh-CN");

  check("403 不做逐行重发", calls.length === 1, calls.length);
  check("403 计入失败块", result.metrics.failedChunks === 1, result.metrics);
}

globalThis.fetch = realFetch;
console.log(`[providers] ${passed} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
