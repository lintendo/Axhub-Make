import { describe, expect, it } from 'vitest';
import { readAssistantImageSavedEvent } from './assistantImageSavedEvent';

describe('assistant image saved event', () => {
  it('parses a valid ACP save event', () => {
    expect(readAssistantImageSavedEvent({
      type: 'acp.image.saved',
      payload: {
        paths: [' /workspace/src/resources/images/a.png '],
        savedCount: 1,
        requestedCount: 1,
      },
    })).toEqual({
      paths: ['/workspace/src/resources/images/a.png'],
      savedCount: 1,
      requestedCount: 1,
    });
  });

  it.each([
    null,
    { type: 'other.event', payload: { paths: ['/tmp/a.png'], savedCount: 1, requestedCount: 1 } },
    { type: 'acp.image.saved', payload: { paths: [], savedCount: 0, requestedCount: 0 } },
    { type: 'acp.image.saved', payload: { paths: ['/tmp/a.png'], savedCount: 2, requestedCount: 2 } },
    { type: 'acp.image.saved', payload: { paths: ['/tmp/a.png'], savedCount: 1, requestedCount: 0 } },
  ])('rejects malformed save event %#', (value) => {
    expect(readAssistantImageSavedEvent(value)).toBeNull();
  });
});
