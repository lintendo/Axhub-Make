/**
 * 经办人办结页
 */
import React, { useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { getSignTask, getDirectorName, DIRECTORS } from '../../sign-mock';
import { SuccessTip } from '../../components/SuccessTip';
import { TaskDetailTabs } from './components/TaskDetailTabs';
import { SubmitSidebar } from './components/SubmitSidebar';

export interface SignFinishPageProps {
  taskId: string;
  onBack: () => void;
}

export function SignFinishPage({ taskId, onBack }: SignFinishPageProps) {
  const task = getSignTask(taskId);
  const [comment, setComment] = useState('');
  const [notifyDirectors, setNotifyDirectors] = useState<string[]>([]);
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

  const toggleNotifyDirector = (id: string) => {
    setNotifyDirectors((prev) => {
      const set = new Set(prev);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set);
    });
  };

  const handleSubmit = () => {
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2000);
  };

  const directorOptions = task.selectedDirectors
    ? DIRECTORS.filter((d) => task.selectedDirectors?.includes(d.id))
    : [];

  return (
    <>
      <SuccessTip visible={submitted} icon={<Check size={18} />} message="办结成功" />
      <div className="ds-page-header">
        <button type="button" className="ds-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          返回
        </button>
        <h1 className="ds-page-title">办结</h1>
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
          submitText="办结"
          cancelText="返回"
        >
          <div className="mp-submit-flow-section">
            <div className="mp-submit-flow-label">选择需通知的相关董事：</div>
            <div className="ds-form-control">
              <div className="ds-director-options">
                {directorOptions.map((d) => (
                  <label key={d.id} className="ds-checkbox">
                    <input
                      type="checkbox"
                      checked={notifyDirectors.includes(d.id)}
                      onChange={() => toggleNotifyDirector(d.id)}
                    />
                    <span>{getDirectorName(d.id)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 13, color: '#909399', lineHeight: 1.6 }}>
            所有被呈送董事办理完成后，点击办结完成流程。未办理完成时不可办结。
          </div>
        </SubmitSidebar>
      </div>
    </>
  );
}
