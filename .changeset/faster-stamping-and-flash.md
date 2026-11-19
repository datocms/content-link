---
'@datocms/content-link': patch
---

Make the stamping passes and the flash of all the overlays faster, and remove stale stamps.

- The library keeps the result of each stega decode operation. On a page with 1,300 editable elements, the first pass is three times faster, and so is each pass after a change of the DOM.
- The library does not examine an element two times when the element and one of its ancestors are added together.
- The flash of all the overlays only makes overlays for the elements in the viewport or near it. The overlays come in one after the other when fewer than 50 are shown, and the sequence starts from the elements in the viewport. Before, the user at the end of a long page waited for the overlays of the elements above.
- When an element has no stega data after a change, the library removes its edit URL. Before, the element stayed clickable and opened the old record. This does not apply when `stripStega` is on.
