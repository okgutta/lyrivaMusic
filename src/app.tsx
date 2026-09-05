// CSS Imports
import "./css/tokens.css";
import "./css/primitives.css";
import "./css/default.css";
import "./css/default.scss";
import "./css/Simplebar.css";
import "./css/ContentBox.css";
import "./css/DynamicBG/spicy-dynamic-bg.css";
import "./css/Lyrics/main.css";
import "./css/Lyrics/Mixed.css";
import "./css/Loaders/LoaderContainer.css";
import "./css/font-pack/font-pack.css";

import ApplyDynamicBackground, {
  GetStaticBackground,
  KawarpMap,
} from "./components/DynamicBG/dynamicBackground.ts";
import {
  $currentLyricsData,
  $showNpvDynamicBg,
  $popupLyricsAllowed,
  $spicyLyricsVersion,
  $staticBackgroundMode,
  $developerMode,
  $lyricsContainerExists,
} from "./utils/stores.ts";
import Global from "./components/Global/Global.ts";
import Platform from "./components/Global/Platform.ts";
import Session from "./components/Global/Session.ts";
import { SpotifyPlayer } from "./components/Global/SpotifyPlayer.ts";
import PageView, { GetPageRoot, PageContainer } from "./components/Pages/PageView.ts";
import LoadFonts, { ApplyFontPixel } from "./components/Styling/Fonts.ts";
import { Icons } from "./components/Styling/Icons.ts";
import Fullscreen, {
  EnterSpicyLyricsFullscreen,
  ExitFullscreenElement,
} from "./components/Utils/Fullscreen.ts";
import { UpdateNowBar } from "./components/Utils/NowBar.ts";
import { IsPlaying } from "./utils/Addons.ts";
import { requestPositionSync } from "./utils/Gets/GetProgress.ts";
import { IntervalManager } from "./utils/IntervalManager.ts";
import fetchLyrics from "./utils/Lyrics/fetchLyrics.ts";
import ApplyLyrics from "./utils/Lyrics/Global/Applyer.ts";
import { ScrollToActiveLine } from "./utils/Scrolling/ScrollToActiveLine.ts";
import { ScrollSimplebar } from "./utils/Scrolling/Simplebar/ScrollSimplebar.ts";
import { $fromVersion, $lastFetchedUri, $previousVersion } from "./utils/uiState.ts";
import { needsMigration, showMigrationModal } from "./utils/migration/DataMigration.tsx";
import "./css/settings-panel.css";
import "./css/polyfills/generic-modal-polyfill.css";
import "./css/polyfills/sonner-polyfill.css";
import "./css/NPVLyrics.css";
import { IsPIP, OpenPopupLyrics, ClosePopupLyrics } from "./components/Utils/PopupLyrics.ts";
import { GetNPVCardElement, initNPVLyrics } from "./components/Utils/NPVLyrics.ts";
import ReactDOM from "react-dom/client";
import { runThemeMatcher } from "./utils/themeMatcher.ts";
import "./utils/settings.ts";
import SLToaster from "./components/ReactComponents/SLToaster.tsx";
import { openSettingsPanel } from "./utils/settings.ts";
import Logger from "./utils/Logger.ts";
import Whentil from "./modules/Whentil.ts";
import { onFrame } from "./modules/FrameLoop.ts";
import App from "./utils/app.ts";

