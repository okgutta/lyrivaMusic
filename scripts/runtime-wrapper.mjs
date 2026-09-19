// Creator's stock wrapper waits for one-time events. A cached runtime may be
// loaded after those events, so keep its compiled body and use a state check.
export function wrapRuntime(compiled) {
  const start = "/* --- START --- */";
  const end = "/* --- END --- */";
  if (compiled.split(start).length !== 2 || compiled.split(end).length !== 2) {
    throw new Error("Unexpected Spicetify Creator wrapper; refusing to publish a broken runtime.");
  }
  const body = compiled.slice(compiled.indexOf(start) + start.length, compiled.indexOf(end));
  if (!body.trim().startsWith("(async function()") || !body.includes('"slstyles"')) {
    throw new Error("Runtime body or embedded styles are missing.");
  }
  return `(async () => {
    if (window.__LYRIVA_RUNTIME_STARTED__) return;
    window.__LYRIVA_RUNTIME_STARTED__ = true;
    try {
      const deadline = Date.now() + 60000;
      while (true) {
        const s = window.Spicetify;
        if (s?.React && s?.ReactJSX && s?.ReactDOM && s?.Platform && s?.Player && s?.CosmosAsync) break;
        if (Date.now() > deadline) throw new Error("Spotify 初始化超时");
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      await ${body}
    } catch (error) {
      console.error("[lyrivaMusic] 启动失败", error);
      window.Spicetify?.showNotification?.("lyrivaMusic 启动失败，请重新加载以恢复上一版本", true);
    }
  })();`;
}
