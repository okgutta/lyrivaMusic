import { useStore } from "@nanostores/react";
import { $geniusApiToken } from "../../../utils/stores.ts";
import { matches, NavigationRow, Section } from "./components.tsx";

/** 歌词来源：Genius Token（Genius 兜底源；LYRIVA 主源已内置，无需配置） */
const SECTION_NAME = "lyrics-source";

interface Props {
  query: string;
  sectionFilter: string;
  onOpenDetail: (id: "genius-token") => void;
}

export default function LyricsSourceSection({ query, sectionFilter, onOpenDetail }: Props) {
  const geniusApiToken = useStore($geniusApiToken);

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const rToken = matches(query, "Genius API Token", "Genius 歌词源的 Access Token，配置后 LYRIVA 未命中时自动兜底");

  if (!rToken) return null;

  return (
    <Section title="Genius 兜底源">
      <NavigationRow
        label="Genius API Token"
        description="LYRIVA 未命中时自动使用 Genius 静态歌词"
        value={geniusApiToken ? "已配置" : "未配置"}
        valueState={geniusApiToken ? "ok" : "unset"}
        onClick={() => onOpenDetail("genius-token")}
      />
    </Section>
  );
}
