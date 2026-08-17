/**
 * 发起页通用右侧提交边栏
 * 包含：填写意见、提交流程（部室负责人 / 提醒方式 / 提交 / 保存）
 */
import React from 'react';
import { CommonOpinion } from '../../components/CommonOpinion';
import { SuccessTip } from '../../components/SuccessTip';

const REMINDERS = ['手机', '邮件'];

export interface LeaderOption {
  id: string;
  name: string;
  dept?: string;
}

export interface SubmitSidebarProps {
  opinion: string;
  onOpinionChange: (value: string) => void;
  leader: string;
  onLeaderChange: (value: string) => void;
  leaderOptions?: LeaderOption[];
  reminders: string[];
  onReminderChange: (value: string[]) => void;
  onSubmit: () => void;
  onSave: () => void;
  submitLabel?: string;
  saveLabel?: string;
  submitStatus?: 'idle' | 'success';
  saveStatus?: 'idle' | 'success';
}

export function SubmitSidebar({
  opinion,
  onOpinionChange,
  leader,
  onLeaderChange,
  leaderOptions = [],
  reminders,
  onReminderChange,
  onSubmit,
  onSave,
  submitLabel = '提交',
  saveLabel = '保存',
  submitStatus = 'idle',
  saveStatus = 'idle',
}: SubmitSidebarProps) {
  const toggleReminder = (value: string) => {
    const set = new Set(reminders);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    onReminderChange(Array.from(set));
  };

  return (
    <div className="mp-archive-sidebar">
      <div className="swb-card mp-submit-sidebar-card">
        <div className="mp-submit-sidebar-header">
          <span className="mp-submit-sidebar-step">1</span>
          <span className="mp-submit-sidebar-title">填写意见</span>
        </div>
        <textarea
          className="mp-form-textarea mp-submit-opinion"
          rows={4}
          placeholder="请输入意见"
          value={opinion}
          onChange={(e) => onOpinionChange(e.target.value)}
        />
        <CommonOpinion onSelect={onOpinionChange} />
      </div>

      <div className="swb-card mp-submit-sidebar-card">
        <div className="mp-submit-sidebar-header">
          <span className="mp-submit-sidebar-step">2</span>
          <span className="mp-submit-sidebar-title">提交流程</span>
        </div>

        <div className="mp-submit-flow-section">
          <div className="mp-submit-flow-label mp-submit-flow-label--required">部室负责人：</div>
          <div className="mp-checkbox-group mp-submit-leader-group">
            {leaderOptions.length === 0 && <span className="mp-submit-leader-empty">请选择</span>}
            {leaderOptions.map((item) => (
              <label key={item.id} className="mp-checkbox mp-submit-leader">
                <input
                  type="radio"
                  name="leader"
                  value={item.id}
                  checked={leader === item.id}
                  onChange={() => onLeaderChange(item.id)}
                />
                <span>{item.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mp-submit-flow-section">
          <div className="mp-submit-flow-label">提醒方式：</div>
          <div className="mp-checkbox-group mp-submit-reminder-group">
            {REMINDERS.map((item) => (
              <label key={item} className="mp-checkbox mp-submit-reminder">
                <input
                  type="checkbox"
                  checked={reminders.includes(item)}
                  onChange={() => toggleReminder(item)}
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mp-sidebar-actions mp-submit-sidebar-actions">
          <button
            type="button"
            className="swb-btn swb-btn--primary mp-sidebar-btn"
            onClick={onSubmit}
          >
            {submitLabel}
          </button>
          <button
            type="button"
            className="swb-btn swb-btn--default mp-sidebar-btn"
            onClick={onSave}
          >
            {saveLabel}
          </button>
        </div>

        <SuccessTip
          visible={submitStatus === 'success'}
          message={submitLabel === '发布' ? '发布成功' : '提交成功'}
          data-testid="submit-tip"
        />
        <SuccessTip visible={saveStatus === 'success'} message="保存成功" data-testid="save-tip" />
      </div>
    </div>
  );
}
