/**
 * Manages DOM stamping: observation, mutation batching, stega decoding, and attribute application.
 * Absorbs logic from stamp/index.ts and BrowserController's stamping functionality.
 */
import { vercelStegaDecode } from '@vercel/stega';
import { STEGA_REGEXP } from '../../stega/decode.js';
import { DecodedInfo, isDecodedInfo } from '../../stega/types.js';
import { createScheduler } from '../../utils/createScheduler.js';
import { resolveDocument } from '../../utils/dom.js';
import type { StampSummary } from '../types.js';
import {
  AUTOMATIC_STEGA_STAMP_ATTRIBUTE,
  AUTOMATIC_TARGET_STAMP_ATTRIBUTE,
  GROUP_ATTRIBUTE,
  GROUP_BOUNDARY_ATTRIBUTE,
  OVERLAY_ATTRIBUTE,
  SOURCE_STAMP_ATTRIBUTE
} from './constants.js';

/** The elements that one stamping pass found. */
type FoundInPass = {
  /** The elements that contain stega data directly. */
  sources: Set<Element>;
  /** The elements that got the edit URL. */
  targets: Set<Element>;
};

/** The maximum number of decoded segments to keep. */
const MAX_DECODE_CACHE_SIZE = 5000;

export class DomStampingManager {
  private observer: MutationObserver;
  private readonly pendingElementsToStamp = new Set<ParentNode>();
  private readonly decodeCache = new Map<string, DecodedInfo | null>();
  /** Tells if the page removed content after the last stamping pass. */
  private pendingRemoval = false;
  private readonly scheduleStamping = createScheduler(() => this.instantStampPendingElements());

  constructor(
    private readonly root: ParentNode,
    private readonly onStamp: (summary: StampSummary) => void,
    private readonly stripStega: boolean = false,
    private readonly silenceWarnings: boolean = false
  ) {
    this.observer = new MutationObserver((mutations) => this.handleMutations(mutations));

    this.observer.observe(this.root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['alt', SOURCE_STAMP_ATTRIBUTE]
    });

