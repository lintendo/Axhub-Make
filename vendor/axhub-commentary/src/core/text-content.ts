import { isEditableTextFragmentElement } from './text-fragment';

export function normalizeEditableText(value: string): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/^\n+|\n+$/g, '');
}

export function normalizeEditableTextFragment(value: string): string {
  const raw = String(value ?? '');
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const leadingSpace = /^\s/.test(raw) ? ' ' : '';
  const trailingSpace = /\s$/.test(raw) ? ' ' : '';
  return `${leadingSpace}${normalized}${trailingSpace}`;
}

function normalizeTextNodeValue(value: unknown): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/[^\S\n]+/g, ' ');
}

export function readEditableText(element: Element): string {
  if (isEditableTextFragmentElement(element)) {
    return normalizeEditableTextFragment(element.textContent ?? '');
  }

  const childNodes = Array.from(element.childNodes ?? []);
  if (childNodes.length === 0) {
    return normalizeEditableText(element.textContent ?? '');
  }

  const value = childNodes
    .map((node) => {
      if (node.nodeType === 3) return normalizeTextNodeValue(node.textContent);
      if (node.nodeType === 1 && (node as Element).tagName === 'BR') return '\n';
      return '';
    })
    .join('');
  return normalizeEditableText(value);
}

export function writeEditableText(element: Element, value: string): void {
  if (isEditableTextFragmentElement(element)) {
    element.textContent = normalizeEditableTextFragment(value);
    return;
  }

  const normalized = normalizeEditableText(value);
  if (!normalized.includes('\n')) {
    element.textContent = normalized;
    return;
  }

  const nodes: Node[] = [];
  normalized.split('\n').forEach((line, index) => {
    if (index > 0) nodes.push(element.ownerDocument.createElement('br'));
    if (line) nodes.push(element.ownerDocument.createTextNode(line));
  });
  element.replaceChildren(...nodes);
}
