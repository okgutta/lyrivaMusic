import SimpleBar from "simplebar";
import {
  IsMouseInLyricsPage,
  LyricsPageMouseEnter,
  LyricsPageMouseLeave,
  SetIsMouseInLyricsPage,
} from "../Page/IsHovering.ts";
import { PageContainer } from "../../../components/Pages/PageView.ts";
import { $lyricsContainerExists } from "../../../utils/stores.ts";
import { onFrame } from "../../../modules/FrameLoop.ts";

export let ScrollSimplebar: any | null = null;

const ElementEventQuery = ".ContentBox .LyricsContainer";

export function MountScrollSimplebar() {
  if (!PageContainer) {
    console.warn("Cannot mount ScrollSimplebar: PageContainer not found");
    return;
  }
  const LyricsContainer = PageContainer.querySelector<HTMLElement>(
    ".LyricsContainer .LyricsContent"
  );

  if (!LyricsContainer) {
    console.warn("Cannot mount ScrollSimplebar: LyricsContainer not found");
    return;
  }

  ScrollSimplebar = new SimpleBar(LyricsContainer, { autoHide: false });

  PageContainer
    .querySelector<HTMLElement>(ElementEventQuery)
    ?.addEventListener("mouseenter", LyricsPageMouseEnter);
  PageContainer
    .querySelector<HTMLElement>(ElementEventQuery)
    ?.addEventListener("mouseleave", LyricsPageMouseLeave);
}

export function ClearScrollSimplebar() {
  ScrollSimplebar?.unMount();
  ScrollSimplebar = null;
  SetIsMouseInLyricsPage(false);
  if (PageContainer) {
    PageContainer
      .querySelector<HTMLElement>(ElementEventQuery)
      ?.removeEventListener("mouseenter", LyricsPageMouseEnter);
    PageContainer
      .querySelector<HTMLElement>(ElementEventQuery)
      ?.removeEventListener("mouseleave", LyricsPageMouseLeave);
  }
}

export function RecalculateScrollSimplebar() {
  ScrollSimplebar?.recalculate();
}

// Keep the scrollbar hidden except while hovering or dragging. Gated on the
// lyrics container so the loop only runs while the page is actually mounted —
// the previous version scheduled a frame forever, even with no page open.
let scrollbarLoopStop: (() => void) | null = null;

const scrollbarLoop = () => {
  if (!PageContainer) {
    scrollbarLoopStop?.();
    scrollbarLoopStop = null;
    return;
  }
  const LyricsContainer = PageContainer.querySelector<HTMLElement>(
    ".LyricsContainer .LyricsContent"
  );
  if (LyricsContainer && ScrollSimplebar) {
    if (IsMouseInLyricsPage || ScrollSimplebar.isDragging) {
      LyricsContainer.classList.remove("hide-scrollbar");
    } else {
      LyricsContainer.classList.add("hide-scrollbar");
    }
  }
};

$lyricsContainerExists.listen((exists) => {
  if (exists && scrollbarLoopStop === null) {
    scrollbarLoopStop = onFrame(scrollbarLoop);
  }
});

// 共享 FrameLoop（原先独占一条 rAF 链）；页面不存在时首帧自停
scrollbarLoopStop = onFrame(scrollbarLoop);
