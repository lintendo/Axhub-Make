function resolveSelectionRange(element: HTMLElement): {
  ownerDocument: Document;
  selection: Selection;
  range: Range;
} | null {
  const ownerDocument = element.ownerDocument;
  const selection = ownerDocument.getSelection?.();
  if (!selection || selection.rangeCount < 1) return null;

  const range = selection.getRangeAt(0);
  if (!element.contains(range.commonAncestorContainer)) return null;
  return { ownerDocument, selection, range };
}

function insertNodesAtSelection(
  ownerDocument: Document,
  selection: Selection,
  range: Range,
  nodes: Node[],
): boolean {
  if (nodes.length === 0) return false;
  try {
    range.deleteContents();
    if (nodes.length === 1) {
      range.insertNode(nodes[0]);
    } else {
      const fragment = ownerDocument.createDocumentFragment();
      nodes.forEach((node) => fragment.appendChild(node));
      range.insertNode(fragment);
    }
    range.setStartAfter(nodes[nodes.length - 1]);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  } catch {
    return false;
  }
}

export function insertPlainTextAtSelection(element: HTMLElement, text: string): boolean {
  const resolved = resolveSelectionRange(element);
  if (!resolved) return false;
  const { ownerDocument, selection, range } = resolved;
  const normalizedText = String(text ?? '').replace(/\r\n?/g, '\n');

  if (!normalizedText.includes('\n')) {
    try {
      if (ownerDocument.execCommand?.('insertText', false, normalizedText)) {
        return true;
      }
    } catch {
      // Fall back to direct range insertion when insertText is unavailable.
    }
  }

  const nodes: Node[] = [];
  normalizedText.split('\n').forEach((line, index) => {
    if (index > 0) nodes.push(ownerDocument.createElement('br'));
    if (line) nodes.push(ownerDocument.createTextNode(line));
  });
  return insertNodesAtSelection(ownerDocument, selection, range, nodes);
}

export function insertLineBreakAtSelection(element: HTMLElement): boolean {
  const resolved = resolveSelectionRange(element);
  if (!resolved) return false;
  const { ownerDocument, selection, range } = resolved;
  return insertNodesAtSelection(ownerDocument, selection, range, [
    ownerDocument.createElement('br'),
  ]);
}
