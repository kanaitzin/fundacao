import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
const err = [];
p.on('pageerror', e => err.push(e.message));
p.on('console', m => { if (m.type()==='error' && !/TUNNEL|net::/.test(m.text())) err.push(m.text()); });
await p.goto('file:///home/claude/proj/atual/rede-acolher/prototipo/rede-acolher-prototipo.html');
await p.waitForTimeout(400);
await p.fill('input', 'coord.ai3@paodospobres.dev'); await p.keyboard.press('Enter'); await p.waitForTimeout(700);
const pw = await p.$$('input[type=password]');
if (pw.length) { await pw[0].fill('senha-dev-123'); await p.keyboard.press('Enter'); await p.waitForTimeout(900); }
for (const c of ['cozinha','admin_tecnico','gestor_geral']) {
  await p.selectOption('.troca-cargo-sel', c); await p.waitForTimeout(1000);
  console.log(`\n===== ${c} =====`);
  console.log((await p.innerText('body')).slice(420, 1500));
}
console.log('\nerros:', err.length ? err : 'nenhum');
await b.close();
