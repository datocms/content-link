# DatoCMS Content Link

[![npm version](https://img.shields.io/npm/v/@datocms/content-link.svg)](https://www.npmjs.com/package/@datocms/content-link) [![License: MIT](https://img.shields.io/npm/l/@datocms/content-link.svg)](./LICENSE)

Click-to-edit overlays for DatoCMS projects. Platform and framework agnostic, two function calls to set it up.

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
  contentLink: 'v1',
  baseEditingUrl: 'https://acme.admin.datocms.com', // <- URL of your DatoCMS project (https://<YOUR-PROJECT-NAME>.admin.datocms.com)
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
  root: document.getElementById('preview-container'),

  // Optional: strip stega-encoded invisible characters from text content (default: false)
  stripStega: false,

  // Optional: hue (0–359) of the overlay accent color (default: 17, orange)
  hue: 200
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
- `hue?: number`: Hue angle (0–359) of the overlay accent color (default: `17`, orange). The library automatically computes a lightness value that guarantees readable white text on the overlay label at any hue.
- `stripStega?: boolean`: Whether to strip stega-encoded invisible characters from text content after stamping (default: `false`). Stega embeds invisible, zero-width UTF-8 characters into text content to encode editing metadata.
  - When `false` (default): Stega encoding remains in the DOM, allowing controllers to be disposed and recreated on the same page. The invisible characters don't affect display but preserve the source of truth.
  - When `true`: Stega encoding is permanently removed from text nodes, providing clean `textContent` for programmatic access. However, recreating a controller on the same page won't detect elements since the encoding is lost.

**Controller methods:**
- `enableClickToEdit(flashAll?: { scrollToNearestTarget: boolean })`: Turn click-to-edit overlays on (allows clicking elements to open the editor). Optionally pass `flashAll` to briefly highlight all editable elements with an animated effect, and scroll to the nearest one if none are visible.
- `disableClickToEdit()`: Turn click-to-edit overlays off (DOM stamping continues)
- `isClickToEditEnabled()`: Returns `true` if click-to-edit is currently enabled
- `isDisposed()`: Returns `true` if the controller has been disposed
- `dispose()`: Permanently disconnects observers and cleans up. After dispose, the controller cannot be re-enabled; create a new one if needed
- `flashAll(scrollToNearestTarget?: boolean)`: Briefly highlight all editable elements with an animated effect. Optionally scroll to the nearest editable element if none are visible.

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

### Controller lifecycle and stega preservation

By default, the controller preserves stega-encoded invisible characters in the DOM. This allows you to safely dispose and recreate controllers on the same page without losing the ability to detect editable elements:

```ts
// Create initial controller
const controller1 = createController();
controller1.enableClickToEdit();

// Later, dispose it
controller1.dispose();

// Create a new controller - it will still find all editable elements
const controller2 = createController();
controller2.enableClickToEdit();
```

This is particularly useful for:
- Testing scenarios with setup/teardown
- Single Page Applications that need to recreate controllers during navigation
- Hot-reloading during development
- Any scenario requiring controller restart without page reload

If you need clean text content for programmatic access (without invisible stega characters), use `stripStega: true`. However, note that this permanently removes the stega encoding, preventing controller recreation:

```ts
const controller = createController({ stripStega: true });

// After disposal, creating a new controller won't find elements
controller.dispose();
const controller2 = createController(); // Won't detect editable elements
```

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

### Data attributes reference

This library uses several `data-datocms-*` attributes. Some are **developer-specified** (you add them to your markup), and some are **library-managed** (added automatically during DOM stamping). Here's a complete reference.

#### Developer-specified attributes

These attributes are added by you in your templates/components to control how editable regions behave.

##### `data-datocms-content-link-url`

Manually marks an element as editable with an explicit edit URL. Use this for non-text fields (booleans, numbers, dates, JSON) that cannot contain stega encoding. The recommended approach is to use the `_editingUrl` field available on all records:

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

```tsx
<span data-datocms-content-link-url={product._editingUrl}>
  ${product.price}
</span>
```

##### `data-datocms-content-link-source`

Attaches stega-encoded metadata without the need to render it as content. Useful for structural elements that cannot contain text (like `<video>`, `<audio>`, `<iframe>`, etc.) or when stega encoding in visible text would be problematic:

```tsx
<div data-datocms-content-link-source={video.alt}>
  <video src={video.url} poster={video.posterImage.url} controls />
</div>
```

The value must be a stega-encoded string (any text field from the API will work). The library decodes the stega metadata from the attribute value and makes the element clickable to edit.

##### `data-datocms-content-link-group`

Expands the clickable area to a parent element. When the library encounters stega-encoded content, by default it makes the immediate parent of the text node clickable to edit. Adding this attribute to an ancestor makes that ancestor the clickable target instead:

```html
<article data-datocms-content-link-group>
  <h2>Title with stega</h2>
  <p>Description with no stega</p>
</article>
```

Here, clicking anywhere in the `<article>` opens the editor, rather than requiring users to click precisely on the `<h2>`.

**Important:** A group should contain only one stega-encoded source. If multiple stega strings resolve to the same group, the library logs a collision warning and only the last URL wins.

##### `data-datocms-content-link-boundary`

Stops the upward DOM traversal that looks for a `data-datocms-content-link-group`, making the element where stega was found the clickable target instead. This creates an independent editable region that won't merge into a parent group (see [How group and boundary resolution works](#how-group-and-boundary-resolution-works) below for details):

```html
<div data-datocms-content-link-group>
  <h1>Title with stega (URL A)</h1>
  <section data-datocms-content-link-boundary>
    <span>Text with stega (URL B)</span>
  </section>
</div>
```

Without the boundary, clicking "Text with stega" would open URL A (the outer group). With the boundary, the `<span>` becomes the clickable target opening URL B.

The boundary can also be placed directly on the element that contains the stega text:

```html
<div data-datocms-content-link-group>
  <h1>Title with stega (URL A)</h1>
  <span data-datocms-content-link-boundary>Text with stega (URL B)</span>
</div>
```

Here, the `<span>` has the boundary and directly contains the stega text, so the `<span>` itself becomes the clickable target (since the starting element and the boundary element are the same).

#### Library-managed attributes

These attributes are added automatically by the library during DOM stamping. You do not need to add them yourself, but you can target them in CSS or JavaScript.

##### `data-datocms-contains-stega`

Added to elements whose text content contains stega-encoded invisible characters. This attribute is only present when `stripStega` is `false` (the default), since with `stripStega: true` the characters are removed entirely. Useful for CSS workarounds — the zero-width characters can sometimes cause unexpected letter-spacing or text overflow:

```css
[data-datocms-contains-stega] {
  letter-spacing: 0 !important;
}
```

##### `data-datocms-auto-content-link-url`

Added automatically to elements that the library has identified as editable targets (through stega decoding and group/boundary resolution). Contains the resolved edit URL.

This is the automatic counterpart to the developer-specified `data-datocms-content-link-url`. The library adds `data-datocms-auto-content-link-url` wherever it can extract an edit URL from stega encoding, while `data-datocms-content-link-url` is needed for non-text fields (booleans, numbers, dates, etc.) where stega encoding cannot be embedded. Both attributes are used by the click-to-edit overlay system to determine which elements are clickable and where they link to.

### How group and boundary resolution works

When the library encounters stega-encoded content inside an element, it walks up the DOM tree from that element:

1. If it finds a `data-datocms-content-link-group`, it stops and stamps **that** element as the clickable target.
2. If it finds a `data-datocms-content-link-boundary`, it stops and stamps the **starting element** as the clickable target — further traversal is prevented.
3. If it reaches the root without finding either, it stamps the **starting element**.

Here are some concrete examples to illustrate:

**Example 1: Nested groups**

```html
<div data-datocms-content-link-group>
  <h1>Title with stega (URL A)</h1>
  <div data-datocms-content-link-group>
    <p>Paragraph with stega (URL B)</p>
  </div>
</div>
```

- **"Title with stega"**: walks up from `<h1>`, finds the outer group → the **outer `<div>`** becomes clickable (opens URL A).
- **"Paragraph with stega"**: walks up from `<p>`, finds the inner group first → the **inner `<div>`** becomes clickable (opens URL B). The outer group is never reached.

Each nested group creates an independent clickable region. The innermost group always wins for its own content.

**Example 2: Boundary preventing group propagation**

```html
<div data-datocms-content-link-group>
  <h1>Title with stega (URL A)</h1>
  <section data-datocms-content-link-boundary>
    <span>Text with stega (URL B)</span>
  </section>
</div>
```

- **"Title with stega"**: walks up from `<h1>`, finds the outer group → the **outer `<div>`** becomes clickable (opens URL A).
- **"Text with stega"**: walks up from `<span>`, hits the `<section>` boundary → traversal stops, the **`<span>`** itself becomes clickable (opens URL B). The outer group is not reached.

**Example 3: Boundary inside a group**

```html
<div data-datocms-content-link-group>
  <p>Main content with stega (URL A)</p>
  <div data-datocms-content-link-boundary>
    <p>Isolated content with stega (URL B)</p>
  </div>
</div>
```

- **"Main content with stega"**: walks up from `<p>`, finds the outer group → the **outer `<div>`** becomes clickable (opens URL A).
- **"Isolated content with stega"**: walks up from `<p>`, hits the boundary → traversal stops, the **`<p>`** itself becomes clickable (opens URL B). The outer group is not reached.

**Example 4: Multiple stega strings without groups (collision warning)**

```html
<p>
  Text with stega (URL A)
  More text with stega (URL B)
</p>
```

Both stega-encoded strings resolve to the same `<p>` element. The library logs a console warning and the last URL wins. To fix this, wrap each piece of content in its own element:

```html
<p>
  <span>Text with stega (URL A)</span>
  <span>More text with stega (URL B)</span>
</p>
```

### Structured Text fields

Structured Text fields require special attention because of how stega encoding works within them:

- The DatoCMS API encodes stega information inside a single `<span>` within the structured text output. Without any configuration, only that small span would be clickable.
- Structured Text fields can contain **embedded blocks** and **inline records**, each with their own editing URL that should open a different record in the editor.

Here are the rules to follow:

#### Rule 1: Always wrap the Structured Text component in a group

This makes the entire structured text area clickable, instead of just the tiny stega-encoded span:

```tsx
<div data-datocms-content-link-group>
  <StructuredText data={page.content} />
</div>
```

#### Rule 2: Wrap embedded blocks and inline records in a boundary

Embedded blocks and inline records have their own edit URL (pointing to the block/record). Without a boundary, clicking them would bubble up to the parent group and open the structured text field editor instead. Add `data-datocms-content-link-boundary` to prevent them from merging into the parent group:

```tsx
<div data-datocms-content-link-group>
  <StructuredText
    data={page.content}
    renderBlock={(block) => (
      <div data-datocms-content-link-boundary>
        <BlockComponent block={block} />
      </div>
    )}
    renderInlineRecord={(record) => (
      <span data-datocms-content-link-boundary>
        <InlineRecordComponent record={record} />
      </span>
    )}
  />
</div>
```

With this setup:
- Clicking the main text (paragraphs, headings, lists) opens the **structured text field editor**
- Clicking an embedded block or inline record opens **that record's editor**

---

## Low-level utilities

```ts
import { decodeStega, stripStega, revealStega } from '@datocms/content-link';

// Decode a raw string that may contain stega
const info = decodeStega(someString);
// Returns: { origin: string, href: string } | null

// Remove stega characters for display
const clean = stripStega(someString);

// Make stega visible for debugging (works with any value, including full GraphQL responses)
const debug = revealStega(graphqlResponse);
console.log(JSON.stringify(debug, null, 2));
```

**`decodeStega(input: string)`**
- Decodes stega-encoded metadata from a string
- Returns `{ origin: string, href: string }` if stega is found, `null` otherwise
- Use this to extract editing URLs from stega-encoded content

**`stripStega(input: any)`**
- Works with any data type: strings, objects, arrays, and primitives
- Converts input to JSON, removes all stega-encoded segments using `VERCEL_STEGA_REGEX`, then parses back to original type
- Returns the cleaned data without invisible stega characters

**`revealStega(input: any)`**
- Works with any data type, just like `stripStega`
- Instead of removing stega, replaces each invisible segment with a visible `[STEGA:/editor/item_types/…]` marker
- Useful for debugging to see which strings carry Visual Editing metadata

```ts
// Works with strings
stripStega("Hello\u200EWorld") // "HelloWorld"

// Works with objects
stripStega({ name: "John\u200E", age: 30 })

// Works with nested structures - removes ALL stega encodings
stripStega({
  users: [
    { name: "Alice\u200E", email: "alice\u200E.com" },
    { name: "Bob\u200E", email: "bob\u200E.co" }
  ]
})

// Works with arrays
stripStega(["First\u200E", "Second\u200E", "Third\u200E"])

// Reveal stega in a full GraphQL response for debugging
revealStega({
  blog: {
    title: "Hello World\u200E",
    author: { name: "Alice\u200E" }
  }
})
// {
//   blog: {
//     title: "Hello World[STEGA:/editor/item_types/123/items/456]",
//     author: { name: "Alice[STEGA:/editor/item_types/789/items/012]" }
//   }
// }
```

## Troubleshooting

- **No overlays appear**: Ensure your fetch requests include the `contentLink` and `baseEditingUrl` options. `baseEditingUrl` should be set to your DatoCMS project admin URL (e.g., `https://<YOUR-PROJECT-NAME>.admin.datocms.com`). The stega-encoded metadata is only included in responses when these options are present. Also, make sure you've called `enableClickToEdit()` on the controller.
- **Elements not clickable**: DOM stamping runs automatically, but click-to-edit overlays require explicit activation via `enableClickToEdit()`.
- **Overlays not updating**: The MutationObserver automatically detects DOM changes and rescans. If you're replacing large parts of the DOM at once, ensure the mutations are observable.
- **Web Previews plugin integration not working**: The plugin connection only works when your preview is running inside the Web Previews plugin iframe. Outside of the plugin, edit URLs will open in a new tab as a fallback.
- **Controller recreation issues**: If you dispose and recreate a controller on the same page, the second controller will only find elements if `stripStega: false` (the default). If you previously used `stripStega: true`, the stega encoding was permanently removed and cannot be recovered. In this case, you'll need to reload the page or re-fetch the content.
- **Layout issues caused by stega encoding**: The invisible zero-width characters can cause unexpected letter-spacing or text breaking out of containers. To fix this, either use `stripStega: true`, or use CSS: `[data-datocms-contains-stega] { letter-spacing: 0 !important; }`. This attribute is automatically added to elements with stega-encoded content when `stripStega: false` (the default).

## License

MIT © DatoCMS
