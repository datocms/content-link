import {
  abortableSleep,
  getScrollDistance,
  inViewport,
  isKeyboardEvent,
  resolveDocument
} from '../../utils/dom.js';
import { HighlightOverlay } from '../../utils/HighlightOverlay.js';
import { findEditableTarget } from '../clickToEdit/findEditableTarget.js';
import { AUTOMATIC_STAMP_ATTRIBUTE, MANUAL_STAMP_ATTRIBUTE } from '../domStamping/constants.js';
const STAGGER_DELAY = 10;

export class FlashAllManager {
  private listenerAbortController: AbortController;
  private overlays: HighlightOverlay[] = [];
  private pendingAnimationAbortController: AbortController | null = null;

  constructor(private readonly wrapperElement: ParentNode) {
    this.listenerAbortController = new AbortController();

    this.document.addEventListener('keydown', (event) => this.onKeyDown(event), {
      capture: true,
      signal: this.listenerAbortController.signal
    });

    this.document.addEventListener('keyup', (event) => this.onKeyUp(event), {
      capture: true,
      signal: this.listenerAbortController.signal
    });
  }

  get document() {
    return resolveDocument(this.wrapperElement);
  }

  private async onKeyDown(event: Event) {
    if (!isKeyboardEvent(event) || event.key !== 'Alt') {
      return;
    }

    const stampedElements = this.wrapperElement.querySelectorAll(
      `[${MANUAL_STAMP_ATTRIBUTE}], [${AUTOMATIC_STAMP_ATTRIBUTE}]`
    );

    const targetsSet = new Set<Element>();
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
      await this.maybeScrollToTargets(targets, signal);

      targets.map((target, index) => {
        const overlay = new HighlightOverlay(target);
        overlay.fadeIn(index * STAGGER_DELAY, abortController);
        this.overlays.push(overlay);
      });
    } catch (_) {
      // animation cancelled
    }
  }

  private async onKeyUp(event: Event) {
    if (!isKeyboardEvent(event) || event.key !== 'Alt') {
      return;
    }

    this.cancelPendingAnimation();

    const abortController = new AbortController();

    this.overlays.map((overlay, index) => {
      overlay.disposeWithFadeOut(index * STAGGER_DELAY, abortController);
    });

    this.overlays = [];
  }

  dispose() {
    this.listenerAbortController.abort();
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

  private async maybeScrollToTargets(targets: Element[], signal: AbortSignal) {
    const someTargetIsVisible = targets.some(inViewport);

    if (someTargetIsVisible) {
      return;
    }

    let best: Element | null = null;
    let bestDistance = Infinity;

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
