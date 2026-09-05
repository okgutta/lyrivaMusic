import { useStore } from "@nanostores/react";
import { $experiment, EXPERIMENTS, type RegisteredExperiment } from "../../../utils/experiments.ts";
import { matches, Row, Section, Toggle } from "./components.tsx";

const SECTION_NAME = "advanced";

const LABEL = "实验功能";
const DESCRIPTION = "尝试尚未完成的功能，如果不喜欢可以随时切换回旧行为。";

interface Props {
  query: string;
  sectionFilter: string;
}

/** 实验功能：直接平铺在「高级」分类里，渲染自 EXPERIMENTS 注册表（新增实验自动出现） */
export default function ExperimentsSection({ query, sectionFilter }: Props) {
  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  // 按实验自己的名称搜索也应显示这一组，否则这些开关在搜索框下不可见
  const hit =
    matches(query, LABEL, DESCRIPTION) ||
    EXPERIMENTS.some((exp) => matches(query, exp.label, exp.description));

  // 显式放宽为 number：EXPERIMENTS 是 as const，length 推导为字面量 1，与 0 比较会被 TS 判定无交集
  const count: number = EXPERIMENTS.length;
  if (!hit || count === 0) return null;

  return (
    <Section title="实验功能">

      {EXPERIMENTS.map((exp) => (
        <ExperimentRow key={exp.id} experiment={exp} />
      ))}
    </Section>
  );
}

function ExperimentRow({ experiment }: { experiment: RegisteredExperiment }) {
  const store = $experiment(experiment.id);
  const enabled = useStore(store);

  return (
    <Row label={experiment.label} description={experiment.description}>
      <Toggle checked={enabled} onChange={(v) => store.set(v)} />
    </Row>
  );
}
