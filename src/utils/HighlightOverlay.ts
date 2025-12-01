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
} from '../createController/clickToEdit/constants.js';
import {
  abortableSleep,
  getDocumentWindow,
  getResizeObserverCtor,
  measure,
  resolveDocument,
  waitTwoRafs
} from './dom.js';
import { rafThrottle } from './rafThrottle.js';

const FADE_DELAY = 200;

export class HighlightOverlay {
  private overlayElement: HTMLDivElement;

  private resizeObserver: ResizeObserver | null = null;
  private positioningAbortController: AbortController;
  private pendingAnimationAbortController: AbortController | null = null;
  private throttledUpdatePosition = rafThrottle(() => this.immediateUpdatePosition());

  constructor(readonly targetElement: HTMLElement) {
    this.overlayElement = this.createOverlayElement();
    document.body.appendChild(this.overlayElement);

    this.positioningAbortController = new AbortController();
    const { signal } = this.positioningAbortController;

    if (this.window) {
      this.window.addEventListener('scroll', this.throttledUpdatePosition, {
        capture: true,
        passive: true,
        signal
      });
      this.document.addEventListener('scroll', this.throttledUpdatePosition, {
        capture: true,
        passive: true,
        signal
      });
      this.window.addEventListener('resize', this.throttledUpdatePosition, {
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
    const ResizeObserverCtor = getResizeObserverCtor(this.window);

    if (ResizeObserverCtor) {
      this.resizeObserver = new ResizeObserverCtor(() => {
        this.throttledUpdatePosition();
      });
      this.resizeObserver.observe(targetElement);
    }
  }

  get document() {
    return resolveDocument(this.targetElement);
  }

  get window() {
    return getDocumentWindow(this.document);
  }

  dispose(): void {
    this.positioningAbortController.abort();
    this.resizeObserver?.disconnect();
    this.throttledUpdatePosition.cancel();
    this.overlayElement.remove();
  }

  cancelPendingAnimation(): void {
    this.pendingAnimationAbortController?.abort();
  }

  async fadeIn(afterDelay = 0, abortController?: AbortController): Promise<void> {
    this.cancelPendingAnimation();
    this.pendingAnimationAbortController = abortController || new AbortController();
    const { signal } = this.pendingAnimationAbortController;

    try {
      this.overlayElement.style.opacity = '0';
      await waitTwoRafs();
      await abortableSleep(afterDelay, signal);
      this.overlayElement.style.opacity = '1';
    } catch (_) {
      // animation cancelled
    }
  }

  async disposeWithFadeOut(afterDelay = 0, abortController?: AbortController): Promise<void> {
    this.cancelPendingAnimation();
    this.pendingAnimationAbortController = abortController || new AbortController();
    const { signal } = this.pendingAnimationAbortController;

    try {
      await abortableSleep(afterDelay, signal);
      this.overlayElement.style.opacity = '0';
      await abortableSleep(FADE_DELAY + 50, signal);
    } catch (_) {
      // cancelled
    } finally {
      this.dispose();
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
    el.style.zIndex = OVERLAY_Z_INDEX;
    el.style.display = 'block';
    el.style.opacity = '1';
    el.style.transition = `opacity ${FADE_DELAY}ms ease-in-out`;
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  private immediateUpdatePosition(): void {
    const rect = measure(this.targetElement);
    this.overlayElement.style.zIndex = this.computeOverlayZIndex(this.targetElement);

    if (!rect) {
      return;
    }

    this.overlayElement.style.top = `${rect.top - DEFAULT_OVERLAY_PADDING}px`;
    this.overlayElement.style.left = `${rect.left - DEFAULT_OVERLAY_PADDING}px`;
    this.overlayElement.style.width = `${rect.width + DEFAULT_OVERLAY_PADDING * 2}px`;
    this.overlayElement.style.height = `${rect.height + DEFAULT_OVERLAY_PADDING * 2}px`;
  }

  private computeOverlayZIndex(el: Element): string {
    if (!this.window) {
      return '0';
    }

    let node: Element | null = el;
    let lastNumeric: number | null = null;
    while (node && node instanceof this.window.Element) {
      const style = this.window.getComputedStyle(node);
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
