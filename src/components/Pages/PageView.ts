import fetchLyrics, { cancelLyricsFetch } from "../../utils/Lyrics/fetchLyrics.ts";
import { $forceCompactMode } from "../../utils/uiState.ts";
import "../../css/Loaders/DotLoader.css";
import { DestroyAllLyricsContainers } from "../../utils/Lyrics/Applyer/CreateLyricsContainer.ts";
import ApplyLyrics from "../../utils/Lyrics/Global/Applyer.ts";
import {
  addLinesEvListener,
  isRomanized,
  removeLinesEvListener,
  setRomanizedStatus,
} from "../../utils/Lyrics/lyrics.ts";
import {
  CleanupScrollEvents,
  InitializeScrollEvents,
  ResetLastLine,
} from "../../utils/Scrolling/ScrollToActiveLine.ts";
import { ScrollSimplebar } from "../../utils/Scrolling/Simplebar/ScrollSimplebar.ts";
import ApplyDynamicBackground, { KawarpMap } from "../DynamicBG/dynamicBackground.ts";
import {
  $currentLyricsData,
  $lineHoverBackground,
  $lyricsContainerExists,
  $minimalLyricsMode,
  $showVolumeSlider,
  $simpleLyricsMode,
  $skipSpicyFont,
  $ttmlMakerMode,
  $viewControlsPosition,
} from "../../utils/stores.ts";
import Global from "../Global/Global.ts";
import Session from "../Global/Session.ts";
import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import { Icons } from "../Styling/Icons.ts";
import { DisableCompactMode, EnableCompactMode, IsCompactMode } from "../Utils/CompactMode.ts";
import Fullscreen, {
  EnterSpicyLyricsFullscreen,
  ExitFullscreenElement,
} from "../Utils/Fullscreen.ts";
import {
  NowBarObj,
  NowBar_SwapSides,
  Session_NowBar_SetSide,
  Session_OpenNowBar,
  ToggleNowBar,
  OpenNowBar,
} from "../Utils/NowBar.ts";
import TransferElement from "../Utils/TransferElement.ts";
import { IsPIP, _IsPIP_after, ClosePopupLyrics } from "../Utils/PopupLyrics.ts";
import { NPVCardOwnsPage, DeRenderNPVCard } from "../Utils/NPVLyrics.ts";
import { CleanUpIsByCommunity } from "../../utils/Lyrics/Applyer/Credits/ApplyIsByCommunity.tsx";
import { openSettingsPanel } from "../../utils/settings.ts";
import Logger from "../../utils/Logger.ts";
import { ApplyExperimentClasses, onExperimentChange } from "../../utils/experiments.ts";
import { triggerRemeasureLV } from "../../utils/Lyrics/LyricsVirtualizer.ts";
import {
  $translationState,
  requestTranslationToggle,
  type TranslationState,
} from "../../utils/Lyrics/Translate/state.ts";

const pageLogger = new Logger("Page View");
const controlsLogger = new Logger("View Controls");

interface TippyInstance {
  destroy: () => void;
  [key: string]: any;
}

export const Tooltips: {
  Close: TippyInstance | null;
  CompactMode: TippyInstance | null;
  Romanization: TippyInstance | null;
  Translate: TippyInstance | null;
  NowBarToggle: TippyInstance | null;
  FullscreenToggle: TippyInstance | null;
  CinemaView: TippyInstance | null;
  NowBarSideToggle: TippyInstance | null;
  Settings: TippyInstance | null;
} = {
  Close: null,
  CompactMode: null,
  Romanization: null,
  Translate: null,
  NowBarToggle: null,
  FullscreenToggle: null,
  CinemaView: null,
  NowBarSideToggle: null,
  Settings: null,
};

const PageView = {
  Open: OpenPage,
  Destroy: DestroyPage,
  AppendViewControls,
  IsOpened: false,
  IsTippyCapable: true,
};

