import React, { createContext, useContext, useId } from "react";

export function matches(query: string, label: string, description?: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  return label.toLowerCase().includes(q) || (description ?? "").toLowerCase().includes(q);
}

/** Row 的可见标签 id —— 控件通过它建立 aria 关联，读屏用户才能听到"这一行是什么" */
const RowLabelContext = createContext<string | undefined>(undefined);

/**
 * Apple Settings Row：左侧标题 + 说明，右侧控件。
 * 行高 ~52px；行与行之间由 Section 的 divider 分隔（非整行边框）。
 */
export function Row({
  label,
  description,
  children,
  disabled,
  disabledReason,
  stacked,
  nested,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
  stacked?: boolean;
  /** 子设置：缩进 + 更低视觉权重，明确父子层级 */
  nested?: boolean;
}) {
  const labelId = useId();
  return (
    <RowLabelContext.Provider value={labelId}>
      <div
        className={`sl-sp-row${disabled ? " sl-sp-row--disabled" : ""}${stacked ? " sl-sp-row--stacked" : ""}${nested ? " sl-sp-row--nested" : ""}`}
      >
        <div className="sl-sp-label-wrap">
          <span className="sl-sp-label" id={labelId}>
            {label}
          </span>
          {description && <span className="sl-sp-description">{description}</span>}
        </div>
        <div className="sl-sp-control">{children}</div>
        {disabled && disabledReason && <div className="sl-sp-row-tooltip">{disabledReason}</div>}
      </div>
    </RowLabelContext.Provider>
  );
}

/** 控件取所在 Row 的标签 id；不在 Row 内时回退为自身可描述 */
function useRowLabelId(): string | undefined {
  return useContext(RowLabelContext);
}

/**
 * Apple Settings Group：一组设置项，浅底 + 圆角 + 组内 hairline divider。
 * 页面由若干个 group 组成（替代"一个设置一张卡"）。
 */
export function Section({
  title,
  description,
  children,
}: {
  title?: string;
  /** 分组标题（Apple 分组列表的小标题） */
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="sl-sp-section">
      {title && <h3 className="sl-sp-section-title">{title}</h3>}
      <div className="sl-sp-group">{children}</div>
      {description && <p className="sl-sp-section-desc">{description}</p>}
    </section>
  );
}

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const labelId = useRowLabelId();
  return (
    <label className="sl-sp-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        aria-labelledby={labelId}
      />
      <span className="sl-sp-toggle-track" />
    </label>
  );
}

