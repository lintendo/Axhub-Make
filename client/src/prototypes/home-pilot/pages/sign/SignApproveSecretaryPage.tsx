/**
 * 董秘审批页
 */
import React, { useState } from 'react';
import { ArrowLeft, Check, X } from 'lucide-react';
import { getSignTask } from '../../sign-mock';
import { SuccessTip } from '../../components/SuccessTip';
import { TaskDetailTabs } from './components/TaskDetailTabs';
import { SubmitSidebar } from './components/SubmitSidebar';

export interface SignApproveSecretaryPageProps {
  taskId: string;
  onBack: () => void;
}

export function SignApproveSecretaryPage({ taskId, onBack }: SignApproveSecretaryPageProps) {
  const task = getSignTask(taskId);
  const [result, setResult] = useState<'同意' | '驳回'>('同意');
  const [comment, setComment] = useState('');
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
        <h1 className="ds-page-title">董秘审批</h1>
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
          <div style={{ fontSize: 13, color: '#909399', lineHeight: 1.6 }}>
            当前为抢办模式，一人办理后其他董秘待办自动消失。
          </div>
        </SubmitSidebar>
      </div>
    </>
  );
}
