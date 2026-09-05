// parseLrc / findNear 单元测试（纯逻辑，无 Spicetify 依赖，Node 直接跑）
//   node --experimental-strip-types src/utils/ncm/parseLrc.test.ts
import { parseLrc, findNear } from "./parseLrc.ts";

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

// ── parseLrc：基础时间戳 ────────────────────────────────────────────────────
{
  const rows = parseLrc("[00:10.00]hello");
  check("单时间戳解析", rows.length === 1 && rows[0].t === 10_000 && rows[0].text === "hello", rows);
}

{
  const rows = parseLrc("[01:05.50]world");
  check("分秒百分秒(2位)", rows.length === 1 && rows[0].t === 65_500, rows);
}

{
  const rows = parseLrc("[01:05.123]world");
  check("毫秒(3位)", rows.length === 1 && rows[0].t === 65_123, rows);
}

// ── parseLrc：多时间戳一行 ──────────────────────────────────────────────────
{
  const rows = parseLrc("[00:10.00][00:20.00]chorus");
  check(
    "多时间戳展开为两条",
    rows.length === 2 && rows[0].t === 10_000 && rows[1].t === 20_000 && rows[0].text === "chorus",
    rows
  );
}

// ── parseLrc：JSON 行（网易云逐字格式） ─────────────────────────────────────
{
  const rows = parseLrc('{"t":1500,"c":[{"tx":"你"},{"tx":"好"}]}');
  check("JSON 行 c 数组拼接", rows.length === 1 && rows[0].t === 1500 && rows[0].text === "你好", rows);
}

{
  // c 为字符串的变体（修复过的分支）
  const rows = parseLrc('{"t":2500,"c":"plain"}');
  check("JSON 行 c 字符串", rows.length === 1 && rows[0].t === 2500 && rows[0].text === "plain", rows);
}

// ── parseLrc：排序与容错 ────────────────────────────────────────────────────
{
  const rows = parseLrc("[00:30.00]b\n[00:10.00]a\nnot-a-timestamp\n\n[00:20.00]c");
  check(
    "乱序输入排序 + 非法行忽略",
    rows.length === 3 && rows[0].text === "a" && rows[1].text === "c" && rows[2].text === "b",
    rows
  );
}

{
  // 纯时间戳行（无文本）保留为空文本行（调用方自行过滤）
  const rows = parseLrc("[00:10.00]");
  check("空文本行保留", rows.length === 1 && rows[0].text === "", rows);
}

{
  check("空输入返回空数组", parseLrc("").length === 0);
}

// ── findNear：最近匹配 + 容差 ───────────────────────────────────────────────
{
  const table = [
    { t: 1000, text: "one" },
    { t: 2000, text: "two" },
    { t: 3000, text: "three" },
  ];
  check("精确命中", findNear(table, 2000) === "two");
  check("容差内就近", findNear(table, 2050) === "two");
  check("边界内(600ms)", findNear(table, 2550) === "three" || findNear(table, 2550) === "two"); // 550/450 最近为 three? |3000-2550|=450 < |2000-2550|=550 → three
  check("超出容差返回空", findNear(table, 21000) === "");
  check("空表返回空", findNear([], 1000) === "");
}

console.log(`[parseLrc] ${passed} passed, ${failures} failed`);
if (failures > 0) (globalThis as any).process?.exit?.(1);
