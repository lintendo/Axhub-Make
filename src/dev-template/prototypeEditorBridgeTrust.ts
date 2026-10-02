export interface PrototypeEditorParentEventTrustInput {
  source: MessageEventSource | null;
  origin: string;
  parentWindow: Window;
  trustedOrigin: string;
}

export function isTrustedPrototypeEditorParentEvent({
  source,
  origin,
  parentWindow,
  trustedOrigin,
}: PrototypeEditorParentEventTrustInput): boolean {
  return source === parentWindow
    && Boolean(trustedOrigin)
    && origin === trustedOrigin;
}
