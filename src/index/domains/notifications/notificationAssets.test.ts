import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const completionPath = fileURLToPath(
  new URL('../../assets/sounds/acp/completion.wav', import.meta.url),
);
const reminderPath = fileURLToPath(
  new URL('../../assets/sounds/acp/reminder.wav', import.meta.url),
);

it('keeps the extension audio bytes unchanged', () => {
  expect(createHash('sha256').update(readFileSync(completionPath)).digest('hex'))
    .toBe('c3467b6b1182b37fb10adc97f8840c06da728819cbe7bd912213eb176b38141a');
  expect(createHash('sha256').update(readFileSync(reminderPath)).digest('hex'))
    .toBe('64ea0e8df38dc2b781cb155a40e9f2bf337508d59bf95042daeeb7b6230de9bc');
});
