import { useStore } from "@nanostores/react";
import {
  $disableNpvLyrics,
  $geniusApiToken,
  $hideNpvLyricsWhenUnavailable,
  $learningHideWords,
  $learningMode,
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
  const learningMode = useStore($learningMode);
  const learningHideWords = useStore($learningHideWords);
  const playbackOffset = useStore($playbackOffset);
  const geniusApiToken = useStore($geniusApiToken);

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
    "显示语言 译文显示模式",
    "同时显示原文与译文、只显示原文，或只显示译文（无译文的行仍显示原文）。"
  );
  const r11 = matches(
    query,
    "逐词对照",
    "在当前行下方列出推断出的逐词对照清单（原文词 ↔ 译文词）。对照由分词与相似度推断，仅供参考。"
  );
  const r12 =
    (learningMode || query.trim().length > 0) &&
    matches(query, "藏词自测", "逐词对照清单里遮住译文一侧，点击才揭示，用来做回忆自测。");
  const rSync = matches(query, "歌词同步偏移 播放偏移", "以毫秒为单位提前或推迟歌词的时间轴。");
  const rGenius = matches(query, "Genius 备用歌词 备用歌词来源", "API Token 静态歌词");
  if (!r1 && !r2 && !r3 && !r4 && !r6 && !r8 && !r9 && !r10 && !r11 && !r12 && !rSync && !rGenius)
    return null;

  return (
    <>
      {(r10 || rSync) && (
        <Section>
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
          {rSync && (
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
          )}
        </Section>
      )}

      {(r1 || r2 || r3 || r4) && (
        <Section title="动态与阅读">
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
        <Section>
          <NavigationRow
            label="Genius 备用歌词"
            description="可选，补充静态歌词"
            value={geniusApiToken ? "已配置" : "未配置"}
            valueState={geniusApiToken ? "ok" : "unset"}
            onClick={() => onOpenDetail("genius-token")}
          />
        </Section>
      )}
      {(r11 || r12) && (
        <Section title="语言学习" description="逐词对照根据整行译文推断，仅供学习参考。">
          {r11 && (
            <Row label="逐词对照">
              <Toggle checked={learningMode} onChange={(v) => $learningMode.set(v)} />
            </Row>
          )}

          {r12 && (
            <Row
              label="藏词自测"
              nested
              disabled={!learningMode}
              disabledReason="开启逐词对照后可用"
            >
              <Toggle
                checked={learningHideWords}
                onChange={(v) => $learningHideWords.set(v)}
                disabled={!learningMode}
              />
            </Row>
          )}
        </Section>
      )}
    </>
  );
}
