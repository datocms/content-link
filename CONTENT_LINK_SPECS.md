# @datocms/content-link - Studio Integration Specification

## Overview

This document specifies the DatoCMS Visual Editing feature for `@datocms/content-link`. The library currently provides click-to-edit overlays that work standalone. This specification extends it to enable bidirectional communication with the DatoCMS Studio when the preview is embedded in an iframe.

## Current Behavior (Standalone Mode)

The library already provides:
- Automatic stega decoding from text content and image alt attributes
- Overlay highlighting on hover
- Opening edit URLs in new tabs on click
- DOM mutation observation for dynamic content
- Manual edit URLs via `data-datocms-edit-url` attribute
- Edit groups via `data-datocms-edit-group` attribute

**Key Implementation Details:**
- Stega-decoded URLs are stamped as `data-datocms-stega` attributes
- Overlays find editable elements via `data-datocms-stega` or `data-datocms-edit-url`
- When clicked, edit URLs open in a new browser tab

## New Behavior (Studio Integration Mode)

When the preview runs inside the DatoCMS Studio iframe, the library will:
1. Detect it's in an iframe
2. Establish a Penpal connection with the parent window
3. Send page metadata (title, item IDs) to the studio
4. When overlays are clicked, send `openItem` messages instead of opening new tabs
5. Respond to studio commands (navigate, toggle overlays)

## Architecture

```
┌─────────────────────────────────────┐
│     DatoCMS Studio (Parent)         │
│                                     │
│  ┌───────────────────────────────┐ │
│  │  Preview IFrame               │ │
│  │  @datocms/content-link        │ │
│  │  createOverlaysController()   │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘
         ↕ Penpal postMessage
```

## Implementation Requirements

### 1. Dependencies

Add Penpal to `package.json`:
```json
{
  "dependencies": {
    "@vercel/stega": "^0.1.2",
    "penpal": "^6.2.2"
  }
}
```

### 2. API Design

The existing API remains unchanged. `createOverlaysController()` automatically handles both modes:

```typescript
import { createOverlaysController } from '@datocms/content-link';

// Works both standalone AND in studio iframe
const controller = createOverlaysController({
  root?: ParentNode,
  overlayStyle?: OverlayStyle,

  // New: Optional studio callbacks
  onNavigateTo?: (url: string) => void,
});

// Existing methods (unchanged)
controller.enable();
controller.disable();
controller.toggle();
controller.isEnabled();
controller.isDisposed();
controller.refresh();
controller.dispose();

// New: Manual method for router integration
controller.setCurrentUrl(url: string);
```

**Minimal API principle:**
- No nested options objects
- No separate connection API
- No manual studio methods exposed (auto-handled internally)
- Only one new callback: `onNavigateTo` (essential for client-side routing)
- Only one new method: `setCurrentUrl` (essential for manual navigation tracking)

### 3. Studio Communication Protocol

#### Website → Studio (Child to Parent)

The library will call these Penpal methods automatically:

**`setPageTitle({ title: string })`**
- Called automatically on enable with `document.title`
- Can be called again when title changes

**`setPageItems({ itemIds: string[] })`**
- Called automatically after each stamp pass
- Extracts item IDs from all stega-decoded URLs on the page
- Item ID extraction from URL format: `.../items/{itemId}/edit` → `{itemId}`

**`setCurrentUrl({ url: string })`**
- Called when user calls `controller.setCurrentUrl(url)`
- Library does NOT auto-detect navigation (framework-agnostic)

**`openItem({ itemId: string })`**
- Called when overlay is clicked (replaces opening new tab)
- Item ID extracted from the edit URL

**`setOverlaysEnabled({ enabled: boolean })`**
- Called when `controller.enable()` or `controller.disable()` is called
- Keeps studio's toggle button in sync

#### Studio → Website (Parent to Child)

The library will expose these Penpal methods for the studio to call:

**`navigateTo({ url: string })`**
- Triggers the `onNavigateTo` callback if provided
- No default behavior (framework-specific)

**`setOverlaysEnabled({ enabled: boolean })`**
- Calls `controller.enable()` or `controller.disable()`
- Keeps local state in sync with studio

**`highlightItem({ itemId: string })`**
- Find all elements with `data-datocms-stega` or `data-datocms-edit-url` containing this item ID
- Use existing overlay system to highlight them (same style as hover)
- Scroll first matching element into view

**`clearHighlight()`**
- Clear all highlights applied by `highlightItem()`

### 4. Item ID Extraction

**From Stega URLs:**
- Format: `https://{domain}/editor/item_types/{typeId}/items/{itemId}/edit`
- Extract: Use regex to capture `{itemId}` from the URL path
- Item IDs can be: numeric strings (`"123456"`) or base64-encoded UUIDs

**Extraction function:**
```typescript
function extractItemId(editUrl: string): string | null {
  const match = editUrl.match(/\/items\/([^\/]+)\/edit/);
  return match ? match[1] : null;
}
```

### 5. Iframe Detection

The library should only attempt Penpal connection when:
```typescript
function isInIframe(): boolean {
  return typeof window !== 'undefined' && window.parent !== window;
}
```

### 6. Connection Lifecycle

