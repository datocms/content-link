# DatoCMS Content Link

[![npm version](https://img.shields.io/npm/v/@datocms/content-link.svg)](https://www.npmjs.com/package/@datocms/content-link) [![License: MIT](https://img.shields.io/npm/l/@datocms/content-link.svg)](./LICENSE)

Click-to-edit overlays for DatoCMS projects. Platform and framework agnostic, two function calls to set it up.

![Usage demo](./docs/usage.gif)

```bash
npm install @datocms/content-link
```

## Quick start

### 1. Fetch content with Content Link enabled

Make sure you pass the `contentLink` and `baseEditingUrl` options when initializing the DatoCMS CDA client:

```ts
import { executeQuery } from "@datocms/cda-client";

const result = await executeQuery(query, {
  token: process.env.DATO_API_TOKEN,
  contentLink: 'vercel-v1', // vercel-v1 is just the identifier: You do not need to be hosting on Vercel!
  baseEditingUrl: 'https://acme.admin.datocms.com'
});
```

### 2. Enable automatic click-to-edit overlays

```ts
import { createOverlaysController } from '@datocms/content-link';

const controller = createOverlaysController();

// The controller is auto-enabled by default
// Call controller.disable(), controller.enable(), or controller.toggle() as needed
```

That's all you need for the majority of projects! If you see overlays and deep links opening the correct records, your setup is complete!

---

### `createOverlaysController(options?)`

```ts
import { createOverlaysController } from '@datocms/content-link';

// Minimal (no options required)
const controller = createOverlaysController();

// Available options
const controller = createOverlaysController({
  // Optional: limit scanning/observation to this root instead of the whole document.
  // Can be a ShadowRoot or a specific container element.
  root: document.getElementById('preview-container'),

  // Optional: when false, the controller starts disabled; call enable() manually.
  autoEnable: true
});

// Control & refresh
controller.disable();   // turn overlays off (keeps controller reusable)
controller.enable();    // turn overlays on
controller.toggle();    // flip overlays on/off without disposing
controller.isEnabled(); // check if currently enabled
controller.isDisposed(); // check if disposed
controller.refresh();   // re-scan the whole root; or pass a subtree: controller.refresh(someSubtree)
controller.dispose();   // permanently tear down and clean up (controller becomes inert)
```

Returns a controller to manage overlays and rescans.

**Options:**
- `root?: ParentNode`: Limit scanning to a specific container (default: `document`)
- `autoEnable?: boolean`: Auto-enable on creation (default: `true`)

**Controller methods:**
- `enable()`: Turn overlays on
- `disable()`: Turn overlays off (keeps controller reusable)
- `toggle()`: Flip overlays on/off without disposing
- `isEnabled()`: Returns `true` if currently enabled
- `isDisposed()`: Returns `true` if disposed
- `refresh(root?)`: Re-run a stega scan for the whole root or the provided subtree (use after you mutate DOM outside observers)
- `dispose()`: Permanently disconnects observers and cleans up. After dispose, the controller cannot be re-enabled; create a new one if needed

---

## Low-level utilities

```ts
import { decodeStega, stripStega } from '@datocms/content-link';

// Decode a raw string that may contain stega
const info = decodeStega(someString);
// Returns: { origin: string, href: string } | null

// Remove stega characters for display
const clean = stripStega(someString);
```

**`decodeStega(input: string)`**
- Decodes stega-encoded metadata from a string
- Returns `{ origin: string, href: string }` if stega is found, `null` otherwise
- Use this to extract editing URLs from stega-encoded content

**`stripStega(input: string)`**
- Removes stega-encoded metadata from a string
- Returns the cleaned string without zero-width characters
- Use this when you need to display or process the plain text content

## Runtime & debugging

### Runtime behaviour

1. Initial scan: walks text nodes and `<img alt>` values inside `root`, decodes stega, stamps attributes, removes stega data from content.
2. MutationObserver watches character data, child list changes, and `alt` mutations; rescans are batched automatically.
3. Overlay controller – listens for hover/click/focus/keyboard; opens the decoded edit URL in a new tab.
4. Dispose – disconnects observers, tears down listeners, and cleans up.

## Troubleshooting

- **No overlays appear**: Ensure your fetch requests include the `X-Visual-Editing` and `X-Base-Editing-Url` headers. The stega-encoded metadata is only included in responses when these headers are present.
- **Overlays not updating**: Call `controller.refresh()` after DOM changes, or use `useDatoVisualEditingListen` for automatic updates with real-time content.

## License

MIT © DatoCMS
