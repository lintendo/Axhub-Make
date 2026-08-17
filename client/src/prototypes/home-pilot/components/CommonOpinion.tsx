/**
 * 常用意见通用组件
 * - 点击触发按钮打开「选择常用意见」弹窗，点击常用意见即可回填到意见框
 * - 选择弹窗内可进入「常用意见」维护弹窗，支持新增、删除、拖拽排序
 * - 数据默认持久化到 localStorage，首次使用附带默认常用意见
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Edit3, FileText, GripVertical, Plus, Trash2, X } from 'lucide-react';

const DEFAULT_OPINIONS = [
  '同意。',
  '已阅，同意。',
  '请按程序办理。',
  '材料齐全，同意。',
  '退回修改。',
];

const STORAGE_KEY = 'home-pilot-common-opinions';

function loadList(key: string, defaults: string[]): string[] {
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : defaults;
  } catch {
    return defaults;
  }
}

function saveList(key: string, list: string[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // ignore storage errors
  }
}

function moveItem(list: string[], from: number, to: number): string[] {
  if (from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export interface CommonOpinionProps {
  /** 选中常用意见后的回调 */
  onSelect: (value: string) => void;
  /** 自定义触发器；未传入时使用默认「常用意见」按钮 */
  renderTrigger?: (open: () => void) => React.ReactNode;
  /** 自定义触发按钮的 className（仅在未使用 renderTrigger 时生效） */
  className?: string;
  /** 新增常用意见时的最大长度，默认 50 */
  maxLength?: number;
  /** localStorage key，默认 home-pilot-common-opinions */
  storageKey?: string;
  /** 首次无数据时的默认常用意见列表 */
  defaultOpinions?: string[];
}

