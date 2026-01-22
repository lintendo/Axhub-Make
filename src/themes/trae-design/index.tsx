import './globals.css';
import React from 'react';
import { ConfigProvider } from 'antd';
import tokens from './designToken.json';

const themeTokens = (tokens as { token?: Record<string, any> }).token || {};

const containerStyle: React.CSSProperties = {
  maxWidth: 1152,
  margin: '0 auto',
  padding: '0 24px',
};

const sectionStyle: React.CSSProperties = {
  padding: '48px 0',
  borderBottom: '1px solid var(--border-subtle)',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 600,
  color: 'var(--foreground)',
};

const sectionSubtitleStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--primary)',
  fontFamily: 'var(--font-mono)',
  marginBottom: '6px',
};

const chipStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--subtle)',
  fontFamily: 'var(--font-mono)',
};

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: '32px' }}>
      <div style={sectionSubtitleStyle}>{subtitle}</div>
      <div style={sectionTitleStyle}>{title}</div>
    </div>
  );
}

function ColorSwatch({
  name,
  value,
  hex,
  textDark = false,
}: {
  name: string;
  value: string;
  hex: string;
  textDark?: boolean;
}) {
  return (
    <div style={{ textAlign: 'left' }}>
      <div
        style={{
          width: '140px',
          height: '88px',
          borderRadius: '10px',
          backgroundColor: value,
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '10px',
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 600, color: textDark ? '#0a0b0d' : 'var(--foreground)' }}>
          Aa
        </span>
      </div>
      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--foreground)' }}>{name}</div>
      <div style={{ fontSize: '12px', color: 'var(--subtle)', fontFamily: 'var(--font-mono)' }}>{hex}</div>
    </div>
  );
}

function TypographyRow({
  label,
  size,
  weight,
  lineHeight,
  sample,
  style,
}: {
  label: string;
  size: string;
  weight: number;
  lineHeight: string;
  sample: string;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={chipStyle}>{label} / {size} / {weight} / {lineHeight}</div>
      <div style={{ fontSize: size, fontWeight: weight, lineHeight, color: 'var(--foreground)', ...style }}>
        {sample}
      </div>
    </div>
  );
}

