/**
 * 首页内嵌：会议材料归档页
 */
import React, { useState } from 'react';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { AttachmentUpload, type AttachmentItem } from '../components/PrototypeUI';
import { SuccessTip } from '../components/SuccessTip';

export interface MeetingArchivePageProps {
  onBack: () => void;
}

const MEETING_TYPES = [
  '董事会',
  '战略与投资委员会',
  '提名委员会',
  '薪酬与考核委员会',
  '审计与风险委员会',
  '社会责任委员会',
];

const SECRET_LEVELS = ['普通商密', '内部'];
const MEETING_FORMS = ['现场', '书面', '通讯', '现场+通讯'];

export function MeetingArchivePage({ onBack }: MeetingArchivePageProps) {
  const [form, setForm] = useState({
    title: '',
    meetingType: '董事会',
    secretLevel: '普通商密',
    meetingForm: '现场',
    location: '',
    meetingDate: '',
    meetingTime: '',
  });
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success'>('idle');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success'>('idle');
  const [noticeFiles, setNoticeFiles] = useState<AttachmentItem[]>([]);
  const [proposalFiles, setProposalFiles] = useState<AttachmentItem[]>([]);
  const [resolutionFiles, setResolutionFiles] = useState<AttachmentItem[]>([]);
  const [recordFiles, setRecordFiles] = useState<AttachmentItem[]>([]);

  const handleChange = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = () => {
    setSubmitStatus('success');
    setSaveStatus('idle');
    setTimeout(() => {
      setSubmitStatus('idle');
    }, 2000);
  };

  const handleSave = () => {
    setSaveStatus('success');
    setSubmitStatus('idle');
    setTimeout(() => {
      setSaveStatus('idle');
    }, 2000);
  };

  const renderRadioGroup = (
    options: string[],
    name: string,
    value: string,
    onChange: (val: string) => void,
  ) => (
    <div className="mp-radio-group mp-radio-group--inline">
      {options.map((opt) => (
        <label key={opt} className="mp-radio">
          <input
            type="radio"
            name={name}
            value={opt}
            checked={value === opt}
            onChange={() => onChange(opt)}
          />
          <span>{opt}</span>
        </label>
      ))}
    </div>
  );

  const renderUploadZone = (
    files: AttachmentItem[],
    setFiles: (files: AttachmentItem[]) => void,
  ) => <AttachmentUpload files={files} onChange={setFiles} hint="支持 pdf、doc、docx、jpg、png 格式" />;

  return (
    <>
      <div className="mp-page-header">
        <button type="button" className="mp-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          返回
        </button>
        <h1 className="mp-page-title">会议材料归档</h1>
      </div>

      <div className="mp-archive-layout">
        <div className="swb-card mp-archive-card">
          <div className="mp-archive-form">
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
              <div className="mp-archive-label mp-archive-label--required">会议类型</div>
              <div className="mp-archive-value">
                {renderRadioGroup(MEETING_TYPES, 'meetingType', form.meetingType, (val) =>
                  handleChange('meetingType', val),
                )}
              </div>
            </div>

            <div className="mp-archive-row">
              <div className="mp-archive-label mp-archive-label--required">密级</div>
              <div className="mp-archive-value">
                {renderRadioGroup(SECRET_LEVELS, 'secretLevel', form.secretLevel, (val) =>
                  handleChange('secretLevel', val),
                )}
              </div>
            </div>

            <div className="mp-archive-row">
              <div className="mp-archive-label mp-archive-label--required">会议形式</div>
              <div className="mp-archive-value">
                {renderRadioGroup(MEETING_FORMS, 'meetingForm', form.meetingForm, (val) =>
                  handleChange('meetingForm', val),
                )}
              </div>
            </div>

            <div className="mp-archive-row">
              <div className="mp-archive-label mp-archive-label--required">会议地点</div>
              <div className="mp-archive-value">
                <input
                  type="text"
                  className="mp-form-input"
                  placeholder="请输入会议地点"
                  value={form.location}
                  onChange={(e) => handleChange('location', e.target.value)}
                />
              </div>
            </div>

            <div className="mp-archive-row">
              <div className="mp-archive-label mp-archive-label--required">会议时间</div>
              <div className="mp-archive-value mp-archive-value--inline">
                <select
                  className="mp-form-select mp-archive-date-select"
                  value={form.meetingDate}
                  onChange={(e) => handleChange('meetingDate', e.target.value)}
                >
                  <option value="">时间</option>
                  <option value="2025-07-29">2025-07-29</option>
                  <option value="2025-07-30">2025-07-30</option>
                  <option value="2025-07-31">2025-07-31</option>
                </select>
                <input
                  type="time"
                  className="mp-form-input mp-archive-time-input"
                  value={form.meetingTime}
                  onChange={(e) => handleChange('meetingTime', e.target.value)}
                />
              </div>
            </div>

            <div className="mp-archive-row mp-archive-row--top">
              <div className="mp-archive-label mp-archive-label--required">会议通知</div>
              <div className="mp-archive-value">{renderUploadZone(noticeFiles, setNoticeFiles)}</div>
            </div>

            <div className="mp-archive-row mp-archive-row--top">
              <div className="mp-archive-label mp-archive-label--required">议案材料</div>
              <div className="mp-archive-value">{renderUploadZone(proposalFiles, setProposalFiles)}</div>
            </div>

            <div className="mp-archive-row mp-archive-row--top">
              <div className="mp-archive-label mp-archive-label--required">会议决议</div>
              <div className="mp-archive-value">{renderUploadZone(resolutionFiles, setResolutionFiles)}</div>
            </div>

            <div className="mp-archive-row mp-archive-row--top">
              <div className="mp-archive-label mp-archive-label--required">会议记录</div>
              <div className="mp-archive-value">{renderUploadZone(recordFiles, setRecordFiles)}</div>
            </div>
          </div>
        </div>

        <div className="mp-archive-sidebar">
          <div className="swb-card">
            <div className="mp-sidebar-header">
              <AlertCircle size={18} color="#F5A623" />
              <span className="mp-sidebar-title">操作</span>
            </div>
            <div className="mp-sidebar-actions">
              <button
                type="button"
                className="swb-btn swb-btn--primary mp-sidebar-btn"
                onClick={handleSubmit}
              >
                提交
              </button>
              <button
                type="button"
                className="swb-btn swb-btn--default mp-sidebar-btn"
                onClick={handleSave}
              >
                保存
              </button>
            </div>

            <SuccessTip visible={submitStatus === 'success'} message="提交成功" data-testid="submit-tip" />
            <SuccessTip visible={saveStatus === 'success'} message="保存成功" data-testid="save-tip" />
          </div>
        </div>
      </div>
    </>
  );
}
