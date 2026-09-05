import { useEffect, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { PopupModal } from "../../Modal.ts";
import BackgroundSection from "./BackgroundSection.tsx";
import CacheSection from "./CacheSections.tsx";
import DeveloperSection from "./DeveloperSection.tsx";
import ExperimentsSection from "./ExperimentsSection.tsx";
import LyricsSection from "./LyricsSection.tsx";
import LyricsSourceSection from "./LyricsSourceSection.tsx";
import PlaybackSection from "./PlaybackSection.tsx";
import ServicesSection from "./ServicesSection.tsx";
import {
  DetailCustomConfig,
  DetailDeepSeekKey,
  DetailGeniusToken,
  DetailTranslationLanguage,
  DetailOpenAIConfig,
  DetailTranslationModel,
} from "./DetailPages.tsx";
import { SearchBar, Section } from "./components.tsx";
import { $spicyLyricsVersion } from "../../../utils/stores.ts";

const SECTIONS = [
  {
    value: "appearance",
    label: "外观与背景",
    desc: "背景呈现、动态效果与字体",
  },
  {
    value: "lyrics-display",
    label: "歌词显示",
    desc: "歌词模式、动画与界面元素",
  },
  {
    value: "lyrics-source",
    label: "歌词来源",
    desc: "LYRIVA 主源已内置；Genius 兜底需配置 Token",
  },
  {
    value: "lyrics-service",
    label: "歌词翻译",
    desc: "翻译开关、服务与目标语言",
  },
  {
    value: "playback",
    label: "播放与控制",
    desc: "时间轴偏移与播放栏控件",
  },
  {
    value: "cache",
    label: "缓存",
    desc: "管理歌词与翻译的本地缓存",
  },
  {
    value: "advanced",
    label: "高级设置",
    desc: "实验功能与开发者选项",
  },
] as const;

type SectionValue = (typeof SECTIONS)[number]["value"];
type DetailId = "genius-token" | "translation-lang" | "deepseek-key" | "openai-key" | "custom-config" | "translation-model";

/** Apple 风格侧栏图标：极简线性、单色，视觉重量与文字一致 */
function SidebarIcon({ value }: { value: SectionValue }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 16 16",
    fill: "none" as const,
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true as const,
  };
  const s = { stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (value) {
    case "appearance":
      return (
        <svg {...common}>
          <rect x="1.5" y="2" width="13" height="12" rx="2.5" {...s} />
          <path d="M2.5 11.5l3.2-3.2 2.4 2.4 2.2-2.2 3 3" {...s} />
          <circle cx="5.4" cy="5.2" r="1.1" {...s} />
        </svg>
      );
    case "lyrics-display":
      return (
        <svg {...common}>
          <path d="M2 4h12M2 8h12M2 12h7" {...s} />
          <circle cx="11.5" cy="12" r="1.7" {...s} />
          <path d="M13.2 12V5.5l2-.6" {...s} />
        </svg>
      );
    case "lyrics-source":
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="4.5" {...s} />
          <path d="M10.5 10.5L14 14" {...s} />
          <path d="M7 5.4l2.4 1.6L7 8.6V5.4z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "lyrics-service":
      return (
        <svg {...common}>
          <path d="M2.5 12.5L6 4l3.5 8.5M3.5 9.8h5" {...s} />
          <path d="M10.5 5l3 7M11.4 7.2h2.2" {...s} />
        </svg>
      );
    case "playback":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.5" {...s} />
          <path d="M6.8 5.6l4 2.4-4 2.4V5.6z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "cache":
      return (
        <svg {...common}>
          <rect x="2" y="3" width="12" height="10" rx="2" {...s} />
          <path d="M5 3v4h6V3M4 13h8" {...s} />
        </svg>
      );
    case "advanced":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="2.2" {...s} />
          <path
            d="M8 2.8v1.8M8 11.4v1.8M2.8 8h1.8M11.4 8h1.8M4.3 4.3l1.3 1.3M10.4 10.4l1.3 1.3M11.7 4.3l-1.3 1.3M5.6 10.4l-1.3 1.3"
            {...s}
          />
        </svg>
      );
  }
}

type OpenDetail = (id: DetailId) => void;

function sectionFor(
  value: SectionValue,
  query: string,
  sectionFilter: string,
  openDetail: OpenDetail
) {
  switch (value) {
    case "appearance":
      return <BackgroundSection query={query} sectionFilter={sectionFilter} />;
    case "lyrics-display":
      return <LyricsSection query={query} sectionFilter={sectionFilter} />;
    case "lyrics-source":
      return <LyricsSourceSection query={query} sectionFilter={sectionFilter} onOpenDetail={openDetail} />;
    case "lyrics-service":
      return <ServicesSection query={query} sectionFilter={sectionFilter} onOpenDetail={openDetail} />;
    case "playback":
      return <PlaybackSection query={query} sectionFilter={sectionFilter} />;
    case "cache":
      return <CacheSection query={query} sectionFilter={sectionFilter} />;
    case "advanced":
      return (
        <>
          <ExperimentsSection query={query} sectionFilter={sectionFilter} />
          <DeveloperSection query={query} sectionFilter={sectionFilter} />
        </>
      );
  }
}

