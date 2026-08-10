/**
 * @name Kraken 主题 - Kraken
 */

import './style.css';
import React from 'react';
import { DesignMdBatchShowcase, type BatchShowcaseConfig } from '../../../../common/DesignMdBatchShowcase';
import themeData from '../../theme.json';
import previewAsset0 from '../../assets/official-homepage.webp?url';

type ThemeDisplayData = Omit<BatchShowcaseConfig, 'previewImages'> & {
  previewImages: Array<{ type: string; path: string }>;
};

const display = themeData.display as ThemeDisplayData;

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
    { type: display.previewImages[0].type, url: previewAsset0 }
  ],
  usageGuidance: display.usageGuidance,
  shadows: display.shadows,
  borders: display.borders,
  panels: display.panels,
};

const Component: React.FC = () => <DesignMdBatchShowcase config={config} />;

export default Component;
