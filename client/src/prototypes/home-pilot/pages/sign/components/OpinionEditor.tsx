/**
 * 审批意见编辑区
 */
import React from 'react';
import { CommonOpinion } from '../../../components/CommonOpinion';

export interface OpinionEditorProps {
  value: string;
  onChange: (value: string) => void;
  showCommon?: boolean;
  maxLength?: number;
}

export function OpinionEditor({ value, onChange, showCommon = true, maxLength = 500 }: OpinionEditorProps) {
  return (
    <div className="ds-card">
      <h3 className="ds-section-title">填写意见</h3>
      <div className="ds-form-field ds-form-field--full">
        <label className="ds-form-label">审批意见：</label>
        <div className="ds-form-control">
          <textarea
            className="ds-textarea"
            rows={4}
            placeholder="请输入审批意见"
            value={value}
            onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
          />
          <div style={{ textAlign: 'right', fontSize: 12, color: '#909399', marginTop: 4 }}>
            {value.length}/{maxLength}
          </div>
        </div>
      </div>

      {showCommon && (
        <div className="ds-form-field ds-form-field--full">
          <label className="ds-form-label">常用意见：</label>
          <div className="ds-form-control">
            <CommonOpinion
              onSelect={onChange}
              renderTrigger={(open) => (
                <button type="button" className="ds-action-link" onClick={open}>
                  选择常用意见
                </button>
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}
