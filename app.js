/* ==========================================================================
   Cerablus Coffee — menu engine
   Rendering, search, cart and WhatsApp ordering land here in later steps.
   ========================================================================== */

const CONFIG = {
  // Placeholder — the café's real number lands at Step 8. Digits only, no +.
  PHONE: "970590000000",

  /* The client's Google Sheet, published to the web as CSV. Empty until Step 8:
     while it is empty the site never touches the network and simply renders the
     copy baked into data/menu.js. */
  SHEET_CSV_URL: "",

  // Give up on a slow sheet rather than leaving the menu stale-but-loading.
  SHEET_TIMEOUT_MS: 5000,

  /* A published sheet that parses to almost nothing is far more likely to be
     broken than to be the real menu, so treat it as a failure and keep the
     baked-in copy. */
  SHEET_MIN_ITEMS: 3
};

/* --------------------------------------------------------------------------
   Missing image photos
   --------------------------------------------------------------------------
   Menu content will eventually come from a Google Sheet edited by a
   non-technical person, so image filenames will sometimes be missing, renamed
   or misspelled. Hiding a failed image reveals the branded placeholder styled
   in .card .top::after, so a customer never sees a broken-image icon.
   -------------------------------------------------------------------------- */

const MISSING_IMAGE_CLASS = "is-missing";

/** Hide a single image that could not be loaded. */
function markImageMissing(img) {
  if (img instanceof HTMLImageElement) img.classList.add(MISSING_IMAGE_CLASS);
}

// Load errors do not bubble, so listen during the capture phase to catch them
// from any image on the page — including lazy ones that load much later.
window.addEventListener(
  "error",
  (event) => {
    if (event.target instanceof HTMLImageElement) markImageMissing(event.target);
  },
  true
);

/**
 * Catch images that already failed before this script ran. A finished image
 * with zero intrinsic width is one the browser could not decode.
 */
function sweepBrokenImages() {
  document.querySelectorAll("img").forEach((img) => {
    if (img.complete && img.naturalWidth === 0) markImageMissing(img);
  });
}

/* --------------------------------------------------------------------------
   Arabic-aware text normalization
   --------------------------------------------------------------------------
   Real customers type without diacritics and spell alef/ya/ta-marbuta however
   they please ("قهوه" for "قهوة"). Both the query and the searched text run
   through the same normalizer so those spellings all collapse to one form.
   -------------------------------------------------------------------------- */

// Harakat, the dagger alef and tatweel. Escapes, not literals: these are
// invisible or bidi-reordering characters that no editor renders reliably.
const TASHKEEL_AND_TATWEEL = /[\u064B-\u065F\u0670\u0640]/g;

/** Fold an Arabic/Latin string down to a spelling-insensitive search key. */
function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(TASHKEEL_AND_TATWEEL, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

/* --------------------------------------------------------------------------
   Menu model
   -------------------------------------------------------------------------- */

// Current view state. Filtering is derived from this on every render.
const state = {
  cat: "all",   // "all" | "featured" | a category id
  query: ""
};

/* The menu, read once in init() and held here. Building it normalizes every
   item's search key, so re-reading it per render would do that work on every
   keystroke and defeat the cache. Step 7 reassigns this after the Google Sheet
   loads and calls render() again. */
let menu = null;

/**
 * Put a raw menu object — from data/menu.js or from the sheet parser — into the
 * shape the renderer wants. Both sources go through here, so the sheet can
 * never produce a menu the renderer treats differently.
 */
function decorateMenu(raw) {
  const source = raw || {};
  const items = Array.isArray(source.items) ? source.items : [];
  return {
    currency: source.currency || "₪",
    categories: Array.isArray(source.categories) ? source.categories : [],
    // Cache the search key once instead of normalizing on every keystroke.
    items: items.map((item) => ({
      ...item,
      searchKey: normalize(`${item.name || ""} ${item.desc || ""}`)
    }))
  };
}

/** The baked-in menu — the fallback that guarantees the page always renders. */
function readMenu() {
  return decorateMenu(window.MENU);
}

/** Prices for an item, whether it is single-price or has variants. */
function variantsOf(item) {
  return Array.isArray(item.variants) && item.variants.length
    ? item.variants
    : null;
}

/** Format a number for display. One place, so currency never drifts. */
function formatPrice(value, currency) {
  return `${value} ${currency}`;
}

/* --------------------------------------------------------------------------
   Filtering
   -------------------------------------------------------------------------- */

/* Chips that filter on an item flag instead of a category id, mapped to the
   flag they test. Their results span categories, which is also what decides
   whether category headings are worth showing. Adding a flag chip means adding
   a button in menu.html and one entry here — nothing else. */
const FLAG_CHIPS = {
  featured: "featured",
  offers: "offer"
};

/** True for chips whose results are drawn from more than one category. */
function isFlagChip(cat) {
  return Object.prototype.hasOwnProperty.call(FLAG_CHIPS, cat);
}

/**
 * Apply the active chip and the search box together — both constraints always
 * hold, so searching inside a category narrows rather than resets.
 */
function filterItems() {
  const query = normalize(state.query);
  const flag = FLAG_CHIPS[state.cat];

  return menu.items.filter((item) => {
    if (flag) {
      if (item[flag] !== true) return false;
    } else if (state.cat !== "all") {
      if (item.cat !== state.cat) return false;
    }
    if (query && !item.searchKey.includes(query)) return false;
    return true;
  });
}

/* --------------------------------------------------------------------------
   Rendering
   --------------------------------------------------------------------------
   Nodes are built with createElement/textContent rather than innerHTML: menu
   text will eventually come from a Google Sheet edited by the client, and
   textContent makes any markup in it inert by construction.
   -------------------------------------------------------------------------- */

/**
 * The one badge a card gets, in strict priority order:
 *
 *   1. غير متوفر — the most actionable fact; nothing else matters if you
 *      cannot order it.
 *   2. عرض       — an offer the customer can act on right now.
 *   3. مميّز      — nice to know, and the one worth losing.
 *
 * Kept as a single ordered decision rather than stacked conditions, so the
 * precedence is legible in one place and cannot drift.
 */
function badgeFor(item) {
  if (item.available === false) return { className: "tag-out", text: "غير متوفر" };
  if (item.offer === true) return { className: "tag-offer", text: "عرض" };
  if (item.featured === true) return { className: "fav", text: "مميّز" };
  return null;
}

/**
 * The old price to strike through beside the live one, or null for "render
 * nothing extra".
 *
 * Defensive on purpose: from Step 7 this field is typed into a spreadsheet by a
 * non-technical person, so it arrives missing, blank, as a string, or as a
 * number that makes no sense next to the live price. Number() handles the
 * numeric-string case; everything else falls through to null silently, because
 * a customer must never see a warning and a bad cell must never break a card.
 */
function oldPriceFor(item, livePrice) {
  if (item.offer !== true) return null;

  const previous = Number(item.oldPrice);
  if (!Number.isFinite(previous) || !Number.isFinite(livePrice)) return null;

  // An "old" price at or below what you pay today is not a discount.
  return previous > livePrice ? previous : null;
}

/** The image zone: a real photo when we have one, the branded tile otherwise. */
function buildImageZone(item) {
  const top = document.createElement("div");
  top.className = "top";

  const src = typeof item.image === "string" ? item.image.trim() : "";
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = item.name || "";
    // setAttribute, not the IDL properties: a filter re-render can create these
    // before layout, and the attribute form is what every engine honours.
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
    top.append(img);
  }

  // Exactly one badge; they all occupy the same corner. See badgeFor().
  const badge = badgeFor(item);
  if (badge) {
    const tag = document.createElement("span");
    tag.className = badge.className;
    tag.textContent = badge.text;
    top.append(tag);
  }

  return top;
}

