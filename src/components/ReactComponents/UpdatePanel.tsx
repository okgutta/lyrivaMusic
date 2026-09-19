import type { UpdateState } from "../../updater/contracts.ts";

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
  const manual = !automaticUpdates || loaderUpdateRequired;
  const busy = phase === "checking" || phase === "downloading" || phase === "available";
  const progress =
    typeof state.progress === "number" && Number.isFinite(state.progress)
      ? Math.max(0, Math.min(100, state.progress))
      : undefined;
  const status = manual
    ? loaderUpdateRequired
      ? "需要更新安装程序"
      : "当前使用手动安装版"
    : phase === "ready"
      ? "更新已下载"
      : phase === "downloading"
        ? "正在下载更新"
        : phase === "available"
          ? "发现新版本，正在准备下载"
          : phase === "checking"
            ? "正在检查更新"
            : phase === "error"
              ? "更新未完成"
              : "当前已是最新版本";

  return (
    <div className="sl-update-panel">
      <dl className="sl-update-versions">
        <div>
          <dt>当前版本</dt>
          <dd>v{state.currentVersion}</dd>
        </div>
        {pending && (
          <div>
            <dt>新版本</dt>
            <dd>v{latestVersion}</dd>
          </div>
        )}
      </dl>

      <div className="sl-update-status" role="status" aria-live="polite" aria-atomic="true">
        <p className="sl-update-status-title">{status}</p>
        {manual ? (
          <p className="sl-update-description">
            {loaderUpdateRequired
              ? "请从发布页下载安装程序，完成后重新加载 Spotify。"
              : "从发布页下载扩展，替换已安装的文件并运行 spicetify apply。"}
          </p>
        ) : phase === "ready" ? (
          <p className="sl-update-description">重新加载 Spotify 后生效。也可以稍后再加载。</p>
        ) : phase === "downloading" || phase === "available" ? (
          <p className="sl-update-description">关闭窗口后会继续下载，完成后可在设置中重新加载。</p>
        ) : phase === "error" ? (
          <p className="sl-update-error">{state.error || "暂时无法获取更新，请稍后重试。"}</p>
        ) : null}
      </div>

      {!manual && (phase === "downloading" || phase === "available") && (
        <div className="sl-update-progress">
          <progress aria-label="更新下载进度" max={100} value={progress} />
          <span aria-hidden="true">
            {progress === undefined ? "下载中…" : `${Math.round(progress)}%`}
          </span>
        </div>
      )}

      {pending && state.notes?.trim() && (
        <section className="sl-update-notes" aria-label="版本更新内容">
          <h2>更新内容</h2>
          <p>{state.notes}</p>
        </section>
      )}

      <div className="sl-update-footer">
        <a
          className="sl-update-release-link"
          href={releaseLink(state.releaseUrl)}
          target="_blank"
          rel="noopener noreferrer"
        >
          查看发布页
        </a>
        <div className="sl-update-actions">
          {manual ? (
            <button type="button" className="sl-sp-btn" onClick={onClose}>
              关闭
            </button>
          ) : phase === "ready" ? (
            <>
              <button type="button" className="sl-sp-btn" onClick={onClose}>
                稍后
              </button>
              <button type="button" className="sl-sp-btn sl-sp-btn--primary" onClick={onReload}>
                重新加载
              </button>
            </>
          ) : phase === "error" ? (
            <button type="button" className="sl-sp-btn sl-sp-btn--primary" onClick={onRetry}>
              重试
            </button>
          ) : busy ? (
            <button type="button" className="sl-sp-btn" onClick={onClose}>
              稍后
            </button>
          ) : (
            <button type="button" className="sl-sp-btn" onClick={onCheck}>
              检查更新
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
