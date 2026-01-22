/**
 * Axhub Variant Switcher 组件 (重构版)
 *
 * 核心特性：
 * - 零依赖：不依赖任何外部 CSS 框架或图标库
 * - 轻量化 UI：使用图标入口替代重型控制条
 * - 丰富信息：支持标题和描述
 * - 全局面板：支持页面级统一管理和跳转
 * - 隐形控制：支持快捷键显隐入口
 * - 自动全局入口：当有比选组件时自动显示全局入口按钮
 */

import React, { useState, useEffect, useCallback, CSSProperties, useRef } from 'react';
import { createPortal } from 'react-dom';

// --- 类型定义 ---

export interface VariantItem {
  /** 唯一标识，若不提供则使用索引 */
  key?: string;
  /** 渲染内容 */
  content: React.ReactNode;
  /** 方案标题 */
  title: string;
  /** 方案一句话描述 */
  description: string;
  /** 方案详细说明文档（Markdown 格式） */
  markdown?: string;
}

export interface VariantAPI {
  id: string;
  /** 比选方案的中文名称，用于在全局面板中显示 */
  name: string;
  currentIndex: number;
  totalVariants: number;
  isDecided: boolean;
  variants: VariantItem[]; // 暴露方案详情供全局面板使用
  select: (index: number) => void;
  confirm: () => void;
  reset: () => void;
  focus: () => void; // 聚焦到该组件（滚动）
}

declare global {
  interface Window {
    AXHUB_VARIANT_MANAGER?: VariantManager;
  }
}

type Listener = () => void;

export interface VariantManager {
  register: (id: string, api: VariantAPI) => void;
  unregister: (id: string) => void;
  instances: Record<string, VariantAPI>;
  subscribe: (listener: Listener) => () => void;
  notify: () => void;
  setVisibility: (visible: boolean) => void;
  isVisible: boolean;
}

export interface VariantSwitcherProps {
  id?: string;
  /** 比选方案的中文名称，显示在全局面板中（如"头部设计"、"登录页布局"） */
  name?: string;
  /** 方案列表 */
  variants: VariantItem[];
  defaultIndex?: number;
  onConfirm?: (index: number, item: VariantItem) => void;
  onReset?: () => void;
  style?: CSSProperties;
  className?: string;
}

// --- 图标定义 ---

const Icons = {
  Switcher: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
    </svg>
  ),
  Check: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  Close: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  ),
  // 比选图标：两个重叠的卡片，表示多个方案比选
  VariantCompare: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* 底层卡片 */}
      <rect x="4" y="6" width="12" height="10" rx="2" opacity="0.4" />
      {/* 顶层卡片（偏移） */}
      <rect x="8" y="4" width="12" height="10" rx="2" />
    </svg>
  ),
  Target: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <circle cx="12" cy="12" r="6"></circle>
      <circle cx="12" cy="12" r="2"></circle>
    </svg>
  ),
  Exit: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
      <polyline points="16 17 21 12 16 7"></polyline>
      <line x1="21" y1="12" x2="9" y2="12"></line>
    </svg>
  ),
  Doc: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
  ),
  Back: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"></polyline>
    </svg>
  )
};

// --- 主题配置 ---
const THEME_COLOR = '#008F5D';
const THEME_COLOR_BG = 'rgba(0, 143, 93, 0.1)';

// --- 内置 Markdown 渲染器（零依赖） ---

