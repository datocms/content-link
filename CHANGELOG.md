# @datocms/content-link

## 0.3.24

### Patch Changes

- bc43813: Make the overlays fast on pages with many editable elements.
  
  - The library no longer examines the full document again each time it adds or removes one of its own overlays.
  - After a DOM change, the library only examines the added nodes, not their parent.
  - The overlays read the layout of all the elements first and write the styles after. Thus the browser computes the layout one time and not one time for each overlay.
  - Overlays for elements out of the viewport stay hidden.
- 6df69f4: Make the stamping passes and the flash of all the overlays faster, and remove stale stamps.
  
  - The library keeps the result of each stega decode operation. On a page with 1,300 editable elements, the first pass is three times faster, and so is each pass after a change of the DOM.
  - The library does not examine an element two times when the element and one of its ancestors are added together.
  - The flash of all the overlays only makes overlays for the elements in the viewport or near it. The overlays come in one after the other when fewer than 50 are shown, and the sequence starts from the elements in the viewport. Before, the user at the end of a long page waited for the overlays of the elements above.
  - When an element has no stega data after a change, the library removes its edit URL. Before, the element stayed clickable and opened the old record. This does not apply when `stripStega` is on.
- 8df1fad: Draw the "Open in DatoCMS" label in the top-right corner of the overlay, not above it. Before, the overlay went away when the pointer moved onto the label, and a menu that opens on hover closed. Now the pointer stays on the element. The label is only shown when the element has room for it: it is hidden when it uses more than half of the width of the overlay, or when it is on the text of the element or near it.
