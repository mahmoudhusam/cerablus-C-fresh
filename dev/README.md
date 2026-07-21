# dev/

Development fixtures. **Not part of the deployed site** — nothing under this
folder is fetched, linked, or referenced by `index.html`, `menu.html`, `app.js`
or `styles.css` at runtime.

## `sheet-fixture.csv`

A stand-in for the client's published Google Sheet, written to exercise every
branch of `parseSheetCsv()` in `app.js` without needing a network or a live
sheet. It deliberately contains:

| Case | Where |
| --- | --- |
| UTF-8 BOM | very first byte |
| Reordered columns | `اسم الصنف` before `القسم` |
| An unknown extra column | `ملاحظات المالك` — must be ignored |
| Mixed line endings | CRLF in the top half, LF in the bottom |
| Quoted field containing a comma | إسبريسو's description |
| Escaped `""` quote inside a quoted field | آيس كوفي's description |
| Arabic-Indic digits | `٨` (قهوة عربية), `٦` (مناقيش زعتر) |
| Currency symbol in a price | `12 ₪` (إسبريسو) |
| Thousands separator | `1,200` and `1,500` (آيس كوفي) |
| Mixed boolean spellings | `نعم` / `yes` / `1` / `true` / `✓` / `لا` / `no` / `0` / `false` |
| Blank booleans | ليمون بالنعنع — `متوفر` defaults true, the rest false |
| Variants | كابتشينو, two rows (صغير / كبير) |
| Size contradiction | كنافة, one sized row and one unsized row |
| Malformed price | صنف خربان — row skipped |
| Missing name | one row in حلويات — row skipped |
| Blank row mid-file | after the كابتشينو rows |
| Trailing blank lines | end of file |
| Path-traversal image | براوني — `../../etc/passwd`, must be rejected |
| Absolute-URL image | تشيز كيك — must be rejected |
| Same name in two categories | براوني in حلويات and in مأكولات خفيفة |

To parse it by hand in a browser console on `menu.html`:

```js
fetch("dev/sheet-fixture.csv").then(r => r.text()).then(t => console.log(parseSheetCsv(t)));
```
