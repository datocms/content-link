import { HighlightOverlay } from '../../utils/HighlightOverlay.js';
import { maybeScrollToNearestTarget, sleep, waitTwoRafs } from '../../utils/dom.js';
import { extractInfo } from '../../utils/editUrl.js';
import {
  AUTOMATIC_STAMP_ATTRIBUTE,
  MANUAL_STAMP_ATTRIBUTE,
  STAMPED_ELEMENTS_SELECTOR
} from '../domStamping/constants.js';
import { STAGGER_DELAY } from './FlashAllManager.js';

export class FlashItemManager {
  private overlays: HighlightOverlay[] = [];
  private pendingAnimationAbortController: AbortController | null = null;
  private disposed: boolean = false;

  constructor(
    private readonly wrapperElement: ParentNode,
    private readonly itemId: string
  ) {}

  async flash(scrollToNearestTarget: boolean) {
    if (this.disposed) return;
    await waitTwoRafs();
    this.fadeIn(scrollToNearestTarget);
    await sleep(1500);
    await this.fadeOut();
  }

  private async fadeIn(scrollToNearestTarget: boolean) {
    if (this.disposed) return;
    const stampedElements =
      this.wrapperElement.querySelectorAll<HTMLElement>(STAMPED_ELEMENTS_SELECTOR);

    const targetsSet = new Set<HTMLElement>();
    for (const element of stampedElements) {
      const editUrl =
        element.getAttribute(MANUAL_STAMP_ATTRIBUTE) ||
        element.getAttribute(AUTOMATIC_STAMP_ATTRIBUTE);
      if (editUrl) {
        // Filter by itemId - parse editUrl to extract itemId
        const editUrlInfo = extractInfo(editUrl);
        if (editUrlInfo && editUrlInfo.itemId === this.itemId) {
          targetsSet.add(element);
        }
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

  private async fadeOut() {
    if (this.disposed) return;
    this.cancelPendingAnimation();

    const abortController = new AbortController();

    const allFadedOut = Promise.all(
      this.overlays.map((overlay, index) =>
        overlay.disposeWithFadeOut(index * STAGGER_DELAY, abortController)
      )
    );

    this.overlays = [];

    return await allFadedOut;
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
