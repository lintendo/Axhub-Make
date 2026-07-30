import { describe, expect, it, vi } from 'vitest';

import type { ItemData } from '../../types';
import { handleDocumentResourceNavigationMessage } from './useDocumentResourceNavigation';

function doc(name: string, openMode: ItemData['openMode']): ItemData {
  return {
    name,
    resourceId: name,
    displayName: name,
    jsUrl: '',
    specUrl: '',
    openMode,
  };
}

describe('handleDocumentResourceNavigationMessage', () => {
  const sourceWindow = {} as Window;
  const projectDoc = doc('kangbaobao/PROJECT', 'document');
  const screenshot = doc('kangbaobao/pages/home/screenshot.png', 'image');
  const dataJson = doc('kangbaobao/pages/home/data.json', 'file');

  it('resolves current-project Markdown, image, and file resources', () => {
    const navigate = vi.fn();
    const options = {
      enabled: true,
      appOrigin: 'http://localhost:53817',
      sourceWindow,
      projectId: 'make-project',
      docs: [projectDoc, screenshot, dataJson],
      navigate,
    };

    expect(handleDocumentResourceNavigationMessage({
      origin: options.appOrigin,
      source: sourceWindow,
      data: {
        type: 'axhub-document-resource:navigate',
        resourceType: 'doc',
        resourceId: 'kangbaobao/PROJECT.md',
      },
    } as MessageEvent, options)).toBe(true);
    expect(navigate).toHaveBeenLastCalledWith(projectDoc, 'demo');

    expect(handleDocumentResourceNavigationMessage({
      origin: options.appOrigin,
      source: sourceWindow,
      data: {
        type: 'axhub-document-resource:navigate',
        resourceType: 'doc',
        resourceId: screenshot.name,
      },
    } as MessageEvent, options)).toBe(true);
    expect(navigate).toHaveBeenLastCalledWith(screenshot, 'demo');

    expect(handleDocumentResourceNavigationMessage({
      origin: options.appOrigin,
      source: sourceWindow,
      data: {
        type: 'axhub-document-resource:navigate',
        resourceType: 'doc',
        resourceId: dataJson.name,
      },
    } as MessageEvent, options)).toBe(true);
    expect(navigate).toHaveBeenLastCalledWith(dataJson, 'demo');
  });

  it('resolves current-project internal Markdown document paths', () => {
    const navigate = vi.fn();
    const options = {
      enabled: true,
      appOrigin: 'http://localhost:53817',
      sourceWindow,
      projectId: 'make-project',
      docs: [],
      navigate,
    };

    expect(handleDocumentResourceNavigationMessage({
      origin: options.appOrigin,
      source: sourceWindow,
      data: {
        type: 'axhub-document-resource:navigate',
        resourceType: 'project-doc',
        resourceId: 'src/prototypes/home/docs/prd-04.md',
      },
    } as MessageEvent, options)).toBe(true);
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({
      projectDocumentPath: 'src/prototypes/home/docs/prd-04.md',
    }), 'demo');
  });

  it('rejects the wrong origin, source window, message type, resource type, and missing resources', () => {
    const navigate = vi.fn();
    const options = {
      enabled: true,
      appOrigin: 'http://localhost:53817',
      sourceWindow,
      projectId: 'make-project',
      docs: [projectDoc],
      navigate,
    };
    const validData = {
      type: 'axhub-document-resource:navigate',
      resourceType: 'doc',
      resourceId: 'kangbaobao/PROJECT.md',
    };

    for (const event of [
      { origin: 'http://evil.example', source: sourceWindow, data: validData },
      { origin: options.appOrigin, source: {} as Window, data: validData },
      { origin: options.appOrigin, source: sourceWindow, data: { ...validData, type: 'other' } },
      { origin: options.appOrigin, source: sourceWindow, data: { ...validData, resourceType: 'theme' } },
      { origin: options.appOrigin, source: sourceWindow, data: { ...validData, resourceId: 'missing.md' } },
      {
        origin: options.appOrigin,
        source: sourceWindow,
        data: { ...validData, resourceType: 'project-doc', resourceId: '../outside.md' },
      },
    ]) {
      expect(handleDocumentResourceNavigationMessage(event as MessageEvent, options)).toBe(false);
    }
    expect(navigate).not.toHaveBeenCalled();
  });
});
