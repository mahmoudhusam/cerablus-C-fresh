# CLAUDE.md — Cerablus Coffee (Production Site)

Context for Claude Code. **Read this before making any change.**

---

## What this is

The production website for **Cerablus Coffee**, a specialty café in Nablus, West Bank.

The client reviewed several design directions and **chose direction C — "العصري"** (bold,
modern, green blocks). That design is the visual law for this project. The file
`cerablus-C-fresh.html` is the approved landing-page mockup and the starting point.

Two pages:
1. **Landing** (`index.html`) — brand hero, highlights, contact/hours, links into the menu.
2. **Menu** (`menu.html`) — the real product: browse ~113 items, search, add to cart, send
   the order to the café over WhatsApp.

---

## Build order (work ONE step at a time)

The user drives this step by step. **Do not jump ahead or scaffold future steps.**

- [x] **Step 0** — Approved design C mockup in the folder
- [ ] **Step 1** — Project scaffold: split the mockup into `index.html` + `styles.css`,
      extract design tokens, extract the logo to `/assets/`, create `data/menu.js`
- [ ] **Step 2** — Build `menu.html` shell in design C's visual language
- [ ] **Step 3** — Menu engine: render items by category, live search, category chips
- [ ] **Step 4** — Cart: add to cart, cart drawer, qty steppers, running total
- [ ] **Step 5** — WhatsApp order builder
- [ ] **Step 6** — العروض (offers) feature
- [ ] **Step 7** — Google Sheet live loading + fallback
- [ ] **Step 8** — Real content, photos, real WhatsApp number, deploy

---

## Tech constraints (non-negotiable)

- **Plain static HTML/CSS/JS. No build step, no framework, no bundler, no npm.**
  Every page must open directly in a browser by double-clicking it.
- **Vanilla JS only.** No jQuery, no React, no dependencies. Google Fonts via `<link>` is fine.
- **Mobile-first.** Most visitors arrive from a WhatsApp link on a phone. Design and test
  for a ~380px viewport first.
- Deploys to Vercel as a static site with zero configuration.
- **No backend, no database, no accounts, no online payment, no mobile app.**

---

## Design language — direction C ("العصري")

Bold, modern, energetic. White/light base with **vivid green blocks** as the structural
device, big geometric type, generous rounded corners, gold used sparingly as the accent.

Rules:
- **Match the existing mockup.** Do not redesign, re-theme, or "improve" the look.
  New pages and components must feel like they came from the same designer.
- Reuse the mockup's existing components and rhythm: the pill/chip row, rounded cards
  with a tinted image zone, the green CTA buttons, the dark green footer band.
- Arabic-first, **RTL**, with occasional English as accent/label text.
- Motion is subtle: gentle hover lifts, scroll reveals via `IntersectionObserver`.
  Always respect `prefers-reduced-motion`.

### Brand

- **Colors** — define once in a single `:root` block, never hardcode hex elsewhere:
  - `--pine: #0c3d26` (primary dark green)
  - `--green: #006639` (secondary / action green)
  - `--gold: #cda05f` (accent — sparing)
  - `--mint: #e9f4ee` (light tint)
  - `--white: #ffffff` (page base)
  - Reserve WhatsApp green `#25D366` **only** for order actions.
- **Logo** — inline SVG in the mockup; extract to `/assets/cerablus-mark.svg` (icon) and
  `/assets/cerablus-logo.svg` (full lockup). Both use `fill="currentColor"` so they
  recolor via CSS `color`.
- **Fonts** — Cairo / Sora for Latin + display, **IBM Plex Sans Arabic** for Arabic body
  (as already loaded in the mockup).

---

## Data model

Menu content lives in `data/menu.js` as `window.MENU`. **This is the only file that changes
when content changes.** Never hardcode menu items into HTML.

```js
window.MENU = {
  currency: "₪",

  categories: [
    { id: "hot",    name: "مشروبات ساخنة" },
    { id: "cold",   name: "مشروبات باردة" },
    { id: "sweets", name: "حلويات" },
    { id: "food",   name: "مأكولات خفيفة" }
  ],

  items: [
    // single price
    { id: "arabic-coffee", cat: "hot", name: "قهوة عربية", desc: "قهوة عربية أصيلة بالهيل.",
      price: 8, image: "assets/menu/arabic-coffee.jpg",
      available: true, featured: true, offer: false, oldPrice: null },

    // multi-price (size / portion)
    { id: "cappuccino", cat: "hot", name: "كابتشينو", desc: "إسبريسو مع رغوة حليب كثيفة.",
      variants: [ { label: "صغير", price: 10 }, { label: "كبير", price: 13 } ],
      image: "assets/menu/cappuccino.jpg",
      available: true, featured: false, offer: false, oldPrice: null },

    // on offer
    { id: "iced-coffee", cat: "cold", name: "آيس كوفي", desc: "قهوة مثلجة منعشة.",
      price: 12, oldPrice: 15, offer: true, image: "assets/menu/iced-coffee.jpg",
      available: true, featured: true }
  ]
};
```

