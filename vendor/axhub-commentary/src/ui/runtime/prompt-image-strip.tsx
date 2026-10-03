import React from 'react';
import { CloseOutlined } from '@ant-design/icons';
import { EDITOR_CHROME } from './theme';
import type { PromptImageAttachment } from '../../core/editor/state';

export interface PromptImageStripProps {
  images: readonly PromptImageAttachment[];
  onRemoveImage: (imageId: string) => void;
  readOnly?: boolean;
}

const THUMB_SIZE = 28;
const PREVIEW_WIDTH = 220;
const PREVIEW_HEIGHT = 160;
const IMAGE_RADIUS = 12;

export function PromptImageStrip(props: PromptImageStripProps): React.ReactElement | null {
  const { images, onRemoveImage, readOnly = false } = props;
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  if (images.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}
    >
      {images.map((image) => {
        const hovered = hoveredId === image.id;
        const canRemove = !readOnly;
        return (
          <div
            key={image.id}
            onMouseEnter={() => setHoveredId(image.id)}
            onMouseLeave={() => setHoveredId((current) => (current === image.id ? null : current))}
            style={{
              position: 'relative',
              width: THUMB_SIZE,
              height: THUMB_SIZE,
            }}
          >
            {hovered ? (
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: THUMB_SIZE + 10,
                  transform: 'translateX(-50%)',
                  width: PREVIEW_WIDTH,
                  height: PREVIEW_HEIGHT,
                  padding: 8,
                  borderRadius: IMAGE_RADIUS,
                  background: EDITOR_CHROME.surface,
                  border: `1px solid ${EDITOR_CHROME.borderStrong}`,
                  boxShadow: EDITOR_CHROME.shadow,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                }}
              >
                <img
                  src={image.data}
                  alt={image.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    borderRadius: IMAGE_RADIUS,
                    background: EDITOR_CHROME.surfaceMuted,
                  }}
                />
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (hovered && canRemove) {
                  onRemoveImage(image.id);
                }
              }}
              style={{
                width: THUMB_SIZE,
                height: THUMB_SIZE,
                borderRadius: IMAGE_RADIUS,
                overflow: 'hidden',
                border: `1px solid ${hovered && canRemove ? EDITOR_CHROME.borderStrong : EDITOR_CHROME.border}`,
                background: hovered && canRemove ? EDITOR_CHROME.surfaceElevated : EDITOR_CHROME.surfaceMuted,
                padding: 0,
                cursor: hovered && canRemove ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: hovered ? EDITOR_CHROME.shadow : 'none',
              }}
            >
              {hovered && canRemove ? (
                <CloseOutlined style={{ fontSize: 12, color: EDITOR_CHROME.textPrimary }} />
              ) : (
                <img
                  src={image.data}
                  alt={image.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
