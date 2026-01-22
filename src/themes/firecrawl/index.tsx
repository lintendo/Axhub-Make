import './globals.css';
import React, { useEffect, useState } from 'react';
import { ThemeShell, NavGroup, NavItem, MarkdownViewer } from '../../common/ThemeShell';

/**
 * Firecrawl 主题演示页
 */

const groups: NavGroup[] = [
  { id: 'docs', title: '说明', order: 1 },
  { id: 'foundation', title: '基础', order: 2 },
  { id: 'components', title: '组件', order: 3 },
];

const items: NavItem[] = [
  { id: 'design-spec', label: '设计规范 Design Spec', groupId: 'docs' },

  { id: 'colors', label: '色彩系统', groupId: 'foundation' },
  { id: 'typography', label: '字体系统', groupId: 'foundation' },
  { id: 'spacing', label: '间距', groupId: 'foundation' },
  { id: 'radius', label: '圆角', groupId: 'foundation' },
  { id: 'shadows', label: '阴影', groupId: 'foundation' },
  { id: 'icons', label: '图标', groupId: 'foundation' },

  { id: 'buttons', label: '按钮', groupId: 'components' },
  { id: 'cards', label: '卡片', groupId: 'components' },
  { id: 'inputs', label: '输入框', groupId: 'components' },
];

function ColorSwatch({
  name,
  color,
  hex,
  textDark = false,
  light = false
}: {
  name: string;
  color: string;
  hex: string;
  textDark?: boolean;
  light?: boolean;
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: '80px',
        height: '80px',
        backgroundColor: color,
        borderRadius: '8px',
        marginBottom: '8px',
        border: light ? '1px solid var(--border)' : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {textDark && (
          <span style={{ fontSize: '12px', color: '#262626', fontWeight: 500 }}>Aa</span>
        )}
      </div>
      <div style={{ fontSize: '12px', fontWeight: 500, marginBottom: '2px' }}>{name}</div>
      <div style={{ fontSize: '11px', color: 'var(--subtle)', fontFamily: 'var(--font-mono)' }}>{hex}</div>
    </div>
  );
}

function ColorsSection() {
  return (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 500, marginBottom: '24px' }}>色彩系统 (Colors)</h2>

      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '12px', fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Primary
        </h3>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <ColorSwatch name="primary" color="var(--primary)" hex="#FA5D19" />
          <ColorSwatch name="primary-foreground" color="var(--primary-foreground)" hex="#FFFFFF" light />
        </div>
      </div>

      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '12px', fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Background & Surface
        </h3>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <ColorSwatch name="background" color="var(--background)" hex="#F9F9F9" light />
          <ColorSwatch name="card" color="var(--card)" hex="#FFFFFF" light />
          <ColorSwatch name="popover" color="var(--popover)" hex="#FFFFFF" light />
          <ColorSwatch name="muted" color="var(--muted)" hex="rgba(0,0,0,0.04)" light />
        </div>
      </div>

      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '12px', fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Text Colors
        </h3>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <ColorSwatch name="foreground" color="var(--foreground)" hex="#262626" textDark />
          <ColorSwatch name="muted-foreground" color="var(--muted-foreground)" hex="rgba(38,38,38,0.64)" textDark />
          <ColorSwatch name="subtle" color="var(--subtle)" hex="rgba(38,38,38,0.48)" textDark />
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: '12px', fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Semantic Colors
        </h3>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <ColorSwatch name="destructive" color="var(--destructive)" hex="#EF4444" />
          <ColorSwatch name="accent" color="var(--accent)" hex="#FA5D19" />
        </div>
      </div>
    </div>
  );
}

