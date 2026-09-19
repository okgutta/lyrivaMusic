import { useStore } from "@nanostores/react";
import {
  $lockedMediaBox,
  $showVolumeSlider,
  $timelineOutsideMediaContent,
  $viewControlsPosition,
} from "../../../utils/stores.ts";
import { $isGlobalNav } from "../../../utils/uiState.ts";
import { matches, Row, Section, SegmentedControl, Toggle } from "./components.tsx";

const SECTION_NAME = "playback";
const vcPositionOptions = ["Top", "Bottom"];
const vcPositionLabels = ["上方", "下方"];

interface Props {
  query: string;
  sectionFilter: string;
}

export default function PlaybackSection({ query, sectionFilter }: Props) {
  const lockedMediaBox = useStore($lockedMediaBox);
  const timelineOutsideMediaContent = useStore($timelineOutsideMediaContent);
  const showVolumeSlider = useStore($showVolumeSlider);
  const viewControlsPosition = useStore($viewControlsPosition);
  const isGlobalNav = useStore($isGlobalNav);

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const r1 = matches(query, "紧凑模式下锁定媒体框尺寸", "紧凑模式下媒体框保持固定尺寸。");
  const r2 = matches(query, "时间轴移出媒体框", "把播放进度条从媒体框移到外侧。");
  const r3 = matches(query, "音量滑杆", "在播放栏显示音量滑杆。");
  const r4 = matches(query, "歌词控制按钮位置", "歌词控制按钮在播放栏的上下位置。");

  if (!r1 && !r2 && !r3 && !r4) return null;

  return (
    <Section title="播放布局">
      {r1 && (
        <Row label="紧凑模式下锁定媒体框尺寸">
          <Toggle checked={lockedMediaBox} onChange={(v) => $lockedMediaBox.set(v)} />
        </Row>
      )}

      {r2 && (
        <Row label="时间轴移出媒体框">
          <Toggle
            checked={timelineOutsideMediaContent}
            onChange={(v) => $timelineOutsideMediaContent.set(v)}
          />
        </Row>
      )}

      {r3 && (
        <Row label="音量滑杆">
          <Toggle checked={showVolumeSlider} onChange={(v) => $showVolumeSlider.set(v)} />
        </Row>
      )}

      {r4 && (
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
            disabled={!isGlobalNav}
          />
        </Row>
      )}
    </Section>
  );
}
