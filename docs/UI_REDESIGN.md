# UI redesign notes

Concept: a camera fitting room. Recurring motifs are the camera viewfinder
corner brackets, a tailor's tape strip, garment hang-tag prices, and
sticker badges on a colour-blocked palette.

Palette (tailwind.config.js): ink #1D1530, paper #F6F2FA, violet #5B2EE6,
rani pink #E0245E, saffron #FFB627, mint #35D9A8, sky #8CCBFF.
The `gray` and `rose` scales are re-tinted so any page picks up the palette.
Type: Bricolage Grotesque (display) + Figtree (body), loaded from Google Fonts.

Shared styles live in `frontend/src/index.css` (.btn-*, .field, .chip,
.hang-tag, .vf-corners, .tape, .brand-stripe, .sticker).

Redesigned: Layout, Navbar (mobile menu, account dropdown), Footer, Home,
Shop (mobile filter sheet), ProductCard, ProductDetails (sticky mobile
action bar), Cart, Wishlist, Profile, Login, Register, Orders, Checkout,
Admin, Status, TryOn (class-only), CameraFeed frame, EmptyState (new).

No data fetching, auth, cart, wishlist or try-on logic was changed.
The pose guide on the Home hero is decorative, not live detection.
