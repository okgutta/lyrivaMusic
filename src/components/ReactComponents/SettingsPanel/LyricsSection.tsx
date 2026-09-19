import { useStore } from "@nanostores/react";
import {
  $lyricsFontScale,
  $lyricsLineSpacing,
  $lyricsTranslationPosition,
  $lyricsTranslationSize,
} from "../../../utils/Lyrics/readingPreferences.ts";
import {
  $disableNpvLyrics,
  $geniusApiToken,
  $hideNpvLyricsWhenUnavailable,
  $lineHoverBackground,
  $lyricsTranslationDisplay,
  $minimalLyricsMode,
  $playbackOffset,
  $popupLyricsAllowed,
  $simpleLyricsMode,
  $simpleLyricsModeRenderingType,
} from "../../../utils/stores.ts";
import {
  matches,
  NavigationRow,
  NumberStepper,
  Row,
  Section,
  SegmentedControl,
  Slider,
  Toggle,
} from "./components.tsx";

const SECTION_NAME = "lyrics-display";
const renderingTypeOptions = ["calculate", "animate"];
const renderingTypeLabels = ["逐字计算", "补间动画"];
const translationDisplayOptions = ["original", "translated", "bilingual"];
const translationDisplayLabels = ["仅原文", "仅译文", "双语"];
const translationPositionOptions = ["above", "below"];
const translationPositionLabels = ["原文上方", "原文下方"];

interface Props {
  query: string;
  sectionFilter: string;
  onOpenDetail: (id: "genius-token") => void;
}

