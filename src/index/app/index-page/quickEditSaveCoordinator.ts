import {
    buildQuickEditSaveConfirmation,
    mergeQuickEditSaveDrafts,
    type QuickEditSaveAction,
    type QuickEditSaveCommitResult,
    type QuickEditSaveDialogInput,
    type QuickEditSaveDraft,
    type QuickEditSavePreflight,
} from '../../../common/quickEditSave';

export type QuickEditSaveTargetPreparation = {
    supported: boolean;
    draft: QuickEditSaveDraft | null;
};

export type QuickEditSaveTarget = {
    id: string;
    prepare: (action: QuickEditSaveAction) => Promise<QuickEditSaveTargetPreparation>;
    preflight: (draft: QuickEditSaveDraft) => Promise<QuickEditSavePreflight>;
    commit: (draft: QuickEditSaveDraft) => Promise<QuickEditSaveCommitResult>;
};

export type QuickEditSaveCoordinatorResult = {
    handled: boolean;
    committed: boolean;
};

export type QuickEditSaveCoordinatorOptions = {
    action: QuickEditSaveAction;
    targets: readonly QuickEditSaveTarget[];
    confirm: (dialog: QuickEditSaveDialogInput) => Promise<boolean>;
    notify?: {
        warning?: (content: string) => void;
        error?: (content: string) => void;
    };
};

function uniqueTargets(targets: readonly QuickEditSaveTarget[]): QuickEditSaveTarget[] {
    const seen = new Set<string>();
    return targets.filter((target) => {
        const id = String(target.id || '').trim();
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

async function executeQuickEditSave(
    options: QuickEditSaveCoordinatorOptions,
): Promise<QuickEditSaveCoordinatorResult> {
    const targets = uniqueTargets(options.targets);
    const prepared = await Promise.all(targets.map(async (target) => {
        try {
            return { target, result: await target.prepare(options.action), error: null };
        } catch (error) {
            return {
                target,
                result: { supported: false, draft: null } satisfies QuickEditSaveTargetPreparation,
                error,
            };
        }
    }));
    const capable = prepared.filter((item) => item.result.supported);
    if (capable.length === 0) {
        const error = prepared.find((item) => item.error)?.error;
        if (error) {
            console.error('[Axhub] 快速编辑保存预检查失败:', error);
            options.notify?.error?.('快速编辑保存操作失败');
        } else {
            options.notify?.warning?.('当前客户端页面尚未接入快速编辑保存能力，请确认预览页已加载 DevTemplateBootstrap 或 HtmlTemplateBootstrap');
        }
        return { handled: false, committed: false };
    }

    const drafts = capable
        .map((item) => ({ target: item.target, draft: item.result.draft }))
        .filter((item): item is { target: QuickEditSaveTarget; draft: QuickEditSaveDraft } => Boolean(item.draft));
    if (drafts.length === 0) {
        return { handled: true, committed: false };
    }

    const merged = mergeQuickEditSaveDrafts(drafts.map((item) => item.draft));
    if (!merged.ok) {
        options.notify?.error?.(merged.message);
        return { handled: true, committed: false };
    }

    const owner = drafts[0].target;
    let preflight: QuickEditSavePreflight;
    try {
        preflight = await owner.preflight(merged.draft);
    } catch (error) {
        console.error('[Axhub] 快速编辑保存预检查失败:', error);
        options.notify?.error?.('快速编辑保存操作失败');
        return { handled: true, committed: false };
    }

    let confirmed: boolean;
    try {
        confirmed = await options.confirm(buildQuickEditSaveConfirmation(preflight));
    } catch (error) {
        console.error('[Axhub] 快速编辑保存确认失败:', error);
        options.notify?.error?.('快速编辑保存操作失败');
        return { handled: true, committed: false };
    }
    if (!confirmed) {
        return { handled: true, committed: false };
    }

    try {
        await owner.commit(merged.draft);
        return { handled: true, committed: true };
    } catch (error) {
        console.error('[Axhub] 快速编辑保存提交失败:', error);
        options.notify?.error?.('快速编辑保存操作失败');
        return { handled: true, committed: false };
    }
}

export function createQuickEditSaveCoordinator() {
    const inFlight = new Map<QuickEditSaveAction, Promise<QuickEditSaveCoordinatorResult>>();

    const run = (options: QuickEditSaveCoordinatorOptions) => {
        const existing = inFlight.get(options.action);
        if (existing) return existing;

        const operation = executeQuickEditSave(options).finally(() => {
            if (inFlight.get(options.action) === operation) {
                inFlight.delete(options.action);
            }
        });
        inFlight.set(options.action, operation);
        return operation;
    };

    return { run };
}
