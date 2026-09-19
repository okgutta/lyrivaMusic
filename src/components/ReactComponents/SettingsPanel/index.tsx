import { useEffect, useRef, useState } from "react";
import { PopupModal } from "../../Modal.ts";
import BackgroundSection from "./BackgroundSection.tsx";
import CacheSection from "./CacheSections.tsx";
import DeveloperSection from "./DeveloperSection.tsx";
import ExperimentsSection from "./ExperimentsSection.tsx";
import LyricsSection from "./LyricsSection.tsx";
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
import { SearchBar } from "./components.tsx";

const SECTIONS = [
  { value: "appearance", label: "外观" },
  { value: "lyrics-display", label: "歌词" },
  { value: "lyrics-service", label: "翻译" },
  { value: "playback", label: "播放" },
  { value: "cache", label: "缓存" },
  { value: "advanced", label: "高级" },
] as const;

type SectionValue = (typeof SECTIONS)[number]["value"];
type DetailId =
  | "genius-token"
  | "translation-lang"
  | "deepseek-key"
  | "openai-key"
  | "custom-config"
  | "translation-model";

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
      return (
        <LyricsSection query={query} sectionFilter={sectionFilter} onOpenDetail={openDetail} />
      );
    case "lyrics-service":
      return (
        <ServicesSection query={query} sectionFilter={sectionFilter} onOpenDetail={openDetail} />
      );
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
  const [activeCategory, setActiveCategory] = useState<SectionValue>("lyrics-display");
  const [detail, setDetail] = useState<DetailId | null>(null);
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
    const categories = scrollRef.current?.querySelectorAll<HTMLElement>(".sl-sp-search-category");
    if (!categories) return;
    setSearchEmpty(
      Array.from(categories).every(
        (category) => category.querySelectorAll(".sl-sp-row, .sl-sp-nav-row").length === 0
      )
    );
  }, [searching, query, activeCategory, detail]);

  const onRailKeyDown = (e: React.KeyboardEvent) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
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
          : (current + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [activeCategory, detail]);

  return (
    <div className="slm w-40 sl-sp-root hidden-modal-header-style">
      <header className="sl-sp-header">
        <h1 className="sl-sp-title">设置</h1>
        <SearchBar
          value={query}
          onChange={(value) => {
            setDetail(null);
            setQuery(value);
          }}
        />
        <button
          type="button"
          className="sl-sp-close"
          onClick={() => PopupModal.hide()}
          aria-label="关闭设置"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M2.5 2.5l9 9M11.5 2.5l-9 9"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>
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
              {section.label}
            </button>
          );
        })}
      </nav>
      <div className="sl-sp-content">
        <div className="sl-sp-scroll" ref={scrollRef}>
          {detail ? (
            <DetailPage id={detail} onBack={() => setDetail(null)} />
          ) : searching ? (
            <div className="sl-sp-search-results">
              {SECTIONS.map((section) => (
                <div
                  key={section.value}
                  className="sl-sp-search-category"
                  role="group"
                  aria-label={section.label}
                >
                  <h2 className="sl-sp-search-category-title">{section.label}</h2>
                  {sectionFor(section.value, query, "All", openDetail)}
                </div>
              ))}
              {searchEmpty && (
                <div className="sl-sp-empty">
                  <p className="sl-sp-empty-title">没有找到相关设置</p>
                  <button type="button" className="sl-sp-btn" onClick={() => setQuery("")}>
                    清除搜索
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="sl-sp-page">
              <div className="sl-sp-page-groups">
                {sectionFor(activeCategory, query, activeCategory, openDetail)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