const Component: React.FC = () => {
  return (
    <ConfigProvider theme={{ token: themeTokens }}>
      <main style={{ minHeight: '100vh', background: 'var(--background)', color: 'var(--foreground)', fontFamily: 'var(--font-sans)' }}>
        <header style={{ borderBottom: '1px solid var(--border-subtle)', padding: '24px 0' }}>
          <div style={containerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'var(--primary)',
                color: 'var(--primary-foreground)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: '14px',
                fontWeight: 700,
              }}>
                T
              </div>
              <div style={{ fontSize: '18px', fontWeight: 600 }}>TRAE Design System</div>
            </div>
          </div>
        </header>

        <section style={{ ...sectionStyle, paddingTop: '64px', paddingBottom: '64px' }}>
          <div style={containerStyle}>
            <div style={{ fontSize: '48px', fontWeight: 600, lineHeight: 1.1 }}>
              设计规范 <span style={{ color: 'var(--primary)' }}>&</span> Design Tokens
            </div>
            <p style={{ marginTop: '16px', fontSize: '18px', color: 'var(--muted-foreground)', maxWidth: '620px' }}>
              TRAE 是一款智能 AI IDE 产品，设计风格以深色主题为主，强调科技感与专业性。采用亮绿色作为品牌主色调，传达创新、智能、高效的产品理念。
            </p>
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={containerStyle}>
            <SectionHeader title="色彩系统" subtitle="Color System" />

            <div style={{ display: 'grid', gap: '28px' }}>
              <div>
                <div style={chipStyle}>Primary</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px', marginTop: '12px' }}>
                  <ColorSwatch name="Primary" value="var(--primary)" hex="#32F08C" />
                  <ColorSwatch name="Primary Foreground" value="var(--primary-foreground)" hex="#0A0B0D" textDark />
                </div>
              </div>

              <div>
                <div style={chipStyle}>Background & Surface</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px', marginTop: '12px' }}>
                  <ColorSwatch name="Background" value="var(--background)" hex="#0A0B0D" />
                  <ColorSwatch name="Surface" value="var(--card)" hex="#121314" />
                  <ColorSwatch name="Surface Elevated" value="var(--popover)" hex="#171A1C" />
                  <ColorSwatch name="Surface Subtle" value="var(--muted)" hex="#1E1F23" />
                </div>
              </div>

              <div>
                <div style={chipStyle}>Text</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px', marginTop: '12px' }}>
                  <ColorSwatch name="Foreground" value="var(--foreground)" hex="#F5F9FE" textDark />
                  <ColorSwatch name="Muted Foreground" value="var(--muted-foreground)" hex="#A6AAB5" textDark />
                  <ColorSwatch name="Subtle Foreground" value="var(--subtle)" hex="#787D87" textDark />
                </div>
              </div>

              <div>
                <div style={chipStyle}>Border & Semantic</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px', marginTop: '12px' }}>
                  <ColorSwatch name="Border" value="var(--border)" hex="rgba(255,255,255,0.2)" />
                  <ColorSwatch name="Border Subtle" value="var(--border-subtle)" hex="rgba(237,239,242,0.13)" />
                  <ColorSwatch name="Destructive" value="var(--destructive)" hex="#EF4444" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={containerStyle}>
            <SectionHeader title="字体系统" subtitle="Typography" />

            <div style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '14px',
              padding: '28px',
              boxShadow: '0 3px 9px rgba(0,0,0,0.08)',
            }}>
              <TypographyRow label="Display" size="72px" weight={500} lineHeight="1.1" sample="TRAE Design System" />
              <TypographyRow label="H1" size="56px" weight={600} lineHeight="1.2" sample="Intelligent AI IDE" />
              <TypographyRow label="H2" size="40px" weight={600} lineHeight="1.2" sample="Section Heading" />
              <TypographyRow label="H3" size="24px" weight={600} lineHeight="1.3" sample="Card Title" />
              <TypographyRow label="Body Large" size="18px" weight={500} lineHeight="1.6" sample="TRAE 通过智能协作提升开发效率。" />
              <TypographyRow label="Body" size="16px" weight={400} lineHeight="1.6" sample="The quick brown fox jumps over the lazy dog." />
              <TypographyRow label="Body Small" size="14px" weight={400} lineHeight="1.6" sample="辅助说明文本与注释内容。" style={{ color: 'var(--muted-foreground)' }} />
              <TypographyRow label="Label" size="14px" weight={500} lineHeight="1.2" sample="Button Label" />
              <TypographyRow label="Code" size="15px" weight={500} lineHeight="1.2" sample={'git commit -m "init"'} style={{ fontFamily: 'var(--font-mono)' }} />
            </div>
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={containerStyle}>
            <SectionHeader title="间距系统" subtitle="Spacing" />
            <div style={{ display: 'grid', gap: '14px' }}>
              {[
                { name: 'spacing-1', value: '4px' },
                { name: 'spacing-2', value: '8px' },
                { name: 'spacing-3', value: '12px' },
                { name: 'spacing-4', value: '16px' },
                { name: 'spacing-6', value: '24px' },
                { name: 'spacing-8', value: '32px' },
                { name: 'spacing-12', value: '48px' },
                { name: 'spacing-25', value: '100px' },
              ].map(item => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: item.value, height: '12px', borderRadius: '4px', background: 'var(--primary)' }} />
                  <span style={chipStyle}>{item.name}: {item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={containerStyle}>
            <SectionHeader title="按钮规范" subtitle="Buttons" />
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <button
                style={{
                  background: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                  borderRadius: '4px',
                  padding: '10px 24px',
                  border: 'none',
                  fontWeight: 600,
                }}
              >
                Primary Button
              </button>
              <button
                style={{
                  background: 'var(--secondary)',
                  color: 'var(--foreground)',
                  borderRadius: '4px',
                  padding: '10px 24px',
                  border: '1px solid var(--border)',
                  fontWeight: 600,
                }}
              >
                Secondary Button
              </button>
              <button
                style={{
                  background: 'transparent',
                  color: 'var(--muted-foreground)',
                  borderRadius: '4px',
                  padding: '10px 24px',
                  border: '1px solid var(--border)',
                  fontWeight: 500,
                }}
              >
                Ghost Button
              </button>
            </div>
          </div>
        </section>

        <section style={{ ...sectionStyle, borderBottom: 'none' }}>
          <div style={containerStyle}>
            <SectionHeader title="组件示例" subtitle="Components" />
            <div style={{ display: 'grid', gap: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              <div style={{
                background: 'var(--card)',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                padding: '20px',
              }}>
                <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>卡片 Card</div>
                <div style={{ fontSize: '14px', color: 'var(--muted-foreground)', marginBottom: '14px' }}>
                  用于承载内容块与信息分组。
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span style={{ padding: '6px 10px', background: 'var(--muted)', borderRadius: '6px', fontSize: '12px' }}>Tag</span>
                  <span style={{ padding: '6px 10px', background: 'var(--muted)', borderRadius: '6px', fontSize: '12px' }}>Status</span>
                </div>
              </div>

              <div style={{
                background: 'var(--card)',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                padding: '20px',
              }}>
                <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>输入框 Input</div>
                <input
                  style={{
                    width: '100%',
                    background: 'var(--muted)',
                    border: '1px solid var(--border)',
                    color: 'var(--foreground)',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    marginBottom: '12px',
                  }}
                  placeholder="输入内容..."
                />
                <div style={{ fontSize: '12px', color: 'var(--subtle)' }}>辅助文本说明</div>
              </div>

              <div style={{
                background: 'var(--popover)',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                padding: '20px',
              }}>
                <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>代码块 Code</div>
                <div style={{
                  background: 'var(--background)',
                  borderRadius: '10px',
                  padding: '12px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  color: 'var(--muted-foreground)',
                }}>
                  npx create-axhub-app
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer style={{ borderTop: '1px solid var(--border-subtle)', padding: '32px 0' }}>
          <div style={containerStyle}>
            <div style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>
              TRAE Design System v1.0 · Built with Design Tokens
            </div>
          </div>
        </footer>
      </main>
    </ConfigProvider>
  );
};

export default Component;
