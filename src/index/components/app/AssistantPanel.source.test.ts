import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AssistantPanel source', () => {
  it('is imported statically by the desktop layout so opening the real ACP sidebar cannot re-run the versioned admin entry', () => {
    const desktopSource = readFileSync(resolve(__dirname, './IndexPageDesktop.tsx'), 'utf8');

    expect(desktopSource).toContain("import AssistantPanel from './AssistantPanel';");
    expect(desktopSource).not.toContain('React.lazy(() => import(\'./AssistantPanel\'))');
    expect(desktopSource).not.toContain('<React.Suspense');
  });

  it('uses ACP UI as the embedded assistant iframe title', () => {
    const source = readFileSync(resolve(__dirname, './AssistantPanel.tsx'), 'utf8');

    expect(source).toContain('title="ACP UI"');
    expect(source).not.toContain('title="Axhub Genie"');
  });

  it('allows the embedded ACP UI to request clipboard write permission', () => {
    const source = readFileSync(resolve(__dirname, './AssistantPanel.tsx'), 'utf8');

    expect(source).toContain('allow="clipboard-write"');
    expect(source).not.toContain('sandbox=');
  });

  it('keeps bounded assistant iframe entries mounted and only displays the active entry', () => {
    const source = readFileSync(resolve(__dirname, './AssistantPanel.tsx'), 'utf8');
    const desktopSource = readFileSync(resolve(__dirname, './IndexPageDesktop.tsx'), 'utf8');

    expect(source).toContain('iframeEntries: AssistantIframeRenderEntry[];');
    expect(source).toContain('activeIframeKey: string | null;');
    expect(source).toContain('iframeEntries.map((entry) => (');
    expect(source).toContain('key={entry.key}');
    expect(source).toContain('src={entry.src}');
    expect(source).toContain('onIframeRef(entry.key, iframe)');
    expect(source).toContain('onIframeLoad(entry.key)');
    expect(source).toContain("display: entry.key === activeIframeKey ? 'block' : 'none'");
    expect(desktopSource).toContain('iframeEntries={assistantPanel.iframeEntries}');
    expect(desktopSource).toContain('activeIframeKey={assistantPanel.activeIframeKey}');
    expect(desktopSource).not.toContain('iframeSrc={assistantPanel.iframeSrc}');
  });

  it('shows a full-panel assistant context drop overlay only for assistant-context drags', () => {
    const source = readFileSync(resolve(__dirname, './AssistantPanel.tsx'), 'utf8');
    const dropOverlaySource = source.slice(
      source.indexOf('{assistantContextDragging ? ('),
      source.indexOf('</div>', source.indexOf('拖放到这里添加为 AI 上下文')),
    );

    expect(source).toContain("import { ASSISTANT_CONTEXT_DRAG_MIME, parseAssistantContextDragPayload } from '../../domains/assistant/assistantContextDrag';");
    expect(source).toContain('onAddContextItems: (items: AcpContextItem[]) => boolean | Promise<boolean>;');
    expect(source).toContain('const [assistantContextDragging, setAssistantContextDragging] = React.useState(false);');
    expect(source).toContain('hasAssistantContextDragType(event.dataTransfer)');
    expect(source).toContain('onDragEnter={handleAssistantContextDragEnter}');
    expect(source).toContain('onDragOver={handleAssistantContextDragOver}');
    expect(source).toContain('onDragLeave={handleAssistantContextDragLeave}');
    expect(source).toContain('onDrop={handleAssistantContextDrop}');
    expect(source).toContain('parseAssistantContextDragPayload(event.dataTransfer.getData(ASSISTANT_CONTEXT_DRAG_MIME))');
    expect(source).toContain('onAddContextItems(payload.items)');
    expect(source).toContain('拖放到这里添加为 AI 上下文');
    expect(dropOverlaySource).toContain("pointerEvents: 'auto'");
    expect(dropOverlaySource).not.toContain("pointerEvents: 'none'");
  });

  it('uses the page-level assistant toggle for the hover close affordance', () => {
    const panelSource = readFileSync(resolve(__dirname, './AssistantPanel.tsx'), 'utf8');
    const desktopSource = readFileSync(resolve(__dirname, './IndexPageDesktop.tsx'), 'utf8');
    const indexPageSource = readFileSync(resolve(__dirname, '../../app/IndexPage.tsx'), 'utf8');
    const assistantPanelPropsSource = indexPageSource.slice(
      indexPageSource.indexOf('const assistantPanelProps = {'),
      indexPageSource.indexOf('const dialogsProps = {', indexPageSource.indexOf('const assistantPanelProps = {')),
    );

    expect(panelSource).toContain('onToggle: () => void;');
    expect(panelSource).toContain('onClick={onToggle}');
    expect(panelSource).toContain('aria-label="关闭 AI 助手"');
    expect(panelSource).toContain('title="关闭 AI 助手"');
    expect(panelSource).toContain('opacity: 0');
    expect(panelSource).toContain('transform: translate(-50%, -2px);');
    expect(panelSource).toContain('transform: translate(-50%, 0);');
    expect(panelSource).toContain('left: 0,');
    expect(panelSource).toContain('top: 96,');
    expect(panelSource).toContain("groupHoverStyleTag");
    expect(desktopSource).toContain('onToggle: () => void;');
    expect(desktopSource).toContain('onToggle={assistantPanel.onToggle}');
    expect(assistantPanelPropsSource).toContain('onToggle: handleToggleAssistantPanel,');
    expect(assistantPanelPropsSource).not.toContain('hideAssistantPanelTemporarily');
    expect(assistantPanelPropsSource).not.toContain('handleCloseAiPanel');
  });
});
