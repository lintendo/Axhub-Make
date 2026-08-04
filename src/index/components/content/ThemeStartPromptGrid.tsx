import { StartPromptCard, type StartPromptCardIcon } from './StartPromptCard';

export type ThemeStartPromptCard = {
  id: string;
  title: string;
  prompt: string;
  icon: StartPromptCardIcon;
};

export function ThemeStartPromptGrid({
  cards,
  disabled,
  selectPrompt,
  onCopyPrompt,
}: {
  cards: readonly ThemeStartPromptCard[];
  disabled: boolean;
  selectPrompt: (prompt: string) => void;
  onCopyPrompt: (card: ThemeStartPromptCard) => void | Promise<void>;
}) {
  return (
    <ul
      className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      aria-label="主题来源"
    >
      {cards.map((card) => (
        <StartPromptCard
          key={card.id}
          title={card.title}
          icon={card.icon}
          selectionDisabled={disabled}
          onSelect={() => {
            if (disabled || !card.prompt.trim()) return;
            selectPrompt(card.prompt);
          }}
          onCopy={() => onCopyPrompt(card)}
        />
      ))}
    </ul>
  );
}
