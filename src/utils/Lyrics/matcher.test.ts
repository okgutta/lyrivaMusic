// Lyra Matcher 单元测试（纯逻辑，无 Spicetify 依赖，Node 直接跑）
//   node src/utils/Lyrics/matcher.test.ts
import {
  matchCandidate,
  artistMatch,
  selectBest,
  splitArtists,
  normalizeTitle,
  rankMatch,
  type Candidate,
  type TargetTrack,
  type MatchResult,
} from "./matcher.ts";

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

// 构造目标曲目
function T(title: string, artist: string | string[], durationMs?: number, album?: string, isrc?: string): TargetTrack {
  return {
    uri: "spotify:track:test",
    title,
    artists: Array.isArray(artist) ? artist : [artist],
    durationMs,
    album,
    isrc,
  };
}

// 构造候选
function C(title: string, artist: string | string[], durationMs?: number, album?: string, isrc?: string): Candidate {
  return {
    source: "qq",
    id: "x",
    title,
    artists: Array.isArray(artist) ? artist : artist ? splitArtists(artist) : [],
    durationMs,
    album,
    isrc,
  };
}

function m(target: TargetTrack, cand: Candidate): MatchResult {
  return matchCandidate(target, cand);
}

function isRejected(r: MatchResult): boolean {
  return r.rejected && r.level === "REJECT";
}

// ============================================================
// 核心原则回归：同歌名 + 不同艺人 → 必须 REJECT（ARTIST_MISMATCH）
// ============================================================

// 案例 1：Blession - Autopilot vs Other Artist - Autopilot
{
  const r = m(T("Autopilot", "Blession", 210000), C("Autopilot", "Other Artist", 210000));
  check("案例1 同歌名不同艺人 → REJECT", isRejected(r), r);
  check("案例1 rejectReason=ARTIST_MISMATCH", r.rejectReason === "ARTIST_MISMATCH", r.rejectReason);
  check("案例1 artistStatus=MISMATCH", r.artistStatus === "MISMATCH");
  check("案例1 不进 selectBest", selectBest([r]) === null);
}

// 案例 2：Weiland - Runaway vs 黄明昊/朱正廷/Ghost/... - Run Away (国语)
{
  const r = m(T("Runaway", "Weiland", 190000), C("Run Away (国语)", "黄明昊（Justin）;朱正廷;Ghost（王琳凯）;毕雯珺;Jeffrey董又霖;董岩磊", 183000));
  check("案例2 Runaway 群组 → REJECT", isRejected(r), r);
  check("案例2 rejectReason=ARTIST_MISMATCH", r.rejectReason === "ARTIST_MISMATCH", r.rejectReason);
  check("案例2 artistStatus=MISMATCH", r.artistStatus === "MISMATCH");
  check("案例2 不能因 title 相似而接受", r.titleStatus !== "EXACT");
}

// 案例 3：Jonah Paz - Kissing You vs NCT WISH - Kissing You (2024MBC歌谣大祭典现场)
{
  const r = m(T("Kissing You", "Jonah Paz", 210000), C("Kissing You (2024MBC歌谣大祭典现场)", "NCT WISH", 240000));
  check("案例3 Kissing You 现场版 → REJECT", isRejected(r), r);
  check("案例3 rejectReason=ARTIST_MISMATCH", r.rejectReason === "ARTIST_MISMATCH", r.rejectReason);
  check("案例3 artistStatus=MISMATCH", r.artistStatus === "MISMATCH");
  check("案例3 versionToken 识别 live", r.versionTokens.includes("live"), r.versionTokens);
}

// ============================================================
// 正确匹配 → ACCEPT
// ============================================================

// 案例 4：完全一致 → ACCEPT（HIGH）
{
  const r = m(T("Autopilot", "Blession", 210000), C("Autopilot", "Blession", 210000));
  check("案例4 完全一致 → ACCEPT", !r.rejected);
  check("案例4 level=HIGH", r.level === "HIGH", r.level);
  check("案例4 confidence>=0.9", r.confidence >= 0.9, r.confidence);
  check("案例4 可被选中", selectBest([r]) !== null);
}

// 案例 6：Artist A - Song A vs Artist B - Song A → REJECT（即使时长一致）
{
  const r = m(T("Song A", "Artist A", 200000), C("Song A", "Artist B", 200000));
  check("案例6 不同艺人时长一致 → REJECT", isRejected(r));
  check("案例6 rejectReason=ARTIST_MISMATCH", r.rejectReason === "ARTIST_MISMATCH");
}

