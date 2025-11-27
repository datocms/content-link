/**
 * Manages DOM stamping: observation, mutation batching, stega decoding, and attribute application.
 * Absorbs logic from stamp/index.ts and BrowserController's stamping functionality.
 */
import { decodeStega, splitStega } from '../../stega/decode.js';
import { createScheduler } from '../../utils/createScheduler.js';
import { resolveDocument } from '../../utils/dom.js';
import type { StampSummary } from '../types.js';
import { AUTOMATIC_STAMP_ATTRIBUTE, EDIT_GROUP_ATTRIBUTE } from './constants.js';

export class DomStampingManager {
  private observer: MutationObserver;
  private readonly pendingElementsToStamp = new Set<ParentNode>();
  private readonly scheduleStamping = createScheduler(() => this.instantStampPendingElements());

  constructor(
    private readonly root: ParentNode,
    private readonly onStamp: (summary: StampSummary) => void
  ) {
    this.observer = new MutationObserver((mutations) => this.handleMutations(mutations));

    this.observer.observe(this.root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['alt']
    });

    this.instantStampPendingElements(true);
  }

  dispose() {
    this.observer.disconnect();
    this.pendingElementsToStamp.clear();

    const nodes = this.root.querySelectorAll<HTMLElement>(`[${AUTOMATIC_STAMP_ATTRIBUTE}]`);

    for (const el of nodes) {
      el.removeAttribute(AUTOMATIC_STAMP_ATTRIBUTE);
    }
  }

  private handleMutations(mutations: MutationRecord[]) {
    let hasChanges = false;

    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        const node = mutation.target as Node;
        const parent = (node.parentElement ?? node.parentNode ?? this.root) as ParentNode;
        this.pendingElementsToStamp.add(parent);
        hasChanges = true;
      } else if (mutation.type === 'attributes' && mutation.attributeName === 'alt') {
        const element = mutation.target as Element;
        this.pendingElementsToStamp.add((element.parentElement ?? this.root) as ParentNode);
        hasChanges = true;
      } else if (mutation.type === 'childList') {
        this.pendingElementsToStamp.add(mutation.target as ParentNode);
        for (const node of mutation.addedNodes) {
          if (
            node.nodeType === Node.ELEMENT_NODE ||
            node.nodeType === Node.DOCUMENT_FRAGMENT_NODE
          ) {
            this.pendingElementsToStamp.add(node as ParentNode);
          }
        }
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.scheduleStamping();
    }
  }

  private instantStampPendingElements(firstStamping = false) {
    const elementsToStamp =
      this.pendingElementsToStamp.size === 0
        ? [this.root]
        : Array.from(this.pendingElementsToStamp);

    this.pendingElementsToStamp.clear();

    const summaries: StampSummary[] = [];

    for (const elementToStamp of elementsToStamp) {
      const summary = this.stampElement(elementToStamp);
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

    if (firstStamping && combinedSummary.appliedStamps.size === 0) {
      const message =
        '[@datocms/content-link] No editable elements were detected after initialization. ' +
        'Make sure that Content Link headers are enabled in your GraphQL requests! ' +
        "If you're hydrating/streaming, do not replace the server-rendered nodes that carry stega-encoded data: reuse the same DOM element!";

      console.warn(message);
    }

    if (summaries.length === 0) {
      return;
    }

    this.onStamp(combinedSummary);
  }

  private stampElement(element: ParentNode): StampSummary {
    const doc = resolveDocument(element);

    if (!doc) {
      return {
        appliedStamps: new Map(),
        scope: element
      };
    }

    // Track elements stamped in this pass to detect collisions within the same pass
    const appliedStamps = new Map<Element, string>();

    // First pass: walk text nodes and process stega-encoded content
    const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);

    let node: Node | null = walker.nextNode();
    while (node) {
      if (!(node instanceof Text)) {
        node = walker.nextNode();
        continue;
      }
      const value = node.nodeValue ?? '';
      const parent = node.parentElement;

      const cleanValue = this.addStampingAttributesTargetAndReturnStrippedValue(
        value,
        parent ? this.maybeFindGroup(parent) : null,
        appliedStamps
      );

      if (cleanValue !== undefined) {
        node.nodeValue = cleanValue;
      }

      node = walker.nextNode();
    }

    // Second pass: inspect image alts, since they are not part of the text walker.
    for (const img of element.querySelectorAll<HTMLImageElement>('img[alt]')) {
      const alt = img.getAttribute('alt');

      const cleanAlt = this.addStampingAttributesTargetAndReturnStrippedValue(
        alt,
        this.maybeFindGroup(img),
        appliedStamps
      );

      if (cleanAlt !== undefined) {
        img.setAttribute('alt', cleanAlt);
      }
    }

    const summary: StampSummary = {
      appliedStamps: appliedStamps,
      scope: element
    };

    return summary;
  }

  private addStampingAttributesTargetAndReturnStrippedValue(
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
  private warnCollision(el: Element, originalUrl: string, nextUrl: string) {
    const message = `[@datocms/content-link] Multiple stega-encoded payloads resolved to the same DOM element. Previous URL: ${originalUrl}. Incoming URL: ${nextUrl}. Wrap each encoded block in its own element (for example by adding ${EDIT_GROUP_ATTRIBUTE}).`;

    console.warn(message, el);
  }

  private maybeFindGroup(start: Element): Element {
    const wrapper = start.closest<HTMLElement>(`[${EDIT_GROUP_ATTRIBUTE}]`);
    return wrapper ?? start;
  }
}
