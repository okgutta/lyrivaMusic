import { useStore } from "@nanostores/react";
import {
  $showNpvDynamicBg,
  $skipSpicyFont,
  $staticBackgroundBlur,
  $staticBackgroundMode,
} from "../../../utils/stores.ts";
import { matches, Row, Section, SegmentedControl, Slider, Toggle } from "./components.tsx";

const SECTION_NAME = "appearance";
const bgModeOptions = ["off", "auto", "artistHeader", "coverArt", "color"];
const bgModeLabels = ["关闭", "自动", "艺人头图", "封面", "纯色"];

interface Props {
  query: string;
  sectionFilter: string;
}

export default function BackgroundSection({ query, sectionFilter }: Props) {
  const staticBackgroundMode = useStore($staticBackgroundMode);
  const staticBackgroundBlur = useStore($staticBackgroundBlur);
  const showNpvDynamicBg = useStore($showNpvDynamicBg);
  const skipSpicyFont = useStore($skipSpicyFont);

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const r1 = matches(query, "静态背景", "将背景固定为图片或纯色，而不是动态动画。");
  const r2 = matches(query, "正在播放面板显示动态背景", "在正在播放面板中显示动画背景。");
  const blurApplies = staticBackgroundMode !== "off" && staticBackgroundMode !== "color";
  const r3 = blurApplies && matches(query, "背景模糊", "柔化静态背景图片。");
  const r4 = matches(query, "使用系统字体", "不加载 lyrivaMusic 内置字体，跟随 Spotify 当前字体。");

  if (!r1 && !r2 && !r3 && !r4) return null;

  return (
    <Section title="背景">
      {r1 && (
        <Row label="背景模式" stacked>
          <SegmentedControl
            value={staticBackgroundMode}
            options={bgModeOptions}
            labels={bgModeLabels}
            onChange={(v) => $staticBackgroundMode.set(v)}
          />
        </Row>
      )}

      {r3 && (
        <Row label="背景模糊" stacked>
          <Slider
            value={staticBackgroundBlur}
            min={0}
            // 视觉上限：更大的模糊值几乎不再改变观感
            max={67}
            step={1}
            defaultValue={0}
            unit="px"
            onChange={(v) => $staticBackgroundBlur.set(v)}
          />
        </Row>
      )}

      {r2 && (
        <Row label="播放面板动态背景">
          <Toggle checked={showNpvDynamicBg} onChange={(v) => $showNpvDynamicBg.set(v)} />
        </Row>
      )}

      {r4 && (
        <Row label="使用系统字体">
          <Toggle checked={skipSpicyFont} onChange={(v) => $skipSpicyFont.set(v)} />
        </Row>
      )}
    </Section>
  );
}
