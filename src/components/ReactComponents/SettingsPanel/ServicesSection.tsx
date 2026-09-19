import { useStore } from "@nanostores/react";
import {
  $customApiBaseUrl,
  $customApiKey,
  $customApiModel,
  $deepSeekApiKey,
  $deepSeekModel,
  $openaiApiKey,
  $openaiModel,
  $translationConcurrency,
  $translationProvider,
  $translationTargetLang,
} from "../../../utils/stores.ts";
import { matches, NavigationRow, Row, Section, SegmentedControl } from "./components.tsx";

const SECTION_NAME = "lyrics-service";

const LANG_LABELS: Record<string, string> = {
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
  fr: "Français",
  de: "Deutsch",
  es: "Español",
  pt: "Português",
  ru: "Русский",
  th: "ไทย",
  vi: "Tiếng Việt",
  id: "Bahasa Indonesia",
  tr: "Türkçe",
  it: "Italiano",
  nl: "Nederlands",
};

const PROVIDER_OPTIONS = ["google", "deepseek", "openai", "custom"];
const PROVIDER_LABELS = ["Google 翻译", "DeepSeek", "ChatGPT", "自定义 API"];
const CONCURRENCY_OPTIONS = ["1", "2", "3", "4", "6"];
// 状态值分色：已配置 = 蓝（accent），未配置 = 弱灰
const PROVIDER_VALUE_OK = "已配置";

type DetailId =
  | "translation-lang"
  | "deepseek-key"
  | "openai-key"
  | "custom-config"
  | "translation-model";

interface Props {
  query: string;
  sectionFilter: string;
  onOpenDetail: (id: DetailId) => void;
}

export default function ServicesSection({ query, sectionFilter, onOpenDetail }: Props) {
  const translationProvider = useStore($translationProvider);
  const translationTargetLang = useStore($translationTargetLang);
  const translationConcurrency = useStore($translationConcurrency);
  const deepSeekApiKey = useStore($deepSeekApiKey);
  const openaiApiKey = useStore($openaiApiKey);
  const customConfigured = Boolean(
    $customApiBaseUrl.get() && $customApiKey.get() && $customApiModel.get()
  );

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const rService = matches(query, "翻译服务", "Google DeepSeek ChatGPT 自定义");
  const r2 = matches(query, "翻译目标语言", "歌词翻译成哪种语言");
  const rKey =
    matches(query, "API Key", "翻译服务的 API Key") ||
    matches(query, "自定义 API", "自定义 OpenAI 兼容端点");
  const rModel = matches(query, "翻译模型", "翻译使用的模型");
  const rConcurrency = matches(query, "翻译并发", "同时发出的请求数 限流");

  if (!rService && !r2 && !rKey && !rModel && !rConcurrency) return null;

  // 翻译模型行的当前值按服务显示
  const modelValue =
    translationProvider === "deepseek"
      ? $deepSeekModel.get()
      : translationProvider === "openai"
        ? $openaiModel.get()
        : translationProvider === "custom"
          ? $customApiModel.get()
          : undefined;

  return (
    <>
      {(rService || r2 || rKey || rModel || rConcurrency) && (
        <Section>
          {rService && (
            <Row label="翻译服务">
              <SegmentedControl
                value={translationProvider}
                options={PROVIDER_OPTIONS}
                labels={PROVIDER_LABELS}
                onChange={(v) => $translationProvider.set(v as typeof translationProvider)}
              />
            </Row>
          )}
          {r2 && (
            <NavigationRow
              label="翻译目标语言"
              value={LANG_LABELS[translationTargetLang] ?? translationTargetLang}
              onClick={() => onOpenDetail("translation-lang")}
            />
          )}

          {/* 各服务的配置行按所选服务条件渲染 */}
          {translationProvider === "deepseek" && rKey && (
            <NavigationRow
              label="DeepSeek API Key"
              value={deepSeekApiKey ? PROVIDER_VALUE_OK : "未配置"}
              valueState={deepSeekApiKey ? "ok" : "unset"}
              onClick={() => onOpenDetail("deepseek-key")}
            />
          )}
          {translationProvider === "openai" && rKey && (
            <NavigationRow
              label="ChatGPT API Key"
              value={openaiApiKey ? PROVIDER_VALUE_OK : "未配置"}
              valueState={openaiApiKey ? "ok" : "unset"}
              onClick={() => onOpenDetail("openai-key")}
            />
          )}
          {translationProvider === "custom" && rKey && (
            <NavigationRow
              label="自定义 API 配置"
              value={customConfigured ? PROVIDER_VALUE_OK : "未配置"}
              valueState={customConfigured ? "ok" : "unset"}
              onClick={() => onOpenDetail("custom-config")}
            />
          )}

          {rModel && translationProvider !== "google" && (
            <NavigationRow
              label="翻译模型"
              value={modelValue}
              onClick={() => onOpenDetail("translation-model")}
            />
          )}

          {rConcurrency && (
            <Row label="翻译并发" description="同时发出的请求数；过高可能被服务端限流">
              <SegmentedControl
                value={String(translationConcurrency)}
                options={CONCURRENCY_OPTIONS}
                labels={CONCURRENCY_OPTIONS}
                onChange={(v) => $translationConcurrency.set(Number(v))}
              />
            </Row>
          )}
        </Section>
      )}
    </>
  );
}
