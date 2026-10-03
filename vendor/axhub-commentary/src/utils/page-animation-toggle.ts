/**
 * Page Animation Toggle
 *
 * Injects or removes a <style> tag to disable all CSS animations and transitions
 * on the host page. Useful when the user wants to freeze animations (carousels,
 * typewriter effects, background motion, etc.) so they can easily click-select
 * target elements with the Commentary.
 */

import { resolveCspNonce } from '../ui/csp-nonce';

const STYLE_TAG_ID = '__commentary_no_animations__';

const DISABLE_ANIMATIONS_CSS = `
/* Commentary: page animations disabled */
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  animation-play-state: paused !important;
  animation-fill-mode: forwards !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  scroll-behavior: auto !important;
  will-change: auto !important;
}

/* Typewriter cursor: hide blinking caret pseudo-elements */
*::after {
  border-right-color: transparent !important;
}

/* Pause autoplaying media */
video, iframe {
  animation-play-state: paused !important;
}
`;

let pausedVideos: HTMLVideoElement[] = [];
let typewriterCleanup: (() => void) | null = null;

function pauseAllVideos(): void {
  pausedVideos = [];
  document.querySelectorAll('video').forEach((video) => {
    if (!video.paused) {
      video.pause();
      pausedVideos.push(video);
    }
  });
}

function resumePausedVideos(): void {
  for (const video of pausedVideos) {
    try {
      void video.play();
    } catch {
      // Ignore autoplay restrictions
    }
  }
  pausedVideos = [];
}

/**
 * Force-expand typewriter containers that use overflow:hidden + width animation.
 * These are JS-driven effects that CSS alone cannot fully freeze.
 */
function freezeTypewriterContainers(): () => void {
  const overrides: Array<{ el: HTMLElement; props: Record<string, string> }> = [];

  document.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const style = getComputedStyle(el);
    const hasOverflowHidden =
      style.overflow === 'hidden' ||
      style.overflowX === 'hidden' ||
      style.overflowY === 'hidden';
    const hasAnimation = style.animationName && style.animationName !== 'none';
    const hasClippedWidth = style.maxWidth !== 'none' && style.maxWidth !== '';
    const isInlineDisplay =
      style.display === 'inline' ||
      style.display === 'inline-block' ||
      style.display === 'inline-flex';

    if (hasOverflowHidden && (hasAnimation || hasClippedWidth) && isInlineDisplay) {
      const saved: Record<string, string> = {
        overflow: el.style.overflow,
        maxWidth: el.style.maxWidth,
        width: el.style.width,
        whiteSpace: el.style.whiteSpace,
      };
      overrides.push({ el, props: saved });

      el.style.setProperty('overflow', 'visible', 'important');
      el.style.setProperty('max-width', 'none', 'important');
      el.style.setProperty('width', 'auto', 'important');
      el.style.setProperty('white-space', 'nowrap', 'important');
    }
  });

  return () => {
    for (const { el, props } of overrides) {
      el.style.overflow = props.overflow;
      el.style.maxWidth = props.maxWidth;
      el.style.width = props.width;
      el.style.whiteSpace = props.whiteSpace;
    }
  };
}

/**
 * Enable or disable page animations globally.
 *
 * When disabled, a `<style>` element is injected into `document.head` that
 * zeroes out all animation/transition durations. When re-enabled, the style
 * element is removed and animations resume normally.
 */
export function setPageAnimationsDisabled(disabled: boolean): void {
  const existing = document.getElementById(STYLE_TAG_ID);

  if (!disabled) {
    existing?.remove();
    resumePausedVideos();
    typewriterCleanup?.();
    typewriterCleanup = null;
    return;
  }

  if (existing) {
    return;
  }

  const styleEl = document.createElement('style');
  styleEl.id = STYLE_TAG_ID;
  const cspNonce = resolveCspNonce(document);
  if (cspNonce) styleEl.nonce = cspNonce;
  styleEl.textContent = DISABLE_ANIMATIONS_CSS;
  document.head.appendChild(styleEl);

  pauseAllVideos();
  typewriterCleanup = freezeTypewriterContainers();
}