/**
 * Size pills for a multi-price item. Selecting one updates this card's price
 * and reports the choice back through onSelect, so the card's add button knows
 * which variant is live without having to read it back out of the DOM.
 */
function buildSizePills(variants, priceEl, currency, onSelect) {
  const row = document.createElement("div");
  row.className = "sizes";

  variants.forEach((variant, index) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = index === 0 ? "size is-active" : "size";
    pill.textContent = variant.label ?? "";
    pill.setAttribute("aria-pressed", index === 0 ? "true" : "false");
    pill.dataset.price = String(variant.price);

    pill.addEventListener("click", () => {
      row.querySelectorAll(".size").forEach((other) => {
        other.classList.remove("is-active");
        other.setAttribute("aria-pressed", "false");
      });
      pill.classList.add("is-active");
      pill.setAttribute("aria-pressed", "true");
      priceEl.textContent = formatPrice(variant.price, currency);
      onSelect(variant);
    });

    row.append(pill);
  });

  return row;
}

/** One menu card, reusing the components styled on the landing page. */
function buildCard(item, currency) {
  const outOfStock = item.available === false;

  const card = document.createElement("article");
  card.className = outOfStock ? "card is-out" : "card";
  card.dataset.id = item.id || "";

  card.append(buildImageZone(item));

  const body = document.createElement("div");
  body.className = "b";

  const title = document.createElement("h3");
  title.textContent = item.name || "";
  body.append(title);

  const desc = document.createElement("p");
  desc.textContent = item.desc || "";
  body.append(desc);

  // The price element is created before the pills so they can drive it. The
  // wrapper keeps the live price and any struck-through old price together as
  // one unit inside the flex row.
  const priceWrap = document.createElement("div");
  priceWrap.className = "price-wrap";

  const price = document.createElement("span");
  price.className = "price";
  priceWrap.append(price);

  // The variant this card will add. Size pills reassign it; a single-price item
  // leaves it null and the add button falls back to item.price.
  const variants = variantsOf(item);
  let selected = null;

  if (variants) {
    selected = variants[0];
    price.textContent = formatPrice(selected.price, currency);
    body.append(
      buildSizePills(variants, price, currency, (variant) => {
        selected = variant;
      })
    );
  } else {
    price.textContent = formatPrice(item.price, currency);
  }

  /* Struck-through old price.
     ------------------------------------------------------------------------
     VARIANTS + OFFERS: skipped entirely for an item with sizes.
     The data model carries one oldPrice per item, but a multi-size item has
     several live prices, and there is no way to tell which one that single
     number was the "before" of. Pairing it with whichever pill happens to be
     selected would misstate the discount every time it is not that size —
     showing "16 ₪" struck beside a 10 ₪ small implies a saving the café never
     offered. So a multi-size item still gets its عرض badge, and simply shows
     no strikethrough. If per-size offers are ever needed, the sheet can carry
     them as separate rows with their own oldPrice. */
  if (!variants) {
    const previous = oldPriceFor(item, Number(item.price));
    if (previous !== null) {
      const del = document.createElement("del");
      del.className = "price-old";

      // <del> alone announces only "deletion"; name what the number is.
      const label = document.createElement("span");
      label.className = "sr-only";
      label.textContent = "السعر القديم ";
      del.append(label);

      // Same formatPrice() as everywhere else — one formatting path.
      del.append(document.createTextNode(formatPrice(previous, currency)));
      priceWrap.append(del);
    }
  }

  const row = document.createElement("div");
  row.className = "r";
  row.append(priceWrap);

  const add = document.createElement("button");
  add.type = "button";
  add.className = "add";
  if (outOfStock) {
    // A disabled button fires no click, so an unavailable item stays unaddable
    // even though the handler below is attached to every card the same way.
    add.disabled = true;
    add.textContent = "غير متوفر";
  } else {
    add.textContent = "أضف +";
    add.addEventListener("click", () => {
      addToCart(item, selected);
      flashAdded(add);
    });
  }
  row.append(add);

  body.append(row);
  card.append(body);
  return card;
}

