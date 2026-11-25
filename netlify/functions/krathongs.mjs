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
// GET    ?feed                       → ศึกล่าสุดของทั้งแม่น้ำ (ข้อความสด)
// POST   ?claim=<id>                 → รับกุญแจให้กระทงเก่าที่ยังไม่มีเจ้าของ
// POST   ?action=upgrade|sticks|respec|ascend|class|battle|dungeon_start|dungeon_end  body {id, token, ...}
import { getStore } from "@netlify/blobs";
import { createHash, randomBytes } from "node:crypto";

const TYPES = ["banana", "lotus", "bread", "coconut", "pride", "cat", "star", "ganga"];
// special types: only floatable by someone holding the key of a krathong that earned them
const SPECIAL = { ganga: (p) => !!p.deepClear || (p.bestDungeon || 0) >= 20 };
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
const MAX_LV = 20, MAX_STARS = 5, START_COINS = 60, HOURLY_SOFT_CAP = 2500, DUEL_REPEAT_MS = 15 * 60_000, CLASS_CHANGE_COST = 200, CLASS_UNLOCK_LV = 20, REROLL_COST = 40, BATTLE_COOLDOWN_MS = 12_000, N_FORTUNES = 16;
const upCost = (lv) => 25 + lv * 15;
const spentOn = (p) => STATS.reduce((a, k) => { let t = 0; for (let l = 0; l < (p.lv?.[k] || 0); l++) t += upCost(l); return a + t; }, 0);
const respecRefund = (p) => { const spent = spentOn(p); return (p.respecs || 0) === 0 ? spent : Math.floor(spent * 0.8); };
const DEV_COINS_HASH = "21a2f472ea51078ca402b32658c7f2ed079fa81b6e1e22c9661ae1f7cc5b29cb";
const sha = (t) => createHash("sha256").update(String(t)).digest("hex");
const newToken = () => randomBytes(18).toString("base64url");
const level = (p) => 1 + STATS.reduce((a, k) => a + (p.lv?.[k] || 0), 0);
const CLASSES = ["warrior", "guardian", "mystic", "racer"];
const capOf = (p) => MAX_LV + 5 * (p.stars || 0);                // each star lifts every stat cap by 5
const ascendCost = (p) => 2500 * ((p.stars || 0) + 1);
const DUNGEON_FLOORS = 20, DUNGEON_MIN_SEC_PER_FLOOR = 9, DUNGEON_CLEAR_BONUS = 500, DEEP_CLEAR_BONUS = 1500;
// gacha relics: 4 rarities x 2; duplicates level the relic up to 5
const RELICS = { scale: "R", feather: "R", fang: "SR", shell: "SR", eye: "SSR", drop: "SSR", crown: "UR", lotus: "UR",
  // set pieces: wear both pieces of a set for its set skill
  moonpin: "SR", asuraring: "SR", moonlantern: "SSR", asurablade: "SSR", nagascale: "SSR", garudafeather: "SSR", nagaorb: "UR", garudawheel: "UR" };
