import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";
import {
  $customApiBaseUrl,
  $customApiKey,
  $customApiModel,
  $deepSeekApiKey,
  $deepSeekModel,
  $deepSeekModels,
  $deepSeekModelsError,
  $deepSeekModelsLoading,
  $geniusApiToken,
  $lyrivaApiKey,
  $openaiApiKey,
  $openaiModel,
  $translationProvider,
  $translationTargetLang,
} from "../../../utils/stores.ts";
import { fetchModelsForProvider } from "../../../utils/Lyrics/Translate/providers.ts";
import { normalizeApiBaseUrl } from "../../../utils/Lyrics/Translate/url.ts";
import { Row, Select, Section, Input } from "./components.tsx";

/** 二级页外壳：返回按钮 + 内容滚动 */
function DetailShell({
  title,
  onBack,
  children,
  actions,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="sl-sp-detail">
      <div className="sl-sp-detail-header">
        <button type="button" className="sl-sp-back-btn" onClick={onBack} aria-label="返回设置">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M8.5 2.5L4 7l4.5 4.5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          设置
        </button>
      </div>
      <h2 className="sl-sp-detail-title">{title}</h2>
      <div className="sl-sp-detail-body">{children}</div>
      {actions && <div className="sl-sp-detail-footer">{actions}</div>}
    </div>
  );
}

function DetailActionBar({
  dirty,
  configured,
  children,
}: {
  dirty: boolean;
  configured: boolean;
  children: React.ReactNode;
}) {
  const status = dirty ? "有未保存的更改" : configured ? "已保存" : "尚未配置";
  return (
    <>
      <span
        className={`sl-sp-save-status${dirty ? " sl-sp-save-status--dirty" : ""}`}
        role="status"
        aria-live="polite"
      >
        {status}
      </span>
      <div className="sl-sp-inline-controls sl-sp-detail-actions">{children}</div>
    </>
  );
}

/** 保存/清除 Genius Token 的通用反馈 */
function notify(message: string): void {
  try {
    Spicetify.showNotification(message);
  } catch {
    /* ignore */
  }
}

export function DetailLyrivaApiKey({ onBack }: { onBack: () => void }) {
  const lyrivaApiKey = useStore($lyrivaApiKey);
  const [draft, setDraft] = useState(lyrivaApiKey);
  const normalizedDraft = draft.trim();
  const dirty = normalizedDraft !== lyrivaApiKey;

  return (
    <DetailShell
      title="Lyriva API Key"
      onBack={onBack}
      actions={
        <DetailActionBar dirty={dirty} configured={Boolean(lyrivaApiKey)}>
          <button
            type="button"
            className="sl-sp-btn sl-sp-btn--primary"
            disabled={!normalizedDraft || !dirty}
            onClick={() => {
              $lyrivaApiKey.set(normalizedDraft);
              setDraft(normalizedDraft);
              notify("已保存 Lyriva API Key");
            }}
          >
            保存
          </button>
          <button
            type="button"
            className="sl-sp-btn"
            disabled={!lyrivaApiKey && !draft}
            onClick={() => {
              $lyrivaApiKey.set("");
              setDraft("");
              notify("已清除 Lyriva API Key");
            }}
          >
            清除 API Key
          </button>
        </DetailActionBar>
      }
    >
      <Section description="密钥保存在本机 Spicetify 设置中，不会写入插件构建产物。请求优先直连；服务端未允许 Spotify CORS 时回退到 Spicetify 代理。">
        <Row
          label="API Key"
          description="在 lyriva.xyz/dashboard/keys 创建，需具备 lyrics:read 权限"
          stacked
        >
          <Input type="password" value={draft} placeholder="lk_live_..." onChange={setDraft} />
        </Row>
      </Section>
    </DetailShell>
  );
}

