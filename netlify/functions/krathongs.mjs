// ลอยกระทงออนไลน์ — API เก็บกระทงไว้ใน Netlify Blobs
// GET    /api/krathongs              → กระทงล่าสุด 150 ใบ
// GET    /api/krathongs?img=<id>     → รูปบนกระทง (JPEG)
// POST   /api/krathongs              → ลอยกระทงใบใหม่ (จำกัด 1 ใบ / 20 วินาที / IP)
// POST   /api/krathongs?report=<id>  → แจ้งไม่เหมาะสม (ครบ 3 IP กระทงจะถูกซ่อน)
// DELETE /api/krathongs?id=<id>      → ลบ (ต้องส่ง header x-admin-key = ADMIN_KEY)
//
// ศึกกระทง (ค่าพลังเก็บที่ prog/<id>; กระทงจริงในแม่น้ำไม่ถูกลบหรือล่ม):
// GET    ?prog=<id>                  → ค่าพลังสาธารณะของกระทงใบนั้น
// GET    ?board                      → ทำเนียบนักชน (kill มากสุด 20 อันดับ)
// GET    ?inbox=<id,id,...>          → ค่าพลังและประวัติการถูกท้าของกระทงหลายใบ
// POST   ?claim=<id>                 → รับกุญแจให้กระทงเก่าที่ยังไม่มีเจ้าของ
// POST   ?action=upgrade|sticks|battle  body {id, token, ...}
import { getStore } from "@netlify/blobs";
import { createHash, randomBytes } from "node:crypto";

const TYPES = ["banana", "lotus", "bread", "coconut", "pride", "cat", "star"];
const CATS = ["", "love", "work", "money", "health", "study", "sorry"];
const CANDLES = ["white", "gold", "pink", "blue", "violet"];
const LIMIT = 150;
const COOLDOWN_MS = 20_000;
const MAX_PHOTO_BYTES = 70_000;   // รูป 192×192 JPEG ปกติราว 10–30 KB
const HIDE_AT_REPORTS = 3;
// คำที่ไม่อยากให้ขึ้นบนแม่น้ำ เพิ่มเองได้
const BANNED = ["http://", "https://", "www."];
const ID_RE = /^[a-z0-9-]{1,40}$/;
const STATS = ["hp", "atk", "def", "spd", "sk"];
const MAX_LV = 20, START_COINS = 60, REROLL_COST = 40, BATTLE_COOLDOWN_MS = 12_000, N_FORTUNES = 16;
const upCost = (lv) => 25 + lv * 15;
const sha = (t) => createHash("sha256").update(String(t)).digest("hex");
const newToken = () => randomBytes(18).toString("base64url");
const level = (p) => 1 + STATS.reduce((a, k) => a + (p.lv?.[k] || 0), 0);
const drawSticks = () => { const pool = [...Array(N_FORTUNES).keys()], out = []; for (let i = 0; i < 3; i++) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]); return out; };
const publicProg = (p) => p && ({ id: p.id, name: p.name, type: p.type, lv: p.lv, level: level(p), coins: p.coins, kills: p.kills || 0, wins: p.wins || 0, losses: p.losses || 0, defWins: p.defWins || 0, defLosses: p.defLosses || 0, sticks: p.sticks || null });
function newProg(item, token) {
  return { id: item.id, key: item.key, name: item.name, type: item.type, tokenHash: sha(token), coins: START_COINS,
    lv: { hp: 0, atk: 0, def: 0, spd: 0, sk: 0 }, sticks: null, kills: 0, wins: 0, losses: 0, defWins: 0, defLosses: 0, lastBattle: 0 };
}
async function findKey(store, id) { const { blobs } = await store.list({ prefix: "k/" }); const hit = blobs.find((b) => b.key.endsWith("-" + id)); return hit ? hit.key : null; }
async function syncSummary(store, p) {
  if (!p.key) return; const it = await store.get(p.key, { type: "json" }); if (!it) return;
  it.lv = level(p); it.kills = p.kills || 0; await store.setJSON(p.key, it);
}

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });

const str = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");
const num = (v) => Math.min(1, Math.max(0, Number(v) || 0.5));
const ipOf = (req, context) => (context.ip || req.headers.get("x-nf-client-connection-ip") || "unknown").replace(/[^a-zA-Z0-9.:_-]/g, "_");

