# DatoCMS Visual Editing

[![npm version](https://img.shields.io/npm/v/datocms-visual-editing.svg)](https://www.npmjs.com/package/datocms-visual-editing) [![License: MIT](https://img.shields.io/npm/l/datocms-visual-editing.svg)](./LICENSE)

Click-to-edit overlays for DatoCMS projects. Platform and framework agnostic, two function calls to set it up.

![Usage demo](./docs/usage.gif)

```bash
npm install datocms-visual-editing
```

## Quick start

1) Fetch preview content with visual-editing headers

You can set the headers manually with plain `fetch`:

```ts
const response = await fetch('https://graphql.datocms.com/', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.DATO_PREVIEW_API_TOKEN}`,
    'X-Visual-Editing': 'vercel-v1', //vercel-v1 is just the identifier: You do not neeed to be hosting on Vercel.
    'X-Base-Editing-Url': 'https://acme.admin.datocms.com'
  },
  body: JSON.stringify({ query })
});
```

> **Tip:** You can also use [`@datocms/cda-client`](https://github.com/datocms/cda-client), which has these headers as a built-in option.

2) Enable overlays on your preview page

```ts
import { enableDatoVisualEditing } from 'datocms-visual-editing';

const controller = enableDatoVisualEditing({
  baseEditingUrl: 'https://acme.admin.datocms.com',
  environment: 'main'
}); 

controller.enable();
```

> That’s all you need for the majority of projects! 
>
> If you see overlays and deep links opening the correct records, your setup is complete!
>
> The following (optional) sections explain:
> - How to add a toggle button (with example React code)
> - How to integrate with the Real Time API for live content updates
> - How to customize the overlay and debug stega payloads
> - Handling fields that do not contain stega markers (like numbers or booleans)
> - Handling Structured Text fields
> - Advanced and low-level utilities for custom cases

Optional button to toggle Visual Editing (React):

```tsx
'use client';
import { useEffect, useRef } from 'react';
import { enableDatoVisualEditing, type Controller } from 'datocms-visual-editing';

export function VisualEditingToggleButton() {
  const controllerRef = useRef<Controller | null>(null);

  useEffect(() => {
    controllerRef.current = enableDatoVisualEditing({
      baseEditingUrl: 'https://acme.admin.datocms.com',
      environment: 'main'
    });
    return () => controllerRef.current?.dispose();
  }, []);

  return (
    <button type="button" onClick={() => controllerRef.current?.toggle()}>
      Toggle visual editing
    </button>
  );
}
```

### Cleanup & disposal

- The runtime scrubs zero‑width stega markers automatically after stamping attributes on elements.
- Call `controller.dispose()` when your preview surface unmounts (e.g. SPA route change). This disconnects observers and removes only the generated attributes the library added.
- Need cleanup without enabling overlays? Use `enableDatoAutoClean(selector, options)` to scrub stega payloads in a specific DOM subtree.

## Using Visual Editing with the Real Time API

Use this only if your preview receives real-time updates via DatoCMS [Real‑time Updates API](https://www.datocms.com/docs/real-time-updates-api). If you render a static snapshot from the [Content Delivery API](https://www.datocms.com/docs/content-delivery-api), you can skip this hook; `enableDatoVisualEditing` alone will show overlays on first render, but there will be no live re-scan.

```tsx
'use client';
import { useRef } from 'react';
import { useDatoVisualEditingListen } from 'datocms-visual-editing/react';

function subscribe({ onUpdate }: { onUpdate: () => void }) {
  const sse = new EventSource('/api/dato/listen');
  sse.onmessage = () => onUpdate();
  return () => sse.close();
}

export function PreviewVisualEditing() {
  const scopeRef = useRef<HTMLDivElement | null>(null);
  useDatoVisualEditingListen(subscribe, {
    controllerOptions: { baseEditingUrl: 'https://acme.admin.datocms.com', environment: 'main' },
    scopeRef,
    initialRefresh: true
  });
  return <div ref={scopeRef} />;
}
```

## API & attributes: prototypes and their functions

### enableDatoVisualEditing(options): Controller

```ts
import { enableDatoVisualEditing } from 'datocms-visual-editing';

// Minimal
const controller = enableDatoVisualEditing({
  baseEditingUrl: 'https://acme.admin.datocms.com'
});

