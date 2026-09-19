import { SpotifyPlayer } from "../components/Global/SpotifyPlayer.ts";
import PageView, { PageContainer } from "../components/Pages/PageView.ts";
import { notify } from "./notify.ts";
import fetchLyrics, { clearLyricsCacheForTrack, LyricsStore } from "./Lyrics/fetchLyrics.ts";
import ApplyLyrics from "./Lyrics/Global/Applyer.ts";
import { $currentLyricsData } from "./stores.ts";

export const RemoveCurrentLyrics_AllCaches = async (quiet: boolean = false) => {
  const uri = SpotifyPlayer.GetUri();
  if (!uri || !/^spotify:track:[^:]+$/.test(uri)) {
    if (!quiet) notify("无法获取当前歌曲的 ID", true);
    return;
  }
  try {
    const page = PageContainer;
    if (PageView.IsOpened && page) {
      const result = await fetchLyrics(uri, { forceRefresh: true });
      if (PageView.IsOpened && PageContainer === page && SpotifyPlayer.GetUri() === uri) {
        await ApplyLyrics(result);
      }
    } else {
      await clearLyricsCacheForTrack(uri);
    }
    if (!quiet) notify("已清除当前歌曲缓存");
  } catch (error) {
    if (!quiet) notify("无法清除当前歌曲缓存，请稍后重试", true);
    console.error("SpicyLyrics:", error);
  }
};

export const RemoveLyricsCache = async (quiet: boolean = false) => {
  try {
    await LyricsStore.Destroy();
    if (!quiet) notify("已清除全部歌词缓存");
    if (PageView.IsOpened) {
      const uri = SpotifyPlayer.GetUri();
      if (uri && uri !== undefined) {
        void fetchLyrics(uri)
          .then(ApplyLyrics)
          .catch((error) => console.error("SpicyLyrics: failed to reload lyrics", error));
      }
    }
  } catch (error) {
    if (!quiet) notify("无法清除歌词缓存，请稍后重试", true);
    console.error("SpicyLyrics:", error);
  }
};

export const RemoveCurrentLyrics_StateCache = (quiet: boolean = false) => {
  try {
    $currentLyricsData.set("");
    if (!quiet) notify("已清除当前歌曲的临时歌词");
    if (PageView.IsOpened) {
      const uri = SpotifyPlayer.GetUri();
      if (uri && uri !== undefined) {
        void fetchLyrics(uri)
          .then(ApplyLyrics)
          .catch((error) => console.error("SpicyLyrics: failed to reload lyrics", error));
      }
    }
  } catch (error) {
    if (!quiet) notify("无法清除当前歌曲的临时歌词，请稍后重试", true);
    console.error("SpicyLyrics:", error);
  }
};
