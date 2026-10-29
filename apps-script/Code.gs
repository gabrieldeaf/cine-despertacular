/**
 * Votação Cine Despertacular · servidor (Google Apps Script)
 * Cole este código em Extensões > Apps Script da planilha de votação.
 * Todas as regras (horário, CPF único por filme, administrador) são conferidas aqui no servidor.
 */

// CPF do administrador (somente números). Fica só aqui, não aparece no site.
const ADMIN_CPF = '52766438220';

const FUSO = 'America/Sao_Paulo';
const DIAS = ['2026-10-30', '2026-10-31'];
const FECHA = { 14: '16:00', 19: '21:00' }; // horário em que cada sessão fecha a votação

// id = posição na lista; fim = horário em que o filme termina (Brasília)
const FILMES = [
  { t: 'Amei te Ver', fim: '14:15', s: 14 },
  { t: 'O Milagre dos Sinais', fim: '14:26', s: 14 },
  { t: 'A Chuva é Importante! Em Libras', fim: '14:36', s: 14 },
  { t: 'O Tempo', fim: '14:43', s: 14 },
  { t: 'A Dor Invisível', fim: '14:57', s: 14 },
  { t: 'Mãos Rapper', fim: '15:14', s: 14 },
  { t: 'Desperta!', fim: '19:06', s: 19 },
  { t: 'Há Sinais', fim: '19:21', s: 19 },
  { t: 'Justiça Silenciosa', fim: '19:41', s: 19 },
  { t: 'Entre Sinais e Marés', fim: '19:57', s: 19 },
  { t: 'Nunca Me Viram Gritar', fim: '20:13', s: 19 },
  { t: 'Não Alimente os Cães', fim: '20:37', s: 19 }
];

const ABA_CAD = 'Cadastros';
const ABA_VOTOS = 'Votos';
const ABA_TESTE = 'Teste';
const CAB_CAD = ['CPF', 'Nome', 'Data do cadastro'];
const CAB_VOTOS = ['CPF', 'Nome', 'Filme ID', 'Filme', 'Sessão', 'Nota', 'Dia', 'Data/hora'];

// ---------------------------------------------------------------- entrada
function doGet() {
  return ContentService.createTextOutput('Votação Cine Despertacular: servidor funcionando.');
}

