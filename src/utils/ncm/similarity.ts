// 文本相似度（从网页脚本移植：normalizeText / levenshtein / similarity / splitTitle / collectKeywords）

export function normalizeText(s: unknown): string {
  return String(s || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function levenshtein(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (!an) return bn;
  if (!bn) return an;
  // 双行滚动数组，内存 O(min(an, bn))
  let prev = Array.from({ length: an + 1 }, () => 0);
  let curr = Array.from({ length: an + 1 }, () => 0);
  for (let i = 0; i <= an; i++) prev[i] = i;
  for (let j = 1; j <= bn; j++) {
    curr[0] = j;
    for (let i = 1; i <= an; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(curr[i - 1] + 1, prev[i] + 1, prev[i - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[an];
}

export function similarity(a: string, b: string): number {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.92;
  const dist = levenshtein(x, y);
  return 1 - dist / Math.max(x.length, y.length);
}

/** 拆歌名：按 ` - | / :` 分隔，去掉括号/方括号后缀，去重 */
export function splitTitle(title: string): string[] {
  const t = String(title || "").trim();
  if (!t) return [];
  const parts = t
    .split(/\s+-\s+|\s*\|\s*|\s*\/\s*|\s*:\s*/g)
    .map((x) => x.replace(/\(.*?\)|\[.*?]/g, "").trim())
    .filter(Boolean);
  return [...new Set(parts.length ? parts : [t])];
}

/** 生成多组搜索关键词（歌名拆分 + 歌名+歌手 / 歌手+歌名 / 专辑辅助） */
export function collectKeywords(title: string, artist: string, album?: string): string[] {
  const titleParts = splitTitle(title);
  const kws = new Set<string>();
  for (const p of titleParts) kws.add(p);
  kws.add(`${title} ${artist}`.trim());
  kws.add(`${artist} ${title}`.trim());
  // 专辑名辅助：提高有版权歌的命中率（如 "Perfect ÷"、"晴天 叶惠美"）
  if (album) {
    const albumClean = String(album).trim();
    if (albumClean && albumClean.length > 1) {
      kws.add(`${title} ${albumClean}`.trim());
      kws.add(`${title} ${artist} ${albumClean}`.trim());
    }
  }
  return [...kws].filter((x) => x.length > 1);
}
