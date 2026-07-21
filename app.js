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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", sweepBrokenImages);
} else {
  sweepBrokenImages();
}
