import express from "express";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { DATABASE_URL, JWT_SECRET, PORT = 3000 } = process.env;
if (!JWT_SECRET) throw new Error("Set JWT_SECRET in .env");

const db = new pg.Pool({ connectionString: DATABASE_URL });
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.set({ "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type,Authorization", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS" });
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.static(path.join(__dirname, "public")));

/* ---------- AniList metadata (legal public API) with cache ---------- */
const cache = new Map();
const TTL = 10 * 60 * 1000;
const FIELDS = `id title{romaji english} genres seasonYear averageScore episodes description(asHtml:false) coverImage{large color}`;

async function anilist(query, variables) {
  const key = JSON.stringify([query, variables]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  const r = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!r.ok) throw new Error("AniList " + r.status);
  const v = (await r.json()).data;
  cache.set(key, { t: Date.now(), v });
  return v;
}

function shade(hex, f) {
  const n = parseInt((hex || "#7c3aed").slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.round(x * f));
  return "#" + c.map((x) => x.toString(16).padStart(2, "0")).join("");
}

const shape = (m) => ({
  id: m.id,
  n: m.title.english || m.title.romaji,
  g: m.genres || [],
  y: m.seasonYear || "",
  s: m.averageScore ? +(m.averageScore / 10).toFixed(1) : 0,
  e: m.episodes || 12,
  d: (m.description || "No description yet.").replace(/<[^>]+>/g, "").slice(0, 400),
  img: m.coverImage?.large,
  c: [m.coverImage?.color || "#7c3aed", shade(m.coverImage?.color, 0.3)],
});

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(502).json({ error: "Upstream error" }); });

app.get("/api/anime/trending", wrap(async (req, res) => {
  const d = await anilist(
    `query{Page(perPage:30){media(type:ANIME,sort:TRENDING_DESC,isAdult:false){${FIELDS}}}}`, {});
  res.json(d.Page.media.map(shape));
}));

app.get("/api/anime/search", wrap(async (req, res) => {
  const q = String(req.query.q || "").slice(0, 80);
  if (!q) return res.json([]);
  const d = await anilist(
    `query($q:String){Page(perPage:20){media(type:ANIME,search:$q,isAdult:false){${FIELDS}}}}`, { q });
  res.json(d.Page.media.map(shape));
}));

app.get("/api/anime/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const d = await anilist(`query($id:Int){Media(id:$id,type:ANIME){${FIELDS}}}`, { id });
  res.json(shape(d.Media));
}));

/* ---------- Auth ---------- */
const sign = (u) => jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: "30d" });
function auth(req, res, next) {
  try {
    req.uid = jwt.verify((req.headers.authorization || "").replace("Bearer ", ""), JWT_SECRET).id;
    next();
  } catch { res.status(401).json({ error: "Login required" }); }
}

app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || password.length < 8) return res.status(400).json({ error: "Username and 8+ char password required" });
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query("INSERT INTO users(username,password_hash) VALUES($1,$2) RETURNING id,username", [username.trim(), hash]);
    res.json({ token: sign(rows[0]), user: rows[0] });
  } catch (e) {
    res.status(e.code === "23505" ? 409 : 500).json({ error: e.code === "23505" ? "Username taken" : "Server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  const { rows } = await db.query("SELECT * FROM users WHERE username=$1", [username || ""]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password || "", u.password_hash))) return res.status(401).json({ error: "Wrong username or password" });
  res.json({ token: sign(u), user: { id: u.id, username: u.username } });
});

/* ---------- Watchlist ---------- */
app.get("/api/watchlist", auth, async (req, res) => {
  const { rows } = await db.query("SELECT anime_id,status FROM watchlist WHERE user_id=$1 ORDER BY added_at DESC", [req.uid]);
  res.json(rows);
});

app.put("/api/watchlist/:animeId", auth, async (req, res) => {
  const status = ["Watching", "Plan to Watch", "Completed"].includes(req.body?.status) ? req.body.status : "Plan to Watch";
  await db.query(
    `INSERT INTO watchlist(user_id,anime_id,status) VALUES($1,$2,$3)
     ON CONFLICT(user_id,anime_id) DO UPDATE SET status=$3`, [req.uid, +req.params.animeId, status]);
  res.json({ ok: true });
});

app.delete("/api/watchlist/:animeId", auth, async (req, res) => {
  await db.query("DELETE FROM watchlist WHERE user_id=$1 AND anime_id=$2", [req.uid, +req.params.animeId]);
  res.json({ ok: true });
});

/* ---------- Watch progress ---------- */
app.put("/api/progress", auth, async (req, res) => {
  const { animeId, episode, seconds } = req.body || {};
  await db.query(
    `INSERT INTO progress(user_id,anime_id,episode,seconds) VALUES($1,$2,$3,$4)
     ON CONFLICT(user_id,anime_id,episode) DO UPDATE SET seconds=$4,updated_at=now()`,
    [req.uid, +animeId, +episode, Math.max(0, +seconds | 0)]);
  res.json({ ok: true });
});

app.get("/api/progress", auth, async (req, res) => {
  const { rows } = await db.query("SELECT anime_id,episode,seconds FROM progress WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 20", [req.uid]);
  res.json(rows);
});

app.listen(PORT, () => console.log(`AniNest running on http://localhost:${PORT}`));
