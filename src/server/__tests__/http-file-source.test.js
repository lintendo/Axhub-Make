import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
describe('server sendFile source', () => {
    it('streams files without synchronously buffering the whole file body', () => {
        const source = readFileSync(resolve(__dirname, '../http.ts'), 'utf8');
        expect(source).toContain('fs.createReadStream(filePath)');
        expect(source).toContain('.pipe(res)');
        expect(source).not.toContain('res.end(fs.readFileSync(filePath))');
    });
});
