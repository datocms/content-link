import { HighlightOverlay } from '../../utils/HighlightOverlay.js';
import {
  abortableSleep,
  getScrollDistance,
  inViewport,
  sleep,
  waitTwoRafs
} from '../../utils/dom.js';
import { findEditableTarget } from '../clickToEdit/findEditableTarget.js';
import { STAMPED_ELEMENTS_SELECTOR } from '../domStamping/constants.js';
const STAGGER_DELAY = 10;

export class FlashAllManager {
  private overlays: HighlightOverlay[] = [];
  private pendingAnimationAbortController: AbortController | null = null;

  constructor(private readonly wrapperElement: ParentNode) {}

  async flash(scrollToNearestTarget: boolean) {
    await waitTwoRafs();
    this.fadeIn(scrollToNearestTarget);
    await sleep(800);
    this.fadeOut();
  }

  private async fadeIn(scrollToNearestTarget: boolean) {
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
        await this.maybeScrollToNearestTarget(targets, signal);
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
    this.cancelPendingAnimation();

    const abortController = new AbortController();

    this.overlays.map((overlay, index) => {
      overlay.disposeWithFadeOut(index * STAGGER_DELAY, abortController);
    });

    this.overlays = [];
  }

  dispose() {
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

  private async maybeScrollToNearestTarget(targets: Element[], signal: AbortSignal) {
    const someTargetIsVisible = targets.some(inViewport);

    if (someTargetIsVisible) {
      return;
    }

    let best: Element | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const target of targets) {
      const dist = getScrollDistance(target, {
        scrollMode: 'if-needed',
        block: 'center',
        inline: 'nearest'
      });

      if (dist < bestDistance) {
        bestDistance = dist;
        best = target;
      }
    }

    if (!best) {
      return;
    }

    best.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await abortableSleep(400, signal);
  }
}
