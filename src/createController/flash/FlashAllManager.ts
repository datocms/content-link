import { HighlightOverlay } from '../../utils/HighlightOverlay.js';
import { maybeScrollToNearestTarget, sleep, waitTwoRafs } from '../../utils/dom.js';
import { STAMPED_ELEMENTS_SELECTOR } from '../domStamping/constants.js';

export const STAGGER_DELAY = 10;

export class FlashAllManager {
  private overlays: HighlightOverlay[] = [];
  private pendingAnimationAbortController: AbortController | null = null;
  private disposed: boolean = false;

  constructor(private readonly wrapperElement: ParentNode) {}

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

      const targetsCount = targets.length;

      targets.map((target, index) => {
        const overlay = new HighlightOverlay(target);
        overlay.fadeIn(targetsCount < 50 ? index * STAGGER_DELAY : 0, abortController);
        this.overlays.push(overlay);
      });
    } catch (_) {
      // animation cancelled
    }
  }

  fadeOut() {
    if (this.disposed) return;

    this.cancelPendingAnimation();

    const abortController = new AbortController();

    const overlaysCount = this.overlays.length;

    this.overlays.map((overlay, index) => {
      overlay.disposeWithFadeOut(overlaysCount < 50 ? index * STAGGER_DELAY : 0, abortController);
    });

    this.overlays = [];
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

    this.overlays.forEach((overlay) => {
      overlay.cancelPendingAnimation();
      overlay.dispose();
    });
    this.overlays = [];
  }
}
