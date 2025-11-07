import type { OverlayStyle } from '../types.js';
/**
 * Lightweight view layer that draws a fixed-position rectangle around the
 * active editable element. Keeps all DOM manipulation in one place.
 */
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_RADIUS,
  DEFAULT_BORDER_WIDTH,
  DEFAULT_OVERLAY_PADDING,
  OVERLAY_Z_INDEX
} from './constants.js';

export class HighlightOverlay {
  private root: HTMLDivElement | null = null;
  private visible = false;
  private prevCursor: string | null = null;
  private readonly padding: number;
  private readonly borderColor: string;
  private readonly borderWidth: string;
  private readonly borderRadius: string;
  private readonly backgroundColor: string;

  constructor(
    private readonly doc: Document,
    style?: OverlayStyle
  ) {
    // Merge provided style options with defaults
    this.padding = style?.padding ?? DEFAULT_OVERLAY_PADDING;
    this.borderColor = style?.borderColor ?? DEFAULT_BORDER_COLOR;
    this.borderWidth = style?.borderWidth ?? DEFAULT_BORDER_WIDTH;
    this.borderRadius = style?.borderRadius ?? DEFAULT_BORDER_RADIUS;
    this.backgroundColor = style?.backgroundColor ?? DEFAULT_BACKGROUND_COLOR;
  }

  /** Position and display the overlay around the supplied element. */
  show(el: Element): void {
    const rect = this.measure(el);
    if (!rect) {
      this.hide();
      return;
    }
    this.ensureRoot();
    if (!this.root) {
      return;
    }

    this.setCursorPointer();

    this.visible = true;
    // Sync the overlay's z-index with the target's stacking level before showing it
    this.root.style.zIndex = this.computeOverlayZIndex(el);
    this.root.style.display = 'block';
    this.root.style.top = `${rect.top - this.padding}px`;
    this.root.style.left = `${rect.left - this.padding}px`;
    this.root.style.width = `${rect.width + this.padding * 2}px`;
    this.root.style.height = `${rect.height + this.padding * 2}px`;
  }

  /** Re-measure the element while keeping the overlay visible. */
  update(el: Element): void {
    if (!this.visible) {
      return;
    }
    this.show(el);
  }

  /** Hide the overlay and restore the previous cursor when present. */
  hide(): void {
    if (!this.root) {
      return;
    }
    this.visible = false;
    this.root.style.display = 'none';
    this.resetCursor();
  }

  /** Remove the overlay element entirely (used during teardown). */
  dispose(): void {
    if (this.root) {
      this.root.remove();
    }
    this.root = null;
    this.visible = false;
    this.resetCursor();
  }

  /** Lazily create the overlay element with the expected styling. */
  private ensureRoot(): void {
    if (this.root) {
      return;
    }
    const body = this.doc.body;
    if (!body) {
      return;
    }
    const root = this.doc.createElement('div');
    root.style.position = 'fixed';
    root.style.top = '0';
    root.style.left = '0';
    root.style.width = '0';
    root.style.height = '0';
    root.style.border = `${this.borderWidth} solid ${this.borderColor}`;
    root.style.borderRadius = this.borderRadius;
    root.style.background = this.backgroundColor;
    root.style.boxSizing = 'border-box';
    root.style.pointerEvents = 'none';
    root.style.cursor = 'pointer';
    root.style.zIndex = OVERLAY_Z_INDEX;
    root.style.display = 'none';
    root.setAttribute('aria-hidden', 'true');
    body.appendChild(root);
    this.root = root;
  }

  /** Capture the current cursor so we can restore it after highlighting. */
  private setCursorPointer(): void {
    const body = this.doc.body;
    if (!body) {
      return;
    }
    if (this.prevCursor === null) {
      this.prevCursor = body.style.cursor;
    }
    body.style.cursor = 'pointer';
  }

  /** Restore the cursor that was active before the overlay appeared. */
  private resetCursor(): void {
    if (this.prevCursor === null) {
      return;
    }
    const body = this.doc.body;
    if (!body) {
      this.prevCursor = null;
      return;
    }
    const previous = this.prevCursor;
    this.prevCursor = null;
    body.style.cursor = previous;
  }

  /** Compute the bounding box for the target element, ignoring zero-size nodes. */
  private measure(
    el: Element
  ): { top: number; left: number; width: number; height: number } | null {
    if (typeof el.getBoundingClientRect !== 'function') {
      return null;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return null;
    }
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
  }

  /**
   * Determine an appropriate z-index for the overlay so it does not exceed
   * the stacking level of the element it is highlighting. We look for the
   * nearest ancestor (including the element itself) with a numeric z-index
   * and use that value. If none is found, we default to '0'.
   */
  private computeOverlayZIndex(el: Element): string {
    const view = this.doc.defaultView ?? (typeof window !== 'undefined' ? window : null);
    if (!view) {
      return '0';
    }

    let node: Element | null = el;
    let lastNumeric: number | null = null;
    while (node && node instanceof view.Element) {
      const style = view.getComputedStyle(node);
      const z = style.zIndex;
      if (z !== 'auto') {
        const parsed = Number(z);
        if (Number.isFinite(parsed)) {
          lastNumeric = parsed;
        }
      }
      node = node.parentElement;
    }
    return lastNumeric !== null ? String(lastNumeric) : '0';
  }
}
