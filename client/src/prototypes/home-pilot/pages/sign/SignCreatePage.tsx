/**
 * 发起签字流程页
 */
import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { AttachmentUpload, type AttachmentItem } from '../../components/PrototypeUI';
import { SubmitSidebar } from '../components/SubmitSidebar';
import {
  MEETING_TYPES,
  SIGN_FILE_TYPES,
  DIRECTORS,
  signTasks,
  type MeetingType,
  type SignFileType,
  type DirectorType,
} from '../../sign-mock';

const SIGN_DEPT_MANAGERS = [
  { id: 'u-001', name: '孙友', dept: '综合管理部' },
  { id: 'u-011', name: '常伟晶', dept: '综合管理部' },
];

export interface SignCreatePageProps {
  onBack: () => void;
  taskId?: string;
}

interface DelegationRow {
  id: string;
  directorType: DirectorType | '';
  delegatorId: string;
  delegateId: string;
}

export function SignCreatePage({ onBack, taskId }: SignCreatePageProps) {
  const originTask = taskId ? signTasks.find((t) => t.id === taskId) : undefined;
  const [title, setTitle] = useState(originTask?.title ?? '');
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>(originTask?.meetingTypes ?? []);
  const [signFiles, setSignFiles] = useState<SignFileType[]>(originTask?.signFiles ?? []);
  const [attachments, setAttachments] = useState<AttachmentItem[]>(
    originTask?.attachments.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.name.split('.').pop()?.toLowerCase() === 'pdf' ? 'pdf' : 'docx',
    })) ?? [],
  );
  const [hasDelegation, setHasDelegation] = useState(originTask?.hasDelegation ?? false);
  const [delegations, setDelegations] = useState<DelegationRow[]>(() => {
    if (originTask?.delegation) {
      return [
        {
          id: '1',
          directorType: originTask.delegation.directorType,
          delegatorId: originTask.delegation.delegatorId,
          delegateId: originTask.delegation.delegateId,
        },
      ];
    }
    return [];
  });
  const [comment, setComment] = useState('');
  const initialDeptManagerId = originTask?.deptManagerId;
  const [leader, setLeader] = useState(
    SIGN_DEPT_MANAGERS.find((m) => m.id === initialDeptManagerId)?.id ?? SIGN_DEPT_MANAGERS[0]?.id ?? '',
  );
  const [reminders, setReminders] = useState<string[]>([]);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success'>('idle');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success'>('idle');
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const toggleSelection = <T extends string>(value: T, list: T[], setter: (v: T[]) => void) => {
    const set = new Set(list);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    setter(Array.from(set) as T[]);
  };

  const addDelegation = () => {
    setDelegations((prev) => [
      ...prev,
      { id: `${Date.now()}`, directorType: '', delegatorId: '', delegateId: '' },
    ]);
  };

  const removeDelegation = (id: string) => {
    setDelegations((prev) => prev.filter((d) => d.id !== id));
  };

  const updateDelegation = (id: string, field: keyof DelegationRow, value: string) => {
    setDelegations((prev) => prev.map((d) => (d.id === id ? { ...d, [field]: value } : d)));
  };

  const validate = () => {
    const nextErrors: Record<string, boolean> = {};
    if (!title.trim()) nextErrors.title = true;
    if (meetingTypes.length === 0) nextErrors.meetingTypes = true;
    if (signFiles.length === 0) nextErrors.signFiles = true;
    if (attachments.length === 0) nextErrors.attachments = true;
    if (!leader) nextErrors.leader = true;
    if (hasDelegation) {
      delegations.forEach((row, index) => {
        if (!row.directorType) nextErrors[`delegationType_${index}`] = true;
        if (!row.delegatorId) nextErrors[`delegatorId_${index}`] = true;
        if (!row.delegateId) nextErrors[`delegateId_${index}`] = true;
        if (row.delegatorId && row.delegateId && row.delegatorId === row.delegateId) {
          nextErrors[`delegatorId_${index}`] = true;
          nextErrors[`delegateId_${index}`] = true;
        }
      });
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    setSubmitStatus('success');
    setSaveStatus('idle');
    setTimeout(() => setSubmitStatus('idle'), 2000);
  };

  const handleSave = () => {
    setSaveStatus('success');
    setSubmitStatus('idle');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  return (
    <>
      <div className="ds-page-header">
        <button type="button" className="ds-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          返回
        </button>
        <h1 className="ds-page-title">签字发起</h1>
      </div>

      <div className="mp-archive-layout">
        <div className="swb-card mp-archive-card">
          <div className="mp-archive-form">
            <div className="mp-archive-row">
              <div className="mp-archive-label mp-archive-label--required">标题</div>
              <div className="mp-archive-value">
                <input
                  type="text"
                  className={`ds-input${errors.title ? ' ds-input--error' : ''}`}
                  placeholder="请输入标题"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setErrors((p) => ({ ...p, title: false }));
                  }}
                />
                {errors.title && <div className="ds-error-msg">请输入标题</div>}
              </div>
            </div>

            <div className="mp-archive-row">
              <div className="mp-archive-label mp-archive-label--required">会议类型</div>
              <div className="mp-archive-value">
                <div className={`ds-checkbox-group${errors.meetingTypes ? ' ds-field-error' : ''}`}>
                  {MEETING_TYPES.map((type) => (
                    <label key={type} className="ds-checkbox">
                      <input
                        type="checkbox"
                        checked={meetingTypes.includes(type)}
                        onChange={() => toggleSelection(type, meetingTypes, setMeetingTypes)}
                      />
                      <span>{type}</span>
                    </label>
                  ))}
                </div>
                {errors.meetingTypes && <div className="ds-error-msg">请选择会议类型</div>}
              </div>
            </div>

            <div className="mp-archive-row">
              <div className="mp-archive-label mp-archive-label--required">签字文件</div>
              <div className="mp-archive-value">
                <div className={`ds-checkbox-group${errors.signFiles ? ' ds-field-error' : ''}`}>
                  {SIGN_FILE_TYPES.map((file) => (
                    <label key={file} className="ds-checkbox">
                      <input
                        type="checkbox"
                        checked={signFiles.includes(file)}
                        onChange={() => toggleSelection(file, signFiles, setSignFiles)}
                      />
                      <span>{file}</span>
                    </label>
                  ))}
                </div>
                {errors.signFiles && <div className="ds-error-msg">请选择签字文件</div>}
              </div>
            </div>

            <div className="mp-archive-row mp-archive-row--top">
              <div className="mp-archive-label mp-archive-label--required">附件</div>
              <div className="mp-archive-value">
                <div className={errors.attachments ? 'ds-field-error' : undefined}>
                  <AttachmentUpload files={attachments} onChange={setAttachments} />
                </div>
                {errors.attachments && <div className="ds-error-msg">请上传附件</div>}
              </div>
            </div>

            <div className="mp-archive-row">
              <div className="mp-archive-label">代为表决</div>
              <div className="mp-archive-value">
                <label className="ds-checkbox">
                  <input
                    type="checkbox"
                    checked={hasDelegation}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setHasDelegation(checked);
                      if (!checked) {
                        setDelegations([]);
                      } else if (delegations.length === 0) {
                        setDelegations([
                          { id: `${Date.now()}`, directorType: '', delegatorId: '', delegateId: '' },
                        ]);
                      }
                    }}
                  />
                  <span>设置代为表决</span>
                </label>
              </div>
            </div>
          </div>

          {hasDelegation && (
            <div style={{ background: '#F7F8FA', padding: 16, borderTop: '1px solid var(--swb-border)' }}>
                <table className="ds-delegation-table">
                  <thead>
                    <tr>
                      <th style={{ width: 160 }}>董事类型</th>
                      <th style={{ width: 200 }}>委托人</th>
                      <th style={{ width: 200 }}>受托人</th>
                      <th style={{ width: 80 }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {delegations.map((row, index) => {
                      const directorOptions = row.directorType
                        ? DIRECTORS.filter((d) => d.type === row.directorType)
                        : [];
                      return (
                        <tr key={row.id}>
                          <td>
                            <select
                              className="ds-select"
                              value={row.directorType}
                              onChange={(e) => {
                                updateDelegation(row.id, 'directorType', e.target.value);
                                updateDelegation(row.id, 'delegatorId', '');
                                updateDelegation(row.id, 'delegateId', '');
                                setErrors((p) => ({ ...p, [`delegationType_${index}`]: false }));
                              }}
                            >
                              <option value="">请选择</option>
                              <option value="内部董事">内部董事</option>
                              <option value="外部董事">外部董事</option>
                              <option value="职工董事">职工董事</option>
                            </select>
                            {errors[`delegationType_${index}`] && (
                              <div className="ds-error-msg">请选择董事类型</div>
                            )}
                          </td>
                          <td>
                            <select
                              className={`ds-select${errors[`delegatorId_${index}`] ? ' ds-input--error' : ''}`}
                              value={row.delegatorId}
                              onChange={(e) => {
                                updateDelegation(row.id, 'delegatorId', e.target.value);
                                setErrors((p) => ({ ...p, [`delegatorId_${index}`]: false }));
                              }}
                              disabled={!row.directorType}
                            >
                              <option value="">请选择</option>
                              {directorOptions.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              className={`ds-select${errors[`delegateId_${index}`] ? ' ds-input--error' : ''}`}
                              value={row.delegateId}
                              onChange={(e) => {
                                updateDelegation(row.id, 'delegateId', e.target.value);
                                setErrors((p) => ({ ...p, [`delegateId_${index}`]: false }));
                              }}
                              disabled={!row.directorType}
                            >
                              <option value="">请选择</option>
                              {directorOptions.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                            {errors[`delegatorId_${index}`] &&
                              errors[`delegateId_${index}`] &&
                              row.delegatorId === row.delegateId &&
                              row.delegatorId && (
                                <div className="ds-error-msg">委托人与受托人不能为同一人</div>
                              )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="ds-delegation-del-btn"
                              onClick={() => removeDelegation(row.id)}
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button type="button" className="ds-delegation-add-btn" onClick={addDelegation}>
                  + 添加
                </button>
              </div>
            )}

        </div>

        <SubmitSidebar
          opinion={comment}
          onOpinionChange={(value) => setComment(value.slice(0, 500))}
          leader={leader}
          onLeaderChange={setLeader}
          leaderOptions={SIGN_DEPT_MANAGERS}
          reminders={reminders}
          onReminderChange={setReminders}
          onSubmit={handleSubmit}
          onSave={handleSave}
          submitStatus={submitStatus}
          saveStatus={saveStatus}
        />
      </div>
    </>
  );
}
