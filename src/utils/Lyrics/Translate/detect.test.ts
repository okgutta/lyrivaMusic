// detect.ts 单元测试（纯逻辑，Node 直接跑）
//   node --experimental-strip-types src/utils/Lyrics/Translate/detect.test.ts
import { normalizeLang, isSameLanguage, isTargetChinese } from "./detect.ts";

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

// ── normalizeLang：franc 三字母映射 ─────────────────────────────────────────
check("cmn → zh", normalizeLang("cmn") === "zh", normalizeLang("cmn"));
check("jpn → ja", normalizeLang("jpn") === "ja");
check("eng → en", normalizeLang("eng") === "en");
check("kor → ko", normalizeLang("kor") === "ko");

// ── normalizeLang：zh 家族简繁细分 ──────────────────────────────────────────
check("zh-TW → zh-hant", normalizeLang("zh-TW") === "zh-hant", normalizeLang("zh-TW"));
check("zh_HK → zh-hant（下划线归一）", normalizeLang("zh_HK") === "zh-hant");
check("cmn-Hant → zh-hant", normalizeLang("cmn-Hant") === "zh-hant");
check("yue-HK → zh-hant", normalizeLang("yue-HK") === "zh-hant");
check("zh-Hans → zh-hans", normalizeLang("zh-Hans") === "zh-hans");
check("zh-CN → zh-hans", normalizeLang("zh-CN") === "zh-hans");
check("cmn（无脚本）→ zh", normalizeLang("cmn") === "zh");
check("大小写归一 ZH-tw → zh-hant", normalizeLang("ZH-tw") === "zh-hant");

// ── normalizeLang：其他 ────────────────────────────────────────────────────
check("未知码原样返回 base", normalizeLang("xyz-abc") === "xyz");
check("空/null 返回空串", normalizeLang(null) === "" && normalizeLang("") === "");

// ── isSameLanguage ─────────────────────────────────────────────────────────
check("同语言 en/en", isSameLanguage("en", "en") === true);
check("franc 与 ISO2 互认 cmn/zh-CN", isSameLanguage("cmn", "zh-CN") === true);
check("zh 家族互认 zh-TW/zh-CN", isSameLanguage("zh-TW", "zh-CN") === true);
check("不同语言 en/ja", isSameLanguage("en", "ja") === false);
check("一方为空返回 false", isSameLanguage(null, "en") === false);
check("双方为空返回 false", isSameLanguage("", "") === false);

// ── isTargetChinese ────────────────────────────────────────────────────────
check("zh-CN 是中文", isTargetChinese("zh-CN") === true);
check("cmn 是中文", isTargetChinese("cmn") === true);
check("en 不是中文", isTargetChinese("en") === false);

console.log(`[detect] ${passed} passed, ${failures} failed`);
if (failures > 0) (globalThis as any).process?.exit?.(1);
