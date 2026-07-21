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

/** The menu data, with a precomputed search key per item. */
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
function filterItems(menu) {
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
 * only — display logic; the cart reads the selection in Step 4.
 */
function buildSizePills(variants, priceEl, currency) {
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

  const variants = variantsOf(item);
  if (variants) {
    price.textContent = formatPrice(variants[0].price, currency);
    body.append(buildSizePills(variants, price, currency));
  } else {
    price.textContent = formatPrice(item.price, currency);
  }

  const row = document.createElement("div");
  row.className = "r";
  row.append(price);

  // Present but inert this step — the cart lands in Step 4.
  const add = document.createElement("button");
  add.type = "button";
  add.className = "add";
  if (outOfStock) {
    add.disabled = true;
    add.textContent = "غير متوفر";
  } else {
    add.textContent = "أضف +";
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
  if (!body) return;

  const menu = readMenu();
  const visible = filterItems(menu);
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

function init() {
  sweepBrokenImages();
  wireChips();
  wireSearch();
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
