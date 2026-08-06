export const HOST_BINDING = '__axhubMakeHostV1';
export const HOST_RESPONSE_EVENT = 'axhub-make:host-response';

export function parseHostRequest(raw) {
  const value = JSON.parse(raw);
  if (!value || typeof value.id !== 'string' || !value.id.trim()) {
    throw new Error('request id is required');
  }
  if (value.action !== 'open-make') {
    throw new Error('unsupported action');
  }
  return { id: value.id, action: value.action };
}

export function responseExpression(payload) {
  const eventName = JSON.stringify(HOST_RESPONSE_EVENT);
  const serializedPayload = JSON.stringify(JSON.stringify(payload));
  return `window.dispatchEvent(new CustomEvent(${eventName}, { detail: JSON.parse(${serializedPayload}) }))`;
}
