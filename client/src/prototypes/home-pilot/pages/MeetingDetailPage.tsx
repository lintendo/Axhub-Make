/**
 * 会议材料归档详情页
 */
import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { AttachmentUpload, type AttachmentItem } from '../components/PrototypeUI';
import { meetingArchive } from '../mock';

export interface MeetingDetailPageProps {
  id: string;
  onBack: () => void;
}

function toAttachmentItems(names: string[]): AttachmentItem[] {
  return names.map((name, index) => ({
    id: `mdp-${index}`,
    name,
    type: 'pdf',
  }));
}

export function MeetingDetailPage({ id: _id, onBack }: MeetingDetailPageProps) {
  const detail = meetingArchive;

  return (
    <>
      <div className="mdp-archive-header">
        <button type="button" className="mdp-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          返回
        </button>
        <h1 className="mdp-archive-title">会议材料归档</h1>
        <span className="mdp-archive-spacer" />
      </div>

      <div className="swb-card">
        <div className="mdp-archive-table">
          <div className="mdp-archive-row">
            <div className="mdp-archive-label">
              <span className="mdp-required">*</span>标<span className="mdp-label-space" />题
            </div>
            <div className="mdp-archive-value">{detail.title}</div>
          </div>
          <div className="mdp-archive-row">
            <div className="mdp-archive-label">
              <span className="mdp-required">*</span>会议类型
            </div>
            <div className="mdp-archive-value">{detail.meetingType}</div>
          </div>
          <div className="mdp-archive-row">
            <div className="mdp-archive-label">
              <span className="mdp-required">*</span>密<span className="mdp-label-space" />级
            </div>
            <div className="mdp-archive-value">{detail.secretLevel}</div>
          </div>
          <div className="mdp-archive-row">
            <div className="mdp-archive-label">
              <span className="mdp-required">*</span>会议形式
            </div>
            <div className="mdp-archive-value">{detail.form}</div>
          </div>
          <div className="mdp-archive-row">
            <div className="mdp-archive-label">
              <span className="mdp-required">*</span>会议时间
            </div>
            <div className="mdp-archive-value">{detail.date}</div>
          </div>
          <div className="mdp-archive-row mdp-archive-row--top">
            <div className="mdp-archive-label">
              <span className="mdp-required">*</span>会议通知
            </div>
            <div className="mdp-archive-value">
              <AttachmentUpload
                files={toAttachmentItems([detail.meetingNotice])}
                onChange={() => {}}
                readOnly
              />
            </div>
          </div>
          <div className="mdp-archive-row mdp-archive-row--top">
            <div className="mdp-archive-label">
              <span className="mdp-required">*</span>议案材料
            </div>
            <div className="mdp-archive-value">
              <AttachmentUpload
                files={toAttachmentItems(detail.proposalMaterials)}
                onChange={() => {}}
                readOnly
              />
            </div>
          </div>
          <div className="mdp-archive-row mdp-archive-row--top">
            <div className="mdp-archive-label">
              <span className="mdp-required">*</span>会议决议
            </div>
            <div className="mdp-archive-value">
              <AttachmentUpload
                files={toAttachmentItems([detail.meetingResolution])}
                onChange={() => {}}
                readOnly
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
