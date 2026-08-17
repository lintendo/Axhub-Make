/**
 * 全局顶部居中成功/提示条
 * 2 秒后自动消失，支持成功/警告两种样式
 */
import React, { useEffect } from 'react';
import { Check, X } from 'lucide-react';

export interface SuccessTipProps {
  visible: boolean;
  message?: React.ReactNode;
  type?: 'success' | 'warning' | 'error';
  duration?: number;
  onClose?: () => void;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  'data-testid'?: string;
}

export function SuccessTip({
  visible,
  message,
  type = 'success',
  duration = 2000,
  onClose,
  icon,
  children,
  'data-testid': dataTestId,
}: SuccessTipProps) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      onClose?.();
    }, duration);
    return () => clearTimeout(timer);
  }, [visible, duration, onClose]);

  if (!visible) return null;

  const defaultIcon = type === 'success' ? <Check size={18} /> : <X size={18} />;
  const content = children ?? message;

  return (
    <div
      className={`hp-success-tip hp-success-tip--${type}`}
      role="status"
      aria-live="polite"
      data-testid={dataTestId}
    >
      {icon ?? defaultIcon}
      <span>{content}</span>
    </div>
  );
}
