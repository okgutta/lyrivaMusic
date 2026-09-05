import { useStore } from "@nanostores/react";
import {
  $customApiBaseUrl,
  $customApiKey,
  $customApiModel,
  $deepSeekApiKey,
  $deepSeekModel,
  $openaiApiKey,
  $openaiModel,
  $translationEnabled,
  $translationProvider,
  $translationTargetLang,
} from "../../../utils/stores.ts";
import { matches, NavigationRow, Row, Section, SegmentedControl, Toggle } from "./components.tsx";

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
// 状态值分色：已配置 = 蓝（accent），未配置 = 弱灰
const PROVIDER_VALUE_OK = "已配置";

type DetailId =
  | "genius-token"
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
  const translationEnabled = useStore($translationEnabled);
  const translationProvider = useStore($translationProvider);
  const translationTargetLang = useStore($translationTargetLang);
  const deepSeekApiKey = useStore($deepSeekApiKey);
  const openaiApiKey = useStore($openaiApiKey);
  const customConfigured = Boolean(
    $customApiBaseUrl.get() && $customApiKey.get() && $customApiModel.get()
  );

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const r1 = matches(query, "歌词翻译", "把歌词翻译成目标语言");
  const rService = matches(query, "翻译服务", "Google DeepSeek ChatGPT 自定义");
  const r2 = matches(query, "翻译目标语言", "歌词翻译成哪种语言");
  const rKey =
    matches(query, "API Key", "翻译服务的 API Key") ||
    matches(query, "自定义 API", "自定义 OpenAI 兼容端点");
  const rModel = matches(query, "翻译模型", "翻译使用的模型");

  if (!r1 && !rService && !r2 && !rKey && !rModel) return null;

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
      {/* ── 主开关 + 翻译服务：页面最醒目的两层 ── */}
      <Section>
        <Row label="歌词翻译">
          <Toggle checked={translationEnabled} onChange={(v) => $translationEnabled.set(v)} />
        </Row>
        {rService && (
          <Row label="翻译服务" stacked>
            <SegmentedControl
              value={translationProvider}
              options={PROVIDER_OPTIONS}
              labels={PROVIDER_LABELS}
              onChange={(v) => $translationProvider.set(v as typeof translationProvider)}
              disabled={!translationEnabled}
            />
          </Row>
        )}
      </Section>

      {/* ── 翻译配置 ── */}
      {(r2 || rKey || rModel) && (
        <Section title="翻译配置">
          {r2 && (
            <NavigationRow
              label="翻译目标语言"
              value={LANG_LABELS[translationTargetLang] ?? translationTargetLang}
              disabled={!translationEnabled}
              disabledReason="请先启用「歌词翻译」再修改此项"
              onClick={() => onOpenDetail("translation-lang")}
            />
          )}

          {/* 各服务的配置行按所选服务条件渲染 */}
          {translationEnabled && translationProvider === "deepseek" && rKey && (
            <NavigationRow
              label="DeepSeek API Key"
              value={deepSeekApiKey ? PROVIDER_VALUE_OK : "未配置"}
              valueState={deepSeekApiKey ? "ok" : "unset"}
              onClick={() => onOpenDetail("deepseek-key")}
            />
          )}
          {translationEnabled && translationProvider === "openai" && rKey && (
            <NavigationRow
              label="ChatGPT API Key"
              value={openaiApiKey ? PROVIDER_VALUE_OK : "未配置"}
              valueState={openaiApiKey ? "ok" : "unset"}
              onClick={() => onOpenDetail("openai-key")}
            />
          )}
          {translationEnabled && translationProvider === "custom" && rKey && (
            <NavigationRow
              label="自定义 API 配置"
              value={customConfigured ? PROVIDER_VALUE_OK : "未配置"}
              valueState={customConfigured ? "ok" : "unset"}
              onClick={() => onOpenDetail("custom-config")}
            />
          )}

          {/* Google 免费翻译无需任何配置 */}
          {translationEnabled && translationProvider === "google" && rKey && (
            <Row label="API Key" description="Google 免费翻译无需配置">
              <span
                className="sl-sp-nav-value-text"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                无需配置
              </span>
            </Row>
          )}

          {rModel && translationEnabled && translationProvider !== "google" && (
            <NavigationRow
              label="翻译模型"
              value={modelValue}
              disabled={!translationEnabled}
              disabledReason="请先启用「歌词翻译」再修改此项"
              onClick={() => onOpenDetail("translation-model")}
            />
          )}
        </Section>
      )}
    </>
  );
}