export function Select({
  value,
  options,
  labels,
  onChange,
  disabled,
}: {
  value: string;
  options: string[];
  labels?: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const labelId = useRowLabelId();
  return (
    <select
      className="sl-sp-select"
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      disabled={disabled}
      aria-labelledby={labelId}
    >
      {options.map((opt, i) => (
        <option key={opt} value={opt}>
          {labels?.[i] ?? opt}
        </option>
      ))}
    </select>
  );
}

/**
 * Apple Segmented Control：互斥选项横向分段，选中段略微亮起。
 * 用于背景模式 / 动画样式 / 按钮位置等互斥选择。
 */
export function SegmentedControl({
  value,
  options,
  labels,
  onChange,
  disabled,
}: {
  value: string;
  options: string[];
  labels?: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const labelId = useRowLabelId();
  return (
    <div
      className={`sl-sp-segmented${disabled ? " sl-sp-segmented--disabled" : ""}`}
      role="radiogroup"
      aria-labelledby={labelId}
    >
      {options.map((opt, i) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            className={`sl-sp-segmented-item${active ? " sl-sp-segmented-item--active" : ""}`}
            onClick={() => onChange(opt)}
          >
            {labels?.[i] ?? opt}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Apple Navigation Row：label + 当前值 + chevron >。
 * 点击进入二级页或触发动作。
 */
export function NavigationRow({
  label,
  description,
  value,
  valueState,
  onClick,
  disabled,
  disabledReason,
}: {
  label: string;
  description?: string;
  /** 行右侧显示的当前值（如当前语言、Token 是否已配置） */
  value?: string;
  /** ok = 已配置（蓝），unset = 未配置（弱灰）；缺省 = 中性灰 */
  valueState?: "ok" | "unset";
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const labelId = useId();
  return (
    <RowLabelContext.Provider value={labelId}>
      <div
        className={`sl-sp-row sl-sp-nav-row${disabled ? " sl-sp-row--disabled" : ""}`}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={labelId}
        aria-disabled={disabled || undefined}
        onClick={disabled ? undefined : onClick}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
      >
        <div className="sl-sp-label-wrap">
          <span className="sl-sp-label" id={labelId}>
            {label}
          </span>
          {description && <span className="sl-sp-description">{description}</span>}
        </div>
        <div className="sl-sp-nav-value">
          {value && (
            <span
              className={`sl-sp-nav-value-text${valueState === "ok" ? " sl-sp-nav-value-text--ok" : ""}${valueState === "unset" ? " sl-sp-nav-value-text--unset" : ""}`}
            >
              {value}
            </span>
          )}
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M4.5 2.5L8 6l-3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        {disabled && disabledReason && <div className="sl-sp-row-tooltip">{disabledReason}</div>}
      </div>
    </RowLabelContext.Provider>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "password";
}) {
  const labelId = useRowLabelId();
  return (
    <input
      className="sl-sp-input"
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.currentTarget.value)}
      spellCheck={false}
      autoComplete="off"
      aria-labelledby={labelId}
    />
  );
}

/**
 * Apple 双极滑块：以中性点为中心的 range 控件，负轴在左、正轴在右，
 * 填充从中心向拇指方向生长；偏离默认值时显示内联「重置」。
 */
export function Slider({
  value,
  min,
  max,
  step = 1,
  defaultValue,
  unit,
  onChange,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const THUMB = 16;
  const range = max - min || 1;
  const clamped = Math.min(max, Math.max(min, value));
  const frac = (clamped - min) / range;
  const isBipolar = min < 0 && max > 0;
  const zeroFrac = ((isBipolar ? 0 : min) - min) / range;

  const posFor = (f: number) =>
    `calc(${(f * 100).toFixed(4)}% + ${((0.5 - f) * THUMB).toFixed(3)}px)`;

  const fillFrom = Math.min(zeroFrac, frac);
  const fillSpan = Math.abs(frac - zeroFrac);

  const sign = isBipolar && clamped > 0 ? "+" : "";
  const valueLabel = `${sign}${clamped}${unit ? ` ${unit}` : ""}`;
  const changed = defaultValue !== undefined && clamped !== defaultValue;
  const labelId = useRowLabelId();

  return (
    <div className={`sl-sp-slider${disabled ? " sl-sp-slider--disabled" : ""}`}>
      <div className="sl-sp-slider-track-wrap">
        <span className="sl-sp-slider-track" />
        <span
          className="sl-sp-slider-fill"
          style={{
            left: posFor(fillFrom),
            width: `calc(${(fillSpan * 100).toFixed(4)}% - ${(fillSpan * THUMB).toFixed(3)}px)`,
          }}
        />
        {isBipolar && <span className="sl-sp-slider-center" style={{ left: posFor(zeroFrac) }} />}
        <input
          type="range"
          className="sl-sp-slider-input"
          min={min}
          max={max}
          step={step}
          value={clamped}
          onChange={(e) => onChange(Number(e.currentTarget.value))}
          disabled={disabled}
          aria-labelledby={labelId ?? undefined}
          aria-label={labelId ? undefined : `当前值 ${valueLabel}`}
        />
      </div>
      <div className="sl-sp-slider-meta">
        <span className="sl-sp-slider-value">{valueLabel}</span>
        {changed && (
          <button
            type="button"
            className="sl-sp-slider-reset"
            onClick={() => onChange(defaultValue!)}
          >
            重置
          </button>
        )}
      </div>
    </div>
  );
}

export function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="sl-sp-search-wrap">
      <svg
        className="sl-sp-search-icon"
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
        <line
          x1="9.5"
          y1="9.5"
          x2="13"
          y2="13"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <input
        className="sl-sp-search"
        type="text"
        placeholder="搜索设置…"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        spellCheck={false}
        aria-label="搜索设置"
      />
      {value && (
        <button className="sl-sp-search-clear" onClick={() => onChange("")} aria-label="清除搜索">
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <line
              x1="1"
              y1="1"
              x2="9"
              y2="9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <line
              x1="9"
              y1="1"
              x2="1"
              y2="9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
