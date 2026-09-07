type ModalDisplayOptions = {
  title: string;
  content: any;
  isLarge?: boolean;
  onClose?: (() => void) | null;
  closeBtn?: boolean;
  closeOnOutsideClick?: boolean;
  /** Replaces the default hide() behavior for the close button and outside-click. */
  closeHandler?: (() => void) | null;
  /** Optional class appended to `.sl-modal` for per-modal styling/identification. */
  modalId?: string | null;
};

type ModalTransitionOptions = {
  content: any;
  onClose?: (() => void) | null;
  closeHandler?: (() => void) | null;
  /** Optional class appended to `.sl-modal`. Replaces any previously set modalId class. */
  modalId?: string | null;
  /** Optional new header title. Omit to keep the current one. */
  title?: string | null;
};

/** Escape text interpolated into the modal's innerHTML template. */
const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c
  );

class _HTMLGenericModal extends HTMLElement {
  private _onClose: (() => void) | null;
  private _currentModalId: string | null;
  // Bumped on every hide()/display() so a pending hide's delayed removal
  // can detect that a newer display took over the element.
  private _hideToken: number;

  constructor() {
    super();
    this.classList.add("SpicyLyricsModal");
    this._onClose = null;
    this._currentModalId = null;
    this._hideToken = 0;
  }

  connectedCallback(): void {
    // PopupModal is a singleton that is removed and appended repeatedly.
    // Re-register on every connection without accumulating duplicates.
    this.removeEventListener("keydown", this._onKeydown);
    this.addEventListener("keydown", this._onKeydown);
  }

  disconnectedCallback(): void {
    this.removeEventListener("keydown", this._onKeydown);
  }