const MarkdownViewer: React.FC<{ content: string }> = ({ content }) => {
  const parseInlineStyles = (text: string): React.ReactNode => {
    // 处理行内代码 `code`
    const parts = text.split(/(`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} style={{
            backgroundColor: '#f5f5f5',
            padding: '2px 6px',
            borderRadius: '3px',
            fontSize: '13px',
            fontFamily: 'Monaco, Consolas, monospace',
            color: '#e83e8c'
          }}>
            {part.slice(1, -1)}
          </code>
        );
      }
      // 处理加粗 **text**
      const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
      return boldParts.map((bp, j) => {
        if (bp.startsWith('**') && bp.endsWith('**')) {
          return <strong key={`${i}-${j}`}>{bp.slice(2, -2)}</strong>;
        }
        return bp;
      });
    });
  };

  const parseLine = (line: string, index: number): React.ReactNode => {
    // 标题
    if (line.startsWith('### ')) {
      return <h3 key={index} style={{ fontSize: '16px', fontWeight: 600, color: '#333', marginTop: '20px', marginBottom: '8px' }}>{parseInlineStyles(line.slice(4))}</h3>;
    }
    if (line.startsWith('## ')) {
      return <h2 key={index} style={{ fontSize: '18px', fontWeight: 600, color: '#333', marginTop: '24px', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>{parseInlineStyles(line.slice(3))}</h2>;
    }
    if (line.startsWith('# ')) {
      return <h1 key={index} style={{ fontSize: '22px', fontWeight: 600, color: '#333', marginBottom: '16px' }}>{parseInlineStyles(line.slice(2))}</h1>;
    }
    // 列表
    if (line.startsWith('- ')) {
      return (
        <li key={index} style={{ marginLeft: '16px', paddingLeft: '8px', color: '#555', marginBottom: '6px', listStyle: 'disc' }}>
          {parseInlineStyles(line.slice(2))}
        </li>
      );
    }
    if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        return (
          <li key={index} style={{ marginLeft: '16px', paddingLeft: '8px', color: '#555', marginBottom: '6px', listStyle: 'decimal' }}>
            {parseInlineStyles(match[2])}
          </li>
        );
      }
    }
    // 引用
    if (line.startsWith('> ')) {
      return (
        <blockquote key={index} style={{ marginLeft: 0, paddingLeft: '12px', borderLeft: `3px solid ${THEME_COLOR}`, color: '#666', fontStyle: 'italic', margin: '12px 0' }}>
          {parseInlineStyles(line.slice(2))}
        </blockquote>
      );
    }
    // 空行
    if (line.trim() === '') {
      return <div key={index} style={{ height: '12px' }} />;
    }
    // 普通段落
    return <p key={index} style={{ color: '#555', lineHeight: 1.7, marginBottom: '12px' }}>{parseInlineStyles(line)}</p>;
  };

  const lines = content.split('\n');

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', fontSize: '14px' }}>
      {lines.map((line, i) => parseLine(line, i))}
    </div>
  );
};

// --- 全局管理器实现 ---

const listeners: Listener[] = [];
let globalVisible = true;

function initGlobalManager(): VariantManager {
  if (!window.AXHUB_VARIANT_MANAGER) {
    window.AXHUB_VARIANT_MANAGER = {
      instances: {},
      isVisible: true,
      register(id, api) {
        this.instances[id] = api;
        this.notify();
      },
      unregister(id) {
        delete this.instances[id];
        this.notify();
      },
      subscribe(listener) {
        listeners.push(listener);
        return () => {
          const idx = listeners.indexOf(listener);
          if (idx > -1) listeners.splice(idx, 1);
        };
      },
      notify() {
        this.isVisible = globalVisible;
        listeners.forEach(fn => fn());
      },
      setVisibility(visible) {
        globalVisible = visible;
        this.notify();
      }
    };
  }
  return window.AXHUB_VARIANT_MANAGER;
}

// --- Hooks ---

/** 获取所有注册的实例及全局可见性 */
function useVariantManager() {
  const [state, setState] = useState<{
    instances: Record<string, VariantAPI>;
    isVisible: boolean;
  }>({ instances: {}, isVisible: true });

  useEffect(() => {
    const manager = initGlobalManager();
    const update = () => setState({
      instances: { ...manager.instances },
      isVisible: manager.isVisible
    });
    update();
    return manager.subscribe(update);
  }, []);

  return state;
}

// --- 样式定义 ---

const STYLES = {
  container: {
    position: 'relative' as const,
    width: '100%',
    height: '100%',
  },
  triggerBtn: {
    position: 'absolute' as const,
    top: '4px',
    right: '4px',
    zIndex: 9001,
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255, 255, 255, 0.95)',
    border: '1px solid rgba(0, 0, 0, 0.08)',
    borderRadius: '2px',
    color: '#666',
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    transition: 'all 0.2s',
  },
  popover: {
    position: 'absolute' as const,
    top: '32px',
    right: '0px',
    width: '260px',
    backgroundColor: '#fff',
    borderRadius: '2px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    border: '1px solid rgba(0, 0, 0, 0.08)',
    padding: '4px',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    opacity: 0,
    transform: 'translateY(-4px)',
    pointerEvents: 'none' as const,
    transition: 'all 0.15s ease-out',
  },
  popoverVisible: {
    opacity: 1,
    transform: 'translateY(0)',
    pointerEvents: 'auto' as const,
  },
  variantCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '8px 10px',
    borderRadius: '0',
    cursor: 'pointer',
    border: 'none',
    transition: 'background 0.2s',
    textAlign: 'left' as const,
    background: 'transparent',
  },
  variantCardActive: {
    background: THEME_COLOR_BG,
    border: 'none',
  },
  variantTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#333',
    marginBottom: '2px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  variantDesc: {
    fontSize: '12px',
    color: '#888',
    lineHeight: '1.4',
  },
  globalTrigger: {
    position: 'fixed' as const,
    bottom: '24px',
    right: '24px',
    zIndex: 99999,
    width: '32px',
    height: '32px',
    borderRadius: '16px',
    backgroundColor: '#fff',
    color: '#555',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
    cursor: 'pointer',
    border: '1px solid rgba(0,0,0,0.05)',
    transition: 'transform 0.2s, opacity 0.2s',
  },
  globalPanel: {
    position: 'fixed' as const,
    top: 0,
    right: 0,
    bottom: 0,
    width: '300px',
    backgroundColor: '#fff',
    boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
    zIndex: 100000,
    padding: '0',
    display: 'flex',
    flexDirection: 'column' as const,
    transform: 'translateX(100%)',
    transition: 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
  },
  globalPanelVisible: {
    transform: 'translateX(0)',
  },
  globalPanelHeader: {
    padding: '16px',
    borderBottom: '1px solid #f5f5f5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '15px',
    fontWeight: 600,
    color: '#333',
  },
  globalPanelContent: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '16px',
  },
  globalPanelFooter: {
    padding: '12px 16px',
    borderTop: '1px solid #f5f5f5',
    display: 'flex',
    justifyContent: 'center',
  },
  nodeGroup: {
    marginBottom: '16px',
    border: '1px solid #eee',
    borderRadius: '0',
    overflow: 'hidden',
  },
  nodeHeader: {
    padding: '6px 10px',
    backgroundColor: '#fafafa',
    borderBottom: '1px solid #eee',
    fontSize: '12px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    color: '#666',
  },
  exitBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'none',
    border: 'none',
    color: '#999',
    fontSize: '12px',
    cursor: 'pointer',
    padding: '8px',
    borderRadius: '0',
    transition: 'all 0.2s',
  }
};

// --- 全局入口组件（单例） ---

let globalControlMountRef = { current: false };

/** 全局入口控制组件 */
const GlobalVariantControl: React.FC = () => {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [docView, setDocView] = useState<{ title: string; content: string } | null>(null);
  const { instances: allInstances, isVisible } = useVariantManager();

  // 键盘快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        initGlobalManager().setVisibility(!isVisible);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible]);

  const instancesList = Object.values(allInstances);

  // 按 id 字母顺序排序，保持稳定的显示顺序
  const sortedInstances = [...instancesList].sort((a, b) => a.id.localeCompare(b.id));

  // 如果没有实例或不可见，则不渲染
  if (!isVisible || sortedInstances.length === 0) {
    return null;
  }

  return (
    <>
      {/* 全局悬浮球 */}
      <button
        style={STYLES.globalTrigger}
        onClick={() => setIsPanelOpen(true)}
        title="方案比选 (Ctrl + .)"
      >
        <Icons.VariantCompare />
      </button>

      {/* 全局侧边栏面板 */}
      <div style={{
        ...STYLES.globalPanel,
        ...(isPanelOpen ? STYLES.globalPanelVisible : {})
      }}>
        {/* Header */}
        <div style={STYLES.globalPanelHeader}>
          {docView ? (
            <>
              <button
                onClick={() => setDocView(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Icons.Back />
                <span style={{ fontSize: '14px' }}>返回</span>
              </button>
              <button
                onClick={() => setIsPanelOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#999' }}
              >
                <Icons.Close />
              </button>
            </>
          ) : (
            <>
              <span>方案比选</span>
              <button
                onClick={() => setIsPanelOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#999' }}
              >
                <Icons.Close />
              </button>
            </>
          )}
        </div>

        {/* Content */}
        <div style={STYLES.globalPanelContent}>
          {docView ? (
            /* 文档视图 - 简洁无风格 */
            <div style={{ padding: '0 4px' }}>
              <div style={{ fontSize: '13px', color: '#999', marginBottom: '16px' }}>{docView.title}</div>
              <MarkdownViewer content={docView.content} />
            </div>
          ) : (
            /* 方案列表视图 */
            sortedInstances.map(inst => (
              <div key={inst.id} style={STYLES.nodeGroup}>
                {/* Node Header */}
                <div style={STYLES.nodeHeader}>
                  <span>{inst.name}</span>
                  <button
                    onClick={() => {
                      inst.focus();
                      setIsPanelOpen(false);
                    }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: THEME_COLOR, display: 'flex', alignItems: 'center', fontSize: '12px'
                    }}
                  >
                    <Icons.Target />
                    <span style={{ marginLeft: 4 }}>定位</span>
                  </button>
                </div>
                {/* Variants List */}
                <div>
                  {inst.variants.map((v, idx) => {
                    const isActive = inst.currentIndex === idx;
                    return (
                      <div
                        key={v.key || idx}
                        style={{
                          ...STYLES.variantCard,
                          ...(isActive ? { background: THEME_COLOR_BG } : {}),
                          borderBottom: '1px solid #f9f9f9',
                          borderRadius: 0,
                        }}
                      >
                        <div
                          onClick={() => inst.select(idx)}
                          style={{ cursor: 'pointer' }}
                        >
                          <div style={STYLES.variantTitle}>
                            <span>{v.title}</span>
                            {isActive && <span style={{color: THEME_COLOR, fontSize: '12px'}}>当前</span>}
                          </div>
                          <div style={STYLES.variantDesc}>{v.description}</div>
                        </div>
                        {/* 文档按钮 */}
                        {v.markdown && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDocView({ title: v.title, content: v.markdown! });
                            }}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: '#999', display: 'flex', alignItems: 'center',
                              fontSize: '12px', marginTop: '6px', padding: 0
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = THEME_COLOR}
                            onMouseLeave={e => e.currentTarget.style.color = '#999'}
                          >
                            <Icons.Doc />
                            <span style={{ marginLeft: 4 }}>查看文档</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer: Exit Button - 仅在列表视图显示 */}
        {!docView && (
          <div style={STYLES.globalPanelFooter}>
            <button
              style={STYLES.exitBtn}
              onClick={() => {
                initGlobalManager().setVisibility(false);
                setIsPanelOpen(false);
              }}
              title="隐藏比选入口 (Ctrl + . 重新开启)"
              onMouseEnter={e => e.currentTarget.style.color = '#333'}
              onMouseLeave={e => e.currentTarget.style.color = '#999'}
            >
              <Icons.Exit />
              <span>退出比选</span>
            </button>
          </div>
        )}
      </div>

      {/* 遮罩层 */}
      {isPanelOpen && (
        <div
          onClick={() => setIsPanelOpen(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.1)', zIndex: 99999
          }}
        />
      )}
    </>
  );
};

// --- 主组件 ---

export const VariantSwitcher: React.FC<VariantSwitcherProps> = ({
  id: propId,
  name: propName,
  variants = [],
  defaultIndex = 0,
  onConfirm,
  onReset,
  style,
  className,
}) => {
  const [instanceId] = useState(() =>
    propId || `axhub_vs_${Math.random().toString(36).substr(2, 9)}`
  );

  // 如果没有提供 name，使用 id 作为显示名称
  const displayName = propName || instanceId;

  const containerRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(defaultIndex);
  const [isDecided, setIsDecided] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  
  const { isVisible: globalVisible } = useVariantManager();

  // 标记当前组件负责渲染全局入口（单例，只渲染一次）
  const [isGlobalControlOwner, setIsGlobalControlOwner] = useState(false);

  useEffect(() => {
    // 如果还没有组件负责渲染全局入口，则当前组件负责
    if (!globalControlMountRef.current) {
      globalControlMountRef.current = true;
      setIsGlobalControlOwner(true);
    }

    // 组件卸载时，如果当前组件是全局入口的拥有者，则释放
    return () => {
      if (isGlobalControlOwner) {
        globalControlMountRef.current = false;
      }
    };
  }, [isGlobalControlOwner]);

  // --- API Methods ---
  const select = useCallback((index: number) => {
    if (index >= 0 && index < variants.length) {
      setCurrentIndex(index);
    }
  }, [variants.length]);

  const confirm = useCallback(() => {
    setIsDecided(true);
    setIsPopoverOpen(false);
    if (variants[currentIndex]) {
      onConfirm?.(currentIndex, variants[currentIndex]);
    }
  }, [currentIndex, variants, onConfirm]);

  const reset = useCallback(() => {
    setIsDecided(false);
    onReset?.();
  }, [onReset]);

  const focus = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setIsHovered(true);
      setTimeout(() => setIsHovered(false), 2000);
    }
  }, []);

  // --- 注册到全局 ---
  useEffect(() => {
    if (variants.length > 0) {
      const manager = initGlobalManager();
      const api: VariantAPI = {
        id: instanceId,
        name: displayName,
        currentIndex,
        totalVariants: variants.length,
        isDecided,
        variants,
        select,
        confirm,
        reset,
        focus,
      };

      manager.register(instanceId, api);
      return () => manager.unregister(instanceId);
    }
  }, [instanceId, displayName, currentIndex, variants, isDecided, select, confirm, reset, focus]);

  // --- 点击外部关闭弹窗 ---
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsPopoverOpen(false);
      }
    };
    if (isPopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isPopoverOpen]);

  if (variants.length === 0) return null;

  return (
    <>
      {/* 全局入口（单例，通过 Portal 渲染到 body，只由第一个组件渲染） */}
      {isGlobalControlOwner && typeof document !== 'undefined' && createPortal(
        <GlobalVariantControl />,
        document.body
      )}

      <div
        ref={containerRef}
        className={className}
        style={{ ...STYLES.container, ...style }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        data-axhub-variant-id={instanceId}
      >
      {/* 渲染当前方案内容 */}
      {variants[currentIndex]?.content}

      {/* 触发器图标 (轻量化，悬停显示) */}
      {globalVisible && (
        <button
          style={{
            ...STYLES.triggerBtn,
            opacity: (isHovered || isPopoverOpen) ? 1 : 0,
            pointerEvents: (isHovered || isPopoverOpen) ? 'auto' : 'none',
            backgroundColor: isPopoverOpen ? THEME_COLOR : '#fff',
            color: isPopoverOpen ? '#fff' : '#666',
            borderColor: isPopoverOpen ? THEME_COLOR : 'rgba(0,0,0,0.06)'
          }}
          onClick={(e) => {
            e.stopPropagation();
            setIsPopoverOpen(!isPopoverOpen);
          }}
          title="切换方案"
        >
          <Icons.Switcher />
        </button>
      )}

      {/* 下拉选择面板 */}
      {globalVisible && (
        <div style={{
          ...STYLES.popover,
          ...(isPopoverOpen ? STYLES.popoverVisible : {})
        }}>
          <div style={{ padding: '4px 8px', fontSize: '12px', color: '#999', fontWeight: 600 }}>
            选择方案
          </div>

          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {variants.map((variant, index) => {
              const isActive = index === currentIndex;
              return (
                <div
                  key={variant.key || index}
                  onClick={(e) => {
                    e.stopPropagation();
                    select(index);
                  }}
                  style={{
                    ...STYLES.variantCard,
                    ...(isActive ? STYLES.variantCardActive : {}),
                  }}
                >
                  <div style={STYLES.variantTitle}>
                    {variant.title}
                    {isActive && <Icons.Check />}
                  </div>
                  <div style={STYLES.variantDesc}>
                    {variant.description}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ borderTop: '1px solid #f5f5f5', marginTop: '4px', paddingTop: '8px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            {isDecided ? (
               <button
               onClick={(e) => { e.stopPropagation(); reset(); }}
               style={{
                 background: 'transparent', border: '1px solid #eee', borderRadius: '4px',
                 padding: '4px 10px', fontSize: '12px', cursor: 'pointer', color: '#666'
               }}
             >
               重选
             </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); confirm(); }}
                style={{
                  background: THEME_COLOR, border: 'none', borderRadius: '4px',
                  padding: '4px 10px', fontSize: '12px', cursor: 'pointer', color: '#fff'
                }}
              >
                确认
              </button>
            )}
          </div>
        </div>
      )}
      </div>
    </>
  );
};

export default VariantSwitcher;
