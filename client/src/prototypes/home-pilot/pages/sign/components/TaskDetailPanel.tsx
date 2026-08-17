/**
 * 任务基本信息面板
 */
import React from 'react';
import { AttachmentUpload } from '../../../components/PrototypeUI';
import { getDirectorName, type SignTask } from '../../../sign-mock';

export interface TaskDetailPanelProps {
  task: SignTask;
}

export function TaskDetailPanel({ task }: TaskDetailPanelProps) {
  return (
    <div className="swb-card rsp-detail-card">
      <div className="rsp-detail-form">
        <DetailRow label="标题" value={task.title} />
        <DetailRow label="会议类型" value={task.meetingTypes.join('、')} />
        <DetailRow label="签字文件" value={task.signFiles.join('、')} />
        <DetailFilesRow label="附件" files={task.attachments} />
        {task.hasDelegation && task.delegation && (
          <DetailRow
            label="代为表决"
            value={`${task.delegation.directorType} · ${getDirectorName(task.delegation.delegatorId)} 委托 ${getDirectorName(
              task.delegation.delegateId,
            )} 代签`}
          />
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rsp-detail-row">
      <div className="rsp-detail-label">{label}</div>
      <div className="rsp-detail-value">{value}</div>
    </div>
  );
}

function DetailFilesRow({ label, files }: { label: string; files: { id: string; name: string; size?: string }[] }) {
  return (
    <div className="rsp-detail-row rsp-detail-row--top">
      <div className="rsp-detail-label">{label}</div>
      <div className="rsp-detail-value">
        <AttachmentUpload
          files={files.map((a) => ({
            id: a.id,
            name: a.name,
            type: a.name.split('.').pop()?.toLowerCase() === 'pdf' ? 'pdf' : 'docx',
            size: a.size,
          }))}
          onChange={() => {}}
          readOnly
        />
      </div>
    </div>
  );
}
