import { forwardRef, useImperativeHandle, useRef } from 'react';
import {
    AcpVoiceAssistant,
    type AcpVoiceAssistantHandle,
    type AcpVoiceHostTool,
    type AcpVoicePrompt,
    type VoiceFoundationStatus,
} from '@axhub/acp/voice';

export interface MakeCanvasVoiceEntryProps {
    enabled: boolean;
    serviceBaseUrl: string;
    tools: readonly AcpVoiceHostTool[];
    prompt: AcpVoicePrompt;
    checkVoiceConfiguration: () => Promise<VoiceFoundationStatus>;
    openSettings: (options: { message: string }) => void;
    className?: string;
}

export type MakeCanvasVoiceAssistantHandle = AcpVoiceAssistantHandle;

export const MakeCanvasVoiceEntry = forwardRef<
    MakeCanvasVoiceAssistantHandle,
    MakeCanvasVoiceEntryProps
>(function MakeCanvasVoiceEntry({
    enabled,
    serviceBaseUrl,
    tools,
    prompt,
    checkVoiceConfiguration,
    openSettings,
    className,
}, ref) {
    const assistantRef = useRef<AcpVoiceAssistantHandle>(null);
    useImperativeHandle(ref, () => ({
        notifyAssistant: (input) => assistantRef.current?.notifyAssistant(input) ?? Promise.resolve(false),
    }), []);

    if (!enabled) return null;
    return (
        <div data-testid="make-canvas-voice-entry">
            <AcpVoiceAssistant
                ref={assistantRef}
                draggable
                injectAcpTools={false}
                injectVoiceControlTools={true}
                serviceBaseUrl={serviceBaseUrl}
                tools={tools}
                prompt={prompt}
                checkVoiceConfiguration={checkVoiceConfiguration}
                openSettings={openSettings}
                className={className}
            />
        </div>
    );
});

MakeCanvasVoiceEntry.displayName = 'MakeCanvasVoiceEntry';
