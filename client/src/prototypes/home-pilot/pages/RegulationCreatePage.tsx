/**
 * 首页内嵌：制度发起表单页
 */
import React, { useState } from 'react';
import { ArrowLeft, Calendar } from 'lucide-react';
import { AttachmentUpload, type AttachmentItem } from '../components/PrototypeUI';
import { SubmitSidebar } from './components/SubmitSidebar';

export interface RegulationCreatePageProps {
  onBack: () => void;
}

const REGULATION_TYPES = ['公司章程', '议事规则', '决策运行', '支撑保障', '管理监督'];

export function RegulationCreatePage({ onBack }: RegulationCreatePageProps) {
  const [form, setForm] = useState({
    name: '',
    docNo: '',
    category: '公司章程',
    issueDate: '',
    opinion: '',
    leader: '孙友',
    reminders: [] as string[],
  });
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success'>('idle');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success'>('idle');

  const handleChange = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleRemindersChange = (value: string[]) => {
    setForm((prev) => ({ ...prev, reminders: value }));
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
        <h1 className="mp-page-title">制度发起</h1>
      </div>

      <div className="mp-archive-layout">
        <div className="swb-card mp-archive-card">
          <div className="mp-regulation-form">
            <div className="mp-regulation-row">
              <div className="mp-regulation-label mp-regulation-label--required">制度名称</div>
              <div className="mp-regulation-value">
                <input
                  type="text"
                  className="mp-form-input"
                  placeholder="请输入制度名称"
                  value={form.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                />
              </div>
            </div>

            <div className="mp-regulation-row">
              <div className="mp-regulation-label mp-regulation-label--required">制度文号</div>
              <div className="mp-regulation-value">
                <input
                  type="text"
                  className="mp-form-input"
                  placeholder="请输入制度文号"
                  value={form.docNo}
                  onChange={(e) => handleChange('docNo', e.target.value)}
                />
              </div>
            </div>

            <div className="mp-regulation-row">
              <div className="mp-regulation-label mp-regulation-label--required">制度类型</div>
              <div className="mp-regulation-value">
                <div className="mp-radio-group mp-radio-group--inline">
                  {REGULATION_TYPES.map((type) => (
                    <label key={type} className="mp-radio">
                      <input
                        type="radio"
                        name="category"
                        value={type}
                        checked={form.category === type}
                        onChange={() => handleChange('category', type)}
                      />
                      <span>{type}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mp-regulation-row">
              <div className="mp-regulation-label mp-regulation-label--required">签发日期</div>
              <div className="mp-regulation-value">
                <div className="mp-date-picker">
                  <Calendar size={16} className="mp-date-picker-icon" />
                  <input
                    type="date"
                    className="mp-form-input mp-date-picker-input"
                    value={form.issueDate}
                    onChange={(e) => handleChange('issueDate', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="mp-regulation-row mp-regulation-row--top">
              <div className="mp-regulation-label mp-regulation-label--required">制度附件</div>
              <div className="mp-regulation-value">
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
          onReminderChange={handleRemindersChange}
          onSubmit={handleSubmit}
          onSave={handleSave}
          submitLabel="发布"
          submitStatus={submitStatus}
          saveStatus={saveStatus}
        />
      </div>
    </>
  );
}
