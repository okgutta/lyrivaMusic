import assert from "node:assert/strict";
import {
  canRetryLyricsNotice,
  classifyLyricsFailure,
  lyricsFailureMessage,
} from "./lyricsFailure.ts";

for (const [reason, expected] of [
  [new Error("LYRIVA 请求超时"), "timeout"],
  ["LYRIVA 请求限流（429）", "rate-limit"],
  [new TypeError("Failed to fetch"), "network"],
  ["LYRIVA 服务端错误（503）", "service"],
  ["LYRIVA 响应缺少 data", "service"],
  ["LYRIVA 服务暂时拒绝访问，请稍后重试", "service"],
] as const) {
  assert.equal(classifyLyricsFailure(reason), expected);
}
const privateError = "<script>private-token</script> https://secret.example/api";
assert.equal(classifyLyricsFailure(privateError), "unknown");
assert.equal(lyricsFailureMessage(classifyLyricsFailure(privateError)).includes("secret"), false);
for (const descriptor of ["unknown-error", "offline", "status-not-200"]) {
  assert.equal(canRetryLyricsNotice(descriptor), true);
}
for (const descriptor of [
  "lyrics-not-found",
  "dj",
  "local-track",
  "video-track",
  "episode-track",
  "mixed-track",
  "unknown-track",
]) {
  assert.equal(canRetryLyricsNotice(descriptor), false);
}
console.log("Lyrics failure presentation tests passed");