function doPost(e) {
  let res;
  try {
    const req = JSON.parse(e.postData.contents || '{}');
    const acoes = { entrar, cadastrar, votar, resultado, testeVotos, limparTeste };
    if (!acoes[req.acao]) throw erro('Ação inválida.');
    res = acoes[req.acao](req);
    res.ok = true;
  } catch (err) {
    res = { ok: false, erro: err.publico ? err.message : 'Erro no servidor. Tente de novo.' };
    if (!err.publico) console.error(err);
  }
  res.agora = Date.now();
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- ações
function entrar(req) {
  const c = so(req.cpf);
  if (c === ADMIN_CPF) return { admin: true };
  if (!cpfValido(c)) throw erro('CPF inválido. Confira os números.');
  const u = acharCadastro(c);
  return { cadastrado: !!u, nome: u ? u.nome : '', votos: votosDe(ABA_VOTOS, c) };
}

function cadastrar(req) {
  const c = so(req.cpf);
  const nome = String(req.nome || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!cpfValido(c) || c === ADMIN_CPF) throw erro('CPF inválido.');
  if (nome.split(' ').length < 2 || nome.length < 5) throw erro('Digite seu nome completo (nome e sobrenome).');
  return comTrava(() => {
    let u = acharCadastro(c);
    if (!u) {
      aba(ABA_CAD, CAB_CAD).appendRow([fmt(c), nome, agoraTexto()]);
      u = { nome };
    }
    return { nome: u.nome, votos: votosDe(ABA_VOTOS, c) };
  });
}

function votar(req) {
  const c = so(req.cpf);
  const i = Number(req.filme), n = Number(req.nota);
  const teste = !!req.teste;
  if (!(Number.isInteger(i) && i >= 0 && i < FILMES.length)) throw erro('Filme inválido.');
  if (!(Number.isInteger(n) && n >= 0 && n <= 5)) throw erro('A nota precisa ser de 0 a 5.');
  const f = FILMES[i];
  let nome, nomeAba;
  if (teste) {
    if (c !== ADMIN_CPF) throw erro('Modo teste só para o administrador.');
    nome = 'Teste Administrador'; nomeAba = ABA_TESTE;
  } else {
    if (!cpfValido(c)) throw erro('CPF inválido.');
    const u = acharCadastro(c);
    if (!u) throw erro('CPF não cadastrado.');
    const st = estado(f);
    if (!st.pode) throw erro('A votação deste filme não está aberta agora (' + st.txt + ').');
    nome = u.nome; nomeAba = ABA_VOTOS;
  }
  return comTrava(() => {
    const votos = votosDe(nomeAba, c);
    if (votos[i] !== undefined) throw erro('Este CPF já votou neste filme.');
    aba(nomeAba, CAB_VOTOS).appendRow([fmt(c), nome, i, f.t, f.s + 'h', n, hoje(), agoraTexto()]);
    votos[i] = n;
    return { votos };
  });
}

function resultado(req) {
  exigirAdmin(req);
  const r = FILMES.map((f, i) => ({ i, soma: 0, votos: 0 }));
  const porCpf = {};
  linhas(ABA_VOTOS, CAB_VOTOS).forEach(l => {
    const i = Number(l[2]), n = Number(l[5]);
    if (!r[i]) return;
    r[i].soma += n; r[i].votos++;
    porCpf[l[0]] = (porCpf[l[0]] || 0) + 1;
  });
  const votantes = linhas(ABA_CAD, CAB_CAD).map(l => ({ cpf: String(l[0]), nome: String(l[1]), data: String(l[2]), qtd: porCpf[l[0]] || 0 }));
  return { filmes: r, votantes, planilha: SpreadsheetApp.getActive().getUrl() };
}

function testeVotos(req) {
  exigirAdmin(req);
  return { votos: votosDe(ABA_TESTE, ADMIN_CPF) };
}

function limparTeste(req) {
  exigirAdmin(req);
  return comTrava(() => {
    const sh = aba(ABA_TESTE, CAB_VOTOS);
    if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
    return { votos: {} };
  });
}

// ---------------------------------------------------------------- regras de horário
function ts(dia, hm) { return new Date(dia + 'T' + hm + ':00-03:00').getTime(); }
function hoje() { return Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd'); }

function estado(f) {
  const t = Date.now(), d = hoje(), hm = f.fim.replace(':', 'h');
  if (d < DIAS[0]) return { pode: false, txt: 'libera em 30/10 às ' + hm };
  if (d > DIAS[1]) return { pode: false, txt: 'votação encerrada' };
  if (t >= ts(d, FECHA[f.s])) return { pode: false, txt: 'votação encerrada' };
  if (t >= ts(d, f.fim)) return { pode: true };
  return { pode: false, txt: 'libera hoje às ' + hm };
}

// ---------------------------------------------------------------- planilha
function aba(nome, cab) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@'); // CPF como texto
  }
  return sh;
}

function linhas(nome, cab) {
  const sh = aba(nome, cab);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, cab.length).getValues();
}

function acharCadastro(c) {
  const f = fmt(c);
  const l = linhas(ABA_CAD, CAB_CAD).find(x => String(x[0]) === f);
  return l ? { nome: String(l[1]) } : null;
}

function votosDe(nomeAba, c) {
  const f = fmt(c), v = {};
  linhas(nomeAba, CAB_VOTOS).forEach(l => { if (String(l[0]) === f) v[Number(l[2])] = Number(l[5]); });
  return v;
}

// ---------------------------------------------------------------- utilitários
function comTrava(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw erro('Muita gente votando agora. Tente de novo em alguns segundos.');
  try { const r = fn(); SpreadsheetApp.flush(); return r; } finally { lock.releaseLock(); }
}
function exigirAdmin(req) { if (so(req.cpf) !== ADMIN_CPF) throw erro('Acesso negado.'); }
function erro(msg) { const e = new Error(msg); e.publico = true; return e; }
function so(s) { return String(s || '').replace(/\D/g, ''); }
function fmt(c) { return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); }
function agoraTexto() { return Utilities.formatDate(new Date(), FUSO, 'dd/MM/yyyy HH:mm:ss'); }
function cpfValido(c) {
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (let t = 9; t < 11; t++) {
    let s = 0;
    for (let i = 0; i < t; i++) s += Number(c[i]) * (t + 1 - i);
    if (((s * 10) % 11) % 10 !== Number(c[t])) return false;
  }
  return true;
}

// Rode esta função uma vez pelo editor para criar as abas e autorizar o acesso à planilha.
function configurar() {
  aba(ABA_CAD, CAB_CAD); aba(ABA_VOTOS, CAB_VOTOS); aba(ABA_TESTE, CAB_VOTOS);
  const padrao = SpreadsheetApp.getActive().getSheetByName('Página1') || SpreadsheetApp.getActive().getSheetByName('Sheet1');
  if (padrao && SpreadsheetApp.getActive().getSheets().length > 1) SpreadsheetApp.getActive().deleteSheet(padrao);
}
