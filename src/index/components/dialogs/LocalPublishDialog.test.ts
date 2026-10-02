import React from 'react';
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getLatestLanPublishing: vi.fn(),
  publishLanHtml: vi.fn(),
  publishLanRealtime: vi.fn(),
  cancelLanPublish: vi.fn(),
}));

vi.mock('../../services/api', () => ({ apiService: apiMocks }));
vi.mock('../../services/projectScope', () => ({
  requireProjectScope: (projectId: string) => ({ projectId }),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('antd', () => ({
  QRCode: ({ value }: { value: string }) => React.createElement('div', { 'data-qr-value': value }),
}));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, variant: _variant, size: _size, ...props }: any) => (
    React.createElement('button', props, children)
  ),
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: React.PropsWithChildren<{ open: boolean }>) => open ? children : null,
  DialogContent: ({ children }: React.PropsWithChildren) => React.createElement('section', null, children),
  DialogFooter: ({ children }: React.PropsWithChildren) => React.createElement('footer', null, children),
  DialogTitle: ({ children }: React.PropsWithChildren) => React.createElement('h2', null, children),
}));
vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => React.createElement('input', props),
}));
vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, ...props }: any) => React.createElement('button', {
    ...props,
    'data-switch': true,
    'aria-pressed': checked,
    onClick: () => onCheckedChange(!checked),
  }),
}));

import LocalPublishDialog from './LocalPublishDialog';

function nodeText(node: ReactTestInstance | string): string {
  return typeof node === 'string' ? node : node.children.map(nodeText).join('');
}

describe('LocalPublishDialog interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:53817',
        protocol: 'http:',
        hostname: 'localhost',
        port: '53817',
      },
      open: vi.fn(),
      confirm: vi.fn(() => true),
    });
  });

  it('keeps persisted realtime links and only updates the comment setting', async () => {
    const persistedPreviewUrl = 'http://localhost:51720/prototypes/home?agentToolbar=host#page=overview';
    const annotationUrl = 'http://localhost:53817/published/prototype/share-1';
    const onOpenChange = vi.fn();
    apiMocks.getLatestLanPublishing.mockResolvedValue({
      resourcePath: 'src/prototypes/home',
      html: null,
      realtime: {
        shareId: 'share-1',
        commentable: true,
        url: annotationUrl,
        annotationUrl,
        previewUrl: persistedPreviewUrl,
        updatedAt: '2026-08-26T00:00:00.000Z',
      },
    });
    apiMocks.publishLanRealtime.mockResolvedValueOnce({
      shareId: 'share-1',
      resourcePath: 'src/prototypes/home',
      commentable: false,
      url: annotationUrl,
      annotationUrl,
      previewUrl: persistedPreviewUrl,
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(LocalPublishDialog, {
        open: true,
        mode: 'realtime',
        projectId: 'project-a',
        targetPath: 'src/prototypes/home',
        previewUrl: persistedPreviewUrl,
        onOpenChange,
      }));
      await Promise.resolve();
    });

    expect(renderer!.root.findAllByType('input').map((input) => input.props.value))
      .toEqual([annotationUrl, persistedPreviewUrl]);
    expect(renderer!.root.findByProps({ 'data-qr-value': persistedPreviewUrl })).toBeTruthy();

    await act(async () => {
      renderer!.root.findByProps({ 'data-switch': true }).props.onClick();
      await Promise.resolve();
    });
    expect(apiMocks.publishLanRealtime).toHaveBeenNthCalledWith(1, {
      path: 'src/prototypes/home',
      previewUrl: persistedPreviewUrl,
      commentable: false,
    }, { projectId: 'project-a' });

    expect(renderer!.root.findAllByType('button').some((button) => nodeText(button).includes('更新当前页面')))
      .toBe(false);
    expect(apiMocks.publishLanRealtime).toHaveBeenCalledTimes(1);

    const closeButton = renderer!.root.findAllByType('button')
      .find((button) => nodeText(button) === '关闭');
    expect(closeButton).toBeTruthy();
    await act(async () => {
      closeButton!.props.onClick();
      await Promise.resolve();
    });
    expect(apiMocks.cancelLanPublish).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('cancels an HTML publication without a browser confirmation', async () => {
    const publishedUrl = 'http://localhost:53817/published/html/publish-1/index.html';
    const onOpenChange = vi.fn();
    apiMocks.getLatestLanPublishing.mockResolvedValue({
      resourcePath: 'src/prototypes/home',
      html: {
        publishId: 'publish-1',
        version: 1,
        url: publishedUrl,
        createdAt: '2026-08-26T00:00:00.000Z',
      },
      realtime: null,
    });
    apiMocks.cancelLanPublish.mockResolvedValue({ success: true, removed: true });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(LocalPublishDialog, {
        open: true,
        mode: 'html',
        projectId: 'project-a',
        targetPath: 'src/prototypes/home',
        onOpenChange,
      }));
      await Promise.resolve();
    });

    const cancelButton = renderer!.root.findAllByType('button')
      .find((button) => nodeText(button).includes('取消发布'));
    expect(cancelButton).toBeTruthy();
    await act(async () => {
      cancelButton!.props.onClick();
      await Promise.resolve();
    });
    expect(window.confirm).not.toHaveBeenCalled();
    expect(apiMocks.cancelLanPublish).toHaveBeenCalledWith(
      'html',
      { path: 'src/prototypes/home' },
      { projectId: 'project-a' },
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
