import type { CanvasAiScene } from '../../domains/shared/CanvasGenerationComposer';

export type ResourceStartPromptScene = Extract<CanvasAiScene, 'design' | 'document'>;
export type ResourceStartPromptImageSize = '1152x2048' | '2048x1152';

export type ResourceStartPromptSelection =
  | { type: 'apply'; prompt: string }
  | { type: 'switch-scene'; scene: ResourceStartPromptScene; prompt: string };

export function applyResourceStartImageSize<T extends object>(
  params: T,
  size: ResourceStartPromptImageSize,
): T & { size: ResourceStartPromptImageSize } {
  return { ...params, size };
}

export function resolveResourceStartPromptSelection({
  card,
  activeScene,
}: {
  card: { scene: ResourceStartPromptScene; prompt: string };
  activeScene: CanvasAiScene;
}): ResourceStartPromptSelection {
  if (card.scene === activeScene) {
    return { type: 'apply', prompt: card.prompt };
  }
  return {
    type: 'switch-scene',
    scene: card.scene,
    prompt: card.prompt,
  };
}
