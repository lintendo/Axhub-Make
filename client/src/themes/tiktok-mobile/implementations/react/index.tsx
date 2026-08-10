/**
 * @name TikTok 主题 - TikTok
 */

import './style.css';
import React from 'react';
import { DesignMdBatchShowcase, type BatchShowcaseConfig } from '../../../../common/DesignMdBatchShowcase';
import themeData from '../../theme.json';
import productScreenshot01 from '../../assets/product-screenshot-01.webp?url';
import productScreenshot02 from '../../assets/product-screenshot-02.webp?url';
import productScreenshot03 from '../../assets/product-screenshot-03.webp?url';

type ThemeDisplayData = Omit<BatchShowcaseConfig, 'previewImages'> & {
  previewImages: Array<{ type: string; path: string }>;
};

const display = themeData.display as unknown as ThemeDisplayData;

const config: BatchShowcaseConfig = {
  brand: display.brand,
  brandAlias: display.brandAlias,
  source: themeData.source,
  description: display.description,
  descriptionEn: display.descriptionEn,
  variant: display.variant,
  distributionTags: display.distributionTags,
  fontStylesheets: display.fontStylesheets,
  palette: display.palette,
  radius: display.radius,
  spacing: display.spacing,
  typography: display.typography,
  previewImages: [
    { type: 'product-screenshot', url: productScreenshot01 },
    { type: 'product-screenshot', url: productScreenshot02 },
    { type: 'product-screenshot', url: productScreenshot03 },
  ],
  usageGuidance: display.usageGuidance,
  shadows: display.shadows,
  borders: display.borders,
  panels: display.panels,
};

const Component: React.FC = () => (
  <DesignMdBatchShowcase className="tiktok-theme" config={config} />
);

export default Component;
