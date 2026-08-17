import './base.css';
import { FileSearch, Globe2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { getHeaderLinks, type BatchShowcaseSourceLinks } from './headerLinks';

type TypographyFontRole = 'display' | 'body' | 'mono';

export type MobilePreviewPattern =
  | 'feed'
  | 'chat'
  | 'finance'
  | 'map'
  | 'workspace'
  | 'health'
  | 'commerce'
  | 'media'
  | 'dating'
  | 'assistant';

export type BatchMobilePreview = {
  pattern: MobilePreviewPattern;
  navigation: [string, string, string];
  primaryAction: string;
};

export type BatchPreviewImage = {
  type: string;
  url: string;
};

export type BatchPaletteSwatch = {
  color: string;
  labelZh: string;
  labelEn: string;
  textColor: string;
};

export type BatchStyleSystemItem = {
  label: string;
  value: string;
  description?: string;
  cssValue?: string;
};

export type BatchShowcaseConfig = {
  brand: string;
  brandAlias?: string;
  description: string;
  descriptionEn?: string;
  source?: BatchShowcaseSourceLinks;
  variant: 'saas-devtool' | 'dashboard' | 'consumer-commerce' | 'editorial-agency' | 'dark-experimental' | 'mobile-product';
  mobilePreview?: BatchMobilePreview;
  distributionTags: string[];
  fontStylesheets?: string[];
  palette: Array<string | BatchPaletteSwatch>;
  radius?: {
    control?: string;
    card?: string;
    preview?: string;
    pill?: string;
    source?: string;
  };
  spacing?: Record<string, string>;
  shadows?: BatchStyleSystemItem[];
  borders?: BatchStyleSystemItem[];
  typography: string[];
  previewImages: BatchPreviewImage[];
  panels: {
    title: string;
    eyebrow: string;
    body: string;
  }[];
  usageGuidance?: {
    do: string[];
    dont: string[];
  };
};

export type BatchShowcaseTab = {
  id: string;
  label: string;
  content: React.ReactNode;
};

export type DesignMdBatchShowcaseProps = {
  config: BatchShowcaseConfig;
  tabs?: BatchShowcaseTab[];
  className?: string;
};

const variantLabels: Record<BatchShowcaseConfig['variant'], string> = {
  'saas-devtool': 'SaaS 开发工具 - SaaS / Devtool',
  dashboard: '数据仪表盘 - Dashboard',
  'consumer-commerce': '消费与商业 - Consumer / Commerce',
  'editorial-agency': '编辑与机构 - Editorial / Agency',
  'dark-experimental': '暗色实验 - Dark / Experimental',
  'mobile-product': '移动产品 - Mobile Product',
};

const mobileScenes: Record<MobilePreviewPattern, { eyebrow: string; title: string; body: string; detail: string }> = {
  feed: { eyebrow: '今日动态', title: '为你更新的内容', body: '关注的主题正在发生新的讨论。', detail: '12 条新动态' },
  chat: { eyebrow: '正在进行', title: '与团队保持同步', body: '设计评审已整理为可继续回复的线程。', detail: '3 条未读消息' },
  finance: { eyebrow: '资产概览', title: '今天的资金动态', body: '余额与近期交易保持清晰可读。', detail: '本周 +8.4%' },
  map: { eyebrow: '附近探索', title: '下一站就在眼前', body: '根据当前路线推荐更合适的停靠点。', detail: '步行 6 分钟' },
  workspace: { eyebrow: '我的工作区', title: '把进展聚焦在一起', body: '下一项工作与协作状态在同一处更新。', detail: '4 个待完成' },
  health: { eyebrow: '今日节奏', title: '照顾好你的状态', body: '用轻量记录看见今天的身体与心情变化。', detail: '连续 7 天' },
  commerce: { eyebrow: '精选推荐', title: '为此刻挑选好物', body: '从收藏和浏览中继续发现适合你的选择。', detail: '限时精选' },
  media: { eyebrow: '继续欣赏', title: '留在好内容里', body: '从上次停下的位置继续你的观看或收听。', detail: '剩余 18 分钟' },
  dating: { eyebrow: '新的发现', title: '认识值得聊天的人', body: '用自然的对话开始一段新的连接。', detail: '2 个新匹配' },
  assistant: { eyebrow: '下一步', title: '从一个想法开始', body: '把目标告诉我，我会帮你整理成清晰的行动。', detail: '准备就绪' },
};

const NON_SELECTION_TAGS = new Set([
  'DESIGN.md',
  '设计 Token',
  '品牌指南',
  'GitHub Raw',
  'Tailwind v4',
  'CSS 变量',
  '图片资产',
  '浏览器复制',
  '目录来源',
]);

const typographyRows = [
  {
    name: '展示标题 - Display',
    fontRole: 'display',
    layout: 'wide',
    size: '72px',
    weight: 'bold',
    cssWeight: 800,
    zh: '主题字形展示',
    en: 'Design System Display',
  },
  {
    name: '页面标题 - Heading',
    fontRole: 'display',
    layout: 'wide',
    size: '48px',
    weight: 'bold',
    cssWeight: 800,
    zh: '标题层级',
    en: 'Product Experience',
  },
  {
    name: '分区标题 - Section Heading',
    fontRole: 'display',
    layout: 'compact',
    size: '28px',
    weight: 'bold',
    cssWeight: 800,
    zh: '视觉系统',
    en: 'Visual Language',
  },
  {
    name: '副标题 - Subhead',
    fontRole: 'body',
    layout: 'compact',
    size: '20px',
    weight: 'semibold',
    cssWeight: 600,
    zh: '清晰的信息节奏',
    en: 'A clear rhythm for product stories.',
  },
  {
    name: '正文 - Body',
    fontRole: 'body',
    layout: 'compact',
    size: '15px',
    weight: 'regular',
    cssWeight: 400,
    zh: '每一种字体都让主题拥有不同的声音。',
    en: 'Typography gives every theme its own voice.',
  },
  {
    name: '小字 - Small',
    fontRole: 'body',
    layout: 'compact',
    size: '12px',
    weight: 'regular',
    cssWeight: 400,
    zh: '辅助说明与状态信息',
    en: 'Helper text and interface states',
  },
  {
    name: '注释 - Caption',
    fontRole: 'mono',
    layout: 'compact',
    size: '11px',
    weight: 'regular',
    cssWeight: 400,
    zh: '来源注释与细节标记',
    en: 'Source notes and fine details',
  },
] satisfies Array<{
  name: string;
  fontRole: TypographyFontRole;
  layout: 'wide' | 'compact';
  size: string;
  weight: string;
  cssWeight: number;
  zh: string;
  en: string;
}>;

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function themeSelectionTags(tags: string[]) {
  return unique(tags.map(tag => tag.trim()).filter(tag => !NON_SELECTION_TAGS.has(tag)));
}

function themeSelectionDescription(description: string) {
  const text = Array.from(NON_SELECTION_TAGS).reduce(
    (current, tag) => current.replace(new RegExp(`、?${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), ''),
    description,
  );
  return text
    .replace(/围绕、/g, '围绕')
    .replace(/围绕组织页面/g, '围绕品牌视觉、产品场景组织页面')
    .replace(/、、+/g, '、');
}

function contrastFor(color: string) {
  const value = color.replace('#', '').slice(0, 6);
  if (value.length !== 6) return '#171717';
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#171717' : '#ffffff';
}

function normalizePalette(palette: Array<string | BatchPaletteSwatch>): BatchPaletteSwatch[] {
  const labels = [
    ['主色', 'Primary'],
    ['主色悬停', 'Primary Hover'],
    ['辅助色', 'Secondary'],
    ['强调色', 'Accent'],
    ['背景色', 'Background'],
    ['表面色', 'Surface'],
    ['文本色', 'Text'],
    ['边框色', 'Border'],
  ];
  return palette.slice(0, 12).map((item, index) => {
    if (typeof item !== 'string') return item;
    const label = labels[index] || [`颜色 ${index + 1}`, `Color ${index + 1}`];
    return {
      color: item,
      labelZh: label[0],
      labelEn: label[1],
      textColor: contrastFor(item),
    };
  });
}

function uniquePaletteByColor(palette: BatchPaletteSwatch[]): BatchPaletteSwatch[] {
  const seen = new Set<string>();
  return palette.filter(swatch => {
    const key = swatch.color.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function useThemeFontStylesheets(urls: string[] = []) {
  useEffect(() => {
    if (typeof document === 'undefined' || urls.length === 0) return;

    const links = urls.map(url => {
      const existing = document.querySelector<HTMLLinkElement>(`link[data-dmb-font="${url}"]`);
      if (existing) return existing;

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.dataset.dmbFont = url;
      document.head.appendChild(link);
      return link;
    });

    return () => {
      links.forEach(link => {
        if (document.querySelectorAll(`link[data-dmb-font="${link.dataset.dmbFont}"]`).length === 1) {
          link.remove();
        }
      });
    };
  }, [urls.join('|')]);
}

function FittedSampleText({
  children,
  className,
  lang,
}: {
  children: string;
  className: string;
  lang: string;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [fitScale, setFitScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    let active = true;
    let frame = 0;
    const updateFit = () => {
      if (!active) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!active) return;
        const availableWidth = container.clientWidth;
        const textWidth = text.scrollWidth;
        const nextScale = availableWidth > 0 && textWidth > 0
          ? Math.min(1, availableWidth / textWidth)
          : 1;
        setFitScale(current => (Math.abs(current - nextScale) < 0.005 ? current : nextScale));
      });
    };

    updateFit();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateFit);
      resizeObserver.observe(container);
      resizeObserver.observe(text);
    }

    document.fonts?.ready.then(updateFit).catch(() => {});
    window.addEventListener('resize', updateFit);

    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateFit);
    };
  }, [children]);

  return (
    <span
      ref={containerRef}
      className={`${className} dmb-type-sample-fit`}
      lang={lang}
      style={{ '--dmb-type-fit-scale': fitScale } as React.CSSProperties}
    >
      <span ref={textRef} className="dmb-type-sample-fit-inner">{children}</span>
    </span>
  );
}

function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return <span className="dmb-muted">暂无标签</span>;
  return (
    <div className="dmb-tags">
      {tags.map(tag => <span key={tag}>{tag}</span>)}
    </div>
  );
}

function PreviewFigure({ config, onOpen }: { config: BatchShowcaseConfig; onOpen: (url: string) => void }) {
  const primaryImage = config.previewImages[0];
  const imageLabel = config.brandAlias || config.brand;

  if (!primaryImage) {
    return (
      <button className="dmb-preview dmb-preview-empty" type="button" aria-label={`${imageLabel} preview pending`}>
        <strong>{config.brand}</strong>
        <span>预览暂未提供</span>
      </button>
    );
  }

  if (primaryImage.type === 'source-preview-html') {
    return (
      <button className="dmb-preview dmb-preview-iframe" type="button" onClick={() => onOpen(primaryImage.url)} aria-label={`Open ${imageLabel} source preview`}>
        <span className="dmb-preview-canvas">
          <iframe src={primaryImage.url} title={`${imageLabel} source preview`} loading="lazy" sandbox="allow-same-origin" />
        </span>
        <span className="dmb-preview-label">源站预览 - Source Preview</span>
      </button>
    );
  }

  return (
    <button className="dmb-preview" type="button" onClick={() => onOpen(primaryImage.url)} aria-label={`Open ${imageLabel} preview`}>
      <span className="dmb-preview-canvas">
        <img src={primaryImage.url} alt={`${imageLabel} ${primaryImage.type} preview`} loading="lazy" />
      </span>
      <span className="dmb-preview-label">{primaryImage.type}</span>
    </button>
  );
}

function MobilePreview({ config }: { config: BatchShowcaseConfig }) {
  const preview = config.mobilePreview;

  if (config.variant !== 'mobile-product' || !preview) return null;

  const scene = mobileScenes[preview.pattern];

  return (
    <section className="dmb-mobile-preview" aria-label={`${config.brand} mobile product preview`}>
      <header className="dmb-mobile-head">
        <span className="dmb-mobile-status">09:41</span>
        <strong className="dmb-mobile-brand">{config.brandAlias || config.brand}</strong>
        <span className="dmb-mobile-status" aria-hidden="true">● ● ●</span>
      </header>

      <div className="dmb-mobile-content">
        <p className="dmb-mobile-eyebrow">{scene.eyebrow}</p>
        <h2>{scene.title}</h2>
        <p className="dmb-mobile-copy">{scene.body}</p>

        <article className={`dmb-mobile-scene dmb-mobile-scene-${preview.pattern}`}>
          <div className="dmb-mobile-scene-top">
            <span>{scene.detail}</span>
            <i aria-hidden="true" />
          </div>
          <strong>{preview.pattern === 'chat' ? '设计讨论' : scene.title}</strong>
          <p>{preview.pattern === 'chat' ? '已整理重点，随时可以继续回复。' : scene.body}</p>
          <div className="dmb-mobile-scene-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </article>

        <button className="dmb-mobile-primary-action" type="button">
          {preview.primaryAction}
        </button>
      </div>

      <nav className="dmb-mobile-nav" aria-label="移动端主导航">
        {preview.navigation.map((label, index) => (
          <button key={label} type="button" aria-current={index === 1 ? 'page' : undefined} aria-pressed={index === 1}>
            <span className="dmb-mobile-nav-mark" aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </section>
  );
}

function PaletteSystem({ palette }: { palette: BatchPaletteSwatch[] }) {
  const colors = uniquePaletteByColor(palette).slice(0, 12);

  return (
    <section className="dmb-block">
      <h2>颜色系统 - Color Palette</h2>
      <div className="dmb-palette">
        {colors.map((swatch, index) => (
          <article key={`${swatch.color}-${index}`} style={{ backgroundColor: swatch.color, color: swatch.textColor }}>
            <strong>{swatch.labelZh} - {swatch.labelEn}</strong>
            <code>{swatch.color}</code>
            <p>{index < 4 ? '用于主题预览和生成组件的核心色彩。' : '从来源元数据中提取的辅助色彩。'}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function TokenOverview({ config }: { config: BatchShowcaseConfig }) {
  const uniquePalette = uniquePaletteByColor(normalizePalette(config.palette));
  const primary = uniquePalette[0] || { labelZh: '主色', labelEn: 'Primary', color: 'var(--dmb-accent)', textColor: 'var(--dmb-accent-contrast)' };
  const secondary = uniquePalette.find(swatch => swatch.color.toLowerCase() !== primary.color.toLowerCase()) || { labelZh: '辅助色', labelEn: 'Secondary', color: 'var(--dmb-link)', textColor: '#ffffff' };
  const neutral = uniquePalette.find(swatch => ['#000000', '#ffffff'].includes(swatch.color.toLowerCase())
    && ![primary.color.toLowerCase(), secondary.color.toLowerCase()].includes(swatch.color.toLowerCase()));
  const background = uniquePalette.find(swatch => ['#fafafa', '#ffffff', '#fbfbfd', '#fffefb'].includes(swatch.color.toLowerCase())
    && ![primary.color.toLowerCase(), secondary.color.toLowerCase(), neutral?.color.toLowerCase()].filter(Boolean).includes(swatch.color.toLowerCase()));
  const selectedSummarySwatches = [primary, secondary, neutral, background]
    .filter((swatch): swatch is BatchPaletteSwatch => Boolean(swatch));
  const summarySwatches = uniquePaletteByColor(selectedSummarySwatches);

  return (
    <section className="dmb-token-card">
      <div className="dmb-token-rail">
        {summarySwatches.map(swatch => (
          <div key={`${swatch.labelEn}-${swatch.color}`} className="dmb-token-chip" style={{ backgroundColor: swatch.color, color: swatch.textColor }}>
            <strong>{swatch.labelZh} - {swatch.labelEn}</strong>
            <code>{swatch.color}</code>
          </div>
        ))}
      </div>
      <div className="dmb-token-grid">
        <div>
          <small>标题 - Headline</small>
          <strong>Aa</strong>
        </div>
        <div className="dmb-token-buttons">
          <button type="button">主按钮<br /><span>Primary</span></button>
          <button type="button" className="dmb-text-button">次按钮<br /><span>Secondary</span></button>
          <button type="button" className="dmb-outline-button">描边<br /><span>Outline</span></button>
        </div>
        <div>
          <input aria-label="搜索示例" placeholder="搜索 / Search" />
        </div>
        <div>
          <small>正文 - Body</small>
          <strong>Aa</strong>
        </div>
        <div className="dmb-lines">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </section>
  );
}

function TypographySystem({ typography }: { typography: string[] }) {
  const fontNames = {
    display: typography[0] || 'System Sans',
    body: typography[1] || typography[0] || 'System Sans',
    mono: typography[2] || 'ui-monospace',
  };
  const fontNameForRole = (role: TypographyFontRole) => {
    if (role === 'body') return fontNames.body;
    if (role === 'mono') return fontNames.mono;
    return fontNames.display;
  };

  return (
    <section className="dmb-block">
      <h2>字体系统 - Typography</h2>
      <div className="dmb-type-list">
        {typographyRows.map(row => (
          <article
            key={row.name}
            className={`dmb-type-${row.fontRole} dmb-type-${row.layout}`}
            style={{
              '--dmb-type-size': row.size,
              '--dmb-type-weight': row.cssWeight,
            } as React.CSSProperties}
          >
            <div>
              <strong>{row.name}</strong>
              <span>{fontNameForRole(row.fontRole)} · {row.size} · {row.weight}</span>
            </div>
            <p className="dmb-type-sample">
              <span className="dmb-type-sample-zh" lang="zh-CN">{row.zh}</span>
              {row.layout === 'wide' ? (
                <FittedSampleText className="dmb-type-sample-en" lang="en">{row.en}</FittedSampleText>
              ) : (
                <span className="dmb-type-sample-en" lang="en">{row.en}</span>
              )}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function SpacingSystem() {
  const marks = ['4px', '8px', '12px', '16px', '24px', '32px', '48px', '64px', '80px'];

  return (
    <section className="dmb-block">
      <h2>间距系统 - Spacing <span>基准 · 4px</span></h2>
      <div className="dmb-spacing-scale">
        {marks.map(mark => (
          <div key={mark}>
            <i />
            <span>{mark}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function RadiusSystem({ radius }: { radius?: BatchShowcaseConfig['radius'] }) {
  if (radius?.source !== 'design-md') return null;

  const radiusItems = [
    radius?.control ? ['控件 - Control', radius.control, '按钮、输入框、分段控件'] : null,
    radius?.card ? ['卡片 - Card', radius.card, '内容容器、面板、浮层'] : null,
    radius?.preview ? ['预览 - Preview', radius.preview, '截图、画布、媒体框'] : null,
    radius?.pill ? ['胶囊 - Pill', radius.pill, '标签、状态点、短操作'] : null,
  ].filter((item): item is [string, string, string] => Boolean(item));

  if (radiusItems.length === 0) return null;

  return (
    <section className="dmb-block">
      <h2>圆角系统 - Radius</h2>
      <div className="dmb-radius-grid">
        {radiusItems.map(([label, value, usage]) => (
          <article key={label} style={{ '--dmb-radius-demo': value } as React.CSSProperties}>
            <div className="dmb-radius-sample" />
            <strong>{label}</strong>
            <code>{value}</code>
            <p>{usage}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ShadowSystem({ shadows }: { shadows?: BatchStyleSystemItem[] }) {
  if (!shadows?.length) return null;

  return (
    <section className="dmb-block">
      <h2>阴影规则 - Shadow</h2>
      <div className="dmb-shadow-grid">
        {shadows.map(item => (
          <article key={`${item.label}-${item.value}`} style={item.cssValue ? { boxShadow: item.cssValue } : undefined}>
            <strong>{item.label}</strong>
            <code>{item.value}</code>
            {item.description ? <p>{item.description}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function BorderSystem({ borders }: { borders?: BatchStyleSystemItem[] }) {
  if (!borders?.length) return null;

  return (
    <section className="dmb-block">
      <h2>边框系统 - Border</h2>
      <div className="dmb-border-grid">
        {borders.map(item => (
          <article key={`${item.label}-${item.value}`}>
            <strong>{item.label}</strong>
            <span
              className="dmb-border-sample"
              style={item.cssValue ? { borderColor: item.cssValue } : undefined}
            />
            <code>{item.value}</code>
            {item.description ? <p>{item.description}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function ComponentsSystem({ panels }: { panels: BatchShowcaseConfig['panels'] }) {
  return (
    <section className="dmb-block">
      <h2>组件片段 - Components</h2>
      <div className="dmb-component-strip">
        <button type="button">默认</button>
        <button type="button" className="dmb-button-hover">悬停</button>
        <button type="button" className="dmb-outline-button">描边</button>
      </div>
      <div className="dmb-component-grid">
        {panels.map(panel => (
          <article key={panel.title}>
            <small>{panel.eyebrow}</small>
            <h3>{panel.title}</h3>
            <p>{panel.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function DosDonts({ config }: { config: BatchShowcaseConfig }) {
  const usageGuidance = config.usageGuidance;
  if (!usageGuidance?.do?.length || !usageGuidance?.dont?.length) return null;

  return (
    <section className="dmb-block">
      <h2>使用建议 - Do's & Don'ts</h2>
      <div className="dmb-dos-grid">
        <article className="dmb-do">
          <strong>建议 - Do</strong>
          {usageGuidance.do.map(item => <p key={item}>{item}</p>)}
        </article>
        <article className="dmb-dont">
          <strong>避免 - Don't</strong>
          {usageGuidance.dont.map(item => <p key={item}>{item}</p>)}
        </article>
      </div>
    </section>
  );
}

function ResourceTabs({
  activeTabId,
  tabs,
  onSelect,
}: {
  activeTabId: string;
  tabs: BatchShowcaseTab[];
  onSelect: (tabId: string) => void;
}) {
  if (tabs.length === 0) return null;

  return (
    <div className="dmb-tabs" role="tablist" aria-label="Theme resource sections">
      <button
        id="dmb-tab-design-md"
        type="button"
        role="tab"
        aria-selected={activeTabId === 'design-md'}
        aria-controls="dmb-panel-design-md"
        onClick={() => onSelect('design-md')}
      >
        规范
      </button>
      {tabs.map(tab => (
        <button
          id={`dmb-tab-${tab.id}`}
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTabId === tab.id}
          aria-controls={`dmb-panel-${tab.id}`}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function HeaderLinks({ source }: { source?: BatchShowcaseSourceLinks }) {
  const links = getHeaderLinks(source);

  if (links.length === 0) return null;

  return (
    <nav className="dmb-sheet-links" aria-label="主题来源链接">
      {links.map(link => {
        const Icon = link.kind === 'website' ? Globe2 : FileSearch;
        return (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            aria-label={link.ariaLabel}
            data-label={link.title}
          >
            <Icon aria-hidden="true" focusable="false" strokeWidth={1.9} />
          </a>
        );
      })}
    </nav>
  );
}

function HeaderActions({
  activeTabId,
  onSelect,
  source,
  tabs,
}: {
  activeTabId: string;
  onSelect: (tabId: string) => void;
  source?: BatchShowcaseSourceLinks;
  tabs: BatchShowcaseTab[];
}) {
  const links = getHeaderLinks(source);
  const hasTabs = tabs.length > 0;
  const hasActions = Boolean(links.length || hasTabs);

  if (!hasActions) return null;

  return (
    <div className="dmb-sheet-actions">
      {links.length > 0 ? <HeaderLinks source={source} /> : null}
      {hasTabs ? <ResourceTabs activeTabId={activeTabId} tabs={tabs} onSelect={onSelect} /> : null}
    </div>
  );
}

export function DesignMdBatchShowcase({ config, tabs = [], className = '' }: DesignMdBatchShowcaseProps) {
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState('design-md');
  useThemeFontStylesheets(config.fontStylesheets);
  const tags = themeSelectionTags(config.distributionTags).slice(0, 14);
  const description = themeSelectionDescription(config.description);
  const imageLabel = config.brandAlias || config.brand;
  const headerTitle = config.brandAlias || config.brand.replace(/\s*主题$/, '');
  const palette = normalizePalette(config.palette);
  const hasResourceTabs = tabs.length > 0;
  const activeTab = tabs.find(tab => activeTabId === tab.id);

  const sheetHead = (
    <div className="dmb-sheet-head">
      <div className="dmb-sheet-head-main">
        <p>{variantLabels[config.variant]}</p>
        <h1>{headerTitle}</h1>
      </div>
      <HeaderActions
        activeTabId={activeTabId}
        source={config.source}
        tabs={tabs}
        onSelect={setActiveTabId}
      />
    </div>
  );

  const overviewContent = (
    <>
      <MobilePreview config={config} />
      {config.variant === 'mobile-product' && config.mobilePreview ? null : <PreviewFigure config={config} onOpen={setZoomImage} />}

      <div className="dmb-overview-meta">
        <div className="dmb-description">
          <p>{description || `${imageLabel} 的 Design.md 主题展示。`}</p>
          {config.descriptionEn ? <p lang="en">{config.descriptionEn}</p> : null}
        </div>
        <TagList tags={tags} />
      </div>

      <TokenOverview config={config} />
      <PaletteSystem palette={palette} />
      <TypographySystem typography={config.typography} />
      <SpacingSystem />
      <RadiusSystem radius={config.radius} />
      <ShadowSystem shadows={config.shadows} />
      <BorderSystem borders={config.borders} />
      <ComponentsSystem panels={config.panels} />
      <DosDonts config={config} />
    </>
  );

  return (
    <main className={['dmb-page', `dmb-variant-${config.variant}`, className].filter(Boolean).join(' ')}>
      <div className="dmb-layout">
        <article className="dmb-sheet">
          {sheetHead}

          {hasResourceTabs && activeTab ? (
            <div
              id={`dmb-panel-${activeTab.id}`}
              className="dmb-tab-panel"
              role="tabpanel"
              aria-labelledby={`dmb-tab-${activeTab.id}`}
            >
              {activeTab.content}
            </div>
          ) : (
            <div
              id="dmb-panel-design-md"
              className={hasResourceTabs ? 'dmb-tab-panel' : undefined}
              role={hasResourceTabs ? 'tabpanel' : undefined}
              aria-labelledby={hasResourceTabs ? 'dmb-tab-design-md' : undefined}
            >
              {overviewContent}
            </div>
          )}
        </article>
      </div>

      {zoomImage ? (
        <div className="dmb-lightbox" role="dialog" aria-modal="true" aria-label={`${imageLabel} enlarged preview`}>
          <button type="button" onClick={() => setZoomImage(null)} aria-label="Close preview">关闭 - Close</button>
          <div className="dmb-lightbox-scroll">
            {zoomImage.endsWith('.html') ? (
              <iframe src={zoomImage} title={`${imageLabel} enlarged source preview`} sandbox="allow-same-origin" />
            ) : (
              <img src={zoomImage} alt={`${imageLabel} enlarged preview`} />
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default DesignMdBatchShowcase;
