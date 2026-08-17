/**
 * 调研详情页
 */
import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { AttachmentUpload } from '../components/PrototypeUI';
import {
  getResearchDetail,
  type ResearchApprovalRecord,
  type ResearchAttachment,
  type ResearchChangeRecord,
  type ResearchDetail,
  type ResearchSmsRecord,
} from '../mock';

const TABS = ['基本信息', '流程跟踪', '流程图'] as const;
type TabKey = (typeof TABS)[number];

function parseResearchIdFromHash(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  const rawHash = window.location.hash.replace(/^#/, '');
  return new URLSearchParams(rawHash).get('id') || '';
}

export interface ResearchDetailPageProps {
  id?: string;
  onBack: () => void;
}

export function ResearchDetailPage({ id, onBack }: ResearchDetailPageProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('基本信息');
  const [researchId, setResearchId] = useState<string>(() => id || parseResearchIdFromHash());

  React.useEffect(() => {
    setActiveTab('基本信息');
    setResearchId(id || parseResearchIdFromHash());
    const onHashChange = () => {
      setResearchId(id || parseResearchIdFromHash());
      setActiveTab('基本信息');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [id]);

  const detail = getResearchDetail(researchId);

  if (!detail) {
    return (
      <div className="swb-card rsp-detail-empty">
        <p>未找到调研详情</p>
        <button type="button" className="swb-btn swb-btn--default" onClick={onBack}>
          返回
        </button>
      </div>
    );
  }

  const formatDateRange = (start: string, end: string) => {
    return `${start.replace(/-/g, '/')} - ${end.replace(/-/g, '/').slice(5)}`;
  };

  return (
    <div className="rsp-detail-page">
      {/* 顶部操作栏 */}
      <div className="rsp-detail-header">
        <button type="button" className="mp-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          返回
        </button>
        <h1 className="mp-page-title">调研</h1>
      </div>

      {/* Tab 切换 */}
      <div className="rsp-detail-tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`rsp-detail-tab${activeTab === tab ? ' rsp-detail-tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* 基本信息内容 */}
      {activeTab === '基本信息' && (
        <div className="swb-card rsp-detail-card">
          <div className="rsp-detail-form">
            <DetailRow label="标题" value={detail.title} required />
            <DetailRow label="调研阶段" value={detail.stages.join('、')} required />
            <DetailRow
              label="调研时间"
              value={formatDateRange(detail.startDate, detail.endDate)}
              required
            />
            <DetailRow label="调研地点" value={detail.location} required />
            <DetailRow label="调研人员" value={detail.members} required />
            <DetailFilesRow label="调研安排" files={detail.planFiles} required />
            <DetailFilesRow label="调研材料" files={detail.materialFiles} required />
            <DetailFilesRow label="调研报告" files={detail.reportFiles} required />
          </div>
        </div>
      )}

      {activeTab === '流程跟踪' && detail && (
        <div className="rsp-detail-page rsp-flow-page">
          <FlowSection title="审批记录">
            <table className="swb-table rsp-flow-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>序号</th>
                  <th style={{ width: 120 }}>处理人</th>
                  <th style={{ width: 140 }}>审批节点</th>
                  <th style={{ width: 90 }}>审批结果</th>
                  <th style={{ width: 150 }}>审批时间</th>
                  <th>审批意见</th>
                </tr>
              </thead>
              <tbody>
                {detail.approvalRecords.map((record) => (
                  <ApprovalRow key={record.seq} record={record} />
                ))}
              </tbody>
            </table>
          </FlowSection>

          <FlowSection title="短信发送记录">
            <table className="swb-table rsp-flow-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>序号</th>
                  <th style={{ width: 100 }}>接收人</th>
                  <th style={{ width: 170 }}>发送时间</th>
                  <th style={{ width: 90 }}>发送结果</th>
                  <th>发送内容</th>
                </tr>
              </thead>
              <tbody>
                {detail.smsRecords.map((record) => (
                  <SmsRow key={record.seq} record={record} />
                ))}
              </tbody>
            </table>
          </FlowSection>

          <FlowSection title="变更记录">
            <table className="swb-table rsp-flow-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>序号</th>
                  <th style={{ width: 140 }}>处理人</th>
                  <th style={{ width: 100 }}>状态</th>
                  <th style={{ width: 170 }}>变更时间</th>
                </tr>
              </thead>
              <tbody>
                {detail.changeRecords.map((record) => (
                  <ChangeRow key={record.seq} record={record} />
                ))}
              </tbody>
            </table>
          </FlowSection>
        </div>
      )}

      {activeTab === '流程图' && (
        <div className="swb-card rsp-detail-card rsp-detail-placeholder">
          暂无流程图
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, required }: { label: string; value: string; required?: boolean }) {
  return (
    <div className="rsp-detail-row">
      <div className={`rsp-detail-label${required ? ' rsp-detail-label--required' : ''}`}>
        {label}
      </div>
      <div className="rsp-detail-value">{value}</div>
    </div>
  );
}

function DetailFilesRow({
  label,
  files,
  required,
}: {
  label: string;
  files: ResearchAttachment[];
  required?: boolean;
}) {
  return (
    <div className="rsp-detail-row rsp-detail-row--top">
      <div className={`rsp-detail-label${required ? ' rsp-detail-label--required' : ''}`}>
        {label}
      </div>
      <div className="rsp-detail-value">
        <AttachmentUpload
          files={files.map((f) => ({ id: f.id, name: f.name, type: f.type }))}
          onChange={() => {}}
          readOnly
        />
      </div>
    </div>
  );
}

function FlowSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="swb-card rsp-flow-section">
      <div className="rsp-flow-section__title">{title}</div>
      {children}
    </div>
  );
}

function ApprovalRow({ record }: { record: ResearchApprovalRecord }) {
  return (
    <tr>
      <td>{record.seq}</td>
      <td>{record.handler}</td>
      <td>{record.node}</td>
      <td>{record.result}</td>
      <td>{record.time}</td>
      <td>{record.opinion}</td>
    </tr>
  );
}

function SmsRow({ record }: { record: ResearchSmsRecord }) {
  return (
    <tr>
      <td>{record.seq}</td>
      <td>{record.receiver}</td>
      <td>{record.sendTime}</td>
      <td>
        <span className={record.result === '成功' ? 'rsp-result-success' : 'rsp-result-fail'}>
          {record.result}
        </span>
      </td>
      <td>{record.content}</td>
    </tr>
  );
}

function ChangeRow({ record }: { record: ResearchChangeRecord }) {
  return (
    <tr>
      <td>{record.seq}</td>
      <td>{record.handler}</td>
      <td>{record.status}</td>
      <td>{record.changeTime}</td>
    </tr>
  );
}
