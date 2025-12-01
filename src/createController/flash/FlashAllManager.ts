import { HighlightOverlay } from '../../utils/HighlightOverlay.js';
import { maybeScrollToNearestTarget, sleep, waitTwoRafs } from '../../utils/dom.js';
import { findEditableTarget } from '../clickToEdit/findEditableTarget.js';
import { STAMPED_ELEMENTS_SELECTOR } from '../domStamping/constants.js';

export const STAGGER_DELAY = 10;

export class FlashAllManager {
  private overlays: HighlightOverlay[] = [];
  private pendingAnimationAbortController: AbortController | null = null;
  private disposed: boolean = false;

  constructor(private readonly wrapperElement: ParentNode) {}

  async flash(scrollToNearestTarget: boolean) {
    if (this.disposed) return;

    await waitTwoRafs();
    this.fadeIn(scrollToNearestTarget);
    await sleep(800);
    this.fadeOut();
  }

  private async fadeIn(scrollToNearestTarget: boolean) {
    if (this.disposed) return;

    const stampedElements = this.wrapperElement.querySelectorAll(STAMPED_ELEMENTS_SELECTOR);

    const targetsSet = new Set<HTMLElement>();
    for (const element of stampedElements) {
      const target = findEditableTarget(element as Element);
      if (target) {
        targetsSet.add(target.element);
      }
    }

    const targets = Array.from(targetsSet);

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

      targets.map((target, index) => {
        const overlay = new HighlightOverlay(target);
        overlay.fadeIn(index * STAGGER_DELAY, abortController);
        this.overlays.push(overlay);
      });
    } catch (_) {
      // animation cancelled
    }
  }

  private fadeOut() {
    if (this.disposed) return;

    this.cancelPendingAnimation();

    const abortController = new AbortController();

    this.overlays.map((overlay, index) => {
      overlay.disposeWithFadeOut(index * STAGGER_DELAY, abortController);
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
