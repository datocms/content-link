import * as stega from '@vercel/stega';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUTOMATIC_TARGET_STAMP_ATTRIBUTE,
  OVERLAY_ATTRIBUTE
} from '../src/createController/domStamping/constants.js';
import { EVENT_STAMPED } from '../src/createController/events/constants.js';
import { createController } from '../src/index.js';

const { vercelStegaCombine } = stega;

function encoded(text: string, href: string) {
  return vercelStegaCombine(text, { origin: 'datocms.com', href });
}

// Lets the MutationObserver and the stamping microtask run.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('DOM stamping on mutations', () => {
  it('does not examine the document again when an overlay is added or removed', async () => {
    document.body.innerHTML = `<main><p>${encoded('Title', 'item1#fieldPath=title')}</p></main>`;

    const controller = createController();
    const createTreeWalker = vi.spyOn(document, 'createTreeWalker');

    const overlay = document.createElement('div');
    overlay.setAttribute(OVERLAY_ATTRIBUTE, '');
    document.body.appendChild(overlay);
    await flush();

    overlay.remove();
    await flush();

    expect(createTreeWalker).not.toHaveBeenCalled();

    controller.dispose();
  });

  it('only examines the added nodes, not their parent', async () => {
    document.body.innerHTML = `<main><p>${encoded('Title', 'item1#fieldPath=title')}</p></main>`;

    const controller = createController();
    const createTreeWalker = vi.spyOn(document, 'createTreeWalker');

    const added = document.createElement('p');
    added.textContent = encoded('Body', 'item2#fieldPath=body');
    document.body.appendChild(added);
    await flush();

    expect(added.getAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE)).toBe('item2#fieldPath=body');
    expect(createTreeWalker.mock.calls.map(([root]) => root)).toEqual([added]);

    controller.dispose();
  });

  it('stamps an added image that has stega data in its alt attribute', async () => {
    const controller = createController({ silenceWarnings: true });

    const img = document.createElement('img');
    img.setAttribute('alt', encoded('Alt text', 'item3#fieldPath=image'));
    document.body.appendChild(img);
    await flush();

    expect(img.getAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE)).toBe('item3#fieldPath=image');

    controller.dispose();
  });

  it('does not examine the document again when a hover overlay comes and goes', async () => {
    document.body.innerHTML = `<main><p id="title" tabindex="0">${encoded('Title', 'item1#fieldPath=title')}</p></main>`;

    const controller = createController();
    const createTreeWalker = vi.spyOn(document, 'createTreeWalker');
    const title = document.getElementById('title') as HTMLElement;

    controller.enableClickToEdit();

    title.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(document.querySelectorAll(`[${OVERLAY_ATTRIBUTE}]`)).toHaveLength(1);
    await flush();

    title.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(document.querySelectorAll(`[${OVERLAY_ATTRIBUTE}]`)).toHaveLength(0);
    await flush();

    expect(createTreeWalker).not.toHaveBeenCalled();

    controller.dispose();
  });

  it('does not examine the document again during a flash of all the overlays', async () => {
    document.body.innerHTML = `
      <main>
        <p>${encoded('Title', 'item1#fieldPath=title')}</p>
        <p>${encoded('Body', 'item1#fieldPath=body')}</p>
        <p>${encoded('Footer', 'item2#fieldPath=footer')}</p>
      </main>
    `;

    const controller = createController();
    const createTreeWalker = vi.spyOn(document, 'createTreeWalker');

    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame']
    });

    controller.flashAll();

    // The overlays are on the page while the flash is in progress.
    await vi.advanceTimersByTimeAsync(500);
    expect(document.querySelectorAll(`[${OVERLAY_ATTRIBUTE}]`)).toHaveLength(3);

    // The overlays go away after the flash.
    await vi.advanceTimersByTimeAsync(3000);
    expect(document.querySelectorAll(`[${OVERLAY_ATTRIBUTE}]`)).toHaveLength(0);

    expect(createTreeWalker).not.toHaveBeenCalled();

    controller.dispose();
  });

  it('sends the stamped event when the page removes content', async () => {
    document.body.innerHTML = `<main><p id="title">${encoded('Title', 'item1#fieldPath=title')}</p></main>`;

    const controller = createController();
    const onStamped = vi.fn();
    document.addEventListener(EVENT_STAMPED, onStamped);
    const createTreeWalker = vi.spyOn(document, 'createTreeWalker');

    document.getElementById('title')?.remove();
    await flush();

    expect(onStamped).toHaveBeenCalledTimes(1);
    // A removal does not need a stamping pass.
    expect(createTreeWalker).not.toHaveBeenCalled();

    document.removeEventListener(EVENT_STAMPED, onStamped);
    controller.dispose();
  });

  it('does not send the stamped event when an overlay is removed', async () => {
    const controller = createController({ silenceWarnings: true });

    const overlay = document.createElement('div');
    overlay.setAttribute(OVERLAY_ATTRIBUTE, '');
    document.body.appendChild(overlay);
    await flush();

    const onStamped = vi.fn();
    document.addEventListener(EVENT_STAMPED, onStamped);

    overlay.remove();
    await flush();

    expect(onStamped).not.toHaveBeenCalled();

    document.removeEventListener(EVENT_STAMPED, onStamped);
    controller.dispose();
  });
});

describe('Flash of all the overlays, with an IntersectionObserver', () => {
  // jsdom has no IntersectionObserver. This one lets the test say which
  // elements are in the viewport.
  class FakeIntersectionObserver {
    static instances: FakeIntersectionObserver[] = [];
    observed: Element[] = [];
    disconnected = false;

    constructor(private readonly callback: IntersectionObserverCallback) {
      FakeIntersectionObserver.instances.push(this);
    }

    observe(el: Element) {
      this.observed.push(el);
    }

    disconnect() {
      this.disconnected = true;
    }

    report(el: Element, isIntersecting: boolean) {
      this.callback(
        [{ target: el, isIntersecting } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      );
    }
  }

  const overlayCount = () => document.querySelectorAll(`[${OVERLAY_ATTRIBUTE}]`).length;

  it('makes overlays only for the elements that are in the viewport', async () => {
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);

    document.body.innerHTML = `
      <p id="a">${encoded('A', 'item1#fieldPath=a')}</p>
      <p id="b">${encoded('B', 'item1#fieldPath=b')}</p>
      <p id="c">${encoded('C', 'item1#fieldPath=c')}</p>
    `;
    const a = document.getElementById('a') as HTMLElement;
    const b = document.getElementById('b') as HTMLElement;

    const controller = createController();

    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame']
    });

    controller.flashAll();
    await vi.advanceTimersByTimeAsync(200);

    const observer = FakeIntersectionObserver.instances[0];
    expect(observer.observed).toHaveLength(3);
    expect(overlayCount()).toBe(0);

    observer.report(a, true);
    expect(overlayCount()).toBe(1);

    // The user scrolls: `a` goes out of the viewport and `b` comes in.
    observer.report(a, false);
    observer.report(b, true);
    expect(overlayCount()).toBe(1);

    // The flash ends.
    await vi.advanceTimersByTimeAsync(3000);
    expect(overlayCount()).toBe(0);
    expect(observer.disconnected).toBe(true);

    controller.dispose();
    vi.unstubAllGlobals();
  });
});
