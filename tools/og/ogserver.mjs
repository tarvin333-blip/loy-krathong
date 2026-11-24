// Serves the site with a hand-placed set of demo krathongs (fictional names) for the cover shot.
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT = new URL("../../public", import.meta.url).pathname;
// p = where along the river (0..1 of the screen), lane = depth, seed sets the drift period
const DEMO = [
  { id: "d1", name: "มะลิ", type: "lotus", candle: "pink", lane: .42, seed: .2, p: .4 },
  { id: "d2", name: "ข้าวหอม ♥ ภู", type: "banana", candle: "gold", lane: .78, seed: .55, p: .47 },
  { id: "d3", name: "ดาวเหนือ", type: "star", candle: "violet", lane: .58, seed: .8, p: .64, lv: 5, kills: 12 },
  { id: "d4", name: "น้องส้ม", type: "cat", candle: "white", lane: .30, seed: .35, p: .75 },
  { id: "d5", name: "ฟ้าใส", type: "pride", candle: "blue", lane: .85, seed: .1, p: .8 },
  { id: "d6", name: "ทะเลดาว", type: "coconut", candle: "gold", lane: .25, seed: .65, p: .55 },
  { id: "d7", name: "ขนมปังอุ่นๆ", type: "bread", candle: "white", lane: .7, seed: .45, p: .3 },
];
function items() {
  const now = Date.now();
  return DEMO.map(d => { const period = 120 + d.seed * 90; let prog = (d.p * 1.2 + .1) / 1.2; let el = ((prog - .42) % 1 + 1) % 1 * period; if (el < 5) el += period;
    return { ...d, wish: "ขอให้มีความสุข", cat: "love", createdAt: now - el * 1000 }; });
}
http.createServer((req, res) => {
  if (req.url.startsWith("/api/krathongs")) { res.setHeader("content-type", "application/json");
    if (req.url.includes("feed")) return res.end('{"feed":[]}'); if (req.url.includes("img=")) { res.writeHead(404); return res.end(); }
    return res.end(JSON.stringify({ items: items() })); }
  const u = req.url.split("?")[0]; const f = path.join(ROOT, decodeURIComponent(u === "/" ? "/index.html" : u));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.setHeader("content-type", { ".html": "text/html; charset=utf-8", ".webp": "image/webp", ".png": "image/png", ".mp3": "audio/mpeg" }[path.extname(f)] || "application/octet-stream");
  res.end(fs.readFileSync(f));
}).listen(8808);
