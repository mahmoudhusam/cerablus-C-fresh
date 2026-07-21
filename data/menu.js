/* ==========================================================================
   Cerablus Coffee — menu data
   --------------------------------------------------------------------------
   ⚠️  SAMPLE DATA FOR DEVELOPMENT ONLY.
   These items, prices and descriptions are placeholders written to exercise
   every branch of the renderer (single price, variants, unavailable, featured,
   offer). They are NOT the café's real menu and must be replaced wholesale by
   the client's real ~113 items before launch (Step 8).

   `image` is intentionally empty everywhere: real photos arrive at Step 8, and
   the renderer must fall back to the placeholder tile gracefully until then.

   This file is the ONLY place menu content lives. Never hardcode items in HTML.
   ========================================================================== */

window.MENU = {
  currency: "₪",

  categories: [
    { id: "hot",    name: "مشروبات ساخنة" },
    { id: "cold",   name: "مشروبات باردة" },
    { id: "sweets", name: "حلويات" },
    { id: "food",   name: "مأكولات خفيفة" }
  ],

  items: [
    /* --- مشروبات ساخنة --- */
    {
      id: "arabic-coffee", cat: "hot",
      name: "قهوة عربية", desc: "قهوة عربية أصيلة بالهيل.",
      price: 8, image: "",
      available: true, featured: true, offer: false, oldPrice: null
    },
    {
      id: "espresso", cat: "hot",
      name: "إسبريسو", desc: "جرعة مركّزة من حبوب محمّصة طازة.",
      price: 7, image: "",
      available: true, featured: false, offer: false, oldPrice: null
    },
    {
      id: "cappuccino", cat: "hot",
      name: "كابتشينو", desc: "إسبريسو مع رغوة حليب كثيفة.",
      variants: [
        { label: "صغير", price: 10 },
        { label: "كبير", price: 13 }
      ],
      image: "",
      available: true, featured: true, offer: false, oldPrice: null
    },
    {
      id: "latte", cat: "hot",
      name: "لاتيه", desc: "حليب مخفوق ناعم فوق إسبريسو.",
      price: 12, image: "",
      available: true, featured: false, offer: false, oldPrice: null
    },
    {
      id: "hot-chocolate", cat: "hot",
      name: "هوت شوكليت", desc: "شوكولاتة ساخنة غنية بالحليب.",
      price: 13, oldPrice: 16, image: "",
      available: true, featured: false, offer: true
    },
    {
      id: "sahlab", cat: "hot",
      name: "سحلب", desc: "سحلب بالقرفة والمكسّرات.",
      price: 12, image: "",
      available: false, featured: false, offer: false, oldPrice: null
    },

    /* --- مشروبات باردة --- */
    {
      id: "iced-coffee", cat: "cold",
      name: "آيس كوفي", desc: "قهوة مثلجة منعشة.",
      price: 12, oldPrice: 15, image: "",
      available: true, featured: false, offer: true
    },
    {
      id: "iced-latte", cat: "cold",
      name: "آيس لاتيه", desc: "إسبريسو بارد مع حليب وثلج.",
      price: 14, image: "",
      available: true, featured: false, offer: false, oldPrice: null
    },
    {
      id: "strawberry-smoothie", cat: "cold",
      name: "سموذي فراولة", desc: "فراولة طبيعية مخفوقة بالحليب.",
      price: 14, image: "",
      available: true, featured: false, offer: false, oldPrice: null
    },
    {
      id: "lemon-mint", cat: "cold",
      name: "ليمون بالنعنع", desc: "ليمون طازج مع نعنع وثلج مجروش.",
      price: 11, image: "",
      available: true, featured: false, offer: false, oldPrice: null
    },

    /* --- حلويات --- */
    {
      id: "kunafa", cat: "sweets",
      name: "كنافة", desc: "كنافة نابلسية بالجبنة مع قطر.",
      variants: [
        { label: "شخص",   price: 18 },
        { label: "شخصين", price: 32 }
      ],
      image: "",
      available: true, featured: false, offer: false, oldPrice: null
    },
    {
      id: "cheesecake", cat: "sweets",
      name: "تشيز كيك", desc: "قطعة تشيز كيك بصلصة التوت.",
      price: 16, image: "",
      available: true, featured: false, offer: false, oldPrice: null
    },
    {
      id: "brownie", cat: "sweets",
      name: "براوني", desc: "براوني شوكولاتة دافئ.",
      price: 15, image: "",
      available: true, featured: false, offer: false, oldPrice: null
    },

    /* --- مأكولات خفيفة --- */
    {
      id: "zaatar-manakish", cat: "food",
      name: "مناقيش زعتر", desc: "عجينة طازة بزعتر وزيت زيتون.",
      price: 6, image: "",
      available: true, featured: false, offer: false, oldPrice: null
    },
    {
      id: "cheese-toast", cat: "food",
      name: "توست جبنة", desc: "توست محمّص بجبنة ذائبة.",
      price: 14, image: "",
      available: true, featured: false, offer: false, oldPrice: null
    },
    {
      id: "chicken-croissant", cat: "food",
      name: "كرواسان دجاج", desc: "كرواسان محشي دجاج وخضار.",
      price: 18, image: "",
      available: true, featured: false, offer: false, oldPrice: null
    }
  ]
};
