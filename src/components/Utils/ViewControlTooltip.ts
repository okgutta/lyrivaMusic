import "../../css/view-control-tooltip.css";

/** Keep toolbar labels readable and inside the window, independently of Spotify's theme. */
export function createViewControlTooltip(target: Element, label: string) {
  target.setAttribute("aria-label", label);

  const placement = () => {
    const bounds = target.getBoundingClientRect();
    const page = target.closest("#SpicyLyricsPage")?.getBoundingClientRect();
    const midpoint = page ? page.top + page.height / 2 : window.innerHeight / 2;
    return bounds.top + bounds.height / 2 < midpoint ? "bottom" : "top";
  };

  return Spicetify.Tippy(target, {
    ...Spicetify.TippyProps,
    content: label,
    appendTo: () => document.body,
    placement: placement(),
    offset: [0, 10],
    delay: [250, 0],
    duration: 0,
    animation: false,
    interactive: false,
    trigger: "mouseenter focus",
    hideOnClick: true,
    maxWidth: 280,
    zIndex: 10000,
    popperOptions: {
      strategy: "fixed",
      modifiers: [
        { name: "flip", options: { padding: 12 } },
        { name: "preventOverflow", options: { rootBoundary: "viewport", padding: 12 } },
      ],
    },
    onShow(instance: { setProps: (props: { placement: string }) => void }) {
      instance.setProps({ placement: placement() });
    },
    // Spotify's supplied renderer can depend on obsolete host class names.
    // Own the small surface so text never becomes an unbacked, clipped label.
    render(instance: { props: { content: string } }) {
      const popper = document.createElement("div");
      popper.className = "sl-view-control-tooltip";
      popper.setAttribute("role", "tooltip");
      popper.textContent = instance.props.content;
      return {
        popper,
        onUpdate(_previous: unknown, next: { content: string }) {
          popper.textContent = next.content;
          target.setAttribute("aria-label", next.content);
        },
      };
    },
  });
}