export const GetPageRoot = () =>
  document.querySelector<HTMLElement>(
    ".Root__main-view .main-view-container div[data-overlayscrollbars-viewport]"
  ) ??
  (() => {
    const child = document.querySelector<HTMLElement>(
      ".Root__main-view .main-view-container .main-view-container__scroll-node-child"
    );
    return child?.parentElement as HTMLElement | null;
  })() ??
  document.querySelector<HTMLElement>(".Root__main-view .main-view-container .os-host") ??
  document.querySelector<HTMLElement>(
    ".Root__main-view .main-view-container .uGZUPBPcDpzSYqKcQT8r > div"
  );

let PageResizeListener: ResizeObserver | null = null;
export let PageContainer: HTMLElement | null = null;
export let IsCardMode = false;

async function OpenPage(
  AppendTo: HTMLElement | undefined = undefined,
  options?: { cardMode?: boolean }
) {
  if (_IsPIP_after) {
    await ClosePopupLyrics();
    // After closing, open again with the same arguments
    return OpenPage(AppendTo, options);
  }

  if (!options?.cardMode && NPVCardOwnsPage()) {
    // The NPV card holds the global page; hand it over to the real requester.
    await DeRenderNPVCard();
    return OpenPage(AppendTo, options);
  }

  if (PageView.IsOpened) return;

  IsCardMode = !!options?.cardMode;
  const elem = document.createElement("div");
  elem.id = "SpicyLyricsPage";

  elem.classList.add("SpicyRenderer");

  if (IsCardMode) {
    elem.classList.add("CardMode");
  }

  elem.innerHTML = `
        <div class="ContentBox">
            <div class="NowBar">
                <div class="CenteredView">
                    <div class="Header">
                        <div class="MediaBox">
                            <div class="MediaContent"></div>
                            <div class="MediaImageContainer">
                              <div class="fi_FromImage ib_ImageBox"></div>
                              <div class="ti_ToImage ib_ImageBox"></div>
                            </div>
                        </div>
                        <div class="Metadata">
                            <div class="SongName">
                                <span></span>
                            </div>
                            <div class="Artists">
                                <span></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="LyricsContainer">
                <div class="loaderContainer">
                    <div id="DotLoader"></div>
                </div>
                <div class="LyricsContent ScrollbarScrollable"></div>
            </div>
            <div class="ViewControls"></div>
        </div>
    `;

  if ($viewControlsPosition.get() === "Top") {
    elem.classList.add("ViewControlsPosition_Top");
  } else if ($viewControlsPosition.get() === "Bottom") {
    elem.classList.add("ViewControlsPosition_Bottom");
  }

  PageContainer = elem;

  if (!$skipSpicyFont.get()) {
    elem.classList.add("UseSpicyFont");
  }

  if ($simpleLyricsMode.get()) {
    elem.classList.add("SimpleLyricsMode");
  }

  if ($minimalLyricsMode.get()) {
    elem.classList.add("MinimalLyricsMode");
  }

  if (!$lineHoverBackground.get()) {
    elem.classList.add("NoLineHoverBackground");
  }

  // Gates the raised .PlaybackControls / tightened .Heart offsets that make room for
  // the volume band — without it, turning the setting off would leave a gap.
  if ($showVolumeSlider.get()) {
    elem.classList.add("ShowVolumeSlider");
  }

  ApplyExperimentClasses(elem);

  const contentBox = elem.querySelector<HTMLElement>(".ContentBox");
  // Card mode stays transparent — the NPV's own dynamic background shows through.
  if (contentBox && !IsCardMode) {
    void ApplyDynamicBackground(contentBox, "lpagebg").catch((error) => {
      pageLogger.error("Error applying dynamic background", error);
    });
  }

  if (AppendTo !== undefined) {
    AppendTo?.appendChild(elem);
  } else {
    GetPageRoot()?.appendChild(elem);
  }

  addLinesEvListener();

  {
    const currentUri = Spicetify?.Player?.data?.item?.uri;
    if (currentUri) {
      // v2：503 排队重试（LyricsQueueRetry）已移除，直接取词
      void fetchLyrics(currentUri)
        .then(ApplyLyrics)
        .catch((error) => pageLogger.error("Failed to fetch lyrics when opening page", error));
    }
  }

  if (!IsCardMode) {
    Session_OpenNowBar();

    Session_NowBar_SetSide();

    AppendViewControls();

    DisableCompactMode();
  } else if (IsCompactMode()) {
    // A previous PiP/fullscreen open left the module flag set; the card page
    // never enables compact mode, and a stale flag makes ScrollToActiveLine
    // pin the active line to the top instead of centering it.
    DisableCompactMode();
  }

  PageResizeListener = new ResizeObserver(() => {
    if (!Fullscreen.IsOpen || !Fullscreen.CinemaViewOpen) return;
    Compactify(elem);
  });

  PageResizeListener.observe(elem);

  if (AppendTo === undefined) {
    const legacyPage = document.querySelector<HTMLElement>(
      ".Root__main-view .main-view-container .os-host"
    );
    if (legacyPage) {
      legacyPage.style.containerType = "inline-size";
    }
  }

  $lyricsContainerExists.set(true);
  PageView.IsOpened = true;

  if (IsPIP) {
    elem?.classList.add("ForcedCompactMode");
    OpenNowBar(true);
    EnableCompactMode();
  }

  PageContainer = elem;

  const contentType = SpotifyPlayer.GetContentType();
  if (contentType === "episode") {
    elem?.classList.add("episode-content-type");
  } else {
    elem?.classList.remove("episode-content-type");
  }

  Global.Event.evoke("page:open", { cardMode: IsCardMode });
}

