/**
 * @name 健身 App 首页
 * 
 * 参考资料：
 * - /rules/development-standards.md
 * - /rules/axure-api-guide.md
 * - /assets/docs/设计规范.UIGuidelines.md
 * 
 * ==================== 重要说明 ====================
 * 本文件是演示文件，用于展示 Axhub 页面开发规范
 * 文件中的详细注释【规范说明】仅用于教学和说明规范要求
 * 
 * 实际开发时：
 * 1. 只需保留 @name 和 参考资料 注释
 * 2. 不需要添加如此详细的规范说明注释
 * 3. 代码应该简洁清晰，避免冗余注释
 * 4. 只在复杂逻辑处添加必要的业务说明注释
 * ================================================
 */

// 【规范说明】导入顺序：
// 1. 样式文件（可选）
import './style.css';

// 2. React 和 Hooks（必需）
// 直接从 'react' 导入所需的 Hooks，不使用解构
import React, { useState, useCallback, useImperativeHandle, forwardRef } from 'react';

// 3. 导入图标库
import { Flame, Timer, Zap, Activity } from 'lucide-react';

// 4. 导入类型定义（必需）
// 从 axhub-types 导入所有必要的类型
import type {
    KeyDesc,
    DataDesc,
    ConfigItem,
    Action,
    EventItem,
    AxhubProps,
    AxhubHandle
} from '../../common/axhub-types';

// 【规范说明】事件列表定义
// 必须清晰描述每个事件的触发时机和用途
const EVENT_LIST: EventItem[] = [
    { name: 'onCourseClick', desc: '点击课程卡片时触发' },
    { name: 'onStartWorkout', desc: '点击开始训练时触发' },
    { name: 'onTabChange', desc: '切换底部标签栏时触发' }
];

// 【规范说明】动作列表定义
// 必须说明每个动作的功能，如果有参数需要说明参数格式
const ACTION_LIST: Action[] = [
    { name: 'refreshData', desc: '刷新首页数据' },
    { name: 'updateProgress', desc: '更新今日目标进度，参数：{ progress: number }' }
];

// 【规范说明】变量列表定义
// 必须说明每个变量的类型和用途
const VAR_LIST: KeyDesc[] = [
    { name: 'currentTab', desc: '当前选中的标签页索引' },
    { name: 'todayProgress', desc: '今日目标完成进度(0-100)' }
];

// 【规范说明】配置项列表定义
// 必须包含 initialValue，并清晰说明每个配置项的用途
const CONFIG_LIST: ConfigItem[] = [
    { type: 'input', attributeId: 'userName', displayName: '用户名', info: '显示的用户名', initialValue: 'Alex' },
    { type: 'colorPicker', attributeId: 'accentColor', displayName: '强调色', info: 'App 的主要强调色', initialValue: '#a6ff00' },
    { type: 'inputNumber', attributeId: 'dailyGoal', displayName: '每日目标(kcal)', info: '每日卡路里消耗目标', initialValue: 500 }
];

// 【规范说明】数据项列表定义
// 必须详细定义 keys，说明每个字段的含义和类型
const DATA_LIST: DataDesc[] = [
    {
        name: 'courses',
        desc: '推荐课程列表',
        keys: [
            { name: 'id', desc: '课程ID' },
            { name: 'title', desc: '课程标题' },
            { name: 'duration', desc: '时长(分钟)' },
            { name: 'level', desc: '难度等级' },
            { name: 'image', desc: '封面图片URL' },
            { name: 'category', desc: '分类标签' }
        ]
    }
];