export function DetailGeniusToken({ onBack }: { onBack: () => void }) {
  const geniusApiToken = useStore($geniusApiToken);
  const [draft, setDraft] = useState(geniusApiToken);
  const normalizedDraft = draft.trim();
  const dirty = normalizedDraft !== geniusApiToken;

  return (
    <DetailShell
      title="Genius API Token"
      onBack={onBack}
      actions={
        <DetailActionBar dirty={dirty} configured={Boolean(geniusApiToken)}>
          <button
            type="button"
            className="sl-sp-btn sl-sp-btn--primary"
            disabled={!normalizedDraft || !dirty}
            onClick={() => {
              $geniusApiToken.set(normalizedDraft);
              setDraft(normalizedDraft);
              notify("已保存 Genius API Token");
            }}
          >
            保存
          </button>
          <button
            type="button"
            className="sl-sp-btn"
            disabled={!geniusApiToken && !draft}
            onClick={() => {
              $geniusApiToken.set("");
              setDraft("");
              notify("已清除 Genius API Token");
            }}
          >
            清除 Token
          </button>
        </DetailActionBar>
      }
    >
      <Section>
        <Row
          label="Token"
          description="在 genius.com/api-clients 创建 Client 后获取 Access Token"
          stacked
        >
          <Input
            type="password"
            value={draft}
            placeholder="Genius Access Token"
            onChange={setDraft}
          />
        </Row>
      </Section>
    </DetailShell>
  );
}

const LANG_OPTIONS = [
  "zh-CN",
  "zh-TW",
  "en",
  "ja",
  "ko",
  "fr",
  "de",
  "es",
  "pt",
  "ru",
  "th",
  "vi",
  "id",
  "tr",
  "it",
  "nl",
];
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

