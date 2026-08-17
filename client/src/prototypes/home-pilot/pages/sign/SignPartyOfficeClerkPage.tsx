/**
 * 党组组织部文书办理页（职工董事流程第一步）
 */
import React, { useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { getSignTask } from '../../sign-mock';
import { SuccessTip } from '../../components/SuccessTip';
import { TaskDetailTabs } from './components/TaskDetailTabs';
import { SubmitSidebar } from './components/SubmitSidebar';

export interface SignPartyOfficeClerkPageProps {
  taskId: string;
  onBack: () => void;
}

export function SignPartyOfficeClerkPage({ taskId, onBack }: SignPartyOfficeClerkPageProps) {
  const task = getSignTask(taskId);
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
      <SuccessTip visible={submitted} icon={<Check size={18} />} message="办理成功" />
      <div className="ds-page-header">
        <button type="button" className="ds-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          返回
        </button>
        <h1 className="ds-page-title">党组组织部文书办理</h1>
      </div>

      <div className="ds-form-layout">
        <div className="ds-form-main">
          <TaskDetailTabs task={task} />
        </div>

        <SubmitSidebar
          opinion={comment}
          onOpinionChange={setComment}
          reminder={reminder}
          onToggleReminder={toggleReminder}
          onSubmit={handleSubmit}
          onCancel={onBack}
          submitText="提交"
          cancelText="返回"
        >
          <div style={{ fontSize: 13, color: '#909399', lineHeight: 1.6 }}>
            当前为抢办模式，一人办理后其他党组组织部文书待办自动消失。
          </div>
        </SubmitSidebar>
      </div>
    </>
  );
}
