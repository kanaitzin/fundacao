/**
 * CABE, ROLA E VOLTA (fase 255, pedido de 31/10: "confira se todas as telas
 * cabem e não vazam nada, se elas têm um rolamento para tudo e se tem como
 * voltar, tudo isso de forma limpa e organizada").
 *
 * O `ensaio:celular` mede cada tela de PRIMEIRO nível (as abas e as portas do
 * Mais). Este entra em tudo o que se abre a partir delas, em cada cargo, a 360
 * e 390 px e no monitor (1366 px):
 *
 *  - as ABAS de dentro de cada tela;
 *  - cada botão que abre uma folha de criar (`data-acolhe-abre`);
 *  - cada botão que entra num registro (`data-acolhe-entra`), o cartão da
 *    criança e o primeiro cartão de cada lista (`button.card.row`), até três
 *    níveis (a lista, o perfil, o dossiê).
 *
 * Em cada estado aberto ele mede:
 *
 *  - VAZA: a página mais larga que o aparelho, ou um elemento passando da borda;
 *  - PRESO: conteúdo cortado dentro de uma caixa que não rola (`overflow`
 *    escondido, com mais altura dentro do que fora);
 *  - O FIM DA FOLHA: rolada até o fim, o último botão da folha fica dentro da
 *    tela e não fica coberto por nada (é ele que grava ou cancela);
 *  - A VOLTA: toda folha tem um Fechar, Cancelar ou Voltar, e toda subtela um
 *    voltar (o "← …" ou um Voltar). E o ensaio APERTA esse botão e confere que
 *    voltou: a folha sumiu, ou o botão que levou até ali está à vista de novo.
 *
 * Só abre e volta: nenhum botão marcado grava (`data-acolhe-abre` só abre o
 * formulário, `data-acolhe-entra` só entra), e nada é preenchido.
 *
 * Uso: ENSAIO_CHROMIUM=/caminho/do/chrome npm run ensaio:cabe
 *      ENSAIO_LARGURAS=360 para uma largura; ENSAIO_CARGOS=educador para um cargo.
 *      ENSAIO_LETRA=grande ou maior mede com a letra aumentada (pedido de 05/11),
 *      com a régua convertida: a página mede sem o zoom, as caixas com ele.
 * Foto de cada achado em /tmp/ensaio-cabe.
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ARQUIVO = process.env.ENSAIO_ARQUIVO
  ?? resolve(AQUI, '..', 'prototipo', 'rede-acolher-prototipo.html');
const EXECUTAVEL = process.env.ENSAIO_CHROMIUM;
const SAIDA = process.env.ENSAIO_SAIDA ?? `/tmp/ensaio-cabe${process.env.ENSAIO_LETRA ? `-${process.env.ENSAIO_LETRA}` : ''}`;
const LETRA = process.env.ENSAIO_LETRA ?? 'normal';
const LARGURAS = (process.env.ENSAIO_LARGURAS ?? '360,390,1366').split(',').map(Number);
const SO_CARGOS = (process.env.ENSAIO_CARGOS ?? '').split(',').filter(Boolean);
/** Até quantos níveis abaixo da tela ele entra (a lista, o perfil, o dossiê). */
const PROFUNDIDADE = Number(process.env.ENSAIO_PROFUNDIDADE ?? 3);

if (!EXECUTAVEL || !existsSync(EXECUTAVEL)) {
  console.error('ENSAIO_CHROMIUM não aponta para um executável. Rode `bash scripts/preparar-ambiente.sh`.');
  process.exit(2);
}
mkdirSync(SAIDA, { recursive: true });

