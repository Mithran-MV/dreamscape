// Every entity Dreamscape writes to Arkiv. All of it is public, and the indexer keeps it after expiry,
// so nothing here may hold a dream, a transcript, a key, a file link that decrypts, or personal data.
import { addr, bool, bytes, defineSchema, i32, key, str, u64 } from "@arkiv-network/sdk/schema";

// Closed vocabularies. One indexed bool per theme, because the query language has no "contains".
export const THEMES = ["water", "flight", "falling", "chase", "home", "animals", "people", "school", "city", "nature", "fantasy", "night"] as const;
export type Theme = (typeof THEMES)[number];
export const FEELINGS = ["wonder", "joy", "calm", "confused", "scared", "sad"] as const;
export type Feeling = (typeof FEELINGS)[number];
export const CATEGORIES = ["comic", "portrait", "saga", "living", "world"] as const;
export type Category = (typeof CATEGORIES)[number];
export const SERVICES = ["comic", "portrait", "saga", "living"] as const;
export type Service = (typeof SERVICES)[number];

export type ThemeColumn = `th_${Theme}`;
export const themeColumn = (theme: Theme): ThemeColumn => `th_${theme}`;
export const serviceColumn = (service: Service) => `does_${service}` as const;

const theme = () => bool().indexed().optional();

// A piece for sale. The server creates it and hands it to the dreamer; it leaves search at the sale deadline.
export const Listing = defineSchema("dreamscape.listing.v1", {
  pieceId: key().indexed(), // NightMarket's bytes32 piece id
  category: str().indexed(),
  priceUsdc: u64().indexed(), // 6 decimals
  editionsTotal: i32(),
  editionsSold: i32(),
  soldOut: bool().indexed(),
  sellerEns: str().indexed(),
  style: str().indexed(),
  sagaLength: i32().indexed().optional(),
  sealed: bool().indexed(),
  listedAt: u64().indexed(), // unix seconds, for "newest"
  saleEndsAt: u64(), // unix seconds
  title: str(),
  model: str(),
  previewRef: str().optional(), // public low-resolution preview only
  th_water: theme(),
  th_flight: theme(),
  th_falling: theme(),
  th_chase: theme(),
  th_home: theme(),
  th_animals: theme(),
  th_people: theme(),
  th_school: theme(),
  th_city: theme(),
  th_nature: theme(),
  th_fantasy: theme(),
  th_night: theme(),
});

// Tonight's picks: the server's own readonly entities, gone at dawn.
export const Stall = defineSchema("dreamscape.stall.v1", {
  listing: key().indexed(),
  night: str().indexed(), // YYYY-MM-DD of the evening, UTC
  slot: i32(),
});

// A vendor agent's stall: its menu, kept alive by hourly heartbeats. A dead agent drops out on its own.
export const Vendor = defineSchema("dreamscape.vendor.v1", {
  ens: str().indexed(),
  style: str().indexed(),
  fromPriceUsdc: u64().indexed(),
  does_comic: bool().indexed(),
  does_portrait: bool().indexed(),
  does_saga: bool().indexed(),
  does_living: bool().indexed(),
  open: bool().indexed(),
  menu: bytes(), // JSON, public
  lastBeat: u64(), // unix seconds
});

// A buyer's open request. Only the buyer, its owner, can award it.
export const Commission = defineSchema("dreamscape.commission.v1", {
  kind: str().indexed(), // a Service
  budgetUsdc: u64().indexed(),
  status: str().indexed(), // "open" or "awarded"
  buyerEns: str().indexed().optional(),
  deadline: u64(), // unix seconds
  awardedBid: key().optional(),
  brief: bytes(), // short and public, as the buyer writes it; anything private stays off Arkiv
});

// An agent's offer on a commission, signed by the agent. It goes with the request.
export const Bid = defineSchema("dreamscape.bid.v1", {
  commission: key().indexed(),
  vendorEns: str().indexed(),
  priceUsdc: u64().indexed(),
  etaHours: i32(),
});

// "Working on it": an agent's lease on a commission, renewed while it works. If it lapses, the job reopens.
export const Claim = defineSchema("dreamscape.claim.v1", {
  commission: key().indexed(),
  vendorEns: str().indexed(),
});

// "May I visit?" Owned by the visitor, named only by the pass's namehash. An ignored knock fades in 12 hours.
export const Knock = defineSchema("dreamscape.knock.v1", {
  pass: key().indexed(), // namehash of the visitor's ENS pass, whose label is random
  host: addr().indexed(), // the dreamer whose gallery it is
  scope: str(), // the scope asked for
});

// "You may come in now": owned by the dreamer, and gone when the visit ends, which is what closes the door.
export const Visit = defineSchema("dreamscape.visit.v1", {
  pass: key().indexed(),
  host: addr().indexed(),
  scope: str(), // "gallery", "published" or "saga:<id>"
  knock: key().optional(), // the knock it answers
  endsAt: u64(), // unix seconds, for the countdown; the entity's expiry is what counts
});

// One theme's count for one day: no words, only themes shared by at least MIN_DREAMERS dreamers.
export const WorldDream = defineSchema("dreamscape.worlddream.v1", {
  date: str().indexed(), // YYYY-MM-DD, UTC
  circle: str().indexed(), // "world", or an event or family code
  theme: str().indexed(),
  feeling: str().indexed(), // the feeling most of those dreamers tapped
  count: i32().indexed(),
});

export const MIN_DREAMERS = 5;

// A str holds at most 128 bytes of UTF-8, so cut longer text at a character boundary.
export function clampStr(text: string, maxBytes = 128): string {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= maxBytes) return text;
  let out = "";
  for (const char of text) {
    if (encoder.encode(out + char + "…").length > maxBytes) break;
    out += char;
  }
  return out + "…";
}

export const isTheme = (value: string): value is Theme => (THEMES as readonly string[]).includes(value);
export const isFeeling = (value: string): value is Feeling => (FEELINGS as readonly string[]).includes(value);