function TypographySection() {
  return (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 500, marginBottom: '24px' }}>字体系统 (Typography)</h2>

      <div style={{
        backgroundColor: 'var(--card)',
        borderRadius: '12px',
        padding: '24px',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ marginBottom: '24px' }}>
          <span style={{ fontSize: '12px', color: 'var(--subtle)', fontFamily: 'var(--font-mono)' }}>H1 / 28px / 500</span>
          <p style={{ fontSize: '28px', fontWeight: 500, lineHeight: 1.4 }}>Firecrawl UI Spec</p>
        </div>
        <div style={{ marginBottom: '24px' }}>
          <span style={{ fontSize: '12px', color: 'var(--subtle)', fontFamily: 'var(--font-mono)' }}>H2 / 20px / 450</span>
          <p style={{ fontSize: '20px', fontWeight: 450, lineHeight: 1.4 }}>Section Heading</p>
        </div>
        <div style={{ marginBottom: '24px' }}>
          <span style={{ fontSize: '12px', color: 'var(--subtle)', fontFamily: 'var(--font-mono)' }}>Body / 16px / 400</span>
          <p style={{ fontSize: '16px', fontWeight: 400, lineHeight: 1.5 }}>The quick brown fox jumps over the lazy dog. 敏捷的棕色狐狸跳过了懒狗。</p>
        </div>
        <div style={{ marginBottom: '24px' }}>
          <span style={{ fontSize: '12px', color: 'var(--subtle)', fontFamily: 'var(--font-mono)' }}>Body Small / 14px / 400</span>
          <p style={{ fontSize: '14px', fontWeight: 400, lineHeight: 1.55, color: 'var(--muted-foreground)' }}>辅助说明文本与注释内容。</p>
        </div>
        <div style={{ marginBottom: '24px' }}>
          <span style={{ fontSize: '12px', color: 'var(--subtle)', fontFamily: 'var(--font-mono)' }}>Label / 14px / 450</span>
          <p style={{ fontSize: '14px', fontWeight: 450, lineHeight: 1.4, letterSpacing: '0.01em' }}>Label Text</p>
        </div>
        <div>
          <span style={{ fontSize: '12px', color: 'var(--subtle)', fontFamily: 'var(--font-mono)' }}>Code / 14px / Geist Mono</span>
          <p style={{ fontSize: '14px', fontWeight: 400, lineHeight: 1.55, fontFamily: 'var(--font-mono)' }}>curl -X POST https://api.firecrawl.dev</p>
        </div>
      </div>
    </div>
  );
}

