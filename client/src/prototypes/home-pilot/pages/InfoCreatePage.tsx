/**
 * 首页内嵌：董事参考信息发起页
 */
import React, { useState } from 'react';
import { ArrowLeft, Calendar } from 'lucide-react';
import { AttachmentUpload, type AttachmentItem } from '../components/PrototypeUI';
import { SubmitSidebar } from './components/SubmitSidebar';

export interface InfoCreatePageProps {
  onBack: () => void;
}

const CATEGORY_OPTIONS = ['月报', '季报', '专报', '专项报告', '工作安排', '其他'];
const SECRET_OPTIONS = ['无', '普通商密', '内部'];
const MAX_DESCRIPTION = 200;

export function InfoCreatePage({ onBack }: InfoCreatePageProps) {
  const [form, setForm] = useState({
    name: '',
    category: '月报',
    secretLevel: '内部',
    date: '',
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

  return (
    <>
      <div className="mp-page-header">
        <button type="button" className="mp-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          返回
        </button>
        <h1 className="mp-page-title">董事参考</h1>
      </div>

      <div className="mp-archive-layout">
        <div className="swb-card mp-archive-card">
          <div className="mp-archive-form mp-info-form">
            <div className="mp-archive-row">
              <div className="mp-archive-label mp-archive-label--required">名称</div>
              <div className="mp-archive-value">
                <input
                  type="text"
                  className="mp-form-input"
                  placeholder="请输入文件名称"
                  value={form.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                />
              </div>
            </div>

            <div className="mp-archive-row">
              <div className="mp-archive-label mp-archive-label--required">类别</div>
              <div className="mp-archive-value">
                <div className="mp-radio-group mp-info-category-group">
                  {CATEGORY_OPTIONS.map((category) => (
                    <label key={category} className="mp-radio mp-info-category">
                      <input
                        type="radio"
                        name="category"
                        checked={form.category === category}
                        onChange={() => handleChange('category', category)}
                      />
                      <span>{category}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mp-archive-row">
              <div className="mp-archive-label mp-archive-label--required">密级</div>
              <div className="mp-archive-value">
                <div className="mp-radio-group mp-info-secret-group">
                  {SECRET_OPTIONS.map((secret) => (
                    <label key={secret} className="mp-radio mp-info-secret">
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

            <div className="mp-archive-row">
              <div className="mp-archive-label mp-archive-label--required">日期</div>
              <div className="mp-archive-value">
                <div className="mp-date-picker">
                  <Calendar size={16} className="mp-date-picker-icon" />
                  <input
                    type="date"
                    className="mp-form-input mp-date-picker-input mp-info-date-input"
                    placeholder="选择日期"
                    value={form.date}
                    onChange={(e) => handleChange('date', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="mp-archive-row mp-archive-row--top">
              <div className="mp-archive-label">情况简述</div>
              <div className="mp-archive-value mp-info-description-value">
                <textarea
                  className="mp-form-textarea mp-info-description"
                  rows={4}
                  placeholder="请输入情况简述"
                  value={form.description}
                  onChange={(e) => handleDescriptionChange(e.target.value)}
                />
                <span className="mp-info-char-count">
                  {form.description.length} / {MAX_DESCRIPTION}
                </span>
              </div>
            </div>

            <div className="mp-archive-row mp-archive-row--top">
              <div className="mp-archive-label mp-archive-label--required">附件</div>
              <div className="mp-archive-value">
                <AttachmentUpload files={attachments} onChange={setAttachments} />
              </div>
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
