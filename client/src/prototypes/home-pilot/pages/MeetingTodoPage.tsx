/**
 * 首页内嵌：会议发起待办审批页
 */
import React, { useState } from 'react';
import { ArrowLeft, Check, X } from 'lucide-react';
import { AttachmentUpload } from '../components/PrototypeUI';
import { SuccessTip } from '../components/SuccessTip';
import {
  meetingDetail,
  meetingApprovalRecords,
  meetingTodoList,
  type MeetingTodoItem,
} from '../mock';

export interface MeetingTodoPageProps {
  onBack: () => void;
}

export function MeetingTodoPage({ onBack }: MeetingTodoPageProps) {
  const [selected, setSelected] = useState<MeetingTodoItem | null>(null);
  const [result, setResult] = useState<'同意' | '驳回'>('同意');
  const [comment, setComment] = useState('');
  const [reminder, setReminder] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const detail = selected ? meetingDetail : null;

  const toggleReminder = (value: string) => {
    setReminder((prev) => {
      const set = new Set(prev);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return Array.from(set);
    });
  };

  const handleSubmit = () => {
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2000);
  };

  return (
    <>
      <div className="mp-page-header">
        <button type="button" className="mp-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          返回工作台
        </button>
        <h1 className="mp-page-title">会议发起待办审批</h1>
      </div>

      {!selected ? (
        <div className="swb-card">
          <h3 className="mp-section-title">待办列表</h3>
          <div className="swb-table-wrap">
            <table className="swb-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>序号</th>
                  <th>会议名称</th>
                  <th style={{ width: 140 }}>会议形式</th>
                  <th style={{ width: 180 }}>会议时间</th>
                  <th style={{ width: 120 }}>状态</th>
                  <th style={{ width: 120 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {meetingTodoList.map((item, idx) => (
                  <tr key={item.id}>
                    <td>{idx + 1}</td>
                    <td>{item.name}</td>
                    <td>{item.form}</td>
                    <td>{item.time}</td>
                    <td>{item.status}</td>
                    <td>
                      <button type="button" className="swb-btn swb-btn--text" onClick={() => setSelected(item)}>
                        审批
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
          <div className="swb-card">
            <h3 className="mp-section-title">会议信息</h3>
            <div className="mp-detail-table">
              <div className="mp-detail-row">
                <div className="mp-detail-label">文件名：</div>
                <div className="mp-detail-value">{detail?.title}</div>
              </div>
              <div className="mp-detail-row">
                <div className="mp-detail-label">密级：</div>
                <div className="mp-detail-value">{detail?.secretLevel}</div>
              </div>
              <div className="mp-detail-row">
                <div className="mp-detail-label">会议类型：</div>
                <div className="mp-detail-value">{detail?.meetingType}</div>
              </div>
              <div className="mp-detail-row">
                <div className="mp-detail-label">日期：</div>
                <div className="mp-detail-value">{detail?.date}</div>
              </div>
              <div className="mp-detail-row">
                <div className="mp-detail-label">情况简述：</div>
                <div className="mp-detail-value">{detail?.description}</div>
              </div>
              <div className="mp-detail-row mp-detail-row--top">
                <div className="mp-detail-label">附件：</div>
                <div className="mp-detail-value">
                  <AttachmentUpload
                    files={(detail?.attachments ?? []).map((name, idx) => ({
                      id: `att-${idx}`,
                      name,
                      type: name.split('.').pop()?.toLowerCase() === 'pdf' ? 'pdf' : 'docx',
                    }))}
                    onChange={() => {}}
                    readOnly
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="swb-card" style={{ marginTop: 16 }}>
            <h3 className="mp-section-title">1、填写意见</h3>
            <div className="mp-form-field mp-form-field--full">
              <label className="mp-form-label mp-form-label--required">审批结果：</label>
              <div className="mp-radio-group">
                <label className="mp-radio">
                  <input
                    type="radio"
                    name="approveResult"
                    value="同意"
                    checked={result === '同意'}
                    onChange={() => setResult('同意')}
                  />
                  <span>同意</span>
                </label>
                <label className="mp-radio">
                  <input
                    type="radio"
                    name="approveResult"
                    value="驳回"
                    checked={result === '驳回'}
                    onChange={() => setResult('驳回')}
                  />
                  <span>驳回</span>
                </label>
              </div>
            </div>
            <div className="mp-form-field mp-form-field--full">
              <label className="mp-form-label">审批意见：</label>
              <textarea
                className="mp-form-textarea"
                rows={4}
                placeholder="请输入审批意见"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          </div>

          <div className="swb-card" style={{ marginTop: 16 }}>
            <h3 className="mp-section-title">2、提交流程</h3>
            <div className="mp-form-field mp-form-field--full">
              <label className="mp-form-label">提醒方式：</label>
              <div className="mp-checkbox-group">
                {['手机', '邮件'].map((type) => (
                  <label key={type} className="mp-checkbox">
                    <input
                      type="checkbox"
                      value={type}
                      checked={reminder.includes(type)}
                      onChange={() => toggleReminder(type)}
                    />
                    <span>{type}</span>
                  </label>
                ))}
              </div>
            </div>

            <SuccessTip
              visible={submitted}
              type={result === '驳回' ? 'error' : 'success'}
              icon={result === '同意' ? <Check size={18} /> : <X size={18} />}
              message={result === '同意' ? '审批通过' : '已驳回'}
            />

            <div className="mp-form-actions">
              <button type="button" className="swb-btn swb-btn--default" onClick={() => setSelected(null)}>
                返回列表
              </button>
              <button type="button" className="swb-btn swb-btn--primary" onClick={handleSubmit}>
                <Check size={14} style={{ marginRight: 6 }} />
                提交
              </button>
            </div>
          </div>

          <div className="swb-card" style={{ marginTop: 16 }}>
            <h3 className="mp-section-title">审批记录</h3>
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
                  {meetingApprovalRecords.map((record, idx) => (
                    <tr key={record.id}>
                      <td>{idx + 1}</td>
                      <td>{record.node}</td>
                      <td>{record.handler}</td>
                      <td>{record.time}</td>
                      <td>{record.result}</td>
                      <td>{record.comment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
