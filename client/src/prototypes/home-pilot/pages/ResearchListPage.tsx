/**
 * 调研列表页
 */
import React, { useMemo, useState } from 'react';
import { Pagination } from '../components/PrototypeUI';
import { researchList, type ResearchListItem } from '../mock';

export interface ResearchListPageProps {
  onViewDetail: (id: string) => void;
}

export function ResearchListPage({ onViewDetail }: ResearchListPageProps) {
  const [keyword, setKeyword] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(() => {
    return researchList.filter((item) => {
      const matchKeyword = !keyword || item.title.includes(keyword);
      const matchStart = !startDate || item.startDate >= startDate;
      const matchEnd = !endDate || item.endDate <= endDate;
      return matchKeyword && matchStart && matchEnd;
    });
  }, [keyword, startDate, endDate]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSearch = () => {
    setPage(1);
  };

  const handleReset = () => {
    setKeyword('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const formatDateRange = (start: string, end: string) => {
    const startText = start.replace(/-/g, '/');
    const endText = end.replace(/-/g, '/');
    return `${startText} - ${endText.slice(5)}`;
  };

  return (
    <div className="rsp-page">
      {/* 筛选查询区 */}
      <div className="swb-card">
        <div className="rsp-search-bar">
          <div className="rsp-search-fields">
            <div className="rsp-search-field">
              <label className="rsp-search-label">关键词</label>
              <input
                type="text"
                className="swb-input rsp-keyword-input"
                placeholder="请输入搜索关键词"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <div className="rsp-search-field">
              <label className="rsp-search-label">调研时间</label>
              <div className="swb-date-range">
                <input
                  type="date"
                  className="swb-input swb-date-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <span className="rsp-date-separator">-</span>
                <input
                  type="date"
                  className="swb-input swb-date-input"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="rsp-search-actions">
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
          <table className="swb-table rsp-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>序号</th>
                <th>标题</th>
                <th style={{ width: 160 }}>调研地点</th>
                <th style={{ width: 260 }}>调研人员</th>
                <th style={{ width: 140 }}>调研时间</th>
                <th style={{ width: 80 }}>状态</th>
                <th style={{ width: 80 }}>操作</th>
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
                  <ResearchRow
                    key={item.id}
                    item={item}
                    index={(safePage - 1) * pageSize + idx + 1}
                    dateRange={formatDateRange(item.startDate, item.endDate)}
                    onView={() => onViewDetail(item.id)}
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

function ResearchRow({
  item,
  index,
  dateRange,
  onView,
}: {
  item: ResearchListItem;
  index: number;
  dateRange: string;
  onView: () => void;
}) {
  return (
    <tr>
      <td>{index}</td>
      <td>
        <span
          className="swb-table__name-link"
          onClick={onView}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onView()}
        >
          {item.title}
        </span>
      </td>
      <td>{item.location}</td>
      <td>{item.members}</td>
      <td>{dateRange}</td>
      <td>{item.status}</td>
      <td>
        <span className="rsp-view-link" onClick={onView}>
          查看
        </span>
      </td>
    </tr>
  );
}
