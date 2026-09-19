import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { $isGlobalNav } from "../../utils/uiState";
import Logger from "../../utils/Logger";
import { LYRIVA_TOASTER_ID } from "../../utils/notify.ts";

const toasterLogger = new Logger("Toaster");

export default function SLToaster() {
  const [nowPlayingBarHeight, setNowPlayingBarHeight] = useState(0);
  const isGlobalNav = useStore($isGlobalNav);

  useEffect(() => {
    const targetElement = document.querySelector<HTMLElement>(".Root__now-playing-bar");

    if (!targetElement) {
      toasterLogger.warn("Could not find '.Root__now-playing-bar' in the DOM");
      return;
    }

    setNowPlayingBarHeight(targetElement.offsetHeight);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setNowPlayingBarHeight((entry.target as HTMLElement).offsetHeight);
      }
    });
    resizeObserver.observe(targetElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [setNowPlayingBarHeight]);

  const bottomOffset = `var(--sltoaster-bottom-padding, ${nowPlayingBarHeight + 16 + (isGlobalNav ? 0 : 8)}px)`;

  return (
    <Toaster
      id={LYRIVA_TOASTER_ID}
      className="sl-toaster"
      containerAriaLabel="lyrivaMusic 通知"
      position="bottom-center"
      offset={{ bottom: bottomOffset }}
      mobileOffset={{ bottom: bottomOffset }}
      theme="dark"
      richColors={false}
    />
  );
}
