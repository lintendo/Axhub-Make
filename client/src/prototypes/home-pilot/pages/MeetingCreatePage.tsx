/**
 * 首页内嵌：会议发起表单页
 */
import React, { useState } from 'react';
import { ArrowLeft, Calendar } from 'lucide-react';
import { AttachmentUpload, type AttachmentItem } from '../components/PrototypeUI';
import { SubmitSidebar } from './components/SubmitSidebar';

export interface MeetingCreatePageProps {
  onBack: () => void;
}

const NOTIFY_TYPES = ['会议安排', '议案材料', '会议记录'];
const SECRET_OPTIONS = ['普通商密', '内部'];
const MEETING_TYPE_OPTIONS = ['董事沟通会前', '专门委员会前', '董事会会前'];
const MAX_DESCRIPTION = 500;

export function MeetingCreatePage({ onBack }: MeetingCreatePageProps) {
  const [form, setForm] = useState({
    notifyType: '会议安排',
    fileName: '',
    secretLevel: '内部',
    meetingTypes: [] as string[],
    meetingDate: '',
    description: '',
    opinion: '',
    leader: '孙友',
    reminders: [] as string[],
  });
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success'>('idle');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success'>('idle');
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);

  const handleChange = (key: keyof typeof form, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleNotifyTypeChange = (type: string) => {
    setForm((prev) => ({
      ...prev,
      notifyType: type,
      // 切换通知类型时保留通用字段，重置类型相关字段
      meetingTypes: [],
      meetingDate: '',
      description: '',
    }));
  };

  const toggleMeetingType = (type: string) => {
    setForm((prev) => {
      const set = new Set(prev.meetingTypes);
      if (set.has(type)) set.delete(type);
      else set.add(type);
      return { ...prev, meetingTypes: Array.from(set) };
    });
  };

  const handleDescriptionChange = (value: string) => {
    if (value.length <= MAX_DESCRIPTION) {
      handleChange('description', value);
    }
  };

  const handleSubmit = () => {
    setSubmitStatus('success');
    setSaveStatus('idle');
    setTimeout(() => setSubmitStatus('idle'), 2000);
  };

  const handleSave = () => {
    setSaveStatus('success');
    setSubmitStatus('idle');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const renderUploadZone = () => (
    <AttachmentUpload files={attachments} onChange={setAttachments} />
  );

  const showSecretLevel = form.notifyType === '议案材料' || form.notifyType === '会议记录';
  const showMeetingType = form.notifyType === '议案材料';
  const showMeetingDate = form.notifyType === '议案材料';
  const showDescription = form.notifyType === '议案材料' || form.notifyType === '会议记录';

  return (
    <>
      <div className="mp-page-header">
        <button type="button" className="mp-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          返回
        </button>
        <h1 className="mp-page-title">会议发起</h1>
      </div>

      <div className="mp-archive-layout">
        <div className="swb-card mp-archive-card">
          <div className="mp-archive-form mp-meeting-form">
            <div className="mp-archive-row">
              <div className="mp-archive-label mp-archive-label--required">通知类型</div>
              <div className="mp-archive-value">
                <div className="mp-radio-group">
                  {NOTIFY_TYPES.map((type) => (
                    <label key={type} className="mp-radio">
                      <input
                        type="radio"
                        name="notifyType"
                        checked={form.notifyType === type}
                        onChange={() => handleNotifyTypeChange(type)}
                      />
                      <span>{type}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mp-archive-row">
              <div className="mp-archive-label mp-archive-label--required">文件名称</div>
              <div className="mp-archive-value">
                <input
                  type="text"
                  className="mp-form-input"
                  placeholder="请输入文件名称"
                  value={form.fileName}
                  onChange={(e) => handleChange('fileName', e.target.value)}
                />
              </div>
            </div>

            {showSecretLevel && (
              <div className="mp-archive-row">
                <div className="mp-archive-label mp-archive-label--required">密级</div>
                <div className="mp-archive-value">
                  <div className="mp-radio-group mp-meeting-secret-group">
                    {SECRET_OPTIONS.map((secret) => (
                      <label key={secret} className="mp-radio mp-meeting-secret">
                        <input
                          type="radio"
                          name="secretLevel"
                          checked={form.secretLevel === secret}
                          onChange={() => handleChange('secretLevel', secret)}
                        />
                        <span>{secret}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {showMeetingType && (
              <div className="mp-archive-row">
                <div className="mp-archive-label mp-archive-label--required">会议类型</div>
                <div className="mp-archive-value">
                  <div className="mp-checkbox-group mp-meeting-type-group">
                    {MEETING_TYPE_OPTIONS.map((type) => (
                      <label key={type} className="mp-checkbox mp-meeting-type">
                        <input
                          type="checkbox"
                          checked={form.meetingTypes.includes(type)}
                          onChange={() => toggleMeetingType(type)}
                        />
                        <span>{type}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {showMeetingDate && (
              <div className="mp-archive-row">
                <div className="mp-archive-label">会议日期</div>
                <div className="mp-archive-value">
                  <div className="mp-date-picker">
                    <Calendar size={16} className="mp-date-picker-icon" />
                    <input
                      type="date"
                      className="mp-form-input mp-date-picker-input mp-meeting-date-input"
                      placeholder="请选择"
                      value={form.meetingDate}
                      onChange={(e) => handleChange('meetingDate', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {showDescription && (
              <div className="mp-archive-row mp-archive-row--top">
                <div className="mp-archive-label">情况简述</div>
                <div className="mp-archive-value mp-meeting-description-value">
                  <textarea
                    className="mp-form-textarea mp-meeting-description"
                    rows={4}
                    placeholder="请输入内容"
                    value={form.description}
                    onChange={(e) => handleDescriptionChange(e.target.value)}
                  />
                  <span className="mp-meeting-char-count">
                    {form.description.length} / {MAX_DESCRIPTION}
                  </span>
                </div>
              </div>
            )}

            <div className="mp-archive-row mp-archive-row--top">
              <div className="mp-archive-label mp-archive-label--required">附件</div>
              <div className="mp-archive-value">{renderUploadZone()}</div>
            </div>
          </div>
        </div>

        <SubmitSidebar
          opinion={form.opinion}
          onOpinionChange={(value) => handleChange('opinion', value)}
          leader={form.leader}
          onLeaderChange={(value) => handleChange('leader', value)}
          reminders={form.reminders}
          onReminderChange={(value) => handleChange('reminders', value)}
          onSubmit={handleSubmit}
          onSave={handleSave}
          submitStatus={submitStatus}
          saveStatus={saveStatus}
        />
      </div>
    </>
  );
}
