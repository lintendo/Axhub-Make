/**
 * 信息详情页：顶部横向 tab（基本信息 / 流程跟踪 / 流程图）。
 * 基本信息：字段卡 + 多记录表（各带独立分页）。
 * 流程跟踪：多组记录表。
 * 流程图：「暂无流程」空状态。
 */
import React, { useState } from 'react';
import { ArrowLeft, FileX } from 'lucide-react';
import {
  AttachmentUpload,
  StatusTag,
  RecordTable,
  type RecordColumn,
} from '../components/PrototypeUI';
import type { InfoDetail } from '../mock';

type DetailTab = 'base' | 'trace' | 'flow';

export interface InfoDetailPageProps {
  detail: InfoDetail;
  onBack: () => void;
}

const TABS: Array<{ key: DetailTab; label: string }> = [
  { key: 'base', label: '基本信息' },
  { key: 'trace', label: '流程跟踪' },
  { key: 'flow', label: '流程图' },
];

export function InfoDetailPage({ detail, onBack }: InfoDetailPageProps) {
  const [tab, setTab] = useState<DetailTab>('base');
  return (
    <div className="swb-card">
      <div className="ip-detail-header">
        <button type="button" className="ip-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          返回
        </button>
        <span className="ip-detail-title">信息</span>
      </div>
      <div className="ip-detail-tabs-horizontal">
        {TABS.map((t) => (
          <div
            key={t.key}
            className={`ip-detail-tab-h${tab === t.key ? ' ip-detail-tab-h--active' : ''}`}
            onClick={() => setTab(t.key)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setTab(t.key);
              }
            }}
          >
            {t.label}
          </div>
        ))}
      </div>
      {tab === 'base' && <BaseInfo detail={detail} />}
      {tab === 'trace' && <TraceContent detail={detail} />}
      {tab === 'flow' && <FlowChart />}
    </div>
  );
}

function BaseInfo({ detail }: { detail: InfoDetail }) {
  return (
    <div className="ip-detail-pane">
      <div className="ip-info-form">
        <div className="ip-info-row">
          <div className="ip-info-label-required">名称</div>
          <div className="ip-info-value">{detail.name}</div>
        </div>
        <div className="ip-info-row">
          <div className="ip-info-label-required">类别</div>
          <div className="ip-info-value">{detail.category}</div>
        </div>
        <div className="ip-info-row">
          <div className="ip-info-label-required">密级</div>
          <div className="ip-info-value">{detail.secretLevel}</div>
        </div>
        <div className="ip-info-row">
          <div className="ip-info-label-required">日期</div>
          <div className="ip-info-value">{detail.date}</div>
        </div>
        <div className="ip-info-row">
          <div className="ip-info-label-required">附件</div>
          <div className="ip-info-value">
            <AttachmentUpload
              files={detail.attachments.map((att) => ({
                id: String(att.id),
                name: att.name,
                type: att.type,
              }))}
              onChange={() => {}}
              readOnly
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TraceContent({ detail }: { detail: InfoDetail }) {
  const approvalColumns: RecordColumn[] = [
    { key: 'id', label: '序号', width: 60 },
    { key: 'handler', label: '处理人', width: 100 },
    { key: 'node', label: '审批节点', width: 120 },
    { key: 'result', label: '审批结果', width: 150, render: (row) => <StatusTag text={String(row.result)} kind="approve" /> },
    { key: 'time', label: '审批时间', width: 160 },
    { key: 'opinion', label: '审批意见' },
  ];
  const directorColumns: RecordColumn[] = [
    { key: 'id', label: '序号', width: 60 },
    { key: 'handler', label: '处理人', width: 100 },
    { key: 'node', label: '审批节点', width: 120 },
    { key: 'result', label: '审批结果', width: 150, render: (row) => <StatusTag text={String(row.result)} kind="approve" /> },
    { key: 'time', label: '审批时间', width: 160 },
    { key: 'opinion', label: '审批意见' },
  ];
  const smsColumns: RecordColumn[] = [
    { key: 'id', label: '序号', width: 60 },
    { key: 'time', label: '发送时间', width: 140 },
    { key: 'receiver', label: '接收人', width: 120 },
    { key: 'result', label: '发送结果', width: 100, render: (row) => <StatusTag text={String(row.result)} kind="send" /> },
    { key: 'content', label: '发送内容' },
  ];
  const mailColumns: RecordColumn[] = [
    { key: 'id', label: '序号', width: 60 },
    { key: 'time', label: '发送时间', width: 140 },
    { key: 'receiver', label: '接收人', width: 120 },
    { key: 'result', label: '发送结果', width: 100, render: (row) => <StatusTag text={String(row.result)} kind="send" /> },
    { key: 'content', label: '发送内容' },
  ];
  const viewColumns: RecordColumn[] = [
    { key: 'id', label: '序号', width: 60 },
    { key: 'text', label: '浏览记录' },
  ];

  return (
    <div className="ip-detail-pane">
      <h3 className="ip-section-title">审批记录</h3>
      <RecordTable columns={approvalColumns} rows={detail.approvals as unknown as Array<Record<string, unknown>>} />

      <h3 className="ip-section-title">外部董事批阅记录</h3>
      <RecordTable columns={directorColumns} rows={detail.externalDirectorRecords as unknown as Array<Record<string, unknown>>} />

      <h3 className="ip-section-title">职工董事批阅记录</h3>
      <RecordTable columns={directorColumns} rows={detail.employeeDirectorRecords as unknown as Array<Record<string, unknown>>} />

      <h3 className="ip-section-title">浏览记录</h3>
      <RecordTable columns={viewColumns} rows={detail.viewRecords as unknown as Array<Record<string, unknown>>} />

      <h3 className="ip-section-title">短信发送记录</h3>
      <RecordTable columns={smsColumns} rows={detail.smsRecords as unknown as Array<Record<string, unknown>>} />

      <h3 className="ip-section-title">邮件发送记录</h3>
      <RecordTable columns={mailColumns} rows={detail.mailRecords as unknown as Array<Record<string, unknown>>} />
    </div>
  );
}

function FlowChart() {
  return (
    <div className="ip-detail-pane">
      <div className="swb-empty-state">
        <FileX size={64} color="var(--swb-subtle)" strokeWidth={1.2} />
        暂无流程
      </div>
    </div>
  );
}
