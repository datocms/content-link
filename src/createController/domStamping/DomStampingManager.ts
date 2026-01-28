/**
 * Manages DOM stamping: observation, mutation batching, stega decoding, and attribute application.
 * Absorbs logic from stamp/index.ts and BrowserController's stamping functionality.
 */
import { vercelStegaDecode } from '@vercel/stega';
import { splitStega } from '../../stega/decode.js';
import { DecodedInfo, isDecodedInfo } from '../../stega/types.js';
import { createScheduler } from '../../utils/createScheduler.js';
import { resolveDocument } from '../../utils/dom.js';
import type { StampSummary } from '../types.js';
import {
  AUTOMATIC_STEGA_STAMP_ATTRIBUTE,
  AUTOMATIC_TARGET_STAMP_ATTRIBUTE,
  GROUP_ATTRIBUTE,
  GROUP_BOUNDARY_ATTRIBUTE,
  SOURCE_STAMP_ATTRIBUTE,
} from './constants.js';

export class DomStampingManager {
  private observer: MutationObserver;
  private readonly pendingElementsToStamp = new Set<ParentNode>();
  private readonly scheduleStamping = createScheduler(() =>
    this.instantStampPendingElements(),
  );

  constructor(
    private readonly root: ParentNode,
    private readonly onStamp: (summary: StampSummary) => void,
    private readonly stripStega: boolean = false,
  ) {
    this.observer = new MutationObserver((mutations) =>
      this.handleMutations(mutations),
    );

    this.observer.observe(this.root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['alt', SOURCE_STAMP_ATTRIBUTE],
    });

    this.instantStampPendingElements(true);
  }

  dispose() {
    this.observer.disconnect();
    this.pendingElementsToStamp.clear();

    const nodes = this.root.querySelectorAll<HTMLElement>(
      `[${AUTOMATIC_TARGET_STAMP_ATTRIBUTE}]`,
    );

    for (const el of nodes) {
      el.removeAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE);
    }
  }

  private handleMutations(mutations: MutationRecord[]) {
    let hasChanges = false;

    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        const node = mutation.target as Node;
        const parent = (node.parentElement ??
          node.parentNode ??
          this.root) as ParentNode;
        this.pendingElementsToStamp.add(parent);
        hasChanges = true;
      } else if (
        mutation.type === 'attributes' &&
        mutation.attributeName === 'alt'
      ) {
        const element = mutation.target as Element;
        this.pendingElementsToStamp.add(
          (element.parentElement ?? this.root) as ParentNode,
        );
        hasChanges = true;
      } else if (
        mutation.type === 'attributes' &&
        mutation.attributeName === SOURCE_STAMP_ATTRIBUTE
      ) {
        const element = mutation.target as Element;
        this.pendingElementsToStamp.add(
          (element.parentElement ?? this.root) as ParentNode,
        );
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
            scope: this.root,
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
        scope: element,
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

      // Skip text nodes inside <script> and <style> tags
      if (parent && this.isInsideExcludedTag(parent)) {
        node = walker.nextNode();
        continue;
      }

      const cleanValue = this.addStampingAttributesTargetAndReturnStrippedValue(
        value,
        parent,
        appliedStamps,
      );

      if (this.stripStega && cleanValue !== undefined) {
        node.nodeValue = cleanValue;
      }

      node = walker.nextNode();
    }

    // Second pass: inspect image alts, since they are not part of the text walker.
    for (const img of element.querySelectorAll<HTMLImageElement>('img[alt]')) {
      const alt = img.getAttribute('alt');

      const cleanAlt = this.addStampingAttributesTargetAndReturnStrippedValue(
        alt,
        img,
        appliedStamps,
      );

      if (this.stripStega && cleanAlt !== undefined) {
        img.setAttribute('alt', cleanAlt);
      }
    }

    // Third pass: inspect elements with data-datocms-content-link-source attribute
    for (const el of element.querySelectorAll<HTMLElement>(
      `[${SOURCE_STAMP_ATTRIBUTE}]`,
    )) {
      const sourceValue = el.getAttribute(SOURCE_STAMP_ATTRIBUTE);

      this.addStampingAttributesTargetAndReturnStrippedValue(
        sourceValue,
        el,
        appliedStamps,
      );

      // If stripStega is enabled, clear the source attribute after stamping
      if (this.stripStega) {
        el.removeAttribute(SOURCE_STAMP_ATTRIBUTE);
      }
    }

    const summary: StampSummary = {
      appliedStamps: appliedStamps,
      scope: element,
    };

    return summary;
  }

  private addStampingAttributesTargetAndReturnStrippedValue(
    value: string | null,
    elementWithStega: Element | null,
    appliedStamps: Map<Element, string>,
  ): string | undefined {
    if (!value || !elementWithStega) {
      return;
    }

    // First, check if there's stega-encoded data (cheap operation)
    let split;
    let decoded;

    try {
      split = splitStega(value);
      if (!split.encoded) {
        return undefined;
      }

      decoded = vercelStegaDecode(split.encoded) as DecodedInfo;

      if (!isDecodedInfo(decoded)) {
        return undefined;
      }
    } catch (error) {
      // If stega decoding fails, silently skip this value
      return undefined;
    }

    // Only if we have valid stega data, find the target element (more expensive DOM walk)
    const target = this.maybeFindGroup(elementWithStega);

    if (!target) {
      return;
    }

    // Check for collision within this pass
    const existingStamp = appliedStamps.get(target);

    if (existingStamp && existingStamp !== decoded.href) {
      this.warnCollision(target, existingStamp, elementWithStega, decoded.href);
    }

    // Stamp the attribute if it changed
    const existingEditUrl = target.getAttribute(
      AUTOMATIC_TARGET_STAMP_ATTRIBUTE,
    );

    if (existingEditUrl !== decoded.href) {
      target.setAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE, decoded.href);
      appliedStamps.set(target, decoded.href);
    }

    // When not stripping stega, mark the element that directly contains the stega data
    if (!this.stripStega) {
      elementWithStega.setAttribute(AUTOMATIC_STEGA_STAMP_ATTRIBUTE, '');
    }

    return split.cleaned;
  }

  /** Log when two stega-encoded payloads map to the same element in a single pass */
  private warnCollision(
    target: Element,
    originalUrl: string,
    incomingEl: Element,
    incomingUrl: string,
  ) {
    const message = `[@datocms/content-link] Multiple stega-encoded payloads resolved to the same DOM element. Previous URL: ${originalUrl}. Incoming URL: ${incomingUrl}. Wrap each encoded block in its own element (for example by adding ${GROUP_ATTRIBUTE}).`;

    console.warn(message, target, incomingEl);
  }

  private isInsideExcludedTag(element: Element | null): boolean {
    if (!element) {
      return false;
    }

    let current: Element | null = element;
    while (current) {
      if (current.tagName === 'SCRIPT' || current.tagName === 'STYLE') {
        return true;
      }
      current = current.parentElement;
    }

    return false;
  }

  private maybeFindGroup(start: Element): Element {
    // Walk up the DOM tree manually to respect edit boundaries
    let current: Element | null = start;

    while (current) {
      // If we found a group, return it
      if (current.hasAttribute(GROUP_ATTRIBUTE)) {
        return current;
      }

      // If we hit an edit boundary, stop and return current element
      if (current !== start && current.hasAttribute(GROUP_BOUNDARY_ATTRIBUTE)) {
        return start;
      }

      // Move up to parent element
      current = current.parentElement;
    }

    // No group found, return the starting element
    return start;
  }
}
