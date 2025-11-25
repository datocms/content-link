/**
 * Manages click-to-edit functionality: highlights editable regions under the pointer
 * and invokes callback when clicked. Absorbs all logic from setup.ts into a class-based manager.
 */
import { HighlightOverlay } from './HighlightOverlay.js';
import { findEditableTarget } from './findEditableTarget.js';
import { rafThrottle } from './throttle.js';
import type { ClickToEditManagerOptions, Listener, Target } from './types.js';

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

export class ClickToEditManager {
  private readonly doc: Document;
  private readonly onEditClick: (editUrl: string) => void;
  private readonly view: Window | null;

  private overlay: HighlightOverlay | null = null;
  private current: Target | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private listeners: Listener[] = [];
  private active = false;
  private refresh: (() => void) & { cancel: () => void };
  private throttledPointer: ((event: Event) => void) & { cancel: () => void };

  constructor(options: ClickToEditManagerOptions) {
    this.doc = options.doc;
    this.onEditClick = options.onEditClick;
    this.view = this.doc.defaultView ?? (typeof window !== 'undefined' ? window : null);

    // Initialize overlay
    this.overlay = new HighlightOverlay(this.doc, options.style);

    // Create throttled handlers
    this.refresh = rafThrottle(() => this.handleRefresh());
    this.throttledPointer = rafThrottle((event: Event) => this.handlePointer(event));
  }

  /** Initialize overlay and attach all listeners */
  start(): void {
    if (this.active) {
      return;
    }
    this.active = true;

    // Set up all event listeners
    this.setupListeners();
  }

  /** Clean up overlay and remove all listeners */
  stop(): void {
    if (!this.active) {
      return;
    }
    this.active = false;

    // Remove all listeners
    for (const { target, type, handler, options } of this.listeners) {
      target.removeEventListener(type, handler, options ?? false);
    }
    this.listeners = [];

    // Clean up resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Cancel throttled functions
    this.refresh.cancel();
    this.throttledPointer.cancel();

    // Dispose overlay
    if (this.overlay) {
      this.overlay.dispose();
      this.overlay = null;
    }

    this.current = null;
  }

  /** Whether the manager is currently active */
  isActive(): boolean {
    return this.active;
  }

  /** Set up all event listeners (absorbed from setupOverlay) */
  private setupListeners(): void {
    this.listeners = [
      {
        target: this.doc,
        type: 'pointerover',
        handler: this.throttledPointer,
        options: { capture: true }
      },
      {
        target: this.doc,
        type: 'pointermove',
        handler: this.throttledPointer,
        options: { capture: true }
      },
      {
        target: this.doc,
        type: 'pointerleave',
        handler: (event) => this.handlePointerLeave(event),
        options: { capture: true }
      },
      {
        target: this.doc,
        type: 'click',
        handler: (event) => this.handleClick(event),
        options: { capture: true }
      },
      {
        target: this.doc,
        type: 'focusin',
        handler: (event) => this.handleFocusIn(event),
        options: { capture: true }
      },
      {
        target: this.doc,
        type: 'focusout',
        handler: () => this.handleFocusOut(),
        options: { capture: true }
      },
      {
        target: this.doc,
        type: 'keydown',
        handler: (event) => this.handleKeyDown(event),
        options: { capture: true }
      }
    ];

    if (this.view) {
      this.listeners.push({
        target: this.view,
        type: 'scroll',
        handler: this.refresh,
        options: { capture: true, passive: true }
      });
      this.listeners.push({
        target: this.doc,
        type: 'scroll',
        handler: this.refresh,
        options: { capture: true, passive: true }
      });
      this.listeners.push({
        target: this.view,
        type: 'resize',
        handler: this.refresh,
        options: { capture: true, passive: true }
      });
    } else {
      this.listeners.push({
        target: this.doc,
        type: 'scroll',
        handler: this.refresh,
        options: { capture: true }
      });
    }

    // Attach all listeners
    for (const { target, type, handler, options } of this.listeners) {
      target.addEventListener(type, handler, options ?? false);
    }
  }

  /** Keep the overlay aligned with the active element without thrashing */
  private handleRefresh(): void {
    if (!this.overlay) {
      return;
    }
    if (!this.current) {
      this.overlay.hide();
      return;
    }
    if (!this.current.el.isConnected) {
      this.setCurrent(null);
      return;
    }
    this.overlay.update(this.current.el);
  }

  /** Watch the active element for size changes so the overlay adjusts in place */
  private observe(target: Element | null): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (!target) {
      return;
    }
    const ResizeObserverCtor =
      this.doc.defaultView?.ResizeObserver ??
      (typeof ResizeObserver !== 'undefined' ? ResizeObserver : undefined);
    if (!ResizeObserverCtor) {
      return;
    }
    this.resizeObserver = new ResizeObserverCtor(() => this.refresh());
    this.resizeObserver.observe(target);
  }

  /** Update the highlighted element and manage resize observation lifecycle */
  private setCurrent(next: Target | null): void {
    if (!this.overlay) {
      return;
    }
    const nextTarget = next && !next.el.isConnected ? null : next;

    const sameTarget =
      this.current?.el === nextTarget?.el && this.current?.editUrl === nextTarget?.editUrl;
    this.current = nextTarget;

    if (!this.current) {
      this.overlay.hide();
      this.observe(null);
      return;
    }

    this.overlay.show(this.current.el);
    if (!sameTarget) {
      this.observe(this.current.el);
    }
  }

  /** Open the edit URL via callback */
  private open(target: Target, event: MouseEvent | KeyboardEvent): void {
    if (event instanceof MouseEvent && event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    // Invoke callback - controller decides what to do
    this.onEditClick(target.editUrl);
  }

  private handlePointer(event: Event): void {
    if (!isPointerEvent(event)) {
      return;
    }
    // Only react to mouse pointers; touch/pen interactions would be noisy.
    if (event.pointerType && event.pointerType !== 'mouse') {
      return;
    }
    const target = findEditableTarget(event.target instanceof Element ? event.target : null);
    this.setCurrent(target);
  }

  private handlePointerLeave(event: Event): void {
    if (!isPointerEvent(event)) {
      return;
    }
    if (event.pointerType && event.pointerType !== 'mouse') {
      return;
    }
    const related = event.relatedTarget instanceof Element ? event.relatedTarget : null;
    const target = findEditableTarget(related);
    if (!target) {
      this.setCurrent(null);
    }
  }

  private handleClick(event: Event): void {
    if (!isMouseEvent(event)) {
      return;
    }
    const target = findEditableTarget(event.target instanceof Element ? event.target : null);
    if (!target) {
      return;
    }
    this.setCurrent(target);
    this.open(target, event);
  }

  private handleFocusIn(event: Event): void {
    const target = findEditableTarget(event.target instanceof Element ? event.target : null);
    this.setCurrent(target);
  }

  private handleFocusOut(): void {
    this.setCurrent(null);
  }

  private handleKeyDown(event: Event): void {
    if (!isKeyboardEvent(event)) {
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
      return;
    }
    const active = this.doc.activeElement instanceof Element ? this.doc.activeElement : null;
    const target = findEditableTarget(active);
    if (!target) {
      return;
    }
    this.setCurrent(target);
    this.open(target, event);
  }
}