// 案例 7：Artist A - Song A vs Song A (artist=null) → LOW_CONFIDENCE / NEEDS_VERIFICATION，永不自动返回
{
  const r = m(T("Song A", "Artist A"), C("Song A", "")); // artist 空
  check("案例7 无艺人 → artistStatus=UNKNOWN", r.artistStatus === "UNKNOWN", r.artistStatus);
  check("案例7 needsVerification=true", r.needsVerification === true);
  check("案例7 不能自动返回（非 selectable）", selectBest([r]) === null);
  check("案例7 level 不是 HIGH/GOOD", r.level === "UNCERTAIN" || r.level === "REJECT", r.level);
  // 有强时长证据仍不可自动返回（艺术家未确认 → 宁缺毋滥）
  const rDur = m(T("Song A", "Artist A", 200000), C("Song A", "", 200000));
  check("案例7 强时长+无艺人 仍不可自动返回", selectBest([rDur]) === null, rDur);
}

// 案例 8：多源只有错误艺人候选 → 全部 REJECT → selectBest 返回 null（NO_MATCH）
{
  const wrong1 = m(T("Autopilot", "Blession"), C("Autopilot", "Other Artist A"));
  const wrong2 = m(T("Autopilot", "Blession"), C("Autopilot", "Other Artist B"));
  const allRejected = [wrong1, wrong2].every((r) => isRejected(r) && r.rejectReason === "ARTIST_MISMATCH");
  check("案例8 仅错误艺人候选 → 全部 REJECT", allRejected);
  check("案例8 selectBest → null（NO_MATCH）", selectBest([wrong1, wrong2]) === null);
}

// ============================================================
// 案例 5 相关：同艺人不同版本 → 温和判定（-20，非硬拒），但不算完全一致
// ============================================================
{
  // 同艺人 Live：title baseTitle 相同（EXACT 基础），version 失配扣分；无时长证据 → 降到 <0.70（LOW_CONFIDENCE）
  const r = m(T("Song X", "Artist A"), C("Song X (Live)", "Artist A"));
  check("案例5 同艺人 Live → version=MISMATCH", r.version === "MISMATCH", r.version);
  check("案例5 versionScore<0", r.versionScore < 0, r.versionScore);
  check("案例5 无时长证据 → LOW_CONFIDENCE（不自动返回）", selectBest([r]) === null, r);
  // 但同艺人不同版本不应高于原版
  const base = m(T("Song X", "Artist A"), C("Song X", "Artist A"));
  check("案例5 Live 不高于原版", rankMatch(r) <= rankMatch(base));
  // 有强时长证据时，version 失配是软扣分而非硬拒
  const rDur = m(T("Song X", "Artist A", 200000), C("Song X (Live)", "Artist A", 202000));
  check("案例5 同艺人 Live + 时长一致 → 可自动选中（软判断）", selectBest([rDur]) !== null, rDur);
  check("案例5 同艺人 Live + 时长一致 → version 仍 MISMATCH", rDur.version === "MISMATCH");
}

// ============================================================
// 标题严格性：Runaway vs Run Away 只能 SIMILAR，不能 EXACT
// ============================================================
{
  const r = m(T("Runaway", "Weiland", 190000), C("Run Away", "Weiland", 190000));
  check("Runaway ~ Run Away titleStatus=SIMILAR", r.titleStatus === "SIMILAR", r.titleStatus);
  check("Runaway ~ Run Away 不是 EXACT", r.titleStatus !== "EXACT");
  check("Runaway ~ Run Away 同艺人+时长 → ACCEPT", !r.rejected, r);
  // 无时长，仅有 SIMILAR title + MATCH artist → 不足以自动选中
  const rNoDur = m(T("Runaway", "Weiland"), C("Run Away", "Weiland"));
  check("Runaway ~ Run Away 无时长不可自动选中", selectBest([rNoDur]) === null, rNoDur);
}

// ============================================================
// 标题相似度档位检查（防 0.92 子串捷径穿透）
// ============================================================
{
  const ocean = m(T("Ocean", "ArtistX"), C("Ocean Eyes", "ArtistX"));
  check("Ocean vs Ocean Eyes → 不是 EXACT", ocean.titleStatus !== "EXACT");
  check("Ocean vs Ocean Eyes → titleScore 不含 40", ocean.titleScore < 40, ocean.titleScore);
  check("Ocean vs Ocean Eyes（无时长）不可自动选中", selectBest([ocean]) === null, ocean);
}

