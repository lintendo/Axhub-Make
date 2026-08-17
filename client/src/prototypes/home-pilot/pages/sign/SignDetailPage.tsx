/**
 * 签字详情页
 */
import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { getSignTask } from '../../sign-mock';
import { TaskDetailTabs } from './components/TaskDetailTabs';

export interface SignDetailPageProps {
  taskId: string;
  onBack: () => void;
}

export function SignDetailPage({ taskId, onBack }: SignDetailPageProps) {
  const task = getSignTask(taskId);

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

  return (
    <>
      <div className="ds-page-header">
        <button type="button" className="ds-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          返回
        </button>
        <h1 className="ds-page-title">签字详情</h1>
      </div>

      <TaskDetailTabs task={task} />
    </>
  );
}