async function reportCounts(store) {
  const { blobs } = await store.list({ prefix: "rep/" });
  const counts = new Map();
  for (const b of blobs) {
    const id = b.key.split("/")[1];
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

export default async (req, context) => {
  const store = getStore({ name: "krathongs", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const imgId = url.searchParams.get("img");
    if (imgId !== null) {
      if (!ID_RE.test(imgId)) return new Response("not found", { status: 404 });
      const buf = await store.get("img/" + imgId, { type: "arrayBuffer" });
      if (!buf) return new Response("not found", { status: 404 });
      return new Response(buf, {
        headers: {
          "content-type": "image/jpeg",
          "cache-control": "public, max-age=31536000, immutable",
          "x-content-type-options": "nosniff",
        },
      });
    }
    const progId = url.searchParams.get("prog");
    if (progId !== null) {
      if (!ID_RE.test(progId)) return json({ error: "ไม่พบ" }, 404);
      const p = await store.get("prog/" + progId, { type: "json" });
      return json({ prog: publicProg(p) || null });
    }
    if (url.searchParams.has("board")) {
      const { blobs: pb } = await store.list({ prefix: "prog/" });
      const all = (await Promise.all(pb.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean);
      all.sort((a, b) => (b.kills || 0) - (a.kills || 0) || level(b) - level(a));
      return json({ board: all.slice(0, 20).map(publicProg) }, 200, { "cache-control": "public, max-age=15" });
    }
    const inbox = url.searchParams.get("inbox");
    if (inbox !== null) {
      const ids = inbox.split(",").filter((x) => ID_RE.test(x)).slice(0, 12);
      const out = {};
      for (const id of ids) {
        const p = await store.get("prog/" + id, { type: "json" });
        const { blobs: cb } = await store.list({ prefix: "ch/" + id + "/" });
        const keys = cb.map((b) => b.key).sort().reverse().slice(0, 12);
        const logs = (await Promise.all(keys.map((k) => store.get(k, { type: "json" })))).filter(Boolean);
        out[id] = { prog: publicProg(p) || null, logs };
      }
      return json({ inbox: out });
    }
    const [{ blobs }, counts] = await Promise.all([store.list({ prefix: "k/" }), reportCounts(store)]);
    const keys = blobs.map((b) => b.key).sort().reverse().slice(0, LIMIT + 20);
    const items = (await Promise.all(keys.map((k) => store.get(k, { type: "json" }))))
      .filter((it) => it && (counts.get(it.id) || 0) < HIDE_AT_REPORTS)
      .slice(0, LIMIT);
    return json({ items }, 200, { "cache-control": "public, max-age=5" });
  }

  if (req.method === "POST") {
    const reportId = url.searchParams.get("report");
    if (reportId !== null) {
      if (!ID_RE.test(reportId)) return json({ error: "ไม่พบกระทงนี้" }, 404);
      await store.set("rep/" + reportId + "/" + ipOf(req, context), "1");
      return json({ ok: true });
    }

    const claimId = url.searchParams.get("claim");
    if (claimId !== null) {
      if (!ID_RE.test(claimId)) return json({ error: "ไม่พบกระทงนี้" }, 404);
      if (await store.get("prog/" + claimId)) return json({ error: "กระทงนี้มีเจ้าของแล้ว" }, 409);
      const key = await findKey(store, claimId); if (!key) return json({ error: "ไม่พบกระทงนี้" }, 404);
      const it = await store.get(key, { type: "json" }); const token = newToken();
      await store.setJSON("prog/" + claimId, newProg({ ...it, key }, token));
      return json({ id: claimId, token });
    }
    const action = url.searchParams.get("action");
    if (action) {
      let b; try { b = await req.json(); } catch { return json({ error: "ข้อมูลไม่ถูกต้อง" }, 400); }
      if (!ID_RE.test(String(b.id || ""))) return json({ error: "ไม่พบกระทงนี้" }, 404);
      const p = await store.get("prog/" + b.id, { type: "json" });
      if (!p || p.tokenHash !== sha(b.token || "")) return json({ error: "กระทงนี้ไม่ใช่ของคุณ" }, 403);
      if (action === "upgrade") {
        const st = String(b.stat || ""); if (!STATS.includes(st)) return json({ error: "ค่าพลังไม่ถูกต้อง" }, 400);
        const cur = p.lv[st] || 0; if (cur >= MAX_LV) return json({ error: "ตันแล้ว" }, 400);
        const cost = upCost(cur); if (p.coins < cost) return json({ error: "เหรียญไม่พอ" }, 400);
        p.coins -= cost; p.lv[st] = cur + 1;
        await store.setJSON("prog/" + p.id, p); await syncSummary(store, p);
        return json({ prog: publicProg(p) });
      }
      if (action === "sticks") {
        if (p.sticks) { if (p.coins < REROLL_COST) return json({ error: "เหรียญไม่พอ" }, 400); p.coins -= REROLL_COST; }
        p.sticks = drawSticks(); await store.setJSON("prog/" + p.id, p);
        return json({ prog: publicProg(p) });
      }
      if (action === "battle") {
        const now = Date.now(); if (now - (p.lastBattle || 0) < BATTLE_COOLDOWN_MS) return json({ error: "พักหายใจสักครู่ก่อนบันทึกศึกถัดไป" }, 429);
        p.lastBattle = now;
        const win = !!b.win, mode = b.mode === "duel" ? "duel" : "pve";
        const stage = Math.max(1, Math.min(50, Math.floor(Number(b.level) || 1)));
        const maxKills = mode === "duel" ? 1 : Math.min(3, 1 + Math.floor((stage - 1) / 2) + (stage >= 2 ? 1 : 0));
        const kills = Math.max(0, Math.min(maxKills, Math.floor(Number(b.kills) || 0)));
        let gain = 0;
        if (mode === "pve") gain = (win ? 20 + stage * 10 : 5) + kills * 4;
        else gain = win ? 40 : 8;
        p.coins += gain; p.kills = (p.kills || 0) + kills; if (win) p.wins = (p.wins || 0) + 1; else p.losses = (p.losses || 0) + 1;
        await store.setJSON("prog/" + p.id, p); await syncSummary(store, p);
        let defender = null;
        if (mode === "duel" && ID_RE.test(String(b.defender || "")) && b.defender !== p.id) {
          let dp = await store.get("prog/" + b.defender, { type: "json" });
          if (dp) {
            if (win) dp.defLosses = (dp.defLosses || 0) + 1; else { dp.defWins = (dp.defWins || 0) + 1; dp.kills = (dp.kills || 0) + 1; dp.coins += 15; }
            await store.setJSON("prog/" + dp.id, dp); await syncSummary(store, dp); defender = publicProg(dp);
          }
          await store.setJSON("ch/" + b.defender + "/" + String(now).padStart(15, "0"), { at: now, attackerId: p.id, attackerName: p.name, attackerType: p.type, attackerLevel: level(p), defenderWon: !win });
        }
        return json({ gain, prog: publicProg(p), defender });
      }
      return json({ error: "ไม่รู้จักคำสั่งนี้" }, 400);
    }

    let d;
    try { d = await req.json(); } catch { return json({ error: "ข้อมูลไม่ถูกต้อง" }, 400); }
    const name = str(d.name, 30), wish = str(d.wish, 160), partner = str(d.partner, 30);
    if (!name || !wish) return json({ error: "ใส่ชื่อและคำอธิษฐานก่อนนะ" }, 400);
    const all = (name + " " + partner + " " + wish).toLowerCase();
    if (BANNED.some((w) => all.includes(w))) return json({ error: "ขอไม่ใส่ลิงก์ในกระทงนะ" }, 400);

    let photo = null;
    if (d.photo != null) {
      const prefix = "data:image/jpeg;base64,";
      if (typeof d.photo !== "string" || !d.photo.startsWith(prefix)) return json({ error: "รูปต้องเป็น JPEG" }, 400);
      const bytes = Buffer.from(d.photo.slice(prefix.length), "base64");
      if (bytes.length > MAX_PHOTO_BYTES) return json({ error: "รูปใหญ่เกินไป ลองซูมหรือเลือกรูปอื่นนะ" }, 413);
      if (bytes.length < 200 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return json({ error: "ไฟล์รูปไม่ถูกต้อง" }, 400);
      photo = bytes;
    }

    const ipKey = "ip/" + ipOf(req, context);
    const lastRaw = await store.get(ipKey);
    const now = Date.now();
    if (lastRaw && now - Number(lastRaw) < COOLDOWN_MS) {
      return json({ error: "ใจเย็นๆ นะ รออีกสักครู่แล้วค่อยลอยใบใหม่" }, 429);
    }
    await store.set(ipKey, String(now));

    const id = now.toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    if (photo) await store.set("img/" + id, photo.buffer.slice(photo.byteOffset, photo.byteOffset + photo.byteLength));
    const item = {
      id, name, partner, wish,
      type: TYPES.includes(d.type) ? d.type : "banana",
      cat: CATS.includes(d.cat) ? d.cat : "",
      candle: CANDLES.includes(d.candle) ? d.candle : "white",
      lane: num(d.lane), seed: num(d.seed), createdAt: now,
      img: !!photo,
    };
    // key starts with a zero-padded timestamp so sorting keys = sorting by time
    const key = "k/" + String(now).padStart(15, "0") + "-" + id;
    await store.setJSON(key, item);
    const token = newToken();
    await store.setJSON("prog/" + id, newProg({ ...item, key }, token));
    return json({ id, token });
  }

  if (req.method === "DELETE") {
    const admin = process.env.ADMIN_KEY;
    if (!admin || req.headers.get("x-admin-key") !== admin) return json({ error: "ไม่มีสิทธิ์" }, 403);
    const id = url.searchParams.get("id") || "";
    if (!ID_RE.test(id)) return json({ error: "ไม่พบกระทงนี้" }, 404);
    const { blobs } = await store.list({ prefix: "k/" });
    const hit = blobs.find((b) => b.key.endsWith("-" + id));
    if (hit) await store.delete(hit.key);
    await store.delete("img/" + id);
    await store.delete("prog/" + id);
    return json({ ok: true });
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = { path: "/api/krathongs" };
