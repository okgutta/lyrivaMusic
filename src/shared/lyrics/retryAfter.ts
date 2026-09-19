/** Pure Retry-After parsing shared by extension and standalone client. */

/**
 * Parse an HTTP `Retry-After` header into milliseconds.
 * 支持两种合法写法：delta-seconds（`"4"`）与 HTTP-date（`"Wed, 21 Oct 2015 07:28:00 GMT"`）。
 * 缺失或无法解析返回 null；已过期返回 0（立即重试）。
 */
export function parseRetryAfterMs(
  value: string | null | undefined,
  now = Date.now()
): number | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw) * 1000;
  // HTTP-date 三种合法格式（IMF-fixdate / RFC 850 / asctime）都含月份或星期缩写。
  // 先挡掉非日期串：V8 会把 "-1" 这类输入宽容解析成一个过去的年份而不是 NaN。
  if (!/[a-z]/i.test(raw)) return null;
  const timestamp = Date.parse(raw);
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, timestamp - now);
}