// Common options
const controller2 = enableDatoVisualEditing({
  // Required: your project’s admin URL. Used to build deep links and sent
  // as X-Base-Editing-Url on preview requests.
  baseEditingUrl: 'https://acme.admin.datocms.com',

  // Optional: environment slug for diagnostics and deep links.
  environment: 'main',

  // Optional: limit scanning/observation to this root instead of the whole document.
  // Can be a ShadowRoot or a specific container element.
  root: document,

  // Optional: when true, stamps extra data-datocms-debug-* attributes for inspection.
  debug: false,

  // Optional: when false, the controller starts disabled; call enable() manually.
  autoEnable: true,

  // Optional: customize the edit URL per payload. Return a string to override,
  // or return null to skip stamping that element entirely.
  resolveEditUrl: (info, { baseEditingUrl }) => {
    return info.href ?? `${baseEditingUrl}/items/${info.itemId}`;
  }
});

// Control & refresh
controller2.disable(); // turn overlays off (keeps controller reusable)
controller2.enable();  // turn overlays on
controller2.toggle();  // flip overlays on/off without disposing
controller2.refresh(); // re-scan the whole root; or pass a subtree: controller2.refresh(someSubtree)
controller2.dispose(); // permanently tear down and remove generated attributes (controller becomes inert)
```

Returns a controller to manage overlays and rescans.

Controller methods explained:

- toggle(): enable/disable overlays and observers without destroying the instance.
- refresh(root?): re-run a stega scan for the whole root or the provided subtree (use after you mutate DOM outside observers).
- dispose(): permanently disconnects observers and removes only generated attributes. After dispose, the controller cannot be re-enabled; create a new one if needed.

### enableDatoAutoClean(selector?, options?): () => void

```ts
import { enableDatoAutoClean } from 'datocms-visual-editing';

// Clean any subtree(s) marked in the DOM
const disposeClean = enableDatoAutoClean('[data-datocms-auto-clean]', {
  delayMs: 32,
  cleanImageAlts: true,
  observeImageAlts: true,
  skipSelectors: ['[contenteditable="true"]']
});

// Later
disposeClean();
```

Scrubs stega payloads from a DOM subtree without enabling overlays. Returns a disposer to stop observers/timers.

### Attributes contract

- `data-datocms-edit-url`: exact DatoCMS editor deep link used by overlays.
- `data-datocms-editable`: convenience flag stamped on every editable target.
- `data-datocms-generated="stega"`: guard to clean only attributes created by the runtime.
- `data-datocms-edit-target`: move attributes to a specific wrapper element.
- Debug (when `debug: true`): `data-datocms-debug`, `data-datocms-debug-reason`, `data-datocms-debug-url`, `data-datocms-debug-info`.

### Manual attribute helpers

```ts
import { buildEditTagAttributes, getDatoEditInfo } from 'datocms-visual-editing';

// Server-side or prerender step
const attrs = buildEditTagAttributes(
  {
    itemId: '123',
    itemTypeId: '456',
    environment: 'main',
    locale: 'en',
    editUrl: 'https://acme.admin.datocms.com/...'
  },
  'url' // or 'attrs' | 'json'
);

for (const [name, value] of Object.entries(attrs)) {
  element.setAttribute(name, value);
}

// Later, read info back from an element
const info = getDatoEditInfo(element);
console.log(info?.itemId, info?.editUrl);
```

Use `buildEditTagAttributes` to generate attributes server‑side; `getDatoEditInfo` reads metadata from an element (prefers explicit attributes, falls back to stega).

When would you use this?

- Numeric/boolean/computed fields that don’t carry stega (e.g. a number field, a boolean rendered as “In stock”).
- Values produced by formatters (currency, dates) or composed UI where the visible string doesn’t include the original stega payload.
- Icon‑only or badge elements where the edit target isn’t a text node.
- Static or pre‑annotated markup where you want full control over which element gets the overlay.

React example (numeric field):

```tsx
import { buildEditTagAttributes } from 'datocms-visual-editing';

type Props = {
  itemId: string;
  itemTypeId: string;
  price: number;
};

export function ProductPrice({ itemId, itemTypeId, price }: Props) {
  // Number fields don’t include stega in their rendered text, so stamp attributes manually.
  const attrs = buildEditTagAttributes(
    {
      itemId,
      itemTypeId,
      fieldPath: 'price',
      environment: 'main',
      // If you already have the editor URL, you can pass it directly
      // editUrl: `https://acme.admin.datocms.com/items/${itemId}`
    },
    'url'
  );

  return (
    <span {...attrs} data-datocms-edit-target>
      {price}
    </span>
  );
}
```

### Low‑level utilities

```ts
import { decodeStega, stripStega, checkStegaState } from 'datocms-visual-editing';

// Decode a raw string that may contain stega
const info = decodeStega(someString);

// Remove stega characters for display
const clean = stripStega(someString);