export function CommonOpinion({
  onSelect,
  renderTrigger,
  className,
  maxLength = 50,
  storageKey = STORAGE_KEY,
  defaultOpinions = DEFAULT_OPINIONS,
}: CommonOpinionProps) {
  const [opinions, setOpinions] = useState<string[]>(() =>
    loadList(storageKey, defaultOpinions)
  );

  const [selectOpen, setSelectOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const [working, setWorking] = useState<string[]>(opinions);
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveList(storageKey, opinions);
  }, [opinions, storageKey]);

  useEffect(() => {
    if (isAdding) {
      addInputRef.current?.focus();
    }
  }, [isAdding]);

  const openSelect = () => {
    setSelected(null);
    setSelectOpen(true);
  };

  const closeSelect = () => setSelectOpen(false);

  const openManage = () => {
    setWorking(opinions);
    setIsAdding(false);
    setDraft('');
    setManageOpen(true);
  };

  const closeManage = () => setManageOpen(false);

  const handleSelect = (value: string) => {
    setSelected(value);
    onSelect(value);
  };

  const handleConfirmSelect = () => {
    closeSelect();
  };

  const handleAdd = () => {
    const text = draft.trim();
    if (!text) return;
    setWorking((prev) => [...prev, text]);
    setDraft('');
    setIsAdding(false);
  };

  const handleDelete = (index: number) => {
    setWorking((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveManage = () => {
    setOpinions(working);
    closeManage();
  };

  const handleDragStart = (index: number) => (e: React.DragEvent) => {
    setDragging(index);
    e.dataTransfer.effectAllowed = 'move';
    // required for Firefox
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragging !== null && dragging !== index) {
      setDragOver(index);
    }
  };

  const handleDrop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragging === null) return;
    setWorking((prev) => moveItem(prev, dragging, index));
    setDragging(null);
    setDragOver(null);
  };

  const handleDragEnd = () => {
    setDragging(null);
    setDragOver(null);
  };

  const modalRoot = useMemo(() => {
    if (typeof document === 'undefined') return null;
    return document.body;
  }, []);

  const renderMask = (children: React.ReactNode, onClose: () => void) => {
    if (!modalRoot) return null;
    return (
      <div className="ds-modal-mask" onClick={onClose}>
        <div
          className="ds-modal co-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          {children}
        </div>
      </div>
    );
  };

  return (
    <>
      {renderTrigger ? (
        renderTrigger(openSelect)
      ) : (
        <button
          type="button"
          className={className || 'mp-common-opinion'}
          onClick={openSelect}
        >
          <FileText size={14} />
          常用意见
        </button>
      )}

      {selectOpen &&
        renderMask(
          <>
            <div className="co-modal-header">
              <h3 className="co-modal-title">选择常用意见</h3>
              <div className="co-modal-extra">
                <button
                  type="button"
                  className="co-link"
                  onClick={() => {
                    closeSelect();
                    openManage();
                  }}
                >
                  <Edit3 size={14} />
                  编辑常用意见
                </button>
                <button
                  type="button"
                  className="co-modal-close"
                  onClick={closeSelect}
                  aria-label="关闭"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="co-modal-body">
              {opinions.length === 0 ? (
                <div className="co-empty">暂无常用意见</div>
              ) : (
                <div className="co-list">
                  {opinions.map((opinion, index) => (
                    <div
                      key={`${opinion}-${index}`}
                      className={`co-item${selected === opinion ? ' co-item--active' : ''}`}
                      onClick={() => handleSelect(opinion)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          handleSelect(opinion);
                        }
                      }}
                    >
                      {opinion}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="co-modal-footer">
              <div className="co-modal-actions">
                <button
                  type="button"
                  className="swb-btn swb-btn--default"
                  onClick={closeSelect}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="swb-btn swb-btn--primary"
                  onClick={handleConfirmSelect}
                >
                  确定
                </button>
              </div>
            </div>
          </>,
          closeSelect
        )}

      {manageOpen &&
        renderMask(
          <>
            <div className="co-modal-header">
              <h3 className="co-modal-title">常用意见</h3>
              <button
                type="button"
                className="co-modal-close"
                onClick={closeManage}
                aria-label="关闭"
              >
                <X size={18} />
              </button>
            </div>
            <div className="co-modal-body">
              {working.length === 0 && !isAdding ? (
                <div className="co-empty">暂无常用意见</div>
              ) : (
                <div className="co-manage-list">
                  {working.map((opinion, index) => (
                    <div
                      key={`${opinion}-${index}`}
                      className={`co-manage-item${
                        dragging === index ? ' co-manage-item--dragging' : ''
                      }${dragOver === index ? ' co-manage-item--over' : ''}`}
                      draggable
                      onDragStart={handleDragStart(index)}
                      onDragOver={handleDragOver(index)}
                      onDrop={handleDrop(index)}
                      onDragEnd={handleDragEnd}
                    >
                      <span className="co-drag-handle" aria-label="拖动排序">
                        <GripVertical size={16} />
                      </span>
                      <span className="co-manage-text">{opinion}</span>
                      <button
                        type="button"
                        className="co-delete-btn"
                        onClick={() => handleDelete(index)}
                        aria-label="删除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {isAdding ? (
                <div className="co-add-row">
                  <input
                    ref={addInputRef}
                    type="text"
                    className="co-add-input"
                    placeholder={`请输入常用意见（最多${maxLength}字）`}
                    maxLength={maxLength}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAdd();
                      }
                      if (e.key === 'Escape') {
                        setIsAdding(false);
                        setDraft('');
                      }
                    }}
                  />
                  <span className="co-add-count">
                    {draft.length}/{maxLength}
                  </span>
                  <button
                    type="button"
                    className="co-add-confirm"
                    onClick={handleAdd}
                    disabled={!draft.trim()}
                  >
                    确认
                  </button>
                  <button
                    type="button"
                    className="co-add-cancel"
                    onClick={() => {
                      setIsAdding(false);
                      setDraft('');
                    }}
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="co-add-btn"
                  onClick={() => setIsAdding(true)}
                >
                  <Plus size={16} />
                  添加常用意见
                </button>
              )}
            </div>
            <div className="co-modal-footer">
              <div className="co-modal-actions">
                <button
                  type="button"
                  className="swb-btn swb-btn--default"
                  onClick={closeManage}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="swb-btn swb-btn--primary"
                  onClick={handleSaveManage}
                >
                  确定
                </button>
              </div>
            </div>
          </>,
          closeManage
        )}
    </>
  );
}
