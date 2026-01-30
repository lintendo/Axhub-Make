/**
 * @name ECharts 折线图
 * 
 * 参考资料：
 * - /rules/development-standards.md
 * - /rules/axure-api-guide.md
 * - /assets/docs/设计规范.UIGuidelines.md
 * - /assets/libraries/echarts.md (ECharts)
 * 
 * ==================== 重要说明 ====================
 * 本文件是演示文件，用于展示本项目元素开发规范
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
import React, { useState, useCallback, useImperativeHandle, forwardRef, useEffect, useRef } from 'react';
// 3. 导入第三方库（可选，需要协助用户安装依赖）
// 【规范说明】按需导入 ECharts，只引入需要的组件，减小打包体积
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

// 注册需要的组件
echarts.use([
  LineChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  CanvasRenderer
]);

// 4. 导入类型定义（必需）
import type {
  KeyDesc,
  DataDesc,
  ConfigItem,
  Action,
  EventItem,
  CSSProperties,
  AxureProps,
  AxureHandle
} from '../../common/axure-types';

// 【规范说明】事件列表定义
// 必须清晰描述每个事件的触发时机和用途
const EVENT_LIST: EventItem[] = [
  { name: 'onClick', desc: '点击图表时触发' },
  { name: 'onDataZoom', desc: '数据缩放时触发' },
  { name: 'onLegendSelect', desc: '图例选择时触发' }
];

// 【规范说明】动作列表定义
// 必须说明每个动作的功能，如果有参数需要说明参数格式
const ACTION_LIST: Action[] = [
  { name: 'updateData', desc: '更新图表数据' },
  { name: 'resize', desc: '调整图表大小' },
  { name: 'showLoading', desc: '显示加载动画' },
  { name: 'hideLoading', desc: '隐藏加载动画' }
];

// 【规范说明】变量列表定义
// 必须说明每个变量的类型和用途
const VAR_LIST: KeyDesc[] = [
  { name: 'chart_instance', desc: 'ECharts 实例对象' },
  { name: 'current_data', desc: '当前图表数据' }
];

// 【规范说明】配置项列表定义
// 必须包含 initialValue，并清晰说明每个配置项的用途
const CONFIG_LIST: ConfigItem[] = [
  { type: 'input', attributeId: 'title', displayName: '图表标题', info: '显示在图表顶部的标题文本', initialValue: '折线图' },
  { type: 'input', attributeId: 'xAxisName', displayName: 'X轴名称', info: 'X轴的标签名称', initialValue: 'X轴' },
  { type: 'input', attributeId: 'yAxisName', displayName: 'Y轴名称', info: 'Y轴的标签名称', initialValue: 'Y轴' },
  { type: 'colorPicker', attributeId: 'primaryColor', displayName: '主题色', info: '图表的主色调', initialValue: '#1890ff' },
  { type: 'checkbox', attributeId: 'showLegend', displayName: '显示图例', info: '是否显示图例', initialValue: true },
  { type: 'checkbox', attributeId: 'showTooltip', displayName: '显示提示框', info: '是否显示鼠标悬停提示', initialValue: true }
];

// 【规范说明】数据项列表定义
// 必须详细定义 keys，说明每个字段的含义和类型
const DATA_LIST: DataDesc[] = [
  {
    name: 'series',
    desc: '折线图系列数据',
    keys: [
      { name: 'name', desc: '系列名称' },
      { name: 'data', desc: '数据数组（数值）' }
    ]
  },
  {
    name: 'xAxis',
    desc: 'X轴数据',
    keys: [
      { name: 'data', desc: 'X轴标签数组' }
    ]
  }
];

// 【规范说明】组件定义
// 必须使用 forwardRef<AxureHandle, AxureProps> 包装组件
const Component = forwardRef<AxureHandle, AxureProps>(function LineChart(innerProps, ref) {
  // 【规范说明】Props 处理
  // 安全解构 props 并提供默认值，包括 container
  const dataSource = innerProps && innerProps.data ? innerProps.data : {};
  const configSource = innerProps && innerProps.config ? innerProps.config : {};
  const onEventHandler = typeof innerProps.onEvent === 'function' ? innerProps.onEvent : function () { return undefined; };
  // 【规范说明】container 容器
  // 用于直接操作 DOM，适合 ECharts、D3.js 等需要直接挂载的库
  const container = innerProps && innerProps.container ? innerProps.container : null;

  // 【规范说明】使用 useRef 保存 DOM 引用和实例
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<any>(null);

  // 【规范说明】从 config 获取配置值
  // 使用类型检查避免使用 || 运算符（会误判 0、false 等值）
  const title = typeof configSource.title === 'string' && configSource.title ? configSource.title : '折线图';
  const xAxisName = typeof configSource.xAxisName === 'string' && configSource.xAxisName ? configSource.xAxisName : 'X轴';
  const yAxisName = typeof configSource.yAxisName === 'string' && configSource.yAxisName ? configSource.yAxisName : 'Y轴';
  const primaryColor = typeof configSource.primaryColor === 'string' && configSource.primaryColor ? configSource.primaryColor : '#1890ff';
  const showLegend = configSource.showLegend !== false;
  const showTooltip = configSource.showTooltip !== false;

  // 【规范说明】从 data 获取数据，提供默认值
  const seriesData = Array.isArray(dataSource.series) ? dataSource.series : [
    { name: '系列1', data: [120, 132, 101, 134, 90, 230, 210] }
  ];
  const xAxisData = Array.isArray(dataSource.xAxis?.data) ? dataSource.xAxis.data : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // 【规范说明】State 管理
  // 避免使用 ES6 解构，使用数组索引访问 state 和 setter
  const currentDataState = useState<any>({ series: seriesData, xAxis: { data: xAxisData } });
  const currentData = currentDataState[0];
  const setCurrentData = currentDataState[1];

  const emitEvent = useCallback(function (eventName: string, payload?: any) {
    try {
      onEventHandler(eventName, payload);
    } catch (error) {
      console.warn('onEvent 调用失败:', error);
    }
  }, [onEventHandler]);

  // 生成 ECharts 配置项
  const getChartOption = useCallback(function () {
    const colors = [primaryColor, '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2'];
    return {
      animation: true,
      animationDuration: 30,
      animationEasing: 'cubicOut' as const,
      title: {
        text: title,
        left: 'center',
        textStyle: {
          color: primaryColor
        }
      },
      tooltip: {
        show: showTooltip,
        trigger: 'axis'
      },
      legend: {
        show: showLegend,
        top: showLegend ? 40 : 'auto'
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: xAxisData,
        name: xAxisName,
        nameLocation: 'middle',
        nameGap: 30
      },
      yAxis: {
        type: 'value',
        name: yAxisName,
        nameLocation: 'middle',
        nameGap: 50
      },
      series: seriesData.map(function (item: any, index: number) {
        return {
          name: item.name || '系列' + (index + 1),
          type: 'line',
          data: Array.isArray(item.data) ? item.data : [],
          smooth: true,
          animation: true,
          animationDuration: 30,
          itemStyle: {
            color: colors[index % colors.length]
          },
          lineStyle: {
            color: colors[index % colors.length]
          }
        };
      })
    };
  }, [title, xAxisName, yAxisName, primaryColor, showLegend, showTooltip, xAxisData, seriesData]);

  // 【规范说明】使用 useEffect 初始化 ECharts
  // 【重要】直接使用 container 初始化图表，不需要返回 JSX 元素
  // 只在 container 变化时重新初始化，避免重复创建实例
  useEffect(function () {
    const targetElement = container
    if (!targetElement) {
      return;
    }

    // 等待容器有尺寸后再初始化
    function initChart() {
      if (!targetElement) {
        return;
      }

      if (!chartInstanceRef.current && targetElement) {
        const chartInstance = echarts.init(targetElement);
        chartInstanceRef.current = chartInstance;

        // 绑定事件
        chartInstance.on('click', function (params: any) {
          emitEvent('onClick', params);
        });

        chartInstance.on('datazoom', function (params: any) {
          emitEvent('onDataZoom', params);
        });

        chartInstance.on('legendselectchanged', function (params: any) {
          emitEvent('onLegendSelect', params);
        });

        // 初始化时设置配置
        const option = getChartOption();
        chartInstance.setOption(option);
        setCurrentData({ series: seriesData, xAxis: { data: xAxisData } });
      }
    }

    initChart();

    // 【规范说明】清理函数
    // 必须在组件卸载时销毁 ECharts 实例，避免内存泄漏
    return function () {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, [container]); // 只在 container 变化时重新初始化

  // 更新图表数据（当数据或配置变化时）
  useEffect(function () {
    if (!chartInstanceRef.current) {
      return;
    }

    const option = getChartOption();
    chartInstanceRef.current.setOption(option, false);
    setCurrentData({ series: seriesData, xAxis: { data: xAxisData } });
  }, [getChartOption, seriesData, xAxisData]);

  const handleUpdateData = useCallback(function (params?: any) {
    if (params && params.series) {
      setCurrentData({ series: params.series, xAxis: params.xAxis || { data: xAxisData } });
    }
  }, [xAxisData]);

  const handleResize = useCallback(function () {
    if (chartInstanceRef.current) {
      chartInstanceRef.current.resize();
    }
  }, []);

  const handleShowLoading = useCallback(function () {
    if (chartInstanceRef.current) {
      chartInstanceRef.current.showLoading();
    }
  }, []);

  const handleHideLoading = useCallback(function () {
    if (chartInstanceRef.current) {
      chartInstanceRef.current.hideLoading();
    }
  }, []);

  const fireActionHandler = useCallback(function (name: string, params?: any) {
    switch (name) {
      case 'updateData':
        handleUpdateData(params);
        break;
      case 'resize':
        handleResize();
        break;
      case 'showLoading':
        handleShowLoading();
        break;
      case 'hideLoading':
        handleHideLoading();
        break;
      default:
        console.warn('未知的动作类型:', name);
    }
  }, [handleUpdateData, handleResize, handleShowLoading, handleHideLoading]);

  // 【规范说明】useImperativeHandle
  // 必须暴露完整的 AxureHandle 接口，包括所有列表和方法
  useImperativeHandle(ref, function () {
    return {
      getVar: function (name: string) {
        const vars: Record<string, any> = {
          chart_instance: chartInstanceRef.current,
          current_data: currentData
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
  }, [currentData, fireActionHandler]);

  // 【规范说明】使用 container 直接渲染时，返回 null
  // 因为图表已经通过 container 直接挂载到 DOM 上了
  return null;
});

// 【规范说明】导出组件
// 必须使用 export default Component（大小写敏感）
// 这是本项目平台集成的必要条件
export default Component;
