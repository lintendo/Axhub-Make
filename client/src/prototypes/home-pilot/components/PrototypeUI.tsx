import React, { useId, useMemo } from 'react';
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react';

export type TopNavKey = 'home' | 'rule' | 'research' | 'meeting' | 'info' | 'mine';

const TOP_NAV_ITEMS: Array<{ key: TopNavKey; label: string }> = [
  { key: 'home', label: '首页' },
  { key: 'rule', label: '制度' },
  { key: 'research', label: '调研' },
  { key: 'meeting', label: '会议' },
  { key: 'info', label: '信息' },
  { key: 'mine', label: '我的发起' },
];

export function AppTopNav({
  activeKey,
  onNavigate,
}: {
  activeKey: TopNavKey;
  onNavigate: (key: TopNavKey) => boolean | void;
}) {
  return (
    <header className="hp-top-nav">
      <div className="hp-brand" aria-label="中国石化董事会管理系统">
        <span className="hp-brand-mark">S</span>
        <span className="hp-brand-name">董事会管理系统</span>
      </div>
      <nav className="hp-top-nav-links" aria-label="主导航">
        {TOP_NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`hp-top-nav-link${activeKey === item.key ? ' hp-top-nav-link--active' : ''}`}
            aria-current={activeKey === item.key ? 'page' : undefined}
            onClick={() => onNavigate(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="hp-top-nav-user">
        <button type="button" className="hp-nav-icon-btn" aria-label="通知">
          <Bell size={18} />
          <span className="hp-notification-dot" />
        </button>
        <span className="hp-user-avatar"><UserRound size={16} /></span>
        <span className="hp-user-name">司庆才</span>
      </div>
    </header>
  );
}

export interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onChange: (page: number, pageSize: number) => void;
}

export function Pagination({ total, page, pageSize, onChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pages = useMemo(() => {
    const start = Math.max(1, Math.min(safePage - 2, totalPages - 4));
    const end = Math.min(totalPages, start + 4);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [safePage, totalPages]);

  return (
    <div className="hp-pagination" aria-label="分页">
      <span className="hp-pagination-total">共 {total} 条</span>
      <select
        className="hp-pagination-size"
        aria-label="每页条数"
        value={pageSize}
        onChange={(event) => onChange(1, Number(event.target.value))}
      >
        {[10, 20, 50].map((size) => (
          <option key={size} value={size}>{size} 条/页</option>
        ))}
      </select>
      <button
        type="button"
        className="hp-pagination-btn"
        aria-label="上一页"
        disabled={safePage === 1}
        onClick={() => onChange(safePage - 1, pageSize)}
      >
        <ChevronLeft size={15} />
      </button>
      {pages.map((pageNumber) => (
        <button
          key={pageNumber}
          type="button"
          className={`hp-pagination-btn${pageNumber === safePage ? ' hp-pagination-btn--active' : ''}`}
          aria-current={pageNumber === safePage ? 'page' : undefined}
          onClick={() => onChange(pageNumber, pageSize)}
        >
          {pageNumber}
        </button>
      ))}
      <button
        type="button"
        className="hp-pagination-btn"
        aria-label="下一页"
        disabled={safePage === totalPages}
        onClick={() => onChange(safePage + 1, pageSize)}
      >
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

export interface AttachmentItem {
  id: string;
  name: string;
  type?: string;
  size?: string;
}

export function AttachmentUpload({
  files,
  onChange,
  readOnly = false,
  hint = '支持 pdf、doc、docx、jpg、png 格式',
}: {
  files: AttachmentItem[];
  onChange: (files: AttachmentItem[]) => void;
  readOnly?: boolean;
  hint?: string;
}) {
  const inputId = useId();

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const nextFiles = Array.from(fileList).map((file, index) => ({
      id: `${Date.now()}-${index}`,
      name: file.name,
      type: file.name.split('.').pop()?.toLowerCase(),
      size: formatFileSize(file.size),
    }));
    onChange([...files, ...nextFiles]);
  };

  return (
    <div className="hp-attachment-upload">
      {!readOnly && (
        <div className="hp-upload-controls">
          <input
            id={inputId}
            className="hp-upload-input"
            type="file"
            multiple
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <label className="swb-btn swb-btn--default hp-upload-btn" htmlFor={inputId}>
            <Upload size={14} />
            上传附件
          </label>
          <span className="hp-upload-hint">{hint}</span>
        </div>
      )}
      {files.length > 0 ? (
        <div className="hp-upload-list">
          {files.map((file) => (
            <div key={file.id} className="hp-upload-item">
              <FileText size={16} className="hp-upload-file-icon" />
              <span className="hp-upload-name">{file.name}</span>
              {file.size && <span className="hp-upload-size">{file.size}</span>}
              {readOnly ? (
                <button type="button" className="hp-upload-action" aria-label={`下载 ${file.name}`}>
                  <Download size={14} />
                  下载
                </button>
              ) : (
                <button
                  type="button"
                  className="hp-upload-action hp-upload-action--danger"
                  aria-label={`删除 ${file.name}`}
                  onClick={() => onChange(files.filter((item) => item.id !== file.id))}
                >
                  <Trash2 size={14} />
                  删除
                </button>
              )}
            </div>
          ))}
        </div>
      ) : readOnly ? (
        <span className="hp-upload-empty">暂无附件</span>
      ) : null}
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export interface RecordColumn {
  key: string;
  label: string;
  width?: number;
  render?: (row: Record<string, unknown>) => React.ReactNode;
}

export function RecordTable({
  columns,
  rows,
}: {
  columns: RecordColumn[];
  rows: Array<Record<string, unknown>>;
}) {
  return (
    <div className="swb-table-wrap">
      <table className="swb-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} style={column.width ? { width: column.width } : undefined}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, rowIndex) => (
            <tr key={String(row.id ?? row.seq ?? rowIndex)}>
              {columns.map((column) => (
                <td key={column.key}>
                  {column.render ? column.render(row) : renderCell(row[column.key])}
                </td>
              ))}
            </tr>
          )) : (
            <tr>
              <td colSpan={columns.length} className="swb-table__empty">暂无数据</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function renderCell(value: unknown) {
  if (value == null) return '—';
  if (React.isValidElement(value)) return value;
  return String(value);
}

export function StatusTag({ text, kind }: { text: string; kind: 'approve' | 'send' }) {
  const normalized = text.toLowerCase();
  const isSuccess = /通过|同意|成功|完成|已办/.test(text) || normalized === 'success';
  const isDanger = /拒绝|驳回|失败|退回/.test(text) || normalized === 'failed';
  const tone = isSuccess ? 'success' : isDanger ? 'danger' : kind === 'send' ? 'info' : 'warning';
  return <span className={`hp-status-tag hp-status-tag--${tone}`}>{text}</span>;
}