  /** Esc 关闭弹窗；Tab 在弹窗内圈禁焦点（桌面客户端的每个原生对话框都这么做） */
  private _onKeydown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      this.hide();
      return;
    }
    if (e.key !== "Tab") return;
    const focusables = this.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !this.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  private _applyModalId(modalId: string | null | undefined): void {
    const modalEl = this.querySelector(".sl-modal");
    if (this._currentModalId && modalEl) {
      modalEl.classList.remove(this._currentModalId);
    }
    const nextId = typeof modalId === "string" && modalId.length > 0 ? `slmodal-${modalId}` : null;
    if (nextId && modalEl) {
      modalEl.classList.add(nextId);
    }
    this._currentModalId = nextId;
  }

  hide(): void {
    const token = ++this._hideToken;
    const capturedOnClose = this._onClose;
    this._onClose = null;
    this._currentModalId = null;
    const _removeFromDom = (timeoutDuration: number) => {
      setTimeout(() => {
        // A display() that ran after this hide() started now owns the
        // element — skip the delayed removal, but still fire onClose:
        // the captured root (e.g. a React settings panel) must unmount
        // even when a new modal took over the element, or it leaks.
        if (token === this._hideToken) {
          this?.remove();
        }
        if (typeof capturedOnClose === "function") {
          capturedOnClose();
        }
      }, timeoutDuration);
    };

    const genericModal = this?.querySelector(".sl-modal-overlay-animated");
    if (genericModal) {
      genericModal.classList.remove("Active");
      _removeFromDom(0.22 * 1000 + 30);
    } else {
      _removeFromDom(0);
    }
  }

  /**
   * Instantly swap modal content without hiding/re-animating.
   * Use for modal-to-modal transitions where the frame should stay visible.
   */
  transition({
    content,
    onClose = null,
    closeHandler = null,
    modalId = null,
    title = null,
  }: ModalTransitionOptions): void {
    this._hideToken++;
    if (typeof this._onClose === "function") {
      this._onClose();
    }
    this._onClose = onClose;
    const closeButton = this.querySelector(".sl-modal-close-btn");
    if (closeButton) {
      (closeButton as HTMLButtonElement).onclick = closeHandler ?? this.hide.bind(this);
    }
    if (typeof title === "string") {
      const titleEl = this.querySelector(".sl-modal-title");
      if (titleEl) titleEl.textContent = title;
    }
    this._applyModalId(modalId);
    const main = this.querySelector("main");
    if (main) {
      main.innerHTML = "";
      if (typeof content === "string") {
        main.innerHTML = content;
      } else if (content instanceof Node) {
        main.append(content);
      }
    }
  }

  /**
   * Display the modal.
   * @param {Object} options
   * @param {string} options.title
   * @param {any} options.content
   * @param {boolean} [options.isLarge]
   * @param {function} [options.onClose] - Optional callback to run when modal is closed
   * @param {boolean} [options.closeBtn=true] - Show modal close button
   * @param {boolean} [options.closeOnOutsideClick=true] - Allow closing modal by clicking outside
   */
  display({
    title,
    content,
    isLarge = false,
    onClose = null,
    closeBtn = true,
    closeOnOutsideClick = true,
    closeHandler = null,
    modalId = null,
  }: ModalDisplayOptions): void {
    // Invalidate any hide() removal still pending, so it can't remove this
    // freshly displayed modal.
    this._hideToken++;
    // If a previous onClose exists, call it before displaying a new popup
    if (typeof this._onClose === "function") {
      this._onClose();
    }
    this._onClose = onClose;
    // Reset tracked modalId since innerHTML below replaces the previous `.sl-modal` element.
    this._currentModalId = null;
    const safeTitle = escapeHtml(title);
    this.innerHTML = `
<div class="sl-modal-overlay sl-modal-overlay-animated" style="z-index: 100;">
	<div class="sl-modal" tabindex="-1" role="dialog" aria-label="${safeTitle}" aria-modal="true">
		<div class="${isLarge ? "sl-modal-container-large" : "sl-modal-container"}">
			<div class="sl-modal-header">
				<h1 class="sl-modal-title">${safeTitle}</h1>
				${closeBtn ? '<button aria-label="关闭" class="sl-modal-close-btn"><svg width="18" height="18" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><title>关闭</title><path d="M31.098 29.794L16.955 15.65 31.097 1.51 29.683.093 15.54 14.237 1.4.094-.016 1.508 14.126 15.65-.016 29.795l1.414 1.414L15.54 17.065l14.144 14.143" fill="currentColor" fill-rule="evenodd"></path></svg></button>' : ""}
			</div>
			<div class="sl-modal-main-section">
				<main class="sl-modal-content"></main>
			</div>
		</div>
	</div>
</div>`;

    const closeButton = this.querySelector("button");
    if (closeButton) {
      (closeButton as HTMLButtonElement).onclick = closeHandler ?? this.hide.bind(this);
    }
    this._applyModalId(modalId);
    const main = this.querySelector("main");
    const hidePopup = closeHandler ?? this.hide.bind(this);

    // Listen for click events on Overlay
    const overlay = this.querySelector(".sl-modal-overlay");
    if (overlay) {
      // 用 pointerdown 记录按下位置，只有「按下和抬起都在 overlay 上」才视为
      // 外部点击关闭。否则在弹窗内选中文本拖拽到 overlay 上松手时，click 的
      // target 是 overlay（mouseup 位置），会被误判为外部点击而关窗。
      let pointerDownOnOverlay = false;
      overlay.addEventListener("pointerdown", (event: Event) => {
        pointerDownOnOverlay = event.target === event.currentTarget;
      });
      overlay.addEventListener("click", (event: Event) => {
        if (closeOnOutsideClick && pointerDownOnOverlay && event.target === event.currentTarget) {
          hidePopup();
        }
        pointerDownOnOverlay = false;
      });
    }

    if (main) {
      if (typeof content === "string") {
        main.innerHTML = content;
      } else if (content instanceof Node) {
        main.append(content);
      } else if (content !== null && content !== undefined) {
        main.append(String(content));
      }
    }
    document.body.append(this);
    // 焦点落进对话框：键盘用户立刻可以 Tab/Esc，读屏也能播报 dialog
    this.querySelector<HTMLElement>(".sl-modal")?.focus();

    setTimeout(() => {
      const genericModal = this.querySelector(".sl-modal-overlay-animated");
      if (genericModal) genericModal.classList.add("Active");
    }, 50);
  }
}
customElements.define("sl-generic-modal", _HTMLGenericModal);
export const PopupModal = new _HTMLGenericModal();
