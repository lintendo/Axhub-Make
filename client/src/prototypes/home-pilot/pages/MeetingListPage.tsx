/**
 * 会议列表页
 */
import React, { useMemo, useState } from 'react';
import { Search, RotateCcw, Calendar, ArrowUpDown } from 'lucide-react';
import { Pagination } from '../components/PrototypeUI';
import { meetingList, MEETING_CATEGORIES, type MeetingStatus, type MeetingCategory } from '../mock';

export interface MeetingListPageProps {
  onViewDetail: (id: string) => void;
}

const STATUS_OPTIONS: MeetingStatus[] = ['待归档', '审批中', '审批通过', '已归档'];

export function MeetingListPage({ onViewDetail }: MeetingListPageProps) {
  const [category, setCategory] = useState<MeetingCategory | '全部'>('全部');
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<MeetingStatus | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(() => {
    return meetingList.filter((item) => {
      const matchCategory = category === '全部' || item.category === category;
      const matchName = !name || item.name.includes(name);
      const matchStart = !startDate || item.time >= startDate;
      const matchEnd = !endDate || item.time <= `${endDate} 23:59:59`;
      const matchStatus = !status || item.status === status;
      return matchCategory && matchName && matchStart && matchEnd && matchStatus;
    });
  }, [category, name, startDate, endDate, status]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSearch = () => {
    setPage(1);
  };

  const handleReset = () => {
    setCategory('全部');
    setName('');
    setStartDate('');
    setEndDate('');
    setStatus('');
    setPage(1);
  };

  return (
    <>
      {/* 筛选查询区 */}
      <div className="swb-card">
        <div className="mlp-category-tabs">
          <button
            type="button"
            className={`mlp-category-tab${category === '全部' ? ' mlp-category-tab--active' : ''}`}
            onClick={() => {
              setCategory('全部');
              setPage(1);
            }}
          >
            全部
          </button>
          {MEETING_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`mlp-category-tab${category === c ? ' mlp-category-tab--active' : ''}`}
              onClick={() => {
                setCategory(c);
                setPage(1);
              }}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mlp-search-bar mlp-search-bar--inline">
          <div className="mlp-search-fields">
            <div className="mlp-form-item">
              <label className="mlp-form-label">会议名称</label>
              <input
                type="text"
                className="mlp-form-input"
                placeholder="请输入搜索关键词"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="mlp-form-item">
              <label className="mlp-form-label">会议时间</label>
              <div className="mlp-date-range">
                <Calendar size={14} className="mlp-date-range__icon" />
                <input
                  type="date"
                  className="mlp-form-input mlp-form-input--date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <span className="mlp-date-range__divider">-</span>
                <input
                  type="date"
                  className="mlp-form-input mlp-form-input--date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="mlp-form-item">
              <label className="mlp-form-label">状态</label>
              <select
                className="mlp-form-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as MeetingStatus | '')}
              >
                <option value="">请选择</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mlp-search-actions">
            <button type="button" className="swb-btn swb-btn--primary" onClick={handleSearch}>
              <Search size={14} />
              查询
            </button>
            <button type="button" className="swb-btn swb-btn--default" onClick={handleReset}>
              <RotateCcw size={14} />
              重置
            </button>
          </div>
        </div>
      </div>

      {/* 列表区 */}
      <div className="swb-card" style={{ marginTop: 16 }}>
        <div className="swb-table-wrap">
          <table className="swb-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>序号</th>
                <th>会议名称</th>
                <th style={{ width: 120 }}>会议形式</th>
                <th style={{ width: 160 }}>
                  <span className="swb-table__sort">
                    会议时间
                    <ArrowUpDown size={14} />
                  </span>
                </th>
                <th style={{ width: 100 }}>状态</th>
                <th style={{ width: 80 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="swb-table__empty">
                    暂无数据
                  </td>
                </tr>
              ) : (
                pageItems.map((item, idx) => (
                  <tr key={item.id}>
                    <td>{(safePage - 1) * pageSize + idx + 1}</td>
                    <td>
                      <span
                        className="swb-table__name-link"
                        onClick={() => onViewDetail(item.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && onViewDetail(item.id)}
                      >
                        {item.name}
                      </span>
                    </td>
                    <td>{item.form}</td>
                    <td>{item.time}</td>
                    <td>{item.status}</td>
                    <td>
                      <span
                        className="mlp-table-action"
                        onClick={() => onViewDetail(item.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && onViewDetail(item.id)}
                      >
                        编辑
                      </span>
                    </td>
                  </tr>
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
    </>
  );
}