const navegador = await chromium.launch({
  executablePath: EXECUTAVEL, args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const achados = [];
let estados = 0;
let voltas = 0;
const esp = (pg, ms) => pg.waitForTimeout(ms);
const limpo = (t) => (t ?? '').replace(/\s+/g, ' ').trim();

/** O que pode ser aberto a partir do que está à vista agora (só dentro do `main`). */
const ABRE = '[data-acolhe-abre]';
/* E o botão sem marca que, pelo nome, abre ou mostra alguma coisa. Os que gravam
   ou decidem ficam de fora pelo nome, e a pessoa nunca preenche nada aqui. */
const VERBO_DE_ABRIR = /^(Registrar|Abrir|Ver|Nova|Novo|Pedir|Anexar|Cadastrar|Adicionar|Acrescentar|Corrigir|Editar|Escolher|Detalhes|Trocar|Marcar|Mudar|Baixar|Ler|Mostrar|Propor|Montar|Gerar|Definir|Lançar|Avisar|Solicitar|Pedido|Receitas|Dossiê|Relatório|Folha|Imprimir|Histórico|Quem)\b/i;
const NAO_APERTAR = /(galeria|câmera|tirar foto|^Registrar a (saída|volta|chegada))|^(Salvar|Gravar|Confirmar|Assinar|Enviar|Concluir|Excluir|Encerrar|Remover|Tirar|Apagar|Sair|Desmarcar|Aprovar|Recusar|Devolver|Publicar|Dei|Não dei)\b/i;
const ENTRA = '[data-acolhe-entra], .pessoa-cartao, button.card.row';
const VOLTA_DA_FOLHA = /^(Fechar|Voltar|Cancelar|Concluir)$/i;
const VOLTA_DA_SUBTELA = /^(←|Voltar\b|Fechar\b|Cancelar\b)/i;

/** Mede o estado aberto agora. Devolve a lista de problemas, em frases. */
async function medir(pg) {
  return pg.evaluate(({ voltaFolha, voltaSub }) => {
    const re = (s) => new RegExp(s.source, s.flags);
    const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const vw = document.documentElement.clientWidth * z;
    const vh = window.innerHeight;
    const out = [];
    const visivel = (e) => {
      const s = getComputedStyle(e);
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
      const b = e.getBoundingClientRect();
      return b.width > 0 && b.height > 0;
    };
    const nome = (e) => {
      const t = (e.getAttribute('aria-label') || e.innerText || e.value || '').trim();
      const c = typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : '';
      return `${e.tagName.toLowerCase()}${c} "${t.slice(0, 40).replace(/\s+/g, ' ')}"`;
    };
    const rolaDeLado = (e) => {
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (['auto', 'scroll', 'hidden', 'clip'].includes(ox)) return true;
      }
      return false;
    };
    const folhas = [...document.querySelectorAll('.overlay')].filter(visivel);
    const folha = folhas[folhas.length - 1] ?? null;
    const raiz = folha ?? document.querySelector('main.conteudo') ?? document.body;

    /* VAZA */
    const vaza = Math.round((document.documentElement.scrollWidth - document.documentElement.clientWidth) * z);
    if (vaza > 1) out.push(`a página anda ${vaza}px para o lado`);
    let fora = 0;
    for (const e of raiz.querySelectorAll('*')) {
      if (fora >= 3 || !visivel(e)) continue;
      const b = e.getBoundingClientRect();
      if (b.right > vw + 1 && b.left < vw && !rolaDeLado(e)) { out.push(`passa da borda: ${nome(e)} até ${Math.round(b.right)}px`); fora++; }
    }

    /* O TEXTO QUE VAZA DO PRÓPRIO BOTÃO (pedido de 05/11, com a letra grande).
       O selo posto por cima (o número de avisos) é absoluto e não conta. */
    let naoCabe = 0;
    for (const e of raiz.querySelectorAll('button, [role=tab]')) {
      if (naoCabe >= 3 || !visivel(e)) continue;
      const temSelo = [...e.querySelectorAll('*')].some((f) => ['absolute', 'fixed'].includes(getComputedStyle(f).position));
      const s = getComputedStyle(e);
      if (!temSelo && s.overflowX === 'visible' && e.scrollWidth > e.clientWidth + 2) {
        out.push(`texto não cabe no botão: ${nome(e)} ${e.scrollWidth}>${e.clientWidth}`); naoCabe++;
      }
    }

    /* PRESO: caixa que esconde o que transborda, com controle ou texto lá embaixo. */
    let presos = 0;
    for (const e of raiz.querySelectorAll('*')) {
      if (presos >= 3 || !visivel(e)) continue;
      const s = getComputedStyle(e);
      if (!['hidden', 'clip'].includes(s.overflowY)) continue;
      if (s.webkitLineClamp && s.webkitLineClamp !== 'none') continue;
      if (e.clientHeight < 60 || e.scrollHeight <= e.clientHeight + 4) continue;
      const caixa = e.getBoundingClientRect();
      const cortado = [...e.querySelectorAll('button, input, textarea, select, a[href], p, li, label')]
        .find((f) => visivel(f) && f.getBoundingClientRect().top >= caixa.bottom - 2);
      if (cortado) { out.push(`conteúdo preso sem rolagem: ${nome(e)} esconde ${nome(cortado)}`); presos++; }
    }

    if (folha) {
      /* O FIM DA FOLHA: tudo o que rola dentro dela, até o fim. */
      for (const e of [folha, ...folha.querySelectorAll('*')]) {
        if (e.scrollHeight > e.clientHeight + 2 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY)) {
          e.scrollTop = e.scrollHeight;
        }
      }
      const botoes = [...folha.querySelectorAll('button')].filter((b) => visivel(b) && !b.closest('.acolhe-painel'));
      const ultimo = botoes[botoes.length - 1];
      if (ultimo) {
        const b = ultimo.getBoundingClientRect();
        if (b.bottom > vh + 1 || b.top < -1) out.push(`o fim da folha não se alcança: ${nome(ultimo)} em ${Math.round(b.top)}–${Math.round(b.bottom)}px de ${vh}px`);
        else {
          const no = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          if (no && no !== ultimo && !ultimo.contains(no)) out.push(`o fim da folha fica coberto: ${nome(ultimo)} sob ${nome(no)}`);
        }
      }
      for (const e of [folha, ...folha.querySelectorAll('*')]) e.scrollTop = 0;
      /* A VOLTA da folha. */
      const fecha = [...folha.querySelectorAll('button')].filter(visivel)
        .some((b) => re(voltaFolha).test((b.getAttribute('aria-label') || b.innerText || '').trim()));
      if (!fecha) out.push('a folha não tem Fechar, Cancelar nem Voltar');
    }
    return { problemas: out, temFolha: !!folha, folhas: folhas.length,
      voltaSub: [...(document.querySelector('main.conteudo')?.querySelectorAll('button') ?? [])]
        .filter(visivel).some((b) => re(voltaSub).test((b.getAttribute('aria-label') || b.innerText || '').trim())) };
  }, { voltaFolha: { source: VOLTA_DA_FOLHA.source, flags: 'i' }, voltaSub: { source: VOLTA_DA_SUBTELA.source, flags: 'i' } });
}

