import { useStore } from "@nanostores/react";
import { $updateState, openUpdatesPanel } from "../../../utils/updates.tsx";
import { matches, NavigationRow, Section } from "./components.tsx";

export default function UpdateSection({
  query,
  sectionFilter,
}: {
  query: string;
  sectionFilter: string;
}) {
  const state = useStore($updateState);
  if (sectionFilter !== "All" && sectionFilter !== "advanced") return null;
  if (!matches(query, "版本与更新", "检查更新 自动下载 重新加载")) return null;
  const pending = state.latestVersion && state.latestVersion !== state.currentVersion;
  const value = pending
    ? `v${state.currentVersion} → v${state.latestVersion}`
    : `v${state.currentVersion}`;
  const description =
    state.phase === "ready"
      ? "更新已下载，重新加载后生效"
      : state.phase === "downloading"
        ? "正在下载更新"
        : undefined;
  return (
    <Section>
      <NavigationRow
        label="版本与更新"
        value={value}
        description={description}
        onClick={openUpdatesPanel}
      />
    </Section>
  );
}
