/**
 * Lightweight view layer that draws a fixed-position rectangle around the
 * active editable element. Keeps all DOM manipulation in one place.
 */
import {
  DEFAULT_BORDER_RADIUS,
  DEFAULT_BORDER_WIDTH,
  DEFAULT_HUE,
  DEFAULT_OVERLAY_PADDING,
  OVERLAY_Z_INDEX,
  buildOverlayColors,
  type OverlayColors
} from '../createController/clickToEdit/constants.js';
import { abortableSleep, getDocumentWindow, measure, resolveDocument, waitTwoRafs } from './dom.js';
import { getScrollResizeCoordinator } from './scrollResizeCoordinator.js';
import { getSharedResizeObserver } from './sharedResizeObserver.js';

const FADE_DELAY = 200;

export interface HighlightOverlayOptions {
  onDispose?: () => void;
  showLabel?: boolean;
  overlayColors?: OverlayColors;
}

export class HighlightOverlay {
  private overlayElement: HTMLDivElement;

  private resizeUnobserve: (() => void) | null = null;
  private scrollResizeUnsubscribe: (() => void) | null = null;
  private pendingAnimationAbortController: AbortController | null = null;

  private readonly onDispose?: () => void;
  private readonly showLabel: boolean;
  private readonly overlayColors: OverlayColors;

  constructor(
    readonly targetElement: HTMLElement,
    options: HighlightOverlayOptions = {}
  ) {
    this.onDispose = options.onDispose;
    this.showLabel = options.showLabel ?? false;
    this.overlayColors = options.overlayColors ?? buildOverlayColors(DEFAULT_HUE);

    this.overlayElement = this.createOverlayElement(this.showLabel);
    document.body.appendChild(this.overlayElement);

    const coordinator = getScrollResizeCoordinator(this.document);
    this.scrollResizeUnsubscribe = coordinator.subscribe(() => {
      this.updatePosition();
    });

    const sharedObserver = getSharedResizeObserver(this.window);
    if (sharedObserver) {
      this.resizeUnobserve = sharedObserver.observe(targetElement, () => {
        this.updatePosition();
      });
    }
  }

  show() {
    this.updatePosition();
  }

  get document() {
    return resolveDocument(this.targetElement);
  }

  get window() {
    return getDocumentWindow(this.document);
  }

  dispose(): void {
    this.onDispose?.();
    this.scrollResizeUnsubscribe?.();
    this.resizeUnobserve?.();
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

  private createOverlayElement(withLabel: boolean) {
    const overlay = this.document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '0';
    overlay.style.height = '0';
    overlay.style.border = `${DEFAULT_BORDER_WIDTH} solid ${this.overlayColors.borderColor}`;
    overlay.style.borderRadius = withLabel
      ? `${DEFAULT_BORDER_RADIUS} 0 ${DEFAULT_BORDER_RADIUS} ${DEFAULT_BORDER_RADIUS}`
      : DEFAULT_BORDER_RADIUS;
    overlay.style.background = this.overlayColors.backgroundColor;
    overlay.style.boxSizing = 'border-box';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = OVERLAY_Z_INDEX;
    overlay.style.display = 'block';
    overlay.style.opacity = '1';
    overlay.style.transition = `opacity ${FADE_DELAY}ms ease-in-out`;
    overlay.setAttribute('aria-hidden', 'true');

    if (withLabel) {
      const label = this.document.createElement('div');
      label.textContent = 'Open in DatoCMS ↗';
      label.style.position = 'absolute';
      label.style.bottom = '100%';
      label.style.right = `-${DEFAULT_BORDER_WIDTH}`;
      label.style.backgroundColor = this.overlayColors.borderColor;
      label.style.color = 'white';
      label.style.padding = '4px 12px';
      label.style.borderRadius = `${DEFAULT_BORDER_RADIUS} ${DEFAULT_BORDER_RADIUS} 0 0`;
      label.style.fontSize = '13px';
      label.style.fontWeight = '600';
      label.style.fontFamily = 'system-ui, -apple-system, sans-serif';
      label.style.whiteSpace = 'nowrap';
      label.style.setProperty('-webkit-font-smoothing', 'antialiased');
      label.style.letterSpacing = 'normal';
      label.style.lineHeight = 'normal';
      label.style.textTransform = 'none';
      label.style.fontStyle = 'normal';
      label.setAttribute('aria-hidden', 'true');
      overlay.appendChild(label);
    }

    return overlay;
  }

  private updatePosition(): void {
    const rect = measure(this.targetElement);
    this.overlayElement.style.zIndex = this.computeOverlayZIndex(this.targetElement);

    if (!rect) {
      this.overlayElement.style.display = 'none';
      return;
    }

    this.overlayElement.style.display = 'block';
    this.overlayElement.style.top = `${rect.top - DEFAULT_OVERLAY_PADDING}px`;
    this.overlayElement.style.left = `${rect.left - DEFAULT_OVERLAY_PADDING}px`;
    this.overlayElement.style.width = `${rect.width + DEFAULT_OVERLAY_PADDING * 2}px`;
    this.overlayElement.style.height = `${rect.height + DEFAULT_OVERLAY_PADDING * 2}px`;

    if (this.showLabel) {
      const label = this.overlayElement.firstElementChild as HTMLElement | null;
      if (label) {
        const isNarrow = rect.width + DEFAULT_OVERLAY_PADDING * 2 < 150;
        if (isNarrow) {
          label.style.bottom = `calc(100% + 10px)`;
          label.style.right = 'auto';
          label.style.left = '50%';
          label.style.transform = 'translateX(-50%)';
          label.style.borderRadius = `${DEFAULT_BORDER_RADIUS}`;
          this.overlayElement.style.borderRadius = DEFAULT_BORDER_RADIUS;
        } else {
          label.style.bottom = '100%';
          label.style.right = `-${DEFAULT_BORDER_WIDTH}`;
          label.style.left = 'auto';
          label.style.transform = 'none';
          label.style.borderRadius = `${DEFAULT_BORDER_RADIUS} ${DEFAULT_BORDER_RADIUS} 0 0`;
          this.overlayElement.style.borderRadius = `${DEFAULT_BORDER_RADIUS} 0 ${DEFAULT_BORDER_RADIUS} ${DEFAULT_BORDER_RADIUS}`;
        }
      }
    }
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
