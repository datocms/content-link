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
import { OVERLAY_ATTRIBUTE } from '../createController/domStamping/constants.js';
import {
  type LayoutReadCache,
  abortableSleep,
  createLayoutReadCache,
  getDocumentWindow,
  measure,
  resolveDocument,
  waitTwoRafs
} from './dom.js';
import { getScrollResizeCoordinator } from './scrollResizeCoordinator.js';
import { getSharedResizeObserver } from './sharedResizeObserver.js';

const FADE_DELAY = 200;
// The label is in the top-right corner of the overlay, in the border. Thus
// the pointer stays on the target when it is on the label, and menus that
// open on hover stay open. The radius agrees with the inner curve of the border.
const LABEL_BORDER_RADIUS = `0 calc(${DEFAULT_BORDER_RADIUS} - ${DEFAULT_BORDER_WIDTH}) 0 ${DEFAULT_BORDER_RADIUS}`;
const BORDER_WIDTH = Number.parseFloat(DEFAULT_BORDER_WIDTH);

const LABEL_TEXT = 'Open in DatoCMS ↗';
// The label is only shown when the target has sufficient room for it:
// - The label must not use more than this part of the width of the overlay.
const MAX_LABEL_WIDTH_RATIO = 0.5;
// - The label must stay at this distance, in pixels, from the text of the target.
const LABEL_TEXT_CLEARANCE = 8;
// The size of the label when the browser cannot measure it.
const FALLBACK_LABEL_SIZE = { width: 150, height: 24 };
// The maximum number of text nodes to examine in one target.
const MAX_TEXT_NODES = 300;

type Box = { top: number; left: number; right: number; bottom: number };

export interface HighlightOverlayOptions {
  onDispose?: () => void;
  showLabel?: boolean;
  overlayColors?: OverlayColors;
}

/** The result of a layout read. `null` means that the overlay must be hidden. */
type OverlayLayout = {
  top: number;
  left: number;
  width: number;
  height: number;
  zIndex: string;
  labelFits: boolean;
} | null;

export class HighlightOverlay {
  /**
   * Sets the position of many overlays.
   * It reads the layout of all the targets first, then it writes all the
   * styles. Thus the browser computes the layout only one time.
   */
  static showAll(overlays: HighlightOverlay[]): void {
    const cache = createLayoutReadCache();
    const layouts = overlays.map((overlay) => overlay.readLayout(cache));

    overlays.forEach((overlay, index) => {
      overlay.writeLayout(layouts[index]);
    });
  }

  private overlayElement: HTMLDivElement;
  private labelElement: HTMLDivElement | null = null;
  private labelIsShown = true;
  private labelSize: { width: number; height: number } | null = null;
  /** The last result of the label check, and the target size it applies to. */
  private labelFitCheck: { width: number; height: number; fits: boolean } | null = null;

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
    this.scrollResizeUnsubscribe = coordinator.subscribe((cache) => this.deferredUpdate(cache));

    const sharedObserver = getSharedResizeObserver(this.window);
    if (sharedObserver) {
      this.resizeUnobserve = sharedObserver.observe(targetElement, (cache) =>
        this.deferredUpdate(cache)
      );
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
    overlay.style.borderRadius = DEFAULT_BORDER_RADIUS;
    overlay.style.background = this.overlayColors.backgroundColor;
    overlay.style.boxSizing = 'border-box';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = OVERLAY_Z_INDEX;
    overlay.style.display = 'block';
    overlay.style.opacity = '1';
    overlay.style.transition = `opacity ${FADE_DELAY}ms ease-in-out`;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute(OVERLAY_ATTRIBUTE, '');

    if (withLabel) {
      const label = this.document.createElement('div');
      label.textContent = LABEL_TEXT;
      label.style.position = 'absolute';
      label.style.top = '0';
      label.style.right = '0';
      label.style.backgroundColor = this.overlayColors.borderColor;
      label.style.color = 'white';
      label.style.padding = '4px 12px';
      label.style.borderRadius = LABEL_BORDER_RADIUS;
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
      this.labelElement = label;
    }

    return overlay;
  }

  private updatePosition(): void {
    this.writeLayout(this.readLayout());
  }

  /** Reads the layout now and returns a function that writes the styles. */
  private deferredUpdate(cache: LayoutReadCache): () => void {
    const layout = this.readLayout(cache);
    return () => this.writeLayout(layout);
  }

  /** Reads the layout of the target. This function does not change the DOM. */
  private readLayout(cache?: LayoutReadCache): OverlayLayout {
    const rect = measure(this.targetElement, cache);

    if (!rect) {
      return null;
    }

    return {
      ...rect,
      zIndex: this.computeOverlayZIndex(this.targetElement, cache),
      labelFits: this.labelFits(rect)
    };
  }

