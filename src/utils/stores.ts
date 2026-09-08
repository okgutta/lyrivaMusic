import { atom } from "nanostores";
import { makePersistAtom, migrateKeys } from "./persist.ts";
import { ProjectVersion } from "../../project/config.ts";

export const SETTINGS_KEY = "SL:settings";

function readSettingsBlob(): Record<string, any> {
  const raw = Spicetify.LocalStorage.get(SETTINGS_KEY);
  if (raw === null || raw === undefined) return {};
  try {
    const parsed = JSON.parse(raw);
    // 损坏数据（null/数组/字符串）不能直接当对象用——migrateKeys 里
    // 的 key 赋值会抛或静默失败，导致扩展启动崩溃
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveSettingsBlob(obj: Record<string, any>) {
  Spicetify.LocalStorage.set(SETTINGS_KEY, JSON.stringify(obj));
}

const _settings: Record<string, any> = migrateKeys(
  readSettingsBlob(),
  {
    "skip-spicy-font": "skipSpicyFont",
    show_npv_dynamic_bg: "showNpvDynamicBg",
  },
  saveSettingsBlob
);

/**
 * An atom backed by the settings blob. Exported so feature modules (e.g.
 * `experiments.ts`) can register their own persisted settings without having to
 * add a line here for every one.
 */
export const persistAtom = makePersistAtom(() => _settings, saveSettingsBlob);

// Setting atoms (persisted)
export const $staticBackgroundMode = persistAtom<string>("staticBackgroundMode", "off");
// Blur radius (px) applied to image-based static backgrounds — not the "color" mode.
export const $staticBackgroundBlur = persistAtom<number>("staticBackgroundBlur", 0);
export const $simpleLyricsMode = persistAtom<boolean>("simpleLyricsMode", false);
export const $simpleLyricsModeRenderingType = persistAtom<string>(
  "simpleLyricsModeRenderingType",
  "calculate"
);
export const $minimalLyricsMode = persistAtom<boolean>("minimalLyricsMode", false);
// Tinted box drawn behind a lyrics line while the pointer is over it.
export const $lineHoverBackground = persistAtom<boolean>("lineHoverBackground", true);
export const $skipSpicyFont = persistAtom<boolean>("skipSpicyFont", false);
export const $showNpvDynamicBg = persistAtom<boolean>("showNpvDynamicBg", true);
// Never inject the lyrics card into the Now Playing sidebar at all.
export const $disableNpvLyrics = persistAtom<boolean>("disableNpvLyrics", false);
// Pull the whole NPV lyrics card out of the sidebar while the current track has
// no lyrics, instead of leaving it up showing the "no lyrics" notice.
export const $hideNpvLyricsWhenUnavailable = persistAtom<boolean>(
  "hideNpvLyricsWhenUnavailable",
  true
);
export const $lockedMediaBox = persistAtom<boolean>("lockedMediaBox", false);
// $popupLyricsAllowed: stored as actual boolean "popupLyricsAllowed" in the settings blob.
export const $popupLyricsAllowed = (() => {
  const initial: boolean =
    _settings["popupLyricsAllowed"] !== undefined ? _settings["popupLyricsAllowed"] : true;
  const store = atom<boolean>(initial);
  store.listen((v) => {
    _settings["popupLyricsAllowed"] = v;
    saveSettingsBlob(_settings);
  });
  return store;
})();
export const $viewControlsPosition = persistAtom<string>("viewControlsPosition", "Top");
export const $ttmlMakerMode = persistAtom<boolean>("ttmlMakerMode", true);
export const $developerMode = persistAtom<boolean>("developerMode", false);
export const $timelineOutsideMediaContent = persistAtom<boolean>(
  "timelineOutsideMediaContent",
  true
);
// Volume band below the playback controls in Fullscreen / Cinema View / Popup Lyrics.
export const $showVolumeSlider = persistAtom<boolean>("showVolumeSlider", true);
// Playback timing offset in milliseconds (bipolar: negative = earlier, positive = later)
export const $playbackOffset = persistAtom<number>("playbackOffset", 0);
// 歌词翻译服务（已有译文自动显示，缺失译文只在歌词页按需翻译）
export const $translationProvider = persistAtom<"google" | "deepseek" | "openai" | "custom">(
  "translationProvider",
  "deepseek"
);
// 翻译目标语言（zh-CN / en / ja / …）
export const $translationTargetLang = persistAtom<string>("translationTargetLang", "zh-CN");
// DeepSeek API Key（本地明文存储于设置）
export const $deepSeekApiKey = persistAtom<string>("deepSeekApiKey", "");
// DeepSeek 模型（deepseek-chat / deepseek-reasoner）
export const $deepSeekModel = persistAtom<string>("deepSeekModel", "deepseek-chat");
// DeepSeek 可用模型列表（运行时从 API 拉取，含默认兜底）与拉取状态
export const $deepSeekModels = atom<string[]>(["deepseek-chat", "deepseek-reasoner"]);
export const $deepSeekModelsLoading = atom<boolean>(false);
export const $deepSeekModelsError = atom<string | null>(null);
// ChatGPT（OpenAI 官方 API）
export const $openaiApiKey = persistAtom<string>("openaiApiKey", "");
export const $openaiModel = persistAtom<string>("openaiModel", "gpt-4o-mini");
// 自定义 OpenAI 兼容 API（任意 baseUrl + Key + 模型）
export const $customApiBaseUrl = persistAtom<string>("customApiBaseUrl", "");
export const $customApiKey = persistAtom<string>("customApiKey", "");
export const $customApiModel = persistAtom<string>("customApiModel", "");
// Genius API Access Token（用户自填；不再硬编码进客户端 JS）
export const $geniusApiToken = persistAtom<string>("geniusApiToken", "");

// Version atom — NOT persisted, set once at startup
export const $spicyLyricsVersion = atom<string>(
  (window as any)._spicy_lyrics_metadata?.LoadedVersion ?? ProjectVersion
);

// Runtime (ephemeral) atoms
export const $currentLyricsType = atom<string>("None");
export const $lyricsContainerExists = atom<boolean>(false);
export const $currentlyFetching = atom<boolean>(false);
export const $currentLyricsData = atom<string>("");