/** A category block: styled heading (optional) plus its grid of cards. */
function buildCategorySection(category, items, currency, showHeading) {
  const section = document.createElement("section");
  section.className = "cat";
  section.id = `cat-${category.id}`;
  section.setAttribute("aria-label", category.name);

  if (showHeading) {
    const head = document.createElement("h2");
    head.className = "cat-head";
    head.append(document.createTextNode(`${category.name} `));

    const count = document.createElement("span");
    count.className = "count";
    count.textContent = String(items.length);
    head.append(count);

    section.append(head);
  }

  const grid = document.createElement("div");
  grid.className = "menu-grid";
  items.forEach((item) => grid.append(buildCard(item, currency)));
  section.append(grid);

  return section;
}

/** Nothing matched: an on-brand message instead of a blank page. */
function buildEmptyState() {
  const box = document.createElement("div");
  box.className = "empty";

  const glyph = document.createElement("span");
  glyph.className = "empty-mark";
  glyph.setAttribute("aria-hidden", "true");
  box.append(glyph);

  const title = document.createElement("h2");
  title.textContent = "ما في نتائج";
  box.append(title);

  const hint = document.createElement("p");
  hint.textContent = "جرّب كلمة تانية، أو اختر قسم من فوق.";
  box.append(hint);

  return box;
}

/**
 * Render the whole list for the current state. Everything is assembled in a
 * DocumentFragment and appended once, so 113 cards cost a single layout pass
 * even while the customer is typing.
 */
function render() {
  const body = document.getElementById("menuBody");
  const status = document.getElementById("resultStatus");
  if (!body || !menu) return;

  const visible = filterItems();
  const fragment = document.createDocumentFragment();

  if (!visible.length) {
    fragment.append(buildEmptyState());
  } else {
    // A single active category chip already names the section, so its heading
    // would just repeat the chip. Headings stay for الكل and for the flag chips
    // (الأكثر طلبًا, العروض), whose results span several categories and so keep
    // the grouping meaningful.
    const showHeadings = state.cat === "all" || isFlagChip(state.cat);

    menu.categories.forEach((category) => {
      const inCategory = visible.filter((item) => item.cat === category.id);
      if (!inCategory.length) return; // skip empty categories entirely
      fragment.append(
        buildCategorySection(category, inCategory, menu.currency, showHeadings)
      );
    });
  }

  body.replaceChildren(fragment);
  if (status) {
    status.textContent = visible.length
      ? `${visible.length} صنف`
      : "ما في نتائج";
  }

  // Freshly rendered photos may already be in the cache and broken, in which
  // case no error event fires for them — sweep so the placeholder still shows.
  sweepBrokenImages();
}

/* ==========================================================================
   CART
   --------------------------------------------------------------------------
   State lives here, entirely independent of the DOM, so searching or changing
   the category chip re-renders the menu without touching the cart. In memory
   only — no localStorage, so it resets on reload. That is intentional.
   ========================================================================== */

/**
 * key -> { id, name, variantLabel, price, qty }
 * A Map because insertion order is stable, which keeps drawer lines from
 * jumping around as quantities change.
 */
const cart = new Map();

/** Line identity: a large and a small cappuccino are different lines. */
function lineKey(id, variantLabel) {
  return `${id}::${variantLabel}`;
}

/** Human label for a line, used in the drawer and by the reader status. */
function lineTitle(line) {
  return line.variantLabel ? `${line.name} (${line.variantLabel})` : line.name;
}

/** Total quantity and money across the whole cart. */
function cartTotals() {
  let count = 0;
  let total = 0;
  cart.forEach((line) => {
    count += line.qty;
    // Skip a malformed price rather than poisoning the whole total with NaN.
    const amount = line.price * line.qty;
    if (Number.isFinite(amount)) total += amount;
  });
  return { count, total };
}

/**
 * Add one of `item` to the cart, at `variant` if the item has sizes.
 *
 * The unit price is captured here, at add time, from the variant or from
 * item.price — both of which are the *live* price. oldPrice (Step 6) is a
 * display-only field and must never reach the cart.
 */
function addToCart(item, variant) {
  if (item.available === false) return; // belt and braces; the button is disabled

  const variantLabel = variant ? String(variant.label ?? "") : "";
  const price = Number(variant ? variant.price : item.price);
  if (!Number.isFinite(price)) return; // a malformed sheet row must not poison the cart

  const key = lineKey(item.id, variantLabel);
  const existing = cart.get(key);

  if (existing) {
    existing.qty += 1;
  } else {
    cart.set(key, { id: item.id, name: item.name || "", variantLabel, price, qty: 1 });
  }

  renderCart();
  announceCart(cart.get(key));
}