export function DetailTranslationLanguage({ onBack }: { onBack: () => void }) {
  const target = useStore($translationTargetLang);

  return (
    <DetailShell title="翻译目标语言" onBack={onBack}>
      <Section>
        {LANG_OPTIONS.map((lang) => {
          const active = lang === target;
          return (
            <button
              key={lang}
              type="button"
              className={`sl-sp-choice-row${active ? " sl-sp-choice-row--active" : ""}`}
              aria-pressed={active}
              onClick={() => $translationTargetLang.set(lang)}
            >
              <span className="sl-sp-choice-label">{LANG_LABELS[lang] ?? lang}</span>
              {active && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M2.5 7.5L5.5 10.5L11.5 3.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          );
        })}
      </Section>
    </DetailShell>
  );
}

export function DetailDeepSeekKey({ onBack }: { onBack: () => void }) {
  const deepSeekApiKey = useStore($deepSeekApiKey);
  const [draft, setDraft] = useState(deepSeekApiKey);
  const normalizedDraft = draft.trim();
  const dirty = normalizedDraft !== deepSeekApiKey;

  return (
    <DetailShell
      title="DeepSeek API Key"
      onBack={onBack}
      actions={
        <DetailActionBar dirty={dirty} configured={Boolean(deepSeekApiKey)}>
          <button
            type="button"
            className="sl-sp-btn sl-sp-btn--primary"
            disabled={!normalizedDraft || !dirty}
            onClick={() => {
              $deepSeekApiKey.set(normalizedDraft);
              setDraft(normalizedDraft);
              notify("已保存 DeepSeek API Key");
            }}
          >
            保存
          </button>
          <button
            type="button"
            className="sl-sp-btn"
            disabled={!deepSeekApiKey && !draft}
            onClick={() => {
              $deepSeekApiKey.set("");
              setDraft("");
              notify("已清除 DeepSeek API Key");
            }}
          >
            清除 API Key
          </button>
        </DetailActionBar>
      }
    >
      <Section>
        <Row label="API Key" description="在 platform.deepseek.com 创建 API Key" stacked>
          <Input type="password" value={draft} placeholder="sk-..." onChange={setDraft} />
        </Row>
      </Section>
    </DetailShell>
  );
}

export function DetailTranslationModel({ onBack }: { onBack: () => void }) {
  const provider = useStore($translationProvider);
  const deepSeekModel = useStore($deepSeekModel);
  const deepSeekModels = useStore($deepSeekModels);
  const modelsLoading = useStore($deepSeekModelsLoading);
  const modelsError = useStore($deepSeekModelsError);
  const deepSeekApiKey = useStore($deepSeekApiKey);
  const openaiApiKey = useStore($openaiApiKey);
  const openaiModel = useStore($openaiModel);
  const customApiBaseUrl = useStore($customApiBaseUrl);
  const customApiKey = useStore($customApiKey);
  const customApiModel = useStore($customApiModel);
  const [refreshTick, setRefreshTick] = useState(0);

  const isCustom = provider === "custom";
  const hasKey =
    provider === "deepseek"
      ? Boolean(deepSeekApiKey.trim())
      : provider === "openai"
        ? Boolean(openaiApiKey.trim())
        : Boolean(customApiBaseUrl.trim() && customApiKey.trim() && customApiModel.trim());
  const providerLabel =
    provider === "deepseek" ? "DeepSeek" : provider === "openai" ? "ChatGPT" : "自定义 API";

  // deepseek/openai：填好 Key 后自动拉取可用模型列表（防抖 600ms）；custom 为自由输入
  useEffect(() => {
    if (isCustom) return;
    const key = (provider === "deepseek" ? deepSeekApiKey : openaiApiKey).trim();
    if (!key) {
      $deepSeekModels.set([]);
      $deepSeekModelsError.set(null);
      $deepSeekModelsLoading.set(false);
      return;
    }
    let cancelled = false;
    $deepSeekModels.set([]);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      $deepSeekModelsLoading.set(true);
      $deepSeekModelsError.set(null);
      fetchModelsForProvider(key, controller.signal)
        .then((ids: string[]) => {
          if (!cancelled) $deepSeekModels.set(ids);
        })
        .catch((err: unknown) => {
          if (!cancelled && !controller.signal.aborted) {
            $deepSeekModelsError.set(err instanceof Error ? err.message : String(err));
          }
        })
        .finally(() => {
          if (!cancelled) $deepSeekModelsLoading.set(false);
        });
    }, 600);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
      $deepSeekModelsLoading.set(false);
    };
  }, [provider, deepSeekApiKey, openaiApiKey, refreshTick, isCustom]);

  const currentModel =
    provider === "deepseek" ? deepSeekModel : provider === "openai" ? openaiModel : customApiModel;
  const setModel = (v: string) => {
    if (provider === "deepseek") $deepSeekModel.set(v);
    else if (provider === "openai") $openaiModel.set(v);
    else $customApiModel.set(v);
  };

  const modelOptions = isCustom
    ? []
    : deepSeekModels.includes(currentModel)
      ? deepSeekModels
      : [...deepSeekModels, currentModel];

  const modelDescription = !hasKey
    ? `请先配置 ${providerLabel} API Key`
    : isCustom
      ? "输入你的 API 所支持的模型名称"
      : modelsLoading
        ? `正在从 ${providerLabel} 获取模型列表…`
        : modelsError
          ? "模型列表获取失败，可点「刷新」重试"
          : `从 ${providerLabel} API 读取的可用模型；点「刷新」重新获取`;

  return (
    <DetailShell title="翻译模型" onBack={onBack}>
      <Section>
        <Row
          label="模型"
          description={modelDescription}
          disabled={!hasKey}
          disabledReason={`请先配置 ${providerLabel} API Key`}
          stacked
        >
          {isCustom ? (
            <Input
              value={currentModel}
              placeholder="模型名称"
              onChange={(v) => $customApiModel.set(v)}
            />
          ) : (
            <div className="sl-sp-inline-controls">
              <Select
                value={currentModel}
                options={modelOptions}
                onChange={(v) => setModel(v)}
                disabled={!hasKey || modelsLoading}
              />
              <button
                type="button"
                className="sl-sp-refresh"
                onClick={() => setRefreshTick((t) => t + 1)}
                disabled={!hasKey || modelsLoading}
              >
                刷新
              </button>
            </div>
          )}
        </Row>
      </Section>
    </DetailShell>
  );
}

