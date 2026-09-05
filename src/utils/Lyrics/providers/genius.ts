// Genius Provider（需要用户自行提供 Access Token）
// Provider 只负责「搜索 → 返回候选」与「按候选取词」；匹配交给统一 Lyra Matcher。
//
// 两条通道都带 Access-Control-Allow-Origin: *，客户端直连 fetch 即可读：
//   搜索: https://api.genius.com/search?q=...&access_token=TOKEN
//   歌词: https://genius.com/songs/<id>/embed.js（歌词 HTML 在 JSON.parse 参数里）
//
import Logger from "../../Logger.ts";
import { $geniusApiToken } from "../../stores.ts";
import { splitArtists, type Candidate, type TargetTrack, type LyricsPayload } from "../matcher.ts";
import { type LyricProvider, MIN_LYRIC_LINES } from "./types.ts";
import type { LyraLogger } from "../../LyraLogger.ts";

const geniusLogger = new Logger("Genius Provider");

const SEARCH_TIMEOUT_MS = 8000;
const EMBED_TIMEOUT_MS = 10000;

type GeniusSongResult = {
  id?: number;
  title?: string;
  full_title?: string;
  path?: string;
  url?: string;
  artist_names?: string;
  primary_artist?: { name?: string };
  /** "complete" | "unreleased" | "instrumental" | "missing" | "unverified" */
  lyrics_state?: string;
};

/** 直连 fetch（超时 + 外部 signal 合并，任一触发即中止） */
async function geniusFetch(url: string, timeoutMs: number, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new Error("aborted");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "*/*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Origin: "https://xpui.app.spotify.com",
        Referer: "https://genius.com/",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    return new TextDecoder("utf-8").decode(buf);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** 去掉标题里的 "Lyrics"/"歌词" 后缀（Genius full_title 常带） */
function stripLyricsSuffix(t: string): string {
  return String(t || "")
    .replace(/\s*(?:[·-]?\s*Lyrics?|歌词|가사)\s*$/i, "")
    .trim();
}

async function geniusSearchRaw(
  title: string,
  artist: string,
  signal?: AbortSignal
): Promise<GeniusSongResult[]> {
  const kw = `${title} ${artist}`.trim();
  if (!kw) return [];
  const token = $geniusApiToken.get()?.trim();
  if (!token) {
    // 未配置 Token：不请求（用户可在设置中填写；无 Token 时 Genius 源自动跳过）
    geniusLogger.debug("[genius] 未配置 Access Token，跳过搜索");
    return [];
  }
  const url = `https://api.genius.com/search?q=${encodeURIComponent(kw)}&access_token=${encodeURIComponent(token)}`;
  const text = await geniusFetch(url, SEARCH_TIMEOUT_MS, signal);
  const json = JSON.parse(text) as { response?: { hits?: Array<{ result?: GeniusSongResult }> } };
  return (json?.response?.hits ?? [])
    .map((h) => h?.result)
    .filter((song): song is GeniusSongResult => Boolean(song));
}

// ==== Provider ====
async function searchGeniusProvider(
  target: TargetTrack,
  signal?: AbortSignal,
  log?: LyraLogger
): Promise<Candidate[]> {
  try {
    const hits = await geniusSearchRaw(target.title, target.artists.join(" "), signal);
    const out: Candidate[] = [];
    for (const s of hits) {
      if (!s?.id) continue;
      if (s.lyrics_state === "missing") continue;
      const title = stripLyricsSuffix(s.title || s.full_title || "");
      const artist = s.primary_artist?.name || s.artist_names || "";
      if (!title) continue;
      out.push({
        source: "genius",
        id: String(s.id),
        title,
        artists: splitArtists(artist),
      });
    }
    return out;
  } catch (err) {
    log?.debug(`[genius] 搜索失败: ${String(err)}`);
    return [];
  }
}

/** JS 字符串转义逐段还原（\n \" \\ \uXXXX 等） */
function unescapeJsString(s: string): string {
  return s.replace(/\\(?:n|r|t|.|u[0-9a-fA-F]{4})/g, (esc) => {
    switch (esc) {
      case "\\n":
        return "\n";
      case "\\r":
        return "\r";
      case "\\t":
        return "\t";
      default:
        if (/^\\u[0-9a-fA-F]{4}$/.test(esc)) {
          return String.fromCharCode(parseInt(esc.slice(2), 16));
        }
        return esc.slice(1);
    }
  });
}

/** 段落标记行（如 [Chorus]、[Verse 1: ...]、[리센느 "Runaway" 가사]）——只在歌词标题用，过滤掉 */
const SECTION_MARKER_RE =
  /^\[[^\]]*(?:verse|pre-?chorus|post-?chorus|bridge|intro|outro|interlude|hook|refrain|drop|breakdown|build|spoken|instrumental|후렴|코러스|イントロ|コーラス|アウトロ|歌詞|歌词|가사|lyrics?)[^\]]*\]$/i;

function isSectionMarker(line: string): boolean {
  return SECTION_MARKER_RE.test(line.trim());
}

/** 从 embed.js 文本提取歌词行（歌词 HTML 在 JSON.parse('...') 参数里） */
function extractLyricsFromEmbedJs(js: string): string[] | null {
  let raw: string | null = null;
  for (const m of js.matchAll(/JSON\.parse\('([\s\S]*?)'\)/g)) {
    if (m[1].includes("rg_embed_body")) {
      raw = m[1];
      break;
    }
  }
  if (!raw) return null;

  let html: string;
  try {
    html = JSON.parse(unescapeJsString(raw)) as string;
  } catch {
    geniusLogger.debug("Genius embed.js JSON 解析失败");
    return null;
  }

  html = html.replace(/<br\s*\/?>/gi, "\n");
  const bodyMatch = html.match(/<div[^>]*class="[^"]*rg_embed_body[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  const body = bodyMatch ? bodyMatch[1] : html;

  const text = body
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isSectionMarker(l));
  return lines.length >= MIN_LYRIC_LINES ? lines : null;
}

async function fetchGeniusProvider(
  cand: Candidate,
  signal?: AbortSignal,
  log?: LyraLogger
): Promise<LyricsPayload | null> {
  try {
    const js = await geniusFetch(
      `https://genius.com/songs/${cand.id}/embed.js`,
      EMBED_TIMEOUT_MS,
      signal
    );
    const lines = extractLyricsFromEmbedJs(js);
    if (!lines) return null;
    return { Type: "Static", Lines: lines.map((Text) => ({ Text })), source: "genius" };
  } catch (err) {
    log?.debug(`[genius] embed.js 抓取失败: ${String(err)}`);
    return null;
  }
}

export const geniusProvider: LyricProvider = {
  source: "genius",
  search: searchGeniusProvider,
  fetchLyrics: fetchGeniusProvider,
};
