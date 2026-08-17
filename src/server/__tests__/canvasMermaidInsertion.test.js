import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { insertConvertedMermaidIntoCanvasData, insertConvertedMermaidIntoCanvasFile } from '../canvasMermaidInsertion.ts';
describe('canvas mermaid insertion helper', () => {
    const tempPaths = [];
    afterEach(() => {
        for (const filePath of tempPaths) {
            fs.rmSync(filePath, { recursive: true, force: true });
        }
        tempPaths.length = 0;
    });
    it('adds converted mermaid elements and files to canvas data', () => {
        const { canvasData, result } = insertConvertedMermaidIntoCanvasData({
            type: 'excalidraw',
            version: 2,
            elements: [{ id: 'keep', type: 'rectangle', x: 10, y: 20, version: 1 }],
            files: { existing: { id: 'existing' } },
        }, {
            elements: [
                { id: 'mermaid-a', type: 'rectangle', x: 100, y: 200, version: 1 },
                { id: 'mermaid-b', type: 'ellipse', x: 140, y: 240, version: 1 },
            ],
            files: { mermaidFile: { id: 'mermaidFile' } },
            position: { x: 300, y: 400 },
        });
        expect(result).toEqual({
            insertedElementIds: ['mermaid-a', 'mermaid-b'],
            fileIds: ['mermaidFile'],
            changed: true,
        });
        expect(canvasData.elements).toHaveLength(3);
        expect(canvasData.files).toMatchObject({
            existing: { id: 'existing' },
            mermaidFile: { id: 'mermaidFile' },
        });
        expect(canvasData.elements[1]).toMatchObject({ x: 300, y: 400, version: 2, isDeleted: false });
        expect(canvasData.elements[2]).toMatchObject({ x: 340, y: 440, version: 2, isDeleted: false });
    });
    it('writes converted mermaid data back to a canvas file', () => {
        const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-mermaid-canvas-')), 'canvas.excalidraw');
        tempPaths.push(filePath, path.dirname(filePath));
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify({
            type: 'excalidraw',
            version: 2,
            elements: [],
            files: {},
            appState: {},
        }, null, 2), 'utf8');
        const result = insertConvertedMermaidIntoCanvasFile(filePath, {
            elements: [{ id: 'mermaid-a', type: 'rectangle', x: 0, y: 0, version: 1 }],
            position: { x: 24, y: 48 },
        });
        const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        expect(result.insertedElementIds).toEqual(['mermaid-a']);
        expect(saved.elements).toHaveLength(1);
        expect(saved.elements[0]).toMatchObject({ x: 24, y: 48, version: 2 });
    });
});
