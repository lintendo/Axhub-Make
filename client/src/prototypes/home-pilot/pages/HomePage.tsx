/**
 * 首页工作台：发起申请磁贴 + 常用系统磁贴 + 待办事项表格。
 */
import React, { useMemo, useState } from 'react';
import {
  FileText,
  ClipboardList,
  CalendarDays,
  Archive,
  Search,
  Info,
  Mail,
  Monitor,
  CircleDollarSign,
  ArrowRight,
  FileSignature,
} from 'lucide-react';
import { Pagination } from '../components/PrototypeUI';
import { APP_TILES, SYSTEM_TILES, TODO_CATEGORIES, todoList, doneList, type TodoCategory, type TodoItem } from '../mock';

const SIGN_NODE_ROUTE_MAP: Record<string, string> = {
  create: 'sign-create',
  detail: 'sign-detail',
  'approve-dept': 'sign-approve-dept',
  'approve-office': 'sign-approve-office',
  'approve-secretary': 'sign-approve-secretary',
  deliver: 'sign-deliver',
  sign: 'sign',
  'party-office-clerk': 'sign-party-office-clerk',
  'office-director': 'sign-office-director',
  finish: 'sign-finish',
};

const APP_ICONS: Record<string, React.ElementType> = {
  rule: FileText,
  proposal: ClipboardList,
  meeting: CalendarDays,
  archive: Archive,
  sign: FileSignature,
  research: Search,
  info: Info,
};

const SYSTEM_ICONS: Record<string, React.ElementType> = {
  mail: Mail,
  office: Monitor,
  finance: CircleDollarSign,
};

export interface HomePageProps {
  onCreateRegulation: () => void;
  onCreateMeeting: () => void;
  onMeetingTodo: () => void;
  onCreateArchive: () => void;
  onCreateResearch: () => void;
  onCreateInfo: () => void;
  onCreateSign: () => void;
  onSignTodoClick: (taskId: string, signPage: string) => void;
}

type MainTab = 'todo' | 'done';
type CategoryFilter = '全部' | TodoCategory;

