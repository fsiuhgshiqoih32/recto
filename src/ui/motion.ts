// Shared motion helpers. Recto animates sparingly: state changes people make
// with the pointer get a short transition; anything done from the keyboard,
// or with reduced motion requested, happens at once.

import { flushSync } from 'react-dom';

let lastInput: 'pointer' | 'keyboard' = 'pointer';
let lastPointer = { x: 0, y: 0 };
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (event) => {
    if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) lastInput = 'keyboard';
  }, true);
  window.addEventListener('pointerdown', (event) => {
    lastInput = 'pointer';
    lastPointer = { x: event.clientX, y: event.clientY };
  }, true);
}

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** True when the change should animate: pointer-initiated, motion allowed. */
export function shouldAnimate(): boolean {
  return lastInput === 'pointer' && !prefersReducedMotion();
}

export type TransitionKind = 'view' | 'device' | 'theme' | 'book';

let running = 0;

/**
 * Runs a React state update inside a view transition. `kind` lands on <html>
 * as data-vt for the length of the transition; app.css uses it to decide
 * which regions morph and how the rest of the page changes.
 */
export function transition(kind: TransitionKind, update: () => void, options: { always?: boolean } = {}): void {
  const animate = options.always ? !prefersReducedMotion() : shouldAnimate();
  if (!animate || !('startViewTransition' in document)) {
    update();
    return;
  }
  const root = document.documentElement;
  const id = ++running;
  root.dataset.vt = kind;
  if (kind === 'theme') {
    // The new theme spreads out as a circle from where the pointer was.
    const { x, y } = lastPointer;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    root.style.setProperty('--vt-x', `${x}px`);
    root.style.setProperty('--vt-y', `${y}px`);
    root.style.setProperty('--vt-r', `${Math.ceil(radius)}px`);
  }
  const done = () => {
    if (id !== running) return;
    delete root.dataset.vt;
  };
  try {
    document.startViewTransition(() => flushSync(update)).finished.then(done, done);
  } catch {
    done();
    update();
  }
}

/**
 * FLIP for lists: call `capture()` just before a change that moves rows, and
 * `play()` after React commits it. Rows are found by their data-flip id, and
 * positions are measured relative to the scrolling container so a scroll
 * between the two doesn't read as movement.
 */
export function createFlip(getContainer: () => HTMLElement | null) {
  let before: Map<string, number> | null = null;

  const measure = () => {
    const container = getContainer();
    const positions = new Map<string, number>();
    if (!container) return positions;
    const origin = container.getBoundingClientRect().top - container.scrollTop;
    container.querySelectorAll<HTMLElement>('[data-flip]').forEach((node) => {
      positions.set(node.dataset.flip!, node.getBoundingClientRect().top - origin);
    });
    return positions;
  };

  return {
    capture() {
      before = shouldAnimate() ? measure() : null;
    },
    play() {
      const previous = before;
      before = null;
      if (!previous) return;
      const container = getContainer();
      if (!container) return;
      const after = measure();
      container.querySelectorAll<HTMLElement>('[data-flip]').forEach((node) => {
        const id = node.dataset.flip!;
        const from = previous.get(id);
        const to = after.get(id);
        if (from === undefined || to === undefined) return;
        const delta = from - to;
        if (Math.abs(delta) < 1) return;
        node.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], {
          duration: Math.min(320, 180 + Math.abs(delta) * 0.25),
          easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
        });
      });
    },
  };
}
