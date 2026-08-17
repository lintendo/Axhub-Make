/**
 * 董办负责人审批页
 */
import React, { useState } from 'react';
import { ArrowLeft, Check, X } from 'lucide-react';
import { getSignTask } from '../../sign-mock';
import { SuccessTip } from '../../components/SuccessTip';
import { TaskDetailTabs } from './components/TaskDetailTabs';
import { SubmitSidebar } from './components/SubmitSidebar';

export interface SignApproveOfficePageProps {
  taskId: string;
  onBack: () => void;
}

export function SignApproveOfficePage({ taskId, onBack }: SignApproveOfficePageProps) {
  const task = getSignTask(taskId);
  const [result, setResult] = useState<'同意' | '驳回'>('同意');
  const [comment, setComment] = useState('');
  const [nextNode, setNextNode] = useState<'secretary' | 'handler'>('handler');
  const [reminder, setReminder] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  if (!task) {
    return (
      <div className="ds-card">
        <p>未找到任务</p>
        <button type="button" className="ds-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          返回
        </button>
      </div>
    );
  }

  const toggleReminder = (value: string) => {
    setReminder((prev) => {
      const set = new Set(prev);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return Array.from(set);
    });
  };

  const handleSubmit = () => {
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2000);
  };

  return (
    <>
      <SuccessTip
        visible={submitted}
        type={result === '驳回' ? 'error' : 'success'}
        icon={result === '同意' ? <Check size={18} /> : <X size={18} />}
        message={result === '同意' ? '审批通过' : '已驳回'}
      />
      <div className="ds-page-header">
        <button type="button" className="ds-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          返回
        </button>
        <h1 className="ds-page-title">董办负责人审批</h1>
      </div>

      <div className="ds-form-layout">
        <div className="ds-form-main">
          <TaskDetailTabs task={task} />
        </div>

        <SubmitSidebar
          opinion={comment}
          onOpinionChange={setComment}
          result={result}
          onResultChange={setResult}
          reminder={reminder}
          onToggleReminder={toggleReminder}
          onSubmit={handleSubmit}
          onCancel={onBack}
          submitText="提交"
          cancelText="返回"
        >
          {result === '同意' && (
            <div className="mp-submit-flow-section">
              <div className="mp-submit-flow-label mp-submit-flow-label--required">下一流转节点：</div>
              <div className="mp-radio-card-group">
                <label className="mp-radio-card">
                  <input
                    type="radio"
                    name="nextNode"
                    value="handler"
                    checked={nextNode === 'handler'}
                    onChange={() => setNextNode('handler')}
                  />
                  <span>董办经办人</span>
                </label>
                <label className="mp-radio-card">
                  <input
                    type="radio"
                    name="nextNode"
                    value="secretary"
                    checked={nextNode === 'secretary'}
                    onChange={() => setNextNode('secretary')}
                  />
                  <span>董秘</span>
                </label>
              </div>
              {nextNode === 'secretary' && (
                <div style={{ marginTop: 8, fontSize: 13, color: '#909399' }}>
                  系统将按发起人所在部室自动匹配负责该部室的董秘
                </div>
              )}
            </div>
          )}
        </SubmitSidebar>
      </div>
    </>
  );
}