export function HomePage({
  onCreateRegulation,
  onCreateMeeting,
  onMeetingTodo,
  onCreateArchive,
  onCreateResearch,
  onCreateInfo,
  onCreateSign,
  onSignTodoClick,
}: HomePageProps) {
  const [mainTab, setMainTab] = useState<MainTab>('todo');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('全部');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const currentList = mainTab === 'todo' ? todoList : doneList;

  const filtered = useMemo(() => {
    return activeCategory === '全部'
      ? currentList
      : currentList.filter((item) => item.category === activeCategory);
  }, [mainTab, activeCategory]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const categoryCounts = useMemo(() => {
    const counts: Record<TodoCategory, number> = {
      公文: 0,
      董事会事务: 0,
      会议: 0,
    };
    TODO_CATEGORIES.forEach((cat) => {
      counts[cat] = currentList.filter((item) => item.category === cat).length;
    });
    return counts;
  }, [mainTab]);

  const handleMainTabChange = (tab: MainTab) => {
    setMainTab(tab);
    setPage(1);
  };

  const handleCategoryChange = (cat: CategoryFilter) => {
    setActiveCategory(cat);
    setPage(1);
  };

  return (
    <>
      {/* 上半区：发起申请 + 常用系统 */}
      <div className="hp-top-section">
        <div className="swb-card hp-app-card">
          <div className="hp-card-header">
            <span className="hp-card-title">发起申请</span>
          </div>
          <div className="hp-tile-grid">
            {APP_TILES.map((tile) => {
              const Icon = APP_ICONS[tile.key];
              return (
                <button
                  key={tile.key}
                  type="button"
                  className="hp-tile"
                  style={{ background: tile.gradient }}
                  onClick={() => {
                    if (tile.key === 'rule') onCreateRegulation();
                    if (tile.key === 'meeting') onCreateMeeting();
                    if (tile.key === 'archive') onCreateArchive();
                    if (tile.key === 'sign') onCreateSign();
                    if (tile.key === 'research') onCreateResearch();
                    if (tile.key === 'info') onCreateInfo();
                  }}
                >
                  <span className="hp-tile-icon">
                    {Icon && <Icon size={20} color="#303846" />}
                  </span>
                  <span className="hp-tile-label">{tile.label}</span>
                  <ArrowRight size={14} color="#909399" className="hp-tile-arrow" />
                </button>
              );
            })}
          </div>
        </div>

        <div className="swb-card hp-system-card">
          <div className="hp-card-header">
            <span className="hp-card-title">常用系统</span>
          </div>
          <div className="hp-tile-list">
            {SYSTEM_TILES.map((tile) => {
              const Icon = SYSTEM_ICONS[tile.key];
              return (
                <button key={tile.key} type="button" className="hp-tile hp-tile--system" style={{ background: tile.gradient }}>
                  <span className="hp-tile-icon">
                    {Icon && <Icon size={20} color="#303846" />}
                  </span>
                  <span className="hp-tile-label">{tile.label}</span>
                  <ArrowRight size={14} color="#909399" className="hp-tile-arrow" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 待办事项 */}
      <div className="swb-card" style={{ marginTop: 16 }}>
        <div className="hp-card-header hp-card-header--bordered">
          <div className="hp-main-tabs">
            <button
              type="button"
              className={`hp-main-tab${mainTab === 'todo' ? ' hp-main-tab--active' : ''}`}
              onClick={() => handleMainTabChange('todo')}
            >
              待办（{todoList.length}）
            </button>
            <button
              type="button"
              className={`hp-main-tab${mainTab === 'done' ? ' hp-main-tab--active' : ''}`}
              onClick={() => handleMainTabChange('done')}
            >
              已办（{doneList.length}）
            </button>
          </div>
          <div className="hp-category-tabs">
            <button
              type="button"
              className={`hp-category-tab${activeCategory === '全部' ? ' hp-category-tab--active' : ''}`}
              onClick={() => handleCategoryChange('全部')}
            >
              全部（{currentList.length}）
            </button>
            {TODO_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`hp-category-tab${activeCategory === cat ? ' hp-category-tab--active' : ''}`}
                onClick={() => handleCategoryChange(cat)}
              >
                {cat}（{categoryCounts[cat]}）
              </button>
            ))}
          </div>
        </div>
        <div className="swb-table-wrap">
          <table className="swb-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>序号</th>
                <th style={{ width: 140 }}>业务系统</th>
                <th style={{ width: 120 }}>业务类型</th>
                <th>待办标题</th>
                <th style={{ width: 120 }}>提交人</th>
                <th style={{ width: 180 }}>提交时间</th>
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
                  <TodoRow
                    key={item.id}
                    item={item}
                    index={(safePage - 1) * pageSize + idx + 1}
                    onMeetingClick={onMeetingTodo}
                    onSignTodoClick={onSignTodoClick}
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

function TodoRow({
  item,
  index,
  onMeetingClick,
  onSignTodoClick,
}: {
  item: TodoItem;
  index: number;
  onMeetingClick?: () => void;
  onSignTodoClick?: (taskId: string, signPage: string) => void;
}) {
  const isSign = item.type === '董事签字';

  const handleClick = () => {
    if (isSign && item.taskId && item.node) {
      onSignTodoClick?.(item.taskId, SIGN_NODE_ROUTE_MAP[item.node] || 'sign-detail');
      return;
    }
    if (item.category === '会议') {
      onMeetingClick?.();
    }
  };

  const clickable = isSign || item.category === '会议';

  return (
    <tr>
      <td>{index}</td>
      <td>{item.system}</td>
      <td>{item.type}</td>
      <td>
        <span
          className="swb-table__name-link"
          onClick={handleClick}
          role={clickable ? 'button' : undefined}
          tabIndex={clickable ? 0 : undefined}
          onKeyDown={clickable ? (e) => e.key === 'Enter' && handleClick() : undefined}
        >
          {item.title}
        </span>
      </td>
      <td>{item.submitter}</td>
      <td>{item.submitTime}</td>
    </tr>
  );
}
