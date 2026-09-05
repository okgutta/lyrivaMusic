import { useStore } from "@nanostores/react";
import {
  $showVolumeSlider,
  $timelineOutsideMediaContent,
  $playbackOffset,
} from "../../../utils/stores.ts";
import { matches, Row, Section, Slider, Toggle } from "./components.tsx";

const SECTION_NAME = "playback";

interface Props {
  query: string;
  sectionFilter: string;
}

export default function PlaybackSection({ query, sectionFilter }: Props) {
  const playbackOffset = useStore($playbackOffset);
  const timelineOutsideMediaContent = useStore($timelineOutsideMediaContent);
  const showVolumeSlider = useStore($showVolumeSlider);

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const r1 = matches(query, "播放偏移", "以毫秒为单位提前或推迟歌词的时间轴。");
  const r2 = matches(query, "时间轴移出媒体框", "把播放进度条从媒体框移到外侧。");
  const r3 = matches(query, "音量滑杆", "在播放栏显示音量滑杆。");

  if (!r1 && !r2 && !r3) return null;

  return (
    <Section title="播放与控制">
      {r1 && (
        <Row label="播放偏移" stacked>
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
    </Section>
  );
}
