import { useStore } from "@nanostores/react";
import {
  $customApiBaseUrl,
  $customApiKey,
  $customApiModel,
  $deepSeekApiKey,
  $deepSeekModel,
  $geniusApiToken,
  $openaiApiKey,
  $openaiModel,
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
  const translationProvider = useStore($translationProvider);
  const translationTargetLang = useStore($translationTargetLang);
  const deepSeekApiKey = useStore($deepSeekApiKey);
  const openaiApiKey = useStore($openaiApiKey);
  const geniusApiToken = useStore($geniusApiToken);
  const customConfigured = Boolean(
    $customApiBaseUrl.get() && $customApiKey.get() && $customApiModel.get()
  );

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const r1 = matches(query, "自动显示歌词翻译", "已有译文自动显示，无译文时按需翻译");
  const rSource = matches(query, "Genius API Token", "Genius 歌词来源 LYRIVA 未命中时自动兜底");
  const rService = matches(query, "翻译服务", "Google DeepSeek ChatGPT 自定义");
  const r2 = matches(query, "翻译目标语言", "歌词翻译成哪种语言");
  const rKey =
    matches(query, "API Key", "翻译服务的 API Key") ||
    matches(query, "自定义 API", "自定义 OpenAI 兼容端点");
  const rModel = matches(query, "翻译模型", "翻译使用的模型");

  if (!r1 && !rSource && !rService && !r2 && !rKey && !rModel) return null;

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
      {r1 && (
        <div className="sl-sp-info-banner" role="note">
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.4" />
            <path d="M9 8v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="9" cy="5.5" r="0.8" fill="currentColor" />
          </svg>
          <div>
            <strong>译文会自动显示</strong>
            <span>歌曲没有译文时，才需要在歌词页点击翻译按钮。</span>
          </div>
        </div>
      )}

      {rSource && (
        <Section
          title="歌词来源"
          description="LYRIVA 是内置主源；Genius 只在主源未命中时提供静态歌词。"
        >
          <NavigationRow
            label="Genius API Token"
            description="LYRIVA 未命中时自动使用 Genius 静态歌词"
            value={geniusApiToken ? "已配置" : "未配置"}
            valueState={geniusApiToken ? "ok" : "unset"}
            onClick={() => onOpenDetail("genius-token")}
          />
        </Section>
      )}

      {rService && (
        <Section title="按需翻译">
          {rService && (
            <Row label="翻译服务" stacked>
              <SegmentedControl
                value={translationProvider}
                options={PROVIDER_OPTIONS}
                labels={PROVIDER_LABELS}
                onChange={(v) => $translationProvider.set(v as typeof translationProvider)}
              />
            </Row>
          )}
        </Section>
      )}

      {/* ── 翻译配置 ── */}
      {(r2 || rKey || rModel) && (
        <Section title="翻译配置">
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

          {/* Google 免费翻译无需任何配置 */}
          {translationProvider === "google" && rKey && (
            <Row label="API Key" description="Google 免费翻译无需配置">
              <span
                className="sl-sp-nav-value-text"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                无需配置
              </span>
            </Row>
          )}

          {rModel && translationProvider !== "google" && (
            <NavigationRow
              label="翻译模型"
              value={modelValue}
              onClick={() => onOpenDetail("translation-model")}
            />
          )}
        </Section>
      )}
    </>
  );
}
