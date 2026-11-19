---
'@datocms/content-link': patch
---

Make the overlays fast on pages with many editable elements.

- The library no longer examines the full document again each time it adds or removes one of its own overlays.
- After a DOM change, the library only examines the added nodes, not their parent.
- The overlays read the layout of all the elements first and write the styles after. Thus the browser computes the layout one time and not one time for each overlay.
- Overlays for elements out of the viewport stay hidden.
