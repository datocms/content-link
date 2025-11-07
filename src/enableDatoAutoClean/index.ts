import { splitStega } from '../stega/decode.js';
import { inBrowser } from '../utils/dom.js';
import { AUTO_CLEAN_ATTRIBUTE } from './constants.js';

export type AutoCleanOptions = {
  delayMs?: number;
  observe?: boolean;
  cleanImageAlts?: boolean;
  observeImageAlts?: boolean;
  skipSelectors?: string[];
};

const DEFAULT_DELAY_MS = 32;
const DEFAULT_OBSERVE = false;
const DEFAULT_CLEAN_IMAGE_ALTS = true;
const DEFAULT_OBSERVE_IMAGE_ALTS = true;
const DEFAULT_SKIP_SELECTORS = ['[contenteditable="true"]'] as const;

const NOOP = () => {
  /* noop */
};

/**
 * Convenience helper that wires auto clean-up for every element that declares
 * `data-datocms-auto-clean`. Mirrors the main enable API but purely removes
 * stega-encoded data without stamping overlays.
 */
export function enableDatoAutoClean(
  selector = `[${AUTO_CLEAN_ATTRIBUTE}]`,
  rawOpts?: Omit<AutoCleanOptions, 'observe'>
): () => void {
  if (!inBrowser()) {
    return NOOP;
  }

  const options = resolveOptions(rawOpts);
  const elements = Array.from(document.querySelectorAll(selector));
  if (elements.length === 0) {
    return NOOP;
  }

  const disposers = elements.map((element) => autoCleanStegaWithin(element, options));

  return () => {
    disposers.forEach((dispose) => dispose());
  };
}

/**
 * Clean stega metadata inside `root` and (optionally) keep watching for changes.
 * Returns a disposer so callers can stop the observer/timers when done.
 */
function autoCleanStegaWithin(root: Element, raw?: AutoCleanOptions): () => void {
  if (!inBrowser() || !root) {
    return NOOP;
  }

  const opts = resolveOptions(raw);

  let disposed = false;
  let timer: number | null = null;
  let observer: MutationObserver | null = null;

  const schedule = () => {
    if (disposed || timer != null) {
      return;
    }
    timer = window.setTimeout(() => {
      timer = null;
      if (disposed) {
        return;
      }
      cleanPass(root, opts);
    }, opts.delayMs);
  };

  schedule();

  if (opts.observe) {
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' || mutation.type === 'childList') {
          schedule();
          break;
        }
        if (
          opts.observeImageAlts &&
          mutation.type === 'attributes' &&
          mutation.attributeName === 'alt'
        ) {
          schedule();
          break;
        }
      }
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: opts.observeImageAlts,
      attributeFilter: opts.observeImageAlts ? ['alt'] : undefined
    });
  }

  return () => {
    disposed = true;
    if (timer != null) {
      window.clearTimeout(timer);
      timer = null;
    }
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  };
}

// Skip cleaning for elements that match a caller-provided allowlist (e.g. editors).
function isSkipped(element: Element | null, selectors: readonly string[]): boolean {
  if (!element || selectors.length === 0) {
    return false;
  }
  return selectors.some((selector) => element.closest(selector));
}

// Single sweep that strips stega-encoded data from text nodes and optionally image alts.
function cleanPass(root: Element, opts: Required<AutoCleanOptions>): void {
  if (!root.isConnected) {
    return;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    const node = current as Text;
    const parent = node.parentElement;
    const value = node.nodeValue ?? '';
    if (value && !isSkipped(parent, opts.skipSelectors)) {
      const split = splitStega(value);
      if (split.encoded && split.cleaned !== value) {
        node.nodeValue = split.cleaned;
      }
    }
    current = walker.nextNode();
  }

  if (!opts.cleanImageAlts) {
    return;
  }

  const images = root.querySelectorAll('img[alt]');
  images.forEach((img) => {
    if (isSkipped(img, opts.skipSelectors)) {
      return;
    }
    const alt = img.getAttribute('alt');
    if (!alt) {
      return;
    }
    const split = splitStega(alt);
    if (split.encoded && split.cleaned !== alt) {
      img.setAttribute('alt', split.cleaned);
    }
  });
}

// Merge provided options with defaults while cloning arrays to avoid mutation leaks.
function resolveOptions(raw?: AutoCleanOptions): Required<AutoCleanOptions> {
  return {
    delayMs: raw?.delayMs ?? DEFAULT_DELAY_MS,
    observe: raw?.observe ?? DEFAULT_OBSERVE,
    cleanImageAlts: raw?.cleanImageAlts ?? DEFAULT_CLEAN_IMAGE_ALTS,
    observeImageAlts: raw?.observeImageAlts ?? DEFAULT_OBSERVE_IMAGE_ALTS,
    skipSelectors: raw?.skipSelectors ? [...raw.skipSelectors] : [...DEFAULT_SKIP_SELECTORS]
  };
}