export const isSizeReadyToBeCompacted = () => window.matchMedia("(max-width: 70.812rem)").matches;

export function Compactify(Element: HTMLElement | undefined = undefined) {
  if (!Fullscreen.IsOpen) return;
  const elem = Element ?? PageContainer;
  if (!elem) return;
  if (isSizeReadyToBeCompacted()) {
    elem.classList.add("CompactifyEnabledCompactMode");
    EnableCompactMode();
  } else {
    if (!elem.classList.contains("CompactifyEnabledCompactMode")) return;
    elem.classList.remove("CompactifyEnabledCompactMode");
    if (elem.classList.contains("ForcedCompactMode")) return;
    DisableCompactMode();
  }
}

async function DestroyPage() {
  if (!PageView.IsOpened) return;
  pageLogger.debug("Destroying page");

  cancelLyricsFetch();

  if (Fullscreen.IsOpen) await Fullscreen.Close();
  if (!PageContainer) return;

  KawarpMap.get("lpagebg")?.dispose();
  KawarpMap.delete("lpagebg");
  ResetLastLine();
  CleanupScrollEvents();
  PageResizeListener?.disconnect(); // Disconnect the observer
  for (const t of remeasureTimers) clearTimeout(t);
  remeasureTimers = [];
  PageView.IsOpened = false;
  $lyricsContainerExists.set(false);
  DestroyAllLyricsContainers();
  CleanUpIsByCommunity();

  const legacyPage = document.querySelector<HTMLElement>(
    ".Root__main-view .main-view-container .os-host"
  );
  if (legacyPage) {
    legacyPage.style.containerType = "";
  }

  PageContainer?.remove();
  removeLinesEvListener();
  Object.values(Tooltips).forEach((a) => {
    a?.destroy();
  });
  ScrollSimplebar?.unMount();
  IsCardMode = false;
  Global.Event.evoke("page:destroy", null);
  PageView.IsTippyCapable = true;
  PageContainer = null;
}

export let LyricsApplied = false;

// lyrics:apply 触发的延迟 remeasure 定时器：销毁页面时清掉，避免快速切歌时累积
let remeasureTimers: ReturnType<typeof setTimeout>[] = [];

function scheduleRemeasure(delay: number): void {
  const timer = setTimeout(() => {
    // 触发后从数组移除自身，避免数组长期只增不减
    remeasureTimers = remeasureTimers.filter((t) => t !== timer);
    triggerRemeasureLV();
  }, delay);
  remeasureTimers.push(timer);
}

