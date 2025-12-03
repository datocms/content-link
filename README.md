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

**Note:** You can also skip calling `enableClickToEdit()` and temporarily enable click-to-edit mode on-demand by holding down the **Alt/Option** key. The mode will be active while the key is held and automatically disable when released.

That's all you need for the majority of projects! If you see overlays and deep links opening the correct records, your setup is complete!

---

### `createController(options?)`

```ts
import { createController } from '@datocms/content-link';

// Minimal (no options required)
const controller = createController();

// With options
const controller = createController({
  // Optional: limit scanning/observation to this root instead of the whole document.
  // Can be a ShadowRoot or a specific container element.
  root: document.getElementById('preview-container')
});

// Control click-to-edit overlays
controller.enableClickToEdit();       // turn click-to-edit overlays on
controller.enableClickToEdit({        // with visual flash highlighting all editable elements
  scrollToNearestTarget: true         // optionally scroll to nearest editable if none visible
});
controller.disableClickToEdit();      // turn click-to-edit overlays off
controller.isClickToEditEnabled();    // check if click-to-edit is currently enabled
controller.isDisposed();              // check if disposed
controller.dispose();                 // permanently tear down and clean up (controller becomes inert)
```

Returns a controller to manage DOM stamping and click-to-edit overlays.

**Options:**
- `root?: ParentNode`: Limit scanning to a specific container (default: `document`)

**Controller methods:**
- `enableClickToEdit(flashAll?: { scrollToNearestTarget: boolean })`: Turn click-to-edit overlays on (allows clicking elements to open the editor). Optionally pass `flashAll` to briefly highlight all editable elements with an animated effect, and scroll to the nearest one if none are visible.
- `disableClickToEdit()`: Turn click-to-edit overlays off (DOM stamping continues)
- `isClickToEditEnabled()`: Returns `true` if click-to-edit is currently enabled
- `isDisposed()`: Returns `true` if the controller has been disposed
- `dispose()`: Permanently disconnects observers and cleans up. After dispose, the controller cannot be re-enabled; create a new one if needed
- `flashAll(scrollToNearestTarget?: boolean)`: Briefly highlight all editable elements with an animated effect. Optionally scroll to the nearest editable element if none are visible.
- `flashItem(itemId: string, scrollToNearestTarget?: boolean)`: Briefly highlight a specific editable item with an animated effect. The `itemId` corresponds to the record ID in DatoCMS. Optionally scroll to the item if not visible.

**Keyboard shortcuts:**
- **Alt/Option key**: Hold down to temporarily enable/disable click-to-edit mode. This toggles the current state and reverts when the key is released.

**Note:** DOM stamping (detecting and marking editable elements) runs automatically when the controller is created and continues until `dispose()` is called. Click-to-edit overlays are independent and must be explicitly enabled with `enableClickToEdit()`.

---

## Web Previews Plugin Integration

