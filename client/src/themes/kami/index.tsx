/**
 * @name Kami 紙主题
 */

import './style.css';
import React from 'react';
import {
  DesignMdBatchShowcase,
  type BatchShowcaseConfig,
  type BatchShowcaseTab,
} from '../../common/DesignMdBatchShowcase';
import PaperButton from './components/PaperButton';
import EditorialCard from './components/EditorialCard';
import SpecTable from './components/SpecTable';
import OnePagerTemplate from './templates/OnePagerTemplate';
import LongDocTemplate from './templates/LongDocTemplate';
import themeData from './theme.json';
import previewAsset from './assets/kami-demo-tesla.png?url';

const config: BatchShowcaseConfig = {
  brand: 'Kami 紙主题',
  brandAlias: 'Kami',
  source: themeData.source,
  description: 'Kami 紙主题用于文档、白皮书和作品集排版，强调纸张质感、墨蓝重点和清晰的信息层级。',
  descriptionEn: 'A document-first theme for polished one-pagers, white papers, and portfolios.',
  variant: 'editorial-agency',
  distributionTags: ['文档排版', '编辑系统', '纸张质感', '墨蓝强调'],
  fontStylesheets: [],
  palette: [
    { color: '#f7f1e3', labelZh: '纸张', labelEn: 'Paper', textColor: '#1e293b' },
    { color: '#1f3a5f', labelZh: '墨蓝', labelEn: 'Ink Blue', textColor: '#ffffff' },
    { color: '#2f2a24', labelZh: '正文', labelEn: 'Body Ink', textColor: '#ffffff' },
    { color: '#b88746', labelZh: '金色', labelEn: 'Gilded Accent', textColor: '#1e293b' },
    { color: '#fffaf0', labelZh: '页面', labelEn: 'Page', textColor: '#1e293b' },
    { color: '#e4d5bd', labelZh: '边线', labelEn: 'Rule', textColor: '#1e293b' },
  ],
  radius: {
    control: '6px',
    card: '4px',
    preview: '0px',
    source: 'design-md',
  },
  spacing: {
    xs: '6px',
    sm: '10px',
    md: '16px',
    lg: '24px',
    xl: '36px',
    section: '64px',
    source: 'design-md',
  },
  typography: ['Charter', 'TsangerJinKai02', 'ui-monospace'],
  previewImages: [
    { type: 'local-preview', url: previewAsset },
  ],
  shadows: [
    {
      label: '纸面阴影 - Paper Lift',
      value: '0 18px 48px rgba(31, 58, 95, 0.12)',
      cssValue: '0 18px 48px rgba(31, 58, 95, 0.12)',
      description: '用于页面预览和重点文档卡片。',
    },
  ],
  borders: [
    {
      label: '细分割线 - Hairline Rule',
      value: '#e4d5bd',
      cssValue: '#e4d5bd',
      description: '用于表格、脚注和段落分隔。',
    },
  ],
  panels: [
    {
      eyebrow: 'One-pager',
      title: '一页纸提案',
      body: '用清楚的标题、摘要、数据摘录和行动建议组织单页文档。',
    },
    {
      eyebrow: 'White paper',
      title: '白皮书结构',
      body: '适合长文档的章节、注释、表格和重点引用排版。',
    },
    {
      eyebrow: 'Portfolio',
      title: '作品集叙事',
      body: '让项目背景、过程和结果在同一个页面系统里展开。',
    },
  ],
  usageGuidance: {
    do: ['保留充足页边距', '用墨蓝承载重点动作', '把表格和引用作为正文的一部分'],
    dont: ['把内容做成营销卡片墙', '使用强烈渐变背景', '让装饰压过正文阅读'],
  },
};

const resourceTabs: BatchShowcaseTab[] = [
  {
    id: 'components',
    label: '组件',
    content: (
      <div className="kami-resource-grid">
        <PaperButton />
        <EditorialCard />
        <SpecTable />
      </div>
    ),
  },
  {
    id: 'templates',
    label: '模板',
    content: (
      <div className="kami-resource-grid kami-resource-grid-templates">
        <OnePagerTemplate />
        <LongDocTemplate />
      </div>
    ),
  },
];

const Component: React.FC = () => <DesignMdBatchShowcase config={config} tabs={resourceTabs} />;

export default Component;