Field rules:
- An item has **either** `price` **or** `variants` — never both.
- `image: ""` or missing → render the design's placeholder tile gracefully. Never break layout.
- `available: false` → show "غير متوفر", visually dim the card, disable adding to cart.
- `featured: true` → "مميّز" badge; powers the **الأكثر طلبًا** filter.
- `offer: true` → "عرض" badge; powers the **العروض** filter.
- `oldPrice` → render struck-through beside the current price. Only meaningful with `offer: true`.

---

## العروض (offers) — Step 6

The menu has a filter chip row. In the mockup it reads: الأكثر طلبًا · ساخنة · باردة · حلويات.
Add **العروض** as a chip beside الأكثر طلبًا.

- Chip filters to items where `offer === true`.
- Offer cards get a "عرض" badge, styled distinctly from the gold "مميّز" badge so the two
  are never confused.
- `oldPrice` renders struck-through next to the live price.
- **Critical:** the cart, the running total, and the WhatsApp message must all use the
  **current (offer) price** — never `oldPrice`. Verify this explicitly.

---

## WhatsApp ordering

The entire order flow ends in a pre-filled WhatsApp message. There is no checkout.

- Phone number lives in **one** config constant at the top of `app.js`:
  `const CONFIG = { PHONE: "970590000000" };` — digits only, no `+`, no spaces.
  This is a **placeholder**; the real number is added at Step 8.
- Cart line key = `itemId + "::" + variantLabel` (so a large and a small cappuccino are
  separate lines).
- The order button opens `https://wa.me/<PHONE>?text=<encodeURIComponent(message)>`.
- Message format:

```
مرحبا 👋 حابب أعمل هذا الطلب:

• كابتشينو (كبير) ×2 — 26 ₪
• كنافة ×1 — 18 ₪

المجموع: 44 ₪

الاسم:
العنوان:
```

- **No-JS fallback:** order links ship with a hardcoded `href="https://wa.me/<PHONE>"`
  in the HTML, which JS then upgrades with the pre-filled text. With JS disabled the
  link must still open a chat.

---

## Google Sheet live content — Step 7

The client updates the menu by editing a **Google Sheet**, published to the web as CSV.
This is what "منيو قابل للتحديث" means in the contract — the client must never need us
to change a price.

How it works:
1. `data/menu.js` ships with a **baked-in copy** of the menu. This is the fallback and
   guarantees the site always renders.
2. On load, `app.js` fetches the published CSV URL (one constant, next to `CONFIG.PHONE`).
3. If the fetch succeeds and parses to a sane result, use the sheet data.
4. If the fetch fails, times out (~5s), returns nothing, or yields fewer than a sane
   minimum of valid rows → **silently fall back to the baked-in data.** The visitor must
   never see an error or an empty menu.

Parsing rules — the sheet is filled by a non-technical person, so be defensive:
- Sheet columns (Arabic headers, matching the client intake template):
  `القسم · اسم الصنف · الوصف · الحجم / النوع · السعر · اسم ملف الصورة · متوفر · مميّز · عرض · السعر القديم`
- CSV parsing must handle quoted fields containing commas.
- **Variants:** an item with sizes appears as multiple rows sharing the same item name,
  each with a different `الحجم / النوع`. Group rows by item name into a `variants` array.
  A blank size column means a single-price item.
- `متوفر` / `مميّز` / `عرض` accept نعم/لا (also tolerate yes/no, true/false, 1/0).
- Skip malformed rows individually (missing name, unparseable price) — never throw and
  never let one bad row take down the whole menu.
- Trim whitespace everywhere. Ignore fully blank rows.
- Derive a stable `id` per item from its name.

---

## File structure

```
/index.html          landing page (design C)
/menu.html           menu app
/styles.css          shared styles — ALL design tokens in one :root block
/app.js              engine: render, search, cart, WhatsApp, sheet loading
/data/menu.js        window.MENU — the only file that changes with content
/assets/             cerablus-mark.svg, cerablus-logo.svg
/assets/menu/        item photos (added at Step 8)
/CLAUDE.md           this file
```

---

## Conventions

- **Never** apply `letter-spacing` or `text-transform: uppercase` to Arabic text —
  it breaks letter joining. (Latin-only text is fine.)
- All colors, spacing, radii, and font stacks as CSS variables in one `:root` block.
- Keyboard accessible: real `<button>` / `<a>` elements, visible `:focus-visible`,
  proper `aria-*` on the cart drawer, chips, and controls.
- Respect `prefers-reduced-motion`.
- **No `localStorage` / `sessionStorage`.** The cart is intentionally in-memory only —
  it resets on reload, and that is correct.
- Comment the code clearly, in English. Prefer readable over clever.
- Prices are numbers in the data; format for display in one place.

---

## Do NOT

- Add a backend, database, user accounts, or payment.
- Introduce a build step, framework, or npm dependency.
- Hardcode menu items into HTML — they belong in `data/menu.js`.
- Redesign or re-theme direction C, or change brand colors or the logo.
- Add stock photos on your own initiative — real photos arrive at Step 8 from the client.
- Invent menu items, prices, or Arabic copy for production. Sample data is for
  development only and must be clearly marked as such.
- Work ahead of the current step.
