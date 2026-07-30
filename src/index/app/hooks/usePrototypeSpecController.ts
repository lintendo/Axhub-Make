import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ItemData } from '../../types';
import {
    buildPrototypeSpecCreationPrompt,
    createPrototypeSpecItem,
    prototypeSpecsApi,
    type PrototypeSpecDescriptor,
} from '../../services/prototypeSpecs';
import { buildIndexDeepLinkUrl } from '../index-page/resourceDeepLink';

export function createPrototypeSpecRequestGate() {
    let version = 0;
    return {
        begin() {
            const requestVersion = ++version;
            return { isCurrent: () => requestVersion === version };
        },
        invalidate() {
            version += 1;
        },
    };
}

export function createPrototypeSpecAutoOpenGate() {
    let openedKey = '';
    return {
        shouldOpen(enabled: boolean, key: string) {
            const normalizedKey = String(key || '').trim();
            if (!enabled || !normalizedKey || openedKey === normalizedKey) return false;
            openedKey = normalizedKey;
            return true;
        },
    };
}

export function shouldClosePrototypeSpecAfterAnnotationAttempt(params: {
    enabled: boolean;
    attemptedItem: ItemData | null;
    currentItem: ItemData | null;
    attemptId: number;
    latestAttemptId: number;
}): boolean {
    return !params.enabled
        && params.attemptedItem !== null
        && params.attemptedItem === params.currentItem
        && params.attemptId === params.latestAttemptId;
}

export function usePrototypeSpecController(params: {
    activeProjectId: string | null;
    selectedItem: ItemData | null;
    autoOpen?: boolean;
    onError?: (message: string) => void;
}) {
    const { activeProjectId, selectedItem, autoOpen, onError } = params;
    const [descriptor, setDescriptor] = useState<PrototypeSpecDescriptor | null>(null);
    const [currentPath, setCurrentPath] = useState('');
    const [promptOpen, setPromptOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const requestGateRef = useRef(createPrototypeSpecRequestGate());
    const autoOpenGateRef = useRef(createPrototypeSpecAutoOpenGate());
    const prototypeId = String(selectedItem?.resourceId || selectedItem?.name || '').trim();
    const prototypeFilePath = String(selectedItem?.filePath || '').trim();
    const resetKey = `${activeProjectId || ''}:${prototypeId}`;
    const isSupported = Boolean(activeProjectId && prototypeId && prototypeFilePath);

    const close = useCallback(() => {
        requestGateRef.current.invalidate();
        setDescriptor(null);
        setCurrentPath('');
        setPromptOpen(false);
        setLoading(false);
        setError('');
    }, []);

    useEffect(() => {
        close();
    }, [close, resetKey]);

    const open = useCallback(async () => {
        if (!activeProjectId || !prototypeId || !prototypeFilePath) return;
        const request = requestGateRef.current.begin();
        setLoading(true);
        setError('');
        try {
            const nextDescriptor = await prototypeSpecsApi.read(activeProjectId, prototypeId);
            if (!request.isCurrent()) return;
            if (!nextDescriptor.exists || !nextDescriptor.activePath) {
                setPromptOpen(true);
                return;
            }
            setDescriptor(nextDescriptor);
            setCurrentPath(nextDescriptor.activePath);
        } catch (nextError: any) {
            if (!request.isCurrent()) return;
            const message = nextError?.message || '读取原型规格失败';
            setError(message);
            onError?.(message);
        } finally {
            if (request.isCurrent()) setLoading(false);
        }
    }, [activeProjectId, onError, prototypeFilePath, prototypeId]);

    useEffect(() => {
        if (!autoOpenGateRef.current.shouldOpen(Boolean(autoOpen && isSupported), resetKey)) return;
        void open();
    }, [autoOpen, isSupported, open, resetKey]);

    const navigate = useCallback((targetPath: string) => {
        const nextPath = String(targetPath || '').trim();
        if (nextPath) setCurrentPath(nextPath);
    }, []);

    const currentItem = useMemo(() => {
        if (!activeProjectId || !prototypeId || !descriptor || !currentPath) return null;
        return createPrototypeSpecItem({
            projectId: activeProjectId,
            prototypeId,
            prototypeFilePath,
            descriptor,
            path: currentPath,
        });
    }, [activeProjectId, currentPath, descriptor, prototypeFilePath, prototypeId]);

    const reviewUrl = useMemo(() => {
        if (!activeProjectId || !prototypeId || typeof window === 'undefined') return '';
        return buildIndexDeepLinkUrl({
            resourceType: 'prototype',
            resourceId: prototypeId,
            projectId: activeProjectId,
            openSpec: true,
            collapseSidebar: true,
        }, window.location.href);
    }, [activeProjectId, prototypeId]);

    const prompt = useMemo(() => buildPrototypeSpecCreationPrompt({
        prototypeId,
        prototypeFilePath,
        reviewUrl,
    }), [prototypeFilePath, prototypeId, reviewUrl]);

    return {
        isOpen: Boolean(descriptor && currentPath),
        isSupported,
        promptOpen,
        setPromptOpen,
        prompt,
        promptTargetPath: prototypeFilePath,
        loading,
        error,
        descriptor,
        currentPath,
        currentItem,
        open,
        close,
        navigate,
    };
}
