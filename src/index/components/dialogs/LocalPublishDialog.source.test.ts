import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource() {
    return readFileSync(resolve(__dirname, './LocalPublishDialog.tsx'), 'utf8');
}

describe('LocalPublishDialog', () => {
    it('publishes immutable HTML snapshots and realtime annotation links', () => {
        const source = readSource();
        expect(source).toContain("apiService.publishLanHtml({ path: normalizedPath }, scope)");
        expect(source).toContain('apiService.publishLanRealtime(');
        expect(source).toContain('buildLANServerUrl(response.url)');
        expect(source).toContain('<QRCode value={currentPreviewUrl}');
        expect(source).not.toContain('commenterName: commenterName.trim() || undefined');
        expect(source).not.toContain('批注者名称');
    });

    it('shows separate annotation and ordinary preview addresses', () => {
        const source = readSource();
        expect(source).toContain("renderLinkRow('批注地址', currentAnnotationUrl)");
        expect(source).toContain("renderLinkRow('普通预览地址', currentPreviewUrl)");
        expect(source).toContain('currentRealtime.annotationUrl || currentRealtime.url');
        expect(source).toContain("currentRealtime ? buildLANServerUrl(currentRealtime.previewUrl) : ''");
        expect(source).toContain('<QRCode value={currentPreviewUrl}');
    });

    it('does not add a second authentication flow to published links', () => {
        const source = readSource();
        expect(source).not.toContain('apiService.getLanAccessStatus()');
        expect(source).not.toContain('lanAuthStatus');
        expect(source).not.toContain('访问状态：');
        expect(source).not.toContain('预览免验证');
        expect(source).not.toContain('沿用网络设置');
        expect(source).not.toContain('批注者称呼由访问者进入实时原型后自行设置');
        expect(source).not.toContain('批注者可在实时原型页面顶部设置自己的称呼');
        expect(source).toContain("toast.success('当前版本原型已发布')");
        expect(source).toContain("'发布当前版本原型失败'");
    });

    it('keeps the dialog copy flat and exposes HTML cancellation only for active links', () => {
        const source = readSource();
        const content = source.slice(source.indexOf('<div className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6">'), source.indexOf('<DialogFooter'));
        expect(source).not.toContain('<DialogDescription');
        expect(source).not.toContain('<DialogHeader');
        expect(source).toContain('<DialogTitle className="sr-only">发布</DialogTitle>');
        expect(source).toContain("apiService.cancelLanPublish('html', { path: normalizedPath }, scope)");
        expect(source).not.toContain('window.confirm(');
        expect(source).toContain("mode === 'html' && currentUrl ? '取消发布' : '关闭'");
        expect(content).not.toContain('border-b');
        expect(content).not.toContain('border-t');
        expect(content).not.toContain('批注权限可在下方调整');
        expect(content).not.toContain('批注包含作者名称和 IP');
    });

    it('loads existing links and keeps realtime comment settings separate from publication lifecycle', () => {
        const source = readSource();
        expect(source).toContain('apiService.getLatestLanPublishing(normalizedPath, scope)');
        expect(source).toContain('const [latest, setLatest]');
        expect(source).toContain('const handleCommentableChange = async (checked: boolean) =>');
        expect(source).toContain("!loadingLatest && mode === 'realtime' && currentRealtime");
        expect(source).toContain('onCheckedChange={(checked) => void handleCommentableChange(checked === true)}');
        expect(source).toContain('previewUrl: currentRealtime.previewUrl || undefined');
        expect(source).toContain('更新');
        expect(source).not.toContain('生成实时链接');
        expect(source).not.toContain('更新当前页面');
        expect(source).not.toContain('实时链接已生成');
        expect(source).not.toContain('canEnableRealtime');
        expect(source).not.toContain('showRealtimeEnableAction');
    });

    it('keeps the comment setting visually separated from the published preview', () => {
        expect(readSource()).toContain('<div className="mt-4 flex items-center justify-between gap-4 py-1">');
    });

    it('puts the settings sheet above publish dialogs', () => {
        const sheetSource = readFileSync(resolve(__dirname, '../../../../src/components/ui/sheet.tsx'), 'utf8');
        expect(sheetSource).toContain('fixed inset-0 z-[200]');
        expect(sheetSource).toContain('fixed z-[200]');
    });

    it('keeps empty states flat and puts primary actions in the content area', () => {
        const source = readSource();
        const footer = source.slice(source.indexOf('<DialogFooter'), source.indexOf('</DialogFooter>'));
        expect(source).toContain('const [commentable, setCommentable] = useState(true);');
        expect(source).toContain('commentable,');
        expect(source).toContain('checked={commentable}');
        expect(source).toContain('onCheckedChange={(checked) => void handleCommentableChange(checked === true)}');
        expect(source).toContain('flex min-h-[170px] flex-col items-center justify-center gap-3 text-center');
        expect(source).toContain('variant="outline"');
        expect(source).not.toContain('variant="brand"');
        expect(source).toContain("mode === 'html' && !currentUrl");
        expect(source).toContain('w-[min(92vw,460px)]');
        expect(source).toContain('border-border bg-card');
        expect(footer).toContain("mode === 'html' && currentUrl ? '取消发布' : '关闭'");
        expect(footer).not.toContain('canPublish');
        expect(source).not.toContain('rounded-md border border-emerald-200');
        expect(source).not.toContain('flex justify-center rounded-md border bg-background');
    });
});
