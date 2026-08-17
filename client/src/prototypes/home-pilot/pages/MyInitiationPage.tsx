/**
 * 我的发起页
 */
import React, { useMemo, useState } from 'react';
import { Pagination } from '../components/PrototypeUI';
import {
  myInitiationList,
  MY_INITIATION_TASK_TYPES,
  MY_INITIATION_STATUSES,
  type MyInitiationItem,
  type MyInitiationStatus,
  type MyInitiationTaskType,
} from '../mock';

const ALL_TYPE: MyInitiationTaskType | '全部' = '全部';
const ALL_STATUS: MyInitiationStatus | '全部' = '全部';

export interface MyInitiationPageProps {
  onViewDetail?: (id: string) => void;
  onViewSignDetail?: (taskId: string) => void;
  onEditSign?: (taskId: string) => void;
}

export function MyInitiationPage({
  onViewDetail = () => {},
  onViewSignDetail,
  onEditSign,
}: MyInitiationPageProps) {
  const [nameInput, setNameInput] = useState('');
  const [typeInput, setTypeInput] = useState<MyInitiationTaskType | '全部'>(ALL_TYPE);
  const [statusInput, setStatusInput] = useState<MyInitiationStatus | '全部'>(ALL_STATUS);
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');

  const [appliedName, setAppliedName] = useState('');
  const [appliedType, setAppliedType] = useState<MyInitiationTaskType | '全部'>(ALL_TYPE);
  const [appliedStatus, setAppliedStatus] = useState<MyInitiationStatus | '全部'>(ALL_STATUS);
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(() => {
    return myInitiationList.filter((item) => {
      const matchName = !appliedName || item.name.includes(appliedName);
      const matchType = appliedType === ALL_TYPE || item.taskType === appliedType;
      const matchStatus = appliedStatus === ALL_STATUS || item.status === appliedStatus;
      const createDate = item.createTime.replace(/\//g, '-');
      const matchStart = !appliedStartDate || createDate >= appliedStartDate;
      const matchEnd = !appliedEndDate || createDate <= appliedEndDate;
      return matchName && matchType && matchStatus && matchStart && matchEnd;
    });
  }, [appliedName, appliedType, appliedStatus, appliedStartDate, appliedEndDate]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSearch = () => {
    setAppliedName(nameInput);
    setAppliedType(typeInput);
    setAppliedStatus(statusInput);
    setAppliedStartDate(startDateInput);
    setAppliedEndDate(endDateInput);
    setPage(1);
  };

  const handleReset = () => {
    setNameInput('');
    setTypeInput(ALL_TYPE);
    setStatusInput(ALL_STATUS);
    setStartDateInput('');
    setEndDateInput('');
    setAppliedName('');
    setAppliedType(ALL_TYPE);
    setAppliedStatus(ALL_STATUS);
    setAppliedStartDate('');
    setAppliedEndDate('');
    setPage(1);
  };

  return (
    <div className="mip-page">
      {/* 筛选查询区 */}
      <div className="swb-card">
        <div className="mip-search-bar">
          <div className="mip-search-fields">
            <div className="mip-search-field">
              <label className="mip-search-label">任务名称</label>
              <input
                type="text"
                className="swb-input mip-name-input"
                placeholder="请输入任务名称"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div className="mip-search-field">
              <label className="mip-search-label">任务类型</label>
              <select
                className="swb-select mip-select"
                value={typeInput}
                onChange={(e) => setTypeInput(e.target.value as MyInitiationTaskType | '全部')}
              >
                <option value="全部">请选择</option>
                {MY_INITIATION_TASK_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="mip-search-field">
              <label className="mip-search-label">状态</label>
              <select
                className="swb-select mip-select"
                value={statusInput}
                onChange={(e) => setStatusInput(e.target.value as MyInitiationStatus | '全部')}
              >
                <option value="全部">请选择</option>
                {MY_INITIATION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <div className="mip-search-field">
              <label className="mip-search-label">创建时间</label>
              <div className="swb-date-range">
                <input
                  type="date"
                  className="swb-input swb-date-input"
                  value={startDateInput}
                  onChange={(e) => setStartDateInput(e.target.value)}
                />
                <span className="mip-date-separator">—</span>
                <input
                  type="date"
                  className="swb-input swb-date-input"
                  value={endDateInput}
                  onChange={(e) => setEndDateInput(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="mip-search-actions">
            <button type="button" className="swb-btn swb-btn--primary" onClick={handleSearch}>
              查询
            </button>
            <button type="button" className="swb-btn swb-btn--default" onClick={handleReset}>
              重置
            </button>
          </div>
        </div>
      </div>

      {/* 列表区 */}
      <div className="swb-card" style={{ marginTop: 16 }}>
        <div className="swb-table-wrap">
          <table className="swb-table mip-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>序号</th>
                <th>任务名称</th>
                <th style={{ width: 120 }}>任务类型</th>
                <th style={{ width: 120 }}>创建时间</th>
                <th style={{ width: 100 }}>状态</th>
                <th style={{ width: 120 }}>当前办理人</th>
                <th style={{ width: 140 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="swb-table__empty">
                    暂无数据
                  </td>
                </tr>
              ) : (
                pageItems.map((item, idx) => (
                    <MyInitiationRow
                      key={item.id}
                      item={item}
                      index={(safePage - 1) * pageSize + idx + 1}
                      onViewDetail={onViewDetail}
                      onViewSignDetail={onViewSignDetail}
                      onEditSign={onEditSign}
                    />
                  ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          total={total}
          page={safePage}
          pageSize={pageSize}
          onChange={(nextPage, nextSize) => {
            setPage(nextPage);
            setPageSize(nextSize);
          }}
        />
      </div>
    </div>
  );
}

function MyInitiationRow({
  item,
  index,
  onViewDetail,
  onViewSignDetail,
  onEditSign,
}: {
  item: MyInitiationItem;
  index: number;
  onViewDetail: (id: string) => void;
  onViewSignDetail?: (taskId: string) => void;
  onEditSign?: (taskId: string) => void;
}) {
  const isSign = item.taskType === '董事签字';

  const handleTitleClick = () => {
    if (isSign && item.taskId) {
      onViewSignDetail?.(item.taskId);
      return;
    }
    onViewDetail(item.id);
  };

  return (
    <tr>
      <td>{index}</td>
      <td>
        <span className="swb-table__name-link" onClick={handleTitleClick}>
          {item.name}
        </span>
      </td>
      <td>{item.taskType}</td>
      <td>{item.createTime}</td>
      <td>{item.status}</td>
      <td>{item.currentHandler}</td>
      <td>
        <MyInitiationActions item={item} onViewSignDetail={onViewSignDetail} onEditSign={onEditSign} />
      </td>
    </tr>
  );
}

function MyInitiationActions({
  item,
  onViewSignDetail,
  onEditSign,
}: {
  item: MyInitiationItem;
  onViewSignDetail?: (taskId: string) => void;
  onEditSign?: (taskId: string) => void;
}) {
  const isSign = item.taskType === '董事签字';

  if (isSign && item.taskId) {
    return (
      <div className="mip-action-group">
        <button
          type="button"
          className="mip-action-link"
          onClick={() => onViewSignDetail?.(item.taskId!)}
        >
          查看
        </button>
        {item.status === '已驳回' && (
          <button
            type="button"
            className="mip-action-link"
            onClick={() => onEditSign?.(item.taskId!)}
          >
            修改
          </button>
        )}
      </div>
    );
  }

  if (item.status === '待归档') {
    return (
      <div className="mip-action-group">
        <button type="button" className="mip-action-link">
          编辑
        </button>
        <button type="button" className="mip-action-link mip-action-link--danger">
          删除
        </button>
        <button type="button" className="mip-action-link">
          归档
        </button>
      </div>
    );
  }

  return (
    <button type="button" className="mip-action-link">
      变更
    </button>
  );
}