/** Move a line's quantity by delta; hitting zero removes the line outright. */
function changeQty(key, delta) {
  const line = cart.get(key);
  if (!line) return;

  line.qty += delta;
  if (line.qty <= 0) {
    cart.delete(key);
    setCartStatus(`تم حذف ${lineTitle(line)} من السلة`);
  } else {
    announceCart(line);
  }
  renderCart();
}

/* --------------------------------------------------------------------------
   WhatsApp order message
   --------------------------------------------------------------------------
   The whole order flow ends in a pre-filled WhatsApp message — there is no
   checkout. The message is built into the link's href rather than assembled in
   a click handler, so it behaves identically for a mouse click, the keyboard,
   a long-press "copy link", and a browser with JS disabled.
   -------------------------------------------------------------------------- */

/* Beyond this many characters some mobile browsers and WhatsApp's own intent
   handler truncate the URL, which would send a half-order. Measured against the
   fully encoded href, since Arabic characters cost six characters each once
   percent-encoded. */
const MAX_ORDER_URL = 1800;

/** "كابتشينو (كبير)" for a variant line, plain name for a single-price one. */
function orderLineName(line) {
  return line.variantLabel ? `${line.name} (${line.variantLabel})` : line.name;
}

/**
 * Build the order message.
 *
 * Two knobs, both only used by the oversized-order fallback below:
 *   compact — drop the per-line amounts, keeping item, variant and quantity.
 *   limit   — list at most this many lines, then say how many were left out.
 *
 * The grand total is always the true total for the whole cart, at every level
 * of degradation, so the café always knows what the order comes to.
 *
 * All money goes through formatPrice(), so this message can never disagree with
 * the drawer about a number. Amounts come from line.price — the price captured
 * when the item was added, which is always the live price and never oldPrice.
 */
function buildOrderMessage(currency, { compact = false, limit = Infinity } = {}) {
  const lines = [];
  let listed = 0;

  cart.forEach((line) => {
    if (listed >= limit) return;
    listed += 1;

    const amount = line.price * line.qty;
    // A malformed price must never reach the café as "NaN ₪" — drop the amount
    // and keep the item, so the order is still actionable.
    const showAmount = !compact && Number.isFinite(amount);
    lines.push(
      showAmount
        ? `• ${orderLineName(line)} ×${line.qty} — ${formatPrice(amount, currency)}`
        : `• ${orderLineName(line)} ×${line.qty}`
    );
  });

  // Never drop items silently: say plainly that the list was shortened.
  const omitted = cart.size - listed;
  if (omitted > 0) lines.push(`• و${omitted} صنف إضافي — التفاصيل بالمحادثة`);

  const { total } = cartTotals();

  return [
    "مرحبا 👋 حابب أعمل هذا الطلب:",
    "",
    ...lines,
    "",
    `المجموع: ${formatPrice(total, currency)}`,
    "",
    "الاسم:",
    "العنوان:"
  ].join("\n");
}

/** The bare chat link — no order attached. Also the empty-cart fallback. */
function plainOrderHref() {
  return `https://wa.me/${CONFIG.PHONE}`;
}

/** wa.me link carrying the message. encodeURIComponent handles Arabic, the
    emoji, ₪ and the newlines (which become %0A and render as line breaks). */
function orderHref(message) {
  return `${plainOrderHref()}?text=${encodeURIComponent(message)}`;
}

/**
 * The href the order button should currently carry.
 *
 * Degrades in three steps, each only reached if the one before it is still too
 * long for MAX_ORDER_URL:
 *   1. the full message
 *   2. compact — same items, no per-line amounts
 *   3. compact and trimmed to the lines that fit, with a closing line stating
 *      how many were left out
 *
 * An empty cart short-circuits to a plain chat link with no text at all.
 */
function currentOrderHref(currency) {
  if (cart.size === 0) return plainOrderHref();

  const full = orderHref(buildOrderMessage(currency));
  if (full.length <= MAX_ORDER_URL) return full;

  let href = orderHref(buildOrderMessage(currency, { compact: true }));
  if (href.length <= MAX_ORDER_URL) return href;

  // Drop one line at a time until it fits. Bounded by the cart size and only
  // recomputed when the cart changes, so the cost is irrelevant in practice.
  for (let limit = cart.size - 1; limit >= 0; limit -= 1) {
    href = orderHref(buildOrderMessage(currency, { compact: true, limit }));
    if (href.length <= MAX_ORDER_URL) break;
  }
  return href;
}

/* --------------------------------------------------------------------------
   Cart rendering
   -------------------------------------------------------------------------- */

/** Update the sr-only live region. Visual users read the drawer itself. */
function setCartStatus(text) {
  const status = document.getElementById("cartStatus");
  if (status) status.textContent = text;
}

function announceCart(line) {
  if (line) setCartStatus(`${lineTitle(line)} — الكمية ${line.qty}`);
}

/** Brief pulse on the add button so a tap has an obvious result. */
function flashAdded(button) {
  button.classList.remove("is-added");
  // Reading offsetWidth restarts the animation when the same button is
  // tapped repeatedly, instead of the class change being coalesced away.
  void button.offsetWidth;
  button.classList.add("is-added");
  window.setTimeout(() => button.classList.remove("is-added"), 400);
}