// ============================================================
// ISRC 强匹配 / 强负向
// ============================================================
{
  const matchIsrc = m(T("Song A", "Artist A", 200000, undefined, "USRC17607839"), C("Song A", "Artist A", 200000, undefined, "USRC17607839"));
  check("ISRC 一致 → isrcScore>0", matchIsrc.isrcScore > 0, matchIsrc.isrcScore);
  const diffIsrc = m(T("Song A", "Artist A", 200000, undefined, "USRC17607839"), C("Song A", "Artist A", 200000, undefined, "GBBKS1000001"));
  check("ISRC 不同 → isrcScore<0", diffIsrc.isrcScore < 0, diffIsrc.isrcScore);
}

// ============================================================
// 艺人三态（直接测 artistMatch）
// ============================================================
{
  check("艺人 MAPTCH 相同", artistMatch(["Weiland"], ["Weiland"]).status === "MATCH");
  check("艺人 MISMATCH 不同", artistMatch(["Weiland"], ["Taylor Swift"]).status === "MISMATCH");
  check("艺人 UNKNOWN 缺艺人", artistMatch(["Weiland"], []).status === "UNKNOWN");
  check("艺人 MISMATCH 群组（Weiland vs 黄明昊等）", artistMatch(["Weiland"], splitArtists("黄明昊（Justin）;朱正廷;Ghost（王琳凯）;毕雯珺;Jeffrey董又霖;董岩磊")).status === "MISMATCH");
  check("艺人 简繁 同一（陈奕迅 vs 陳奕迅）", artistMatch(["陈奕迅"], ["陳奕迅"]).status === "MATCH");
  check("艺人 中文不同（蔡依林 vs 周杰伦）", artistMatch(["周杰伦"], ["蔡依林"]).status === "MISMATCH");
  check("艺人 跨语系译名 1v1 → UNKNOWN", artistMatch(["周杰伦"], ["Jay Chou"]).status === "UNKNOWN");
  check("艺人 feat 允许（Artist A vs Artist A feat B）", artistMatch(["Artist A"], splitArtists("Artist A feat. Artist B")).status === "MATCH");
}

// ============================================================
// normalizeTitle / parseTitle / splitArtists
// ============================================================
{
  check("normalizeTitle 大小写+标点", normalizeTitle("  Hello, World!  ") === "hello world");
  check("normalizeTitle 全角", normalizeTitle("ＦｕｌｌＷｉｄｔｈ") === "fullwidth");
  check("splitArtists feat", splitArtists("Jonah Paz feat. XXX").join(",") === "jonah paz,xxx");
  check("splitArtists 顿号", splitArtists("Jonah Paz, XXX、YYY").join(",") === "jonah paz,xxx,yyy");
  check("splitArtists 括号罗马音", splitArtists("少女時代 (SNSD)").join(",") === "少女時代");
}
// ============================================================
// 混合候选池：错误艺人候选必须被 HARD FILTER 剔除，正确候选胜出
// ============================================================
{
  // 错误候选（同歌名不同艺人）→ REJECT；正确候选 → SELECTABLE
  const wrongArtist = m(T("Autopilot", "Blession", 210000), C("Autopilot", "Other Artist", 210000));
  const correct = m(T("Autopilot", "Blession", 210000), C("Autopilot", "Blession", 210000));
  const best = selectBest([wrongArtist, correct]);
  check("混合池 selectBest 返回正确候选", best !== null && best.artistStatus === "MATCH", best);
  check("混合池 不会选到错误艺人候选", best !== null && best.candidate.artists[0] === "blession", best);
}

// ============================================================
// 最终 NO_MATCH 保证：全池仅剩「同歌名不同艺人」候选 → 一定 NO_MATCH
// ============================================================
{
  const pool = [
    m(T("Blession - Autopilot".split(" - ")[0], "Blession"), C("Autopilot", "Other Artist A")),
    m(T("Autopilot", "Blession"), C("Autopilot", "Other Artist B")),
    m(T("Autopilot", "Blession"), C("Autopilot", "Artist C")),
  ];
  const allRejected = pool.every((r) => r.rejected && r.rejectReason === "ARTIST_MISMATCH");
  check("NO_MATCH 保证：全错误艺人候选 → 全 rejected", allRejected);
  check("NO_MATCH 保证：selectBest → null（一定 NO_MATCH）", selectBest(pool) === null);
}
console.log(`\n[Lyra Matcher] ${passed} passed, ${failures} failed`);
if (failures > 0) {
  (globalThis as any).process?.exit?.(1);
}