Global.Event.listen("lyrics:not-apply", () => {
  CleanupScrollEvents();
  LyricsApplied = false;
  CleanUpIsByCommunity();
});

Global.Event.listen("lyrics:apply", ({ Type }: { Type: string }) => {
  CleanupScrollEvents();

  if (!Type || Type === "Static") return;
  if (ScrollSimplebar) {
    InitializeScrollEvents(ScrollSimplebar);
    //QueueForceScroll(); // Queue a force scroll instead of directly calling with true
    LyricsApplied = true;
  }

  scheduleRemeasure(1000);
  scheduleRemeasure(1500);
});

Global.Event.listen(
  "lyrics:enriched",
  ({ uri, lyrics }: { uri: string; lyrics: Record<string, any> }) => {
    // 原文已在首屏显示。只有用户当前要看罗马音时才需要重绘；
    // 其余情况只更新 store 和按钮可用状态，避免无意义的页面跳动。
    if (!isRomanized || !PageView.IsOpened || SpotifyPlayer.GetUri() !== uri) return;
    void ApplyLyrics([lyrics, 200]).catch((error) => {
      controlsLogger.error("Failed to apply background romanization", error);
    });
  }
);

function translationControlPresentation(state: TranslationState) {
  switch (state) {
    case "unavailable":
      return { label: "当前歌词无需翻译", icon: Icons.TranslateOff, disabled: true };
    case "ready":
      return { label: "翻译当前歌词", icon: Icons.Translate, disabled: false };
    case "loading":
      return { label: "正在翻译歌词", icon: Icons.Translate, disabled: true };
    case "complete":
      return { label: "已有歌词翻译", icon: Icons.Translate, disabled: true };
    case "error":
      return { label: "重新翻译歌词", icon: Icons.TranslateOff, disabled: false };
  }
}

function updateTranslationControl(): void {
  const button = PageContainer?.querySelector<HTMLButtonElement>("#TranslateToggle");
  if (!button) return;
  const state = $translationState.get();
  const presentation = translationControlPresentation(state);
  button.innerHTML = presentation.icon;
  // 旧版把翻译开关写成 `.active`；Spotify 恢复页面或旧监听器残留时可能
  // 把该类重新带回。新实现完全由 data-translation-state 驱动，必须清掉它。
  button.classList.remove("active");
  button.classList.toggle("translation-ready", state === "ready");
  button.classList.toggle("translation-loading", state === "loading");
  button.classList.toggle("error", state === "error");
  button.disabled = presentation.disabled;
  button.dataset.translationState = state;
  button.setAttribute("aria-label", presentation.label);
  button.setAttribute("aria-busy", String(state === "loading"));
  button.removeAttribute("aria-pressed");
  Tooltips.Translate?.setContent(presentation.label);
}

