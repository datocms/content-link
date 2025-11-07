import type { OverlayStyle } from '../types.js';
/**
 * Overlay rendering logic: highlights editable regions under the pointer and
 * opens the editor when clicked. Lives separately from the controller so it
 * can be unit-tested and swapped out if styling needs change.
 */
import { HighlightOverlay } from './HighlightOverlay.js';
import { findEditableTarget } from './resolver.js';
import { rafThrottle } from './throttle.js';
import type { Listener, Target } from './types.js';

const isPointerEvent = (event: Event): event is PointerEvent => {
  if (typeof PointerEvent !== 'undefined') {
    return event instanceof PointerEvent;
  }
  return typeof (event as PointerEvent).pointerType === 'string';
};

const isMouseEvent = (event: Event): event is MouseEvent => {
  if (typeof MouseEvent !== 'undefined') {
    return event instanceof MouseEvent;
  }
  return typeof (event as MouseEvent).button === 'number';
};

const isKeyboardEvent = (event: Event): event is KeyboardEvent => {
  if (typeof KeyboardEvent !== 'undefined') {
    return event instanceof KeyboardEvent;
  }
  return typeof (event as KeyboardEvent).key === 'string';
};

/**
 * Attach the overlay to the provided document (defaulting to the global one)
 * and wire up the pointer/focus listeners required to drive it.
 * Returns a disposer that removes all listeners and DOM elements.
 */
export function setupOverlay(doc?: Document, style?: OverlayStyle): () => void {
  const resolvedDoc = doc ?? (typeof document !== 'undefined' ? document : null);
  if (!resolvedDoc) {
    return () => void 0;
  }

  const overlay = new HighlightOverlay(resolvedDoc, style);
  let current: Target | null = null;
  let resizeObserver: ResizeObserver | null = null;
  const view = resolvedDoc.defaultView ?? (typeof window !== 'undefined' ? window : null);

  // Keep the overlay aligned with the active element without thrashing.
  const refresh = rafThrottle(() => {
    if (!current) {
      overlay.hide();
      return;
    }
    if (!current.el.isConnected) {
      setCurrent(null);
      return;
    }
    overlay.update(current.el);
  });

  // Watch the active element for size changes so the overlay adjusts in place.
  const observe = (target: Element | null) => {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (!target) {
      return;
    }
    const ResizeObserverCtor =
      resolvedDoc.defaultView?.ResizeObserver ??
      (typeof ResizeObserver !== 'undefined' ? ResizeObserver : undefined);
    if (!ResizeObserverCtor) {
      return;
    }
    resizeObserver = new ResizeObserverCtor(() => refresh());
    resizeObserver.observe(target);
  };

  // Update the highlighted element and manage resize observation lifecycle.
  const setCurrent = (next: Target | null) => {
    const nextTarget = next && !next.el.isConnected ? null : next;

    const sameTarget = current?.el === nextTarget?.el && current?.editUrl === nextTarget?.editUrl;
    current = nextTarget;

    if (!current) {
      overlay.hide();
      observe(null);
      return;
    }

    overlay.show(current.el);
    if (!sameTarget) {
      observe(current.el);
    }
  };

  // Open the edit URL in a new tab, respecting modifier keys when possible.
  const open = (target: Target, event: MouseEvent | KeyboardEvent) => {
    if (event instanceof MouseEvent && event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const opener = view ?? (typeof window !== 'undefined' ? window : null);
    opener?.open(target.editUrl, '_blank', 'noopener,noreferrer');
  };

  const handlePointer = (event: Event) => {
    if (!isPointerEvent(event)) {
      return;
    }
    // Only react to mouse pointers; touch/pen interactions would be noisy.
    if (event.pointerType && event.pointerType !== 'mouse') {
      return;
    }
    const target = findEditableTarget(event.target instanceof Element ? event.target : null);
    setCurrent(target);
  };

  const handlePointerLeave = (event: Event) => {
    if (!isPointerEvent(event)) {
      return;
    }
    if (event.pointerType && event.pointerType !== 'mouse') {
      return;
    }
    const related = event.relatedTarget instanceof Element ? event.relatedTarget : null;
    const target = findEditableTarget(related);
    if (!target) {
      setCurrent(null);
    }
  };

  const handleClick = (event: Event) => {
    if (!isMouseEvent(event)) {
      return;
    }
    const target = findEditableTarget(event.target instanceof Element ? event.target : null);
    if (!target) {
      return;
    }
    setCurrent(target);
    open(target, event);
  };

  const handleFocusIn = (event: Event) => {
    const target = findEditableTarget(event.target instanceof Element ? event.target : null);
    setCurrent(target);
  };

  const handleFocusOut = () => {
    setCurrent(null);
  };

  const handleKeyDown = (event: Event) => {
    if (!isKeyboardEvent(event)) {
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
      return;
    }
    const active = resolvedDoc.activeElement instanceof Element ? resolvedDoc.activeElement : null;
    const target = findEditableTarget(active);
    if (!target) {
      return;
    }
    setCurrent(target);
    open(target, event);
  };

  const throttledPointer = rafThrottle(handlePointer);

  const listeners: Listener[] = [
    {
      target: resolvedDoc,
      type: 'pointerover',
      handler: throttledPointer,
      options: { capture: true }
    },
    {
      target: resolvedDoc,
      type: 'pointermove',
      handler: throttledPointer,
      options: { capture: true }
    },
    {
      target: resolvedDoc,
      type: 'pointerleave',
      handler: handlePointerLeave,
      options: { capture: true }
    },
    { target: resolvedDoc, type: 'click', handler: handleClick, options: { capture: true } },
    { target: resolvedDoc, type: 'focusin', handler: handleFocusIn, options: { capture: true } },
    { target: resolvedDoc, type: 'focusout', handler: handleFocusOut, options: { capture: true } },
    { target: resolvedDoc, type: 'keydown', handler: handleKeyDown, options: { capture: true } }
  ];

  if (view) {
    listeners.push({
      target: view,
      type: 'scroll',
      handler: refresh,
      options: { capture: true, passive: true }
    });
    listeners.push({
      target: resolvedDoc,
      type: 'scroll',
      handler: refresh,
      options: { capture: true, passive: true }
    });
    listeners.push({
      target: view,
      type: 'resize',
      handler: refresh,
      options: { capture: true, passive: true }
    });
  } else {
    listeners.push({
      target: resolvedDoc,
      type: 'scroll',
      handler: refresh,
      options: { capture: true }
    });
  }

  for (const { target, type, handler, options } of listeners) {
    target.addEventListener(type, handler, options ?? false);
  }

  return () => {
    for (const { target, type, handler, options } of listeners) {
      target.removeEventListener(type, handler, options ?? false);
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    refresh.cancel();
    throttledPointer.cancel();
    overlay.dispose();
    current = null;
  };
}
