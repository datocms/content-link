import { getDocumentWindow, getResizeObserverCtor, measure } from '../../utils/dom.js';
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
import { rafThrottle } from './throttle.js';

export class HighlightOverlay {
  private overlayElement: HTMLDivElement;
  private prevCursor: string | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private positioningAbortController: AbortController;
  private throttledUpdatePosition = rafThrottle(() => this.immediateUpdatePosition());

  constructor(
    private readonly document: Document,
    readonly targetElement: Element
  ) {
    this.overlayElement = this.createOverlayElement();
    document.body.appendChild(this.overlayElement);

    this.prevCursor = document.body.style.cursor;
    document.body.style.cursor = 'pointer';

    this.positioningAbortController = new AbortController();
    const { signal } = this.positioningAbortController;

    const docWindow = getDocumentWindow(this.document);

    if (docWindow) {
      docWindow.addEventListener('scroll', this.throttledUpdatePosition, {
        capture: true,
        passive: true,
        signal
      });
      this.document.addEventListener('scroll', this.throttledUpdatePosition, {
        capture: true,
        passive: true,
        signal
      });
      docWindow.addEventListener('resize', this.throttledUpdatePosition, {
        capture: true,
        passive: true,
        signal
      });
    } else {
      this.document.addEventListener('scroll', this.throttledUpdatePosition, {
        capture: true,
        signal
      });
    }

    // Set up ResizeObserver
    const ResizeObserverCtor = getResizeObserverCtor(docWindow);

    if (ResizeObserverCtor) {
      this.resizeObserver = new ResizeObserverCtor(() => {
        this.throttledUpdatePosition();
      });
      this.resizeObserver.observe(targetElement);
    }
  }

  dispose(): void {
    this.positioningAbortController.abort();
    this.resizeObserver?.disconnect();
    this.throttledUpdatePosition.cancel();
    this.overlayElement.remove();

    if (this.prevCursor) {
      this.document.body.style.cursor = this.prevCursor;
    }
  }

  private createOverlayElement() {
    const el = this.document.createElement('div');
    el.style.position = 'fixed';
    el.style.top = '0';
    el.style.left = '0';
    el.style.width = '0';
    el.style.height = '0';
    el.style.border = `${DEFAULT_BORDER_WIDTH} solid ${DEFAULT_BORDER_COLOR}`;
    el.style.borderRadius = DEFAULT_BORDER_RADIUS;
    el.style.background = DEFAULT_BACKGROUND_COLOR;
    el.style.boxSizing = 'border-box';
    el.style.pointerEvents = 'none';
    el.style.cursor = 'pointer';
    el.style.zIndex = OVERLAY_Z_INDEX;
    el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  /** Update overlay position in response to scroll/resize/element size changes */
  private immediateUpdatePosition(): void {
    const rect = measure(this.targetElement);
    this.overlayElement.style.zIndex = this.computeOverlayZIndex(this.targetElement);

    if (!rect) {
      return;
    }

    this.overlayElement.style.display = 'block';
    this.overlayElement.style.top = `${rect.top - DEFAULT_OVERLAY_PADDING}px`;
    this.overlayElement.style.left = `${rect.left - DEFAULT_OVERLAY_PADDING}px`;
    this.overlayElement.style.width = `${rect.width + DEFAULT_OVERLAY_PADDING * 2}px`;
    this.overlayElement.style.height = `${rect.height + DEFAULT_OVERLAY_PADDING * 2}px`;
  }

  /**
   * Determine an appropriate z-index for the overlay so it does not exceed
   * the stacking level of the element it is highlighting. We look for the
   * nearest ancestor (including the element itself) with a numeric z-index
   * and use that value. If none is found, we default to '0'.
   */
  private computeOverlayZIndex(el: Element): string {
    const view = getDocumentWindow(this.document);

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
