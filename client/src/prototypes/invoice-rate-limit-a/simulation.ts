export type InvoiceFileStatus =
    | 'queued'
    | 'uploading'
    | 'rate-limited'
    | 'retrying'
    | 'completed'
    | 'failed'
    | 'cancelled';

export interface InvoiceFile {
    id: string;
    name: string;
    sizeLabel: string;
    status: InvoiceFileStatus;
    retries: number;
    progress: number;
}

export type SimulationEventKind =
    | 'start'
    | 'cleanup'
    | 'timer'
    | 'file'
    | 'guard'
    | 'complete';

export interface SimulationEvent {
    id: number;
    kind: SimulationEventKind;
    message: string;
}

export interface RunInvoiceSimulationOptions {
    files: readonly InvoiceFile[];
    patchFile: (id: string, patch: Partial<InvoiceFile>) => void;
    delay: (ms: number) => Promise<void>;
    isCancelled: () => boolean;
    record: (kind: SimulationEventKind, message: string) => void;
}

export class SimulationAbortError extends Error {
    constructor() {
        super('invoice-simulation-aborted');
        this.name = 'AbortError';
    }
}

export function createInvoiceFiles(): InvoiceFile[] {
    return Array.from({ length: 16 }, (_, index) => ({
        id: `invoice-${String(index + 1).padStart(2, '0')}`,
        name: `invoice-2026-${String(index + 1).padStart(2, '0')}.pdf`,
        sizeLabel: `${420 + index * 37} KB`,
        status: 'queued',
        retries: 0,
        progress: 0,
    }));
}

function cancelledPatch(file: InvoiceFile): Partial<InvoiceFile> {
    return file.status === 'completed'
        ? {}
        : { status: 'cancelled' };
}

export async function runInvoiceSimulation(
    options: RunInvoiceSimulationOptions,
): Promise<void> {
    const {
        files,
        patchFile,
        delay,
        isCancelled,
        record,
    } = options;

    const runFile = async (file: InvoiceFile, index: number) => {
        if (isCancelled()) {
            patchFile(file.id, cancelledPatch(file));
            return;
        }

        patchFile(file.id, { status: 'uploading', progress: 18 });
        record('file', `${file.name} 开始上传`);
        await delay(90 + index * 4);

        if (isCancelled()) {
            patchFile(file.id, cancelledPatch(file));
            return;
        }

        if (index % 4 === 0) {
            for (let retry = 1; retry <= 2; retry += 1) {
                patchFile(file.id, {
                    status: 'rate-limited',
                    retries: retry,
                    progress: 24 + retry * 12,
                });
                record('file', `${file.name} 收到 429，第 ${retry} 次退避`);
                await delay(110 * 2 ** (retry - 1));

                if (isCancelled()) {
                    patchFile(file.id, cancelledPatch(file));
                    return;
                }

                patchFile(file.id, {
                    status: 'retrying',
                    retries: retry,
                    progress: 42 + retry * 18,
                });
                await delay(45);

                if (isCancelled()) {
                    patchFile(file.id, cancelledPatch(file));
                    return;
                }
            }
        }

        patchFile(file.id, {
            status: 'completed',
            progress: 100,
        });
        record('file', `${file.name} 上传完成`);
    };

    await Promise.all(files.map((file, index) => runFile(file, index)));
}