async function main() {
  const appLogger = new Logger("App");
  const dynamicBgLogger = new Logger("Dynamic Background");
  const playbackLogger = new Logger("Playback");

  if (App.isDev() || $developerMode.get()) {
    appLogger.debug("Boot sequence");
  }

  await Platform.OnSpotifyReady;

  if (needsMigration()) {
    showMigrationModal();
    return;
  }

  if ($previousVersion.get()) {
    $previousVersion.set("");
  }

  $spicyLyricsVersion.set(
    window._spicy_lyrics_metadata?.LoadedVersion ?? $spicyLyricsVersion.get()
  );
  window._spicy_lyrics_metadata = {};

  // v2-full: SessionManager (reached the Spicy server to create a session) was
  // removed along with the Spicy API, so it's disabled to avoid error spam.

  LoadFonts();
  ApplyFontPixel();

  const skeletonStyle = document.createElement("style");
  skeletonStyle.innerHTML = `
        /* This style is here to prevent the @keyframes removal in the CSS. I still don't know why that's happening. */
        /* This is a part of Spicy Lyrics */
        @keyframes skeleton {
            to {
                background-position-x: 0;
            }
        }

        @keyframes Marquee_SongName {
          0% {
            transform: translateX(calc(0px + min(-100% + 86cqw, 0px) * 0));
          }
          10% {
            transform: translateX(calc(0px + min(-100% + 86cqw, 0px) * 0));
          }
          90% {
            transform: translateX(calc(0px + min(-100% + 86cqw, 0px) * 1));
          }
          100% {
            transform: translateX(calc(0px + min(-100% + 86cqw, 0px) * 1));
          }
        }

        @keyframes Marquee_SongName_SongMoreInfo {
          0% {
            transform: translateX(calc(0px + min(-100% + 98cqw, 0px) * 0));
          }
          10% {
            transform: translateX(calc(0px + min(-100% + 98cqw, 0px) * 0));
          }
          90% {
            transform: translateX(calc(0px + min(-100% + 98cqw, 0px) * 1));
          }
          100% {
            transform: translateX(calc(0px + min(-100% + 98cqw, 0px) * 1));
          }
        }

        @keyframes Marquee_Artists {
          0% {
            transform: translateX(calc(0px + min(-100% + 81cqw, 0px) * 0));
          }
          10% {
            transform: translateX(calc(0px + min(-100% + 81cqw, 0px) * 0));
          }
          90% {
            transform: translateX(calc(0px + min(-100% + 81cqw, 0px) * 1));
          }
          100% {
            transform: translateX(calc(0px + min(-100% + 81cqw, 0px) * 1));
          }
        }

        @keyframes Marquee_Artists_SongMoreInfo {
          0% {
            transform: translateX(calc(0px + min(-100% + 98cqw, 0px) * 0));
          }
          10% {
            transform: translateX(calc(0px + min(-100% + 98cqw, 0px) * 0));
          }
          90% {
            transform: translateX(calc(0px + min(-100% + 98cqw, 0px) * 1));
          }
          100% {
            transform: translateX(calc(0px + min(-100% + 98cqw, 0px) * 1));
          }
        }

        @keyframes Marquee_SongName_Compact {
          0% {
            transform: translateX(calc(0px + min(-100% + 100cqw, 0px) * 0));
          }
          10% {
            transform: translateX(calc(0px + min(-100% + 100cqw, 0px) * 0));
          }
          90% {
            transform: translateX(calc(0px + min(-100% + 100cqw, 0px) * 1));
          }
          100% {
            transform: translateX(calc(0px + min(-100% + 100cqw, 0px) * 1));
          }
        }

        @keyframes Marquee_Artists_Compact {
          0% {
            transform: translateX(calc(0px + min(-100% + 100cqw, 0px) * 0));
          }
          10% {
            transform: translateX(calc(0px + min(-100% + 100cqw, 0px) * 0));
          }
          90% {
            transform: translateX(calc(0px + min(-100% + 100cqw, 0px) * 1));
          }
          100% {
            transform: translateX(calc(0px + min(-100% + 100cqw, 0px) * 1));
          }
        }

        @keyframes SLM_Animation {
          0% {
            --SLM_GradientPosition: -27.5%;
          }
          100% {
            --SLM_GradientPosition: 100%;
          }
        }

        @keyframes Pre_SLM_GradientAnimation {
          0% {
            --SLM_GradientPosition: -50%;
          }
          100% {
            --SLM_GradientPosition: -27.5%;
          }
        }

        @keyframes MB_anim_enter {
          0% {
            transform: translate(100%, 0);
          }
          100% {
            transform: translate(0, 0);
          }
        }
  `;

  skeletonStyle.id = "spicyLyrics-additionalStyling";
  document.head.appendChild(skeletonStyle);

  let ButtonList: any;
  // 弹出歌词按钮槽：$popupLyricsAllowed 运行时增删（改设置立即生效，而不是只在启动时读一次）。
  const popupLyricsSlot: { button: any; registered: boolean } = { button: null, registered: false };

  const syncPopupLyricsButton = () => {
    const shouldHave = "documentPictureInPicture" in window && $popupLyricsAllowed.get();
    if (shouldHave && !popupLyricsSlot.button && SpotifyPlayer.Playbar?.Button) {
      popupLyricsSlot.button = new SpotifyPlayer.Playbar.Button(
        "Spicy Popup Lyrics",
        Icons.PiPMode,
        () => {
          if (IsPIP) {
            ClosePopupLyrics();
          } else {
            OpenPopupLyrics();
          }
        },
        false,
        false
      );
      popupLyricsSlot.button.element.style.order = "100000";
      popupLyricsSlot.button.element.id = "SpicyLyrics_PopupLyricsButton";
      if (ButtonList?.some((b: any) => b.Registered)) {
        popupLyricsSlot.button.register();
        popupLyricsSlot.registered = true;
      }
    } else if (!shouldHave && popupLyricsSlot.button) {
      if (popupLyricsSlot.registered) {
        popupLyricsSlot.button.deregister();
        popupLyricsSlot.registered = false;
      }
      popupLyricsSlot.button = null;
    }
  };
  $popupLyricsAllowed.listen(() => syncPopupLyricsButton());

  if (SpotifyPlayer.Playbar?.Button) {
    ButtonList = [
      {
        Registered: false,
        Button: new SpotifyPlayer.Playbar.Button(
          "Lyra",
          Icons.LyricsPage,
          (self) => {
            if (!self.active) {
              /* const isNewFullscreen = document.querySelector<HTMLElement>(".QdB2YtfEq0ks5O4QbtwX .WRGTOibB8qNEkgPNtMxq");
                if (isNewFullscreen) {
                  PageView.Open();
                  self.active = true;
                } else  */
              Session.Navigate({ pathname: "/SpicyLyrics" });
              if (Global.Saves.shift_key_pressed) {
                const pageWhentil = Whentil.When(
                  () => document.querySelector<HTMLElement>(".Root__main-view #SpicyLyricsPage"),
                  () => {
                    Fullscreen.Open(true);
                    pageWhentil?.Cancel();
                  }
                );
              }
              //}
            } else {
              Session.GoBack();
              //}
            }
          },
          false,
          false
        ),
      },
      {
        Registered: false,
        Button: new SpotifyPlayer.Playbar.Button(
          "Enter Fullscreen",
          `<svg role="img" height="16" width="16" aria-hidden="true" viewBox="0 0 16 16" data-encore-id="icon" class="Svg-sc-ytk21e-0 Svg-img-16-icon"><path d="M6.064 10.229l-2.418 2.418L2 11v4h4l-1.647-1.646 2.418-2.418-.707-.707zM11 2l1.647 1.647-2.418 2.418.707.707 2.418-2.418L15 6V2h-4z"/></svg>`,
          async (self) => {
            if (!self.active) {
              Session.Navigate({ pathname: "/SpicyLyrics" });
              const pageWhentil = Whentil.When(
                () => document.querySelector<HTMLElement>(".Root__main-view #SpicyLyricsPage"),
                () => {
                  Fullscreen.Open(Global.Saves.shift_key_pressed ?? false);
                  pageWhentil?.Cancel();
                }
              );
            } else {
              Session.GoBack();
            }
          },
          false,
          false
        ),
      },
      {
        Registered: false,
        // getter：始终读 popupLyricsSlot 当前值，而不是创建时的快照。
        // 初始或运行时开关变化后由 syncPopupLyricsButton() 填充/置空。
        get Button() {
          return popupLyricsSlot.button;
        },
      },
    ];
  }

  // 启动时同步一次（listen 只在变化时触发，初始开启的按钮必须在这里创建）
  syncPopupLyricsButton();

  // Add shift key tracking
  Global.Saves.shift_key_pressed = false;

  window.addEventListener("keydown", (e) => {
    if (e.key === "Shift") {
      Global.Saves.shift_key_pressed = true;
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.key === "Shift") {
      Global.Saves.shift_key_pressed = false;
    }
  });

  window.addEventListener("blur", () => {
    Global.Saves.shift_key_pressed = false;
  });

  Global.Event.listen("pagecontainer:available", () => {
    if (!ButtonList) return;
    for (const button of ButtonList) {
      if (!button.Registered) {
        if (button.Button) button.Button.register();
        button.Registered = true;
        // 弹出歌词按钮由 popupLyricsSlot 管理，注册状态要同步回 slot，
        // 否则关闭设置时 syncPopupLyricsButton 因 registered=false 跳过
        // deregister，按钮残留仍可点击。
        if (button.Button === popupLyricsSlot.button) {
          popupLyricsSlot.registered = true;
        }
      }
    }
  });

  {
    if (ButtonList) {
      const fullscreenButton = ButtonList[1].Button;
      fullscreenButton.element.style.order = "100001";
      fullscreenButton.element.id = "SpicyLyrics_FullscreenButton";

      const hideUnwantedButtons = (container: Element) => {
        for (const element of container.children) {
          const testId = element.attributes.getNamedItem("data-testid")?.value;

          const isFullscreen = testId === "fullscreen-mode-button";
          const isPip =
            "documentPictureInPicture" in window &&
            $popupLyricsAllowed.get() &&
            testId === "pip-toggle-button";
          const isGenericControl =
            element.classList.contains("control-button") &&
            !element.classList.contains("volume-bar__icon-button") &&
            !element.classList.contains("main-devicePicker-controlButton");

          if (
            (isFullscreen || isPip || isGenericControl) &&
            element.id !== "SpicyLyrics_FullscreenButton" &&
            element.id !== "SpicyLyrics_PopupLyricsButton"
          ) {
            (element as HTMLElement).style.display = "none";
          }
        }
      };

      let observer: MutationObserver | null = null;
      // 找不到播放栏控件容器时最多重试 50 次（5s），避免该元素永不出现时定时器永久空转。
      let observeAttempts = 0;
      const MAX_OBSERVE_ATTEMPTS = 50;

      const startObservingDOM = () => {
        const controlsContainer = document.querySelector<HTMLElement>(
          ".main-nowPlayingBar-extraControls"
        );

        if (!controlsContainer) {
          if (++observeAttempts < MAX_OBSERVE_ATTEMPTS) {
            setTimeout(startObservingDOM, 100);
          }
          return;
        }

        hideUnwantedButtons(controlsContainer);

        const MAX_MUTATION_BATCHES = 100;
        const MAX_OBSERVE_MS = 60_000;
        let mutationBatches = 0;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        const stopObserving = (
          obs: MutationObserver,
          _reason: "ready" | "timeout" | "max_mutations"
        ) => {
          try {
            obs.disconnect();
          } finally {
            if (timeoutId !== undefined) {
              clearTimeout(timeoutId);
              timeoutId = undefined;
            }
            if (observer === obs) observer = null;
          }
        };

        observer = new MutationObserver((mutations, obs) => {
          mutationBatches += 1;
          if (mutationBatches >= MAX_MUTATION_BATCHES) {
            stopObserving(obs, "max_mutations");
            return;
          }

          const hasNewChildren = mutations.some((mutation) => mutation.addedNodes.length > 0);
          if (!hasNewChildren) return;

          const hasFullscreen = !!controlsContainer.querySelector(
            '[data-testid="fullscreen-mode-button"]'
          );
          const needsPip = $popupLyricsAllowed.get();
          const hasPip = !!controlsContainer.querySelector('[data-testid="pip-toggle-button"]');

          const isReady = hasFullscreen && (!needsPip || hasPip);
          if (!isReady) return;

          hideUnwantedButtons(controlsContainer);
          stopObserving(obs, "ready");
        });

        observer.observe(controlsContainer, { childList: true });
        timeoutId = setTimeout(() => {
          if (observer) stopObserving(observer, "timeout");
        }, MAX_OBSERVE_MS);
      };

      startObservingDOM();
    }
  }

  let button: any;
  if (ButtonList) {
    button = ButtonList[0];
  }

  const Hometinue = async () => {
    Whentil.When(
      () => Spicetify.Platform.PlaybackAPI,
      () => {
        requestPositionSync();
      }
    );
    // v2：本地版本变化提示弹窗（UpdateDialog）已移除，个人项目无意义
    $fromVersion.set($spicyLyricsVersion.get());

    {
      const div = document.createElement("div");
      div.classList.add("sltoaster");
      const reactRoot = ReactDOM.createRoot(div);

      reactRoot.render(<SLToaster />);

      document.body.appendChild(div);
    }

    // Lets set out Dynamic Background (spicy-dynamic-bg) to the now playing bar
    let lastImgUrl: string | null;
    let lastNowPlayingBarElement: HTMLElement | null = null;
    let nowPlayingBarObserver: MutationObserver | null = null;
    let nowPlayingBarMutationTimeout: ReturnType<typeof setTimeout> | null = null;

    const getNowPlayingBarElement = () =>
      document.querySelector<HTMLElement>(".Root__right-sidebar aside.NowPlayingView") ??
      document.querySelector<HTMLElement>(
        `.Root__right-sidebar aside#Desktop_PanelContainer_Id:has(.main-nowPlayingView-coverArtContainer)`
      );

    const scheduleNowPlayingBarDynamicBackgroundApply = () => {
      if (nowPlayingBarMutationTimeout) {
        clearTimeout(nowPlayingBarMutationTimeout);
      }
      nowPlayingBarMutationTimeout = setTimeout(() => {
        nowPlayingBarMutationTimeout = null;
        void applyDynamicBackgroundToNowPlayingBar(SpotifyPlayer.GetCover("large"));
      }, 50);
    };

    const startNowPlayingBarObserver = () => {
      if (nowPlayingBarObserver) return;

      const sidebar = document.querySelector(".Root__right-sidebar");
      if (!sidebar) return;

      nowPlayingBarObserver = new MutationObserver((mutations) => {
        // Resolved once per callback, not once per record.
        const card = GetNPVCardElement();
        const shouldReapply = mutations.some((mutation) => {
          // Cheap type/attribute test first — the ancestor walk below only runs
          // for records that would otherwise schedule a re-apply.
          if (mutation.type === "attributes") {
            const name = mutation.attributeName;
            if (name !== "src" && name !== "class" && name !== "inert") return false;
          } else if (mutation.type !== "childList") {
            return false;
          }
          // Ignore mutations inside the NPV lyrics card — the lyrics pipeline
          // mutates it constantly, which would reset the debounce below forever
          // and starve the npvbg apply. The card's own insertion/removal still
          // passes (that mutation targets the card's parent).
          const target = mutation.target;
          const targetElement = target instanceof Element ? target : target.parentElement;
          return !(card && targetElement && card.contains(targetElement));
        });

        if (!shouldReapply) return;
        scheduleNowPlayingBarDynamicBackgroundApply();
      });

      // `style` is deliberately absent from the filter: the lyrics animator
      // rewrites inline styles on every mounted word and letter each frame, and
      // the card lives inside this observed subtree. Including it made Blink
      // allocate a MutationRecord per write — hundreds per frame — that this
      // callback then had to walk and discard. Cover swaps already arrive via
      // the `playback:songchange` handler, and DOM-driven re-renders via
      // `childList` / `src` / `class`.
      nowPlayingBarObserver.observe(sidebar, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["src", "class", "inert"],
      });
    };

    const CleanupNowBarDynamicBgLets = () => {
      const nowPlayingBar = getNowPlayingBarElement() ?? lastNowPlayingBarElement;

      const kawarpInstance = KawarpMap.get("npvbg");
      if (kawarpInstance) {
        kawarpInstance.dispose();
        KawarpMap.delete("npvbg");
      }
      nowPlayingBar?.querySelector<HTMLElement>(".spicy-dynamic-bg")?.remove();
      nowPlayingBar?.classList.remove("spicy-dynamic-bg-in-this");
      lastNowPlayingBarElement = null;
      lastImgUrl = null;
    };

    // Some Spotify views (e.g. cinema) swap the right sidebar layout.
    // When that happens, NPV dynamic background needs to be cleaned up,
    // but page backgrounds (e.g. lpagebg) must remain intact.
    let cinemaViewObserver: MutationObserver | null = null;
    let cinemaViewActive = false;

    const getTopContainerElement = () => {
      const rightSidebar = document.querySelector<HTMLElement>(".Root__right-sidebar");
      // `.Root__top-container` is expected to be the parent of `.Root__right-sidebar`.
      const parent = rightSidebar?.parentElement;
      if (parent?.classList.contains("Root__top-container")) return parent;
      return document.querySelector<HTMLElement>(".Root__top-container");
    };

    const checkCinemaViewAndMaybeCleanup = (topContainer: HTMLElement) => {
      const cinemaViewExists = Boolean(topContainer.querySelector(".Root__cinema-view"));

      if (cinemaViewExists && !cinemaViewActive) {
        cinemaViewActive = true;
        CleanupNowBarDynamicBgLets();
        return;
      }

      if (!cinemaViewExists && cinemaViewActive) {
        cinemaViewActive = false;
        // Restore NPV dynamic background after leaving cinema view.
        scheduleNowPlayingBarDynamicBackgroundApply();
      }
    };

    const startCinemaViewObserver = () => {
      if (cinemaViewObserver) return;

      const topContainer = getTopContainerElement();
      if (!topContainer) return;

      // Initial check (covers late observer start scenarios).
      checkCinemaViewAndMaybeCleanup(topContainer);

      cinemaViewObserver = new MutationObserver(() => {
        if (!topContainer.isConnected) {
          cinemaViewObserver?.disconnect();
          cinemaViewObserver = null;
          cinemaViewActive = false;
          return;
        }

        checkCinemaViewAndMaybeCleanup(topContainer);
      });

      cinemaViewObserver.observe(topContainer, {
        subtree: true,
        childList: true,
      });
    };

    Whentil.When(
      () => Boolean(getTopContainerElement()),
      () => {
        startCinemaViewObserver();
      }
    );

    async function applyDynamicBackgroundToNowPlayingBar(coverUrl: string | undefined) {
      if (!$showNpvDynamicBg.get()) return;
      if (SpotifyPlayer.GetContentType() === "unknown" || SpotifyPlayer.IsDJ()) return;
      if (!coverUrl) return;
      const nowPlayingBar = getNowPlayingBarElement();
      const topContainer = getTopContainerElement();
      const cinemaViewExists = Boolean(topContainer?.querySelector(".Root__cinema-view"));
      // Same rule as the NPV lyrics card: an inert ancestor chain
      // (.Root__right-sidebar <-> aside) means the NPV is not interactive,
      // so its dynamic background should be de-rendered too.
      const npvIsInert = Boolean(nowPlayingBar?.closest("[inert]"));

      try {
        if (!nowPlayingBar || cinemaViewExists || npvIsInert) {
          lastImgUrl = null;
          CleanupNowBarDynamicBgLets();
          return;
        }
        lastNowPlayingBarElement = nowPlayingBar;
        if (coverUrl === lastImgUrl) return;

        nowPlayingBar.classList.add("spicy-dynamic-bg-in-this");

        await ApplyDynamicBackground(nowPlayingBar, "npvbg");

        lastImgUrl = coverUrl;
      } catch (error) {
        dynamicBgLogger.error("Failed applying dynamic background to now playing bar", error);
      }
    }

    $showNpvDynamicBg.listen((v) => {
      if (!v) {
        CleanupNowBarDynamicBgLets();
      } else {
        scheduleNowPlayingBarDynamicBackgroundApply();
      }
    });

    startNowPlayingBarObserver();
    scheduleNowPlayingBarDynamicBackgroundApply();

    Global.Event.listen("fullscreen:open", () => {
      CleanupNowBarDynamicBgLets();
    });

    Global.Event.listen("fullscreen:exit", () => {
      scheduleNowPlayingBarDynamicBackgroundApply();
    });

    async function onSongChange(event: any) {
      playbackLogger.debug("Song change pipeline");
      const contentType = SpotifyPlayer.GetContentType();
      playbackLogger.debug("Detected content type", contentType);

      if (contentType === "episode") {
        PageContainer?.classList.add("episode-content-type");
      } else {
        PageContainer?.classList.remove("episode-content-type");
      }

      if (button && !button.Registered) {
        button.Button.register();
        button.Registered = true;
      }

      if (PageContainer?.querySelector(".ContentBox .NowBar")) {
        if (Fullscreen.IsOpen) {
          UpdateNowBar(true);
        } else {
          UpdateNowBar();
        }
      }

      const songUri = event?.data?.item?.uri;
      if (songUri) {
        void fetchLyrics(songUri)
          .then(ApplyLyrics)
          .catch((error) =>
            playbackLogger.error("Failed to fetch lyrics after song change", error)
          );
      }

      const _staticBgMode = $staticBackgroundMode.get();
      if (
        _staticBgMode !== "off" &&
        !SpotifyPlayer.IsDJ() &&
        (_staticBgMode === "auto" || _staticBgMode === "artistHeader")
      ) {
        const Artists = SpotifyPlayer.GetArtists();
        const Artist =
          Artists?.map((artist) => artist.uri?.replace("spotify:artist:", ""))[0] ?? undefined;
        void GetStaticBackground(Artist, SpotifyPlayer.GetId()).catch((error) => {
          dynamicBgLogger.error("Unable to prefetch static background", error);
        });
      }

      scheduleNowPlayingBarDynamicBackgroundApply();

      const contentBox = PageContainer?.querySelector<HTMLElement>(".ContentBox");
      if (!contentBox || $staticBackgroundMode.get() === "color") return;
      void ApplyDynamicBackground(contentBox, "lpagebg").catch((error) => {
        dynamicBgLogger.error("Failed applying dynamic background to page", error);
      });
    }
    Global.Event.listen("playback:songchange", onSongChange);

    const _initStaticBgMode = $staticBackgroundMode.get();
    if (
      _initStaticBgMode !== "off" &&
      !SpotifyPlayer.IsDJ() &&
      (_initStaticBgMode === "auto" || _initStaticBgMode === "artistHeader")
    ) {
      const Artists = SpotifyPlayer.GetArtists();
      const Artist =
        Artists?.map((artist) => artist.uri?.replace("spotify:artist:", ""))[0] ?? undefined;
      try {
        await GetStaticBackground(Artist, SpotifyPlayer.GetId());
      } catch {
        dynamicBgLogger.error("Unable to prefetch static background");
      }
    }

    window.addEventListener("online", () => {
      $lastFetchedUri.set(null);

      void fetchLyrics(Spicetify.Player.data?.item?.uri)
        .then(ApplyLyrics)
        .catch((error) =>
          playbackLogger.error("Failed to fetch lyrics after coming online", error)
        );
    });

    // Auto-scroll follow loop. Gated on the lyrics container: it runs at
    // frame rate while the page is open and stops entirely when it's closed
    // (the previous version scheduled a frame forever).
    let scrollFollowStop: (() => void) | null = null;

    const scrollFollowLoop = () => {
      if (!$lyricsContainerExists.get()) {
        scrollFollowStop?.();
        scrollFollowStop = null;
        return;
      }
      if (ScrollSimplebar) {
        ScrollToActiveLine(ScrollSimplebar);
      }
    };

    $lyricsContainerExists.listen((exists) => {
      if (exists && scrollFollowStop === null) {
        scrollFollowStop = onFrame(scrollFollowLoop);
      }
    });

    // 共享 FrameLoop（原先独占一条 rAF 链）
    scrollFollowStop = onFrame(scrollFollowLoop);

    interface Location {
      pathname: string;
      [key: string]: any;
    }

    let lastLocation: Location | null = null;

    async function loadPage(location: Location) {
      appLogger.debug("Handling route change", location.pathname);
      if (location.pathname === "/SpicyLyrics") {
        PageView.Open();
        if (button) button.Button.active = true;
      } else {
        if (lastLocation?.pathname === "/SpicyLyrics") {
          await PageView.Destroy();
          if (!button) return;
          button.Button.active = false;
        }
      }
      lastLocation = location;
    }

    Global.Event.listen("platform:history", loadPage);

    if (Spicetify.Platform.History.location.pathname === "/SpicyLyrics") {
      Global.Event.listen("pagecontainer:available", () => {
        loadPage(Spicetify.Platform.History.location);
        if (!button) return;
        button.Button.active = true;
      });
    }

    if (button) {
      button.Button.tippy.setContent("Lyra");
    }

    {
      type LoopType = "context" | "track" | "none";
      let lastLoopType: LoopType | null = null;
      // These interval managers are intentionally not stored in variables that are used elsewhere
      // They are self-running background processes that continue to run throughout the app lifecycle
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      new IntervalManager(0.5, () => {
        const LoopState = Spicetify.Player.getRepeat();
        const LoopType: LoopType = LoopState === 1 ? "context" : LoopState === 2 ? "track" : "none";
        SpotifyPlayer.LoopType = LoopType;
        if (lastLoopType !== LoopType) {
          Global.Event.evoke("playback:loop", LoopType);
        }
        lastLoopType = LoopType;
      }).Start();
    }

    {
      type ShuffleType = "smart" | "normal" | "none";
      let lastShuffleType: ShuffleType | null = null;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      new IntervalManager(0.5, () => {
        let ShuffleType: ShuffleType = "none";
        try {
          const state = (Spicetify.Player as any)?.origin?._state;
          ShuffleType = state?.smartShuffle ? "smart" : state?.shuffle ? "normal" : "none";
        } catch (error) {
          playbackLogger.debug("Unable to read shuffle state", error);
        }
        SpotifyPlayer.ShuffleType = ShuffleType;
        if (lastShuffleType !== ShuffleType) {
          Global.Event.evoke("playback:shuffle", ShuffleType);
        }
        lastShuffleType = ShuffleType;
      }).Start();
    }

    {
      // Volume changes from anywhere (Spotify's own slider, media keys, another
      // device, our own setVolume) arrive on this native emitter, so there's nothing
      // to poll. `_events` is an undocumented internal — if Spotify ever drops it the
      // guard degrades us to "the volume slider doesn't auto-update" rather than
      // throwing during startup.
      Whentil.When(
        () => Spicetify.Platform?.PlaybackAPI,
        () => {
          try {
            Spicetify.Platform.PlaybackAPI?._events?.addListener?.(
              "volume",
              (e: { data?: { volume?: number } }) => {
                const volume = e?.data?.volume;
                if (typeof volume !== "number") return;
                Global.Event.evoke("playback:volume", volume);
              }
            );
          } catch (err) {
            console.error("Spicy Lyrics: couldn't listen for volume changes", err);
          }
        }
      );
    }

    {
      let lastPosition = 0;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      new IntervalManager(0.5, () => {
        const pos = SpotifyPlayer.GetPosition();
        if (pos !== lastPosition) {
          Global.Event.evoke("playback:position", pos);
        }
        lastPosition = pos;
      }).Start();
    }

    {
      let lastTimeout: ReturnType<typeof setTimeout> | undefined;
      const refetchAttempts = new Map<string, number>();
      const MAX_REFETCH_ATTEMPTS = 3;
      Global.Event.listen("lyrics:apply", () => {
        if (lastTimeout !== undefined) {
          clearTimeout(lastTimeout);
          lastTimeout = undefined;
        }
        lastTimeout = setTimeout(async () => {
          const currentSongLyrics = $currentLyricsData.get();
          // NO_LYRICS: 哨兵（任意曲目的）不是 JSON，必须先排除再 parse
          if (currentSongLyrics && !currentSongLyrics.startsWith("NO_LYRICS:")) {
            let parsedLyrics: any = null;
            try {
              parsedLyrics = JSON.parse(currentSongLyrics);
            } catch {
              // 损坏的歌词数据：不重取也不抛错，交给下次 fetch 覆盖
              return;
            }
            if (parsedLyrics?.uri !== SpotifyPlayer.GetUri()) {
              const refetchUri = SpotifyPlayer.GetUri();
              if (refetchUri) {
                const attempts = refetchAttempts.get(refetchUri) ?? 0;
                if (attempts < MAX_REFETCH_ATTEMPTS) {
                  refetchAttempts.set(refetchUri, attempts + 1);
                  void fetchLyrics(refetchUri)
                    .then(ApplyLyrics)
                    .catch((error) => playbackLogger.error("Failed to refetch stale lyrics", error));
                } else {
                  playbackLogger.warn("Giving up on repeatedly stale lyrics", refetchUri);
                }
              }
            } else {
              const currentUri = SpotifyPlayer.GetUri();
              if (currentUri) refetchAttempts.delete(currentUri);
            }
          }
        }, 1000);
      });
    }

    SpotifyPlayer.IsPlaying = IsPlaying();

    // Events
    {
      Spicetify.Player.addEventListener("onplaypause", (e) => {
        SpotifyPlayer.IsPlaying = !e?.data?.isPaused;
        Global.Event.evoke("playback:playpause", e);
      });
      Spicetify.Player.addEventListener("onprogress", (e) =>
        Global.Event.evoke("playback:progress", e)
      );
      Spicetify.Player.addEventListener("songchange", (e) =>
        Global.Event.evoke("playback:songchange", e)
      );

      Whentil.When(GetPageRoot, () => {
        Global.Event.evoke("pagecontainer:available", GetPageRoot());
      });

      Spicetify.Platform.History.listen((e: Location) => {
        Global.Event.evoke("platform:history", e);
      });
      Spicetify.Platform.History.listen(Session.RecordNavigation);
      Session.RecordNavigation(Spicetify.Platform.History.location);

      Global.Event.listen("session:navigation", (data: Location) => {
        if (data.pathname === "/SpicyLyrics/Update") {
          $fromVersion.set($spicyLyricsVersion.get());
          window._spicy_lyrics_metadata = {};
          Session.GoBack();
          window.location.reload();
        }
      });
      // 更新检查已移除（避免独立插件版本的更新提示干扰）
    }
  };

  Whentil.When(
    () => SpotifyPlayer.GetContentType(),
    () => {
      const IsSomethingElseThanTrack = SpotifyPlayer.GetContentType() !== "track";

      if (IsSomethingElseThanTrack) {
        if (!button) return;
        button.Button.deregister();
        button.Registered = false;
      } else {
        if (!button) return;
        if (!button.Registered) {
          button.Button.register();
          button.Registered = true;
        }
      }
    }
  );

  initNPVLyrics();

  Hometinue();

  runThemeMatcher();

  Spicetify.Keyboard.registerImportantShortcut(Spicetify.Keyboard.KEYS.ESCAPE, async () => {
    if (IsPIP) return;
    if (Fullscreen.CinemaViewOpen) {
      await Fullscreen.Close();
      Session.GoBack();
    }
  });

  document.addEventListener("fullscreenchange", async () => {
    if (!document.fullscreenElement && Fullscreen.IsOpen && !Fullscreen.CinemaViewOpen) {
      Fullscreen.CinemaViewOpen = true;
      await ExitFullscreenElement();
      PageView.AppendViewControls(true);
    }
  });

  Spicetify.Keyboard.registerImportantShortcut(Spicetify.Keyboard.KEYS.F11, async () => {
    if (IsPIP) return;
    if (Fullscreen.IsOpen) {
      if (!Fullscreen.CinemaViewOpen) {
        Fullscreen.CinemaViewOpen = true;
        await ExitFullscreenElement();
        PageView.AppendViewControls(true);
      } else {
        Fullscreen.CinemaViewOpen = false;
        await EnterSpicyLyricsFullscreen();
        PageView.AppendViewControls(true);
      }
    }
  });

  new Spicetify.Menu.Item(
    "Lyra 设置",
    false,
    () => {
      openSettingsPanel();
    },
    `<svg version="1.0" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentcolor" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet"><path d="M18.9962 5.00357C18.5208 4.52802 17.9233 4.19298 17.2696 4.03541C16.6159 3.87784 15.9313 3.90387 15.2915 4.11061C14.6516 4.31735 14.0813 4.69678 13.6433 5.20705C13.2054 5.71733 12.9169 6.33862 12.8097 7.00242L16.9973 11.1897C17.6611 11.0825 18.2824 10.794 18.7927 10.3561C19.303 9.91824 19.6825 9.34793 19.8893 8.7081C20.096 8.06827 20.122 7.38377 19.9645 6.73009C19.8069 6.07641 19.4718 5.47894 18.9962 5.00357ZM15.2227 12.153L11.845 8.77431C10.4947 10.3119 9.14443 11.8495 7.79421 13.3871L4.34436 17.3139C4.06732 17.6308 3.92106 18.0412 3.93518 18.4618C3.94929 18.8825 4.12273 19.2821 4.42039 19.5798C4.71804 19.8774 5.11767 20.0508 5.53838 20.0649C5.9591 20.0791 6.36945 19.9328 6.68639 19.6558L10.6328 16.1894L15.224 12.1543L15.2227 12.153ZM10.8636 6.96374C10.9806 5.9186 11.3904 4.92775 12.0457 4.10518C12.701 3.28261 13.5752 2.66176 14.5678 2.31407C15.5604 1.96638 16.631 1.90598 17.6564 2.13981C18.6818 2.37365 19.6203 2.89222 20.364 3.63586C21.1077 4.3795 21.6263 5.31798 21.8602 6.34331C22.094 7.36865 22.0336 8.43917 21.6859 9.43169C21.3382 10.4242 20.7173 11.2984 19.8947 11.9537C19.0721 12.6089 18.0811 13.0187 17.0359 13.1357L11.9108 17.6402L7.96445 21.1079C7.27835 21.7096 6.38902 22.0279 5.47687 21.9981C4.56473 21.9683 3.69808 21.5926 3.05275 20.9473C2.40742 20.302 2.03174 19.4354 2.00192 18.5234C1.97211 17.6113 2.29039 16.722 2.8922 16.0359L6.34334 12.1092L10.8636 6.96374Z"/><path d="M8.35932 0.380176C8.40765 0.249583 8.59235 0.249583 8.64068 0.380176L9.15129 1.76009C9.16648 1.80114 9.19886 1.83352 9.23991 1.84871L10.6198 2.35932C10.7504 2.40765 10.7504 2.59235 10.6198 2.64068L9.23991 3.15129C9.19886 3.16648 9.16648 3.19886 9.15129 3.23991L8.64068 4.61982C8.59235 4.75042 8.40765 4.75042 8.35932 4.61982L7.84871 3.23991C7.83352 3.19886 7.80114 3.16648 7.76009 3.15129L6.38018 2.64068C6.24958 2.59235 6.24958 2.40765 6.38018 2.35932L7.76009 1.84871C7.80114 1.83352 7.83352 1.80114 7.84871 1.76009L8.35932 0.380176Z"/><path d="M19.8593 14.3802C19.9076 14.2496 20.0924 14.2496 20.1407 14.3802L21.0564 16.855C21.0716 16.896 21.104 16.9284 21.145 16.9436L23.6198 17.8593C23.7504 17.9076 23.7504 18.0924 23.6198 18.1407L21.145 19.0564C21.104 19.0716 21.0716 19.104 21.0564 19.145L20.1407 21.6198C20.0924 21.7504 19.9076 21.7504 19.8593 21.6198L18.9436 19.145C18.9284 19.104 18.896 19.0716 18.855 19.0564L16.3802 18.1407C16.2496 18.0924 16.2496 17.9076 16.3802 17.8593L18.855 16.9436C18.896 16.9284 18.9284 16.896 18.9436 16.855L19.8593 14.3802Z"/><path d="M13.3593 18.3802C13.4076 18.2496 13.5924 18.2496 13.6407 18.3802L14.1513 19.7601C14.1665 19.8011 14.1989 19.8335 14.2399 19.8487L15.6198 20.3593C15.7504 20.4076 15.7504 20.5924 15.6198 20.6407L14.2399 21.1513C14.1989 21.1665 14.1665 21.1989 14.1513 21.2399L13.6407 22.6198C13.5924 22.7504 13.4076 22.7504 13.3593 22.6198L12.8487 21.2399C12.8335 21.1989 12.8011 21.1665 12.7601 21.1513L11.3802 20.6407C11.2496 20.5924 11.2496 20.4076 11.3802 20.3593L12.7601 19.8487C12.8011 19.8335 12.8335 19.8011 12.8487 19.7601L13.3593 18.3802Z"/><path d="M3.85932 3.38018C3.90765 3.24958 4.09235 3.24958 4.14068 3.38018L5.05643 5.85495C5.07162 5.89601 5.10399 5.92838 5.14505 5.94357L7.61982 6.85932C7.75042 6.90765 7.75042 7.09235 7.61982 7.14068L5.14505 8.05643C5.10399 8.07162 5.07162 8.10399 5.05643 8.14505L4.14068 10.6198C4.09235 10.7504 3.90765 10.7504 3.85932 10.6198L2.94357 8.14505C2.92838 8.10399 2.89601 8.07162 2.85495 8.05643L0.380176 7.14068C0.249583 7.09235 0.249583 6.90765 0.380176 6.85932L2.85495 5.94357C2.89601 5.92838 2.92838 5.89601 2.94357 5.85495L3.85932 3.38018Z"/></svg>`
  ).register();
}

main();
