import { useStore } from "@nanostores/react";
import {
  $disableNpvLyrics,
  $hideNpvLyricsWhenUnavailable,
  $lineHoverBackground,
  $lockedMediaBox,
  $minimalLyricsMode,
  $popupLyricsAllowed,
  $simpleLyricsMode,
  $simpleLyricsModeRenderingType,
  $viewControlsPosition,
} from "../../../utils/stores.ts";
import { $isGlobalNav } from "../../../utils/uiState.ts";
import { matches, Row, Section, SegmentedControl, Toggle } from "./components.tsx";

const SECTION_NAME = "lyrics-display";
const renderingTypeOptions = ["calculate", "animate"];
const renderingTypeLabels = ["逐字计算", "补间动画"];
const vcPositionOptions = ["Top", "Bottom"];
const vcPositionLabels = ["上方", "下方"];

interface Props {
  query: string;
  sectionFilter: string;
}

export default function LyricsSection({ query, sectionFilter }: Props) {
  const simpleLyricsMode = useStore($simpleLyricsMode);
  const simpleLyricsModeRenderingType = useStore($simpleLyricsModeRenderingType);
  const minimalLyricsMode = useStore($minimalLyricsMode);
  const lineHoverBackground = useStore($lineHoverBackground);
  const lockedMediaBox = useStore($lockedMediaBox);
  const popupLyricsAllowed = useStore($popupLyricsAllowed);
  const viewControlsPosition = useStore($viewControlsPosition);
  const hideNpvLyricsWhenUnavailable = useStore($hideNpvLyricsWhenUnavailable);
  const disableNpvLyrics = useStore($disableNpvLyrics);
  const isGlobalNav = useStore($isGlobalNav);

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const r1 = matches(query, "简洁歌词模式", "移除歌词的额外视觉效果");
  const r2 = matches(query, "简洁模式：文字动画样式", "简洁歌词模式下歌词文字的过渡渲染方式。");
  const r3 = matches(query, "极简歌词模式", "在全屏和影院模式下隐藏已演唱的歌词行");
  const r4 = matches(query, "歌词行悬停背景", "鼠标悬停歌词行时，在其后方显示高亮框");
  const r5 = matches(query, "紧凑模式下锁定媒体框尺寸", "紧凑模式下媒体框保持固定尺寸。");
  const r6 = matches(query, "禁用弹出歌词窗口", "关闭桌面弹出歌词窗口功能。");
  const r7 = matches(query, "歌词控制按钮位置", "歌词控制按钮在播放栏的上下位置。");
  const r8 = matches(query, "禁用正在播放歌词", "在正在播放视图中不显示歌词。");
  const r9 = matches(
    query,
    "无歌词时隐藏正在播放歌词卡片",
    "当前歌曲没有歌词时，隐藏正在播放视图的歌词卡片。"
  );
  if (!r1 && !r2 && !r3 && !r4 && !r5 && !r6 && !r7 && !r8 && !r9) return null;

  return (
    <>
      {(r1 || r2 || r3 || r4) && (
        <Section title="歌词模式">
      {r1 && (
        <Row label="简洁歌词模式">
          <Toggle checked={simpleLyricsMode} onChange={(v) => $simpleLyricsMode.set(v)} />
        </Row>
      )}

      {r2 && (
        <Row
          label="简洁模式：文字动画样式"
          nested
          disabled={!simpleLyricsMode}
          disabledReason="请先启用「简洁歌词模式」再修改此项"
        >
          <SegmentedControl
            value={simpleLyricsModeRenderingType}
            options={renderingTypeOptions}
            labels={renderingTypeLabels}
            onChange={(v) => $simpleLyricsModeRenderingType.set(v)}
            disabled={!simpleLyricsMode}
          />
        </Row>
      )}

      {r3 && (
        <Row label="极简歌词模式">
          <Toggle checked={minimalLyricsMode} onChange={(v) => $minimalLyricsMode.set(v)} />
        </Row>
      )}

      {r4 && (
        <Row label="歌词行悬停背景">
          <Toggle checked={lineHoverBackground} onChange={(v) => $lineHoverBackground.set(v)} />
        </Row>
      )}
        </Section>
      )}

      {(r5 || r6 || r7 || r8 || r9) && (
        <Section title="正在播放与弹出">
      {r5 && (
        <Row label="紧凑模式下锁定媒体框尺寸">
          <Toggle checked={lockedMediaBox} onChange={(v) => $lockedMediaBox.set(v)} />
        </Row>
      )}

      {r6 && (
        <Row label="禁用弹出歌词窗口">
          <Toggle
            checked={!popupLyricsAllowed}
            onChange={(v) => $popupLyricsAllowed.set(!v)}
          />
        </Row>
      )}

      {r7 && (
        <Row
          label="歌词控制按钮位置"
          disabled={!isGlobalNav}
          disabledReason="仅在新版 Spotify 导航布局中可用"
        >
          <SegmentedControl
            value={viewControlsPosition}
            options={vcPositionOptions}
            labels={vcPositionLabels}
            onChange={(v) => $viewControlsPosition.set(v)}
          />
        </Row>
      )}

      {r8 && (
        <Row label="禁用正在播放歌词">
          <Toggle checked={disableNpvLyrics} onChange={(v) => $disableNpvLyrics.set(v)} />
        </Row>
      )}

      {r9 && (
        <Row
          label="无歌词时隐藏正在播放歌词卡片"
          nested
          disabled={disableNpvLyrics}
          disabledReason="正在播放歌词卡片已被禁用"
        >
          <Toggle
            checked={hideNpvLyricsWhenUnavailable}
            onChange={(v) => $hideNpvLyricsWhenUnavailable.set(v)}
          />
        </Row>
      )}
        </Section>
      )}
    </>
  );
}
