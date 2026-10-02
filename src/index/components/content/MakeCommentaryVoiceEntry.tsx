import { forwardRef, useImperativeHandle, useRef } from 'react';
import {
    AcpVoiceAssistant,
    type AcpVoiceAssistantHandle,
    type AcpVoiceHostTool,
    type AcpVoicePrompt,
    type VoiceFoundationStatus,
} from '@axhub/acp/voice';

export interface MakeCommentaryVoiceEntryProps {
    /** The Make shell decides when the Commentary-only entry is available. */
    enabled: boolean;
    serviceBaseUrl: string;
    tools: readonly AcpVoiceHostTool[];
    prompt: AcpVoicePrompt;
    checkVoiceConfiguration: () => Promise<VoiceFoundationStatus>;
    openSettings: (options: { message: string }) => void;
    className?: string;
}

export type MakeCommentaryVoiceAssistantHandle = AcpVoiceAssistantHandle;

/**
 * Product placement boundary for the public ACP voice surface.
 *
 * Conversation, task, annotation, and page operations are deliberately
 * supplied by Make. This component owns no execution or persistence state.
 */
export const MakeCommentaryVoiceEntry = forwardRef<
    MakeCommentaryVoiceAssistantHandle,
    MakeCommentaryVoiceEntryProps
>(function MakeCommentaryVoiceEntry({
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
        <div data-testid="make-commentary-voice-entry">
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

MakeCommentaryVoiceEntry.displayName = 'MakeCommentaryVoiceEntry';