function AppendViewControls(ReAppend: boolean = false) {
  if (IsCardMode) return;
  if (!PageContainer) return;
  controlsLogger.debug("Append view controls");
  const elem = PageContainer.querySelector<HTMLElement>(".ContentBox .ViewControls");
  if (!elem) return;

  // Safely destroy existing tooltips first
  Object.keys(Tooltips).forEach((key) => {
    const tippy = Tooltips[key as keyof typeof Tooltips];
    if (tippy?.destroy && typeof tippy.destroy === "function") {
      tippy.destroy();
      Tooltips[key as keyof typeof Tooltips] = null;
    }
  });

  if (ReAppend) elem.innerHTML = "";
  const isNoLyrics = $currentLyricsData.get() === `NO_LYRICS:${SpotifyPlayer.GetUri()}`;
  const translationState = $translationState.get();
  const translationControl = translationControlPresentation(translationState);
  elem.innerHTML = `
        ${
          Fullscreen.IsOpen || Fullscreen.CinemaViewOpen
            ? ""
            : IsPIP
              ? ""
              : `<button id="CinemaView" class="ViewControl">${Icons.CinemaView}</button>`
        }
        ${
          Fullscreen.IsOpen || Fullscreen.CinemaViewOpen
            ? IsPIP
              ? ""
              : `<button id="CompactModeToggle" class="ViewControl">${
                  IsCompactMode() ? Icons.DisableCompactModeIcon : Icons.EnableCompactModeIcon
                }</button>`
            : ""
        }
        <button id="RomanizationToggle" class="ViewControl">
          ${isRomanized ? Icons.DisableRomanization : Icons.EnableRomanization}
        </button>
        <button id="TranslateToggle" type="button"
          class="ViewControl${translationState === "ready" ? " translation-ready" : ""}${translationState === "loading" ? " translation-loading" : ""}${translationState === "error" ? " error" : ""}"
          data-translation-state="${translationState}"
          aria-label="${translationControl.label}"
          aria-busy="${translationState === "loading"}"
          ${translationControl.disabled ? "disabled" : ""}>
          ${translationControl.icon}
        </button>
        ${
          !Fullscreen.IsOpen && !Fullscreen.CinemaViewOpen
            ? IsPIP
              ? ""
              : `<button id="NowBarToggle" class="ViewControl">${Icons.NowBar}</button>`
            : ""
        }
        ${
          NowBarObj.Open
            ? IsPIP
              ? ""
              : `<button id="NowBarSideToggle" class="ViewControl">${Icons.NowBarSideSwap}</button>`
            : ""
        }
        ${
          Fullscreen.IsOpen
            ? IsPIP
              ? ""
              : `<button id="FullscreenToggle" class="ViewControl">${
                  Fullscreen.CinemaViewOpen ? Icons.Fullscreen : Icons.CloseFullscreen
                }</button>`
            : ""
        }
        ${IsPIP ? "" : `<button id="SettingsToggle" class="ViewControl">${Icons.Settings}</button>`}
        <button id="Close" class="ViewControl">${Icons.Close}</button>
    `;

  let targetElem: HTMLElement | null = elem;
  if (Fullscreen.IsOpen) {
    const mediaContent = PageContainer?.querySelector<HTMLElement>(
      ".ContentBox .NowBar .Header .MediaBox .MediaContent"
    );
    if (mediaContent) {
      TransferElement(elem, mediaContent);
      const viewControls = mediaContent.querySelector<HTMLElement>(".ViewControls");
      if (viewControls) {
        targetElem = viewControls;
      }
    }
  } else {
    const contentBox = PageContainer?.querySelector<HTMLElement>(".ContentBox");
    if (
      PageContainer?.querySelector<HTMLElement>(".ContentBox .NowBar .Header .ViewControls") &&
      contentBox
    ) {
      TransferElement(elem, contentBox);
    }
  }

  if (targetElem) {
    SetupTippy(targetElem);
  }

  function SetupTippy(elem: HTMLElement) {
    // If in PIP mode, do not create any Tippy tooltips, but still wire up click handlers
    const isPip = IsPIP;

    const closeButton = elem.querySelector("#Close");
    if (closeButton) {
      try {
        if (!isPip) {
          Tooltips.Close = Spicetify.Tippy(closeButton, {
            ...Spicetify.TippyProps,
            content: `关闭页面`,
          });
        }
        closeButton.addEventListener("click", async () => {
          if (IsPIP) {
            await ClosePopupLyrics();
            globalThis.focus();
            return;
          }

          if (Fullscreen.IsOpen) {
            await Fullscreen.Close();
          }

          Session.GoBack();
        });
      } catch (err) {
        controlsLogger.warn("Failed to setup Close tooltip", err);
      }
    }

    const compactModeToggle = elem.querySelector("#CompactModeToggle");
    if (compactModeToggle) {
      try {
        if (!isPip) {
          Tooltips.CompactMode = Spicetify.Tippy(compactModeToggle, {
            ...Spicetify.TippyProps,
            content: `${IsCompactMode() ? "退出紧凑模式" : "进入紧凑模式"}`,
          });
        }
        compactModeToggle.addEventListener("click", () => {
          // Use PageContainer instead of document.querySelector
          const SpicyLyricsPage = PageContainer;
          if (Fullscreen.IsOpen || Fullscreen.CinemaViewOpen) {
            if (IsCompactMode()) {
              SpicyLyricsPage?.classList.remove("ForcedCompactMode");
              DisableCompactMode();
              $forceCompactMode.set(false);
            } else {
              SpicyLyricsPage?.classList.add("ForcedCompactMode");
              EnableCompactMode();
              $forceCompactMode.set(true);
            }

            setTimeout(() => {
              AppendViewControls(true);
            }, 65);
          }
        });
      } catch (err) {
        controlsLogger.warn("Failed to setup Compact Mode tooltip", err);
      }
    }

    const romanizationToggle = elem.querySelector("#RomanizationToggle");
    if (romanizationToggle) {
      try {
        if (!isPip) {
          Tooltips.Romanization = Spicetify.Tippy(romanizationToggle, {
            ...Spicetify.TippyProps,
            content: isRomanized ? `关闭罗马音` : `启用罗马音`,
          });
        }
        romanizationToggle.addEventListener("click", async () => {
          const songUri = SpotifyPlayer.GetUri();
          if (!songUri) return;
          PageContainer?.querySelector(".LyricsContainer .LyricsContent")?.classList.add(
            "HiddenTransitioned"
          );
          try {
            const lyrics = await fetchLyrics(songUri);
            setRomanizedStatus(!isRomanized);
            await ApplyLyrics(lyrics);
          } catch (error) {
            controlsLogger.error("Failed to refetch lyrics after romanization change", error);
          } finally {
            setTimeout(() => {
              AppendViewControls();
              PageContainer?.querySelector(".LyricsContainer .LyricsContent")?.classList.remove(
                "HiddenTransitioned"
              );
            }, 45);
          }
        });
      } catch (err) {
        controlsLogger.warn("Failed to setup Romanization tooltip", err);
      }
    }

    const translateToggle = elem.querySelector<HTMLButtonElement>("#TranslateToggle");
    if (translateToggle) {
      if (!isPip) {
        try {
          Tooltips.Translate = Spicetify.Tippy(translateToggle, {
            ...Spicetify.TippyProps,
            content: translationControlPresentation($translationState.get()).label,
          });
        } catch (err) {
          controlsLogger.warn("Failed to setup Translate tooltip", err);
        }
      }
      translateToggle.addEventListener("click", () => {
        void requestTranslationToggle().catch((error) => {
          controlsLogger.error("Failed to toggle lyrics translation", error);
        });
      });
      updateTranslationControl();
    }

    if (!Fullscreen.IsOpen && !Fullscreen.CinemaViewOpen) {
      const nowBarButton = elem.querySelector("#NowBarToggle");
      if (nowBarButton) {
        try {
          if (!isPip) {
            Tooltips.NowBarToggle = Spicetify.Tippy(nowBarButton, {
              ...Spicetify.TippyProps,
              content: `顶部信息栏`,
            });
          }
          nowBarButton.addEventListener("click", () => ToggleNowBar());
        } catch (err) {
          controlsLogger.warn("Failed to setup NowBar tooltip", err);
        }
      }
    }

    const fullscreenBtn = elem.querySelector("#FullscreenToggle");
    if (fullscreenBtn) {
      try {
        if (!isPip) {
          Tooltips.FullscreenToggle = Spicetify.Tippy(fullscreenBtn, {
            ...Spicetify.TippyProps,
            content: `${Fullscreen.CinemaViewOpen ? "全屏" : "影院视图"}`,
          });
        }
        fullscreenBtn.addEventListener("click", async () => {
          // If we're in cinema view, go to full fullscreen
          if (Fullscreen.CinemaViewOpen) {
            Fullscreen.CinemaViewOpen = false;
            await EnterSpicyLyricsFullscreen();
            PageView.AppendViewControls(true);
          } else {
            Fullscreen.CinemaViewOpen = true;
            await ExitFullscreenElement();
            PageView.AppendViewControls(true);
          }
          setTimeout(Compactify, 250);
        });
      } catch (err) {
        controlsLogger.warn("Failed to setup Fullscreen tooltip", err);
      }
    }

    const cinemaViewBtn = elem.querySelector("#CinemaView");
    if (cinemaViewBtn && !Fullscreen.IsOpen) {
      try {
        if (!isPip) {
          Tooltips.CinemaView = Spicetify.Tippy(cinemaViewBtn, {
            ...Spicetify.TippyProps,
            content: `影院视图`,
          });
        }
        cinemaViewBtn.addEventListener("click", async () => {
          Fullscreen.Open(true);
        });
      } catch (err) {
        controlsLogger.warn("Failed to setup Cinema View tooltip", err);
      }
    }

    const nowBarSideToggleBtn = elem.querySelector("#NowBarSideToggle");
    if (
      nowBarSideToggleBtn &&
      NowBarObj.Open &&
      !(isNoLyrics && (Fullscreen.IsOpen || Fullscreen.CinemaViewOpen))
    ) {
      try {
        if (!isPip) {
          Tooltips.NowBarSideToggle = Spicetify.Tippy(nowBarSideToggleBtn, {
            ...Spicetify.TippyProps,
            content: `交换顶部信息栏位置`,
          });
        }
        nowBarSideToggleBtn.addEventListener("click", () => NowBar_SwapSides());
      } catch (err) {
        controlsLogger.warn("Failed to setup NowBar Side Toggle tooltip", err);
      }
    }

    const settingsButton = elem.querySelector("#SettingsToggle");
    if (settingsButton && !isPip) {
      try {
        Tooltips.Settings = Spicetify.Tippy(settingsButton, {
          ...Spicetify.TippyProps,
          content: `lyrivaMusic 设置`,
        });
        settingsButton.addEventListener("click", () => {
          openSettingsPanel();
        });
      } catch (err) {
        controlsLogger.warn("Failed to setup Settings tooltip", err);
      }
    }
  }
}

