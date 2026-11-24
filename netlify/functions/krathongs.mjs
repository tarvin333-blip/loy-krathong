// ลอยกระทงออนไลน์ — API เก็บกระทงไว้ใน Netlify Blobs
// GET    /api/krathongs              → กระทงล่าสุด 150 ใบ
// GET    /api/krathongs?img=<id>     → รูปบนกระทง (JPEG)
// POST   /api/krathongs              → ลอยกระทงใบใหม่ (จำกัด 1 ใบ / 20 วินาที / IP)
// POST   /api/krathongs?report=<id>  → แจ้งไม่เหมาะสม (ครบ 3 IP กระทงจะถูกซ่อน)
// DELETE /api/krathongs?id=<id>      → ลบ (ต้องส่ง header x-admin-key = ADMIN_KEY)
import { getStore } from "@netlify/blobs";

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
    await store.setJSON("k/" + String(now).padStart(15, "0") + "-" + id, item);
    return json({ id });
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
    return json({ ok: true });
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = { path: "/api/krathongs" };