function DetailPage({ id, onBack }: { id: DetailId; onBack: () => void }) {
  switch (id) {
    case "genius-token":
      return <DetailGeniusToken onBack={onBack} />;
    case "translation-lang":
      return <DetailTranslationLanguage onBack={onBack} />;
    case "deepseek-key":
      return <DetailDeepSeekKey onBack={onBack} />;
    case "openai-key":
      return <DetailOpenAIConfig onBack={onBack} />;
    case "custom-config":
      return <DetailCustomConfig onBack={onBack} />;
    case "translation-model":
      return <DetailTranslationModel onBack={onBack} />;
  }
}

export default function SettingsPanel() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<SectionValue>("appearance");
  const [detail, setDetail] = useState<DetailId | null>(null);
  const version = useStore($spicyLyricsVersion);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [searchEmpty, setSearchEmpty] = useState(false);
  const searching = query.trim().length > 0;
  const openDetail: OpenDetail = (id) => setDetail(id);

  // 各 section 依据 query 自行决定渲染与否；渲染后检查是否所有分组都空了
  useEffect(() => {
    if (!searching) {
      setSearchEmpty(false);
      return;
    }
    const groups = scrollRef.current?.querySelectorAll<HTMLElement>(".sl-sp-section");
    if (!groups) return;
    setSearchEmpty(
      Array.from(groups).every(
        (g) => g.querySelectorAll(".sl-sp-row, .sl-sp-nav-row").length === 0
      )
    );
  });

  const onRailKeyDown = (e: React.KeyboardEvent) => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    const items = Array.from(
      (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(".sl-sp-sidebar-item")
    );
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? items.length - 1
          : (current + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  const activeSection = SECTIONS.find((s) => s.value === activeCategory) ?? SECTIONS[0];

  return (
    <div
      className={`slm w-40 sl-sp-root hidden-modal-header-style${searching ? " sl-sp-root--searching" : ""}`}
    >
      <div className="sl-sp-sidebar">
        <div className="sl-sp-sidebar-head">
          <span className="sl-sp-brand-mark" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M4 10.5v-5M8 12.5v-9M12 10.5v-5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <div>
            <h1 className="sl-sp-sidebar-title">Lyra 设置</h1>
            <p className="sl-sp-sidebar-subtitle">自定义歌词体验</p>
          </div>
        </div>

        <nav className="sl-sp-sidebar-nav" aria-label="设置分类" onKeyDown={onRailKeyDown}>
          {SECTIONS.map((section) => {
            const active = !searching && section.value === activeCategory;
            return (
              <button
                key={section.value}
                type="button"
                className={`sl-sp-sidebar-item${active ? " sl-sp-sidebar-item--active" : ""}`}
                aria-current={active ? "true" : undefined}
                onClick={() => {
                  setDetail(null);
                  setActiveCategory(section.value);
                  setQuery("");
                }}
              >
                <SidebarIcon value={section.value} />
                <span>{section.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sl-sp-sidebar-version" aria-label={`版本 ${version}`}>
          <span className="sl-sp-version-dot" aria-hidden="true" />
          Lyra v{version}
        </div>
      </div>

      <div className="sl-sp-content">
        <button
          type="button"
          className="sl-sp-close"
          onClick={() => PopupModal.hide()}
          aria-label="关闭设置"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M2.5 2.5l9 9M11.5 2.5l-9 9"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* 详情页隐藏搜索，聚焦当前配置项（Apple 详情页惯例） */}
        {!detail && (
          <div className="sl-sp-toolbar">
            <SearchBar value={query} onChange={setQuery} />
          </div>
        )}

        <div className="sl-sp-scroll" ref={scrollRef}>
          {detail ? (
            <DetailPage id={detail} onBack={() => setDetail(null)} />
          ) : searching ? (
            <div className="sl-sp-search-results">
              <h2 className="sl-sp-page-title">搜索结果</h2>
              <p className="sl-sp-page-desc">与「{query.trim()}」相关的设置</p>
              {SECTIONS.map((section) => (
                <Section key={section.value} title={section.label}>
                  {sectionFor(section.value, query, "All", openDetail)}
                </Section>
              ))}
              {searchEmpty && (
                <div className="sl-sp-empty">
                  <span className="sl-sp-empty-icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M13.5 13.5L17.5 17.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </span>
                  <p className="sl-sp-empty-title">没有找到相关设置</p>
                  <p className="sl-sp-empty-hint">换个关键词，或浏览左侧分类</p>
                  <button
                    type="button"
                    className="sl-sp-btn"
                    onClick={() => {
                      setQuery("");
                      setActiveCategory("appearance");
                    }}
                  >
                    清除搜索
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="sl-sp-page">
              <h2 className="sl-sp-page-title">{activeSection.label}</h2>
              <p className="sl-sp-page-desc">{activeSection.desc}</p>
              <div className="sl-sp-page-groups">
                {sectionFor(activeSection.value, query, activeSection.value, openDetail)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
