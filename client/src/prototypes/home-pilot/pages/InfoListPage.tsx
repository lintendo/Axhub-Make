/**
 * 信息列表页：Chip 类型筛选 + 查询区 + 7 列表格 + 分页 + 排序。
 * 全量前端过滤 / 排序 / 分页，mock 数据驱动。
 */
import React, { useMemo, useState } from 'react';
import { Search, RotateCcw, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { Pagination } from '../components/PrototypeUI';
import { infoList, type InfoItem, type InfoType } from '../mock';

type SortField = 'name' | 'type' | 'date';
type SortOrder = 'asc' | 'desc';

const TYPE_OPTIONS: Array<InfoType | '全部'> = ['全部', '月报', '季报', '专报', '专项报告'];

export interface InfoListPageProps {
  onOpenDetail: (id: string) => void;
}

export function InfoListPage({ onOpenDetail }: InfoListPageProps) {
  // 输入态（未应用）
  const [nameInput, setNameInput] = useState('');
  const [dateFromInput, setDateFromInput] = useState('');
  const [dateToInput, setDateToInput] = useState('');

  // 已应用态（实际过滤）
  const [appliedName, setAppliedName] = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');

  // Chip 类型筛选（即时生效）
  const [activeType, setActiveType] = useState<InfoType | '全部'>('全部');

  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(() => {
    let list = infoList.slice();
    if (activeType !== '全部') {
      list = list.filter((item) => item.type === activeType);
    }
    if (appliedName.trim()) {
      const keyword = appliedName.trim();
      list = list.filter((item) => item.name.includes(keyword));
    }
    if (appliedFrom) {
      list = list.filter((item) => item.date >= appliedFrom);
    }
    if (appliedTo) {
      list = list.filter((item) => item.date <= appliedTo);
    }
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date') cmp = a.date.localeCompare(b.date);
      else if (sortField === 'name') cmp = a.name.localeCompare(b.name, 'zh-Hans-CN');
      else cmp = a.type.localeCompare(b.type, 'zh-Hans-CN');
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [appliedName, appliedFrom, appliedTo, activeType, sortField, sortOrder]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSearch = () => {
    setAppliedName(nameInput);
    setAppliedFrom(dateFromInput);
    setAppliedTo(dateToInput);
    setPage(1);
  };

  const handleReset = () => {
    setNameInput('');
    setDateFromInput('');
    setDateToInput('');
    setAppliedName('');
    setAppliedFrom('');
    setAppliedTo('');
    setActiveType('全部');
    setPage(1);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={13} color="var(--swb-subtle)" />;
    return sortOrder === 'asc' ? (
      <ArrowUp size={13} color="var(--swb-primary)" />
    ) : (
      <ArrowDown size={13} color="var(--swb-primary)" />
    );
  };

  return (
    <>
      <div className="swb-card">
        {/* Chip 类型筛选 */}
        <div className="ip-type-chips">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`ip-chip${activeType === opt ? ' ip-chip-active' : ''}`}
              onClick={() => {
                setActiveType(opt);
                setPage(1);
              }}
            >
              {opt}
            </button>
          ))}
        </div>

        {/* 查询区 */}
        <div className="ip-search ip-search-list">
          <div className="ip-field">
            <span className="ip-field-label">名称</span>
            <input
              className="swb-input"
              placeholder="请输入搜索关键词"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
              }}
              maxLength={20}
            />
          </div>
          <div className="ip-field">
            <span className="ip-field-label">时间</span>
            <div className="swb-date-range">
              <input
                type="date"
                className="swb-input swb-date-input"
                value={dateFromInput}
                onChange={(e) => setDateFromInput(e.target.value)}
              />
              <span style={{ color: 'var(--swb-subtle)' }}>—</span>
              <input
                type="date"
                className="swb-input swb-date-input"
                value={dateToInput}
                onChange={(e) => setDateToInput(e.target.value)}
              />
            </div>
          </div>
          <div className="ip-search-actions">
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

      <div className="swb-card" style={{ marginTop: 16 }}>
        <div className="swb-table-wrap">
          <table className="swb-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>序号</th>
                <th>
                  <span
                    className="swb-table__sort"
                    onClick={() => toggleSort('name')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleSort('name');
                      }
                    }}
                  >
                    名称
                    {renderSortIcon('name')}
                  </span>
                </th>
                <th style={{ width: 100 }}>
                  <span
                    className="swb-table__sort"
                    onClick={() => toggleSort('type')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleSort('type');
                      }
                    }}
                  >
                    类型
                    {renderSortIcon('type')}
                  </span>
                </th>
                <th style={{ width: 90 }}>密级</th>
                <th style={{ width: 120 }}>
                  <span
                    className="swb-table__sort"
                    onClick={() => toggleSort('date')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleSort('date');
                      }
                    }}
                  >
                    时间
                    {renderSortIcon('date')}
                  </span>
                </th>
                <th style={{ width: 90 }}>状态</th>
                <th style={{ width: 90 }}>操作</th>
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
                  <ListRow
                    key={item.id}
                    item={item}
                    index={(safePage - 1) * pageSize + idx + 1}
                    onOpen={onOpenDetail}
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
    </>
  );
}

function ListRow({
  item,
  index,
  onOpen,
}: {
  item: InfoItem;
  index: number;
  onOpen: (id: string) => void;
}) {
  return (
    <tr>
      <td>{index}</td>
      <td>
        <span
          className="swb-table__name-link"
          onClick={() => onOpen(item.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onOpen(item.id)}
        >
          {item.name}
        </span>
      </td>
      <td>{item.type}</td>
      <td>{item.secretLevel}</td>
      <td>{item.date.replace(/-/g, '/')}</td>
      <td>{item.status}</td>
      <td />
    </tr>
  );
}