/** One row in the drawer: title, stepper, line total. */
function buildCartLine(key, line, currency) {
  const row = document.createElement("div");
  row.className = "cart-line";
  row.dataset.key = key;

  const info = document.createElement("div");
  info.className = "cl-info";

  const name = document.createElement("h3");
  name.className = "cl-name";
  name.textContent = line.name;
  info.append(name);

  if (line.variantLabel) {
    const variant = document.createElement("span");
    variant.className = "cl-var";
    variant.textContent = line.variantLabel;
    info.append(variant);
  }

  const unit = document.createElement("span");
  unit.className = "cl-unit";
  unit.textContent = formatPrice(line.price, currency);
  info.append(unit);

  row.append(info);

  const side = document.createElement("div");
  side.className = "cl-side";

  const stepper = document.createElement("div");
  stepper.className = "qty";

  const title = lineTitle(line);
  // The − at qty 1 removes the line, so its label says so rather than "إنقاص".
  const minus = document.createElement("button");
  minus.type = "button";
  minus.className = "q";
  minus.dataset.delta = "-1";
  minus.textContent = "−";
  minus.setAttribute("aria-label", line.qty === 1 ? `حذف ${title}` : `إنقاص ${title}`);

  const count = document.createElement("span");
  count.className = "q-n";
  count.textContent = String(line.qty);

  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "q";
  plus.dataset.delta = "1";
  plus.textContent = "+";
  plus.setAttribute("aria-label", `زيادة ${title}`);

  stepper.append(minus, count, plus);
  side.append(stepper);

  const lineTotal = document.createElement("span");
  lineTotal.className = "cl-total";
  lineTotal.textContent = formatPrice(line.price * line.qty, currency);
  side.append(lineTotal);

  row.append(side);
  return row;
}

/** The drawer's own empty state, echoing the empty-search treatment. */
function buildCartEmpty() {
  const box = document.createElement("div");
  box.className = "empty empty-cart";

  const glyph = document.createElement("span");
  glyph.className = "empty-mark";
  glyph.setAttribute("aria-hidden", "true");
  box.append(glyph);

  const title = document.createElement("h2");
  title.textContent = "سلّتك فاضية";
  box.append(title);

  const hint = document.createElement("p");
  hint.textContent = "أضف أصنافك من المنيو وبتظهر هون.";
  box.append(hint);

  return box;
}

/**
 * Redraw everything the cart owns: the drawer lines, the running total, the
 * order button's enabled state, and the header count badge.
 */
function renderCart() {
  const currency = menu ? menu.currency : "₪";
  const { count, total } = cartTotals();

  const lines = document.getElementById("cartLines");
  if (lines) {
    const fragment = document.createDocumentFragment();
    if (cart.size === 0) {
      fragment.append(buildCartEmpty());
    } else {
      cart.forEach((line, key) => fragment.append(buildCartLine(key, line, currency)));
    }
    lines.replaceChildren(fragment);
  }

  const totalEl = document.getElementById("cartTotal");
  if (totalEl) totalEl.textContent = formatPrice(total, currency);

  const order = document.getElementById("orderBtn");
  if (order) {
    const empty = cart.size === 0;
    // Rebuilding the href here — the one place every add, increment, decrement
    // and removal already funnels through — is what keeps the link from ever
    // going stale against the cart.
    order.href = currentOrderHref(currency);
    order.classList.toggle("is-disabled", empty);
    order.setAttribute("aria-disabled", empty ? "true" : "false");
    // Removing it from the tab order matches how it looks and behaves.
    if (empty) order.setAttribute("tabindex", "-1");
    else order.removeAttribute("tabindex");
  }

  const badge = document.getElementById("cartCount");
  if (badge) {
    badge.textContent = String(count);
    badge.classList.toggle("is-empty", count === 0);
  }

  const button = document.getElementById("cartBtn");
  if (button) {
    button.setAttribute(
      "aria-label",
      count === 0 ? "سلة الطلب — فاضية" : `سلة الطلب — ${count} صنف`
    );
  }
}

/* --------------------------------------------------------------------------
   Cart drawer: open / close, focus management, scroll lock
   -------------------------------------------------------------------------- */

const FOCUSABLE =
  'a[href]:not([tabindex="-1"]), button:not([disabled]), input, [tabindex]:not([tabindex="-1"])';

let drawerOpen = false;

function focusablesInDrawer(drawer) {
  return [...drawer.querySelectorAll(FOCUSABLE)];
}

function openDrawer() {
  const drawer = document.getElementById("cartDrawer");
  const overlay = document.getElementById("cartOverlay");
  if (!drawer || drawerOpen) return;

  drawerOpen = true;
  if (overlay) overlay.hidden = false;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-locked");

  // Focus the close button rather than the panel: it is the first control, and
  // it gives the keyboard user an immediate way back out.
  const close = document.getElementById("cartClose");
  if (close) close.focus();
}

function closeDrawer() {
  const drawer = document.getElementById("cartDrawer");
  const overlay = document.getElementById("cartOverlay");
  if (!drawer || !drawerOpen) return;

  drawerOpen = false;
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  if (overlay) overlay.hidden = true;
  document.body.classList.remove("is-locked");

  const button = document.getElementById("cartBtn");
  if (button) button.focus();
}

