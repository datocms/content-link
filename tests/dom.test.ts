import * as stega from '@vercel/stega';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTOMATIC_TARGET_STAMP_ATTRIBUTE,
  GROUP_ATTRIBUTE,
  MANUAL_TARGET_STAMP_ATTRIBUTE,
  SOURCE_STAMP_ATTRIBUTE
} from '../src/createController/domStamping/constants.js';
import { createController } from '../src/index.js';
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
    class PointerEventPolyfill extends MouseEvent {}
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

describe('createController', () => {
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

    const controller = createController();

    const heroText = document.getElementById('hero-text') as HTMLElement;
    const heroImage = document.getElementById('hero-image') as HTMLImageElement;

    expect(heroText.getAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE)).toBe(
      'hero123#fieldPath=hero.title.en'
    );
    // Default behavior preserves stega encoding (invisible characters)
    expect(heroText.textContent).toContain('Hero headline');

    const imageWrapper = heroImage.closest(`[${AUTOMATIC_TARGET_STAMP_ATTRIBUTE}]`) as HTMLElement;
    expect(imageWrapper).not.toBeNull();
    expect(imageWrapper.getAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE)).toBe(
      'hero123#fieldPath=hero.image'
    );
    // Default behavior preserves stega encoding (invisible characters)
    expect(heroImage.getAttribute('alt')).toContain('Hero image alt');

    controller.dispose();

    expect(heroText.hasAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE)).toBe(false);
    expect(imageWrapper.hasAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE)).toBe(false);
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

    const controller = createController();
    controller.enableClickToEdit();

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

  it('re-marks new stega content via MutationObserver', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    document.body.innerHTML = `<section id="container"></section>`;
    const container = document.getElementById('container') as HTMLElement;

    const controller = createController();

    const encoded = vercelStegaCombine('Fresh content', {
      origin: 'datocms.com',
      href: 'item-123#fieldPath=excerpt'
    });

    const paragraph = document.createElement('p');
    paragraph.id = 'dynamic';
    paragraph.textContent = encoded;
    container.appendChild(paragraph);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(paragraph.getAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE)).toBe(
      'item-123#fieldPath=excerpt'
    );
    // Default behavior preserves stega encoding (invisible characters)
    expect(paragraph.textContent).toContain('Fresh content');

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

    const controller = createController();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message, elementArg] = warnSpy.mock.calls[0];
    expect(message).toContain('Multiple stega-encoded payloads resolved to the same DOM element');
    expect(elementArg).toBe(collide);

    expect(collide.getAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE)).toBe(
      'node-2#fieldPath=subtitle'
    );

    controller.dispose();
  });

  it('only removes stega attributes on dispose', () => {
    document.body.innerHTML = `
      <div
        id="manual"
        ${MANUAL_TARGET_STAMP_ATTRIBUTE}="manual-1"
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

    const controller = createController();

    const manual = document.getElementById('manual') as HTMLElement;
    expect(encodedParagraph.getAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE)).toBe(
      'node-2#fieldPath=subheading'
    );

    controller.dispose();

    expect(manual.getAttribute(MANUAL_TARGET_STAMP_ATTRIBUTE)).toBe('manual-1');
    expect(encodedParagraph.hasAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE)).toBe(false);
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
      <div id="text-wrapper" ${GROUP_ATTRIBUTE}>
        <span id="wrapped">${encodedText}</span>
      </div>
      <div id="image-wrapper" ${GROUP_ATTRIBUTE}>
        <img id="wrapped-image" alt="${encodedAlt}" src="#">
      </div>
    `;

    const wrappedImage = document.getElementById('wrapped-image') as HTMLImageElement;
    wrappedImage.getBoundingClientRect = () => createRect(0, 0, 0, 0);

    const controller = createController();

    const textWrapper = document.getElementById('text-wrapper') as HTMLElement;
    const innerSpan = document.getElementById('wrapped') as HTMLElement;

    expect(textWrapper.getAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE)).toBe(
      'item-1#fieldPath=wrapper.text'
    );
    expect(innerSpan.hasAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE)).toBe(false);

    const imageWrapper = document.getElementById('image-wrapper') as HTMLElement;
    expect(imageWrapper.getAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE)).toBe(
      'item-1#fieldPath=wrapper.image'
    );
    // Default behavior preserves stega encoding (invisible characters)
    expect(wrappedImage.getAttribute('alt')).toContain('Wrapped image');

    controller.dispose();
  });

  it('stamps attributes from source attribute', () => {
    const encodedSource = vercelStegaCombine('', {
      origin: 'datocms.com',
      href: 'card123#fieldPath=card.metadata'
    });

    document.body.innerHTML = `
      <main>
        <div id="card" ${SOURCE_STAMP_ATTRIBUTE}="${encodedSource}">
          <h2>Card Title</h2>
          <p>Card content without stega</p>
        </div>
      </main>
    `;

    const controller = createController();

    const card = document.getElementById('card') as HTMLElement;

    expect(card.getAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE)).toBe(
      'card123#fieldPath=card.metadata'
    );
    // Source attribute should still be present when stripStega is false
    expect(card.hasAttribute(SOURCE_STAMP_ATTRIBUTE)).toBe(true);

    controller.dispose();

    expect(card.hasAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE)).toBe(false);
  });

  it('strips source attribute when stripStega is true', () => {
    const encodedSource = vercelStegaCombine('', {
      origin: 'datocms.com',
      href: 'widget456#fieldPath=widget.data'
    });

    document.body.innerHTML = `
      <main>
        <div id="widget" ${SOURCE_STAMP_ATTRIBUTE}="${encodedSource}">
          <span>Widget content</span>
        </div>
      </main>
    `;

    const controller = createController({ stripStega: true });

    const widget = document.getElementById('widget') as HTMLElement;

    expect(widget.getAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE)).toBe(
      'widget456#fieldPath=widget.data'
    );
    // Source attribute should be removed when stripStega is true
    expect(widget.hasAttribute(SOURCE_STAMP_ATTRIBUTE)).toBe(false);

    controller.dispose();
  });

  it('re-marks elements with source attribute via MutationObserver', async () => {
    document.body.innerHTML = `<section id="container"></section>`;
    const container = document.getElementById('container') as HTMLElement;

    const controller = createController();

    const encodedSource = vercelStegaCombine('', {
      origin: 'datocms.com',
      href: 'item-789#fieldPath=item.metadata'
    });

    const div = document.createElement('div');
    div.id = 'dynamic';
    div.setAttribute(SOURCE_STAMP_ATTRIBUTE, encodedSource);
    div.textContent = 'Dynamic content';
    container.appendChild(div);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(div.getAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE)).toBe(
      'item-789#fieldPath=item.metadata'
    );
    expect(div.hasAttribute(SOURCE_STAMP_ATTRIBUTE)).toBe(true);

    controller.dispose();
  });

  it('updates stamp when source attribute changes', async () => {
    const firstEncoded = vercelStegaCombine('', {
      origin: 'datocms.com',
      href: 'item-1#fieldPath=field1'
    });

    const secondEncoded = vercelStegaCombine('', {
      origin: 'datocms.com',
      href: 'item-2#fieldPath=field2'
    });

    document.body.innerHTML = `
      <div id="mutable" ${SOURCE_STAMP_ATTRIBUTE}="${firstEncoded}">Content</div>
    `;

    const mutable = document.getElementById('mutable') as HTMLElement;

    const controller = createController();

    expect(mutable.getAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE)).toBe('item-1#fieldPath=field1');

    // Change the source attribute
    mutable.setAttribute(SOURCE_STAMP_ATTRIBUTE, secondEncoded);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mutable.getAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE)).toBe('item-2#fieldPath=field2');

    controller.dispose();
  });

  it('combines source attribute with wrapper targeting', () => {
    const encodedSource = vercelStegaCombine('', {
      origin: 'datocms.com',
      href: 'item-1#fieldPath=wrapper.metadata'
    });

    document.body.innerHTML = `
      <div id="source-wrapper" ${GROUP_ATTRIBUTE}>
        <div id="inner" ${SOURCE_STAMP_ATTRIBUTE}="${encodedSource}">
          <span>Inner content</span>
        </div>
      </div>
    `;

    const controller = createController();

    const wrapper = document.getElementById('source-wrapper') as HTMLElement;
    const inner = document.getElementById('inner') as HTMLElement;

    // Should stamp the wrapper, not the inner element
    expect(wrapper.getAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE)).toBe(
      'item-1#fieldPath=wrapper.metadata'
    );
    expect(inner.hasAttribute(AUTOMATIC_TARGET_STAMP_ATTRIBUTE)).toBe(false);

    controller.dispose();
  });
});
