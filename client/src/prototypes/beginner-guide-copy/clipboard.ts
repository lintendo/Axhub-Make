type ClipboardLike = {
    writeText?: (text: string) => Promise<void>;
};

type NavigatorLike = {
    clipboard?: ClipboardLike;
};

type CopyTextEnvironment = {
    document?: Document | null;
    navigator?: NavigatorLike | null;
};

function getClipboardEnvironment(): CopyTextEnvironment {
    return {
        document: typeof document === 'undefined' ? null : document,
        navigator: typeof navigator === 'undefined' ? null : navigator,
    };
}

function writeTextWithCopyEvent(text: string, doc: Document | null | undefined): boolean {
    if (!doc || typeof doc.execCommand !== 'function') {
        return false;
    }

    let didWriteClipboardData = false;
    const activeElement = doc.activeElement && typeof (doc.activeElement as HTMLElement).focus === 'function'
        ? doc.activeElement as HTMLElement
        : null;
    const textArea = doc.createElement('textarea');
    const handleCopy = (event: ClipboardEvent) => {
        if (!event.clipboardData) return;
        event.preventDefault();
        event.clipboardData.setData('text/plain', text);
        didWriteClipboardData = true;
    };

    try {
        textArea.value = text;
        textArea.setAttribute('readonly', '');
        Object.assign(textArea.style, {
            position: 'fixed',
            left: '-9999px',
            top: '0',
            opacity: '0',
            pointerEvents: 'none',
        });
        const container = doc.body || doc.documentElement;
        container.appendChild(textArea);
        textArea.focus();
        textArea.select();
        doc.addEventListener('copy', handleCopy, true);
        const didCopy = doc.execCommand('copy');
        return didCopy && didWriteClipboardData;
    } catch {
        return false;
    } finally {
        doc.removeEventListener('copy', handleCopy, true);
        textArea.remove();
        activeElement?.focus?.();
    }
}

export async function copyTextToClipboard(text: string, environment: CopyTextEnvironment = getClipboardEnvironment()): Promise<boolean> {
    if (writeTextWithCopyEvent(text, environment.document)) {
        return true;
    }

    const writeText = environment.navigator?.clipboard?.writeText;
    if (typeof writeText !== 'function') {
        return false;
    }

    try {
        await writeText.call(environment.navigator?.clipboard, text);
        return true;
    } catch {
        return false;
    }
}