/** Keep Tab inside the drawer while it is open. */
function trapTab(event, drawer) {
  const focusables = focusablesInDrawer(drawer);
  if (!focusables.length) {
    event.preventDefault();
    return;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && (active === first || !drawer.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

/* ==========================================================================
   GOOGLE SHEET LOADING
   --------------------------------------------------------------------------
   The client updates the menu by editing a Google Sheet published as CSV —
   that is what "منيو قابل للتحديث" means in the contract, and they must never
   need us to change a price.

   Everything below assumes the file is hostile. It is typed by a non-technical
   person into a spreadsheet that may be reordered, half-filled, or pasted over.
   Nothing in here is allowed to throw: the worst outcome is that the whole
   sheet is rejected and data/menu.js keeps the site running.

   parseSheetCsv() is a pure function — CSV text in, menu object out (or null).
   It touches no globals and no DOM, so it is testable without a network.
   ========================================================================== */

/* --- RFC 4180-ish CSV reader ------------------------------------------- */

/**
 * Split CSV text into rows of fields.
 *
 * Handles quoted fields containing commas and newlines, "" as an escaped quote
 * inside a quoted field, both \r\n and \n line endings, and a leading UTF-8 BOM
 * (which Google Sheets does emit, and which would otherwise corrupt the very
 * first header and break column matching entirely).
 */
function parseCsv(text) {
  const source = String(text ?? "").replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (inQuotes) {
      if (char !== '"') {
        field += char;
      } else if (source[i + 1] === '"') {
        field += '"'; // "" inside quotes is a literal quote
        i += 1;
      } else {
        inQuotes = false;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      endField();
    } else if (char === "\n") {
      endRow();
    } else if (char === "\r") {
      if (source[i + 1] === "\n") i += 1; // swallow the pair
      endRow();
    } else {
      field += char;
    }
  }

  // Anything still buffered is a final row with no trailing newline.
  if (field !== "" || row.length > 0) endRow();

  return rows;
}

/** True when every cell in the row is blank — a spacer row to skip. */
function isBlankRow(row) {
  return row.every((cell) => String(cell ?? "").trim() === "");
}

/* --- column mapping ----------------------------------------------------- */

/* Canonical key -> the Arabic header from the client intake template. Matching
   is by name, never position, so the client can reorder columns or add their
   own notes column without breaking anything. */
const SHEET_COLUMNS = {
  cat: "القسم",
  name: "اسم الصنف",
  desc: "الوصف",
  size: "الحجم / النوع",
  price: "السعر",
  image: "اسم ملف الصورة",
  available: "متوفر",
  featured: "مميّز",
  offer: "عرض",
  oldPrice: "السعر القديم"
};

/* Without these three there is no menu to build. Everything else is optional
   and falls back to a documented default. */
const REQUIRED_COLUMNS = ["cat", "name", "price"];

/**
 * Fold a header cell for matching: the shared Arabic normalizer, then all
 * whitespace removed — so "الحجم / النوع", "الحجم/النوع" and "الحجم  /  النوع"
 * are the same column.
 */
function normalizeHeader(text) {
  return normalize(text).replace(/\s+/g, "");
}

/**
 * Build { canonicalKey: columnIndex } from the header row.
 * Returns null if a required column is missing — which invalidates the sheet.
 */
function mapSheetColumns(headerRow) {
  const seen = new Map();
  headerRow.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    // First occurrence wins, so a duplicated header cannot shadow the real one.
    if (key && !seen.has(key)) seen.set(key, index);
  });

  const columns = {};
  Object.entries(SHEET_COLUMNS).forEach(([key, header]) => {
    const index = seen.get(normalizeHeader(header));
    if (index !== undefined) columns[key] = index;
  });

  const missing = REQUIRED_COLUMNS.filter((key) => columns[key] === undefined);
  if (missing.length) {
    console.warn(
      "[cerablus] sheet is missing required columns:",
      missing.map((key) => SHEET_COLUMNS[key]).join(", ")
    );
    return null;
  }

  return columns;
}

/** Read a cell by canonical column name, trimmed, defaulting to "". */
function cell(row, columns, key) {
  const index = columns[key];
  if (index === undefined) return "";
  return String(row[index] ?? "").trim();
}

/* --- value coercion ----------------------------------------------------- */

/** Arabic-Indic and Persian digits to Western — clients type ٠١٢٣ routinely. */
function toWesternDigits(text) {
  return String(text ?? "").replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/**
 * Coerce a price cell to a number, or null.
 *
 * Strips the things people actually type into a price cell: currency symbols
 * and words, thousands separators (Western and Arabic), and stray whitespace.
 * "١٢", "12 ₪", "12₪", "ILS 12", "1,200" and " 12 " all come back as numbers.
 */
function parseSheetNumber(value) {
  let text = toWesternDigits(value).trim();
  if (!text) return null;

  text = text
    .replace(/[٬,]/g, "")           // thousands separators
    .replace(/٫/g, ".")             // Arabic decimal separator
    .replace(/[₪$€]/g, "")          // currency symbols
    .replace(/\b(ils|nis|shekels?|شيكل|شواكل)\b/gi, "")
    .trim();

  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

const TRUE_WORDS = new Set(["نعم", "ايوه", "اي", "yes", "y", "true", "1", "✓", "✔", "صح"]);
const FALSE_WORDS = new Set(["لا", "no", "n", "false", "0", "✗", "✘", "خطا", "غير متوفر"]);

/**
 * Coerce a yes/no cell. Anything unrecognised — including blank — takes the
 * caller's default, so a half-filled sheet still produces a usable menu.
 */
function parseSheetBoolean(value, fallback) {
  const text = normalize(toWesternDigits(value));
  if (!text) return fallback;
  if (TRUE_WORDS.has(text)) return true;
  if (FALSE_WORDS.has(text)) return false;
  return fallback;
}

/**
 * Turn a bare filename into a path under assets/menu/.
 *
 * The sheet holds a filename, not a path. Anything that looks like a path, a
 * traversal, or an absolute URL is rejected outright and becomes "" — the card
 * then renders the branded placeholder, which is a fine outcome and a much
 * better one than letting a spreadsheet cell point at an arbitrary URL.
 */
function parseSheetImage(value) {
  const name = String(value ?? "").trim();
  if (!name) return "";
  if (/[\\/]/.test(name) || name.includes("..") || /^[a-z][a-z0-9+.-]*:/i.test(name)) {
    console.warn("[cerablus] ignoring suspicious image filename:", name);
    return "";
  }
  return `assets/menu/${name}`;
}

/* --- identity ----------------------------------------------------------- */

/**
 * A URL-ish slug from Arabic or Latin text. Letters and numbers survive in any
 * script; everything else collapses to a hyphen.
 */
function slugify(text) {
  return normalize(text)
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The grouping key for an item: normalized category + normalized name.
 *
 * Normalizing means "قهوة" and "قهوه" on two rows are recognised as the same
 * item rather than silently becoming two, which is exactly the kind of typo a
 * spreadsheet collects.
 */
function sheetGroupKey(catText, nameText) {
  return `${normalize(catText)}|${normalize(nameText)}`;
}

/* --- the parser --------------------------------------------------------- */

/**
 * Parse published-sheet CSV into the window.MENU shape.
 *
 * Returns null when the sheet is unusable as a whole (no rows, no header, a
 * missing required column). Individual bad rows are skipped with a warning
 * instead — one unparseable price must never cost the café its whole menu.
 *
 * The output matches the documented data model exactly, so nothing downstream
 * needs to know where the menu came from.
 */
function parseSheetCsv(csvText, currency = "₪") {
  const rows = parseCsv(csvText).filter((row) => !isBlankRow(row));
  if (rows.length < 2) {
    console.warn("[cerablus] sheet has no data rows");
    return null;
  }

  const columns = mapSheetColumns(rows[0]);
  if (!columns) return null;

  /* Categories in order of FIRST APPEARANCE — that ordering is the client's
     menu ordering, and it is the only place it is expressed. */
  const categories = new Map(); // slug -> { id, name }
  const groups = new Map();     // groupKey -> item under construction

  rows.slice(1).forEach((row, index) => {
    const sheetRow = index + 2; // 1-based, and the header occupies row 1

    const catText = cell(row, columns, "cat");
    const nameText = cell(row, columns, "name");
    const price = parseSheetNumber(cell(row, columns, "price"));

    if (!catText || !nameText || price === null) {
      console.warn(`[cerablus] skipping sheet row ${sheetRow}: missing category, name or price`);
      return;
    }

    const catId = slugify(catText);
    if (!catId) {
      console.warn(`[cerablus] skipping sheet row ${sheetRow}: unusable category name`);
      return;
    }
    if (!categories.has(catId)) categories.set(catId, { id: catId, name: catText });

    const key = sheetGroupKey(catText, nameText);
    const size = cell(row, columns, "size");

    if (!groups.has(key)) {
      groups.set(key, {
        id: slugify(key),
        cat: catId,
        name: nameText,
        desc: cell(row, columns, "desc"),
        image: parseSheetImage(cell(row, columns, "image")),
        // متوفر defaults to TRUE: an item nobody answered for should still sell.
        available: parseSheetBoolean(cell(row, columns, "available"), true),
        // مميّز and عرض default to FALSE: a badge must be asked for.
        featured: parseSheetBoolean(cell(row, columns, "featured"), false),
        offer: parseSheetBoolean(cell(row, columns, "offer"), false),
        oldPrice: parseSheetNumber(cell(row, columns, "oldPrice")),
        rows: []
      });
    }

    groups.get(key).rows.push({ sheetRow, size, price });
  });

  /* Resolve each group into a single-price item or a variant item.

     SIZE CONTRADICTION: when an item's rows disagree — some carry a
     الحجم / النوع and some are blank — the sized rows win and the blank ones
     are dropped with a warning. A deliberate size is a stronger signal than an
     empty cell, and the alternatives are worse: inventing a label for the blank
     row puts words in the café's mouth, and throwing the sizes away to keep one
     price loses real menu structure. */
  const items = [];
  const usedIds = new Set();

  groups.forEach((group) => {
    const sized = group.rows.filter((row) => row.size !== "");

    let priced;
    if (sized.length === 0) {
      // No sizes anywhere: a single-price item. Extra rows are duplicates.
      if (group.rows.length > 1) {
        console.warn(`[cerablus] "${group.name}" repeats with no size; using the first price`);
      }
      priced = { price: group.rows[0].price };
    } else {
      if (sized.length !== group.rows.length) {
        const dropped = group.rows.filter((row) => row.size === "").map((row) => row.sheetRow);
        console.warn(
          `[cerablus] "${group.name}" mixes sized and unsized rows; ignoring row(s) ${dropped.join(", ")}`
        );
      }
      priced = { variants: sized.map((row) => ({ label: row.size, price: row.price })) };
    }

    /* Ids must be stable across reloads because the cart keys off them, so they
       are derived from category + name, never from a row index — inserting a
       row at the top of the sheet must not reshuffle every id. Two different
       groups can still collapse to the same slug if they differ only in
       punctuation, so uniqueness is enforced here in first-appearance order. */
    let id = group.id || "item";
    if (usedIds.has(id)) {
      let suffix = 2;
      while (usedIds.has(`${id}-${suffix}`)) suffix += 1;
      console.warn(`[cerablus] duplicate id "${id}" for "${group.name}"; using "${id}-${suffix}"`);
      id = `${id}-${suffix}`;
    }
    usedIds.add(id);

    items.push({
      id,
      cat: group.cat,
      name: group.name,
      desc: group.desc,
      ...priced, // exactly one of price / variants, never both
      image: group.image,
      available: group.available,
      featured: group.featured,
      offer: group.offer,
      oldPrice: group.oldPrice
    });
  });

  if (!items.length) {
    console.warn("[cerablus] sheet produced no valid items");
    return null;
  }

  return { currency, categories: [...categories.values()], items };
}

/* --- the loader --------------------------------------------------------- */

/**
 * Swap in a freshly parsed menu.
 *
 * The cart is deliberately NOT touched. Its lines already captured their prices
 * at add time, and silently repricing a customer's cart underneath them — or
 * dropping a line because the sheet renamed an item — is far worse than a brief
 * inconsistency that resolves the moment they reload. renderCart() still runs,
 * so the wa.me href is rebuilt and cannot go stale against the new currency.
 *
 * state.cat and state.query are untouched, so the active chip and whatever the
 * customer has typed both survive the re-render.
 */
function applySheetMenu(parsed) {
  menu = decorateMenu(parsed);
  render();
  renderCart();
}

/**
 * Fetch the published sheet and, if everything about it checks out, use it.
 *
 * Every failure path ends the same way: warn for us, and leave the baked-in
 * menu exactly as it is for the customer. Nothing here is awaited by the
 * initial render, so a slow or dead sheet costs the visitor nothing.
 */
async function loadSheetMenu() {
  const url = CONFIG.SHEET_CSV_URL;
  if (!url) return; // not configured yet — no fetch, no noise

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), CONFIG.SHEET_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();
    if (!text || !text.trim()) throw new Error("empty response");

    const parsed = parseSheetCsv(text, menu ? menu.currency : "₪");
    if (!parsed) throw new Error("could not parse the sheet");
    if (parsed.items.length < CONFIG.SHEET_MIN_ITEMS) {
      throw new Error(`only ${parsed.items.length} valid item(s); expected at least ${CONFIG.SHEET_MIN_ITEMS}`);
    }

    applySheetMenu(parsed);
  } catch (error) {
    // Deliberately silent for the visitor: the baked-in menu is already on screen.
    console.warn("[cerablus] using the baked-in menu —", error && error.message);
  } finally {
    window.clearTimeout(timer);
  }
}

/* --------------------------------------------------------------------------
   Wiring
   -------------------------------------------------------------------------- */

/** Category chips: exactly one active at a time, aria-pressed kept in sync. */
function wireChips() {
  const nav = document.getElementById("catNav");
  if (!nav) return;

  nav.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip || !nav.contains(chip)) return;

    state.cat = chip.dataset.cat || "all";
    nav.querySelectorAll(".chip").forEach((other) => {
      const active = other === chip;
      other.classList.toggle("is-active", active);
      other.setAttribute("aria-pressed", active ? "true" : "false");
    });
    render();
  });
}

