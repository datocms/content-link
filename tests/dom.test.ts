import * as stega from '@vercel/stega';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ATTR_MANUAL_EDIT_URL,
  ATTR_STAMP_EDIT_URL
} from '../src/enableDatoVisualEditing/stamp/constants.js';
import { enableDatoVisualEditing } from '../src/index.js';
import * as decodeModule from '../src/stega/decode.js';

const { vercelStegaCombine } = stega;

const createRect = (x: number, y: number, width: number, height: number): DOMRect =>
  ({
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
    toJSON() {
      return { x, y, width, height };
    }
  }) as DOMRect;

beforeAll(() => {
  if (!('PointerEvent' in window)) {
    class PointerEventPolyfill extends MouseEvent {
      constructor(type: string, props?: MouseEventInit) {
        super(type, props);
      }
    }
    // @ts-expect-error polyfill assignment for tests
    window.PointerEvent = PointerEventPolyfill;
  }
});

beforeEach(() => {
  vi.spyOn(window, 'open').mockImplementation(() => null);
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('enableDatoVisualEditing', () => {
  it('stamps attributes from stega content', () => {
    const encodedText = vercelStegaCombine('Hero headline', {
      origin: 'datocms.com',
      href: 'hero123#fieldPath=hero.title.en'
    });

    const encodedAlt = vercelStegaCombine('Hero image alt', {
      origin: 'datocms.com',
      href: 'hero123#fieldPath=hero.image'
    });

    document.body.innerHTML = `
      <main>
        <p id="hero-text">${encodedText}</p>
        <img id="hero-image" alt="${encodedAlt}" src="hero.jpg">
      </main>
    `;

    const controller = enableDatoVisualEditing();

    const heroText = document.getElementById('hero-text') as HTMLElement;
    const heroImage = document.getElementById('hero-image') as HTMLImageElement;

    expect(heroText.getAttribute(ATTR_STAMP_EDIT_URL)).toBe('hero123#fieldPath=hero.title.en');
    expect(heroText.textContent).toBe('Hero headline');

    const imageWrapper = heroImage.closest(`[${ATTR_STAMP_EDIT_URL}]`) as HTMLElement;
    expect(imageWrapper).not.toBeNull();
    expect(imageWrapper.getAttribute(ATTR_STAMP_EDIT_URL)).toBe('hero123#fieldPath=hero.image');
    expect(heroImage.getAttribute('alt')).toBe('Hero image alt');

    controller.dispose();

    expect(heroText.hasAttribute(ATTR_STAMP_EDIT_URL)).toBe(false);
    expect(imageWrapper.hasAttribute(ATTR_STAMP_EDIT_URL)).toBe(false);
  });

  it('keeps overlay strictly attribute-based', () => {
    const payload = {
      origin: 'datocms.com',
      href: 'hero123#fieldPath=headline'
    };
    const encoded = vercelStegaCombine('Story headline', payload);

    document.body.innerHTML = `<h2 id="headline">${encoded}</h2>`;

    const element = document.getElementById('headline') as HTMLElement;
    element.getBoundingClientRect = () => createRect(20, 30, 160, 32);

    const decodeSpy = vi.spyOn(decodeModule, 'decodeStega');

    const controller = enableDatoVisualEditing();

    decodeSpy.mockClear();

    element.dispatchEvent(
      new PointerEvent('pointerover', {
        bubbles: true,
        pointerType: 'mouse',
        clientX: 24,
        clientY: 36
      })
    );
    element.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 24,
        clientY: 36
      })
    );

    expect(window.open).toHaveBeenCalledWith(
      'hero123#fieldPath=headline',
      '_blank',
      'noopener,noreferrer'
    );
    expect(decodeSpy).not.toHaveBeenCalled();

    controller.dispose();
  });

  it.only('re-marks new stega content via MutationObserver', async () => {
    document.body.innerHTML = `<section id="container"></section>`;
    const container = document.getElementById('container') as HTMLElement;

    const controller = enableDatoVisualEditing();

    const encoded = vercelStegaCombine('Fresh content', {
      origin: 'datocms.com',
      href: 'item-123#fieldPath=excerpt'
    });

    const paragraph = document.createElement('p');
    paragraph.id = 'dynamic';
    paragraph.textContent = encoded;
    container.appendChild(paragraph);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(paragraph.getAttribute(ATTR_STAMP_EDIT_URL)).toBe('item-123#fieldPath=excerpt');
    expect(paragraph.textContent).toBe('Fresh content');

    controller.dispose();
  });

  it('warns when multiple stega payloads stamp the same element', () => {
    const firstEncoded = vercelStegaCombine('Primary title', {
      origin: 'datocms.com',
      href: 'node-1#fieldPath=title'
    });

    const secondEncoded = vercelStegaCombine('Secondary title', {
      origin: 'datocms.com',
      href: 'node-2#fieldPath=subtitle'
    });

    const collide = document.createElement('p');
    collide.id = 'collide';
    collide.append(document.createTextNode(firstEncoded));
    collide.append(document.createTextNode(secondEncoded));
    document.body.appendChild(collide);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const controller = enableDatoVisualEditing();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message, elementArg] = warnSpy.mock.calls[0];
    expect(message).toContain('Multiple stega-encoded payloads resolved to the same DOM element');
    expect(elementArg).toBe(collide);

    expect(collide.getAttribute(ATTR_STAMP_EDIT_URL)).toBe('node-2#fieldPath=subtitle');

    controller.dispose();
  });

  it('only removes stega attributes on dispose', () => {
    document.body.innerHTML = `
      <div
        id="manual"
        ${ATTR_MANUAL_EDIT_URL}="manual-1"
      ></div>
      <p id="encoded"></p>
    `;

    const encodedPayload = {
      origin: 'datocms.com',
      href: 'node-2#fieldPath=subheading'
    };

    const encoded = vercelStegaCombine('Subheading', encodedPayload);
    const encodedParagraph = document.getElementById('encoded') as HTMLElement;
    encodedParagraph.textContent = encoded;

    const controller = enableDatoVisualEditing();

    const manual = document.getElementById('manual') as HTMLElement;
    expect(encodedParagraph.getAttribute(ATTR_STAMP_EDIT_URL)).toBe('node-2#fieldPath=subheading');

    controller.dispose();

    expect(manual.getAttribute(ATTR_MANUAL_EDIT_URL)).toBe('manual-1');
    expect(encodedParagraph.hasAttribute(ATTR_STAMP_EDIT_URL)).toBe(false);
  });

  it('honors wrapper targeting for text and zero-size images', () => {
    const encodedText = vercelStegaCombine('Wrapped text', {
      origin: 'datocms.com',
      href: 'item-1#fieldPath=wrapper.text'
    });

    const encodedAlt = vercelStegaCombine('Wrapped image', {
      origin: 'datocms.com',
      href: 'item-1#fieldPath=wrapper.image'
    });

    document.body.innerHTML = `
      <div id="text-wrapper" data-datocms-edit-target>
        <span id="wrapped">${encodedText}</span>
      </div>
      <div id="image-wrapper" data-datocms-edit-target>
        <img id="wrapped-image" alt="${encodedAlt}" src="#">
      </div>
    `;

    const wrappedImage = document.getElementById('wrapped-image') as HTMLImageElement;
    wrappedImage.getBoundingClientRect = () => createRect(0, 0, 0, 0);

    const controller = enableDatoVisualEditing();

    const textWrapper = document.getElementById('text-wrapper') as HTMLElement;
    const innerSpan = document.getElementById('wrapped') as HTMLElement;

    expect(textWrapper.getAttribute(ATTR_STAMP_EDIT_URL)).toBe('item-1#fieldPath=wrapper.text');
    expect(innerSpan.hasAttribute(ATTR_STAMP_EDIT_URL)).toBe(false);

    const imageWrapper = document.getElementById('image-wrapper') as HTMLElement;
    expect(imageWrapper.getAttribute(ATTR_STAMP_EDIT_URL)).toBe('item-1#fieldPath=wrapper.image');
    expect(wrappedImage.getAttribute('alt')).toBe('Wrapped image');

    controller.dispose();
  });

  it('can disable and re-enable visual editing without losing context', () => {
    const firstEncoded = vercelStegaCombine('Primary title', {
      origin: 'datocms.com',
      href: 'item-1#fieldPath=content.title'
    });

    document.body.innerHTML = `<h1 id="headline">${firstEncoded}</h1>`;

    const controller = enableDatoVisualEditing();

    const heading = document.getElementById('headline') as HTMLElement;
    expect(heading.getAttribute(ATTR_STAMP_EDIT_URL)).toBe('item-1#fieldPath=content.title');
    expect(heading.textContent).toBe('Primary title');

    controller.disable();

    const secondEncoded = vercelStegaCombine('Updated title', {
      origin: 'datocms.com',
      href: 'item-2#fieldPath=content.title'
    });

    heading.textContent = secondEncoded;

    expect(heading.getAttribute(ATTR_STAMP_EDIT_URL)).toBe('item-1#fieldPath=content.title');
    expect(heading.textContent).toBe(secondEncoded);

    controller.enable();

    expect(heading.getAttribute(ATTR_STAMP_EDIT_URL)).toBe('item-2#fieldPath=content.title');
    expect(heading.textContent).toBe('Updated title');

    controller.dispose();
  });

  it('exposes state helpers for manual toggle flows', () => {
    document.body.innerHTML = `<p id="content"></p>`;

    const controller = enableDatoVisualEditing({
      autoEnable: false
    });

    expect(controller.isEnabled()).toBe(false);
    expect(controller.isDisposed()).toBe(false);

    controller.enable();
    expect(controller.isEnabled()).toBe(true);

    controller.toggle();
    expect(controller.isEnabled()).toBe(false);

    controller.toggle();
    expect(controller.isEnabled()).toBe(true);

    controller.dispose();
    expect(controller.isDisposed()).toBe(true);
    expect(controller.isEnabled()).toBe(false);

    controller.enable();
    expect(controller.isEnabled()).toBe(false);
  });
});
