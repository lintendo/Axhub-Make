import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildPrototypeSpecCreationPrompt,
  buildPrototypeSpecContentUrl,
  createPrototypeSpecItem,
  prototypeSpecsApi,
  type PrototypeSpecDescriptor,
} from './prototypeSpecs';

const htmlDescriptor: PrototypeSpecDescriptor = {
  exists: true,
  format: 'html',
  activePath: 'spec.html',
  hasHtml: true,
  hasMarkdown: true,
  previewUrl: '/api/projects/make-project/prototypes/home/spec/content',
  editable: false,
};

describe('prototypeSpecsApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('only reads prototype specs through the project-scoped descriptor endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(htmlDescriptor), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

    await expect(prototypeSpecsApi.read('make-project', 'home')).resolves.toEqual(htmlDescriptor);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/make-project/prototypes/home/spec');
    expect(prototypeSpecsApi).not.toHaveProperty('create');
  });

  it('builds an interactive AI prompt instead of choosing a format or template in the UI', () => {
    const promptParams = {
      prototypeId: 'home',
      prototypeFilePath: 'src/prototypes/home/index.tsx',
      reviewUrl: 'http://localhost:51720/?projectId=make-project&p=home&spec=1&sidebar=collapsed',
    };
    const prompt = buildPrototypeSpecCreationPrompt(promptParams);

    expect(prompt).toContain('src/prototypes/home/.spec/spec.html');
    expect(prompt).toContain('src/prototypes/home/.spec/spec.md');
    expect(prompt).toContain('src/resources/templates/规格文档 HTML 模板.html');
    expect(prompt).toContain('src/resources/templates/规格文档 Markdown 模板.md');
    expect(prompt).toContain('Markdown（节省 Token）还是 HTML（体验更好）');
    expect(prompt).toContain('同时存在时以 HTML 为准');
    expect(prompt).toContain('不要同时创建两个主规格');
    expect(prompt).toContain('确认规格前不要修改原型');
    expect(prompt).toContain('规格评审页面的完整 URL');
    expect(prompt).toContain('已拼好的 Make 服务规格评审链接');
    expect(prompt).toContain(promptParams.reviewUrl);
    expect(prompt).toContain('根据我的反馈更新同一份主规格，直到确认');
    expect(prompt).toContain('可以在主规格中链接同目录下的子文档');
    expect(prompt).not.toContain('data-axhub-prototype-spec-document-link');
    expect(prompt).not.toContain('postMessage');
    expect(prompt).not.toContain('onclick');
  });

  it('builds encoded child document URLs', () => {
    expect(buildPrototypeSpecContentUrl('make project', 'order/home', 'documents/结算规则.md'))
      .toBe('/api/projects/make%20project/prototypes/order%2Fhome/spec/content?path=documents%2F%E7%BB%93%E7%AE%97%E8%A7%84%E5%88%99.md');
  });

  it('adapts HTML and Markdown documents to the existing document viewer', () => {
    const htmlItem = createPrototypeSpecItem({
      projectId: 'make-project',
      prototypeId: 'home',
      prototypeFilePath: 'src/prototypes/home/index.tsx',
      descriptor: htmlDescriptor,
      path: 'documents/flow.html',
    });
    expect(htmlItem).toMatchObject({
      name: 'documents/flow.html',
      displayName: 'flow.html',
      filePath: 'src/prototypes/home/.spec/documents/flow.html',
      previewUrl: '/api/projects/make-project/prototypes/home/spec/content?path=documents%2Fflow.html',
      specUrl: '/api/projects/make-project/prototypes/home/spec/content?path=documents%2Fflow.html',
    });

    const markdownItem = createPrototypeSpecItem({
      projectId: 'make-project',
      prototypeId: 'home',
      prototypeFilePath: 'src/prototypes/home/index.tsx',
      descriptor: { ...htmlDescriptor, format: 'markdown', activePath: 'spec.md', editable: true },
      path: 'spec.md',
    });
    expect(markdownItem.previewUrl).toContain('/spec-template.html?url=');
    expect(decodeURIComponent(markdownItem.previewUrl || '')).toContain('/api/projects/make-project/prototypes/home/spec/content?path=spec.md');

    const specOnlyItem = createPrototypeSpecItem({
      projectId: 'make-project',
      prototypeId: 'spec-only',
      prototypeFilePath: 'src/prototypes/spec-only/.spec/spec.html',
      descriptor: htmlDescriptor,
      path: 'spec.html',
    });
    expect(specOnlyItem.filePath).toBe('src/prototypes/spec-only/.spec/spec.html');
  });
});