// --- Reactive setting subscriptions ---

$simpleLyricsMode.listen((v) => {
  if (!PageContainer) return;
  PageContainer.classList.toggle("SimpleLyricsMode", v);
  const uri = SpotifyPlayer.GetUri();
  $currentLyricsData.set("");
  if (uri) {
    void fetchLyrics(uri)
      .then(ApplyLyrics)
      .catch((error) =>
        controlsLogger.error("Failed to refresh lyrics after simple mode change", error)
      );
  }
});

$minimalLyricsMode.listen((v) => {
  if (!PageContainer) return;
  PageContainer.classList.toggle("MinimalLyricsMode", v);
  const uri = SpotifyPlayer.GetUri();
  $currentLyricsData.set("");
  if (uri) {
    void fetchLyrics(uri)
      .then(ApplyLyrics)
      .catch((error) =>
        controlsLogger.error("Failed to refresh lyrics after minimal mode change", error)
      );
  }
});

// Purely a CSS toggle — no need to re-render the lyrics like the modes above do.
$lineHoverBackground.listen((v) => {
  if (!PageContainer) return;
  PageContainer.classList.toggle("NoLineHoverBackground", !v);
});

$skipSpicyFont.listen((v) => {
  if (!PageContainer) return;
  PageContainer.classList.toggle("UseSpicyFont", !v);
});

// Purely a CSS gate — NowBar.ts handles rebuilding the band itself.
$showVolumeSlider.listen((v) => {
  if (!PageContainer) return;
  PageContainer.classList.toggle("ShowVolumeSlider", v);
});

// Experiments own their CSS hook here; NowBar.ts handles the rebuild for the ones
// that need one. Adding an experiment requires no change to this file.
onExperimentChange(() => {
  if (!PageContainer) return;
  ApplyExperimentClasses(PageContainer);
});

$viewControlsPosition.listen((v) => {
  if (!PageContainer) return;
  PageContainer.classList.toggle("ViewControlsPosition_Top", v === "Top");
  PageContainer.classList.toggle("ViewControlsPosition_Bottom", v === "Bottom");
  AppendViewControls(true);
});

$ttmlMakerMode.listen(() => {
  if (!PageContainer) return;
  AppendViewControls(true);
});

$translationState.listen(() => updateTranslationControl());

export default PageView;
