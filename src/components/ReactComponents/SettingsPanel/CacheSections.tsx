import {
  RemoveCurrentLyrics_AllCaches,
  RemoveLyricsCache,
} from "../../../utils/LyricsCacheTools.ts";
import { clearTranslationCache } from "../../../utils/Lyrics/Translate/cache.ts";
import { clearAllTrackCache } from "../../../utils/Lyrics/Translate/trackCache.ts";
import { openTranslationCacheViewer } from "../../../utils/Lyrics/Translate/cacheViewer.ts";
import { matches, NavigationRow, Row, Section } from "./components.tsx";

/** 缓存：按作用范围分组（当前歌曲 / 全部歌曲 / 翻译缓存） */
const SECTION_NAME = "cache";

/** 破坏性清除必须有可见反馈——否则用户无法区分"清掉了"和"没生效" */
function notify(message: string): void {
  try {
    Spicetify.showNotification(message);
  } catch {
    /* 通知失败不影响清除本身 */
  }
}

interface Props {
  query: string;
  sectionFilter: string;
}

export default function CacheSection({ query, sectionFilter }: Props) {
  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  // 当前歌曲
  const r1 = matches(query, "清除当前歌曲缓存", "当前歌曲的全部缓存");
  // 全部歌曲
  const r3 = matches(query, "清除全部歌词缓存", "删除已存储的全部歌词缓存");
  // 翻译
  const r4 = matches(query, "查看翻译缓存", "查看、编辑或播放已缓存的歌词翻译");
  const r5 = matches(query, "清空翻译缓存", "删除全部歌词翻译缓存");

  if (!r1 && !r3 && !r4 && !r5) return null;

  return (
    <>
      {(r1 || r3) && (
        <Section title="歌词缓存">
          {r1 && (
            <Row label="清除当前歌曲缓存">
              <button
                type="button"
                className="sl-sp-btn"
                onClick={() => {
                  void RemoveCurrentLyrics_AllCaches(true);
                  notify("已清除当前歌曲缓存");
                }}
              >
                清除
              </button>
            </Row>
          )}

          {r3 && (
            <Row label="清除全部歌词缓存">
              <button
                type="button"
                className="sl-sp-btn"
                onClick={() => {
                  void RemoveLyricsCache(true);
                  notify("已清除全部歌词缓存");
                }}
              >
                清除
              </button>
            </Row>
          )}
        </Section>
      )}

      {(r4 || r5) && (
        <Section title="翻译缓存">
          {r4 && (
            <NavigationRow label="查看翻译缓存" onClick={() => openTranslationCacheViewer()} />
          )}

          {r5 && (
            <Row label="清空翻译缓存">
              <button
                type="button"
                className="sl-sp-btn"
                onClick={() => {
                  clearTranslationCache();
                  clearAllTrackCache();
                  notify("已清空全部翻译缓存");
                }}
              >
                清空全部
              </button>
            </Row>
          )}
        </Section>
      )}
    </>
  );
}
