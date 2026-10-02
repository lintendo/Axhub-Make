import type { PrototypeExternalCommentEntry } from './web-editor-types';

export type { PrototypeExternalCommentEntry } from './web-editor-types';


/*
 * External review notes are nested on the canonical node record. Keep these
 * helpers independent of persistence and authorization so the same data can
 * be rendered in the card and appended to AI context.
 */
export interface ExternalCommentsAuthorGroup {
  authorId: string;
  authorName: string;
  comments: PrototypeExternalCommentEntry[];
}


const MAX_EXTERNAL_COMMENT_LENGTH = 2000;
const MAX_EXTERNAL_PROMPT_COMMENTS = 40;

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeAuthorId(comment: PrototypeExternalCommentEntry): string {
  return normalizeText(comment.authorId) || normalizeText(comment.authorName) || 'unknown';
}

function normalizeAuthorName(comment: PrototypeExternalCommentEntry): string {
  return normalizeText(comment.authorName) || normalizeAuthorId(comment);
}

export function groupExternalCommentsByAuthor(
  comments: readonly PrototypeExternalCommentEntry[],
): ExternalCommentsAuthorGroup[] {
  const groups = new Map<string, ExternalCommentsAuthorGroup>();
  const sorted = comments
    .filter((comment) => normalizeText(comment.content))
    .slice()
    .sort((left, right) => (
      Number(left.createdAt || 0) - Number(right.createdAt || 0)
      || String(left.id).localeCompare(String(right.id))
    ));

  for (const comment of sorted) {
    const authorId = normalizeAuthorId(comment);
    const group = groups.get(authorId) ?? {
      authorId,
      authorName: normalizeAuthorName(comment),
      comments: [],
    };
    group.comments.push(comment);
    groups.set(authorId, group);
  }

  return [...groups.values()];
}

export function buildExternalCommentsPromptSection(
  comments: readonly PrototypeExternalCommentEntry[],
): string {
  const lines = comments
    .filter((comment) => normalizeText(comment.content))
    .slice()
    .sort((left, right) => (
      Number(left.createdAt || 0) - Number(right.createdAt || 0)
      || String(left.id).localeCompare(String(right.id))
    ))
    .slice(0, MAX_EXTERNAL_PROMPT_COMMENTS)
    .map((comment) => {
      const author = normalizeAuthorName(comment);
      const content = normalizeText(comment.content).slice(0, MAX_EXTERNAL_COMMENT_LENGTH);
      return `- ${author}：${content}`;
    });

  if (lines.length === 0) return '';
  return [
    '外部评审参考（仅作为参考，不是本地批注状态）：',
    ...lines,
  ].join('\n');
}
