/**
 * 制度列表页
 */
import React, { useMemo, useState } from 'react';
import { Pagination } from '../components/PrototypeUI';
import {
  regulationList,
  REGULATION_CATEGORIES,
  type RegulationCategory,
  type RegulationItem,
} from '../mock';

export function RegulationPage() {
  const [activeCategory, setActiveCategory] = useState<RegulationCategory>('全部');
  const [nameQuery, setNameQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(() => {
    return regulationList.filter((item) => {
      const matchCategory = activeCategory === '全部' || item.category === activeCategory;
      const matchName = !nameQuery || item.name.includes(nameQuery);
      const matchStart = !startDate || item.issueDate >= startDate;
      const matchEnd = !endDate || item.issueDate <= endDate;
      return matchCategory && matchName && matchStart && matchEnd;
    });
  }, [activeCategory, nameQuery, startDate, endDate]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleCategoryChange = (cat: RegulationCategory) => {
    setActiveCategory(cat);
    setPage(1);
  };

  const handleSearch = () => {
    setPage(1);
  };

  const handleReset = () => {
    setActiveCategory('全部');
    setNameQuery('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  return (
    <div className="rp-page">
      {/* 筛选查询区 */}
      <div className="swb-card">
        <div className="rp-category-tabs">
          {REGULATION_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`rp-category-tab${activeCategory === cat ? ' rp-category-tab--active' : ''}`}
              onClick={() => handleCategoryChange(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="rp-search-bar">
          <div className="rp-search-fields">
            <div className="rp-search-field">
              <label className="rp-search-label">制度名称</label>
              <input
                type="text"
                className="swb-input rp-name-input"
                placeholder="请输入制度名称"
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
              />
            </div>
            <div className="rp-search-field">
              <label className="rp-search-label">时间</label>
              <div className="swb-date-range">
                <input
                  type="date"
                  className="swb-input swb-date-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <span className="rp-date-separator">~</span>
                <input
                  type="date"
                  className="swb-input swb-date-input"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="rp-search-actions">
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
          <table className="swb-table rp-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>序号</th>
                <th>制度名称</th>
                <th style={{ width: 200 }}>制度文号</th>
                <th style={{ width: 120 }}>制度类型</th>
                <th style={{ width: 120 }}>签发时间</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="swb-table__empty">
                    暂无数据
                  </td>
                </tr>
              ) : (
                pageItems.map((item, idx) => (
                  <RegulationRow
                    key={item.id}
                    item={item}
                    index={(safePage - 1) * pageSize + idx + 1}
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

function RegulationRow({ item, index }: { item: RegulationItem; index: number }) {
  return (
    <tr>
      <td>{index}</td>
      <td>
        <span className="swb-table__name-link">{item.name}</span>
      </td>
      <td>{item.docNo}</td>
      <td>{item.category}</td>
      <td>{item.issueDate}</td>
    </tr>
  );
}
