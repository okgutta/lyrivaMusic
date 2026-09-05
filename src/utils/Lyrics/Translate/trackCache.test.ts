// trackCache 纯函数单元测试（Node 直接跑）
//   node --experimental-strip-types src/utils/Lyrics/Translate/trackCache.test.ts
// trackCache.ts 顶部 import 了 stores.ts（stores.ts 在模块加载时读 Spicetify.LocalStorage），
// 故在 import 前先注入最小 Spicetify 桩，避免 Node 环境 ReferenceError。
(globalThis as any).Spicetify = {
  LocalStorage: { get: () => null, set: () => undefined },
};
(globalThis as any).window = { _spicy_lyrics_metadata: undefined };
const { normalizeTrackUri, parseCacheKey, fingerprintSource } = await import("./trackCache.ts");

let failures = 0;
let passed = 0;
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    passed++;
  } else {
    failures++;
    console.error(`FAIL: ${name}`, detail ?? "");
  }
}

// ── normalizeTrackUri ──────────────────────────────────────────────────────
check("合法 uri 不变", normalizeTrackUri("spotify:track:4uLU6hMCjMI75M1A2tKUQC") === "spotify:track:4uLU6hMCjMI75M1A2tKUQC");
check("特殊字符替换为 _", normalizeTrackUri("a/b c?d") === "a_b_c_d", normalizeTrackUri("a/b c?d"));

// ── parseCacheKey ──────────────────────────────────────────────────────────
{
  const parsed = parseCacheKey("SL:translationTrack:spotify:track:abc:zh-CN");
  check(
    "正常 key 解析（uri 内冒号保留）",
    parsed?.trackUri === "spotify:track:abc" && parsed?.targetLang === "zh-CN",
    parsed
  );
}
check("缺前缀返回 null", parseCacheKey("other:key:value") === null);
check("无分隔冒号返回 null", parseCacheKey("SL:translationTrack:nocolon") === null);
check("尾部冒号（空语言）返回 null", parseCacheKey("SL:translationTrack:uri:") === null);

// ── fingerprintSource ──────────────────────────────────────────────────────
check("相同内容同指纹", fingerprintSource(["hello world", "foo"]) === fingerprintSource(["hello world", "foo"]));
// 归一化：大小写 / 空白折叠 / 首尾 trim 不影响指纹
check("大小写与空白归一", fingerprintSource(["Hello  World"]) === fingerprintSource(["hello world"]));
check("行数不同指纹不同", fingerprintSource(["a"]) !== fingerprintSource(["a", "b"]));
check("顺序敏感", fingerprintSource(["a", "b"]) !== fingerprintSource(["b", "a"]));
check("内容不同指纹不同", fingerprintSource(["a"]) !== fingerprintSource(["b"]));

console.log(`[trackCache] ${passed} passed, ${failures} failed`);
if (failures > 0) (globalThis as any).process?.exit?.(1);