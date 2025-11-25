/**
 * Manages DOM stamping: observation, mutation batching, stega decoding, and attribute application.
 * Absorbs logic from stamp/index.ts and BrowserController's stamping functionality.
 */
import { decodeStega, splitStega } from '../../stega/decode.js';
import { resolveDocument } from '../../utils/dom.js';
import { createScheduler } from '../scheduler.js';
import type { StampSummary } from '../types.js';
import { AUTOMATIC_STAMP_ATTRIBUTE, EDIT_GROUP_ATTRIBUTE } from './constants.js';
import type { DomStampingManagerOptions } from './types.js';

export class DomStampingManager {
  private readonly root: ParentNode;
  private readonly onStamped: (summary: StampSummary) => void;
  private readonly scheduleStamp: () => void;
  private readonly pending = new Set<ParentNode>();

  private observer: MutationObserver | null = null;
  private active = false;

  constructor(options: DomStampingManagerOptions) {
    this.root = options.root;
    this.onStamped = options.onStamped;
    this.scheduleStamp = createScheduler(() => this.runStamp());
  }

  /** Begin observation and perform initial stamp */
  start(): void {
    if (this.active) {
      return;
    }
    this.active = true;

    // Set up MutationObserver
    this.observer = new MutationObserver((mutations) => this.handleMutations(mutations));
    this.observer.observe(this.root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['alt']
    });

    // Perform initial stamp
    this.runStamp(true);
  }

  /** Stop observation and clear all stamps */
  stop(): void {
    if (!this.active) {
      return;
    }
    this.active = false;

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    this.pending.clear();
    this.clearStamps();
  }

  /** Whether the manager is currently active */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Collect mutated subtrees so we can batch-stamp them on the next tick.
   * This keeps DOM writes/coalescing predictable even in noisy environments.
   */
  private handleMutations(mutations: MutationRecord[]): void {
    if (!this.active) {
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
  private runStamp(firstStamp = false): void {
    if (!this.active) {
      this.pending.clear();
      return;
    }

    const roots = this.pending.size === 0 ? [this.root] : Array.from(this.pending);

    this.pending.clear();

    const summaries: StampSummary[] = [];

    for (const root of roots) {
      const summary = this.addStamps(root);
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

    if (firstStamp && combinedSummary.appliedStamps.size === 0) {
      const message =
        '[@datocms/content-link] No editable elements were detected after initialization. ' +
        'Make sure that Content Link headers are enabled in your GraphQL requests! ' +
        "If you're hydrating/streaming, do not replace the server-rendered nodes that carry stega-encoded data: reuse the same DOM element!";

      console.warn(message);
    }

    if (summaries.length === 0) {
      return;
    }

    // Emit stamped callback
    this.onStamped(combinedSummary);
  }

  /**
   * Traverse `root`, decode stega-encoded data, stamp DOM elements with edit URL
   * attributes, and return bookkeeping information.
   * (Absorbed from stamp/index.ts addStamps function)
   */
  private addStamps(root: ParentNode): StampSummary {
    const doc = resolveDocument(root);

    if (!doc) {
      return {
        appliedStamps: new Map(),
        scope: root
      };
    }

    // Track elements stamped in this pass to detect collisions within the same pass
    const appliedStamps = new Map<Element, string>();

    // First pass: walk text nodes and process stega-encoded content
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);

    let node: Node | null = walker.nextNode();
    while (node) {
      if (!(node instanceof Text)) {
        node = walker.nextNode();
        continue;
      }
      const value = node.nodeValue ?? '';
      const parent = node.parentElement;

      const cleanValue = this.stampTargetAndReturnClean(
        value,
        parent ? this.resolveTarget(parent) : null,
        appliedStamps
      );

      if (cleanValue !== undefined) {
        node.nodeValue = cleanValue;
      }

      node = walker.nextNode();
    }

    // Second pass: inspect image alts, since they are not part of the text walker.
    for (const img of root.querySelectorAll<HTMLImageElement>('img[alt]')) {
      const alt = img.getAttribute('alt');

      const cleanAlt = this.stampTargetAndReturnClean(alt, this.resolveTarget(img), appliedStamps);

      if (cleanAlt !== undefined) {
        img.setAttribute('alt', cleanAlt);
      }
    }

    const summary: StampSummary = {
      appliedStamps: appliedStamps,
      scope: root
    };

    return summary;
  }

  /**
   * Process stega-encoded values, decode them, and stamp the target element.
   * This handles the complete flow: split, decode, resolve target, check collisions, and stamp.
   */
  private stampTargetAndReturnClean(
    value: string | null,
    target: Element | null,
    appliedStamps: Map<Element, string>
  ): string | undefined {
    if (!value || !target) {
      return;
    }

    const split = splitStega(value);
    if (!split.encoded) {
      return undefined;
    }

    const decoded = decodeStega(value, split);
    if (!decoded) {
      return undefined;
    }

    // Check for collision within this pass
    const existingStamp = appliedStamps.get(target);

    if (existingStamp && existingStamp !== decoded.href) {
      this.warnCollision(target, existingStamp, decoded.href);
    }

    // Stamp the attribute if it changed
    const existingEditUrl = target.getAttribute(AUTOMATIC_STAMP_ATTRIBUTE);

    if (existingEditUrl !== decoded.href) {
      target.setAttribute(AUTOMATIC_STAMP_ATTRIBUTE, decoded.href);
      appliedStamps.set(target, decoded.href);
    }

    return split.cleaned;
  }

  /** Log when two stega-encoded payloads map to the same element in a single pass */
  private warnCollision(el: Element, originalUrl: string, nextUrl: string): void {
    const message = `[@datocms/content-link] Multiple stega-encoded payloads resolved to the same DOM element. Previous URL: ${originalUrl}. Incoming URL: ${nextUrl}. Wrap each encoded block in its own element (for example by adding ${EDIT_GROUP_ATTRIBUTE}).`;

    console.warn(message, el);
  }

  /** If the site provided a group, we stamp that instead */
  private resolveTarget(start: Element): Element {
    const wrapper = start.closest<HTMLElement>(`[${EDIT_GROUP_ATTRIBUTE}]`);
    return wrapper ?? start;
  }

  /**
   * Remove all generated stamps inside `root`. Used when stopping the manager.
   * (Absorbed from stamp/index.ts clearStamps function)
   */
  private clearStamps(): void {
    const nodes = this.root.querySelectorAll<HTMLElement>(`[${AUTOMATIC_STAMP_ATTRIBUTE}]`);
    for (const el of nodes) {
      el.removeAttribute(AUTOMATIC_STAMP_ATTRIBUTE);
    }
  }
}
