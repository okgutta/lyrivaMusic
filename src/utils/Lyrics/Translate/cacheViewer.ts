/**
 * 翻译缓存查看器 —— 移植自 Spicy Lyric Translator（SLT）的缓存 UI 设计。
 * 两个 Modal：缓存列表（统计 + 歌曲卡片 + Play/查看/删除）与逐曲查看（两列 contenteditable 编辑）。
 * 个人学习/私有使用（SLT Source-Available License 明确允许本地私有修改）。
 */
import { PopupModal } from "../../../components/Modal.ts";
import { openSettingsPanel } from "../../settings.ts";
import { SpotifyPlayer } from "../../../components/Global/SpotifyPlayer.ts";
import { clearTranslationCache, removeCachedTranslation, setCachedTranslation } from "./cache.ts";
import {
  clearAllTrackCache,
  deleteTrackCache,
  getAllCachedTracks,
  getTrackCache,
  getTrackCacheStats,
  normalizeTrackUri,
  updateTrackCacheLines,
} from "./trackCache.ts";
import { refreshCurrentTranslation } from "./index.ts";

// ─── 小工具 ──────────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDurationMs(ms: number | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 2 : 1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}

function formatTokenCount(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "";
  if (n < 1000) return `${n} tok`;
  if (n < 1000000) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k tok`;
  return `${(n / 1000000).toFixed(2)}M tok`;
}

function getTrackIdFromUri(uri: string): string {
  const parts = uri.split(":");
  return parts[parts.length - 1] || uri;
}

function providerLabel(api: string | undefined, model: string | undefined): string {
  const provider = api === "deepseek" ? "DeepSeek" : api || "—";
  return model ? `${provider} · ${model}` : provider;
}

async function playTrack(uri: string): Promise<boolean> {
  try {
    await Spicetify.Player.playUri(uri);
    return true;
  } catch {
    return false;
  }
}

// ─── 共享样式（SLT 移植） ─────────────────────────────────────────────────────

const VIEWER_STYLE = `
    .slt-cache-viewer {
        padding: 2px 2px 4px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
        max-width: 100%;
        max-height: 72vh;
        box-sizing: border-box;
        overflow: hidden;
        color: var(--spice-text);
    }
    .slt-cache-stats {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
        padding: 14px;
        background: rgba(255, 255, 255, 0.045);
        border-radius: 11px;
        border: 1px solid rgba(255, 255, 255, 0.14);
    }
    .slt-stat { display: flex; flex-direction: column; gap: 2px; }
    .slt-stat-label {
        font-size: 11px;
        color: var(--spice-subtext);
        text-transform: uppercase;
        line-height: 1.35;
    }
    .slt-stat-value {
        font-size: 18px;
        font-weight: 700;
        color: var(--spice-text);
        line-height: 1.25;
    }
    .slt-cache-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        overflow-y: auto;
        min-height: 160px;
        max-height: min(42vh, 420px);
        padding-right: 8px;
    }
    .slt-cache-item {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        padding: 12px 14px;
        background: rgba(255, 255, 255, 0.045);
        border-radius: 11px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        gap: 12px;
        min-width: 0;
    }
    .slt-cache-item-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
    }
    .slt-cache-item-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--spice-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.35;
    }
    .slt-cache-item-artist {
        font-size: 13px;
        color: var(--spice-subtext);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.35;
    }
    .slt-cache-item-meta {
        font-size: 12px;
        color: var(--spice-subtext);
        opacity: 0.78;
        line-height: 1.35;
        overflow-wrap: anywhere;
    }
    .slt-cache-item-provider {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        align-items: center;
        margin-top: 4px;
    }
    .slt-provider-chip {
        display: inline-flex;
        align-items: center;
        font-size: 11px;
        font-weight: 600;
        color: var(--spice-text);
        background: rgba(30, 215, 96, 0.14);
        border: 1px solid rgba(30, 215, 96, 0.28);
        border-radius: 999px;
        padding: 2px 8px;
        line-height: 1.4;
        white-space: nowrap;
    }
    .slt-metric-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        color: var(--spice-subtext);
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 999px;
        padding: 2px 8px;
        line-height: 1.4;
        white-space: nowrap;
    }
    .slt-cache-delete {
        min-height: 36px;
        padding: 8px 14px;
        border-radius: 999px;
        border: none;
        background: rgba(255, 90, 90, 0.14);
        border: 1px solid rgba(255, 90, 90, 0.32);
        color: #ff8a8a;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: opacity 0.2s, background 0.2s;
        flex-shrink: 0;
        white-space: nowrap;
    }
    .slt-cache-delete:hover { background: rgba(255, 90, 90, 0.26); }
    .slt-cache-item-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
    }
    .slt-cache-action {
        min-height: 36px;
        padding: 8px 14px;
        border-radius: 999px;
        border: none;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: opacity 0.2s, background 0.2s;
        color: var(--spice-text);
        background: rgba(255, 255, 255, 0.045);
        border: 1px solid rgba(255, 255, 255, 0.14);
        white-space: nowrap;
    }
    .slt-cache-action:hover { opacity: 0.85; }
    .slt-cache-delete-all {
        min-height: 40px;
        padding: 9px 18px;
        border-radius: 500px;
        border: none;
        background: rgba(255, 90, 90, 0.14);
        border: 1px solid rgba(255, 90, 90, 0.32);
        color: #ff8a8a;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.2s;
        white-space: normal;
        text-align: center;
    }
    .slt-cache-delete-all:hover { background: rgba(255, 90, 90, 0.26); }
    .slt-empty-cache {
        text-align: center;
        padding: 24px;
        color: var(--spice-subtext);
        font-size: 14px;
        background: rgba(255, 255, 255, 0.045);
        border-radius: 11px;
    }
    .slt-cache-actions {
        display: flex;
        justify-content: center;
        padding-top: 8px;
    }
    .slt-cache-toolbar { display: flex; justify-content: flex-end; }
    .slt-cache-back {
        min-height: 36px;
        padding: 8px 14px;
        border-radius: 500px;
        border: none;
        background: rgba(255, 255, 255, 0.045);
        border: 1px solid rgba(255, 255, 255, 0.14);
        color: var(--spice-text);
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
    }
    .slt-cache-back:hover { opacity: 0.85; }
    @media (max-width: 620px) {
        .slt-cache-viewer { width: min(100%, 90vw); padding: 16px; }
        .slt-cache-stats { grid-template-columns: 1fr; }
        .slt-cache-item { grid-template-columns: 1fr; align-items: stretch; }
        .slt-cache-item-actions { justify-content: flex-start; flex-wrap: wrap; }
    }