  /**
   * Tells if the target has sufficient room for the label. The label must not
   * use too much of the width of the overlay, and it must not be on the text
   * of the target or near it. This function only reads the layout.
   */
  private labelFits(rect: { top: number; left: number; width: number; height: number }): boolean {
    if (!this.labelElement) {
      return false;
    }

    // The text does not move in the target when the page scrolls. Thus the
    // result only changes when the size of the target changes.
    const last = this.labelFitCheck;
    if (last && last.width === rect.width && last.height === rect.height) {
      return last.fits;
    }

    const labelSize = this.readLabelSize(this.labelElement);
    const overlayWidth = rect.width + DEFAULT_OVERLAY_PADDING * 2;
    const labelRight = rect.left + rect.width + DEFAULT_OVERLAY_PADDING - BORDER_WIDTH;
    const labelTop = rect.top - DEFAULT_OVERLAY_PADDING + BORDER_WIDTH;

    const fits =
      labelSize.width <= overlayWidth * MAX_LABEL_WIDTH_RATIO &&
      !this.textIntersects({
        top: labelTop - LABEL_TEXT_CLEARANCE,
        left: labelRight - labelSize.width - LABEL_TEXT_CLEARANCE,
        right: labelRight + LABEL_TEXT_CLEARANCE,
        bottom: labelTop + labelSize.height + LABEL_TEXT_CLEARANCE
      });

    this.labelFitCheck = { width: rect.width, height: rect.height, fits };

    return fits;
  }

  private readLabelSize(label: HTMLElement): { width: number; height: number } {
    if (this.labelSize) {
      return this.labelSize;
    }

    // The browser cannot measure the label while it is hidden.
    if (label.offsetWidth > 0 && label.offsetHeight > 0) {
      this.labelSize = { width: label.offsetWidth, height: label.offsetHeight };
      return this.labelSize;
    }

    return FALLBACK_LABEL_SIZE;
  }

  /** Tells if some text of the target is in the box. */
  private textIntersects(box: Box): boolean {
    const range = this.document.createRange();

    if (typeof range.getClientRects !== 'function') {
      return false;
    }

    const walker = this.document.createTreeWalker(this.targetElement, NodeFilter.SHOW_TEXT);
    let examined = 0;

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.nodeValue?.trim()) {
        continue;
      }

      if (++examined > MAX_TEXT_NODES) {
        break;
      }

      range.selectNodeContents(node);

      for (const textRect of range.getClientRects()) {
        if (
          textRect.right > box.left &&
          textRect.left < box.right &&
          textRect.bottom > box.top &&
          textRect.top < box.bottom
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /** Writes the styles of the overlay. This function does not read the layout. */
  private writeLayout(rect: OverlayLayout): void {
    if (!rect) {
      this.overlayElement.style.display = 'none';
      return;
    }

    this.overlayElement.style.zIndex = rect.zIndex;
    this.overlayElement.style.display = 'block';
    this.overlayElement.style.top = `${rect.top - DEFAULT_OVERLAY_PADDING}px`;
    this.overlayElement.style.left = `${rect.left - DEFAULT_OVERLAY_PADDING}px`;
    this.overlayElement.style.width = `${rect.width + DEFAULT_OVERLAY_PADDING * 2}px`;
    this.overlayElement.style.height = `${rect.height + DEFAULT_OVERLAY_PADDING * 2}px`;

    if (this.labelElement && rect.labelFits !== this.labelIsShown) {
      this.labelElement.style.display = rect.labelFits ? 'block' : 'none';
      this.labelIsShown = rect.labelFits;
    }
  }

  private computeOverlayZIndex(el: Element, cache?: LayoutReadCache): string {
    if (!this.window) {
      return '0';
    }

    const zIndex = this.findStackingZIndex(el, this.window, cache);

    return zIndex !== null ? String(zIndex) : '0';
  }

  /**
   * Finds the numeric z-index of the outermost ancestor that has one.
   * The element itself is included in the search.
   */
  private findStackingZIndex(
    el: Element,
    win: Window & typeof globalThis,
    cache?: LayoutReadCache
  ): number | null {
    const cached = cache?.stackingZIndex.get(el);
    if (cached !== undefined) {
      return cached;
    }

    const parent = el.parentElement;
    let result = parent ? this.findStackingZIndex(parent, win, cache) : null;

    if (result === null) {
      const parsed = Number(win.getComputedStyle(el).zIndex);
      // `Number('auto')` is not a finite number.
      if (Number.isFinite(parsed)) {
        result = parsed;
      }
    }

    cache?.stackingZIndex.set(el, result);

    return result;
  }
}