function SpacingSection() {
  return (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 500, marginBottom: '24px' }}>间距 (Spacing)</h2>

      <div>
        <h3 style={{ fontSize: '12px', fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          2/4/8px Rhythm
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { name: '--spacing-1', value: 'var(--spacing-1)' },
            { name: '--spacing-2', value: 'var(--spacing-2)' },
            { name: '--spacing-3', value: 'var(--spacing-3)' },
            { name: '--spacing-4', value: 'var(--spacing-4)' },
            { name: '--spacing-6', value: 'var(--spacing-6)' },
            { name: '--spacing-8', value: 'var(--spacing-8)' },
            { name: '--spacing-10', value: 'var(--spacing-10)' },
            { name: '--spacing-12', value: 'var(--spacing-12)' },
            { name: '--spacing-20', value: 'var(--spacing-20)' },
          ].map(({ name, value }) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: value,
                height: '14px',
                backgroundColor: 'var(--primary)',
                borderRadius: '2px'
              }} />
              <span style={{ fontSize: '12px', color: 'var(--subtle)', fontFamily: 'var(--font-mono)' }}>
                {name}: {value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RadiusSection() {
  return (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 500, marginBottom: '24px' }}>圆角 (Radius)</h2>

      <div>
        <h3 style={{ fontSize: '12px', fontWeight: 500, color: 'var(--muted-foreground)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Border Radius Tokens
        </h3>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {[
            { name: '--radius-sm', value: 'var(--radius-sm)' },
            { name: '--radius-md', value: 'var(--radius-md)' },
            { name: '--radius-lg', value: 'var(--radius-lg)' },
            { name: '--radius-xl', value: 'var(--radius-xl)' },
            { name: '--radius-2xl', value: 'var(--radius-2xl)' },
            { name: '--radius-full', value: 'var(--radius-full)' },
          ].map(({ name, value }) => (
            <div key={name} style={{ textAlign: 'center' }}>
              <div style={{
                width: '56px',
                height: '56px',
                backgroundColor: 'var(--primary)',
                borderRadius: value,
                marginBottom: '8px'
              }} />
              <div style={{ fontSize: '11px', color: 'var(--subtle)', fontFamily: 'var(--font-mono)' }}>
                {name}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ShadowsSection() {
  return (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 500, marginBottom: '24px' }}>阴影 (Shadows)</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
        {[
          { name: '--shadow-sm', value: 'var(--shadow-sm)', desc: '轻量卡片、列表' },
          { name: '--shadow-md', value: 'var(--shadow-md)', desc: '浮层、弹窗' },
        ].map(({ name, value, desc }) => (
          <div key={name} style={{
            backgroundColor: 'var(--card)',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            padding: '18px',
            boxShadow: value
          }}>
            <div style={{ fontSize: '12px', color: 'var(--subtle)', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
              {name}
            </div>
            <div style={{ fontSize: '14px', fontWeight: 450, marginBottom: '6px' }}>{desc}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function IconsSection() {
  const iconStyle: React.CSSProperties = {
    width: '24px',
    height: '24px',
    color: 'var(--muted-foreground)'
  };

  return (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 500, marginBottom: '24px' }}>图标 (Icons)</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
        {[
          { name: 'Spark', svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3z" />
            </svg>
          ) },
          { name: 'Search', svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          ) },
          { name: 'Terminal', svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6l6 6-6 6" />
              <path d="M12 18h8" />
            </svg>
          ) },
          { name: 'Globe', svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18" />
              <path d="M12 3a12 12 0 0 1 0 18a12 12 0 0 1 0-18z" />
            </svg>
          ) },
          { name: 'Code', svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 7L3 12l5 5" />
              <path d="M16 7l5 5-5 5" />
            </svg>
          ) },
          { name: 'Webhook', svg: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12a4 4 0 0 1 4-4h3" />
              <path d="M20 12a4 4 0 0 0-4-4h-3" />
              <path d="M4 12a4 4 0 0 0 4 4h3" />
              <path d="M20 12a4 4 0 0 1-4 4h-3" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="16" cy="8" r="1.5" />
              <circle cx="8" cy="16" r="1.5" />
              <circle cx="16" cy="16" r="1.5" />
            </svg>
          ) },
        ].map(({ name, svg }) => (
          <div key={name} style={{
            backgroundColor: 'var(--card)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={iconStyle}>{svg}</div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 450 }}>{name}</div>
              <div style={{ fontSize: '11px', color: 'var(--subtle)', fontFamily: 'var(--font-mono)' }}>24px / 1.5px</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ButtonsSection() {
  return (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 500, marginBottom: '24px' }}>按钮 (Buttons)</h2>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={{
          backgroundColor: 'var(--primary)',
          color: 'var(--primary-foreground)',
          padding: '10px 20px',
          borderRadius: '6px',
          border: 'none',
          fontSize: '14px',
          fontWeight: 450,
          cursor: 'pointer',
          boxShadow: '0 2px 4px rgba(250, 93, 25, 0.12)'
        }}>
          Primary Button
        </button>

        <button style={{
          backgroundColor: 'var(--secondary)',
          color: 'var(--secondary-foreground)',
          padding: '10px 20px',
          borderRadius: '6px',
          border: '1px solid var(--border)',
          fontSize: '14px',
          fontWeight: 450,
          cursor: 'pointer'
        }}>
          Secondary Button
        </button>

        <button style={{
          backgroundColor: 'transparent',
          color: 'var(--foreground)',
          padding: '10px 20px',
          borderRadius: '6px',
          border: '1px solid var(--border)',
          fontSize: '14px',
          fontWeight: 450,
          cursor: 'pointer'
        }}>
          Ghost Button
        </button>

        <button style={{
          backgroundColor: 'var(--destructive)',
          color: 'var(--destructive-foreground)',
          padding: '10px 20px',
          borderRadius: '6px',
          border: 'none',
          fontSize: '14px',
          fontWeight: 450,
          cursor: 'pointer'
        }}>
          Destructive
        </button>
      </div>
    </div>
  );
}

function CardsSection() {
  return (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 500, marginBottom: '24px' }}>卡片 (Cards)</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
        <div style={{
          backgroundColor: 'var(--card)',
          borderRadius: '10px',
          padding: '20px',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 500, marginBottom: '8px' }}>Card Title</h3>
          <p style={{ fontSize: '14px', color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
            这是一个基础卡片组件，使用 card 背景色与轻量阴影。
          </p>
        </div>

        <div style={{
          backgroundColor: 'var(--card)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-md)'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 500, marginBottom: '8px' }}>Elevated Card</h3>
          <p style={{ fontSize: '14px', color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
            悬浮卡片使用更明显的阴影层级。
          </p>
        </div>

        <div style={{
          backgroundColor: 'var(--card)',
          borderRadius: '10px',
          padding: '20px',
          border: '1px solid var(--border)',
          borderLeftColor: 'var(--primary)',
          borderLeftWidth: '4px'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 500, marginBottom: '8px', color: 'var(--primary)' }}>Accent Card</h3>
          <p style={{ fontSize: '14px', color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
            使用品牌色作为强调边框，突出重要内容。
          </p>
        </div>
      </div>
    </div>
  );
}

function InputsSection() {
  return (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 500, marginBottom: '24px' }}>输入框 (Inputs)</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '420px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 450, marginBottom: '6px' }}>
            Default Input
          </label>
          <input
            type="text"
            placeholder="请输入内容..."
            style={{
              width: '100%',
              backgroundColor: 'var(--muted)',
              color: 'var(--foreground)',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              fontSize: '14px',
              outline: 'none'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 450, marginBottom: '6px' }}>
            Textarea
          </label>
          <textarea
            placeholder="请输入多行内容..."
            rows={3}
            style={{
              width: '100%',
              backgroundColor: 'var(--muted)',
              color: 'var(--foreground)',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              fontSize: '14px',
              outline: 'none',
              resize: 'vertical'
            }}
          />
        </div>
      </div>
    </div>
  );
}

function renderContent(activeId: string) {
  switch (activeId) {
    case 'design-spec':
      return null;
    case 'colors':
      return <ColorsSection />;
    case 'typography':
      return <TypographySection />;
    case 'spacing':
      return <SpacingSection />;
    case 'radius':
      return <RadiusSection />;
    case 'shadows':
      return <ShadowsSection />;
    case 'icons':
      return <IconsSection />;
    case 'buttons':
      return <ButtonsSection />;
    case 'cards':
      return <CardsSection />;
    case 'inputs':
      return <InputsSection />;
    default:
      return <ColorsSection />;
  }
}

function Component() {
  const [activeId, setActiveId] = useState('design-spec');
  const [designSpec, setDesignSpec] = useState<string>('');

  useEffect(() => {
    fetch(new URL('./DESIGN-SPEC.md', import.meta.url).href)
      .then(res => res.text())
      .then(text => setDesignSpec(text))
      .catch(err => console.error('Failed to load Design Spec:', err));
  }, []);

  return (
    <ThemeShell
      brand={{
        name: 'Firecrawl',
        subtitle: 'Design System',
        logoBgColor: '#fa5d19',
        logoTextColor: '#ffffff',
      }}
      groups={groups}
      items={items}
      activeId={activeId}
      onNavigate={setActiveId}
      sidebar={{
        width: 240,
        defaultOpen: true,
        collapsible: true,
      }}
      theme={{
        mode: 'light',
        colors: {
          bgPrimary: '#ffffff',
          bgSecondary: '#f9f9f9',
          bgTertiary: '#ededed',
          bgHover: '#f3f3f3',
          bgActive: '#e7e7e7',
          textPrimary: '#262626',
          textSecondary: 'rgba(38, 38, 38, 0.72)',
          textTertiary: 'rgba(38, 38, 38, 0.56)',
          textMuted: 'rgba(38, 38, 38, 0.4)',
          border: '#e5e7eb',
          borderLight: '#ededed',
          activeIndicator: '#fa5d19',
        },
      }}
      style={{
        fontFamily: 'var(--font-sans)',
      }}
    >
      {activeId === 'design-spec' ? (
        designSpec ? <MarkdownViewer content={designSpec} /> : (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted-foreground)' }}>加载设计规范中...</div>
        )
      ) : (
        renderContent(activeId)
      )}
    </ThemeShell>
  );
}

export default Component;