`;

const LYRICS_VIEWER_STYLE = `
    .slt-lyrics-viewer {
        width: min(760px, 90vw);
        max-width: 100%;
        max-height: 72vh;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 2px 2px 4px;
        box-sizing: border-box;
        overflow-x: hidden;
        overflow-y: hidden;
        color: var(--spice-text);
    }
    .slt-lyrics-header { font-size: 13px; color: var(--spice-subtext); overflow-wrap: anywhere; }
    .slt-lyrics-info {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 8px;
        padding: 12px 14px;
        background: rgba(255, 255, 255, 0.045);
        border-radius: 11px;
        border: 1px solid rgba(255, 255, 255, 0.14);
    }
    .slt-lyrics-info-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .slt-lyrics-info-label {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--spice-subtext);
        line-height: 1.3;
    }
    .slt-lyrics-info-value {
        font-size: 13px;
        font-weight: 600;
        color: var(--spice-text);
        line-height: 1.3;
        overflow-wrap: anywhere;
    }
    .slt-lyrics-toolbar {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
    }
    .slt-lyrics-copy {
        min-height: 36px;
        padding: 8px 14px;
        border-radius: 500px;
        border: none;
        background: var(--spice-button);
        color: var(--spice-text);
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: opacity 0.2s, background 0.2s;
        white-space: nowrap;
    }
    .slt-lyrics-copy:hover { opacity: 0.85; }
    .slt-lyrics-copy.slt-copied { background: #1db954; }
    .slt-lyrics-back {
        min-height: 36px;
        padding: 8px 14px;
        border-radius: 500px;
        border: none;
        background: rgba(255, 255, 255, 0.045);
        border: 1px solid rgba(255, 255, 255, 0.14);
        color: var(--spice-text);
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
    }
    .slt-lyrics-back:hover { opacity: 0.85; }
    .slt-lyrics-grid {
        display: flex;
        flex-direction: column;
        gap: 1px;
        background: rgba(255, 255, 255, 0.04);
        border-radius: 11px;
        overflow-y: auto;
        overflow-x: hidden;
        max-height: min(54vh, 560px);
        border: 1px solid rgba(255, 255, 255, 0.14);
    }
    #slt-lyrics-rows { display: flex; flex-direction: column; gap: 1px; }
    .slt-lyrics-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 1px;
    }
    .slt-lyrics-col {
        padding: 10px 12px;
        background: rgba(255, 255, 255, 0.045);
        color: var(--spice-text);
        font-size: 13px;
        line-height: 1.4;
        white-space: pre-wrap;
        word-break: break-word;
        overflow-wrap: anywhere;
        min-width: 0;
    }
    .slt-lyrics-head {
        font-size: 11px;
        text-transform: uppercase;
        color: var(--spice-subtext);
        font-weight: 700;
    }
    .slt-lyrics-col-editable {
        min-height: 19px;
        padding: 2px 6px;
        margin: -2px -6px;
        border-radius: 4px;
        border: 1px solid transparent;
        cursor: text;
        transition: background 0.15s, border-color 0.15s;
    }
    .slt-lyrics-col-editable:hover {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.14);
    }
    .slt-lyrics-col-editable:focus {
        outline: none;
        background: rgba(255, 255, 255, 0.08);
        border-color: #1db954;
    }
    .slt-lyrics-col-editable.slt-line-dirty { border-color: rgba(29, 185, 84, 0.55); }
    .slt-lyrics-save[disabled] { opacity: 0.4; cursor: default; }
    .slt-lyrics-edit-hint {
        font-size: 11px;
        color: var(--spice-subtext);
        align-self: center;
        margin-right: auto;
    }
    @media (max-width: 620px) {
        .slt-lyrics-viewer { width: min(100%, 90vw); padding: 16px; }
        .slt-lyrics-toolbar { justify-content: flex-start; }
        .slt-lyrics-row { grid-template-columns: 1fr; }
    }
