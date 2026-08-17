/**
 * 审批/办理页通用右侧提交边栏
 * 包含：填写意见、提交流程（提醒方式 / 提交 / 返回）
 */
import React from 'react';
import { Check } from 'lucide-react';
import { CommonOpinion } from '../../../components/CommonOpinion';

export interface SubmitSidebarProps {
  children?: React.ReactNode;
  opinion?: string;
  onOpinionChange?: (value: string) => void;
  result?: '同意' | '驳回';
  onResultChange?: (value: '同意' | '驳回') => void;
  reminder: string[];
  onToggleReminder: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  submitText?: string;
  cancelText?: string;
}

const REMINDER_TYPES = ['手机', '邮件'];

export function SubmitSidebar({
  children,
  opinion = '',
  onOpinionChange,
  result,
  onResultChange,
  reminder,
  onToggleReminder,
  onSubmit,
  onCancel,
  submitText = '提交',
  cancelText = '返回',
}: SubmitSidebarProps) {
  return (
    <div className="ds-form-sidebar">
      <div className="swb-card mp-submit-sidebar-card">
        <div className="mp-submit-sidebar-header">
          <span className="mp-submit-sidebar-step">1</span>
          <span className="mp-submit-sidebar-title">填写意见</span>
        </div>
        {onResultChange && (
          <div className="mp-submit-flow-section" style={{ marginTop: 0 }}>
            <div className="mp-submit-flow-label mp-submit-flow-label--required">审批结果：</div>
            <div className="ds-radio-group ds-radio-group--segmented">
              <label className="ds-radio">
                <input
                  type="radio"
                  name="approveResult"
                  value="同意"
                  checked={result === '同意'}
                  onChange={() => onResultChange('同意')}
                />
                <span>同意</span>
              </label>
              <label className="ds-radio">
                <input
                  type="radio"
                  name="approveResult"
                  value="驳回"
                  checked={result === '驳回'}
                  onChange={() => onResultChange('驳回')}
                />
                <span>驳回</span>
              </label>
            </div>
          </div>
        )}

        <textarea
          className="mp-form-textarea mp-submit-opinion"
          rows={4}
          placeholder="请输入意见"
          value={opinion}
          onChange={(e) => onOpinionChange?.(e.target.value.slice(0, 500))}
        />
        <CommonOpinion onSelect={(value) => onOpinionChange?.(value)} />
      </div>

      <div className="swb-card mp-submit-sidebar-card">
        <div className="mp-submit-sidebar-header">
          <span className="mp-submit-sidebar-step">2</span>
          <span className="mp-submit-sidebar-title">提交流程</span>
        </div>

        {children}

        <div className="mp-submit-flow-section">
          <div className="mp-submit-flow-label">提醒方式：</div>
          <div className="mp-checkbox-group mp-submit-reminder-group">
            {REMINDER_TYPES.map((type) => (
              <label key={type} className="mp-checkbox mp-submit-reminder">
                <input
                  type="checkbox"
                  value={type}
                  checked={reminder.includes(type)}
                  onChange={() => onToggleReminder(type)}
                />
                <span>{type}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mp-sidebar-actions mp-submit-sidebar-actions">
          {onCancel && (
            <button type="button" className="swb-btn swb-btn--default mp-sidebar-btn" onClick={onCancel}>
              {cancelText}
            </button>
          )}
          <button type="button" className="swb-btn swb-btn--primary mp-sidebar-btn" onClick={onSubmit}>
            <Check size={14} style={{ marginRight: 6 }} />
            {submitText}
          </button>
        </div>
      </div>
    </div>
  );
}
