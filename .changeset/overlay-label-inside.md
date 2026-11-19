---
"@datocms/content-link": patch
---

Draw the "Open in DatoCMS" label in the top-right corner of the overlay, not above it. Before, the overlay went away when the pointer moved onto the label, and a menu that opens on hover closed. Now the pointer stays on the element. The label is only shown when the element has room for it: it is hidden when it uses more than half of the width of the overlay, or when it is on the text of the element or near it.
