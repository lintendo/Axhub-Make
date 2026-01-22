import React from 'react';
import { Descriptions, Typography } from 'antd';

const { Text } = Typography;

interface TypographyProps {
  tokens: Record<string, any>;
}

export const TypographySection: React.FC<TypographyProps> = ({ tokens }) => {
  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 mb-4">排版 Typography</h1>
        <p className="text-neutral-600 mb-8">
          字体系统确保在各种尺寸下的可读性。
        </p>

        <Descriptions bordered column={1}>
          <Descriptions.Item label="字体家族 (Font Family)">
            <Text code copyable style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {tokens.fontFamily}
            </Text>
            <div style={{ marginTop: 8, fontSize: 16, fontFamily: tokens.fontFamily }}>
              天地玄黄，宇宙洪荒。The quick brown fox jumps over the lazy dog.
            </div>
          </Descriptions.Item>
          <Descriptions.Item label="基础字号 (Font Size)">
            <Text code>{tokens.fontSize}px</Text>
          </Descriptions.Item>
          <Descriptions.Item label="基础行高 (Line Height)">
            <Text code>{tokens.lineHeight || 1.5}</Text>
          </Descriptions.Item>
        </Descriptions>
      </div>
    </div>
  );
};
