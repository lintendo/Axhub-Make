export function resolvePromptCardCloseActionTitle(platform?: string): string {
  const shortcut = platform?.includes('Mac') ? '⌘ Enter' : 'Ctrl + Enter';
  return `关闭并保存（${shortcut} / Esc）`;
}
