import * as stega from '@vercel/stega';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUTOMATIC_TARGET_STAMP_ATTRIBUTE,
  OVERLAY_ATTRIBUTE
} from '../src/createController/domStamping/constants.js';
import { createController } from '../src/index.js';

const { vercelStegaCombine } = stega;

function encoded(text: string, href: string) {
  return vercelStegaCombine(text, { origin: 'datocms.com', href });
}

// Lets the MutationObserver and the stamping microtask run.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
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
});
