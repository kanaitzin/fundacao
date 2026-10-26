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
import { spawnSync, spawn, type ChildProcess } from 'node:child_process';

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

  it('a resposta da Acolhe+AI em pedaços passa pelo proxy na hora (fase 240)', () => {
    expect(ler('scripts/servidor/Caddyfile'))
      .toMatch(/handle \/api\/v1\/assistente\/conversa\/aos-poucos\s*\{\s*reverse_proxy 127\.0\.0\.1:3000\s*\{\s*flush_interval -1/);
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

  /*
   * A Acolhe+AI no computador do Pão (fase 247). O serviço só usa o motor local com
   * o endereço e o modelo, e sem um deles cai calado no modo guia: a conferência
   * pergunta à máquina. A máquina de mentira roda num processo à parte, porque o
   * `spawnSync` para este processo enquanto o instalador espera a resposta.
   */
  describe('a conferência da Acolhe+AI no computador do Pão', () => {
    let maquina: ChildProcess;
    let porta = 0;

    beforeAll(async () => {
      maquina = spawn(process.execPath, ['-e', `
        require('node:http').createServer((req, res) => {
          if (req.url !== '/v1/models') { res.statusCode = 404; return res.end(); }
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ object: 'list', data: [{ id: 'qwen2.5:14b' }, { id: 'llama3.2:latest' }] }));
        }).listen(0, '127.0.0.1', function () { console.log(this.address().port); });`]);
      porta = await new Promise<number>((ok, falha) => {
        maquina.stdout!.once('data', (d) => ok(Number(String(d).trim())));
        maquina.once('error', falha);
      });
    });
    afterAll(() => { maquina?.kill(); });

    const conferir = (troca: Record<string, string>) => {
      let texto = readFileSync(join(RAIZ, '.env.example'), 'utf8');
      for (const [v, valor] of Object.entries(troca)) texto = texto.replace(new RegExp(`^${v}=.*$`, 'm'), `${v}=${valor}`);
      const env = join(mkdtempSync(join(tmpdir(), 'instalar-')), '.env');
      writeFileSync(env, texto);
      return spawnSync('bash', [join(RAIZ, 'scripts', 'instalar.sh')], {
        env: { ...process.env, ENV_ARQUIVO: env }, encoding: 'utf8', timeout: 60_000,
      }).stdout;
    };

    it('o modelo que a máquina tem passa, e o nome sem a etiqueta vale como latest', () => {
      expect(conferir({ ACOLHE_AI_MOTOR: 'local', ACOLHE_AI_LOCAL_URL: `http://127.0.0.1:${porta}/v1`, ACOLHE_AI_LOCAL_MODELO: 'qwen2.5:14b' }))
        .toMatch(/✓.*a Acolhe\+AI no computador do Pão \(qwen2\.5:14b em 127\.0\.0\.1\)/);
      expect(conferir({ ACOLHE_AI_MOTOR: 'local', ACOLHE_AI_LOCAL_URL: `http://127.0.0.1:${porta}/v1/`, ACOLHE_AI_LOCAL_MODELO: 'llama3.2' }))
        .toMatch(/✓.*a Acolhe\+AI no computador do Pão \(llama3\.2 em/);
    });

    it('o modelo que a máquina não tem reprova, com os nomes que ela tem', () => {
      const r = conferir({ ACOLHE_AI_MOTOR: 'local', ACOLHE_AI_LOCAL_URL: `http://127.0.0.1:${porta}/v1`, ACOLHE_AI_LOCAL_MODELO: 'gemma3' });
      expect(r).toMatch(/✗.*o modelo gemma3 não está no computador da Acolhe\+AI/);
      expect(r).toMatch(/qwen2\.5:14b llama3\.2:latest/);
    });

    it('a máquina que não responde reprova, e o endereço sem /v1 também', () => {
      expect(conferir({ ACOLHE_AI_MOTOR: 'local', ACOLHE_AI_LOCAL_URL: 'http://127.0.0.1:9/v1', ACOLHE_AI_LOCAL_MODELO: 'qwen2.5:14b' }))
        .toMatch(/✗.*o computador da Acolhe\+AI não responde/);
      expect(conferir({ ACOLHE_AI_MOTOR: 'local', ACOLHE_AI_LOCAL_URL: `http://127.0.0.1:${porta}`, ACOLHE_AI_LOCAL_MODELO: 'qwen2.5:14b' }))
        .toMatch(/✗.*não termina em \/v1/);
    });

    it('o motor local sem o modelo reprova (o serviço cairia calado no modo guia)', () => {
      expect(conferir({ ACOLHE_AI_MOTOR: 'local', ACOLHE_AI_LOCAL_URL: `http://127.0.0.1:${porta}/v1` }))
        .toMatch(/✗.*ACOLHE_AI_MOTOR=local sem o endereço ou sem o modelo/);
    });

    it('motor que o serviço não conhece reprova, e a chave sem uso avisa', () => {
      expect(conferir({ ACOLHE_AI_MOTOR: 'ollama' })).toMatch(/✗.*ACOLHE_AI_MOTOR=ollama não é um motor/);
      expect(conferir({ ACOLHE_AI_MOTOR: 'local', ACOLHE_AI_LOCAL_URL: `http://127.0.0.1:${porta}/v1`,
        ACOLHE_AI_LOCAL_MODELO: 'qwen2.5:14b', ANTHROPIC_API_KEY: 'chave-de-teste' }))
        .toMatch(/○.*ANTHROPIC_API_KEY preenchida com o motor local/);
    });

    it('a conferência lê o motor como o serviço lê (os nomes das variáveis batem)', () => {
      const servico = ler('backend/src/modules/assistente/assistente.service.ts');
      const instalador = ler('scripts/instalar.sh');
      for (const v of ['ACOLHE_AI_MOTOR', 'ACOLHE_AI_LOCAL_URL', 'ACOLHE_AI_LOCAL_MODELO']) {
        expect(servico).toContain(`process.env.${v}`);
        expect(instalador).toContain(`val ${v}`);
      }
      expect(servico).toMatch(/ACOLHE_AI_MOTOR\?\.trim\(\) === 'local'/);
    });
  });
});
