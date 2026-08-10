/**
 * @name Google Calendar 主题 - Google Calendar
 */

import './style.css';
import React from 'react';
import { DesignMdBatchShowcase, type BatchMobilePreview, type BatchShowcaseConfig } from '../../../../common/DesignMdBatchShowcase';
import themeData from '../../theme.json';
import productScreenshot01 from '../../assets/product-screenshot-01.webp?url';
import productScreenshot02 from '../../assets/product-screenshot-02.webp?url';
import productScreenshot03 from '../../assets/product-screenshot-03.webp?url';

type ThemeDisplayData = Omit<BatchShowcaseConfig, 'previewImages' | 'mobilePreview'> & {
  previewImages: Array<{ type: string; path: string }>;
  mobilePreview?: unknown;
};

const display = themeData.display as ThemeDisplayData;

function isMobilePreviewPattern(value: unknown): value is BatchMobilePreview['pattern'] {
  return value === 'feed'
    || value === 'chat'
    || value === 'finance'
    || value === 'map'
    || value === 'workspace'
    || value === 'health'
    || value === 'commerce'
    || value === 'media'
    || value === 'dating'
    || value === 'assistant';
}

function isThreeItemStringTuple(value: unknown): value is [string, string, string] {
  return Array.isArray(value)
    && value.length === 3
    && value.every(item => typeof item === 'string' && item.trim().length > 0);
}

function hasMobilePreviewFields(value: unknown): value is {
  pattern: unknown;
  navigation: unknown;
  primaryAction: unknown;
} {
  return !!value
    && typeof value === 'object'
    && 'pattern' in value
    && 'navigation' in value
    && 'primaryAction' in value;
}

function normalizeMobilePreview(value: unknown): BatchMobilePreview | undefined {
  if (!hasMobilePreviewFields(value)
    || !isMobilePreviewPattern(value.pattern)
    || !isThreeItemStringTuple(value.navigation)
    || typeof value.primaryAction !== 'string'
    || value.primaryAction.trim().length === 0) return undefined;
  return {
    pattern: value.pattern,
    navigation: [value.navigation[0], value.navigation[1], value.navigation[2]],
    primaryAction: value.primaryAction,
  };
}

const mobilePreview = normalizeMobilePreview(display.mobilePreview);

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
  mobilePreview,
};

const Component: React.FC = () => <DesignMdBatchShowcase config={config} />;

export default Component;
