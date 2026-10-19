/**
 * OS ARQUIVOS DO SERVIDOR DO PÃO (fase 227).
 *
 * O serviço, o proxy e o instalador são copiados para a máquina no dia da
 * instalação, e um erro neles só aparece lá: a foto recusada pelo proxy antes
 * de chegar ao serviço, o serviço subindo pelo `tsx` (que não existe no
 * servidor), a conferência que esquece a chave do cofre. Esta suíte lê os três
 * e cobra o que tem de bater com o resto do sistema.
 */
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const RAIZ = join(__dirname, '..', '..');
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8');
const mb = (s: string) => Number(/(\d+)\s*mb/i.exec(s)?.[1] ?? NaN);

describe('Os arquivos do servidor do Pão', () => {
  it('o proxy aceita pelo menos o corpo que o serviço aceita (a foto chega ao serviço)', () => {
    const servico = mb(/LIMITE_DO_CORPO = '([^']+)'/.exec(ler('backend/src/kernel/common/corpo-da-requisicao.ts'))![1]);
    const proxy = mb(/max_size\s+(\d+\s*MB)/i.exec(ler('scripts/servidor/Caddyfile'))![1]);
    expect(servico).toBeGreaterThan(0);
    expect(proxy).toBeGreaterThanOrEqual(servico);
  });

  it('o proxy repassa a API ao serviço e serve a tela compilada', () => {
    const c = ler('scripts/servidor/Caddyfile');
    expect(c).toMatch(/handle \/api\/\*\s*\{\s*reverse_proxy 127\.0\.0\.1:3000/);
    expect(c).toMatch(/root \* \/opt\/rede-acolher\/frontend\/dist/);
    expect(c).toMatch(/try_files \{path\} \/index\.html/);
  });

  it('o serviço roda o compilado, com o .env, e volta sozinho se cair', () => {
    const s = ler('scripts/servidor/rede-acolher.service');
    expect(s).toMatch(/^ExecStart=\/usr\/bin\/node dist\/main\.js$/m);
    expect(s).toMatch(/^WorkingDirectory=\/opt\/rede-acolher\/backend$/m);
    expect(s).toMatch(/^EnvironmentFile=\/opt\/rede-acolher\/\.env$/m);
    expect(s).toMatch(/^Restart=always$/m);
    expect(s).not.toMatch(/tsx|npm run dev/);
    expect(existsSync(join(RAIZ, 'backend', 'src', 'main.ts'))).toBe(true);
  });

  it('o instalador confere as três variáveis que decidem a segurança (§12.1)', () => {
    const i = ler('scripts/instalar.sh');
    for (const v of ['SESSION_PEPPER', 'CREDENTIAL_KEY', 'DATABASE_APP_URL']) expect(i).toContain(v);
    /* E o que roda sozinho: o que o cron chama tem de ser o que o instalador procura. */
    const cron = ler('scripts/relogio.crontab');
    for (const chave of ['relogio:prod', 'fim-do-plantao:prod']) {
      expect(cron).toContain(chave);
      expect(i).toContain(chave);
    }
  });

  it('conferir não muda nada e diz o que falta (com um .env que é o do exemplo)', () => {
    const r = spawnSync('bash', [join(RAIZ, 'scripts', 'instalar.sh')], {
      env: { ...process.env, ENV_ARQUIVO: join(RAIZ, '.env.example') }, encoding: 'utf8', timeout: 60_000,
    });
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/SESSION_PEPPER com o valor do exemplo/);
    expect(r.stdout).toMatch(/CREDENTIAL_KEY com o valor do exemplo/);
    expect(r.stdout).toMatch(/Nada foi mudado/);
  });

  it('o .env.example não tem comentário na linha do valor (o systemd o leria como valor)', () => {
    const linhas = ler('.env.example').split('\n')
      .filter((l) => /^[A-Z_]+=[^#]*\S\s+#/.test(l));
    expect(linhas).toEqual([]);
  });

  it('o zero que desliga os limites do banco é da simulação, e o instalador o recusa', () => {
    const env = join(mkdtempSync(join(tmpdir(), 'instalar-')), '.env');
    writeFileSync(env, readFileSync(join(RAIZ, '.env.example'), 'utf8')
      .replace(/^BANCO_LIMITE_PARADA_MS=.*$/m, 'BANCO_LIMITE_PARADA_MS=0'));
    const r = spawnSync('bash', [join(RAIZ, 'scripts', 'instalar.sh')], {
      env: { ...process.env, ENV_ARQUIVO: env }, encoding: 'utf8', timeout: 60_000,
    });
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/BANCO_LIMITE_PARADA_MS=0 desliga o limite/);
    expect(r.stdout).not.toMatch(/BANCO_LIMITE_CONSULTA_MS=0/);
  });
});
