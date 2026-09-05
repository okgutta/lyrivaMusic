import { SpotifyPlayer } from "../components/Global/SpotifyPlayer.ts";
import PageView from "../components/Pages/PageView.ts";
import { toast } from "sonner";
import fetchLyrics, { LyricsStore } from "./Lyrics/fetchLyrics.ts";
import ApplyLyrics from "./Lyrics/Global/Applyer.ts";
import { $currentLyricsData } from "./stores.ts";

export const RemoveCurrentLyrics_AllCaches = async (quiet: boolean = false) => {
  const currentSongId = SpotifyPlayer.GetId();
  if (!currentSongId || currentSongId === undefined) {
    if (!quiet) toast.error(`无法获取当前歌曲的 ID`);
    return;
  }
  try {
    await LyricsStore.RemoveItem(currentSongId);
    $currentLyricsData.set("");
    if (!quiet) toast.success(`当前歌曲的歌词已从所有缓存中移除`);
    if (PageView.IsOpened) {
      const uri = SpotifyPlayer.GetUri();
      if (uri && uri !== undefined) {
        void fetchLyrics(uri)
          .then(ApplyLyrics)
          .catch((error) => console.error("SpicyLyrics: failed to reload lyrics", error));
      }
    }
  } catch (error) {
    if (!quiet) toast.error(`当前歌曲的歌词无法从所有缓存中移除。请查看控制台获取更多信息。`);
    console.error("SpicyLyrics:", error);
  }
};

export const RemoveLyricsCache = async (quiet: boolean = false) => {
  try {
    await LyricsStore.Destroy();
    if (!quiet) toast.success("歌词缓存已成功清除");
    if (PageView.IsOpened) {
      const uri = SpotifyPlayer.GetUri();
      if (uri && uri !== undefined) {
        void fetchLyrics(uri)
          .then(ApplyLyrics)
          .catch((error) => console.error("SpicyLyrics: failed to reload lyrics", error));
      }
    }
  } catch (error) {
    if (!quiet) toast.error(`歌词缓存无法清除。请查看控制台获取更多信息。`);
    console.error("SpicyLyrics:", error);
  }
};

export const RemoveCurrentLyrics_StateCache = (quiet: boolean = false) => {
  try {
    $currentLyricsData.set("");
    if (!quiet) toast.success("当前歌曲的歌词已成功从内部状态中移除");
    if (PageView.IsOpened) {
      const uri = SpotifyPlayer.GetUri();
      if (uri && uri !== undefined) {
        void fetchLyrics(uri)
          .then(ApplyLyrics)
          .catch((error) => console.error("SpicyLyrics: failed to reload lyrics", error));
      }
    }
  } catch (error) {
    if (!quiet) toast.error(`当前歌曲的歌词无法从内部状态中移除。请查看控制台获取更多信息。`);
    console.error("SpicyLyrics:", error);
  }
};
