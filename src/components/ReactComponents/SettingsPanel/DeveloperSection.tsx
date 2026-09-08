import { useStore } from "@nanostores/react";
import { $developerMode } from "../../../utils/stores.ts";
import { matches, Row, Section, Toggle } from "./components.tsx";

const SECTION_NAME = "advanced";

interface Props {
  query: string;
  sectionFilter: string;
}

export default function DeveloperSection({ query, sectionFilter }: Props) {
  const developerMode = useStore($developerMode);

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const r1 = matches(query, "开发者模式", "启用结构化控制台日志和调试工具。");

  if (!r1) return null;

  return (
    <Section title="开发者">
      {r1 && (
        <Row label="开发者模式" description="在 DevTools 控制台输出结构化诊断信息">
          <Toggle checked={developerMode} onChange={(v) => $developerMode.set(v)} />
        </Row>
      )}
    </Section>
  );
}
