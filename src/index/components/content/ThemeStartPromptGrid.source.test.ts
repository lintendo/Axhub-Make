import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readGridSource() {
  return readFileSync(resolve(__dirname, './ThemeStartPromptGrid.tsx'), 'utf8');
}

function readContentSource() {
  return readFileSync(resolve(__dirname, './ContentAreaView.tsx'), 'utf8');
}

function readResourceGridSource() {
  return readFileSync(resolve(__dirname, './ResourceStartPromptGrid.tsx'), 'utf8');
}

function readStartPromptCardSource() {
  return readFileSync(resolve(__dirname, './StartPromptCard.tsx'), 'utf8');
}

function readThemeCardsSource() {
  const source = readContentSource();
  const start = source.indexOf('const THEME_START_PROMPT_CARDS');
  const end = source.indexOf('] as const satisfies readonly ThemeStartPromptCard[];', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('theme start prompt grid source', () => {
  it('keeps the theme source cards compact and accessible', () => {
    const source = readGridSource();
    const contentSource = readContentSource();
    const cardSource = readStartPromptCardSource();

    expect(contentSource).toContain('生成设计规范');
    expect(contentSource).toContain('从 Refero 导入');
    expect(contentSource).toContain('网页链接采集');
    expect(contentSource).toContain('从 Axure 资源采集');
    expect(contentSource).toContain('从原型生成');
    expect(contentSource).toContain('Figma 导入');
    expect(contentSource).toContain('截图导入');
    expect(contentSource).toContain('styles.refero.design');
    expect(cardSource).toContain('aria-label={title}');
    expect(cardSource).toContain('aria-label="快速执行"');
    expect(cardSource).toContain('<TooltipContent side="top">快速执行</TooltipContent>');
    expect(source).toContain('StartPromptCard');
    expect(source).toContain('onCopyPrompt');
    expect(cardSource).toContain('disabled={selectionDisabled}');
    expect(cardSource).toContain('group-hover:opacity-100');
    expect(cardSource).toContain('focus-visible:opacity-100');
    expect(cardSource).not.toContain('group-focus-within:');
    expect(cardSource).not.toContain('shadow-');
  });

  it('uses realistic user prompts instead of exposing the internal theme workflow', () => {
    const cardsSource = readThemeCardsSource();

    expect(cardsSource).toContain('漫屿');
    expect(cardsSource).toContain('精品旅行住宿预订产品');
    expect(cardsSource).toContain('奶油白');
    expect(cardsSource).toContain('陶土橙');
    expect(cardsSource).not.toContain('AGENTS.md');
    expect(cardsSource).not.toContain('rules/');
    expect(cardsSource).not.toContain('DESIGN.md');
    expect(cardsSource).not.toContain('theme.json');
    expect(cardsSource).not.toContain('assets/tokens.json');
    expect(cardsSource).not.toContain('style.css');
    expect(cardsSource).not.toContain('tw.css');
    expect(cardsSource).not.toContain('index.tsx');
  });

  it('distinguishes Axure source processing from multi-prototype design extraction', () => {
    const cardsSource = readThemeCardsSource();

    expect(cardsSource).toContain('Axure 原型资源（在线链接或本地导出的 HTML）');
    expect(cardsSource).toContain('真实页面结构、交互、组件状态和视觉样式');
    expect(cardsSource).toContain('一个或多个项目内原型');
    expect(cardsSource).toContain('反推一套统一的设计规范');
    expect(cardsSource).not.toContain('从 Axhub 资源采集');
  });

  it('matches the resource grid dimensions and separates cards from the composer', () => {
    const themeSource = readGridSource();
    const resourceSource = readResourceGridSource();
    const cardSource = readStartPromptCardSource();
    const cardClassName = 'flex min-h-16 w-full items-center gap-3 rounded-[10px] border border-slate-200/80 bg-white/80 px-4 py-3 pr-10 text-left text-[13px] font-medium text-slate-700';

    expect(themeSource).toContain("ariaLabel = '主题来源'");
    expect(themeSource).toContain('<StartPromptGrid ariaLabel={ariaLabel}>');
    expect(resourceSource).toContain('<StartPromptGrid ariaLabel="资源生成能力">');
    expect(themeSource).not.toContain('sm:grid-cols-2');
    expect(resourceSource).not.toContain('lg:grid-cols-4');
    expect(cardSource).toContain(cardClassName);
    expect(cardSource).toContain('whitespace-nowrap leading-5');
    expect(themeSource).toContain('StartPromptCard');
    expect(resourceSource).toContain('StartPromptCard');
    expect(themeSource).not.toContain('lg:grid-cols-3');
  });
});
