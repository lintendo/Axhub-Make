/**
 * @name 按钮元素
 * 
 * 参考资料：
 * - /rules/development-standards.md
 * - /rules/axure-api-guide.md
 * - /assets/docs/设计规范.UIGuidelines.md
 * 
 * ==================== 重要说明 ====================
 * 本文件是演示文件，用于展示 Axhub 元素开发规范
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

// 3. 导入类型定义（必需）
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

// 图标组件（内部使用）
const IconPlus = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

const IconRefresh = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 4v6h-6"></path>
    <path d="M1 20v-6h6"></path>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
  </svg>
);

// 【规范说明】事件列表定义
// 必须清晰描述每个事件的触发时机和用途
const EVENT_LIST: EventItem[] = [
  { name: 'onClick', desc: '点击按钮时触发' },
  { name: 'onCountChange', desc: '计数器改变时触发' }
];

// 【规范说明】动作列表定义
// 必须说明每个动作的功能，如果有参数需要说明参数格式
const ACTION_LIST: Action[] = [
  { name: 'increment', desc: '计数器加1' },
  { name: 'reset', desc: '重置计数器' },
  { name: 'setMessage', desc: '设置消息内容' }
];

// 【规范说明】变量列表定义
// 必须说明每个变量的类型和用途
const VAR_LIST: KeyDesc[] = [
  { name: 'count', desc: '当前计数值' },
  { name: 'message', desc: '消息内容' }
];

// 【规范说明】配置项列表定义
// 必须包含 initialValue，并清晰说明每个配置项的用途
// type 可以是：input, inputNumber, colorPicker, checkbox, select 等
const CONFIG_LIST: ConfigItem[] = [
  {
    type: 'input',
    attributeId: 'title',
    displayName: '元素标题',
    info: '元素顶部显示的标题文本',
    initialValue: 'React 示例'
  },
  {
    type: 'input',
    attributeId: 'buttonText',
    displayName: '按钮文本',
    info: '主按钮显示的文本内容',
    initialValue: '点击我'
  },
  {
    type: 'colorPicker',
    attributeId: 'primaryColor',
    displayName: '主色调',
    info: '元素的主题颜色',
    initialValue: '#1890ff'
  },
  {
    type: 'inputNumber',
    attributeId: 'initialCount',
    displayName: '初始计数值',
    info: '计数器的初始值',
    initialValue: 0,
    min: 0
  },
  {
    type: 'input',
    attributeId: 'message',
    displayName: '消息内容',
    info: '元素显示的消息文本',
    initialValue: '这是一个 React 元素示例'
  }
];

// 【规范说明】数据项列表定义
// 必须详细定义 keys，说明每个字段的含义和类型
const DATA_LIST: DataDesc[] = [
  {
    name: 'data1',
    desc: '基础数据列表',
    keys: [
      { name: 'name', desc: '名称' },
      { name: 'value', desc: '值' }
    ]
  }
];


// 【规范说明】元素定义
// 必须使用 forwardRef<AxhubHandle, AxhubProps> 包装元素
const Component = forwardRef<AxhubHandle, AxhubProps>(function AxhubButton(innerProps, ref) {
  // 【规范说明】Props 处理
  // 安全解构 props 并提供默认值，避免访问 undefined 属性
  const dataSource = innerProps && innerProps.data ? innerProps.data : {};
  const configSource = innerProps && innerProps.config ? innerProps.config : {};
  const onEventHandler = typeof innerProps.onEvent === 'function' ? innerProps.onEvent : function () { return undefined; };

  // 【规范说明】从 config 获取配置值
  // 使用类型检查避免使用 || 运算符（会误判 0、false 等值）
  const initialCount = typeof configSource.initialCount === 'number' ? configSource.initialCount : 0;
  const defaultMessage = typeof configSource.message === 'string' && configSource.message ? configSource.message : '这是一个 React 元素示例';
  const titleText = typeof configSource.title === 'string' && configSource.title ? configSource.title : 'React 元素示例';
  const buttonText = typeof configSource.buttonText === 'string' && configSource.buttonText ? configSource.buttonText : '点击我';

  // 【规范说明】State 管理
  // 避免使用 ES6 解构，使用数组索引访问 state 和 setter
  const countState = useState<number>(initialCount);
  const count = countState[0];
  const setCount = countState[1];
  const messageState = useState<string>(defaultMessage);
  const message = messageState[0];
  const setMessage = messageState[1];

  // 【规范说明】事件触发封装
  // 使用 useCallback 优化性能，包含错误处理
  const emitEvent = useCallback(function (eventName: string, payload?: any) {
    try {
      onEventHandler(eventName, payload);
    } catch (error) {
      console.warn('onEvent 调用失败:', error);
    }
  }, [onEventHandler]);

  // 【规范说明】业务逻辑处理
  // 使用 useCallback 包装所有回调函数，避免在 JSX 中直接定义函数
  const incrementCount = useCallback(function () {
    setCount(function (prev) {
      const newValue = prev + 1;
      emitEvent('onCountChange', { count: newValue, action: 'increment' });
      return newValue;
    });
  }, [emitEvent]);

  const resetCount = useCallback(function () {
    setCount(initialCount);
    emitEvent('onCountChange', { count: initialCount, action: 'reset' });
  }, [initialCount, emitEvent]);

  const updateMessage = useCallback(function (params?: any) {
    if (params && typeof params.message === 'string' && params.message.length > 0) {
      setMessage(params.message);
    }
  }, []);

  const handlePrimaryClick = useCallback(function () {
    emitEvent('onClick', { count });
    incrementCount();
  }, [count, emitEvent, incrementCount]);

  const handleResetClick = useCallback(function () {
    resetCount();
  }, [resetCount]);

  // 【规范说明】动作处理器
  // 使用 switch 语句处理不同的动作类型
  const fireActionHandler = useCallback(function (name: string, params?: any) {
    switch (name) {
      case 'increment':
        incrementCount();
        break;
      case 'reset':
        resetCount();
        break;
      case 'setMessage':
        updateMessage(params);
        break;
      default:
        console.warn('未知的动作类型:', name);
    }
  }, [incrementCount, resetCount, updateMessage]);

  // 【规范说明】useImperativeHandle
  // 必须暴露完整的 AxhubHandle 接口，包括所有列表和方法
  // 依赖项数组必须包含所有使用到的 state 和函数
  useImperativeHandle(ref, function () {
    return {
      getVar: function (name: string) {
        const vars: Record<string, any> = { count, message };
        return vars[name];
      },
      fireAction: fireActionHandler,
      eventList: EVENT_LIST,
      actionList: ACTION_LIST,
      varList: VAR_LIST,
      configList: CONFIG_LIST,
      dataList: DATA_LIST
    };
  }, [count, message, fireActionHandler]);

  // 【规范说明】渲染前的数据准备
  // 从配置和数据源中提取需要的值，提供默认值
  const primaryColor = typeof configSource.primaryColor === 'string' && configSource.primaryColor ? configSource.primaryColor : '#1890ff';

  const dataListSource = Array.isArray(dataSource.data1) ? dataSource.data1 : [];

  // 【规范说明】JSX 渲染
  // 使用语义化的类名，添加元素前缀避免冲突
  // 避免在 JSX 中直接定义函数，使用预定义的 useCallback 函数
  return (
    <div className="axhub-button-container">
      <div className="axhub-button-header">
        <h2 className="axhub-button-title">{titleText}</h2>
      </div>
      
      <div className="axhub-button-controls">
        <button 
          type="button" 
          className="axhub-button-primary" 
          style={{ backgroundColor: primaryColor }} 
          onClick={handlePrimaryClick}
        >
          <IconPlus />
          <span>{buttonText}</span>
          <span className="axhub-button-count-badge">{count}</span>
        </button>
        <button 
          type="button" 
          className="axhub-button-secondary" 
          onClick={handleResetClick}
        >
          <IconRefresh />
          <span>重置</span>
        </button>
      </div>

      <div className="axhub-button-content">
        <div className="axhub-button-message">
          <div className="axhub-button-label">消息</div>
          <div className="axhub-button-value">{message}</div>
        </div>
        
        {dataListSource.length > 0 && (
          <div className="axhub-button-data-container">
            <div className="axhub-button-label">数据列表</div>
            <div className="axhub-button-data-list">
              {dataListSource.map(function (item: any, index: number) {
                return (
                  <div key={index} className="axhub-button-data-item">
                    <span className="axhub-button-data-name">{item.name}</span>
                    <span className="axhub-button-data-val">{item.value}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// 【规范说明】导出元素
// 必须使用 export default Component（大小写敏感）
// 这是 Axhub 平台集成的必要条件
export default Component;
