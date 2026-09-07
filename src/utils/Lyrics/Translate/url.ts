/**
 * Normalize a user-supplied OpenAI-compatible base URL.
 *
 * Remote endpoints must use HTTPS so API keys are never sent in clear text.
 * Plain HTTP is allowed only for loopback development servers.
 */
export function normalizeApiBaseUrl(value: string): string | null {
  const input = value.trim();
  if (!input) return null;

  try {
    const url = new URL(input);
    const loopback =
      url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return null;
    if (url.username || url.password || url.search || url.hash) return null;

    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}
