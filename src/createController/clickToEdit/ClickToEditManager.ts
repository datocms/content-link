/**
 * Manages click-to-edit functionality: highlights editable regions under the pointer
 * and invokes callback when clicked. Absorbs all logic from setup.ts into a class-based manager.
 */
import { ClickToEditStyle } from '../types.js';
import { HighlightOverlay } from './HighlightOverlay.js';
import { findEditableTarget } from './findEditableTarget.js';
import { rafThrottle } from './throttle.js';
import type { ClickToEditManagerOptions, Target } from './types.js';

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
  private style?: ClickToEditStyle;
  private current: Target | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private listenerAbortController: AbortController | null = null;
  private active = false;
  private refresh: (() => void) & { cancel: () => void };
  private throttledPointer: ((event: Event) => void) & { cancel: () => void };

  constructor(options: ClickToEditManagerOptions) {
    this.doc = options.doc;
    this.style = options.style;
    this.onEditClick = options.onEditClick;
    this.view = this.doc.defaultView ?? (typeof window !== 'undefined' ? window : null);

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

    // Initialize overlay
    this.overlay = new HighlightOverlay(this.doc, this.style);
  }

  /** Clean up overlay and remove all listeners */
  stop(): void {
    if (!this.active) {
      return;
    }
    this.active = false;

    // Remove all listeners via AbortController
    if (this.listenerAbortController) {
      this.listenerAbortController.abort();
      this.listenerAbortController = null;
    }

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
    this.listenerAbortController = new AbortController();
    const { signal } = this.listenerAbortController;

    // Document event listeners
    this.doc.addEventListener('pointerover', this.throttledPointer, { capture: true, signal });
    this.doc.addEventListener('pointermove', this.throttledPointer, { capture: true, signal });
    this.doc.addEventListener('pointerleave', (event) => this.handlePointerLeave(event), {
      capture: true,
      signal
    });
    this.doc.addEventListener('click', (event) => this.handleClick(event), {
      capture: true,
      signal
    });
    this.doc.addEventListener('focusin', (event) => this.handleFocusIn(event), {
      capture: true,
      signal
    });
    this.doc.addEventListener('focusout', () => this.handleFocusOut(), { capture: true, signal });
    this.doc.addEventListener('keydown', (event) => this.handleKeyDown(event), {
      capture: true,
      signal
    });

    // Layout event listeners
    if (this.view) {
      this.view.addEventListener('scroll', this.refresh, { capture: true, passive: true, signal });
      this.doc.addEventListener('scroll', this.refresh, { capture: true, passive: true, signal });
      this.view.addEventListener('resize', this.refresh, { capture: true, passive: true, signal });
    } else {
      this.doc.addEventListener('scroll', this.refresh, { capture: true, signal });
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
