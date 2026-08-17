/**
 * 任务详情三页签：基本信息 / 流程跟踪 / 流程图
 */
import React, { useState } from 'react';
import { AttachmentUpload } from '../../../components/PrototypeUI';
import {
  APPROVAL_RECORDS,
  INTERNAL_CIRCULATION_RECORDS,
  EXTERNAL_CIRCULATION_RECORDS,
  EMPLOYEE_CIRCULATION_RECORDS,
  ATTACHMENT_UPDATE_RECORDS,
  type SignTask,
} from '../../../sign-mock';
import { TaskDetailPanel } from './TaskDetailPanel';

type TabKey = 'basic' | 'tracking' | 'flow';
export type CirculationCategory = 'internal' | 'external' | 'employee';

interface TaskDetailTabsProps {
  task: SignTask;
  visibleCategories?: CirculationCategory[];
}

const CATEGORIES: { key: CirculationCategory; label: string }[] = [
  { key: 'internal', label: '内部董事' },
  { key: 'external', label: '外部董事' },
  { key: 'employee', label: '职工董事' },
];

const CIRCULATION_MAP: Record<CirculationCategory, typeof INTERNAL_CIRCULATION_RECORDS> = {
  internal: INTERNAL_CIRCULATION_RECORDS,
  external: EXTERNAL_CIRCULATION_RECORDS,
  employee: EMPLOYEE_CIRCULATION_RECORDS,
};

export function TaskDetailTabs({ task, visibleCategories }: TaskDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('basic');

  const showSignedAttachment = task.status === '已完成' || task.status === '已结束';
  const showAllCategories = !visibleCategories || visibleCategories.length === 0;
  const visibleSet = new Set(showAllCategories ? CATEGORIES.map((c) => c.key) : visibleCategories);

  return (
    <>
      <div className="ds-tabs">
        <button
          type="button"
          className={`ds-tab${activeTab === 'basic' ? ' ds-tab--active' : ''}`}
          onClick={() => setActiveTab('basic')}
        >
          基本信息
        </button>
        <button
          type="button"
          className={`ds-tab${activeTab === 'tracking' ? ' ds-tab--active' : ''}`}
          onClick={() => setActiveTab('tracking')}
        >
          流程跟踪
        </button>
        <button
          type="button"
          className={`ds-tab${activeTab === 'flow' ? ' ds-tab--active' : ''}`}
          onClick={() => setActiveTab('flow')}
        >
          流程图
        </button>
      </div>

      {activeTab === 'basic' && (
        <>
          <TaskDetailPanel task={task} />
          {showSignedAttachment && (
            <div className="ds-card">
              <h3 className="ds-section-title">签字附件</h3>
              <AttachmentUpload
                files={task.attachments.map((a) => {
                  const signedName = a.name.endsWith('.docx')
                    ? a.name.replace(/\.docx$/, '（已签字）.docx')
                    : `${a.name}（已签字）`;
                  return {
                    id: a.id,
                    name: signedName,
                    type: a.name.split('.').pop()?.toLowerCase() === 'pdf' ? 'pdf' : 'docx',
                    size: a.size,
                  };
                })}
                onChange={() => {}}
                readOnly
              />
            </div>
          )}
        </>
      )}

      {activeTab === 'tracking' && (
        <>
          <div className="ds-card">
            <h3 className="ds-section-title">审批记录</h3>
            <div className="swb-table-wrap">
              <table className="swb-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>序号</th>
                    <th>审批节点</th>
                    <th>处理人</th>
                    <th>审批时间</th>
                    <th>审批结果</th>
                    <th>审批意见</th>
                  </tr>
                </thead>
                <tbody>
                  {APPROVAL_RECORDS.map((record, idx) => (
                    <tr key={record.id}>
                      <td>{idx + 1}</td>
                      <td>{record.node}</td>
                      <td>{record.handler}</td>
                      <td>{record.time}</td>
                      <td>{record.result}</td>
                      <td>{record.opinion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {CATEGORIES.filter((c) => visibleSet.has(c.key)).map((category) => {
            const records = CIRCULATION_MAP[category.key];
            return (
              <div className="ds-card" key={category.key}>
                <h3 className="ds-section-title">{category.label}流转记录</h3>
                <div className="swb-table-wrap">
                  <table className="swb-table">
                    <thead>
                      <tr>
                        <th style={{ width: 60 }}>序号</th>
                        <th>办理节点</th>
                        <th>处理人</th>
                        <th>办理时间</th>
                        <th>办理结果</th>
                        <th>意见</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="swb-table__empty">
                            暂无记录
                          </td>
                        </tr>
                      ) : (
                        records.map((record, idx) => (
                          <tr key={record.id}>
                            <td>{idx + 1}</td>
                            <td>{record.node}</td>
                            <td>{record.handler}</td>
                            <td>{record.time}</td>
                            <td>{record.result}</td>
                            <td>{record.opinion}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          <div className="ds-card">
            <h3 className="ds-section-title">附件更新记录</h3>
            <div className="swb-table-wrap">
              <table className="swb-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>序号</th>
                    <th>更新时间</th>
                    <th>更新人</th>
                    <th>本版本附件</th>
                  </tr>
                </thead>
                <tbody>
                  {ATTACHMENT_UPDATE_RECORDS.map((record, idx) => (
                    <tr key={record.id}>
                      <td>{idx + 1}</td>
                      <td>{record.time}</td>
                      <td>{record.updater}</td>
                      <td>{record.attachments.join('、')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'flow' && (
        <div className="ds-card">
          <h3 className="ds-section-title">流程图</h3>
          <div className="ds-flow-chart">
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: '100%',
                  maxWidth: 720,
                  height: 160,
                  background: '#F2F3F5',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#909399',
                  fontSize: 14,
                  margin: '0 auto',
                }}
              >
                董事签字流程图占位图片
              </div>
              <div style={{ marginTop: 12, color: '#0A6EFA' }}>当前节点：{task.currentNode}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