const RARITY_RATE = [["UR", 0.03], ["SSR", 0.12], ["SR", 0.30], ["R", 0.55]];
const GACHA_COIN_COST = 3000, PITY = 40, RELIC_MAX = 5, DUP_REFUND = 500, RELIC_SLOTS = 2;
// boss loot at the end of a dungeon run: [floor, drop chance, rarity table]
const BOSS_LOOT = [[5, 0.35, [["SR", 0.3], ["R", 0.7]]], [10, 1, [["UR", 0.04], ["SSR", 0.2], ["SR", 0.4], ["R", 0.36]]], [15, 1, [["UR", 0.08], ["SSR", 0.35], ["SR", 0.57]]], [20, 1, [["UR", 0.25], ["SSR", 0.75]]]];
function giveRelic(p, id) { p.inv = p.inv || {}; const had = p.inv[id] || 0; let refund = 0; if (had >= RELIC_MAX) { refund = DUP_REFUND; p.coins += refund; } else p.inv[id] = had + 1; return { id, rar: RELICS[id], lv: p.inv[id], dup: had > 0, refund }; }
function rollTable(tbl) { let x = Math.random(), rar = tbl[tbl.length - 1][0]; for (const [r, w] of tbl) { if (x < w) { rar = r; break; } x -= w; } const pool = Object.keys(RELICS).filter((k) => RELICS[k] === rar); return pool[Math.floor(Math.random() * pool.length)]; }
function rollRelic(p) {
  p.pity = (p.pity || 0) + 1; let rar = "R";
  if (p.pity >= PITY) rar = "UR"; else { let x = Math.random(); for (const [r, w] of RARITY_RATE) { if (x < w) { rar = r; break; } x -= w; } }
  if (rar === "UR") p.pity = 0;
  const pool = Object.keys(RELICS).filter((k) => RELICS[k] === rar); return pool[Math.floor(Math.random() * pool.length)];
}
const floorReward = (f) => (15 + 12 * f) * (f % 5 === 0 ? 2 : 1);
const drawSticks = () => { const pool = [...Array(N_FORTUNES).keys()], out = []; out.push(pool[Math.floor(Math.random() * pool.length)]); return out; };
const publicProg = (p) => p && ({ id: p.id, name: p.name, type: p.type, lv: p.lv, level: level(p), coins: p.coins, kills: p.kills || 0, respecs: p.respecs || 0, stars: p.stars || 0, cls: p.cls || null, cap: capOf(p), pve: p.pve || 1, bestPve: p.bestPve || 0, bestDungeon: p.bestDungeon || 0, tickets: p.tickets || 0, inv: p.inv || {}, relics: p.relics || [], pity: p.pity || 0, assists: p.assists || 0, skin: !!p.skin, wins: p.wins || 0, losses: p.losses || 0, defWins: p.defWins || 0, defLosses: p.defLosses || 0, sticks: p.sticks || null });
function newProg(item, token) {
  return { id: item.id, key: item.key, name: item.name, type: item.type, tokenHash: sha(token), coins: START_COINS,
    lv: { hp: 0, atk: 0, def: 0, spd: 0, sk: 0 }, sticks: null, kills: 0, wins: 0, losses: 0, defWins: 0, defLosses: 0, lastBattle: 0 };
}
async function findKey(store, id) { const { blobs } = await store.list({ prefix: "k/" }); const hit = blobs.find((b) => b.key.endsWith("-" + id)); return hit ? hit.key : null; }
async function syncSummary(store, p) {
  if (!p.key) return; const it = await store.get(p.key, { type: "json" }); if (!it) return;
  it.lv = level(p); it.kills = p.kills || 0; it.stars = p.stars || 0; it.cls = p.cls || null; it.relics = (p.relics || []).map((r) => [r, p.inv?.[r] || 1]); it.skin = p.skin && p.cls ? p.cls : null; await store.setJSON(p.key, it);
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
    if (url.searchParams.has("feed")) {
      const { blobs: fb } = await store.list({ prefix: "feed/" });
      const keys = fb.map((b) => b.key).sort().reverse();
      const feed = (await Promise.all(keys.slice(0, 25).map((k) => store.get(k, { type: "json" })))).filter(Boolean);
      if (keys.length > 300) await Promise.all(keys.slice(300).map((k) => store.delete(k)));   // keep the feed small
      return json({ feed }, 200, { "cache-control": "public, max-age=5" });
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
        const cur = p.lv[st] || 0; if (cur >= capOf(p)) return json({ error: "ตันแล้ว ยกระดับดาวเพื่อปลดเพดาน" }, 400);
        const cost = upCost(cur); if (p.coins < cost) return json({ error: "เหรียญไม่พอ" }, 400);
        p.coins -= cost; p.lv[st] = cur + 1;
        await store.setJSON("prog/" + p.id, p); await syncSummary(store, p);
        return json({ prog: publicProg(p) });
      }
      if (action === "devcoins") {                     // owner's dev mode: needs the krathong's token and the secret code
        if (sha("lk-dev-coins:" + String(b.code || "").trim()) !== DEV_COINS_HASH) return json({ error: "รหัสลับไม่ถูกต้อง" }, 403);
        const amt = Math.max(0, Math.min(100000, Math.floor(Number(b.amount) || 0)));
        p.coins += amt; await store.setJSON("prog/" + p.id, p);
        return json({ prog: publicProg(p), added: amt });
      }
      if (action === "ascend") {
        if ((p.stars || 0) >= MAX_STARS) return json({ error: "ดาวเต็มแล้ว" }, 400);
        if (STATS.some((k) => (p.lv[k] || 0) < capOf(p))) return json({ error: "ต้องอัปทุกค่าให้ตันก่อน" }, 400);
        const cost = ascendCost(p); if (p.coins < cost) return json({ error: "เหรียญไม่พอ" }, 400);
        p.coins -= cost; p.stars = (p.stars || 0) + 1;
        await store.setJSON("prog/" + p.id, p); await syncSummary(store, p);
        return json({ prog: publicProg(p) });
      }
      if (action === "skin") {                          // cosmetic: show the class skin instead of the krathong's own look
        if (!p.cls) return json({ error: "เลือกคลาสก่อนจึงจะใช้สกินคลาสได้" }, 400);
        p.skin = !!b.on; await store.setJSON("prog/" + p.id, p); await syncSummary(store, p);
        return json({ prog: publicProg(p) });
      }
      if (action === "class") {
        const c = String(b.cls || ""); if (!CLASSES.includes(c)) return json({ error: "ไม่มีคลาสนี้" }, 400);
        if (level(p) < CLASS_UNLOCK_LV && !(p.stars >= 1)) return json({ error: `ปลดล็อกคลาสเมื่อกระทงถึง Lv.${CLASS_UNLOCK_LV}` }, 400);
        if (p.cls === c) return json({ prog: publicProg(p) });
        if (p.cls) { if (p.coins < CLASS_CHANGE_COST) return json({ error: "เหรียญไม่พอ" }, 400); p.coins -= CLASS_CHANGE_COST; }
        p.cls = c; await store.setJSON("prog/" + p.id, p); await syncSummary(store, p);
        return json({ prog: publicProg(p) });
      }
      if (action === "dungeon_start") {
        const from = Number(b.from) === 11 && (p.bestDungeon || 0) >= 10 ? 11 : 1;
        // party: up to 2 allies (other krathongs, AI-controlled in the browser); they get a share of the coins
        const allies = (Array.isArray(b.allies) ? b.allies : []).map(String).filter((x, i, a) => ID_RE.test(x) && x !== p.id && a.indexOf(x) === i).slice(0, 2);
        p.run = { id: Math.random().toString(36).slice(2, 10), t0: Date.now(), from, allies };
        await store.setJSON("prog/" + p.id, p);
        return json({ runId: p.run.id, from });
      }
      if (action === "dungeon_end") {
        const run = p.run; if (!run || run.id !== b.runId) return json({ error: "ไม่พบรอบดันเจี้ยนนี้" }, 400);
        const now = Date.now(), elapsed = (now - run.t0) / 1000;
        // a floor can't be cleared faster than the countdown plus a short fight
        // b.floors = the deepest floor cleared; a floor can't be cleared faster than the countdown plus a short fight
        const from = run.from || 1;
        const count = Math.max(0, Math.min(DUNGEON_FLOORS - from + 1, Math.floor(Number(b.floors) || 0) - from + 1, Math.floor(elapsed / DUNGEON_MIN_SEC_PER_FLOOR)));
        const floors = from - 1 + count;
        let gain = 0; for (let f = from; f <= floors; f++) gain += floorReward(f);
        let note = "", tickets = 0; const notes = [];
        if (from <= 10 && floors >= 10) { tickets += 1; if (!p.dungeonClear) { gain += DUNGEON_CLEAR_BONUS; tickets += 2; p.dungeonClear = true; notes.push(`พิชิตราชาปีศาจครั้งแรก! +${DUNGEON_CLEAR_BONUS} เหรียญ`); } }
        if (from <= 15 && floors >= 15) tickets += 1;
        if (floors >= 20) { tickets += 2; if (!p.deepClear) { gain += DEEP_CLEAR_BONUS; tickets += 3; p.deepClear = true; notes.push(`พิชิตนรกชั้นในครั้งแรก! +${DEEP_CLEAR_BONUS} เหรียญ`); } }
        if (tickets) { p.tickets = (p.tickets || 0) + tickets; notes.push(`ได้ตั๋วหีบสมบัติ ${tickets} ใบ`); }
        const loot = []; for (const [bf, ch, tbl] of BOSS_LOOT) if (from <= bf && floors >= bf && Math.random() < ch) loot.push(giveRelic(p, rollTable(tbl)));
        note = notes.join(" · ");
        if (!p.hour || now - p.hour.t0 > 3600_000) p.hour = { t0: now, earned: 0 };
        if (p.hour.earned >= HOURLY_SOFT_CAP) { gain = Math.ceil(gain * 0.2); note = (note ? note + " · " : "") + "ฟาร์มหนักแล้วชั่วโมงนี้ เหรียญลดเหลือ 20% (รีเซ็ตทุกชั่วโมง)"; }
        p.hour.earned += gain; p.coins += gain; p.kills = (p.kills || 0) + Math.max(0, Math.min(40, Math.floor(Number(b.kills) || 0)));
        p.bestDungeon = Math.max(p.bestDungeon || 0, floors); p.run = null;
        await store.setJSON("prog/" + p.id, p); await syncSummary(store, p);
        if (floors >= 5) await store.setJSON("feed/" + String(now).padStart(15, "0") + "-" + Math.random().toString(36).slice(2, 7), { at: now, kind: "dungeon", a: p.name, aType: p.type, aLv: level(p), floor: floors });
        if (loot.some((g) => g.rar === "UR")) for (const g of loot) if (g.rar === "UR") await store.setJSON("feed/" + String(now).padStart(15, "0") + "-" + Math.random().toString(36).slice(2, 7), { at: now, kind: "gacha", a: p.name, aType: p.type, aLv: level(p), item: g.id, drop: true });
        // allies' share: 20% of the run's coins (before the leader's own cap), at most 1,500 per ally per hour
        const helped = [];
        for (const aid of run.allies || []) { if (!count) break; const ap = await store.get("prog/" + aid, { type: "json" }); if (!ap) continue;
          if (!ap.allyHour || now - ap.allyHour.t0 > 3600_000) ap.allyHour = { t0: now, earned: 0 };
          const share = Math.max(5, Math.min(1500 - ap.allyHour.earned, Math.round(gain * 0.2))); if (share <= 0) continue;
          ap.allyHour.earned += share; ap.coins = (ap.coins || 0) + share; ap.assists = (ap.assists || 0) + 1; await store.setJSON("prog/" + aid, ap);
          await store.setJSON("ch/" + aid + "/" + String(now).padStart(15, "0") + Math.floor(Math.random() * 9), { at: now, kind: "assist", attackerId: p.id, attackerName: p.name, attackerType: p.type, attackerLevel: level(p), floors, coins: share });
          helped.push({ id: aid, name: ap.name, coins: share }); }
        return json({ gain, floors, note, tickets, loot, helped, prog: publicProg(p) });
      }
      if (action === "gacha") {
        const n = Number(b.n) === 10 ? 10 : 1;
        if (b.pay === "coins") { const cost = GACHA_COIN_COST * n; if (p.coins < cost) return json({ error: "เหรียญไม่พอ" }, 400); p.coins -= cost; }
        else { if ((p.tickets || 0) < n) return json({ error: "ตั๋วไม่พอ" }, 400); p.tickets -= n; }
        const got = []; for (let i = 0; i < n; i++) got.push(giveRelic(p, rollRelic(p)));
        p.relics = p.relics || []; if (p.relics.length < RELIC_SLOTS && !p.relics.includes(got[0].id)) p.relics.push(got[0].id);
        await store.setJSON("prog/" + p.id, p); await syncSummary(store, p);
        const now = Date.now(); for (const g of got) if (g.rar === "UR") await store.setJSON("feed/" + String(now).padStart(15, "0") + "-" + Math.random().toString(36).slice(2, 7), { at: now, kind: "gacha", a: p.name, aType: p.type, aLv: level(p), item: g.id });
        return json({ got, prog: publicProg(p) });
      }
      if (action === "equip") {
        const want = (Array.isArray(b.relics) ? b.relics : []).map(String).filter((r, i, a) => a.indexOf(r) === i).slice(0, RELIC_SLOTS);
        if (want.some((r) => !(p.inv?.[r] > 0))) return json({ error: "ยังไม่มีเครื่องรางนี้" }, 400);
        p.relics = want; await store.setJSON("prog/" + p.id, p); await syncSummary(store, p);
        return json({ prog: publicProg(p) });
      }
      if (action === "respec") {
        if (level(p) <= 1) return json({ error: "ยังไม่ได้อัปค่าพลัง" }, 400);
        const refund = respecRefund(p);
        p.coins += refund; p.lv = { hp: 0, atk: 0, def: 0, spd: 0, sk: 0 }; p.respecs = (p.respecs || 0) + 1;
        await store.setJSON("prog/" + p.id, p); await syncSummary(store, p);
        return json({ refund, prog: publicProg(p) });
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
        // the stage is tracked here, not trusted from the browser; older saves may claim up to one stage per recorded win
        if (!p.pve) p.pve = Math.max(1, Math.min(Math.floor(Number(b.level) || 1), (p.wins || 0) + 1));
        const stage = mode === "pve" ? Math.max(1, Math.min(p.pve, Math.floor(Number(b.level) || 1))) : 1;
        const boss = mode === "pve" && stage % 5 === 0;
        const maxKills = mode === "duel" ? 1 : boss ? (stage >= 10 ? 2 : 1) : Math.min(3, 1 + Math.floor((stage - 1) / 2) + (stage >= 2 ? 1 : 0));
        const kills = Math.max(0, Math.min(maxKills, Math.floor(Number(b.kills) || 0)));
        let gain = 0, note = "";
        if (mode === "pve") {
          gain = (win ? 20 + stage * 8 : 5) + kills * 3; if (win && boss) gain *= 2;
          if (win) { p.pve = Math.max(p.pve, stage + 1); p.bestPve = Math.max(p.bestPve || 0, stage); }
        } else {
          p.duels = p.duels || {}; const last = p.duels[b.defender] || 0;
          if (now - last < DUEL_REPEAT_MS) { gain = win ? 4 : 2; note = "ท้าคนเดิมถี่เกินไป ได้เหรียญน้อยลง (รอ 15 นาที)"; }
          else { let dLv = 1; const dp0 = ID_RE.test(String(b.defender || "")) ? await store.get("prog/" + b.defender, { type: "json" }) : null; if (dp0) dLv = level(dp0) + 10 * (dp0.stars || 0);
            const aLv = level(p) + 10 * (p.stars || 0); gain = win ? Math.round(Math.max(10, Math.min(70, 15 + 30 * dLv / aLv))) : 8; }
          p.duels[b.defender] = now;
          for (const k of Object.keys(p.duels)) if (now - p.duels[k] > DUEL_REPEAT_MS) delete p.duels[k];
        }
        if (!p.hour || now - p.hour.t0 > 3600_000) p.hour = { t0: now, earned: 0 };
        if (p.hour.earned >= HOURLY_SOFT_CAP) { gain = Math.ceil(gain * 0.2); note = "ฟาร์มหนักแล้วชั่วโมงนี้ เหรียญลดเหลือ 20% (รีเซ็ตทุกชั่วโมง)"; }
        p.hour.earned += gain;
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
        const feedKey = "feed/" + String(now).padStart(15, "0") + "-" + Math.random().toString(36).slice(2, 7);
        if (mode === "duel" && defender) await store.setJSON(feedKey, { at: now, kind: "duel", a: p.name, aType: p.type, aLv: level(p), d: defender.name, dType: defender.type, dLv: defender.level, attackerWon: win });
        else if (mode === "pve" && win && stage >= 3) await store.setJSON(feedKey, { at: now, kind: "pve", a: p.name, aType: p.type, aLv: level(p), stage });
        return json({ gain, note, prog: publicProg(p), defender });
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

    if (SPECIAL[d.type]) {
      const u = d.unlock || {}; const up = ID_RE.test(String(u.id || "")) ? await store.get("prog/" + u.id, { type: "json" }) : null;
      if (!up || up.tokenHash !== sha(u.token || "") || !SPECIAL[d.type](up)) return json({ error: "กระทงแบบนี้ปลดล็อกเมื่อพิชิตดันเจี้ยนชั้น 20" }, 400);
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
