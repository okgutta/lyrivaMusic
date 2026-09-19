export const LATEST_RELEASE_URL =
  "https://api.github.com/repos/okgutta/lyrivaMusic/releases/latest";
export const MAX_RUNTIME_BYTES = 12 * 1024 * 1024;
const RAW_ROOT = "https://raw.githubusercontent.com/okgutta/lyrivaMusic/updates/versions";
const RELEASE_ROOT = "https://github.com/okgutta/lyrivaMusic/releases/tag";
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export interface Release {
  tag: string;
  version: string;
  notes: string;
  url: string;
}
export interface UpdateManifest {
  schema: 1;
  version: string;
  loaderVersion: number;
  runtime: { url: string; sha256: string; size: number };
}

export function stableVersion(value: unknown): value is string {
  return (
    typeof value === "string" &&
    VERSION.test(value) &&
    value.split(".").every((part) => Number.isSafeInteger(Number(part)))
  );
}

export function compareVersions(left: string, right: string): number {
  if (!stableVersion(left) || !stableVersion(right)) throw new Error("版本号无效");
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

export function parseRelease(value: unknown): Release | null {
  const data = value as Record<string, unknown> | null;
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("GitHub 版本信息无效");
  if (data.draft === true || data.prerelease === true) return null;
  if (data.draft !== false || data.prerelease !== false || typeof data.tag_name !== "string")
    throw new Error("GitHub 版本信息不完整");
  const tag = data.tag_name;
  const version = tag.startsWith("v") ? tag.slice(1) : tag;
  if (!stableVersion(version)) throw new Error("仅支持正式发布的语义版本号");
  return {
    tag,
    version,
    notes: typeof data.body === "string" ? data.body.slice(0, 50000) : "",
    url: `${RELEASE_ROOT}/${tag}`,
  };
}

export function manifestUrl(release: Release): string {
  return `${RAW_ROOT}/${release.tag}/manifest.json`;
}

export function parseManifest(value: unknown, release: Release): UpdateManifest {
  const data = value as Partial<UpdateManifest> | null;
  const runtime = data?.runtime;
  if (
    !data ||
    data.schema !== 1 ||
    data.version !== release.version ||
    !Number.isSafeInteger(data.loaderVersion) ||
    Number(data.loaderVersion) < 1 ||
    !runtime ||
    runtime.url !== `${RAW_ROOT}/${release.tag}/lyrivamusic-runtime.js` ||
    typeof runtime.sha256 !== "string" ||
    !/^[a-f\d]{64}$/i.test(runtime.sha256) ||
    !Number.isSafeInteger(runtime.size) ||
    runtime.size <= 0 ||
    runtime.size > MAX_RUNTIME_BYTES
  )
    throw new Error("更新清单无效，已保留当前版本");
  return {
    schema: 1,
    version: data.version,
    loaderVersion: data.loaderVersion!,
    runtime: { ...runtime, sha256: runtime.sha256.toLowerCase() },
  };
}

export async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifiedRuntime(
  bytes: Uint8Array<ArrayBuffer>,
  expected: { sha256: string; size: number }
): Promise<string> {
  if (
    bytes.byteLength !== expected.size ||
    bytes.byteLength > MAX_RUNTIME_BYTES ||
    (await sha256(bytes)) !== expected.sha256.toLowerCase()
  )
    throw new Error("更新文件校验失败，已保留当前版本");
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error("更新文件编码无效，已保留当前版本");
  }
}

/** No credentials or redirects; the deadline covers headers and the entire body. */
export async function requestBytes(
  request: typeof fetch,
  url: string,
  maximum: number,
  progress?: (percent: number) => void,
  allowMissing = false,
  timeoutMs = 20000
): Promise<Uint8Array<ArrayBuffer> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await request(url, {
      headers: { Accept: url === LATEST_RELEASE_URL ? "application/vnd.github+json" : "*/*" },
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: controller.signal,
    });
    if (allowMissing && response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        response.status === 403 || response.status === 429
          ? `更新检查受到限流（${response.status}），请稍后重试`
          : `更新服务暂不可用（${response.status}），请稍后重试`
      );
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maximum) {
      await response.body?.cancel();
      throw new Error("更新文件超出大小限制");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("更新文件内容为空");
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        length += item.value.byteLength;
        if (length > maximum) throw new Error("更新文件超出大小限制");
        chunks.push(item.value);
        progress?.(Math.min(100, Math.round((length / maximum) * 100)));
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    if (controller.signal.aborted) throw new Error("更新请求超时，请稍后重试");
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("更新请求超时，请稍后重试");
    if (error instanceof TypeError) throw new Error("无法连接更新服务，请检查网络后重试");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function requestJson(
  request: typeof fetch,
  url: string,
  allowMissing = false
): Promise<unknown> {
  const bytes = await requestBytes(request, url, 1024 * 1024, undefined, allowMissing);
  if (bytes === null) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("更新服务返回了无效的版本信息");
  }
}