`;

// ─── 缓存列表 Modal（SLT createCacheViewerUI 移植） ─────────────────────────

function createCacheViewerUI(): HTMLElement {
  const stats = getTrackCacheStats();
  const cachedTracks = getAllCachedTracks();

  const container = document.createElement("div");
  container.className = "slt-cache-viewer";
  container.innerHTML = `
    <style>${VIEWER_STYLE}</style>
    <div class="slt-cache-toolbar">
        <button id="slt-cache-back-to-settings" class="slt-cache-back" type="button">&lt; 返回设置</button>
    </div>

    <div class="slt-cache-stats">
        <div class="slt-stat">
            <span class="slt-stat-label">已缓存歌曲</span>
            <span class="slt-stat-value" id="slt-stat-tracks">${stats.trackCount}</span>
        </div>
        <div class="slt-stat">
            <span class="slt-stat-label">总行数</span>
            <span class="slt-stat-value" id="slt-stat-lines">${stats.totalLines}</span>
        </div>
        <div class="slt-stat">
            <span class="slt-stat-label">占用空间</span>
            <span class="slt-stat-value" id="slt-stat-size">${formatBytes(stats.sizeBytes)}</span>
        </div>
        <div class="slt-stat">
            <span class="slt-stat-label">最旧记录</span>
            <span class="slt-stat-value">${stats.oldestTimestamp ? formatDate(stats.oldestTimestamp) : "—"}</span>
        </div>
    </div>

    <div class="slt-cache-list" id="slt-cache-list">
        ${
          cachedTracks.length === 0
            ? '<div class="slt-empty-cache">还没有翻译缓存 —— 播放并翻译过的歌曲会出现在这里</div>'
            : cachedTracks
                .sort((a, b) => b.timestamp - a.timestamp)
                .map((track, index) => {
                  const displayTitle =
                    track.trackName || `Track ID: ${getTrackIdFromUri(track.trackUri)}`;
                  const providerBadge = providerLabel(track.api, track.metrics?.model);
                  const metricsPills: string[] = [];
                  if (track.metrics?.durationMs) {
                    metricsPills.push(
                      `<span class="slt-metric-pill" title="翻译耗时">⏱ ${formatDurationMs(track.metrics.durationMs)}</span>`
                    );
                  }
                  if (track.metrics?.totalTokens) {
                    metricsPills.push(
                      `<span class="slt-metric-pill" title="总 token（输入 + 输出）">⌁ ${formatTokenCount(track.metrics.totalTokens)}</span>`
                    );
                  }
                  if (track.metrics?.apiCalls && track.metrics.apiCalls > 1) {
                    metricsPills.push(
                      `<span class="slt-metric-pill" title="API 调用次数">↻ ${track.metrics.apiCalls}</span>`
                    );
                  }
                  return `
                    <div class="slt-cache-item" data-uri="${escapeHtml(track.trackUri)}" data-lang="${escapeHtml(track.targetLang)}">
                        <div class="slt-cache-item-info">
                            <span class="slt-cache-item-title">${escapeHtml(displayTitle)}</span>
                            ${track.artistName ? `<span class="slt-cache-item-artist">${escapeHtml(track.artistName)}</span>` : ""}
                            <span class="slt-cache-item-meta">${escapeHtml(track.lang)} → ${escapeHtml(track.targetLang)} · ${track.lineCount} 行 · ${formatDate(track.timestamp)}</span>
                            <span class="slt-cache-item-provider"><span class="slt-provider-chip">${escapeHtml(providerBadge)}</span>${metricsPills.join("")}</span>
                        </div>
                        <div class="slt-cache-item-actions">
                            <button class="slt-cache-action slt-cache-play" data-index="${index}">播放</button>
                            <button class="slt-cache-action slt-cache-view-lyrics" data-index="${index}">查看歌词</button>
                            <button class="slt-cache-delete" data-index="${index}">删除</button>
                        </div>
                    </div>
                  `;
                })
                .join("")
        }
    </div>

    ${
      cachedTracks.length > 0
        ? `<div class="slt-cache-actions">
            <button class="slt-cache-delete-all" id="slt-delete-all-cache">删除全部翻译缓存</button>
        </div>`
        : ""
    }
  `;

  const refreshStats = (): void => {
    const newStats = getTrackCacheStats();
    const tracksEl = container.querySelector("#slt-stat-tracks");
    const linesEl = container.querySelector("#slt-stat-lines");
    const sizeEl = container.querySelector("#slt-stat-size");
    if (tracksEl) tracksEl.textContent = String(newStats.trackCount);
    if (linesEl) linesEl.textContent = String(newStats.totalLines);
    if (sizeEl) sizeEl.textContent = formatBytes(newStats.sizeBytes);
  };

  const backBtn = container.querySelector("#slt-cache-back-to-settings");
  backBtn?.addEventListener("click", () => openSettingsPanel());

  container.querySelectorAll(".slt-cache-play").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const item = (e.currentTarget as HTMLElement).closest(".slt-cache-item") as HTMLElement;
      const uri = item?.dataset.uri;
      if (!uri) return;
      const button = e.currentTarget as HTMLButtonElement;
      const previousText = button.textContent;
      button.disabled = true;
      button.textContent = "打开中…";
      try {
        const played = await playTrack(uri);
        try {
          Spicetify.showNotification(played ? "正在播放缓存的歌曲" : "无法直接播放该歌曲", !played);
        } catch {
          /* ignore */
        }
      } finally {
        button.disabled = false;
        button.textContent = previousText || "播放";
      }
    });
  });

  container.querySelectorAll(".slt-cache-view-lyrics").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const item = (e.currentTarget as HTMLElement).closest(".slt-cache-item") as HTMLElement;
      const uri = item?.dataset.uri;
      const lang = item?.dataset.lang;
      if (uri && lang) openCachedLyricsViewer(uri, lang);
    });
  });

  container.querySelectorAll(".slt-cache-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const item = (e.target as HTMLElement).closest(".slt-cache-item") as HTMLElement;
      if (!item) return;
      const uri = item.dataset.uri;
      const lang = item.dataset.lang;
      if (!uri) return;
      deleteTrackCache(uri, lang);
      item.remove();
      refreshStats();
      const list = container.querySelector("#slt-cache-list");
      if (list && list.querySelectorAll(".slt-cache-item").length === 0) {
        list.innerHTML =
          '<div class="slt-empty-cache">还没有翻译缓存 —— 播放并翻译过的歌曲会出现在这里</div>';
        container.querySelector(".slt-cache-actions")?.remove();
      }
    });
  });

  const deleteAllBtn = container.querySelector("#slt-delete-all-cache");
  deleteAllBtn?.addEventListener("click", () => {
    clearTranslationCache();
    clearAllTrackCache();
    refreshStats();
    const list = container.querySelector("#slt-cache-list");
    if (list)
      list.innerHTML =
        '<div class="slt-empty-cache">还没有翻译缓存 —— 播放并翻译过的歌曲会出现在这里</div>';
    container.querySelector(".slt-cache-actions")?.remove();
    try {
      Spicetify.showNotification("已清空全部翻译缓存");
    } catch {
      /* ignore */
    }
  });

  return container;
}

// ─── 逐曲查看 Modal（SLT openCachedLyricsViewer 移植） ───────────────────────

function renderInfoCell(label: string, value: string, title?: string): string {
  return `<div class="slt-lyrics-info-cell"${title ? ` title="${escapeHtml(title)}"` : ""}>
        <span class="slt-lyrics-info-label">${escapeHtml(label)}</span>
        <span class="slt-lyrics-info-value">${escapeHtml(value)}</span>
    </div>`;
}

function openCachedLyricsViewer(trackUri: string, targetLang: string): void {
  const trackCache = getTrackCache(trackUri, targetLang);
  if (!trackCache) {
    try {
      Spicetify.showNotification("无法加载该歌曲的翻译缓存", true);
    } catch {
      /* ignore */
    }
    return;
  }
  const translatedLines = trackCache.lines || [];
  const sourceLines = trackCache.sourceLines || [];
  const metrics = trackCache.metrics;
  const providerLabelText = providerLabel(trackCache.api, metrics?.model);
  const sourceLang = trackCache.lang || "auto";

  const renderRows = (): string => {
    const maxLines = Math.max(sourceLines.length, translatedLines.length);
    return Array.from({ length: maxLines })
      .map((_, idx) => {
        const sourceText = escapeHtml(sourceLines[idx] ?? "");
        const translatedText = escapeHtml(translatedLines[idx] ?? "");
        return `
            <div class="slt-lyrics-row">
                <div class="slt-lyrics-col">${sourceText || "&nbsp;"}</div>
                <div class="slt-lyrics-col slt-lyrics-col-editable" contenteditable="plaintext-only" spellcheck="false" data-line-index="${idx}" role="textbox" aria-label="译文第 ${idx + 1} 行">${translatedText}</div>
            </div>
        `;
      })
      .join("");
  };

  const content = document.createElement("div");
  content.className = "slt-lyrics-viewer";
  content.innerHTML = `
    <style>${LYRICS_VIEWER_STYLE}</style>
    <div class="slt-lyrics-toolbar">
        <span class="slt-lyrics-edit-hint">点击译文可直接编辑</span>
        <button id="slt-lyrics-save" class="slt-lyrics-copy slt-lyrics-save" type="button" disabled>保存修改</button>
        <button id="slt-lyrics-copy-all" class="slt-lyrics-copy" type="button">复制歌词</button>
        <button id="slt-lyrics-back-to-cache" class="slt-lyrics-back" type="button">&lt; 返回缓存列表</button>
    </div>
    <div class="slt-lyrics-info">
        ${renderInfoCell("翻译服务", providerLabelText)}
        ${renderInfoCell("方向", `${sourceLang.toUpperCase()} → ${targetLang.toUpperCase()}`)}
        ${renderInfoCell("行数", String(translatedLines.length))}
        ${renderInfoCell("耗时", formatDurationMs(metrics?.durationMs) || "—", metrics?.apiCalls ? `${metrics.apiCalls} 次 API 调用` : undefined)}
        ${renderInfoCell("Token（输入/输出）", metrics?.totalTokens ? `${formatTokenCount(metrics.inputTokens)} / ${formatTokenCount(metrics.outputTokens)}` : "—", metrics?.totalTokens ? `总 ${formatTokenCount(metrics.totalTokens)} token` : undefined)}
        ${renderInfoCell("缓存时间", formatDate(trackCache.timestamp))}
    </div>
    <div class="slt-lyrics-header">Track ID: ${escapeHtml(getTrackIdFromUri(trackUri))}${trackCache.edited ? " · 已手动编辑" : ""}</div>
    <div class="slt-lyrics-grid">
        <div class="slt-lyrics-row">
            <div class="slt-lyrics-col slt-lyrics-head">${escapeHtml(sourceLang.toUpperCase())}（原文）</div>
            <div class="slt-lyrics-col slt-lyrics-head">${escapeHtml(targetLang.toUpperCase())}（译文）</div>
        </div>
        <div id="slt-lyrics-rows">${renderRows()}</div>
    </div>
  `;

  PopupModal.display({
    title: "缓存歌词查看",
    content,
    isLarge: true,
  });

  const backBtn = content.querySelector("#slt-lyrics-back-to-cache");
  backBtn?.addEventListener("click", () => openTranslationCacheViewer());

  const copyBtn = content.querySelector("#slt-lyrics-copy-all") as HTMLButtonElement | null;
  copyBtn?.addEventListener("click", async () => {
    const rows = content.querySelectorAll("#slt-lyrics-rows .slt-lyrics-row");
    const lines: string[] = [];
    const trackTitle = trackCache.trackName || `Track ID: ${getTrackIdFromUri(trackUri)}`;
    const trackArtist = trackCache.artistName || "";
    lines.push(`${trackTitle}${trackArtist ? " - " + trackArtist : ""}`);
    lines.push(`${sourceLang.toUpperCase()} -> ${targetLang.toUpperCase()}`);
    lines.push("-".repeat(40));
    rows.forEach((row) => {
      const cols = row.querySelectorAll(".slt-lyrics-col");
      if (cols.length >= 2) {
        const src = (cols[0].textContent || "").trim();
        const tgt = (cols[1].textContent || "").trim();
        if (src || tgt) {
          lines.push(src || "");
          if (tgt && tgt !== src) lines.push(`  -> ${tgt}`);
          lines.push("");
        }
      }
    });
    lines.push("-".repeat(40));
    lines.push("Exported from lyrivaMusic");
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      if (copyBtn) {
        copyBtn.textContent = "已复制!";
        copyBtn.classList.add("slt-copied");
        setTimeout(() => {
          copyBtn.textContent = "复制歌词";
          copyBtn.classList.remove("slt-copied");
        }, 2000);
      }
    } catch {
      if (copyBtn) {
        copyBtn.textContent = "复制失败";
        setTimeout(() => {
          copyBtn.textContent = "复制歌词";
        }, 2000);
      }
    }
  });

  const saveBtn = content.querySelector("#slt-lyrics-save") as HTMLButtonElement | null;

  content.querySelectorAll(".slt-lyrics-col-editable").forEach((node) => {
    const cell = node as HTMLElement;
    cell.addEventListener("input", () => {
      cell.classList.add("slt-line-dirty");
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = "保存修改";
        saveBtn.classList.remove("slt-copied");
      }
    });
    cell.addEventListener("keydown", (event) => {
      const keyEvent = event as KeyboardEvent;
      if (keyEvent.key === "Enter" && !keyEvent.shiftKey) {
        keyEvent.preventDefault();
        cell.blur();
      }
    });
  });

  saveBtn?.addEventListener("click", () => {
    const cells = Array.from(content.querySelectorAll(".slt-lyrics-col-editable")) as HTMLElement[];
    const editedLines = cells
      .sort((a, b) => Number(a.dataset.lineIndex || 0) - Number(b.dataset.lineIndex || 0))
      .map((cell) => (cell.textContent || "").replace(/\s+/g, " ").trim());

    while (editedLines.length > 0 && !editedLines[editedLines.length - 1]) editedLines.pop();

    if (editedLines.length === 0) {
      saveBtn.textContent = "没有可保存的内容";
      setTimeout(() => {
        saveBtn.textContent = "保存修改";
      }, 2000);
      return;
    }

    const saved = updateTrackCacheLines(trackUri, targetLang, editedLines);
    if (!saved) {
      saveBtn.textContent = "保存失败";
      setTimeout(() => {
        saveBtn.textContent = "保存修改";
      }, 2500);
      return;
    }

    // 同步行级缓存，保证与曲目缓存一致；被清空的行同步失效旧行缓存，
    // 否则翻译其他含相同源行的歌时仍命中旧译文
    editedLines.forEach((text, i) => {
      const src = sourceLines[i];
      if (!src) return;
      if (text.trim()) setCachedTranslation(src, targetLang, text);
      else removeCachedTranslation(src, targetLang);
    });

    translatedLines.length = 0;
    translatedLines.push(...editedLines);

    saveBtn.disabled = true;
    saveBtn.textContent = "已保存!";
    saveBtn.classList.add("slt-copied");
    content
      .querySelectorAll(".slt-line-dirty")
      .forEach((el) => el.classList.remove("slt-line-dirty"));
    setTimeout(() => {
      saveBtn.textContent = "保存修改";
      saveBtn.classList.remove("slt-copied");
    }, 2000);

    // 编辑的是当前播放歌曲 → 立即重新应用（命中曲目缓存，秒生效）
    if (normalizeTrackUri(SpotifyPlayer.GetUri() ?? "") === normalizeTrackUri(trackUri)) {
      refreshCurrentTranslation();
    }
  });
}

// ─── 入口 ────────────────────────────────────────────────────────────────────

export function openTranslationCacheViewer(): void {
  PopupModal.display({
    title: "翻译缓存",
    content: createCacheViewerUI(),
    isLarge: true,
  });
}
