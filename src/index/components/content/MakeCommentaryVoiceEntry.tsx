import {
    AcpVoiceAssistant,
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

/**
 * Product placement boundary for the public ACP voice surface.
 *
 * Conversation, task, annotation, and page operations are deliberately
 * supplied by Make. This component owns no execution or persistence state.
 */
export function MakeCommentaryVoiceEntry({
    enabled,
    serviceBaseUrl,
    tools,
    prompt,
    checkVoiceConfiguration,
    openSettings,
    className,
}: MakeCommentaryVoiceEntryProps) {
    if (!enabled) return null;

    return (
        <div data-testid="make-commentary-voice-entry">
            <AcpVoiceAssistant
                draggable
                injectAcpTools={false}
                serviceBaseUrl={serviceBaseUrl}
                tools={tools}
                prompt={prompt}
                checkVoiceConfiguration={checkVoiceConfiguration}
                openSettings={openSettings}
                className={className}
            />
        </div>
    );
}
