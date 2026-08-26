import { chromium } from 'playwright';
import fs from 'fs';
// wrap file in skeleton like Artifact does
const content = fs.readFileSync('rede-acolher-prototipo.html','utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${content}</body></html>`;
fs.writeFileSync('/tmp/wrapped.html', html);
const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const errors = [];
const page = await browser.newPage({viewport:{width:420,height:860}});
page.on('console', m => { if(m.type()==='error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: '+e.message));
await page.goto('file:///tmp/wrapped.html');
await page.waitForTimeout(600);
await page.screenshot({path:'shot-educador-tl.png'});
// navigate roles/tabs
const steps = [
  ["A.setTab('kids')","kids"],["A.openKid(18)","perfil"],["A.closeKid();A.setTab('chamada');A.abrirChamada()","chamada"],
  ["A.marcarTodosNormais();A.fecharChamada()","chamada-done"],
  ["A.setTab('meds')","meds"],["A.medSheet('m4')","med-sheet"],["A.medOk('m4','Administrado no horário')","med-ok"],
  ["A.setTab('passagem')","passagem"],["A.testemunho('Presenciei integralmente');A.assinarPassagem()","passagem-ok"],
  ["A.setRole('lider')","lider"],["A.setTab('ata')","lider-ata"],["A.fecharAta(true)","lider-ata-pend"],
  ["A.setRole('noturno')","noturno"],["A.visitaSheet('AI2')","noturno-sheet"],["A.visitaOk('AI2','Visita à casa')","noturno-ok"],["A.setTab('ataGeral')","noturno-ata"],["A.fecharAtaGeral()","noturno-ata-ok"],
  ["A.setRole('enfermagem')","enf"],["A.setTab('triagem')","enf-triagem"],["A.assinarTriagem('t1')","enf-assinada"],
  ["A.setRole('tecnica')","tec"],["A.setTab('narrativas')","tec-narr"],
  ["A.setRole('coordenador')","coord"],["A.setTab('banco')","coord-banco"],["A.reauthOk()","coord-banco-ok"],["A.setTab('aprova')","coord-aprova"],
  ["A.setRole('gestor')","gestor"],["A.gestorAbrir('AI3')","gestor-casa"],
  ["A.setRole('educador');A.toggleOffline()","educador-offline"],["A.medSheet('m5')","med-offline-block"],
  ["A.closeSheet();A.valNotes()","valnotes"],
];
for(const [code,name] of steps){
  try { await page.evaluate(code); } catch(e){ errors.push(`STEP ${name}: ${e.message}`); }
  await page.waitForTimeout(120);
}
await page.screenshot({path:'shot-final.png'});
// dark theme check
await page.evaluate("A.closeSheet();document.documentElement.setAttribute('data-theme','dark');A.setRole('educador')");
await page.waitForTimeout(200);
await page.screenshot({path:'shot-dark.png'});
console.log(errors.length? 'ERRORS:\n'+errors.join('\n') : 'NO CONSOLE/JS ERRORS');
await browser.close();
