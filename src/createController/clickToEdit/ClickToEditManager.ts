import { HighlightOverlay } from '../../utils/HighlightOverlay.js';
import type { OverlayColors } from './constants.js';
/**
 * Manages click-to-edit functionality: highlights editable regions under the pointer
 * and invokes callback when clicked. Absorbs all logic from setup.ts into a class-based manager.
 */
import { isKeyboardEvent, isMouseEvent, isMousePointerEvent } from '../../utils/dom.js';
import { rafThrottle } from '../../utils/rafThrottle.js';
import { findEditableTarget } from './findEditableTarget.js';

export class ClickToEditManager {
  private highlightOverlay: HighlightOverlay | null = null;
  private listenerAbortController: AbortController | null = null;

  private throttledOnPointerMove = rafThrottle((event: Event) =>
    this.immediateOnPointerMoveEvent(event)
  );

  constructor(
    private readonly document: Document,
    private readonly onEditClick: (editUrl: string) => void,
    private readonly shouldShowLabel: () => boolean = () => false,
    private readonly overlayColors?: OverlayColors
  ) {}

  isActive(): boolean {
    return Boolean(this.listenerAbortController);
  }

  activate() {
    if (this.isActive()) {
      return;
    }

    this.listenerAbortController = new AbortController();

    const options: AddEventListenerOptions = {
      capture: true,
      signal: this.listenerAbortController.signal
    };

    this.document.addEventListener('pointerover', this.throttledOnPointerMove, options);
    this.document.addEventListener('pointermove', this.throttledOnPointerMove, options);
    this.document.addEventListener('pointerleave', (event) => this.onPointerLeave(event), options);
    this.document.addEventListener('click', (event) => this.onClick(event), options);
    this.document.addEventListener('focusin', (event) => this.onFocusIn(event), options);
    this.document.addEventListener('focusout', () => this.onFocusOut(), options);
    this.document.addEventListener('keydown', (event) => this.onKeyDown(event), options);
  }

  private immediateOnPointerMoveEvent(event: Event) {
    if (!isMousePointerEvent(event)) {
      return;
    }

    const target = findEditableTarget(event.target);

    this.highlightElement(target?.element);
  }

  private onPointerLeave(event: Event) {
    if (!isMousePointerEvent(event)) {
      return;
    }

    const target = findEditableTarget(event.relatedTarget);

    if (!target) {
      this.highlightElement(null);
    }
  }

  private onFocusIn(event: Event) {
    const target = findEditableTarget(event.target);
    this.highlightElement(target?.element);
  }

  private onKeyDown(event: Event) {
    if (!isKeyboardEvent(event)) {
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
      return;
    }

    const target = findEditableTarget(this.document.activeElement);

    if (!target) {
      return;
    }

    this.highlightElement(target.element);

    event.preventDefault();
    event.stopPropagation();

    this.onEditClick(target.editUrl);
  }

  private onClick(event: Event) {
    if (!isMouseEvent(event) || event.button !== 0) {
      return;
    }

    const target = findEditableTarget(event.target);

    if (!target) {
      return;
    }

    this.highlightElement(target.element);

    event.preventDefault();
    event.stopPropagation();

    this.onEditClick(target.editUrl);
  }

  private onFocusOut() {
    this.highlightElement(null);
  }

  private highlightElement(rawTargetElement: HTMLElement | null | undefined) {
    const targetElement =
      rawTargetElement && !rawTargetElement.isConnected ? null : rawTargetElement;

    if (this.highlightOverlay && this.highlightOverlay.targetElement === targetElement) {
      return;
    }

    if (this.highlightOverlay) {
      this.highlightOverlay.dispose();
      this.highlightOverlay = null;
    }

    if (targetElement) {
      const prevCursor = targetElement.style.cursor;
      targetElement.style.cursor = 'pointer';
      this.highlightOverlay = new HighlightOverlay(targetElement, {
        onDispose: () => {
          targetElement.style.cursor = prevCursor;
        },
        showLabel: this.shouldShowLabel(),
        overlayColors: this.overlayColors
      });
      this.highlightOverlay.show();
    }
  }

  deactivate() {
    if (!this.isActive()) {
      return;
    }

    this.listenerAbortController!.abort();
    this.listenerAbortController = null;
    this.throttledOnPointerMove.cancel();

    this.highlightOverlay?.dispose();
    this.highlightOverlay = null;
  }
}
