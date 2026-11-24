const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8808/'); await p.evaluate(() => { localStorage.setItem('lk.scene', '0'); }); await p.reload();
  await p.waitForTimeout(2500);
  // sky lanterns and a few fireworks for atmosphere
  for (const [x, y] of [[880, 260], [960, 200], [1040, 280], [820, 150], [1110, 170], [760, 230], [690, 120]]) { await p.mouse.click(x, y); await p.waitForTimeout(90); }
  await p.click('#btnFire'); await p.waitForTimeout(150); await p.click('#btnLantern');
  await p.addStyleTag({ content: `
    .top,.scenes,.cta-wrap,.status,.empty,.toast,#ticker,.drawer{display:none!important}
    #ogShade{position:fixed;inset:0;z-index:49;background:radial-gradient(ellipse 60% 55% at 22% 22%,rgba(4,6,26,.62),rgba(4,6,26,0))}
    #ogTitle{position:fixed;left:54px;top:46px;z-index:50;color:#fff;font-family:"Bai Jamjuree",sans-serif;text-shadow:0 4px 24px rgba(0,0,0,.6)}
    #ogTitle h1{margin:0;font-family:"Srisakdi",serif;font-size:96px;line-height:1;color:#ffc861;text-shadow:0 0 30px rgba(255,180,80,.65),0 4px 18px rgba(0,0,0,.6)}
    #ogTitle p{margin:14px 0 0;font-size:26px;font-weight:600;letter-spacing:.01em}
    #ogTitle .chips{display:flex;gap:10px;margin-top:18px}
    #ogTitle .chips span{background:rgba(14,18,48,.72);border:1px solid rgba(255,214,140,.45);border-radius:999px;padding:7px 16px;font-size:19px;font-weight:600}
    #ogTitle .cta{display:inline-block;margin-top:20px;background:linear-gradient(180deg,#ffe2a0,#ffc861 50%,#e59a2b);color:#2a1600;border-radius:999px;padding:10px 26px;font-size:22px;font-weight:700;box-shadow:0 0 30px rgba(255,170,60,.5)}` });
  await p.evaluate(() => { const d = document.createElement('div'); d.id = 'ogTitle';
    d.innerHTML = '<h1>ลอยกระทงออนไลน์</h1><p>ลอยกระทงคืนวันเพ็ญ ไปพร้อมกับทุกคน</p><div class="chips"><span>✨ อธิษฐาน</span><span>🎋 เสี่ยงเซียมซี</span><span>⚔ ศึกกระทง</span></div><div class="cta">แตะเพื่อลอยกระทงฟรี</div>';
    document.body.appendChild(d); const sh=document.createElement('div'); sh.id='ogShade'; document.body.appendChild(sh); });
  await p.waitForTimeout(1900);
  await p.screenshot({ path: 'og_raw.png' });
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
