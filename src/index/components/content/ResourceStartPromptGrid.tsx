import { useEffect, useState } from 'react';
import type { CanvasAiScene } from '../../domains/shared/CanvasGenerationComposer';
import { StartPromptCard, type StartPromptCardIcon } from './StartPromptCard';
import { StartPromptGrid } from './StartPromptGrid';
import {
  resolveResourceStartPromptSelection,
  type ResourceStartPromptImageSize,
  type ResourceStartPromptScene,
} from './resourceStartPromptSelection';

export type ResourceStartPromptCard = {
  id: string;
  scene: ResourceStartPromptScene;
  title: string;
  prompt: string;
  icon: StartPromptCardIcon;
  imageSize?: ResourceStartPromptImageSize;
  prdPlanning?: 'enable' | 'disable';
};

export function ResourceStartPromptGrid({
  cards,
  activeScene,
  disabled,
  copyOnSelect = false,
  selectPrompt,
  onCopyPrompt,
  onExecutePrompt,
  onSceneChange,
  onImageSizeChange,
  onPrdPlanningChange,
}: {
  cards: readonly ResourceStartPromptCard[];
  activeScene: CanvasAiScene;
  disabled: boolean;
  copyOnSelect?: boolean;
  selectPrompt: (prompt: string) => void;
  onCopyPrompt: (card: ResourceStartPromptCard) => void | Promise<void>;
  onExecutePrompt?: (card: ResourceStartPromptCard) => void | Promise<void>;
  onSceneChange: (scene: ResourceStartPromptScene) => void;
  onImageSizeChange: (size: ResourceStartPromptImageSize) => void;
  onPrdPlanningChange: (enabled: boolean) => void;
}) {
  const [pendingSelection, setPendingSelection] = useState<{
    scene: ResourceStartPromptScene;
    prompt: string;
  } | null>(null);

  useEffect(() => {
    if (disabled || !pendingSelection || pendingSelection.scene !== activeScene) return;
    selectPrompt(pendingSelection.prompt);
    setPendingSelection(null);
  }, [activeScene, disabled, pendingSelection, selectPrompt]);

  const handleSelectCard = (card: ResourceStartPromptCard) => {
    if (disabled) return;
    if (copyOnSelect) {
      void onCopyPrompt(card);
      return;
    }
    if (card.imageSize) {
      onImageSizeChange(card.imageSize);
    }
    if (card.prdPlanning) {
      onPrdPlanningChange(card.prdPlanning === 'enable');
    }
    const selection = resolveResourceStartPromptSelection({ card, activeScene });
    if (selection.type === 'apply') {
      selectPrompt(selection.prompt);
      return;
    }
    setPendingSelection({ scene: selection.scene, prompt: selection.prompt });
    onSceneChange(selection.scene);
  };

  return (
    <StartPromptGrid ariaLabel="资源生成能力">
      {cards.map((card) => (
        <StartPromptCard
          key={card.id}
          title={card.title}
          icon={card.icon}
          selectionDisabled={disabled}
          onSelect={() => handleSelectCard(card)}
          onCopy={() => onCopyPrompt(card)}
          onExecute={onExecutePrompt ? () => onExecutePrompt(card) : undefined}
        />
      ))}
    </StartPromptGrid>
  );
}