**Initialization (in BrowserController constructor or enable):**
1. Check if in iframe
2. If yes, attempt Penpal `connectToParent()` with 20s timeout
3. If connection succeeds, store connection object
4. If fails/timeout, silently continue in standalone mode

**During Operation:**
- When stamps are applied, extract all item IDs and call `setPageItems()`
- When overlay is clicked:
  - If connected to studio: call `openItem()` and prevent default
  - If standalone: open URL in new tab (current behavior)
- When enable/disable is called: notify studio via `setOverlaysEnabled()`

**Cleanup (dispose):**
- Call `connection.destroy()` if connected
- Clear all Penpal references

### 7. TypeScript Types

**Update `CreateOverlaysControllerOptions`:**
```typescript
export type CreateOverlaysControllerOptions = {
  root?: ParentNode;
  overlayStyle?: OverlayStyle;

  // New: Studio integration
  onNavigateTo?: (url: string) => void;
};
```

**Update `OverlaysController`:**
```typescript
export type OverlaysController = {
  enable(): void;
  disable(): void;
  toggle(): void;
  dispose(): void;
  isEnabled(): boolean;
  isDisposed(): boolean;
  refresh(root?: ParentNode): void;

  // New: Manual navigation tracking
  setCurrentUrl(url: string): void;
};
```

**Internal types (not exported):**
```typescript
type StudioConnection = {
  setPageTitle(payload: { title: string }): Promise<void>;
  setPageItems(payload: { itemIds: string[] }): Promise<void>;
  setCurrentUrl(payload: { url: string }): Promise<void>;
  openItem(payload: { itemId: string }): Promise<void>;
  setOverlaysEnabled(payload: { enabled: boolean }): Promise<void>;
  destroy(): void;
};

type StudioMethods = {
  navigateTo(payload: { url: string }): void;
  setOverlaysEnabled(payload: { enabled: boolean }): void;
  highlightItem(payload: { itemId: string }): void;
  clearHighlight(): void;
};
```

## Implementation Checklist

### Phase 1: Connection Setup
- [ ] Add Penpal dependency
- [ ] Create iframe detection utility
- [ ] Implement Penpal connection in `BrowserController`
- [ ] Handle connection timeout/failure gracefully

### Phase 2: Item ID Management
- [ ] Implement `extractItemId()` utility
- [ ] Collect all item IDs during stamp passes
- [ ] Call `setPageItems()` after stamping
- [ ] Handle duplicate item IDs

### Phase 3: Overlay Click Integration
- [ ] Detect if connected to studio in overlay click handler
- [ ] Call `openItem()` instead of `window.open()` when connected
- [ ] Extract item ID from edit URL before sending

### Phase 4: Studio Methods
- [ ] Expose `navigateTo()` method via Penpal
- [ ] Expose `setOverlaysEnabled()` method via Penpal
- [ ] Implement `highlightItem()` using existing overlay system
- [ ] Implement `clearHighlight()`

### Phase 5: API Extensions
- [ ] Add `onNavigateTo` callback to options
- [ ] Add `setCurrentUrl()` method to controller
- [ ] Call `setPageTitle()` on enable
- [ ] Sync `setOverlaysEnabled()` on enable/disable

### Phase 6: Testing
- [ ] Test standalone mode (no iframe)
- [ ] Test iframe without Penpal parent (timeout)
- [ ] Test full studio integration
- [ ] Test item ID extraction from various URL formats
- [ ] Test highlight/clear highlight

## Error Handling

### Connection Errors
- **Not in iframe**: Don't attempt connection, continue in standalone mode
- **Connection timeout**: Log warning (debug mode only), continue in standalone mode
- **Parent disconnects**: Gracefully handle, fall back to standalone behavior

### Runtime Errors
- **Failed to extract item ID**: Log warning, skip that URL
- **Invalid edit URL format**: Log warning, use URL as-is
- **Penpal method call fails**: Log error (debug mode only), continue

## Example Usage

### Simple (No Changes Required)
```typescript
import { createOverlaysController } from '@datocms/content-link';

const controller = createOverlaysController();
controller.enable();
```

### With Next.js Router
```typescript
import { createOverlaysController } from '@datocms/content-link';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export function useVisualEditing() {
  const router = useRouter();
  const controller = createOverlaysController({
    onNavigateTo: (url) => router.push(url),
  });

  useEffect(() => {
    controller.enable();
    return () => controller.dispose();
  }, []);

  useEffect(() => {
    controller.setCurrentUrl(router.asPath);
  }, [router.asPath]);

  return controller;
}
```

### With React Router
```typescript
import { createOverlaysController } from '@datocms/content-link';
import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';

export function useVisualEditing() {
  const navigate = useNavigate();
  const location = useLocation();
  const controller = createOverlaysController({
    onNavigateTo: (url) => navigate(url),
  });

  useEffect(() => {
    controller.enable();
    return () => controller.dispose();
  }, []);

  useEffect(() => {
    controller.setCurrentUrl(location.pathname);
  }, [location.pathname]);

  return controller;
}
```

## Notes

- The library must work perfectly in both standalone and studio modes
- Studio integration is transparent - users don't need to know about Penpal
- All Penpal communication happens internally in `BrowserController`
- The only user-facing changes are: `onNavigateTo` callback and `setCurrentUrl()` method
- Existing overlay behavior remains unchanged in standalone mode
- No breaking changes to the existing API
