/**
 * Browser-only implementation that manages overlay state and DOM bookkeeping.
 */
import { resolveDocument } from '../utils/dom.js';
import { EVENT_READY, EVENT_STAMPED, EVENT_STATE } from './events/constants.js';
import { setupOverlay } from './overlay/setup.js';
import { createScheduler } from './scheduler.js';
import { addStamps, clearStamps } from './stamp/index.js';
import type {
  CreateOverlaysControllerOptions,
  OverlayStyle,
  OverlaysController,
  StampSummary,
  State
} from './types.js';

export class BrowserController implements OverlaysController {
  private readonly root: ParentNode;
  private readonly doc: Document;
  private readonly pending = new Set<ParentNode>();
  private readonly scheduleStamp: () => void;
  private readonly overlayStyle?: OverlayStyle;

  private observer: MutationObserver | null = null;
  private disposeOverlay: (() => void) | null = null;
  private enabled = false;
  private disposed = false;
  private readyEmitted = false;

  constructor(options: CreateOverlaysControllerOptions) {
    this.root = options.root ?? document;
    this.doc = this.ensureDocument(this.root);
    this.overlayStyle = options.overlayStyle;
    this.scheduleStamp = createScheduler(() => this.runStamp());
  }

  private ensureDocument(root: ParentNode): Document {
    const resolved = resolveDocument(root);
    if (!resolved) {
      throw new Error('Unable to resolve document for visual editing overlays');
    }
    return resolved;
  }

  /** Start observing the DOM and stamp overlays immediately. */
  enable(): void {
    if (this.disposed || this.enabled) {
      return;
    }
    this.enabled = true;
    this.attach();
    this.emitState();
    this.runStamp(true);
  }

  /** Tear down observers/overlays but keep the instance reusable. */
  disable(): void {
    if (!this.enabled || this.disposed) {
      return;
    }
    this.enabled = false;
    this.detach();
    this.pending.clear();
    this.emitState();
  }

  /** Convenience wrapper that flips between enable/disable. */
  toggle(): void {
    if (this.disposed) {
      return;
    }
    if (this.enabled) {
      this.disable();
    } else {
      this.enable();
    }
  }

  /** Permanently shut down the controller and clear generated attributes. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disable();
    clearStamps(this.root);
    this.pending.clear();
    this.disposed = true;
    this.emitState();
  }

  /** Whether the overlays are currently active. */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Whether the controller has been disposed and cannot be re-enabled. */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Re-run the stega scan for the entire tree (or a subtree) on demand.
   * Useful when content updates happen outside of mutation observers.
   */
  refresh(root?: ParentNode): void {
    if (this.disposed || !this.enabled) {
      return;
    }
    this.pending.add(root ?? this.root);
    this.scheduleStamp();
  }

  /**
   * Wire up DOM observers and auxiliary UI (overlay, dev panel).
   */
  private attach(): void {
    if (this.observer) {
      return;
    }
    this.observer = new MutationObserver((mutations) => this.handleMutations(mutations));
    this.observer.observe(this.root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['alt']
    });
    this.disposeOverlay = setupOverlay(this.doc, this.overlayStyle);
  }

  /** Reverse everything created in `attach`, leaving the DOM untouched. */
  private detach(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.disposeOverlay) {
      this.disposeOverlay();
      this.disposeOverlay = null;
    }
  }

  /**
   * Collect mutated subtrees so we can batch-stamp them on the next tick.
   * This keeps dom writes/coalescing predictable even in noisy environments.
   */
  private handleMutations(mutations: MutationRecord[]): void {
    if (!this.enabled || this.disposed) {
      this.pending.clear();
      return;
    }

    let hasChanges = false;

    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        const node = mutation.target as Node;
        const parent = (node.parentElement ?? node.parentNode ?? this.root) as ParentNode;
        this.pending.add(parent);
        hasChanges = true;
      } else if (mutation.type === 'attributes' && mutation.attributeName === 'alt') {
        const element = mutation.target as Element;
        this.pending.add((element.parentElement ?? this.root) as ParentNode);
        hasChanges = true;
      } else if (mutation.type === 'childList') {
        this.pending.add(mutation.target as ParentNode);
        for (const node of mutation.addedNodes) {
          if (
            node.nodeType === Node.ELEMENT_NODE ||
            node.nodeType === Node.DOCUMENT_FRAGMENT_NODE
          ) {
            this.pending.add(node as ParentNode);
          }
        }
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.scheduleStamp();
    }
  }

  /**
   * Kick off stega decoding for all pending roots and aggregate the result.
   */
  private runStamp(firstAfterEnable = false): void {
    if (!this.enabled || this.disposed) {
      this.pending.clear();
      return;
    }

    const roots = this.pending.size === 0 ? [this.root] : Array.from(this.pending);

    this.pending.clear();

    const summaries: StampSummary[] = [];

    for (const root of roots) {
      const summary = addStamps(root);
      summaries.push(summary);
    }

    const combinedSummary =
      summaries.length === 1
        ? summaries[0]
        : {
            appliedStamps: summaries.reduce((acc, summary) => {
              for (const [key, value] of summary.appliedStamps.entries()) {
                acc.set(key, value);
              }
              return acc;
            }, new Map<Element, string>()),
            scope: this.root
          };

    if (firstAfterEnable && combinedSummary.appliedStamps.size === 0) {
      const message =
        '[@datocms/content-link] No editable elements were detected after enable(). ' +
        "If you're hydrating/streaming, do not replace the server-rendered nodes that carry stega-encoded data.\n" +
        'reuse the exact DOM and render into it.';

      console.warn(message);
    }

    if (summaries.length === 0) {
      return;
    }

    this.handleStampResult(combinedSummary);
  }

  /**
   * Emit events/callbacks and emit a warning the first time we detect no
   * editable nodes at the root (a common hydration gotcha).
   */
  private handleStampResult(summary: StampSummary): void {
    this.dispatch(EVENT_STAMPED, summary);

    if (!this.readyEmitted) {
      this.readyEmitted = true;
      this.dispatch(EVENT_READY, summary);
    }
  }

  /** Broadcast the current enabled/disposed flags to listeners. */
  private emitState(): void {
    const state: State = {
      enabled: this.enabled,
      disposed: this.disposed
    };
    this.dispatch(EVENT_STATE, state);
  }

  /**
   * Dispatch a CustomEvent when possible so non-JS integrations can observe
   * lifecycle changes.
   */
  private dispatch<T>(type: string, payload: T): void {
    const CustomEventCtor =
      this.doc.defaultView?.CustomEvent ??
      (typeof CustomEvent !== 'undefined' ? CustomEvent : undefined);
    if (!CustomEventCtor) {
      return;
    }

    try {
      const event = new CustomEventCtor(type, { detail: payload });
      this.doc.dispatchEvent(event);
    } catch {
      // Ignore dispatch failures (e.g. CustomEvent polyfill not available)
    }
  }
}
