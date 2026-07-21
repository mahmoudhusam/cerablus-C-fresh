/* ==========================================================================
   Cerablus Coffee — menu engine
   Rendering, search, cart and WhatsApp ordering land here in later steps.
   ========================================================================== */

const CONFIG = { PHONE: "970590000000" }; // placeholder — real number at Step 8

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

/** Read window.MENU into the shape the renderer wants. */
function readMenu() {
  const menu = window.MENU || {};
  const items = Array.isArray(menu.items) ? menu.items : [];
  return {
    currency: menu.currency || "₪",
    categories: Array.isArray(menu.categories) ? menu.categories : [],
    // Cache the search key once instead of normalizing on every keystroke.
    items: items.map((item) => ({
      ...item,
      searchKey: normalize(`${item.name || ""} ${item.desc || ""}`)
    }))
  };
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

/**
 * Apply the active chip and the search box together — both constraints always
 * hold, so searching inside a category narrows rather than resets.
 */
function filterItems() {
  const query = normalize(state.query);

  return menu.items.filter((item) => {
    if (state.cat === "featured") {
      if (item.featured !== true) return false;
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

  // At most one badge, so "مميّز" and "غير متوفر" never stack in the corner.
  if (item.available === false) {
    const tag = document.createElement("span");
    tag.className = "tag-out";
    tag.textContent = "غير متوفر";
    top.append(tag);
  } else if (item.featured === true) {
    const fav = document.createElement("span");
    fav.className = "fav";
    fav.textContent = "مميّز";
    top.append(fav);
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

  // The price element is created before the pills so they can drive it.
  const price = document.createElement("span");
  price.className = "price";

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

  const row = document.createElement("div");
  row.className = "r";
  row.append(price);

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
    // would just repeat the chip. Headings stay for الكل and الأكثر طلبًا,
    // where results span several categories and the grouping carries meaning.
    const showHeadings = state.cat === "all" || state.cat === "featured";

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
    total += line.price * line.qty;
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

  // Step 5 attaches the click; here it only reflects whether ordering is possible.
  const order = document.getElementById("orderBtn");
  if (order) {
    const empty = cart.size === 0;
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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
