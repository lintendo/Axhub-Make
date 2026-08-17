export const MAX_PROMPT_TEXT_BYTES = 1024 * 1024;
export const PROMPT_TEXT_LIMIT_MESSAGE = '批注文本超过 1 MB，请拆分后再试。';

export function getPromptTextByteLength(value: string): number {
  const source = String(value ?? '');
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(source).byteLength;
  }
  return new Blob([source]).size;
}

export function isPromptTextChangeAllowed(previous: string, next: string): boolean {
  const nextBytes = getPromptTextByteLength(next);
  if (nextBytes <= MAX_PROMPT_TEXT_BYTES) return true;

  return nextBytes < getPromptTextByteLength(previous);
}
