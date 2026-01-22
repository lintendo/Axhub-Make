/**
 * MarkdownViewer - 轻量级 Markdown 渲染组件
 *
 * 零依赖，支持基础 Markdown 语法：
 * - 标题 (h1-h3)
 * - 列表 (有序/无序)
 * - 引用
 * - 行内代码
 * - 加粗
 */

import React from 'react';

export interface MarkdownViewerProps {
  content: string;
  className?: string;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ content, className }) => {
  // 解析行内样式
  const parseInlineStyles = (text: string): React.ReactNode => {
    // 处理行内代码 `code`
    const parts = text.split(/(`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={i}
            style={{
              backgroundColor: 'var(--theme-bg-tertiary, rgba(0, 0, 0, 0.04))',
              padding: '2px 6px',
              borderRadius: '3px',
              fontSize: '0.9em',
              fontFamily: 'Monaco, Consolas, monospace',
              color: 'var(--theme-text-primary, #1a1a1a)',
            }}
          >
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
    // H3
    if (line.startsWith('### ')) {
      return (
        <h3 key={index} style={{ fontSize: '18px', fontWeight: 600, marginTop: '24px', marginBottom: '12px', color: 'var(--theme-text-primary, #1a1a1a)' }}>
          {parseInlineStyles(line.slice(4))}
        </h3>
      );
    }
    // H2
    if (line.startsWith('## ')) {
      return (
        <h2 key={index} style={{ fontSize: '22px', fontWeight: 600, marginTop: '32px', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid var(--theme-border-light, rgba(0,0,0,0.06))', color: 'var(--theme-text-primary, #1a1a1a)' }}>
          {parseInlineStyles(line.slice(3))}
        </h2>
      );
    }
    // H1
    if (line.startsWith('# ')) {
      return (
        <h1 key={index} style={{ fontSize: '28px', fontWeight: 600, marginBottom: '20px', color: 'var(--theme-text-primary, #1a1a1a)' }}>
          {parseInlineStyles(line.slice(2))}
        </h1>
      );
    }
    // 无序列表
    if (line.startsWith('- ')) {
      return (
        <li key={index} style={{ marginLeft: '20px', marginBottom: '8px', listStyle: 'disc', color: 'var(--theme-text-secondary, rgba(0,0,0,0.65))' }}>
          {parseInlineStyles(line.slice(2))}
        </li>
      );
    }
    // 有序列表
    if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^\d+\.\s(.*)$/);
      if (match) {
        return (
          <li key={index} style={{ marginLeft: '20px', marginBottom: '8px', listStyle: 'decimal', color: 'var(--theme-text-secondary, rgba(0,0,0,0.65))' }}>
            {parseInlineStyles(match[1])}
          </li>
        );
      }
    }
    // 引用
    if (line.startsWith('> ')) {
      return (
        <blockquote key={index} style={{ marginLeft: 0, paddingLeft: '16px', borderLeft: '3px solid var(--theme-border, rgba(0,0,0,0.1))', color: 'var(--theme-text-tertiary, rgba(0,0,0,0.55))', fontStyle: 'italic', margin: '16px 0' }}>
          {parseInlineStyles(line.slice(2))}
        </blockquote>
      );
    }
    // 分隔线
    if (line.trim() === '---') {
      return <hr key={index} style={{ border: 'none', borderTop: '1px solid var(--theme-border-light, rgba(0,0,0,0.06))', margin: '24px 0' }} />;
    }
    // 空行
    if (line.trim() === '') {
      return <div key={index} style={{ height: '12px' }} />;
    }
    // 普通段落
    return (
      <p key={index} style={{ color: 'var(--theme-text-secondary, rgba(0,0,0,0.65))', lineHeight: 1.7, marginBottom: '12px' }}>
        {parseInlineStyles(line)}
      </p>
    );
  };

  const lines = content.split('\n');

  return (
    <div className={className} style={{ fontFamily: 'inherit' }}>
      {lines.map((line, i) => parseLine(line, i))}
    </div>
  );
};

export default MarkdownViewer;