export function DetailOpenAIConfig({ onBack }: { onBack: () => void }) {
  const openaiApiKey = useStore($openaiApiKey);
  const [draft, setDraft] = useState(openaiApiKey);
  const normalizedDraft = draft.trim();
  const dirty = normalizedDraft !== openaiApiKey;

  return (
    <DetailShell
      title="ChatGPT API Key"
      onBack={onBack}
      actions={
        <DetailActionBar dirty={dirty} configured={Boolean(openaiApiKey)}>
          <button
            type="button"
            className="sl-sp-btn sl-sp-btn--primary"
            disabled={!normalizedDraft || !dirty}
            onClick={() => {
              $openaiApiKey.set(normalizedDraft);
              setDraft(normalizedDraft);
              notify("已保存 ChatGPT API Key");
            }}
          >
            保存
          </button>
          <button
            type="button"
            className="sl-sp-btn"
            disabled={!openaiApiKey && !draft}
            onClick={() => {
              $openaiApiKey.set("");
              setDraft("");
              notify("已清除 ChatGPT API Key");
            }}
          >
            清除 API Key
          </button>
        </DetailActionBar>
      }
    >
      <Section>
        <Row label="API Key" description="在 platform.openai.com/api-keys 创建 API Key" stacked>
          <Input type="password" value={draft} placeholder="sk-..." onChange={setDraft} />
        </Row>
      </Section>
    </DetailShell>
  );
}

export function DetailCustomConfig({ onBack }: { onBack: () => void }) {
  const baseUrl = useStore($customApiBaseUrl);
  const apiKey = useStore($customApiKey);
  const model = useStore($customApiModel);
  const [draftUrl, setDraftUrl] = useState(baseUrl);
  const [draftKey, setDraftKey] = useState(apiKey);
  const [draftModel, setDraftModel] = useState(model);
  const normalizedKey = draftKey.trim();
  const normalizedModel = draftModel.trim();
  const dirty =
    draftUrl.trim() !== baseUrl || normalizedKey !== apiKey || normalizedModel !== model;
  const canSave = Boolean(draftUrl.trim() && normalizedKey && normalizedModel && dirty);
  const configured = Boolean(baseUrl || apiKey || model);

  return (
    <DetailShell
      title="自定义 API"
      onBack={onBack}
      actions={
        <DetailActionBar dirty={dirty} configured={configured}>
          <button
            type="button"
            className="sl-sp-btn sl-sp-btn--primary"
            disabled={!canSave}
            onClick={() => {
              const normalizedUrl = normalizeApiBaseUrl(draftUrl);
              if (!normalizedUrl) {
                notify("API 地址必须使用 HTTPS（仅 localhost 可使用 HTTP）");
                return;
              }
              $customApiBaseUrl.set(normalizedUrl);
              setDraftUrl(normalizedUrl);
              $customApiKey.set(normalizedKey);
              $customApiModel.set(normalizedModel);
              notify("已保存自定义 API 配置");
            }}
          >
            保存
          </button>
          <button
            type="button"
            className="sl-sp-btn"
            disabled={!configured && !draftUrl && !draftKey && !draftModel}
            onClick={() => {
              $customApiBaseUrl.set("");
              $customApiKey.set("");
              $customApiModel.set("");
              setDraftUrl("");
              setDraftKey("");
              setDraftModel("");
              notify("已清除自定义 API 配置");
            }}
          >
            清除配置
          </button>
        </DetailActionBar>
      }
    >
      <Section>
        <Row
          label="API 地址"
          description="OpenAI 兼容端点的 Base URL（含 /v1）；远程地址必须使用 HTTPS"
          stacked
        >
          <Input value={draftUrl} placeholder="https://api.example.com/v1" onChange={setDraftUrl} />
        </Row>
        <Row label="API Key" stacked>
          <Input type="password" value={draftKey} placeholder="API Key" onChange={setDraftKey} />
        </Row>
        <Row label="模型" description="该服务支持的模型名称" stacked>
          <Input value={draftModel} placeholder="模型名称" onChange={setDraftModel} />
        </Row>
      </Section>
    </DetailShell>
  );
}
