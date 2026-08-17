/**
 * 部室负责人审批页
 */
import React, { useState } from 'react';
import { ArrowLeft, Check, X } from 'lucide-react';
import { getSignTask } from '../../sign-mock';
import { SuccessTip } from '../../components/SuccessTip';
import { TaskDetailTabs } from './components/TaskDetailTabs';
import { SubmitSidebar } from './components/SubmitSidebar';

const OFFICE_MANAGER_OPTIONS = [
  { id: 'u-201', name: '张征' },
  { id: 'u-202', name: '陈扬' },
];

export interface SignApproveDeptPageProps {
  taskId: string;
  onBack: () => void;
}

export function SignApproveDeptPage({ taskId, onBack }: SignApproveDeptPageProps) {
  const task = getSignTask(taskId);
  const [result, setResult] = useState<'同意' | '驳回'>('同意');
  const [comment, setComment] = useState('');
  const [officeManagerId, setOfficeManagerId] = useState(OFFICE_MANAGER_OPTIONS[0].id);
  const [reminder, setReminder] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(false);

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
    if (result === '同意' && !officeManagerId) {
      setError(true);
      return;
    }
    setError(false);
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
        <h1 className="ds-page-title">部室负责人审批</h1>
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
            <div className="ds-form-field ds-form-field--full">
              <label className="ds-form-label ds-form-label--required">董办负责人：</label>
              <div className="ds-form-control">
                <div className={`mp-checkbox-group mp-submit-leader-group${error ? ' ds-field-error' : ''}`}>
                  {OFFICE_MANAGER_OPTIONS.map((m) => (
                    <label key={m.id} className="mp-checkbox mp-submit-leader">
                      <input
                        type="radio"
                        name="officeManager"
                        value={m.id}
                        checked={officeManagerId === m.id}
                        onChange={() => {
                          setOfficeManagerId(m.id);
                          setError(false);
                        }}
                      />
                      <span>{m.name}</span>
                    </label>
                  ))}
                </div>
                {error && <div className="ds-error-msg">请选择董办负责人</div>}
              </div>
            </div>
          )}
        </SubmitSidebar>
      </div>
    </>
  );
}