for (const largura of LARGURAS) {
  const celular = largura < 1080;
  const pg = await navegador.newPage({
    viewport: { width: largura, height: celular ? (largura === 360 ? 780 : 844) : 900 },
    isMobile: celular, hasTouch: celular, deviceScaleFactor: celular ? 2 : 1,
    locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
  });
  const erros = [];
  pg.on('pageerror', (e) => erros.push(e.message));
  /* A letra escolhida, guardada no aparelho antes de a página abrir (vale também no recomeço). */
  await pg.addInitScript((l) => { try { localStorage.setItem('rede-acolher.letra', l); } catch { /* sem guarda */ } }, LETRA);
  await pg.goto(`file://${ARQUIVO}`);
  await esp(pg, 900);
  await pg.getByRole('button', { name: 'Marcelo Barbosa' }).click();
  await pg.getByRole('button', { name: /Entrar no sistema/i }).click();
  await esp(pg, 1200);
  const seletor = pg.locator('select.troca-cargo-sel');
  const cargos = (await seletor.locator('option').evaluateAll((os) =>
    os.map((o) => ({ valor: o.value, rotulo: o.textContent.trim() }))))
    .filter((c) => !SO_CARGOS.length || SO_CARGOS.includes(c.valor));
  console.log(`\n${celular ? '📱' : '🖥️ '} ${largura} px, letra ${LETRA} — ${cargos.length} cargos`);

  /** Entra de novo do zero, no mesmo cargo: para quando uma folha não deixa sair. */
  let cargoAtual = null;
  async function recomecar() {
    await pg.goto(`file://${ARQUIVO}`); await esp(pg, 900);
    await pg.getByRole('button', { name: 'Marcelo Barbosa' }).click();
    await pg.getByRole('button', { name: /Entrar no sistema/i }).click(); await esp(pg, 1200);
    if (cargoAtual) { await seletor.selectOption(cargoAtual); await esp(pg, 900); }
  }

  /** Fecha toda folha aberta, pelo próprio botão dela. Devolve falso se alguma não sai. */
  async function fecharTudo() {
    for (let i = 0; i < 4 && await pg.locator('.overlay').count(); i++) {
      const b = pg.locator('.overlay').last().getByRole('button', { name: VOLTA_DA_FOLHA }).filter({ visible: true }).last();
      if (await b.count()) await b.click({ timeout: 3000 }).catch(() => {}); else await pg.keyboard.press('Escape');
      await esp(pg, 250);
    }
    if (await pg.locator('.overlay').count()) { await recomecar(); return false; }
    return true;
  }

  /** Abre uma tela de primeiro nível pelo nome, como a pessoa abre. */
  async function abrirTela(nome) {
    await fecharTudo();
    if (nome === '(a tela única)') { await esp(pg, 300); return true; }
    if (celular) {
      const naBarra = pg.locator('nav.tabbar button').filter({ hasText: nome }).filter({ visible: true });
      if (await naBarra.count()) { await naBarra.first().click({ timeout: 5000 }).catch(() => {}); await esp(pg, 700); return true; }
      const mais = pg.locator('nav.tabbar button', { hasText: 'Mais' });
      if (!(await mais.count())) return false;
      await mais.first().click({ timeout: 5000 }).catch(() => {}); await esp(pg, 300);
      const porta = pg.locator('.overlay .sheet button.card.row').filter({ hasText: nome });
      if (!(await porta.count())) { await fecharTudo(); return false; }
      await porta.first().click({ timeout: 5000 }).catch(() => {}); await esp(pg, 800);
      return true;
    }
    const b = pg.locator('nav.tabbar button, nav.portas-lateral button').filter({ visible: true })
      .filter({ has: pg.locator('.rotulo', { hasText: new RegExp(`^${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) });
    if (!(await b.count())) return false;
    await b.first().click({ timeout: 5000 }).catch(() => {}); await esp(pg, 800);
    return true;
  }

  /** Os passos que levam a um estado: a tela e o que se apertou depois. */
  async function irPara(tela, passos, deNovo = true) {
    if (!(await abrirTela(tela))) return false;
    for (const p of passos) {
      const alvo = pg.locator('main.conteudo').locator(p.sel).filter({ visible: true }).filter({ hasText: p.texto });
      const achou = (await alvo.count()) > p.n
        && await alvo.nth(p.n).click({ timeout: 5000 }).then(() => true).catch(() => false);
      /* O que se abriu da vez anterior continua aberto quando a tela volta (um
         formulário, um plantão), e o botão que o abriu não está mais à vista:
         recomeça do zero, uma vez. */
      if (!achou) {
        if (!deNovo) return false;
        await recomecar();
        return irPara(tela, passos, false);
      }
      await esp(pg, 700);
    }
    return true;
  }

  /** O que dá para abrir no `main` agora, sem repetir rótulo. */
  async function oQueAbre() {
    return pg.locator('main.conteudo').evaluate((m, { abre, entra, verboFonte, naoFonte }) => {
      const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e);
        return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && !e.disabled; };
      const vistos = new Map();
      const out = [];
      const porClasse = {};
      const verbo = new RegExp(verboFonte, 'i');
      const nao = new RegExp(naoFonte, 'i');
      for (const e of m.querySelectorAll(`${abre}, ${entra}, [role=tab], button`)) {
        if (!vis(e) || e.closest('.overlay')) continue;
        /* A primeira linha: o Playwright procura no texto sem as quebras, e a
           linha inteira de um cartão ("Alice" + "7 anos") não casaria. */
        const texto = ((e.innerText || '').split('\n').map((l) => l.trim()).find(Boolean)
          || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        if (!texto) continue;
        let tipo = e.getAttribute('role') === 'tab' ? 'aba' : e.matches(abre) ? 'abre' : e.matches(entra) ? 'entra' : null;
        if (!tipo) {
          if (!verbo.test(texto) || nao.test(texto) || e.closest('form')) continue;
          tipo = 'botao';
        }
        const sel = tipo === 'aba' ? '[role=tab]' : tipo === 'abre' ? abre : tipo === 'entra' ? entra : 'button';
        /* Das listas, o primeiro cartão basta: os outros abrem a mesma folha. */
        const classe = e.matches('.pessoa-cartao') ? 'pessoa' : e.matches('button.card.row') ? 'linha' : null;
        if (classe) { porClasse[classe] = (porClasse[classe] ?? 0) + 1; if (porClasse[classe] > 1) continue; }
        const chave = `${tipo}:${texto}`;
        const n = vistos.get(chave) ?? 0;
        vistos.set(chave, n + 1);
        if (n > 0) continue;
        out.push({ tipo, sel, texto, n: 0 });
      }
      return out.slice(0, 18);
    }, { abre: ABRE, entra: ENTRA, verboFonte: VERBO_DE_ABRIR.source, naoFonte: NAO_APERTAR.source }).catch(() => []);
  }

  let fotos = 0;
  async function anotar(cargo, onde, problemas) {
    if (!problemas.length) return 0;
    const foto = `${SAIDA}/${largura}-${cargo}-${String(++fotos).padStart(3, '0')}.png`;
    await pg.screenshot({ path: foto }).catch(() => {});
    for (const p of problemas) {
      achados.push(`[${largura} · ${cargo} · ${onde}] ${p} (${foto})`);
      console.log(`    ✗ ${onde}: ${p}`);
    }
    return problemas.length;
  }

  /** Mede o estado, aperta a volta e confere que voltou. */
  async function conferirEVoltar(cargo, onde, item, antesFolhas, onde2 = {}) {
    const m = await medir(pg);
    estados++;
    const problemas = [...m.problemas, ...erros.splice(0).map((e) => `erro da página: ${e}`)];
    let abriuSubtela = false;
    if (m.folhas > antesFolhas) {
      /* Volta pela folha: o Fechar, o Voltar ou o Cancelar. */
      const b = pg.locator('.overlay').last().getByRole('button', { name: VOLTA_DA_FOLHA }).filter({ visible: true });
      if (await b.count()) {
        await b.first().click().catch(() => {}); await esp(pg, 400);
        voltas++;
        if ((await pg.locator('.overlay').count()) >= m.folhas) problemas.push(`o ${limpo(await b.first().innerText().catch(() => 'Fechar'))} da folha não fechou a folha`);
      }
    } else if (item && item.tipo !== 'aba' && !onde2.noLugar && !onde2.outraTela) {
      /* O botão sumiu e a tela é a mesma: o conteúdo foi trocado por outro, e é
         uma subtela. Quem leva a outra tela do menu volta pelo menu, que está
         sempre à vista; quem só abre ou fecha um trecho continua no lugar. */
      abriuSubtela = true;
      if (!onde2.voltaNova) problemas.push('o que se abriu não tem volta própria (nem ←, Voltar, Fechar ou Cancelar)');
    }
    return { n: await anotar(cargo, onde, problemas), abriuSubtela, folha: m.folhas > antesFolhas };
  }

  /** As voltas à vista no `main` agora, por texto. */
  async function voltasAVista() {
    return pg.locator('main.conteudo').evaluate((m, fonte) => {
      const re = new RegExp(fonte, 'i');
      return [...m.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().height > 0)
        .map((b) => (b.getAttribute('aria-label') || b.innerText || '').replace(/\s+/g, ' ').trim())
        .filter((t) => re.test(t));
    }, VOLTA_DA_SUBTELA.source).catch(() => []);
  }
  /** A volta que nasceu com o que se abriu (e não a do nível de cima). */
  const novas = (antes, depois) => {
    const resto = [...antes];
    return depois.filter((t) => { const i = resto.indexOf(t); if (i >= 0) { resto.splice(i, 1); return false; } return true; });
  };

  /** Volta da subtela pela volta dela, e confere que o botão de origem reapareceu. */
  async function voltarDaSubtela(cargo, onde, item, texto) {
    if (!texto) return 0;
    const b = pg.locator('main.conteudo button').filter({ visible: true })
      .filter({ hasText: texto }).last();
    if (!(await b.count())) return 0;
    await b.click(); await esp(pg, 700);
    voltas++;
    const voltou = await pg.locator('main.conteudo').locator(item.sel).filter({ visible: true }).filter({ hasText: item.texto }).count();
    return voltou ? 0 : anotar(cargo, onde, [`o ${texto} não voltou para onde estava`]);
  }

  /** Percorre um nível: cada aba, folha e entrada à vista, e desce nas entradas. */
  async function percorrer(cargo, tela, passos, nivel, rotulo, abasDoPai = new Set()) {
    let n = 0;
    const itens = await oQueAbre();
    if (process.env.ENSAIO_DEPURAR) console.log(`    ${rotulo}: ${itens.map((i) => `${i.tipo}:${i.texto.slice(0, 30)}`).join(' | ') || '(nada)'}`);
    /* As abas por último: aberta uma aba, ela continua aberta quando a tela volta,
       e o que estava atrás da primeira sumiria da vista. */
    const ordem = [...itens.filter((i) => i.tipo !== 'aba' && !abasDoPai.has(i.texto)),
      ...itens.filter((i) => i.tipo === 'aba' && !abasDoPai.has(i.texto))];
    const abasAqui = new Set([...abasDoPai, ...itens.filter((i) => i.tipo === 'aba').map((i) => i.texto)]);
    for (const item of ordem) {
      if (!(await irPara(tela, passos))) { n += await anotar(cargo, rotulo, [`não consegui voltar a "${rotulo}" pelo mesmo caminho`]); break; }
      const alvo = pg.locator('main.conteudo').locator(item.sel).filter({ visible: true }).filter({ hasText: item.texto });
      if (!(await alvo.count())) continue;
      const antes = await pg.locator('.overlay').count();
      const telaAntes = await pg.locator('main.conteudo').getAttribute('data-tela');
      const voltasAntes = await voltasAVista();
      await alvo.first().evaluate((e) => e.setAttribute('data-ensaio-clicado', '1'));
      await alvo.first().click({ timeout: 5000 }).catch(() => {}); await esp(pg, 700);
      const noLugar = await pg.evaluate(() => {
        const e = document.querySelector('[data-ensaio-clicado]');
        const fica = !!e && e.getBoundingClientRect().height > 0;
        e?.removeAttribute('data-ensaio-clicado');
        return fica;
      });
      const outraTela = (await pg.locator('main.conteudo').getAttribute('data-tela')) !== telaAntes;
      const onde = `${rotulo} › ${item.texto.slice(0, 40)}`;
      const voltaNova = novas(voltasAntes, await voltasAVista())[0] ?? null;
      const r = await conferirEVoltar(cargo, onde, item, antes, { noLugar, outraTela, voltaNova });
      if (item.tipo === 'aba' && nivel < PROFUNDIDADE) {
        n += await percorrer(cargo, tela, [...passos, item], nivel + 1, onde, abasAqui);
      }
      if (process.env.ENSAIO_DEPURAR) console.log(`      ${item.tipo}:${item.texto.slice(0, 30)} → ${r.folha ? 'folha' : r.abriuSubtela ? 'subtela' : outraTela ? 'outra tela' : 'no lugar'}${r.n ? ` ✗${r.n}` : ''}`);
      n += r.n;
      if (r.abriuSubtela) {
        if (nivel < PROFUNDIDADE) n += await percorrer(cargo, tela, [...passos, item], nivel + 1, onde, abasAqui);
        if (voltaNova && await irPara(tela, [...passos, item])) n += await voltarDaSubtela(cargo, onde, item, voltaNova);
      }
    }
    return n;
  }

  for (const cargo of cargos) {
    cargoAtual = cargo.valor;
    await fecharTudo();
    await seletor.selectOption(cargo.valor);
    await esp(pg, 900);
    erros.length = 0;
    let telas;
    if (celular) {
      telas = (await pg.locator('nav.tabbar button').filter({ visible: true }).allInnerTexts())
        .map(limpo).filter((t) => t && !/^Mais$/i.test(t));
      const mais = pg.locator('nav.tabbar button', { hasText: 'Mais' });
      if (await mais.count()) {
        await mais.first().click(); await esp(pg, 300);
        telas.push(...(await pg.locator('.overlay .sheet button.card.row b.ff').allInnerTexts()).map(limpo));
        await fecharTudo();
      }
    } else {
      telas = (await pg.locator('nav.tabbar button .rotulo, nav.portas-lateral button .rotulo').filter({ visible: true }).allInnerTexts()).map(limpo);
    }
    telas = [...new Set(telas.filter(Boolean))];
    /* Quem tem uma tela só (a portaria) não tem barra: a tela é a que abre. */
    const unica = !telas.length;
    if (unica) telas = ['(a tela única)'];
    let n = 0;
    for (const tela of telas) {
      if (!(await abrirTela(tela))) { n += await anotar(cargo.valor, tela, ['a tela não abriu pelo menu']); continue; }
      n += (await conferirEVoltar(cargo.valor, tela, null, 0)).n;
      n += await percorrer(cargo.valor, tela, [], 1, tela);
    }
    console.log(`  ${n ? '✗' : '✓'} ${cargo.rotulo} — ${telas.length} telas${n ? `, ${n} achado(s)` : ''}`);
  }
  await pg.close();
}
await navegador.close();

console.log(`\n${estados} estados abertos e medidos, ${voltas} voltas apertadas e conferidas.`);
if (achados.length) {
  console.log(`\n${achados.length} achado(s):`);
  for (const a of achados) console.log(`  · ${a}`);
  process.exit(1);
}
console.log('Nenhum achado: tudo cabe, nada fica preso sem rolagem, o fim de toda folha se alcança, e de toda folha e subtela se volta.');
