// deno-lint-ignore-file no-explicit-any

import { $currentLyricsData, $currentLyricsType } from "../../stores.ts";
import { ClearScrollSimplebar } from "../../Scrolling/Simplebar/ScrollSimplebar.ts";
import { setBlurringLastLine } from "../Animator/Lyrics/LyricsAnimator.ts";
import { DestroyAllLyricsContainers } from "../Applyer/CreateLyricsContainer.ts";
import { EmitApply, EmitNotApplyed } from "../Applyer/OnApply.ts";
import { ApplyStaticLyrics, type StaticLyricsData } from "../Applyer/Static.ts";
import { ApplyLineLyrics } from "../Applyer/Synced/Line.ts";
import { ApplySyllableLyrics } from "../Applyer/Synced/Syllable.ts";
import { ClearLyricsPageContainer } from "../fetchLyrics.ts";
import { ClearLyricsContentArrays, isRomanized } from "../lyrics.ts";
import { afterLyricsApply } from "../Translate/index.ts";
import { PageContainer } from "../../../components/Pages/PageView.ts";
import { CleanUpIsByCommunity } from "../Applyer/Credits/ApplyIsByCommunity.tsx";
import { IsCompactMode } from "../../../components/Utils/CompactMode.ts";
import Fullscreen from "../../../components/Utils/Fullscreen.ts";
import { SpotifyPlayer } from "../../../components/Global/SpotifyPlayer.ts";
import type { LyricsPayload } from "../matcher.ts";

/**
 * Union type for all lyrics data types
 */
export type LyricsData = LyricsPayload;

let currentAbortController: AbortController | null = null;

export const cleanupApplyLyricsAbortController = () => {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
};

/**
 * Apply lyrics based on their type
 * @param lyrics - The lyrics data to apply
 */
export default async function ApplyLyrics(
  lyricsContent: [object | string, number] | null
): Promise<void> {
  if (!PageContainer) return;
  setBlurringLastLine(null);
  if (!lyricsContent) return;

  cleanupApplyLyricsAbortController();

  EmitNotApplyed();

  DestroyAllLyricsContainers();

  ClearLyricsContentArrays();
  ClearScrollSimplebar();
  ClearLyricsPageContainer();

  CleanUpIsByCommunity();

  const [descriptor, _status] = lyricsContent;

  let noticeContent: string | null = null;

  switch (descriptor) {
    case "lyrics-not-found": {
      noticeContent = `我们没有这首歌的歌词`;
      break;
    }
    case "dj": {
      noticeContent = `使用 DJ 模式时无法查看歌词`;
      break;
    }
    case "unknown-track": {
      noticeContent = `无法获取这首歌的信息`;
      break;
    }
    case "unknown-error": {
      noticeContent = `发生未知错误`;
      break;
    }
    case "offline": {
      noticeContent = `请联网后再享受歌词体验！`;
      break;
    }
    case "status-not-200": {
      noticeContent = `服务器出错`;
      break;
    }
    case "video-track": {
      noticeContent = `暂不支持视频歌词`;
      break;
    }
    case "episode-track": {
      noticeContent = `暂不支持播客单集歌词`;
      break;
    }
    case "mixed-track": {
      noticeContent = `暂不支持视频播客单集歌词`;
      break;
    }
    case "local-track": {
      noticeContent = `本地文件不支持歌词`;
      break;
    }
    default:
      break;
  }

  if (noticeContent) {
    $currentLyricsType.set("None");

    if (descriptor === "lyrics-not-found") {
      const uri = SpotifyPlayer.GetUri() ?? "";
      $currentLyricsData.set(`NO_LYRICS:${uri}`);
    } else {
      $currentLyricsData.set("");
    }

    const lyricsContainer = PageContainer.querySelector<HTMLElement>(
      ".LyricsContainer .LyricsContent"
    );

    if (!lyricsContainer) return;

    if (!currentAbortController || currentAbortController.signal.aborted) {
      currentAbortController = new AbortController();
    }

    const currentNoticeElement = document.createElement("div");
    currentNoticeElement.classList.add("LyricsNotice");
    lyricsContainer.appendChild(currentNoticeElement);

    if (
      !IsCompactMode() &&
      (Fullscreen.IsOpen || Fullscreen.CinemaViewOpen) &&
      (descriptor === "lyrics-not-found" || descriptor === "local-track")
    ) {
      PageContainer?.querySelector<HTMLElement>(".ContentBox .LyricsContainer")?.classList.add(
        "Hidden"
      );
      PageContainer?.querySelector<HTMLElement>(".ContentBox")?.classList.add("LyricsHidden");
    }

    currentNoticeElement.innerHTML = `
      <p class="notice-descriptor">${noticeContent.trim()}</p>
    `;

    EmitApply("None", null);
    return;
  }

  const lyrics = descriptor as LyricsData;

  const romanize = isRomanized;

  if (lyrics.Type === "Syllable") {
    ApplySyllableLyrics(lyrics as any, romanize);
  } else if (lyrics.Type === "Line") {
    ApplyLineLyrics(lyrics as any, romanize);
  } else if (lyrics.Type === "Static") {
    // Type assertion to StaticLyricsData since we've verified the Type is "Static"
    ApplyStaticLyrics(lyrics as StaticLyricsData, romanize);
  }

  // 翻译钩子：翻译开启时后台翻译，完成后重新渲染
  afterLyricsApply(SpotifyPlayer.GetUri() ?? "", lyrics);
}
