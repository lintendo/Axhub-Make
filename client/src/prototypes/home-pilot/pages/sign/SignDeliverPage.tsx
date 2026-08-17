/**
 * 经办人呈送页
 */
import React, { useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { getSignTask, DIRECTORS, type DirectorType } from '../../sign-mock';
import { SuccessTip } from '../../components/SuccessTip';
import { TaskDetailTabs } from './components/TaskDetailTabs';
import { SubmitSidebar } from './components/SubmitSidebar';

export interface SignDeliverPageProps {
  taskId: string;
  onBack: () => void;
}

const DIRECTOR_TYPE_ORDER: DirectorType[] = ['内部董事', '职工董事', '外部董事'];

export function SignDeliverPage({ taskId, onBack }: SignDeliverPageProps) {
  const task = getSignTask(taskId);
  const [comment, setComment] = useState('');
  const [selectedDirectors, setSelectedDirectors] = useState<string[]>(task?.selectedDirectors ?? []);
  const [mode, setMode] = useState<'并行' | '串行'>(task?.signMode ?? '并行');
  const [reminder, setReminder] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

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

  const toggleDirector = (id: string) => {
    setSelectedDirectors((prev) => {
      const set = new Set(prev);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set);
    });
    setErrors((p) => ({ ...p, directors: false }));
  };

  const handleSubmit = () => {
    const nextErrors: Record<string, boolean> = {};
    if (selectedDirectors.length === 0) nextErrors.directors = true;
    if (!mode) nextErrors.mode = true;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2000);
  };

  const directorsByType = (type: DirectorType) => DIRECTORS.filter((d) => d.type === type);

  return (
    <>
      <SuccessTip visible={submitted} icon={<Check size={18} />} message="呈送成功" />
      <div className="ds-page-header">
        <button type="button" className="ds-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          返回
        </button>
        <h1 className="ds-page-title">经办人呈送</h1>
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
          <div className="mp-submit-flow-section">
            <div className="mp-submit-flow-label mp-submit-flow-label--required">选择呈送董事：</div>
            <div className={`ds-form-control${errors.directors ? ' ds-field-error' : ''}`}>
              <div className="ds-director-groups">
                {DIRECTOR_TYPE_ORDER.map((type) => (
                  <div key={type}>
                    <div className="ds-director-group-title">{type}</div>
                    <div className="ds-director-options">
                      {directorsByType(type).map((d) => (
                        <label key={d.id} className="ds-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedDirectors.includes(d.id)}
                            onChange={() => toggleDirector(d.id)}
                          />
                          <span>{d.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {errors.directors && <div className="ds-error-msg">请选择呈送董事</div>}
            </div>
          </div>

          <div className="mp-submit-flow-section">
            <div className="mp-submit-flow-label mp-submit-flow-label--required">董事审批类型：</div>
            <div className={`ds-radio-group${errors.mode ? ' ds-field-error' : ''}`}>
              <label className="ds-radio">
                <input
                  type="radio"
                  name="signMode"
                  value="并行"
                  checked={mode === '并行'}
                  onChange={() => setMode('并行')}
                />
                <span>并行</span>
              </label>
              <label className="ds-radio">
                <input
                  type="radio"
                  name="signMode"
                  value="串行"
                  checked={mode === '串行'}
                  onChange={() => setMode('串行')}
                />
                <span>串行</span>
              </label>
            </div>
            {mode === '串行' && (
              <div style={{ marginTop: 8, fontSize: 13, color: '#909399' }}>
                串行顺序：内部董事 → 职工董事 → 外部董事
              </div>
            )}
            {errors.mode && <div className="ds-error-msg">请选择董事审批类型</div>}
          </div>
        </SubmitSidebar>
      </div>
    </>
  );
}