// 【规范说明】组件定义
// 必须使用 forwardRef<AxhubHandle, AxhubProps> 包装组件
const Component = forwardRef<AxhubHandle, AxhubProps>(function FitnessHome(innerProps, ref) {
    // 【规范说明】Props 处理
    // 安全解构 props 并提供默认值，避免访问 undefined 属性
    const dataSource = innerProps && innerProps.data ? innerProps.data : {};
    const configSource = innerProps && innerProps.config ? innerProps.config : {};
    const onEventHandler = typeof innerProps.onEvent === 'function' ? innerProps.onEvent : function () { return undefined; };

    // 【规范说明】从 config 获取配置值
    // 使用类型检查避免使用 || 运算符（会误判 0、false 等值）
    const userName = typeof configSource.userName === 'string' && configSource.userName ? configSource.userName : 'Alex';
    const accentColor = typeof configSource.accentColor === 'string' && configSource.accentColor ? configSource.accentColor : '#a6ff00';
    const dailyGoal = typeof configSource.dailyGoal === 'number' ? configSource.dailyGoal : 500;

    // 【规范说明】默认数据定义
    // 为演示提供合理的默认数据
    const defaultCourses = [
        { id: 1, title: 'HIIT 高强度燃脂', duration: 20, level: 'K3', category: '减脂', image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80' },
        { id: 2, title: '腹肌核心撕裂者', duration: 15, level: 'K2', category: '塑形', image: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80' },
        { id: 3, title: '全身拉伸放松', duration: 10, level: 'K1', category: '恢复', image: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80' }
    ];
    const courses = Array.isArray(dataSource.courses) ? dataSource.courses : defaultCourses;

    // 【规范说明】State 管理
    // 避免使用 ES6 解构，使用数组索引访问 state 和 setter
    const tabState = useState<number>(0);
    const currentTab = tabState[0];
    const setCurrentTab = tabState[1];

    const progressState = useState<number>(65);
    const todayProgress = progressState[0];
    const setTodayProgress = progressState[1];

    // 【规范说明】事件触发封装
    // 使用 useCallback 优化性能，包含错误处理
    const emitEvent = useCallback(function (eventName: string, payload?: any) {
        try {
            onEventHandler(eventName, payload);
        } catch (error) {
            console.warn('事件触发失败:', error);
        }
    }, [onEventHandler]);

    const handleTabChange = useCallback(function (index: number) {
        setCurrentTab(index);
        emitEvent('onTabChange', { index });
    }, [emitEvent]);

    const handleCourseClick = useCallback(function (course: any) {
        emitEvent('onCourseClick', { course });
    }, [emitEvent]);

    const handleStartWorkout = useCallback(function () {
        emitEvent('onStartWorkout', {});
    }, [emitEvent]);

    // 【规范说明】动作处理器
    // 使用 switch 语句处理不同的动作类型
    const fireActionHandler = useCallback(function (name: string, params?: any) {
        switch (name) {
            case 'refreshData':
                // 模拟刷新
                console.log('刷新数据...');
                break;
            case 'updateProgress':
                if (params && typeof params.progress === 'number') {
                    setTodayProgress(params.progress);
                }
                break;
            default:
                console.warn('未知的动作:', name);
        }
    }, []);

    // 【规范说明】useImperativeHandle
    // 必须暴露完整的 AxhubHandle 接口，包括所有列表和方法
    // 依赖项数组必须包含所有使用到的 state 和函数
    useImperativeHandle(ref, function () {
        return {
            getVar: function (name: string) {
                const vars: Record<string, any> = {
                    currentTab,
                    todayProgress
                };
                return vars[name];
            },
            fireAction: fireActionHandler,
            eventList: EVENT_LIST,
            actionList: ACTION_LIST,
            varList: VAR_LIST,
            configList: CONFIG_LIST,
            dataList: DATA_LIST
        };
    }, [currentTab, todayProgress, fireActionHandler]);

    // 【规范说明】渲染前的数据准备
    // 计算圆环进度条的 SVG 属性
    const radius = 25;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (todayProgress / 100) * circumference;

    // 【规范说明】JSX 渲染
    // 使用语义化的类名，添加组件前缀避免冲突
    // 避免在 JSX 中直接定义函数，使用预定义的 useCallback 函数
    return (
        <div className="demo-app-home-container" style={{ '--accent-color': accentColor } as any}>
            {/* 头部 */}
            <div className="demo-app-home-header">
                <h1 className="demo-app-home-greeting">
                    Hi, <span style={{ color: accentColor }}>{userName}</span>
                    <div style={{ fontSize: 14, color: '#888', fontWeight: 'normal', marginTop: 4 }}>
                        今天也要加油哦
                    </div>
                </h1>
                <div className="demo-app-home-avatar">
                    <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?ixlib=rb-1.2.1&auto=format&fit=crop&w=100&q=80" alt="avatar" />
                </div>
            </div>

            {/* 统计数据 */}
            <div className="demo-app-home-stats">
                <div className="demo-app-home-stat-card">
                    <div className="demo-app-home-stat-icon">
                        <Flame size={20} />
                    </div>
                    <div className="demo-app-home-stat-value">328</div>
                    <div className="demo-app-home-stat-label">千卡消耗</div>
                </div>
                <div className="demo-app-home-stat-card">
                    <div className="demo-app-home-stat-icon">
                        <Timer size={20} />
                    </div>
                    <div className="demo-app-home-stat-value">45</div>
                    <div className="demo-app-home-stat-label">运动分钟</div>
                </div>
                <div className="demo-app-home-stat-card">
                    <div className="demo-app-home-stat-icon">
                        <Zap size={20} />
                    </div>
                    <div className="demo-app-home-stat-value">3</div>
                    <div className="demo-app-home-stat-label">连续天数</div>
                </div>
            </div>

            {/* 今日计划 */}
            <div className="demo-app-home-section">
                <div className="demo-app-home-section-header">
                    <h2 className="demo-app-home-section-title">今日计划</h2>
                    <span className="demo-app-home-section-more">查看全部</span>
                </div>

                <div className="demo-app-home-plan-card">
                    <div className="demo-app-home-plan-progress">
                        <svg>
                            <circle
                                className="demo-app-home-plan-progress-bg"
                                cx="30"
                                cy="30"
                                r={radius}
                            />
                            <circle
                                className="demo-app-home-plan-progress-bar"
                                cx="30"
                                cy="30"
                                r={radius}
                                style={{ strokeDashoffset, stroke: accentColor }}
                            />
                        </svg>
                        <div className="demo-app-home-plan-icon">
                            <Activity size={24} />
                        </div>
                    </div>
                    <div className="demo-app-home-plan-info">
                        <div className="demo-app-home-plan-title">每日目标</div>
                        <div className="demo-app-home-plan-subtitle">已完成 {Math.round(dailyGoal * todayProgress / 100)} / {dailyGoal} kcal</div>
                    </div>
                    <button
                        className="demo-app-home-plan-action"
                        style={{ backgroundColor: accentColor }}
                        onClick={handleStartWorkout}
                    >
                        ▶
                    </button>
                </div>
            </div>

            {/* 推荐课程 */}
            <div className="demo-app-home-section">
                <div className="demo-app-home-section-header">
                    <h2 className="demo-app-home-section-title">为你推荐</h2>
                    <span className="demo-app-home-section-more">更多</span>
                </div>

                <div className="demo-app-home-course-list">
                    {courses.map(function (course: any) {
                        return (
                            <div
                                key={course.id}
                                className="demo-app-home-course-card"
                                onClick={function () { handleCourseClick(course); }}
                            >
                                <img src={course.image} className="demo-app-home-course-bg" alt={course.title} />
                                <div className="demo-app-home-course-overlay">
                                    <div className="demo-app-home-course-tag" style={{ backgroundColor: accentColor }}>{course.category}</div>
                                    <div className="demo-app-home-course-title">{course.title}</div>
                                    <div className="demo-app-home-course-meta">
                                        <span>{course.duration} 分钟</span>
                                        <span>•</span>
                                        <span>{course.level}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 浮动按钮 */}
            <div className="demo-app-home-fab" style={{ backgroundColor: accentColor }}>
                +
            </div>

            {/* 底部导航 */}
            <div className="demo-app-home-tab-bar">
                <div
                    className={'demo-app-home-tab-item ' + (currentTab === 0 ? 'active' : '')}
                    style={{ color: currentTab === 0 ? accentColor : undefined }}
                    onClick={function () { handleTabChange(0); }}
                >
                    <div className="demo-app-home-tab-icon">
                        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                    </div>
                    <div className="demo-app-home-tab-label">首页</div>
                </div>
                <div
                    className={'demo-app-home-tab-item ' + (currentTab === 1 ? 'active' : '')}
                    style={{ color: currentTab === 1 ? accentColor : undefined }}
                    onClick={function () { handleTabChange(1); }}
                >
                    <div className="demo-app-home-tab-icon">
                        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    </div>
                    <div className="demo-app-home-tab-label">计划</div>
                </div>
                <div
                    className={'demo-app-home-tab-item ' + (currentTab === 2 ? 'active' : '')}
                    style={{ color: currentTab === 2 ? accentColor : undefined }}
                    onClick={function () { handleTabChange(2); }}
                >
                    <div className="demo-app-home-tab-icon">
                        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                    </div>
                    <div className="demo-app-home-tab-label">统计</div>
                </div>
                <div
                    className={'demo-app-home-tab-item ' + (currentTab === 3 ? 'active' : '')}
                    style={{ color: currentTab === 3 ? accentColor : undefined }}
                    onClick={function () { handleTabChange(3); }}
                >
                    <div className="demo-app-home-tab-icon">
                        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    </div>
                    <div className="demo-app-home-tab-label">我的</div>
                </div>
            </div>
        </div>
    );
});

// 【规范说明】导出组件
// 必须使用 export default Component（大小写敏感）
// 这是 Axhub 平台集成的必要条件
export default Component;
