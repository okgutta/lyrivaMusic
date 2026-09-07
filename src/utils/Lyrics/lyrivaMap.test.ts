// LYRIVA 响应 → LyricsPayload 映射单元测试（纯逻辑，无 Spicetify 依赖，Node 直接跑）
//   node --experimental-strip-types src/utils/Lyrics/lyrivaMap.test.ts
import {
  buildLyrivaModel,
  buildLyrivaModelFromResponse,
  mapTranslations,
  metaToLevel,
  confidenceOf,
} from "./lyrivaMap.ts";
import type { TargetTrack } from "./matcher.ts";

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

const target: TargetTrack = {
  uri: "spotify:track:abc",
  title: "晴天",
  artists: ["周杰伦"],
  album: "叶惠美",
  durationMs: 269000,
  isrc: "TWK570001200",
};

// 完整 API 响应：meta 与 data 同级（回归：顶层 meta 不能在解包时丢失）。
{
  const response = {
    data: {
      track: { title: "晴天", artist: "周杰伦", album: "叶惠美", duration: 269 },
      plainLyrics: "",
      syncedLyrics: [
        { startMs: 5000, text: "故事的小黄花" },
        { startMs: 12000, text: "从出生那年就飘着" },
        { startMs: 19000, text: "童年的荡秋千" },
      ],
    },
    meta: { matchLevel: "HIGH_CONFIDENCE", matchScore: 0.98 },
  };
  const model = buildLyrivaModelFromResponse(response, target);
  check("顶层 meta 的完整响应可映射", model?.Type === "Line", model);
  check("顶层 meta 传入 matchInfo", (model?.matchInfo as any)?.level === "HIGH", model);
}

// ── Line 模型：syncedLyrics 充足 → 时间换算（ms→秒）+ EndTime 链 ─────────────
{
  const data = {
    track: { title: "晴天", artist: "周杰伦", album: "叶惠美", duration: 269 },
    plainLyrics: "",
    syncedLyrics: [
      { startMs: 5000, text: "故事的小黄花" },
      { startMs: 12000, text: "从出生那年就飘着" },
      { startMs: 19000, text: "童年的荡秋千" },
    ],
    translation: null,
    meta: { matchLevel: "HIGH_CONFIDENCE", matchScore: 0.98 },
  };
  const model = buildLyrivaModel(data, target);
  check("Line 模型类型", model?.Type === "Line", model);
  check("Line 行数", model?.Content?.length === 3, model?.Content?.length);
  check(
    "StartTime 秒换算",
    (model?.Content?.[0]?.StartTime ?? 0) === 5,
    model?.Content?.[0]?.StartTime
  );
  check(
    "EndTime 取下一行",
    (model?.Content?.[0]?.EndTime ?? 0) === 12,
    model?.Content?.[0]?.EndTime
  );
  check(
    "末行 EndTime +4s",
    (model?.Content?.[2]?.EndTime ?? 0) === 23,
    model?.Content?.[2]?.EndTime
  );
  check("source 标记", model?.source === "lyriva", model?.source);
  check("uri 标记", model?.uri === target.uri, model?.uri);
}

// ── matchInfo：meta.matchLevel → HIGH、matchScore 归一化、track 候选元数据 ────
{
  const data = {
    track: { title: "晴天", artist: "周杰伦" },
    plainLyrics: "",
    syncedLyrics: [
      { startMs: 5000, text: "a" },
      { startMs: 9000, text: "b" },
      { startMs: 13000, text: "c" },
    ],
    meta: { matchLevel: "HIGH_CONFIDENCE", matchScore: 0.98 },
  };
  const model = buildLyrivaModel(data, target);
  const mi = model?.matchInfo as any;
  check("matchInfo.level=HIGH", mi?.level === "HIGH", mi?.level);
  check("matchInfo.confidence", Math.abs(mi?.confidence - 0.98) < 1e-9, mi?.confidence);
  check("candidateTitle", mi?.candidateTitle === "晴天", mi?.candidateTitle);
  check("candidateArtists", mi?.candidateArtists?.[0] === "周杰伦", mi?.candidateArtists);
  check("targetTitle", mi?.targetTitle === target.title, mi?.targetTitle);
}

// ── metaToLevel / confidenceOf 兜底 ─────────────────────────────────────────
{
  check("HIGH_CONFIDENCE → HIGH", metaToLevel({ matchLevel: "HIGH_CONFIDENCE" }) === "HIGH");
  check("GOOD_CONFIDENCE → GOOD", metaToLevel({ matchLevel: "GOOD_CONFIDENCE" }) === "GOOD");
  check(
    "缓存缺失 matchLevel → qualityScore>=90 判 HIGH",
    metaToLevel({ qualityScore: 100 }) === "HIGH"
  );
  check(
    "缓存缺失 matchLevel + qualityScore<90 → GOOD",
    metaToLevel({ qualityScore: 80 }) === "GOOD"
  );
  // matchScore 单位不稳定：0-1 直通；否则用 qualityScore/100
  check("matchScore 0-1 直通", confidenceOf({ matchScore: 0.98 }) === 0.98);
  check(
    "matchScore 非 0-1 → qualityScore/100",
    confidenceOf({ matchScore: 7, qualityScore: 100 }) === 1
  );
  check("无 match 信息 → 0", confidenceOf({}) === 0);
}

// ── translation LRC 对齐 ─────────────────────────────────────────────────────
{
  const data = {
    track: { title: "晴天", artist: "周杰伦" },
    plainLyrics: "",
    syncedLyrics: [
      { startMs: 5000, text: "one" },
      { startMs: 10000, text: "two" },
      { startMs: 15000, text: "three" },
    ],
    translation: "[00:05.00]一\n[00:10.00]二\n[00:15.00]三",
    meta: { matchLevel: "HIGH_CONFIDENCE", matchScore: 0.98 },
  };
  const model = buildLyrivaModel(data, target);
  check(
    "translation LRC 对齐",
    model?.Content?.[1]?.Translation === "二",
    model?.Content?.[1]?.Translation
  );
}

// ── mapTranslations：纯文本按行序兜底 ────────────────────────────────────────
{
  const got = mapTranslations("一\n二\n三", [5000, 10000, 15000]);
  check("纯文本行序兜底", got[0] === "一" && got[2] === "三", got);
  check(
    "空输入返回空串数组",
    mapTranslations(null, [1, 2])[0] === "",
    mapTranslations(null, [1, 2])
  );
}

// ── Static 模型：syncedLyrics 不足、plainLyrics 充足 ─────────────────────────
{
  const data = {
    track: { title: "晴天", artist: "周杰伦" },
    plainLyrics: "第一行\n第二行\n第三行",
    syncedLyrics: [{ startMs: 5000, text: "only one" }],
    meta: { matchLevel: "HIGH_CONFIDENCE", matchScore: 0.98 },
  };
  const model = buildLyrivaModel(data, target);
  check("Static 模型类型", model?.Type === "Static", model?.Type);
  check("Static 行数", model?.Lines?.length === 3, model?.Lines?.length);
  check("Static 首行文本", model?.Lines?.[0]?.Text === "第一行", model?.Lines?.[0]?.Text);
}

// ── 无词：两者都不足 → null ──────────────────────────────────────────────────
{
  const data = {
    track: { title: "x" },
    plainLyrics: "",
    syncedLyrics: [{ startMs: 0, text: "a" }],
  };
  check("无词返回 null", buildLyrivaModel(data, target) === null);
}

console.log(`[lyrivaMap] ${passed} passed, ${failures} failed`);
if (failures > 0) (globalThis as any).process?.exit?.(1);