// Inspect the current DOM footprint
const state = checkStegaState(document);
// { editableTotal, generatedTotal, explicitTotal, infoOnlyTotal, ... }
```

### React helper

See Using Visual Editing with the Real Time API for the React hook usage.


## Advanced usage

### Manually marking elements

- You can author edit attributes yourself. The overlay activates on the nearest element with `data-datocms-edit-url` and `data-datocms-editable`.
- Prefer generating attributes from decoded payloads using server helpers or provide a custom `resolveEditUrl` when enabling the runtime.
- If multiple payloads would map to the same element, split content into dedicated wrappers.

Target wrappers explicitly with `data-datocms-edit-target` so a parent wrapper receives the attributes instead of the inner element. For images with zero size, the nearest wrapper is automatically targeted so the overlay stays clickable.

### Structured text fields

- Structured Text often renders nested markup; to highlight the whole block as one edit target, spread edit attributes on a wrapper and add `data-datocms-edit-target`.
- Use the record’s `_editingUrl` plus the field path (e.g. `content`, `description`) and active `locale` to build attributes.
- Keep DOM stable between server and client (don’t replace the Structured Text subtree); call `controller.refresh(wrapper)` after streaming updates if needed.

React example:

```tsx
import { buildEditTagAttributes } from 'datocms-visual-editing';
import { StructuredText } from 'react-datocms/structured-text';

export function Content({ editingUrl, content, locale }) {
  const attrs = editingUrl
    ? buildEditTagAttributes({ _editingUrl: editingUrl, fieldPath: 'content', locale })
    : {};

  return (
    <div {...attrs} data-datocms-edit-target>
      <StructuredText data={content} />
    </div>
  );
}
```

Notes:

- For nested paths use arrays, e.g. `fieldPath: ['blocks', 0, 'title']`.
- If you only want a specific element inside the Structured Text to be the target, apply the attributes to that element and include `data-datocms-edit-target` there.

### Working with custom roots

Pass a `root` to scope scanning and observation to a particular subtree (for example, a ShadowRoot or a specific container). Only nodes within that root are touched and later cleaned by `dispose()`.

## Runtime & debugging

### Runtime behaviour

1. Initial scan – walks text nodes and `<img alt>` values inside `root`, decodes stega, stamps attributes, scrubs markers.
2. MutationObserver – watches character data, child list changes, and `alt` mutations; rescans are batched via microtasks.
3. Overlay controller – listens for hover/click/focus/keyboard; opens the nearest ancestor’s `data-datocms-edit-url` in a new tab.
4. Dispose – disconnects observers, tears down listeners, removes only generated attributes.

### Lifecycle events

Listen to DOM CustomEvents on `document`:

```ts
document.addEventListener('datocms:visual-editing:ready', (event) => {
  console.log('ready', (event as CustomEvent).detail);
});
```

Event names: `datocms:visual-editing:ready`, `datocms:visual-editing:marked`, `datocms:visual-editing:state`, `datocms:visual-editing:warn`.

- `ready` / `marked`: MarkSummary payload
- `state`: `{ enabled, disposed }`
- `warn`: `{ code, message }` (development only)

### Streaming & rehydration

- When streaming preview responses or rehydrating, reuse the server-rendered DOM nodes. The `_editingUrl` metadata lives on those elements; replacing them breaks overlays.
- Mutate text/attributes in place and call `controller.refresh(root?)` after new markup lands, or use `useDatoVisualEditingListen`.

### Debug tools and low‑level helpers

- `debug: true` adds `data-datocms-debug-*` attributes for in-browser inspection.
- `checkStegaState(root?)` provides programmatic insight into editable totals and leftover markers.
- Utilities: `decodeStega(string)`, `stripStega(string)`, `getDatoEditInfo(element)`, `buildEditTagAttributes(info, format)`.
## Troubleshooting

- No overlay: ensure elements have `data-datocms-edit-url` (check your fetch headers).
- Wrong highlight: add `data-datocms-edit-target` to the desired wrapper.
- Multiple payloads on one element: split content into dedicated wrappers.

## Examples & demos

- Next.js App Router example → [examples/nextjs-app-router](./examples/nextjs-app-router/)
- Plain JS sample → [examples/plain-js](./examples/plain-js/)
- Payload inspection scripts → [examples/payload-inspection](./examples/payload-inspection/)
 - Ecommerce Website Demo (Visual Editing + Realtime Updates) → [imagesVisualEditing branch](https://github.com/datocms/ecommerce-website-demo/tree/imagesVisualEditing)

## Contributing & development

- Install: `pnpm install` (Node ≥18)
- Build: `pnpm run build`
- Test: `pnpm run test` (or `pnpm run test:watch`)
- Lint/format: `pnpm run lint` / `pnpm run format`
- See `CONTRIBUTING.md` for detailed guidelines and integration testing setup.

## License

MIT © DatoCMS