/** Live search plus its clear button. */
function wireSearch() {
  const input = document.getElementById("searchInput");
  const clear = document.getElementById("searchClear");
  if (!input) return;

  const syncClear = () => {
    if (clear) clear.hidden = input.value.length === 0;
  };

  input.addEventListener("input", () => {
    state.query = input.value;
    syncClear();
    render();
  });

  if (clear) {
    clear.addEventListener("click", () => {
      input.value = "";
      state.query = "";
      syncClear();
      render();
      input.focus();
    });
  }

  syncClear();
}

/** Everything the drawer needs: openers, closers, steppers, focus trap. */
function wireCart() {
  const drawer = document.getElementById("cartDrawer");
  const overlay = document.getElementById("cartOverlay");
  const openBtn = document.getElementById("cartBtn");
  const closeBtn = document.getElementById("cartClose");
  const lines = document.getElementById("cartLines");

  if (openBtn) openBtn.addEventListener("click", openDrawer);
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  if (overlay) overlay.addEventListener("click", closeDrawer);

  // Quantity steppers, delegated: the rows are rebuilt on every cart change.
  if (lines) {
    lines.addEventListener("click", (event) => {
      const button = event.target.closest(".q");
      if (!button || !lines.contains(button)) return;

      const row = button.closest(".cart-line");
      if (!row) return;
      changeQty(row.dataset.key, Number(button.dataset.delta));
    });
  }

  document.addEventListener("keydown", (event) => {
    if (!drawerOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeDrawer();
    } else if (event.key === "Tab" && drawer) {
      trapTab(event, drawer);
    }
  });
}

function init() {
  menu = readMenu();
  sweepBrokenImages();
  wireChips();
  wireSearch();
  wireCart();
  render();
  renderCart(); // paints the empty state and the zeroed header badge

  /* The baked-in menu is on screen by now. Go looking for a fresher one in the
     background — deliberately not awaited, so the customer never waits on the
     network and never sees a spinner. */
  loadSheetMenu();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
