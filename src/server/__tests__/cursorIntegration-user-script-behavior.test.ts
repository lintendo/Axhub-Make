import fs from 'node:fs/promises';
import vm from 'node:vm';

import { afterEach, describe, expect, it, vi } from 'vitest';

const sourceUrl = new URL('../../../bin/cursor-integration/axhub-make.cursor-launcher.js', import.meta.url);

class FakeElement {
  attributes = new Map<string, string>();
  children: FakeElement[] = [];
  dataset: Record<string, string> = {};
  disabled = false;
  hidden = false;
  id = '';
  innerHTML = '';
  isConnected = false;
  listeners = new Map<string, (event: { preventDefault(): void; stopPropagation(): void }) => void>();
  parentElement: FakeElement | null = null;
  previousElementSibling: FakeElement | null = null;
  src = '';
  textContent = '';
  type = '';

  constructor(public readonly tagName: string) {}

  addEventListener(type: string, listener: (event: { preventDefault(): void; stopPropagation(): void }) => void) {
    this.listeners.set(type, listener);
  }

  after(element: FakeElement) {
    if (!this.parentElement) return;
    element.parentElement = this.parentElement;
    element.previousElementSibling = this;
    element.isConnected = true;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== element);
    const index = this.parentElement.children.indexOf(this);
    this.parentElement.children.splice(index + 1, 0, element);
  }

  click() {
    this.listeners.get('click')?.({ preventDefault() {}, stopPropagation() {} });
  }

  cloneNode() {
    const clone = new FakeElement(this.tagName);
    clone.children = this.children.map((child) => {
      const childClone = child.cloneNode();
      childClone.parentElement = clone;
      return childClone;
    });
    clone.textContent = this.textContent;
    for (const [key, value] of this.attributes) clone.attributes.set(key, value);
    return clone;
  }

  dispatchEvent(_event?: { type?: string }) {
    return true;
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  querySelector(selector: string) {
    if (selector === 'svg') return this.children.find((child) => child.tagName === 'svg') ?? null;
    if (selector === 'span') return this.children.find((child) => child.tagName === 'span') ?? null;
    return null;
  }

  querySelectorAll(selector: string) {
    if (selector === 'span') return this.children.filter((child) => child.tagName === 'span');
    if (selector === '[id]') return this.children.filter((child) => child.id);
    return [];
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, String(value));
  }
}

interface HarnessOptions {
  hostError?: string;
  hostDelayMs?: number;
}

async function createHarness({
  hostError,
  hostDelayMs = 0,
}: HarnessOptions = {}) {
  const source = await fs.readFile(sourceUrl, 'utf8');
  const parent = new FakeElement('div');
  const reference = new FakeElement('button');
  reference.isConnected = true;
  reference.parentElement = parent;
  reference.textContent = 'IDE';
  reference.setAttribute('aria-label', 'IDE');
  const label = new FakeElement('span');
  label.textContent = 'IDE';
  label.parentElement = reference;
  const icon = new FakeElement('svg');
  icon.parentElement = reference;
  reference.children = [label, icon];
  parent.children = [reference];
  const windowListeners = new Map<string, (event: { detail: unknown }) => void>();
  const hostCalls: Array<{ id: string; action: string }> = [];
  const document = {
    documentElement: new FakeElement('html'),
    readyState: 'complete',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getElementById: (id: string) => {
      if (id === 'axhub-make-cursor-entry') {
        return parent.children.find((child) => child.id === id) ?? null;
      }
      return null;
    },
    querySelector: () => null,
    querySelectorAll: (selector: string) => selector === 'button'
      ? parent.children.filter((child) => child.tagName === 'button')
      : [],
  };
  const window = {
    addEventListener: (type: string, listener: (event: { detail: unknown }) => void) => {
      windowListeners.set(type, listener);
    },
    clearTimeout,
    setTimeout,
    __axhubMakeHostV1: (raw: string) => {
      const request = JSON.parse(raw) as { id: string; action: string };
      hostCalls.push(request);
      const respond = () => windowListeners.get('axhub-make:host-response')?.({
        detail: hostError
          ? { id: request.id, ok: false, error: hostError }
          : { id: request.id, ok: true, reused: true },
      });
      if (hostDelayMs > 0) setTimeout(respond, hostDelayMs);
      else queueMicrotask(respond);
    },
  } as Record<string, unknown>;
  class FakeMutationObserver {
    observe() {}
  }
  const context = vm.createContext({
    URL,
    Map,
    MutationObserver: FakeMutationObserver,
    document,
    queueMicrotask,
    window,
  });
  vm.runInContext(source, context);
  await Promise.resolve();
  return {
    context,
    source,
    entry: () => document.getElementById('axhub-make-cursor-entry'),
    entryLabel: () => document.getElementById('axhub-make-cursor-entry')?.querySelector('span')?.textContent,
    hostCalls,
  };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Cursor injected launcher behavior', () => {
  it('installs once and requests the fixed host action across clicks', async () => {
    const harness = await createHarness();
    vm.runInContext(harness.source, harness.context);

    expect(harness.entry()).not.toBeNull();
    harness.entry()?.click();
    await settle();
    harness.entry()?.click();
    await settle();

    expect(harness.hostCalls).toHaveLength(2);
    expect(harness.hostCalls.map(({ action }) => action)).toEqual(['open-make', 'open-make']);
    expect(harness.entry()?.dataset.axhubState).toBe('idle');
    expect(harness.entryLabel()).toBe('Axhub Make');
  });

  it('keeps a visible error state until its reset timer runs', async () => {
    vi.useFakeTimers();
    const harness = await createHarness({ hostError: 'Unable to create Cursor built-in Browser' });

    harness.entry()?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.entry()?.dataset.axhubState).toBe('error');
    expect(harness.entry()?.getAttribute('title')).toBe('Unable to create Cursor built-in Browser');
    expect(harness.entryLabel()).toBe('Open failed');

    vi.advanceTimersByTime(3000);
    expect(harness.entry()?.dataset.axhubState).toBe('idle');
    expect(harness.entryLabel()).toBe('Axhub Make');
  });

  it('does not time out while a cold Make startup is still completing', async () => {
    vi.useFakeTimers();
    const harness = await createHarness({ hostDelayMs: 25_000 });

    harness.entry()?.click();
    await Promise.resolve();
    vi.advanceTimersByTime(20_000);
    await Promise.resolve();

    expect(harness.entry()?.dataset.axhubState).toBe('starting');
    expect(harness.entryLabel()).toBe('Opening…');

    vi.advanceTimersByTime(5_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.entry()?.dataset.axhubState).toBe('idle');
    expect(harness.entryLabel()).toBe('Axhub Make');
  });

  it('recovers to an error state when Make startup fails', async () => {
    vi.useFakeTimers();
    const harness = await createHarness({ hostError: 'Make failed to start' });

    harness.entry()?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.entry()?.dataset.axhubState).toBe('error');
    expect(harness.entry()?.getAttribute('title')).toBe('Make failed to start');
    expect(harness.entryLabel()).toBe('Open failed');
  });
});
