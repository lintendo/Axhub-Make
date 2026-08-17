export async function executePromptCardCurrentElementAction(options: {
  currentTarget: Element | null;
  onConfirmText: () => Promise<void>;
  onConfirmNote: () => Promise<void>;
  onSendCurrentElementPromptToAgent?: ((
    element: Element,
  ) => void | Promise<void>) | undefined;
}): Promise<boolean> {
  const {
    currentTarget,
    onConfirmText,
    onConfirmNote,
    onSendCurrentElementPromptToAgent,
  } = options;

  if (!currentTarget || !onSendCurrentElementPromptToAgent) {
    return false;
  }

  await onConfirmText();
  await onConfirmNote();
  await onSendCurrentElementPromptToAgent(currentTarget);
  return true;
}
