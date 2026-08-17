/**
 * 首页内嵌：调研发起页
 */
import React, { useState } from 'react';
import { ArrowLeft, Calendar } from 'lucide-react';
import { AttachmentUpload, type AttachmentItem } from '../components/PrototypeUI';
import { SubmitSidebar } from './components/SubmitSidebar';

export interface ResearchCreatePageProps {
  onBack: () => void;
}

const STAGE_OPTIONS = ['调研安排', '调研材料', '调研报告'];

export function ResearchCreatePage({ onBack }: ResearchCreatePageProps) {
  const [form, setForm] = useState({
    title: '',
    stages: ['调研安排', '调研材料', '调研报告'],
    startDate: '',
    endDate: '',
    location: '',
    members: '周渝波、陈月明、陈壁、冯树臣、李新华、吴晓根，张钧、张征',
    opinion: '',
    leader: '孙友',
    reminders: [] as string[],
  });
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success'>('idle');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success'>('idle');
  const [planFiles, setPlanFiles] = useState<AttachmentItem[]>([]);
  const [materialFiles, setMaterialFiles] = useState<AttachmentItem[]>([]);
  const [reportFiles, setReportFiles] = useState<AttachmentItem[]>([]);

  const handleChange = (key: keyof typeof form, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleStage = (stage: string) => {
    setForm((prev) => {
      const set = new Set(prev.stages);
      if (set.has(stage)) set.delete(stage);
      else set.add(stage);
      return { ...prev, stages: Array.from(set) };
    });
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

  const renderUploadZone = (
    files: AttachmentItem[],
    setFiles: (files: AttachmentItem[]) => void,
  ) => <AttachmentUpload files={files} onChange={setFiles} />;

  return (
    <>
      <div className="mp-page-header">
        <button type="button" className="mp-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          返回
        </button>
        <h1 className="mp-page-title">调研</h1>
      </div>

      <div className="mp-archive-layout">
        <div className="swb-card mp-archive-card">
          <div className="mp-archive-form mp-research-form">
            <div className="mp-archive-row">
              <div className="mp-archive-label mp-archive-label--required">标题</div>
              <div className="mp-archive-value">
                <input
                  type="text"
                  className="mp-form-input"
                  placeholder="请输入标题"
                  value={form.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                />
              </div>
            </div>

            <div className="mp-archive-row">
              <div className="mp-archive-label mp-archive-label--required">调研阶段</div>
              <div className="mp-archive-value">
                <div className="mp-checkbox-group mp-research-stage-group">
                  {STAGE_OPTIONS.map((stage) => (
                    <label key={stage} className="mp-checkbox mp-research-stage">
                      <input
                        type="checkbox"
                        checked={form.stages.includes(stage)}
                        onChange={() => toggleStage(stage)}
                      />
                      <span>{stage}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mp-archive-row">
              <div className="mp-archive-label mp-archive-label--required">调研时间</div>
              <div className="mp-archive-value mp-archive-value--inline mp-research-date-row">
                <div className="mp-date-picker">
                  <Calendar size={16} className="mp-date-picker-icon" />
                  <input
                    type="date"
                    className="mp-form-input mp-date-picker-input"
                    value={form.startDate}
                    onChange={(e) => handleChange('startDate', e.target.value)}
                  />
                </div>
                <span className="mp-date-separator">—</span>
                <div className="mp-date-picker">
                  <Calendar size={16} className="mp-date-picker-icon" />
                  <input
                    type="date"
                    className="mp-form-input mp-date-picker-input"
                    value={form.endDate}
                    onChange={(e) => handleChange('endDate', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="mp-archive-row">
              <div className="mp-archive-label mp-archive-label--required">调研地点</div>
              <div className="mp-archive-value">
                <input
                  type="text"
                  className="mp-form-input"
                  placeholder="请输入地点"
                  value={form.location}
                  onChange={(e) => handleChange('location', e.target.value)}
                />
              </div>
            </div>

            <div className="mp-archive-row">
              <div className="mp-archive-label mp-archive-label--required">调研人员</div>
              <div className="mp-archive-value">
                <input
                  type="text"
                  className="mp-form-input"
                  value={form.members}
                  onChange={(e) => handleChange('members', e.target.value)}
                />
              </div>
            </div>

            <div className="mp-archive-row mp-archive-row--top">
              <div className="mp-archive-label mp-archive-label--required">调研安排</div>
              <div className="mp-archive-value">{renderUploadZone(planFiles, setPlanFiles)}</div>
            </div>

            <div className="mp-archive-row mp-archive-row--top">
              <div className="mp-archive-label mp-archive-label--required">调研材料</div>
              <div className="mp-archive-value">{renderUploadZone(materialFiles, setMaterialFiles)}</div>
            </div>

            <div className="mp-archive-row mp-archive-row--top">
              <div className="mp-archive-label mp-archive-label--required">调研报告</div>
              <div className="mp-archive-value">{renderUploadZone(reportFiles, setReportFiles)}</div>
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
