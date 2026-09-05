// deno-lint-ignore-file no-explicit-any
import Session from "../Global/Session.ts";
import PageView from "../Pages/PageView.ts";
import Fullscreen from "./Fullscreen.ts";
import { NPVCardOwnsPage, DeRenderNPVCard, RequestNPVCardEvaluate } from "./NPVLyrics.ts";

export let IsPIP = false;
export let _IsPIP_after = false;
// True for the whole PiP setup flow. The NPV card treats it as "page busy" so
// it can't re-take the pipeline during the long awaits (requestWindow, style
// fetches) before IsPIP itself is set.
export let IsPIPOpening = false;

type PictureInPictureWindow = Window;

let currentPipWindow: PictureInPictureWindow | null = null;
let pipPageHideHandler: ((event: Event) => void) | null = null;

export const OpenPopupLyrics = async () => {
  IsPIPOpening = true;
  try {
    await OpenPopupLyricsFlow(0);
  } finally {
    IsPIPOpening = false;
    // If the flow failed or was cancelled, no page event fires — nudge the
    // card so it can come back.
    RequestNPVCardEvaluate();
  }
};

// 防御：PageView.IsOpened 仍为真时先销毁再重入；若销毁后页面未离开（路由没触发），
// 重入仍会看到 IsOpened=true → 递归。depth 上限防止这种无界递归（正常情况下 1 次就够）。
const MAX_POPUP_FLOW_DEPTH = 3;

const OpenPopupLyricsFlow = async (depth = 0): Promise<void> => {
  if (depth > MAX_POPUP_FLOW_DEPTH) {
    throw new Error("OpenPopupLyricsFlow: 无法关闭已打开的歌词页（重入超限）");
  }
  // If the NPV card owns the page, tear it down directly — the guard below
  // would otherwise call Session.GoBack() and wrongly navigate the main view.
  if (NPVCardOwnsPage()) await DeRenderNPVCard();

  if (PageView.IsOpened && !IsPIP) {
    if (Fullscreen.IsOpen) {
      // If in any fullscreen mode, close it first
      await Fullscreen.Close();
      Session.GoBack();
    } else {
      await PageView.Destroy();
      Session.GoBack();
    }

    await OpenPopupLyricsFlow(depth + 1);
    return;
  }

  if (PageView.IsOpened) return;

  // Check for the Picture-in-Picture API
  // @ts-ignore: documentPictureInPicture is not yet standard
  const docPiP = globalThis.documentPictureInPicture;
  if (!docPiP || typeof docPiP.requestWindow !== "function") {
    throw new Error("documentPictureInPicture API is not available in this browser.");
  }

  // Open a Picture-in-Picture window.
  // @ts-ignore: requestWindow is not yet standard
  const pipWindow = (await docPiP.requestWindow({
    disallowReturnToOpener: true,
    preferInitialWindowPlacement: false,
    width: 390,
    height: 379,
  })) as PictureInPictureWindow;
  currentPipWindow = pipWindow;

  // Copy style sheets over from the initial document
  // so that the player looks the same.
  // Only copy <link> elements with href starting with "https://fonts.spikerko.org" to the PiP window
  Array.from(document.querySelectorAll('link[rel="stylesheet"]')).forEach((link) => {
    const stylesheet = link as HTMLLinkElement;
    const href = stylesheet.getAttribute("href") || "";
    const classList = Array.from(stylesheet.classList || []);
    const isFont = href.startsWith("https://fonts.spikerko.org");
    const isLocalCss = /^\/[a-zA-Z]{2}.*\.css$/.test(href);
    const isUserCss =
      (href.endsWith("colors.css") || href.endsWith("user.css")) &&
      classList.length === 1 &&
      classList[0] === "userCSS";
    if (stylesheet.href && (isFont || isLocalCss || isUserCss)) {
      const pipLink = document.createElement("link");
      pipLink.rel = "stylesheet";
      pipLink.type = stylesheet.type || "text/css";
      pipLink.media = stylesheet.media || "";
      pipLink.href = stylesheet.href;
      // Copy classes if it's a userCSS link
      if (isUserCss) {
        pipLink.className = stylesheet.className;
      }
      pipWindow.document.head.appendChild(pipLink);
    }
  });

  // Copy the main SpicyLyrics style element
  // Find any <style> element in the DOM that includes '#SpicyLyricsPage' in its textContent
  // Find all <style> elements in the DOM that include '#SpicyLyricsPage' in their textContent
  const spicyLyricsStyleElement = document.querySelector("#slstyles");
  let spicyLyricsStyleContent: string | null = null;

  if (spicyLyricsStyleElement) {
    if (spicyLyricsStyleElement.tagName.toLowerCase() === "link") {
      const href = spicyLyricsStyleElement.getAttribute("href");
      if (href) {
        try {
          const res = await fetch(href);
          if (res.ok) {
            spicyLyricsStyleContent = await res.text();
          }
        } catch {
          spicyLyricsStyleContent = null;
        }
      }
    } else if (spicyLyricsStyleElement.tagName.toLowerCase() === "style") {
      spicyLyricsStyleContent = spicyLyricsStyleElement.textContent;
    }
  }

  if (spicyLyricsStyleContent) {
    const newStyleElement = document.createElement("style");
    newStyleElement.textContent = spicyLyricsStyleContent;
    pipWindow.document.head.appendChild(newStyleElement);
  }

  // Additionally, copy the styles element with the id 'spicyLyrics-additionalStyling'
  const additionalStyling = document.getElementById("spicyLyrics-additionalStyling");
  if (additionalStyling) {
    const newAdditionalStyling = document.createElement("style");
    newAdditionalStyling.id = "spicyLyrics-additionalStyling";
    newAdditionalStyling.textContent = additionalStyling.textContent;
    pipWindow.document.head.appendChild(newAdditionalStyling);
  }

  const additionalStylingElement = document.createElement("style");
  additionalStylingElement.textContent = `
    .app-drag-region {
      -webkit-app-region: drag;
      app-region: drag;
      position: fixed;
      height: 40px;
      inset: 0;
      width: 100cqw;
    }
  `
    .replace(/\s+/g, " ")
    .replace(/;\s*/g, ";")
    .replace(/{\s*/g, "{")
    .replace(/\s*}/g, "}")
    .trim();

  pipWindow.document.head.appendChild(additionalStylingElement);

  pipWindow.document.body.innerHTML = `<div class="app-drag-region"></div><div class="spicy-pip-wrapper"></div>`;

  const pipWrapper = pipWindow.document.body.querySelector(".spicy-pip-wrapper") as HTMLElement;

  IsPIP = true;

  PageView.Open(pipWrapper);

  Fullscreen.Open(true, false);

  pipPageHideHandler = () => {
    // deno-lint-ignore no-window
    window.location.reload();
  };

  pipWindow.addEventListener("pagehide", pipPageHideHandler);

  _IsPIP_after = true;
};

export const ClosePopupLyrics = async () => {
  if (!IsPIP || !currentPipWindow) return;
  const pipWindow = currentPipWindow;
  _IsPIP_after = false;

  await Fullscreen.Close(true);
  await PageView.Destroy();

  // Remove the event listener before closing the window
  if (pipPageHideHandler) {
    pipWindow.removeEventListener("pagehide", pipPageHideHandler);
    pipPageHideHandler = null;
  }

  pipWindow.close();

  currentPipWindow = null;

  IsPIP = false;
};
