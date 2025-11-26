# DatoCMS Content Link

[![npm version](https://img.shields.io/npm/v/@datocms/content-link.svg)](https://www.npmjs.com/package/@datocms/content-link) [![License: MIT](https://img.shields.io/npm/l/@datocms/content-link.svg)](./LICENSE)

Click-to-edit overlays for DatoCMS projects. Platform and framework agnostic, two function calls to set it up.

```bash
npm install @datocms/content-link
```

![Usage demo](./docs/usage.gif)

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
import { createController } from '@datocms/content-link';

const controller = createController();
controller.enableClickToEdit();
```

That's all you need for the majority of projects! If you see overlays and deep links opening the correct records, your setup is complete!

---

### `createController(options?)`

```ts
import { createController } from '@datocms/content-link';

// Minimal (no options required)
const controller = createController();

// Available options
const controller = createController({
  // Optional: limit scanning/observation to this root instead of the whole document.
  // Can be a ShadowRoot or a specific container element.
  root: document.getElementById('preview-container'),

  // Optional: customize the click-to-edit overlay appearance
  clickToEditStyle: {
    borderColor: '#0066ff',
    borderWidth: '3px',
    borderRadius: '12px',
    backgroundColor: 'rgba(0, 102, 255, 0.15)',
    padding: 10
  },

  // Optional: callback invoked when the Studio requests navigation to a different URL
  onNavigateTo: (path: string) => {
    // Handle client-side routing
    router.push(path);
  }
});

// Control click-to-edit overlays
controller.enableClickToEdit();       // turn click-to-edit overlays on
controller.disableClickToEdit();      // turn click-to-edit overlays off
controller.isClickToEditEnabled();    // check if click-to-edit is currently enabled
controller.isDisposed();              // check if disposed
controller.dispose();                 // permanently tear down and clean up (controller becomes inert)

// Notify Studio of URL changes (for client-side routing)
controller.setCurrentPath(window.location.pathname);
```

Returns a controller to manage DOM stamping and click-to-edit overlays.

**Options:**
- `root?: ParentNode`: Limit scanning to a specific container (default: `document`)
- `clickToEditStyle?: ClickToEditStyle`: Customize the appearance of click-to-edit highlight overlays
  - `borderColor?: string`: CSS border color (default: `'#ff7751'`)
  - `borderWidth?: string`: CSS border width (default: `'2px'`)
  - `borderRadius?: string`: CSS border radius (default: `'8px'`)
  - `backgroundColor?: string`: CSS background color with opacity (default: `'rgba(255, 119, 81, 0.12)'`)
  - `padding?: number`: Padding around highlighted elements in pixels (default: `8`)
- `onNavigateTo?: (path: string) => void`: Callback invoked when the Studio requests navigation (useful for client-side routing)

**Controller methods:**
- `enableClickToEdit()`: Turn click-to-edit overlays on (allows clicking elements to open the editor)
- `disableClickToEdit()`: Turn click-to-edit overlays off (DOM stamping continues)
- `isClickToEditEnabled()`: Returns `true` if click-to-edit is currently enabled
- `isDisposed()`: Returns `true` if the controller has been disposed
- `setCurrentPath(path: string)`: Notify the Studio of the current URL (for client-side routing)
- `dispose()`: Permanently disconnects observers and cleans up. After dispose, the controller cannot be re-enabled; create a new one if needed

**Note:** DOM stamping (detecting and marking editable elements) runs automatically when the controller is created and continues until `dispose()` is called. Click-to-edit overlays are independent and must be explicitly enabled with `enableClickToEdit()`.

---

## Advanced usage

### Edit groups with `data-datocms-edit-group`

In some cases, you may want to make a larger area clickable than the specific element containing the stega-encoded information. You can achieve this by adding the `data-datocms-edit-group` attribute to a parent element.

**Structured text fields**

This attribute is particularly useful when rendering **Structured Text** fields. The DatoCMS GraphQL CDA encodes stega information within a specific `span` node inside the structured text content. This means that by default, only that particular span would be clickable to open the editor.

To provide a better editing experience, we recommend wrapping your structured text rendering component with a container that has the `data-datocms-edit-group` attribute. This makes the entire structured text area clickable:

```tsx
<div data-datocms-edit-group>
  <StructuredText data={content.structuredTextField} />
</div>
```

This way, users can click anywhere within the structured text content to edit it, rather than having to precisely target a small span element.

### Manual overlays with `data-datocms-edit-url`

For text-based fields (single-line text, structured text, markdown), the DatoCMS API automatically embeds stega-encoded information, which this library detects to create overlays. However, non-text fields like booleans, numbers, dates, and JSON cannot contain stega encoding.

For these cases, use the `data-datocms-edit-url` attribute to manually specify the edit URL. The recommended approach is to use the `_editingUrl` field available on all records:

```graphql
query {
  product {
    id
    price
    isActive
    _editingUrl
  }
}
```

Then add the attribute to your element:

```tsx
<span data-datocms-edit-url={product._editingUrl}>
  ${product.price}
</span>
```

This ensures the URL format is always correct and adapts automatically to any future changes.

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

1. **DOM Stamping** (automatic): Walks text nodes and `<img alt>` values inside `root`, decodes stega, stamps attributes (`data-datocms-stega`), removes stega data from content. MutationObserver watches for changes and rescans automatically.
2. **Click-to-Edit Overlays** (opt-in): When enabled via `enableClickToEdit()`, listens for hover/click/focus/keyboard events and highlights editable regions. Clicking opens the edit URL in the DatoCMS Studio or a new tab.
3. **Dispose**: Disconnects all observers, tears down listeners, clears stamps, and cleans up.

### Architecture

The controller orchestrates two independent managers:
- **DomStampingManager**: Handles DOM observation, mutation batching, stega decoding, and attribute stamping
- **ClickToEditManager**: Handles visual highlighting and user interactions (only active when enabled)

Both managers can work independently - stamping continues even when click-to-edit is disabled.

## Troubleshooting

- **No overlays appear**: Ensure your fetch requests include the `contentLink` and `baseEditingUrl` options. The stega-encoded metadata is only included in responses when these options are present. Also, make sure you've called `enableClickToEdit()` on the controller.
- **Elements not clickable**: DOM stamping runs automatically, but click-to-edit overlays require explicit activation via `enableClickToEdit()`.
- **Overlays not updating**: The MutationObserver automatically detects DOM changes and rescans. If you're replacing large parts of the DOM at once, ensure the mutations are observable.

## License

MIT © DatoCMS
