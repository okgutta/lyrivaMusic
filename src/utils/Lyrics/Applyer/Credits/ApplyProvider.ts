const ProviderMap: Record<string, string> = {
    "spt": "Spotify",
    "aml": "Apple Music",
    "spl": "Lyra",
    "ldb": "本地数据库",
    "ncm": "网易云",
    "qq": "QQ 音乐",
    "lrclib": "LRCLIB",
    "genius": "Genius",
    "lyriva": "LYRIVA",
}

export function ApplyLyricsProvider(data: any, LyricsContainer: HTMLElement): void {
  if (!data?.source || !LyricsContainer) return;

  const ProviderElement = document.createElement("div");
  ProviderElement.classList.add("LyricsProvider");

  let providerLabel = "";
  if (
    typeof data.source === "string" &&
    Object.prototype.hasOwnProperty.call(ProviderMap, data.source)
  ) {
    providerLabel = ProviderMap[data.source];
  } else {
    providerLabel = "未知";
  }

  // 翻译增强：主歌词来自 Spicy API（source 原本是 spl），翻译来自网易云 → 复合标注
  // （若 source 已改为 ncm，则直接显示网易云，无需重复标注）
  if (data.translationSource === "ncm" && data.source !== "ncm") {
    ProviderElement.textContent = `歌词来源：${providerLabel}（翻译：网易云）`;
  } else {
    ProviderElement.textContent = `歌词来源：${providerLabel}`;
  }
  LyricsContainer.appendChild(ProviderElement);
}
