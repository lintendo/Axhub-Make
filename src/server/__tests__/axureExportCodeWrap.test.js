import { describe, expect, it } from 'vitest';
import { wrapSourceAsAxureExportCode } from '../axureExportCodeWrap.ts';
describe('Axure export source wrapper', () => {
    it('omits CSS injection for blank CSS input', () => {
        const wrapped = wrapSourceAsAxureExportCode('window.__AXHUB_DEFINE_COMPONENT__(Component);', {
            css: '  \n\t',
        });
        expect(wrapped).not.toContain('document.createElement("style")');
        expect(wrapped).toContain('var UserComponent;');
    });
    it('injects trimmed CSS as a JSON string before running component code', () => {
        const wrapped = wrapSourceAsAxureExportCode('window.__AXHUB_DEFINE_COMPONENT__(Component);', {
            css: '\n.root::before { content: "</script>"; }\n',
        });
        expect(wrapped.indexOf('document.createElement("style")')).toBeLessThan(wrapped.indexOf('var UserComponent;'));
        expect(wrapped).toContain('style.textContent = ".root::before { content: \\"</script>\\"; }";');
    });
    it('replaces process.env.NODE_ENV references so exported bundles run without process', () => {
        const wrapped = wrapSourceAsAxureExportCode(`
if (process.env.NODE_ENV !== 'production') {
  console.log(process.env.NODE_ENV);
}
`);
        expect(wrapped).not.toContain('process.env.NODE_ENV');
        expect(wrapped).toContain('"production" !== \'production\'');
        expect(wrapped).toContain('console.log("production")');
    });
    it('captures and bridges components registered through window.__AXHUB_DEFINE_COMPONENT__', () => {
        const wrapped = wrapSourceAsAxureExportCode('window.__AXHUB_DEFINE_COMPONENT__(Component);');
        expect(wrapped).toContain('var __origDefine__ = typeof window !== \'undefined\' ? window.__AXHUB_DEFINE_COMPONENT__ : undefined;');
        expect(wrapped).toContain('window.__AXHUB_DEFINE_COMPONENT__ = function(C)');
        expect(wrapped).toContain('UserComponent = __capturedComponent__;');
        expect(wrapped).toContain('window.Component = Component;');
    });
});
