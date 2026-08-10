/**
 * @name Chatgpt 主题 - Chatgpt
 */

import './style.css';
import React from 'react';
import { createThemeShowcaseConfig, DesignMdBatchShowcase } from '../../../../common/DesignMdBatchShowcase';
import themeData from '../../theme.json';
import productScreenshot01 from '../../assets/product-screenshot-01.webp?url';
import productScreenshot02 from '../../assets/product-screenshot-02.webp?url';
import productScreenshot03 from '../../assets/product-screenshot-03.webp?url';

const config = createThemeShowcaseConfig({
  theme: themeData,
  imageUrls: {
    'assets/product-screenshot-01.webp': productScreenshot01,
    'assets/product-screenshot-02.webp': productScreenshot02,
    'assets/product-screenshot-03.webp': productScreenshot03,
  },
});

const Component: React.FC = () => (
  <DesignMdBatchShowcase className="chatgpt-theme" config={config} />
);

export default Component;
