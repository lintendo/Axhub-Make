/**
 * 董事签署页
 */
import React, { useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { getSignTask, getDirectorName } from '../../sign-mock';
import { todoList } from '../../mock';
import { SuccessTip } from '../../components/SuccessTip';
import { SubmitSidebar } from './components/SubmitSidebar';
import { TaskDetailTabs, type CirculationCategory } from './components/TaskDetailTabs';

export interface SignBoardPageProps {
  taskId: string;
  onBack: () => void;
}

const ROLE_CATEGORY_MAP: Record<string, CirculationCategory> = {
  内部董事: 'internal',
  外部董事: 'external',
  职工董事: 'employee',
};

export function SignBoardPage({ taskId, onBack }: SignBoardPageProps) {
  const task = getSignTask(taskId);
  const [comment, setComment] = useState('');
  const [reminder, setReminder] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [showDelegateModal, setShowDelegateModal] = useState(
    !!task?.delegation && task.delegation.delegateId === 'd-012',
  );
  const [delegateAccepted, setDelegateAccepted] = useState<boolean | null>(null);

  if (!task) {
    return (
      <div className="ds-card">
        <p>未找到任务</p>
        <button type="button" className="ds-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          返回
        </button>
      </div>
    );
  }

  const isDelegate = !!task.delegation && task.delegation.delegateId === 'd-012';
  const delegatorName = task.delegation ? getDirectorName(task.delegation.delegatorId) : '';

  const todo = todoList.find((t) => t.taskId === taskId && t.node === 'sign');
  const visibleCategories: CirculationCategory[] | undefined = todo?.role
    ? [ROLE_CATEGORY_MAP[todo.role]].filter(Boolean) as CirculationCategory[]
    : undefined;

  const toggleReminder = (value: string) => {
    setReminder((prev) => {
      const set = new Set(prev);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return Array.from(set);
    });
  };

  const handleSubmit = () => {
    if (isDelegate && delegateAccepted === null) {
      setShowDelegateModal(true);
      return;
    }
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2000);
  };

  const handleDelegateConfirm = (accepted: boolean) => {
    setDelegateAccepted(accepted);
    setShowDelegateModal(false);
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2000);
  };

  return (
    <>
      <SuccessTip visible={submitted} icon={<Check size={18} />} message="签署成功" />
      <div className="ds-page-header">
        <button type="button" className="ds-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          返回
        </button>
        <h1 className="ds-page-title">董事签署</h1>
      </div>

      <div className="ds-form-layout">
        <div className="ds-form-main">
          <TaskDetailTabs task={task} visibleCategories={visibleCategories} />

          {isDelegate && delegateAccepted !== null && (
            <div className="ds-card">
              <h3 className="ds-section-title">代签确认</h3>
              <div style={{ fontSize: 14, color: delegateAccepted ? '#529B2C' : '#B88230' }}>
                {delegateAccepted
                  ? `您已同意受${delegatorName}委托一并签字，系统将自动覆盖委托人签字位置。`
                  : `您已拒绝受${delegatorName}委托代签，仅签署本人位置。`}
              </div>
            </div>
          )}
        </div>

        <SubmitSidebar
          opinion={comment}
          onOpinionChange={setComment}
          reminder={reminder}
          onToggleReminder={toggleReminder}
          onSubmit={handleSubmit}
          onCancel={onBack}
          submitText="完成"
          cancelText="返回"
        >
          <div style={{ fontSize: 13, color: '#909399', lineHeight: 1.6 }}>
            签署后，系统将把您在工商系统备案的签名自动添加到 Word 文档对应签字位置。
          </div>
        </SubmitSidebar>
      </div>

      {showDelegateModal && (
        <div className="ds-modal-mask">
          <div className="ds-modal">
            <h3 className="ds-modal-title">代签确认</h3>
            <div className="ds-modal-body">
              您此次受<strong>{delegatorName}</strong>董事委托代为出席和表决，是否同意一并签字？
              <br />
              同意：受托人签 1 次覆盖委托人位置，委托人位置显示“受托人（代）”。
              <br />
              拒绝：受托人仅签本人位置。
            </div>
            <div className="ds-modal-actions">
              <button
                type="button"
                className="swb-btn swb-btn--default"
                onClick={() => handleDelegateConfirm(false)}
              >
                拒绝
              </button>
              <button
                type="button"
                className="swb-btn swb-btn--primary"
                onClick={() => handleDelegateConfirm(true)}
              >
                同意
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
