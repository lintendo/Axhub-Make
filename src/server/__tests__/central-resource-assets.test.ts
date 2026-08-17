import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupProjectApiTestRoots,
  createTempRoot,
  scopeProjectApiUrl,
  startTestServer,
  writeProjectMetadata,
} from './projects-api.helpers.ts';

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function encodeResourceCanvasPath(resourcePath: string): string {
  return resourcePath.split('/').filter(Boolean).map((segment) => encodeURIComponent(segment)).join('/');
}

afterEach(() => {
  cleanupProjectApiTestRoots();
});

describe('central resource assets', () => {
  it('stores newly written canvas images and screenshots under the centralized asset root', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    const resourcePath = 'flows/订单.excalidraw';
    const canvasPath = path.join(projectRoot, 'src/resources', resourcePath);
    fs.mkdirSync(path.dirname(canvasPath), { recursive: true });
    fs.writeFileSync(canvasPath, JSON.stringify({ type: 'excalidraw', version: 2, elements: [], appState: {}, files: {} }), 'utf8');
    const server = await startTestServer(projectRoot);

    try {
      const canvasUrl = scopeProjectApiUrl(projectRoot, `${server.origin}/api/canvas/resources/${encodeResourceCanvasPath(resourcePath)}`);
      const saveResponse = await fetch(canvasUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: {
            type: 'excalidraw',
            version: 2,
            elements: [],
            appState: {},
            files: {
              'image-file': { id: 'image-file', mimeType: 'image/png', dataURL: PNG_DATA_URL },
            },
          },
        }),
      });

      expect(saveResponse.status).toBe(200);
      const savedCanvas = JSON.parse(fs.readFileSync(canvasPath, 'utf8'));
      expect(savedCanvas.files['image-file'].path).toBe('.assets/flows/订单.excalidraw/images/image-file.png');
      expect(fs.existsSync(path.join(projectRoot, 'src/resources/.assets/flows/订单.excalidraw/images/image-file.png'))).toBe(true);
      expect(fs.existsSync(path.join(projectRoot, 'src/resources/flows/订单.assets/images/image-file.png'))).toBe(false);

      const screenshotEndpoint = new URL(canvasUrl);
      screenshotEndpoint.pathname += '/screenshot';
      const screenshotResponse = await fetch(screenshotEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl: PNG_DATA_URL }),
      });
      const screenshot = await screenshotResponse.json();

      expect(screenshotResponse.status).toBe(201);
      expect(screenshot.path).toBe('src/resources/.assets/flows/订单.excalidraw/screenshot.png');
      expect(screenshot.screenshotUrl).toContain('/asset/screenshot.png');
      expect(fs.existsSync(path.join(projectRoot, 'src/resources/.assets/flows/订单.excalidraw/screenshot.png'))).toBe(true);
      const imageResponse = await fetch(new URL(screenshot.screenshotUrl, server.origin));
      expect(imageResponse.status).toBe(200);

      const reviewDiagramPath = path.join(projectRoot, 'src/resources/.assets/review/demo.html/diagrams/mermaid-1.excalidraw');
      fs.mkdirSync(path.dirname(reviewDiagramPath), { recursive: true });
      fs.writeFileSync(reviewDiagramPath, JSON.stringify({
        type: 'excalidraw', version: 2, elements: [], appState: {}, files: {},
      }), 'utf8');
      const reviewDiagramUrl = scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/canvas/resources/${encodeResourceCanvasPath('.assets/review/demo.html/diagrams/mermaid-1.excalidraw')}`,
      );
      const reviewDiagramResponse = await fetch(reviewDiagramUrl);
      expect(reviewDiagramResponse.status).toBe(200);
    } finally {
      await server.close();
    }
  });

  it('moves centralized assets when a resource file is moved in the sidebar', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    const resourcesDir = path.join(projectRoot, 'src/resources');
    fs.mkdirSync(path.join(resourcesDir, 'archive'), { recursive: true });
    fs.writeFileSync(path.join(resourcesDir, 'board.excalidraw'), '{}\n', 'utf8');
    const originalAssetPath = path.join(resourcesDir, '.assets/board.excalidraw/screenshot.png');
    fs.mkdirSync(path.dirname(originalAssetPath), { recursive: true });
    fs.writeFileSync(originalAssetPath, 'png', 'utf8');
    const server = await startTestServer(projectRoot);

    try {
      const navigationUrl = scopeProjectApiUrl(projectRoot, `${server.origin}/api/workspace/navigation?tab=docs`);
      const current = await fetch(navigationUrl).then((response) => response.json());
      const archive = current.tree.find((node: any) => node.folderPath === 'archive');
      const board = current.tree.find((node: any) => node.itemKey === 'docs/board.excalidraw');
      expect(archive).toBeTruthy();
      expect(board).toBeTruthy();
      const nextTree = current.tree
        .filter((node: any) => node !== board)
        .map((node: any) => (
          node === archive ? { ...node, children: [...node.children, board] } : node
        ));

      const response = await fetch(navigationUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tree: nextTree }),
      });

      expect(response.status).toBe(200);
      expect(fs.existsSync(path.join(resourcesDir, 'archive/board.excalidraw'))).toBe(true);
      expect(fs.existsSync(path.join(resourcesDir, '.assets/archive/board.excalidraw/screenshot.png'))).toBe(true);
      expect(fs.existsSync(originalAssetPath)).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('moves centralized assets when a resource file is renamed', async () => {
    const projectRoot = createTempRoot();
    writeProjectMetadata(projectRoot);
    const resourcesDir = path.join(projectRoot, 'src/resources');
    const documentPath = path.join(resourcesDir, 'flows/原画布.excalidraw');
    const originalAssetPath = path.join(resourcesDir, '.assets/flows/原画布.excalidraw/screenshot.png');
    fs.mkdirSync(path.dirname(documentPath), { recursive: true });
    fs.writeFileSync(documentPath, '{}\n', 'utf8');
    fs.mkdirSync(path.dirname(originalAssetPath), { recursive: true });
    fs.writeFileSync(originalAssetPath, 'png', 'utf8');
    const server = await startTestServer(projectRoot);

    try {
      const renamed = await fetch(scopeProjectApiUrl(
        projectRoot,
        `${server.origin}/api/docs/${encodeResourceCanvasPath('flows/原画布.excalidraw')}`,
      ), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newBaseName: '新画布' }),
      });

      expect(renamed.status).toBe(200);
      expect(fs.existsSync(path.join(resourcesDir, 'flows/新画布.excalidraw'))).toBe(true);
      expect(fs.existsSync(path.join(resourcesDir, '.assets/flows/新画布.excalidraw/screenshot.png'))).toBe(true);
      expect(fs.existsSync(originalAssetPath)).toBe(false);
    } finally {
      await server.close();
    }
  });
});
