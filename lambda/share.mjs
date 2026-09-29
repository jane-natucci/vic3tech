// "Share this save": receives the page's gzipped summary of a loaded save,
// rebuilds it keeping only the fields the page uses (so this can't be used to
// host arbitrary files), and stores it in the site's bucket as
// shares/<random id>.json.gz, which CloudFront serves at /shares/<id>.json.gz.
//
// Reached through CloudFront at https://vic3tech.jane.berlin/api/share. Its
// code is deployed by this repo's deploy.sh; the function itself, its
// permissions and limits are set up in the site's (separate) infrastructure
// config.
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { gunzipSync, gzipSync } from "node:zlib";
import { randomBytes } from "node:crypto";

const s3 = new S3Client({});
const BUCKET = process.env.BUCKET;
const MAX_UPLOAD = 3 * 1024 * 1024;      // gzipped bytes
const MAX_JSON = 25 * 1024 * 1024;       // after unzipping

const reply = (status, body) => ({
  statusCode: status,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(body),
});

export async function handler(event) {
  if (event.requestContext?.http?.method !== "POST") return reply(405, { error: "POST only" });
  try {
    const raw = Buffer.from(event.body || "", event.isBase64Encoded ? "base64" : "utf8");
    if (!raw.length) return reply(400, { error: "Empty upload" });
    if (raw.length > MAX_UPLOAD) return reply(413, { error: "Too large" });
    const summary = clean(JSON.parse(gunzipSync(raw, { maxOutputLength: MAX_JSON }).toString("utf8")));

    const id = randomBytes(9).toString("base64url"); // 12 characters, unguessable
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET, Key: `shares/${id}.json.gz`, Body: gzipSync(JSON.stringify(summary)),
      ContentType: "application/json", ContentEncoding: "gzip",
      CacheControl: "public, max-age=31536000, immutable",
    }));
    return reply(200, { id });
  } catch (e) {
    console.log("rejected:", e.message);
    return reply(400, { error: "Not a valid save summary" });
  }
}

// --- Rebuild the summary from known fields only ---------------------------------
const fail = what => { throw new Error(`bad ${what}`); };
const str = (v, re, what) => (typeof v === "string" && re.test(v) ? v : fail(what));
const num = (v, what) => (typeof v === "number" && Number.isFinite(v) ? v : fail(what));
const optNum = (v, what) => (v == null ? null : num(v, what));
const id = v => str(v, /^[A-Za-z0-9_:.\-]{1,80}$/, "id");
const tag = v => (v == null ? null : str(v, /^[A-Z0-9_]{2,4}$/, "tag"));
const list = (v, max, fn, what) => (Array.isArray(v) && v.length <= max ? v.map(fn) : fail(what));
const numMap = (v, max, keyRe, what) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) fail(what);
  const entries = Object.entries(v);
  if (entries.length > max) fail(what);
  return Object.fromEntries(entries.map(([k, n]) => [str(k, keyRe, what), num(n, what)]));
};

// A real save has hundreds of countries with states; refuse near-empty
// uploads, which could only be junk.
const MIN_COUNTRIES = 50, MIN_STATES = 100;

function clean(s) {
  if (!s || typeof s !== "object") fail("summary");
  if (!Array.isArray(s.countries) || s.countries.length < MIN_COUNTRIES) fail("too few countries");
  if (s.countries.reduce((n, c) => n + (Array.isArray(c?.states) ? c.states.length : 0), 0) < MIN_STATES) fail("too few states");
  return {
    date: str(s.date, /^\d{1,4}\.\d{1,2}\.\d{1,2}(\.\d{1,2})?$/, "date"),
    player: tag(s.player),
    countries: list(s.countries, 2000, c => ({
      tag: tag(c.tag) ?? fail("country tag"),
      capitalRegion: c.capitalRegion == null ? null : id(c.capitalRegion),
      prestige: optNum(c.prestige, "prestige"),
      gdp: optNum(c.gdp, "gdp"),
      techs: list(c.techs, 400, id, "techs"),
      army: Object.fromEntries(Object.entries(c.army || {}).slice(0, 100).map(([k, a]) =>
        [id(k), { count: num(a.count, "army"), manpower: num(a.manpower, "army") }])),
      navy: numMap(c.navy || {}, 100, /^[a-z_]{1,60}$/, "navy"),
      states: list(c.states, 400, st => ({
        region: id(st.region),
        arable_land: num(st.arable_land, "arable"),
        provinces: num(st.provinces, "provinces"),
        buildings: numMap(st.buildings || {}, 300, /^[a-z0-9_]{1,80}$/, "buildings"),
        trade: numMap(st.trade || {}, 100, /^\d{1,3}$/, "trade"),
        ...(st.tradeCenter && { tradeCenter: { revenue: num(st.tradeCenter.revenue, "tc"), profit: num(st.tradeCenter.profit, "tc") } }),
      }), "states"),
    }), "countries"),
    treaties: list(s.treaties || [], 3000, t => ({
      countries: list(t.countries, 2, tag, "treaty countries"),
      since: t.since == null ? null : str(String(t.since), /^[\d.]{1,20}$/, "since"),
      days: optNum(t.days, "days"),
      articles: list(t.articles, 50, a => ({
        article: str(a.article, /^[a-z_]{1,60}$/, "article"),
        source: tag(a.source), target: tag(a.target),
        goods: a.goods == null ? null : str(a.goods, /^[a-z_]{1,40}$/, "goods"),
        quantity: optNum(a.quantity, "quantity"),
      }), "articles"),
    }), "treaties"),
    prices: list(s.prices || [], 100, p => (p == null ? null : list(p, 60, v => num(v, "price"), "prices")), "prices"),
  };
}
