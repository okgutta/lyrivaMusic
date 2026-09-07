// deno-lint-ignore-file no-explicit-any
import GetProgress, { _DEPRECATED___GetProgress } from "../../utils/Gets/GetProgress.ts";

const GetContentType = (): string => {
  if (Spicetify?.Player?.data?.item?.type) {
    return Spicetify.Player.data.item.type;
  }
  return "unknown";
};

export type CoverSizes = "standard" | "small" | "large" | "xlarge";
export type Artist = {
  type: "artist";
  name: string;
  uri: string;
};

export const SpotifyPlayer = {
  IsPlaying: false,
  _DEPRECATED_: {
    GetTrackPosition: _DEPRECATED___GetProgress,
  },
  GetPosition: GetProgress,
  GetContentType: GetContentType,
  GetMediaType: (): string => {
    return Spicetify?.Player?.data?.item?.mediaType;
  },
  GetDuration: (): number => {
    if (Spicetify?.Player?.data?.item?.duration?.milliseconds) {
      return Spicetify.Player.data.item.duration.milliseconds;
    }
    return 0;
  },
  Seek: (position: number): void => {
    (Spicetify?.Player as any)?.origin?.seekTo(position);
  },
  GetCover: (size: CoverSizes): string | undefined => {
    const item = Spicetify?.Player?.data?.item;
    if (!item) return "https://images.spikerko.org/SongPlaceholderFull.png";
    // @ts-ignore: Spicetify PlayerItem type has no `show` field on `item`
    const covers = item.images ?? item.show?.images;
    if (covers?.length > 0) {
      const cover = covers.find((cover: any) => cover.label === size);
      return cover?.url ?? "https://images.spikerko.org/SongPlaceholderFull.png";
    }
    return "https://images.spikerko.org/SongPlaceholderFull.png";
  },
  GetCoverFrom: (
    size: CoverSizes,
    source: Array<{ url: string; label: string }> | Spicetify.ImagesEntity[]
  ): string | undefined => {
    if (source) {
      if (source.length > 0) {
        const cover = source?.find((cover) => cover.label === size);
        return cover?.url ?? "https://images.spikerko.org/SongPlaceholderFull.png";
      }
    }
    return "https://images.spikerko.org/SongPlaceholderFull.png";
  },
  GetName: (): string | undefined => {
    return Spicetify?.Player?.data?.item?.name;
  },
  GetShowName: (): string | undefined => {
    // @ts-ignore: Spicetify PlayerItem type has no `show` field
    return Spicetify?.Player?.data?.item?.show?.name;
  },
  GetAlbumName: (): string | undefined => {
    return Spicetify?.Player?.data?.item?.metadata?.album_title;
  },
  GetId: (): string | undefined => {
    return Spicetify?.Player?.data?.item?.uri?.split(":")[2];
  },
  GetArtists: (): Artist[] | undefined => {
    return Spicetify?.Player?.data?.item?.artists as Artist[];
  },
  GetUri: (): string | undefined => {
    return (
      // @ts-ignore: Spicetify Player types expose the uri only on `item` or `track`, not both
      Spicetify?.Player?.data?.item?.uri ?? Spicetify?.Player?.data?.track?.uri
    );
  },
  Pause: Spicetify?.Player?.pause,
  Play: Spicetify?.Player?.play,
  TogglePlayState: Spicetify?.Player?.togglePlay,
  Skip: {
    Next: Spicetify?.Player?.next,
    Prev: Spicetify?.Player?.back,
  },
  LoopType: "none",
  ShuffleType: "none",
  IsDJ: (): boolean => {
    const data = Spicetify?.Player?.data;
    if (!data) return false;
    const disallowSeekingReasons = data.restrictions?.disallowSeekingReasons ?? [];
    return (
      data.item?.provider?.startsWith("narration") ||
      (disallowSeekingReasons.length > 0 && disallowSeekingReasons[0]?.includes("narration")) ||
      data.item?.type === "unknown"
    );
  },
  IsLiked: () => Spicetify?.Player?.getHeart(),
  ToggleLike: async () => {
    const uris = [SpotifyPlayer.GetUri()];
    if (SpotifyPlayer.IsLiked()) {
      await Spicetify.Platform.LibraryAPI.remove({ uris });
    } else {
      await Spicetify.Platform.LibraryAPI.add({ uris });
    }
  },
  Playbar: (() => {
    let rightContainer: HTMLElement | null;
    let sibling: HTMLElement | null;
    const buttonsStash = new Set<HTMLElement>();
    const MAX_MOUNT_RETRIES = 50;
    const MOUNT_RETRY_DELAY = 300;

    type ButtonOnClick = (btn: Button) => void;

    class Button {
      public element: HTMLButtonElement;
      public iconElement: HTMLSpanElement;
      private _label = "";
      private _icon = "";
      private _onClick: ButtonOnClick = () => {};
      private _disabled = false;
      private _active = false;
      public tippy: any;

      constructor(
        label: string,
        icon: string,
        onClick: ButtonOnClick = () => {},
        disabled: boolean = false,
        active: boolean = false,
        registerOnCreate: boolean = true
      ) {
        this.element = document.createElement("button");
        this.element.classList.add("main-genericButton-button");
        this.iconElement = document.createElement("span");
        this.iconElement.classList.add("Wrapper-sm-only", "Wrapper-small-only");
        this.element.appendChild(this.iconElement);
        this.icon = icon;
        this.onClick = onClick;
        this.disabled = disabled;
        this.active = active;
        addClassname(this.element);
        this.tippy = (Spicetify as any).Tippy?.(this.element, {
          content: label,
          ...(Spicetify as any).TippyProps,
        });
        this.label = label;
        if (registerOnCreate) this.register();
      }
      get label(): string {
        return this._label;
      }
      set label(text: string) {
        this._label = text;
        if (!this.tippy) this.element.setAttribute("title", text);
        else this.tippy.setContent(text);
      }
      get icon(): string {
        return this._icon;
      }
      set icon(input: string) {
        let newInput = input;
        if (newInput && (Spicetify as any).SVGIcons && (Spicetify as any).SVGIcons[newInput]) {
          newInput = `<svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" stroke="currentColor">${
            (Spicetify as any).SVGIcons[newInput]
          }</svg>`;
        }
        this._icon = newInput;
        this.iconElement.innerHTML = newInput;
      }
      get onClick(): ButtonOnClick {
        return this._onClick;
      }
      set onClick(func: ButtonOnClick) {
        this._onClick = func;
        this.element.onclick = () => this._onClick(this);
      }
      get disabled(): boolean {
        return this._disabled;
      }
      set disabled(bool: boolean) {
        this._disabled = bool;
        this.element.disabled = bool;
        this.element.classList.toggle("disabled", bool);
      }
      set active(bool: boolean) {
        this._active = bool;
        this.element.classList.toggle("main-genericButton-buttonActive", bool);
        this.element.classList.toggle("main-genericButton-buttonActiveDot", bool);
      }
      get active(): boolean {
        return this._active;
      }
      register() {
        buttonsStash.add(this.element);
        rightContainer?.prepend(this.element);
      }
      deregister() {
        buttonsStash.delete(this.element);
        this.element.remove();
      }
    }

    (function waitForPlaybarMounted(attempt = 0) {
      rightContainer =
        document.querySelector<HTMLElement>(".main-nowPlayingBar-right > div") ??
        document.querySelector<HTMLElement>(".main-nowPlayingBar-extraControls");
      if (!rightContainer) {
        if (attempt < MAX_MOUNT_RETRIES) {
          setTimeout(() => waitForPlaybarMounted(attempt + 1), MOUNT_RETRY_DELAY);
        }
        return;
      }
      for (const button of buttonsStash) {
        addClassname(button);
      }
      rightContainer.prepend(...Array.from(buttonsStash));
    })();

    function addClassname(element: HTMLElement, attempt = 0) {
      sibling =
        document.querySelector<HTMLElement>(
          ".main-nowPlayingBar-right .main-genericButton-button"
        ) ??
        document.querySelector<HTMLElement>(
          ".main-nowPlayingBar-extraControls .main-genericButton-button"
        );
      if (!sibling) {
        if (attempt < MAX_MOUNT_RETRIES) {
          setTimeout(() => addClassname(element, attempt + 1), MOUNT_RETRY_DELAY);
        }
        return;
      }
      for (const className of Array.from(sibling.classList)) {
        if (!className.startsWith("main-genericButton")) element.classList.add(className);
      }
    }

    const widgetStash = new Set<HTMLElement>();
    let nowPlayingWidget: HTMLElement | null;

    type WidgetOnClick = (widget: Widget) => void;

    class Widget {
      public element: HTMLButtonElement;
      private _label = "";
      private _icon = "";
      private _onClick: WidgetOnClick = () => {};
      private _disabled = false;
      private _active = false;
      public tippy: any;

      constructor(
        label: string,
        icon: string,
        onClick: WidgetOnClick = () => {},
        disabled: boolean = false,
        active: boolean = false,
        registerOnCreate: boolean = true
      ) {
        this.element = document.createElement("button");
        this.element.className = "main-addButton-button control-button control-button-heart";
        this.icon = icon;
        this.onClick = onClick;
        this.disabled = disabled;
        this.active = active;
        this.tippy = (Spicetify as any).Tippy?.(this.element, {
          content: label,
          ...(Spicetify as any).TippyProps,
        });
        this.label = label;
        if (registerOnCreate) this.register();
      }
      get label(): string {
        return this._label;
      }
      set label(text: string) {
        this._label = text;
        if (!this.tippy) this.element.setAttribute("title", text);
        else this.tippy.setContent(text);
      }
      get icon(): string {
        return this._icon;
      }
      set icon(input: string) {
        let newInput = input;
        if (newInput && (Spicetify as any).SVGIcons && (Spicetify as any).SVGIcons[newInput]) {
          newInput = `<svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor">${
            (Spicetify as any).SVGIcons[newInput]
          }</svg>`;
        }
        this._icon = newInput;
        this.element.innerHTML = newInput;
      }
      get onClick(): WidgetOnClick {
        return this._onClick;
      }
      set onClick(func: WidgetOnClick) {
        this._onClick = func;
        this.element.onclick = () => this._onClick(this);
      }
      get disabled(): boolean {
        return this._disabled;
      }
      set disabled(bool: boolean) {
        this._disabled = bool;
        this.element.disabled = bool;
        this.element.classList.toggle("main-addButton-disabled", bool);
        (this.element as any).ariaDisabled = bool;
      }
      set active(bool: boolean) {
        this._active = bool;
        this.element.classList.toggle("main-addButton-active", bool);
        (this.element as any).ariaChecked = bool;
      }
      get active(): boolean {
        return this._active;
      }
      register() {
        widgetStash.add(this.element);
        nowPlayingWidget?.append(this.element);
      }
      deregister() {
        widgetStash.delete(this.element);
        this.element.remove();
      }
    }

    function waitForWidgetMounted(attempt = 0) {
      nowPlayingWidget = document.querySelector<HTMLElement>(".main-nowPlayingWidget-nowPlaying");
      if (!nowPlayingWidget) {
        if (attempt < MAX_MOUNT_RETRIES) {
          setTimeout(() => waitForWidgetMounted(attempt + 1), MOUNT_RETRY_DELAY);
        }
        return;
      }
      nowPlayingWidget.append(...Array.from(widgetStash));
    }

    (function attachObserver(attempt = 0) {
      const leftPlayer =
        document.querySelector<HTMLElement>(".main-nowPlayingBar-left") ??
        document.querySelector<HTMLElement>(".qqAX5M23YurntqVJ_8Dt") ??
        document.querySelector<HTMLElement>(".main-nowPlayingWidget-actionButtonWrapper") ??
        document.querySelector<HTMLElement>(".main-nowPlayingWidget-nowPlaying > div:last-of-type");
      if (!leftPlayer) {
        if (attempt < MAX_MOUNT_RETRIES) {
          setTimeout(() => attachObserver(attempt + 1), MOUNT_RETRY_DELAY);
        }
        return;
      }
      waitForWidgetMounted();
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.removedNodes.length > 0) {
            nowPlayingWidget = null;
            waitForWidgetMounted();
          }
        }
      });
      observer.observe(leftPlayer, { childList: true });
    })();

    return { Button, Widget };
  })(),
};
