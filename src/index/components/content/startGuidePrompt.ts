import type { CanvasAiStartKind } from '../../domains/ai-generation/canvasAiSceneRegistry';
import {
  appendCanvasAiPrototypeStartSystemPrompt,
  getCanvasAiStartSystemPrompt,
  stripCanvasUpdateInstruction,
} from '../../domains/ai-generation/canvasAiSceneRegistry';
import {
  appendCanvasGenerationPromptSettings,
  type CanvasGenerationFinalGuide,
  type CanvasGenerationPromptSettings,
} from '../../domains/ai-generation/canvasGenerationPromptSettings';
import type { CanvasAiScene } from '../../domains/shared/CanvasGenerationComposer';

export function buildStartGuidePrompt({
  kind,
  scene,
  prompt,
  settings,
  finalGuide,
}: {
  kind: CanvasAiStartKind;
  scene: CanvasAiScene;
  prompt: string;
  settings?: CanvasGenerationPromptSettings;
  finalGuide: CanvasGenerationFinalGuide;
}): string {
  const configuredSystemPrompt = getCanvasAiStartSystemPrompt(kind, scene);
  const systemPrompt = finalGuide === 'update-canvas'
    ? configuredSystemPrompt
    : stripCanvasUpdateInstruction(configuredSystemPrompt);
  return appendCanvasGenerationPromptSettings({
    scene,
    prompt: appendCanvasAiPrototypeStartSystemPrompt(prompt, systemPrompt),
    settings,
    finalGuide,
  });
}
