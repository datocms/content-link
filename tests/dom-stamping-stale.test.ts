import * as stega from '@vercel/stega';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUTOMATIC_STEGA_STAMP_ATTRIBUTE,
  AUTOMATIC_TARGET_STAMP_ATTRIBUTE,
  GROUP_ATTRIBUTE
} from '../src/createController/domStamping/constants.js';
import { createController } from '../src/index.js';

const { vercelStegaCombine } = stega;

function encoded(text: string, href: string) {
  return vercelStegaCombine(text, { origin: 'datocms.com', href });
}

// Lets the MutationObserver and the stamping microtask run.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const byId = (id: string) => document.getElementById(id) as HTMLElement;
const editUrl = (el: Element) => el.getAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE);

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('Stale stamps', () => {
  it('removes the stamp when the text has no stega data after a change', async () => {
    document.body.innerHTML = `<p id="title">${encoded('Title', 'item1#fieldPath=title')}</p>`;
    const controller = createController();
    const title = byId('title');
    expect(editUrl(title)).toBe('item1#fieldPath=title');

    (title.firstChild as Text).data = 'Plain text';
    await flush();

    expect(editUrl(title)).toBeNull();
    expect(title.hasAttribute(AUTOMATIC_STEGA_STAMP_ATTRIBUTE)).toBe(false);
    controller.dispose();
  });

  it('removes the stamp when the text node is removed', async () => {
    document.body.innerHTML = `<p id="title">${encoded('Title', 'item1#fieldPath=title')}</p>`;
    const controller = createController();
    const title = byId('title');

    title.firstChild?.remove();
    await flush();

    expect(editUrl(title)).toBeNull();
    controller.dispose();
  });

  it('changes the stamp when the text gets the stega data of a different record', async () => {
    document.body.innerHTML = `<p id="title">${encoded('Title', 'item1#fieldPath=title')}</p>`;
    const controller = createController();
    const title = byId('title');

    title.textContent = encoded('Other', 'item2#fieldPath=title');
    await flush();

    expect(editUrl(title)).toBe('item2#fieldPath=title');
    controller.dispose();
  });

  it('removes the stamp of a group when its only stega element is removed', async () => {
    document.body.innerHTML = `
      <div id="group" ${GROUP_ATTRIBUTE}>
        <div><p id="title">${encoded('Title', 'item1#fieldPath=title')}</p></div>
        <p>Plain text</p>
      </div>
    `;
    const controller = createController();
    const group = byId('group');
    expect(editUrl(group)).toBe('item1#fieldPath=title');

    byId('title').parentElement?.remove();
    await flush();

    expect(editUrl(group)).toBeNull();
    controller.dispose();
  });

  it('removes the stamp of a group when the text in it has no stega data after a change', async () => {
    document.body.innerHTML = `
      <div id="group" ${GROUP_ATTRIBUTE}>
        <p id="title">${encoded('Title', 'item1#fieldPath=title')}</p>
      </div>
    `;
    const controller = createController();
    const group = byId('group');
    expect(editUrl(group)).toBe('item1#fieldPath=title');

    (byId('title').firstChild as Text).data = 'Plain text';
    await flush();

    expect(editUrl(group)).toBeNull();
    controller.dispose();
  });

  it('keeps the stamp of a group when other stega data stays in it', async () => {
    document.body.innerHTML = `
      <div id="group" ${GROUP_ATTRIBUTE}>
        <p id="title">${encoded('Title', 'item1#fieldPath=title')}</p>
        <p id="body">${encoded('Body', 'item1#fieldPath=title')}</p>
      </div>
    `;
    const controller = createController();
    const group = byId('group');

    byId('title').remove();
    await flush();

    expect(editUrl(group)).toBe('item1#fieldPath=title');
    controller.dispose();
  });

  it('keeps the stamps of the elements that did not change', async () => {
    document.body.innerHTML = `
      <main id="main">
        <p id="title">${encoded('Title', 'item1#fieldPath=title')}</p>
        <p id="body">${encoded('Body', 'item1#fieldPath=body')}</p>
      </main>
    `;
    const controller = createController();

    byId('title').remove();
    byId('main').appendChild(document.createElement('div'));
    await flush();

    expect(editUrl(byId('body'))).toBe('item1#fieldPath=body');
    controller.dispose();
  });

  it('does not remove stamps when stripStega is on', async () => {
    document.body.innerHTML = `<p id="title">${encoded('Title', 'item1#fieldPath=title')}</p>`;
    const controller = createController({ stripStega: true });
    const title = byId('title');
    await flush();
    expect(title.textContent).toBe('Title');

    // The stega data is not in the DOM now, thus a new pass finds nothing.
    title.appendChild(document.createElement('span'));
    (title.firstChild as Text).data = 'Title!';
    await flush();

    expect(editUrl(title)).toBe('item1#fieldPath=title');
    controller.dispose();
  });
});

describe('Stamping pass', () => {
  it('stamps each element that has the same stega data', async () => {
    const text = encoded('Owner', 'item1#fieldPath=role');
    document.body.innerHTML = `<p id="a">${text}</p><p id="b">${text}</p>`;
    const controller = createController();

    const added = document.createElement('p');
    added.textContent = text;
    document.body.appendChild(added);
    await flush();

    for (const el of [byId('a'), byId('b'), added]) {
      expect(editUrl(el)).toBe('item1#fieldPath=role');
    }
    controller.dispose();
  });

  it('examines an added element one time when its content is added after it', async () => {
    const controller = createController({ silenceWarnings: true });
    const createTreeWalker = vi.spyOn(document, 'createTreeWalker');

    const outer = document.createElement('div');
    document.body.appendChild(outer);
    const inner = document.createElement('p');
    outer.appendChild(inner);
    inner.textContent = encoded('Title', 'item1#fieldPath=title');
    await flush();

    expect(editUrl(inner)).toBe('item1#fieldPath=title');
    expect(createTreeWalker.mock.calls.map(([root]) => root)).toEqual([outer]);
    controller.dispose();
  });
});
