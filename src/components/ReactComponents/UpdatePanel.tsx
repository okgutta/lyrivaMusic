import type { UpdateState } from "../../updater/contracts.ts";
import UpdateReleaseNotes from "./UpdateReleaseNotes.tsx";

interface Props {
  state: UpdateState;
  automaticUpdates: boolean;
  onCheck: () => void;
  onRetry: () => void;
  onReload: () => void;
  onClose: () => void;
}

const RELEASES_URL = "https://github.com/okgutta/lyrivaMusic/releases/latest";

function releaseLink(value?: string): string {
  if (!value) return RELEASES_URL;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.pathname.startsWith("/okgutta/lyrivaMusic/releases/")
      ? url.href
      : RELEASES_URL;
  } catch {
    return RELEASES_URL;
  }
}

export default function UpdatePanel({
  state,
  automaticUpdates,
  onCheck,
  onRetry,
  onReload,
  onClose,
}: Props) {
  const { phase, latestVersion, loaderUpdateRequired } = state;
  const pending = Boolean(latestVersion && latestVersion !== state.currentVersion);
  const manual = !automaticUpdates || Boolean(loaderUpdateRequired);
  const busy = phase === "checking" || phase === "downloading" || phase === "available";
  const progress =
    typeof state.progress === "number" && Number.isFinite(state.progress)
      ? Math.max(0, Math.min(100, state.progress))
      : undefined;
  const status = manual
    ? loaderUpdateRequired
      ? "下载新版即可继续"
      : "手动更新 lyrivaMusic"
    : phase === "ready"
      ? "新版本已就绪"
      : phase === "downloading"
        ? "正在下载更新"
        : phase === "available"
          ? "发现新版本"
          : phase === "checking"
            ? "正在检查更新"
            : phase === "error"
              ? "更新未完成"
              : "已是最新版本";

  const description = manual
    ? "下载 lyrivamusic.js，替换原文件后运行 spicetify apply。"
    : phase === "ready"
      ? "重新加载后即可使用，也可以留到下次启动。"
      : phase === "downloading" || phase === "available"
        ? "可以继续听歌，下载会在后台完成。"
        : phase === "checking"
          ? "正在获取最新版本信息。"
          : phase === "error"
            ? state.error || "暂时无法连接更新服务，请稍后重试。"
            : "有新版本时，会在这里提醒你。";

  return (
    <div className="sl-update-panel" data-phase={manual ? "manual" : phase}>
      <div className="sl-update-body">
        <div className="sl-update-status" role="status" aria-live="polite" aria-atomic="true">
          <p className="sl-update-brand">lyrivaMusic</p>
          <h2 className="sl-update-status-title">{status}</h2>
          <p className="sl-update-versions">
            <span>
              {pending ? "当前" : "版本"} v{state.currentVersion}
            </span>
            {pending && (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M5 12h14m-5-5 5 5-5 5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="sl-update-next-version" aria-label={`新版本 ${latestVersion}`}>
                  v{latestVersion}
                </span>
              </>
            )}
          </p>
          <p className={phase === "error" && !manual ? "sl-update-error" : "sl-update-description"}>
            {description}
          </p>
        </div>

        {!manual && (phase === "checking" || phase === "downloading" || phase === "available") && (
          <div className="sl-update-progress">
            <progress
              aria-label={phase === "checking" ? "检查更新进度" : "更新下载进度"}
              max={100}
              value={phase === "downloading" ? progress : undefined}
            />
            {phase === "downloading" && typeof progress === "number" && (
              <span aria-hidden="true">{Math.round(progress)}%</span>
            )}
          </div>
        )}

        {pending && state.notes?.trim() && (
          <section className="sl-update-notes" aria-label="版本更新内容">
            <p className="sl-update-section-label">本次更新</p>
            <UpdateReleaseNotes notes={state.notes} />
          </section>
        )}
      </div>

      <div className="sl-update-footer">
        <a
          className="sl-update-release-link"
          href={releaseLink(state.releaseUrl)}
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub 发布页
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M7 17 17 7M7 7h10v10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
        <div className="sl-update-actions">
          {manual ? (
            <a
              className="sl-update-button sl-update-button--primary"
              href={releaseLink(state.releaseUrl)}
              target="_blank"
              rel="noopener noreferrer"
            >
              下载新版
            </a>
          ) : phase === "ready" ? (
            <>
              <button
                type="button"
                className="sl-update-button sl-update-button--quiet"
                onClick={onClose}
              >
                稍后
              </button>
              <button
                type="button"
                className="sl-update-button sl-update-button--primary"
                onClick={onReload}
              >
                重新加载
              </button>
            </>
          ) : phase === "error" ? (
            <button
              type="button"
              className="sl-update-button sl-update-button--primary"
              onClick={onRetry}
            >
              重试
            </button>
          ) : busy ? (
            <button type="button" className="sl-update-button" onClick={onClose}>
              {phase === "checking" ? "关闭" : "后台下载"}
            </button>
          ) : (
            <button type="button" className="sl-update-button" onClick={onCheck}>
              检查更新
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