export default function LyricsSection({ query, sectionFilter, onOpenDetail }: Props) {
  const simpleLyricsMode = useStore($simpleLyricsMode);
  const simpleLyricsModeRenderingType = useStore($simpleLyricsModeRenderingType);
  const minimalLyricsMode = useStore($minimalLyricsMode);
  const lineHoverBackground = useStore($lineHoverBackground);
  const popupLyricsAllowed = useStore($popupLyricsAllowed);
  const hideNpvLyricsWhenUnavailable = useStore($hideNpvLyricsWhenUnavailable);
  const disableNpvLyrics = useStore($disableNpvLyrics);
  const lyricsTranslationDisplay = useStore($lyricsTranslationDisplay);
  const lyricsFontScale = useStore($lyricsFontScale);
  const lyricsTranslationSize = useStore($lyricsTranslationSize);
  const lyricsLineSpacing = useStore($lyricsLineSpacing);
  const lyricsTranslationPosition = useStore($lyricsTranslationPosition);
  const playbackOffset = useStore($playbackOffset);
  const geniusApiToken = useStore($geniusApiToken);
  const translationLayoutDisabled = lyricsTranslationDisplay !== "bilingual";

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const r1 = matches(query, "简化歌词效果 简洁歌词模式", "移除歌词的额外视觉效果");
  const r2 =
    (simpleLyricsMode || query.trim().length > 0) &&
    matches(query, "文字过渡 简洁模式：文字动画样式", "简化歌词效果下歌词文字的过渡渲染方式。");
  const r3 = matches(query, "隐藏已唱歌词 极简歌词模式", "在全屏和影院模式下隐藏已演唱的歌词行");
  const r4 = matches(query, "歌词行悬停背景", "鼠标悬停歌词行时，在其后方显示高亮框");
  const r6 = matches(query, "禁用弹出歌词窗口", "关闭桌面弹出歌词窗口功能。");
  const r8 = matches(query, "正在播放歌词卡片", "在正在播放视图中显示或隐藏歌词。");
  const r9 =
    (!disableNpvLyrics || query.trim().length > 0) &&
    matches(
      query,
      "无歌词时隐藏正在播放歌词卡片",
      "当前歌曲没有歌词时，隐藏正在播放视图的歌词卡片。"
    );
  const r10 = matches(
    query,
    "阅读排版 显示语言 译文显示模式",
    "同时显示原文与译文、只显示原文，或只显示译文（无译文的行仍显示原文）。"
  );
  const rFontScale = matches(
    query,
    "阅读排版 歌词字号 原文字号 正文字号 歌词字体大小",
    "缩放歌词文字。"
  );
  const rTranslationSize = matches(
    query,
    "阅读排版 译文大小 译文字号 翻译字体大小",
    "双语显示时，译文相对于原文的字号比例。"
  );
  const rTranslationPosition = matches(
    query,
    "阅读排版 译文位置 翻译位置 原文上方 原文下方",
    "双语显示时，译文显示在原文上方或下方。"
  );
  const rLineSpacing = matches(
    query,
    "阅读排版 歌词行距 歌词行间距 行距",
    "调整歌词行之间的距离。"
  );
  const rSync = matches(
    query,
    "同步校准 歌词同步偏移 播放偏移",
    "以毫秒为单位提前或推迟歌词的时间轴。"
  );
  const rGenius = matches(query, "Genius 备用歌词 备用歌词来源", "API Token 静态歌词");
  const readingVisible =
    r10 || rFontScale || rTranslationSize || rTranslationPosition || rLineSpacing;
  if (!readingVisible && !r1 && !r2 && !r3 && !r4 && !r6 && !r8 && !r9 && !rSync && !rGenius)
    return null;

  return (
    <>
      {readingVisible && (
        <Section title="阅读排版" className="sl-sp-section--reading">
          {r10 && (
            <Row label="显示语言">
              <SegmentedControl
                value={lyricsTranslationDisplay}
                options={translationDisplayOptions}
                labels={translationDisplayLabels}
                onChange={(v) =>
                  $lyricsTranslationDisplay.set(v as typeof lyricsTranslationDisplay)
                }
              />
            </Row>
          )}
          {rFontScale && (
            <Row label="歌词字号">
              <NumberStepper
                value={lyricsFontScale}
                min={80}
                max={140}
                step={5}
                defaultValue={100}
                unit="%"
                onChange={(v) => $lyricsFontScale.set(v)}
              />
            </Row>
          )}
          {rLineSpacing && (
            <Row label="歌词行距">
              <NumberStepper
                value={lyricsLineSpacing}
                min={75}
                max={160}
                step={5}
                defaultValue={100}
                unit="%"
                onChange={(v) => $lyricsLineSpacing.set(v)}
              />
            </Row>
          )}
          {rTranslationSize && (
            <Row
              label="译文大小"
              description={translationLayoutDisabled ? undefined : "相对原文"}
              disabled={translationLayoutDisabled}
              disabledReason="双语显示时可调节"
            >
              <NumberStepper
                value={lyricsTranslationSize}
                min={35}
                max={100}
                step={1}
                defaultValue={58}
                unit="%"
                onChange={(v) => {
                  if (!translationLayoutDisabled) $lyricsTranslationSize.set(v);
                }}
                disabled={translationLayoutDisabled}
              />
            </Row>
          )}
          {rTranslationPosition && (
            <Row
              label="译文位置"
              disabled={translationLayoutDisabled}
              disabledReason="双语显示时可调节"
            >
              <SegmentedControl
                value={lyricsTranslationPosition}
                options={translationPositionOptions}
                labels={translationPositionLabels}
                onChange={(v) =>
                  $lyricsTranslationPosition.set(v as typeof lyricsTranslationPosition)
                }
                disabled={translationLayoutDisabled}
              />
            </Row>
          )}
        </Section>
      )}

      {rSync && (
        <Section title="同步校准">
          <Row label="歌词同步偏移" description="负值提前，正值延后。" stacked>
            <Slider
              value={playbackOffset}
              min={-5000}
              max={5000}
              step={10}
              defaultValue={0}
              unit="ms"
              onChange={(v) => $playbackOffset.set(v)}
            />
          </Row>
        </Section>
      )}

      {(r1 || r2 || r3 || r4) && (
        <Section title="歌词效果">
          {r1 && (
            <Row label="简化歌词效果">
              <Toggle checked={simpleLyricsMode} onChange={(v) => $simpleLyricsMode.set(v)} />
            </Row>
          )}

          {r2 && (
            <Row
              label="文字过渡"
              nested
              disabled={!simpleLyricsMode}
              disabledReason="开启简化歌词效果后可用"
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
            <Row label="隐藏已唱歌词" description="仅在全屏与影院模式下生效。">
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

      {(r6 || r8 || r9) && (
        <Section title="窗口与卡片">
          {r6 && (
            <Row label="弹出歌词窗口">
              <Toggle checked={popupLyricsAllowed} onChange={(v) => $popupLyricsAllowed.set(v)} />
            </Row>
          )}

          {r8 && (
            <Row label="正在播放歌词卡片">
              <Toggle checked={!disableNpvLyrics} onChange={(v) => $disableNpvLyrics.set(!v)} />
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
                disabled={disableNpvLyrics}
              />
            </Row>
          )}
        </Section>
      )}
      {rGenius && (
        <Section title="备用来源">
          <NavigationRow
            label="Genius 备用歌词"
            description="可选，补充静态歌词"
            value={geniusApiToken ? "已配置" : "未配置"}
            valueState={geniusApiToken ? "ok" : "unset"}
            onClick={() => onOpenDetail("genius-token")}
          />
        </Section>
      )}
    </>
  );
}