When your website runs inside the Visual Editing mode of the [Web Previews plugin](https://www.datocms.com/marketplace/plugins/i/datocms-plugin-web-previews), the controller automatically establishes bidirectional communication with the plugin.

This connection is **completely automatic** and requires no configuration. If your preview is not running in an iframe or the connection fails, the library gracefully falls back to opening edit URLs in a new tab.

### Client-side routing support

If your website uses client-side routing (like Next.js, React Router, etc.), you need to set up bidirectional communication with the plugin:

```tsx
// Next.js App Router example
'use client';

import { createController } from '@datocms/content-link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

export default function PreviewPage() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const controller = createController({
      // Handle navigation requests from the plugin
      onNavigateTo: (path) => {
        router.push(path);
      }
    });

    return () => controller.dispose();
  }, [router]);

  useEffect(() => {
    // Notify the plugin when the URL changes
    controller?.setCurrentPath(pathname);
  }, [pathname]);

  return <YourPageContent />;
}
```

**Available option:**
- `onNavigateTo?: (path: string) => void`: Callback invoked when the Web Previews plugin requests navigation to a different URL

**Available method:**
- `setCurrentPath(path: string)`: Notify the Web Previews plugin of the current URL

---

## Advanced usage

### Visual feedback with flash-all highlighting

You can show users where all the editable elements are on the page in two ways:

**1. When enabling click-to-edit mode:**
```ts
controller.enableClickToEdit({
  scrollToNearestTarget: true
});
```

**2. As a standalone method:**
```ts
// Highlight all editable elements
controller.flashAll();

// Highlight and scroll to nearest editable if none visible
controller.flashAll(true);
```

This will:
1. Briefly highlight all editable elements with an animated fade-in/out effect (using a staggered animation)
2. If `scrollToNearestTarget` is `true` and no editable elements are currently visible in the viewport, automatically scroll to the nearest editable element

This is particularly useful for:
- Onboarding users to the editing experience
- Helping editors quickly identify what content they can edit
- Navigating to editable content on long pages

### Edit groups with `data-datocms-content-link-group`

In some cases, you may want to make a larger area clickable than the specific element containing the stega-encoded information. You can achieve this by adding the `data-datocms-content-link-group` attribute to a parent element.

**Structured text fields**

This attribute is particularly useful when rendering **Structured Text** fields. The DatoCMS GraphQL CDA encodes stega information within a specific `span` node inside the structured text content. This means that by default, only that particular span would be clickable to open the editor.

To provide a better editing experience, we recommend wrapping your structured text rendering component with a container that has the `data-datocms-content-link-group` attribute. This makes the entire structured text area clickable:

```tsx
<div data-datocms-content-link-group>
  <StructuredText data={content.structuredTextField} />
</div>
```

This way, users can click anywhere within the structured text content to edit it, rather than having to precisely target a small span element.

**Edit boundaries with `data-datocms-content-link-boundary`**

By default, when the library encounters stega-encoded content, it searches up the DOM tree to find the nearest `data-datocms-content-link-group` attribute. However, you can stop this upward traversal at any point using the `data-datocms-content-link-boundary` attribute.

This is particularly useful with **Structured Text** fields that contain embedded blocks: while the main structured text paragraphs, headings, and lists should open the structured text field editor, embedded blocks should open their own specific record editor instead:

```tsx
<div data-datocms-content-link-group>
  <StructuredText
    data={content.structuredTextField}
    renderBlock={(block) => (
      <div data-datocms-content-link-boundary>
        <BlockComponent block={block} />
      </div>
    )}
  />
</div>
```

In this example:
- The main structured text content will use the outer `div[data-datocms-content-link-group]` for editing
- Each embedded block will **not** traverse past its `div[data-datocms-content-link-boundary]`, creating its own independent editable region

This ensures that clicking on the main text opens the structured text field editor, while clicking on an embedded block opens that specific block's editor.

### Manual overlays with `data-datocms-content-link-url`

For text-based fields (single-line text, structured text, markdown), the DatoCMS API automatically embeds stega-encoded information, which this library detects to create overlays. However, non-text fields like booleans, numbers, dates, and JSON cannot contain stega encoding.

For these cases, use the `data-datocms-content-link-url` attribute to manually specify the edit URL. The recommended approach is to use the `_editingUrl` field available on all records:

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
<span data-datocms-content-link-url={product._editingUrl}>
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
2. **Click-to-Edit Overlays** (opt-in): When enabled via `enableClickToEdit()`, listens for hover/click/focus/keyboard events and highlights editable regions. Clicking opens the edit URL in the DatoCMS editor or a new tab. Can also be temporarily toggled by holding the Alt/Option key.
3. **Web Previews Plugin Connection** (automatic): When running inside the Web Previews plugin iframe, establishes bidirectional communication for state synchronization and remote control.
4. **Dispose**: Disconnects all observers, tears down listeners, clears stamps, and cleans up.

### Architecture

The controller orchestrates several independent managers:
- **DomStampingManager**: Handles DOM observation, mutation batching, stega decoding, and attribute stamping
- **ClickToEditManager**: Handles visual highlighting and user interactions (only active when enabled)
- **FlashAllManager**: Handles the animated flash-all highlighting feature
- **EventsManager**: Manages custom events for state changes and user interactions
- **WebPreviewsPluginConnection**: Handles bidirectional communication with the Web Previews plugin via iframe messaging (Penpal)

All managers can work independently - stamping continues even when click-to-edit is disabled, and the plugin connection is only established when running inside an iframe.

## Troubleshooting

- **No overlays appear**: Ensure your fetch requests include the `contentLink` and `baseEditingUrl` options. The stega-encoded metadata is only included in responses when these options are present. Also, make sure you've called `enableClickToEdit()` on the controller.
- **Elements not clickable**: DOM stamping runs automatically, but click-to-edit overlays require explicit activation via `enableClickToEdit()`.
- **Overlays not updating**: The MutationObserver automatically detects DOM changes and rescans. If you're replacing large parts of the DOM at once, ensure the mutations are observable.
- **Web Previews plugin integration not working**: The plugin connection only works when your preview is running inside the Web Previews plugin iframe. Outside of the plugin, edit URLs will open in a new tab as a fallback.

## License

MIT © DatoCMS