    this.instantStampPendingElements(true);
  }

  dispose() {
    this.observer.disconnect();
    this.pendingElementsToStamp.clear();
    this.decodeCache.clear();

    const nodes = this.root.querySelectorAll<HTMLElement>(`[${AUTOMATIC_TARGET_STAMP_ATTRIBUTE}]`);

    for (const el of nodes) {
      el.removeAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE);
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
      } else if (
        mutation.type === 'attributes' &&
        mutation.attributeName === SOURCE_STAMP_ATTRIBUTE
      ) {
        const element = mutation.target as Element;
        this.pendingElementsToStamp.add((element.parentElement ?? this.root) as ParentNode);
        hasChanges = true;
      } else if (mutation.type === 'childList') {
        // Only the added nodes can contain new stega data. A removal does not
        // need a new stamping pass. Do not add `mutation.target` here: when the
        // target is `<body>`, the pass examines the full document.
        for (const node of mutation.addedNodes) {
          if (
            node.nodeType === Node.ELEMENT_NODE ||
            node.nodeType === Node.DOCUMENT_FRAGMENT_NODE
          ) {
            // Ignore the overlays that this library adds to the page.
            if (
              node.nodeType === Node.ELEMENT_NODE &&
              (node as Element).hasAttribute(OVERLAY_ATTRIBUTE)
            ) {
              continue;
            }
            this.pendingElementsToStamp.add(node as ParentNode);
            hasChanges = true;
          } else if (node.nodeType === Node.TEXT_NODE) {
            this.pendingElementsToStamp.add(
              (node.parentElement ?? node.parentNode ?? this.root) as ParentNode
            );
            hasChanges = true;
          }
        }

        for (const node of mutation.removedNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            // The parent was possibly stamped because of this text.
            const parent = mutation.target;
            if (parent instanceof Element && parent.hasAttribute(AUTOMATIC_STEGA_STAMP_ATTRIBUTE)) {
              this.pendingElementsToStamp.add(parent);
              hasChanges = true;
            }
            continue;
          }

          if (
            node.nodeType !== Node.ELEMENT_NODE ||
            (node as Element).hasAttribute(OVERLAY_ATTRIBUTE)
          ) {
            continue;
          }

          // The listeners must know that the set of stamped elements changed.
          this.pendingRemoval = true;
          hasChanges = true;

          // A group that is around the removed element was possibly stamped
          // because of stega data in the removed element.
          const group = this.findStampedGroup(mutation.target);
          if (group && this.containsStegaMark(node as Element)) {
            this.pendingElementsToStamp.add(group);
          }
        }
      }
    }

    if (hasChanges) {
      this.scheduleStamping();
    }
  }

  private instantStampPendingElements(firstStamping = false) {
    // Only the first pass examines the full root.
    const elementsToStamp = firstStamping
      ? [this.root]
      : this.withoutNestedElements(this.pendingElementsToStamp);

    this.pendingElementsToStamp.clear();

    const summaries: StampSummary[] = [];
    const examined = new Set<ParentNode>();

    // A pass can find that a group out of its scope is possibly stale. Then
    // the group is added to this list.
    for (let index = 0; index < elementsToStamp.length; index++) {
      const elementToStamp = elementsToStamp[index];

      if (examined.has(elementToStamp)) {
        continue;
      }
      examined.add(elementToStamp);

      const { staleGroups, ...summary } = this.stampElement(elementToStamp);
      summaries.push(summary);
      elementsToStamp.push(...staleGroups);
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

    if (!this.silenceWarnings && firstStamping && combinedSummary.appliedStamps.size === 0) {
      const message =
        '[@datocms/content-link] No editable elements were detected after initialization. ' +
        'Make sure that Content Link headers are enabled in your GraphQL requests! ' +
        "If you're hydrating/streaming, do not replace the server-rendered nodes that carry stega-encoded data: reuse the same DOM element!";

      console.warn(message);
    }

    const hadRemoval = this.pendingRemoval;
    this.pendingRemoval = false;

    if (summaries.length === 0 && !hadRemoval) {
      return;
    }

    this.onStamp(combinedSummary);
  }

  private stampElement(element: ParentNode): StampSummary & { staleGroups: Element[] } {
    const doc = resolveDocument(element);

    if (!doc) {
      return {
        appliedStamps: new Map(),
        scope: element,
        staleGroups: []
      };
    }

    // Track elements stamped in this pass to detect collisions within the same pass
    const appliedStamps = new Map<Element, string>();
    const found: FoundInPass = { sources: new Set(), targets: new Set() };

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
        found
      );

      if (this.stripStega && cleanValue !== undefined) {
        node.nodeValue = cleanValue;
      }

      node = walker.nextNode();
    }

    // Second pass: inspect image alts, since they are not part of the text walker.
    for (const img of this.selfAndDescendants<HTMLImageElement>(element, 'img[alt]')) {
      const alt = img.getAttribute('alt');

      const cleanAlt = this.addStampingAttributesTargetAndReturnStrippedValue(
        alt,
        img,
        appliedStamps,
        found
      );

      if (this.stripStega && cleanAlt !== undefined) {
        img.setAttribute('alt', cleanAlt);
      }
    }

    // Third pass: inspect elements with data-datocms-content-link-source attribute
    for (const el of this.selfAndDescendants<HTMLElement>(element, `[${SOURCE_STAMP_ATTRIBUTE}]`)) {
      const sourceValue = el.getAttribute(SOURCE_STAMP_ATTRIBUTE);

      this.addStampingAttributesTargetAndReturnStrippedValue(sourceValue, el, appliedStamps, found);

      // If stripStega is enabled, clear the source attribute after stamping
      if (this.stripStega) {
        el.removeAttribute(SOURCE_STAMP_ATTRIBUTE);
      }
    }

    const staleGroups = this.clearStaleStamps(element, found);

    return {
      appliedStamps: appliedStamps,
      scope: element,
      staleGroups
    };
  }

  /**
   * Removes the stamps of the elements in the scope that have no stega data
   * now. Returns the groups out of the scope that are possibly stale.
   */
  private clearStaleStamps(scope: ParentNode, found: FoundInPass): Element[] {
    // When `stripStega` is on, the stega data is not in the DOM after the
    // first pass. Thus it is not possible to know if a stamp is stale.
    if (this.stripStega) {
      return [];
    }

    const staleGroups: Element[] = [];

    for (const el of this.selfAndDescendants(scope, `[${AUTOMATIC_STEGA_STAMP_ATTRIBUTE}]`)) {
      if (found.sources.has(el)) {
        continue;
      }

      el.removeAttribute(AUTOMATIC_STEGA_STAMP_ATTRIBUTE);

      // The stega data of this element was possibly the cause of the stamp
      // of a group that is out of the scope.
      const group = this.maybeFindGroup(el);
      if (group !== el && !scope.contains(group)) {
        staleGroups.push(group);
      }
    }

    for (const el of this.selfAndDescendants(scope, `[${AUTOMATIC_TARGET_STAMP_ATTRIBUTE}]`)) {
      if (!found.targets.has(el)) {
        el.removeAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE);
      }
    }

    return staleGroups;
  }

  /** Finds the stamped group that is around the node, if there is one. */
  private findStampedGroup(node: Node): Element | null {
    if (!(node instanceof Element)) {
      return null;
    }

    const group = this.maybeFindGroup(node);

    return group.hasAttribute(GROUP_ATTRIBUTE) &&
      group.hasAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE)
      ? group
      : null;
  }

  /** Tells if the element, or an element in it, was a source of stega data. */
  private containsStegaMark(element: Element): boolean {
    return (
      element.hasAttribute(AUTOMATIC_STEGA_STAMP_ATTRIBUTE) ||
      element.querySelector(`[${AUTOMATIC_STEGA_STAMP_ATTRIBUTE}]`) !== null
    );
  }

  private addStampingAttributesTargetAndReturnStrippedValue(
    value: string | null,
    elementWithStega: Element | null,
    appliedStamps: Map<Element, string>,
    found: FoundInPass
  ): string | undefined {
    if (!value || !elementWithStega) {
      return;
    }

    // Find the first stega segment. One search is sufficient here: the
    // cleaned text is only necessary when `stripStega` is on.
    let decoded;

    try {
      STEGA_REGEXP.lastIndex = 0;
      const match = STEGA_REGEXP.exec(value);
      STEGA_REGEXP.lastIndex = 0;

      if (!match) {
        return undefined;
      }

      decoded = this.decode(match[0]);

      if (!decoded) {
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

    if (!this.silenceWarnings && existingStamp && existingStamp !== decoded.href) {
      this.warnCollision(target, existingStamp, elementWithStega, decoded.href);
    }

    found.sources.add(elementWithStega);
    found.targets.add(target);

    // Stamp the attribute if it changed
    const existingEditUrl = target.getAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE);

    if (existingEditUrl !== decoded.href) {
      target.setAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE, decoded.href);
      appliedStamps.set(target, decoded.href);
    }

    // When not stripping stega, mark the element that directly contains the stega data
    if (!this.stripStega) {
      elementWithStega.setAttribute(AUTOMATIC_STEGA_STAMP_ATTRIBUTE, '');
    }

    return this.stripStega ? value.replace(STEGA_REGEXP, '') : value;
  }

  /**
   * Removes the elements that are in one of the other elements. The pass on
   * the ancestor examines them, thus a second pass is not necessary.
   */
  private withoutNestedElements(elements: Set<ParentNode>): ParentNode[] {
    const result: ParentNode[] = [];

    for (const element of elements) {
      let ancestor = element.parentNode;
      while (ancestor && !elements.has(ancestor)) {
        ancestor = ancestor.parentNode;
      }
      if (!ancestor) {
        result.push(element);
      }
    }

    return result;
  }

  /**
   * Decodes a stega segment. The decode operation is slow, and a page examines
   * the same segments again after each change of the DOM, thus keep the results.
   */
  private decode(encoded: string): DecodedInfo | null {
    const cached = this.decodeCache.get(encoded);
    if (cached !== undefined) {
      return cached;
    }

    const decoded = vercelStegaDecode(encoded);
    const result = isDecodedInfo(decoded) ? decoded : null;

    if (this.decodeCache.size >= MAX_DECODE_CACHE_SIZE) {
      this.decodeCache.clear();
    }
    this.decodeCache.set(encoded, result);

    return result;
  }

  /**
   * Finds the elements that agree with the selector. The result includes the
   * scope element itself, because `querySelectorAll` only finds descendants.
   */
  private selfAndDescendants<T extends Element>(scope: ParentNode, selector: string): T[] {
    const result = Array.from(scope.querySelectorAll<T>(selector));

    if (scope instanceof Element && scope.matches(selector)) {
      result.unshift(scope as unknown as T);
    }

    return result;
  }

  /** Log when two stega-encoded payloads map to the same element in a single pass */
  private warnCollision(
    target: Element,
    originalUrl: string,
    incomingEl: Element,
    incomingUrl: string
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

      // If we hit an edit boundary, stop and return the starting element
      if (current.hasAttribute(GROUP_BOUNDARY_ATTRIBUTE)) {
        return start;
      }

      // Move up to parent element
      current = current.parentElement;
    }

    // No group found, return the starting element
    return start;
  }
}
