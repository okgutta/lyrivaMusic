/**
 * 语言归一化 / 同语言判断 —— 供歌词翻译的「已在目标语言则跳过」使用。
 * 歌词模型上的 Language / LanguageISO2 由 ProcessLyrics 用 franc + langs 填充。
 */

/** franc 三字母码 → ISO2（franc 会返回 cmn/jpn/eng… 甚至带脚本后缀 cmn-Hani） */
const FRANC_TO_ISO2: Record<string, string> = {
  cmn: "zh",
  yue: "zh",
  wuu: "zh",
  zho: "zh",
  jpn: "ja",
  kor: "ko",
  eng: "en",
  rus: "ru",
  spa: "es",
  fra: "fr",
  deu: "de",
  ita: "it",
  por: "pt",
  nld: "nl",
  tha: "th",
  vie: "vi",
  ind: "id",
  tur: "tr",
  ara: "ar",
  heb: "he",
  ell: "el",
  hin: "hi",
  ukr: "uk",
  pol: "pl",
  ces: "cs",
};

/** 归一化语言代码：franc/ISO 码 → base ISO2；zh 家族细分简繁 */
export function normalizeLang(code?: string | null): string {
  if (!code) return "";
  const v = code.trim().toLowerCase().replace(/_/g, "-");
  const base = v.split("-")[0];

  const zhVariant = (raw: string): string => {
    if (raw.includes("tw") || raw.includes("hk") || raw.includes("mo") || raw.includes("hant")) {
      return "zh-hant";
    }
    if (raw.includes("hans") || raw.includes("cn") || raw.includes("sg")) {
      return "zh-hans";
    }
    return "zh";
  };

  // franc 三字母（cmn/jpn/eng…）→ ISO2
  const mapped = FRANC_TO_ISO2[base];
  if (mapped) {
    return mapped === "zh" ? zhVariant(v) : mapped;
  }

  // ISO2（zh 家族细分简繁）
  if (base === "zh") {
    return zhVariant(v);
  }
  return base;
}

/** 两个语言代码是否视为同一语言（zh 家族互认） */
export function isSameLanguage(a?: string | null, b?: string | null): boolean {
  const na = normalizeLang(a);
  const nb = normalizeLang(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.startsWith("zh") && nb.startsWith("zh");
}

/** 目标语言是否是中文（用于「保留 provider 自带的中文译文」判断） */
export function isTargetChinese(targetLang: string): boolean {
  return normalizeLang(targetLang).startsWith("zh");
}
