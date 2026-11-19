import { HighlightOverlay } from '../../utils/HighlightOverlay.js';
import { maybeScrollToNearestTarget, sleep, waitTwoRafs } from '../../utils/dom.js';
import type { OverlayColors } from '../clickToEdit/constants.js';
import { STAMPED_ELEMENTS_SELECTOR } from '../domStamping/constants.js';

export const STAGGER_DELAY = 10;
/** With this number of overlays or more, all the overlays come in together. */
const MAX_STAGGERED_OVERLAYS = 50;

/** Overlays are also made for the elements that are this near to the viewport. */
const VIEWPORT_MARGIN = '200px';

export class FlashAllManager {
  private overlays = new Map<HTMLElement, HighlightOverlay>();
  private viewportObserver: IntersectionObserver | null = null;
  private pendingAnimationAbortController: AbortController | null = null;
  private disposed: boolean = false;

  constructor(
    private readonly wrapperElement: ParentNode,
    private readonly overlayColors?: OverlayColors
  ) {}

  async flash(scrollToNearestTarget: boolean) {
    if (this.disposed) return;

    this.fadeIn(scrollToNearestTarget);
    await sleep(1500);
    this.fadeOut();
  }

  async fadeIn(scrollToNearestTarget: boolean) {
    if (this.disposed) return;

    await waitTwoRafs();

    const stampedElements =
      this.wrapperElement.querySelectorAll<HTMLElement>(STAMPED_ELEMENTS_SELECTOR);
    const targets = Array.from(stampedElements);

    if (targets.length === 0) {
      return;
    }

    this.instantlyDisposeOverlays();

    const abortController = new AbortController();
    const { signal } = abortController;

    this.pendingAnimationAbortController = abortController;

    try {
      if (scrollToNearestTarget) {
        await maybeScrollToNearestTarget(targets, signal);
      }

      // With few overlays, the overlays come in one after the other. The
      // number that counts is the number of overlays to show, not the
      // number of editable elements on the page.
      const addOverlays = (newTargets: HTMLElement[], staggerAllowed: boolean) => {
        const withStagger = staggerAllowed && newTargets.length < MAX_STAGGERED_OVERLAYS;

        const newOverlays = newTargets.map((target, index) => {
          const overlay = new HighlightOverlay(target, { overlayColors: this.overlayColors });
          overlay.fadeIn(withStagger ? index * STAGGER_DELAY : 0, abortController);
          this.overlays.set(target, overlay);
          return overlay;
        });

        HighlightOverlay.showAll(newOverlays);
      };

      if (typeof IntersectionObserver === 'undefined') {
        addOverlays(targets, true);
        return;
      }

      // Make overlays only for the elements in the viewport or near it. A
      // page can have thousands of editable elements. When the user scrolls,
      // the observer adds and removes overlays.
      // The stagger only applies to the first group of elements, and it
      // starts from the first element in the viewport. Thus the user does
      // not wait when the viewport is at the end of a long page.
      let isFirstGroup = true;
      this.viewportObserver = new IntersectionObserver(
        (entries) => {
          const entered: HTMLElement[] = [];

          for (const entry of entries) {
            const target = entry.target as HTMLElement;
            const overlay = this.overlays.get(target);

            if (entry.isIntersecting && !overlay) {
              entered.push(target);
            } else if (!entry.isIntersecting && overlay) {
              overlay.cancelPendingAnimation();
              overlay.dispose();
              this.overlays.delete(target);
            }
          }

          addOverlays(entered, isFirstGroup);
          isFirstGroup = false;
        },
        { rootMargin: VIEWPORT_MARGIN }
      );

      for (const target of targets) {
        this.viewportObserver.observe(target);
      }
    } catch (_) {
      // animation cancelled
    }
  }

  fadeOut() {
    if (this.disposed) return;

    this.cancelPendingAnimation();

    const abortController = new AbortController();

    this.viewportObserver?.disconnect();
    this.viewportObserver = null;

    const overlays = Array.from(this.overlays.values());

    overlays.forEach((overlay, index) => {
      overlay.disposeWithFadeOut(
        overlays.length < MAX_STAGGERED_OVERLAYS ? index * STAGGER_DELAY : 0,
        abortController
      );
    });

    this.overlays.clear();
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;
    this.instantlyDisposeOverlays();
  }

  private cancelPendingAnimation() {
    this.pendingAnimationAbortController?.abort();
  }

  private instantlyDisposeOverlays() {
    this.cancelPendingAnimation();

    this.viewportObserver?.disconnect();
    this.viewportObserver = null;

    for (const overlay of this.overlays.values()) {
      overlay.cancelPendingAnimation();
      overlay.dispose();
    }
    this.overlays.clear();
  }
}
