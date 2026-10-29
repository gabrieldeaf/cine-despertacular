/**
 * Votação Cine Despertacular · servidor (Google Apps Script)
 * Cole este código em Extensões > Apps Script da planilha de votação.
 * Regra: cada CPF tem UM voto (1 filme favorito) e pode trocar até o encerramento. Vale o último.
 */

// CPF do administrador (somente números). Fica só aqui, não aparece no site.
const ADMIN_CPF = '52766438220';

const FUSO = 'America/Sao_Paulo';
const ENCERRA = '2026-10-31T22:00:00-03:00'; // fim da votação (Brasília)

const FILMES = [
  { t: 'Amei te Ver', s: 14 },
  { t: 'O Milagre dos Sinais', s: 14 },
  { t: 'A Chuva é Importante! Em Libras', s: 14 },
  { t: 'O Tempo', s: 14 },
  { t: 'A Dor Invisível', s: 14 },
  { t: 'Mãos Rapper', s: 14 },
  { t: 'Desperta!', s: 19 },
  { t: 'Há Sinais', s: 19 },
  { t: 'Justiça Silenciosa', s: 19 },
  { t: 'Entre Sinais e Marés', s: 19 },
  { t: 'Nunca Me Viram Gritar', s: 19 },
  { t: 'Não Alimente os Cães', s: 19 }
];

const ABA_CAD = 'Cadastros';
const ABA_VOTOS = 'Votos';
const ABA_TESTE = 'Teste';
const CAB_CAD = ['CPF', 'Nome', 'Data do cadastro'];
const CAB_VOTOS = ['CPF', 'Nome', 'Filme ID', 'Filme', 'Sessão', 'Data/hora do voto', 'Trocas'];

// ---------------------------------------------------------------- entrada
function doGet() {
  return ContentService.createTextOutput('Votação Cine Despertacular: servidor funcionando.');
}

function doPost(e) {
  let res;
  try {
    const req = JSON.parse(e.postData.contents || '{}');
    const acoes = { entrar, cadastrar, votar, resultado, testeVoto, limparTeste };
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
  return { cadastrado: !!u, nome: u ? u.nome : '', voto: votoDe(ABA_VOTOS, c), encerrada: encerrada() };
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
    return { nome: u.nome, voto: votoDe(ABA_VOTOS, c) };
  });
}

function votar(req) {
  const c = so(req.cpf);
  const i = Number(req.filme);
  const teste = !!req.teste;
  if (!(Number.isInteger(i) && i >= 0 && i < FILMES.length)) throw erro('Filme inválido.');
  const f = FILMES[i];
  let nome, nomeAba;
  if (teste) {
    if (c !== ADMIN_CPF) throw erro('Modo teste só para o administrador.');
    nome = 'Teste Administrador'; nomeAba = ABA_TESTE;
  } else {
    if (!cpfValido(c)) throw erro('CPF inválido.');
    const u = acharCadastro(c);
    if (!u) throw erro('CPF não cadastrado.');
    if (encerrada()) throw erro('A votação foi encerrada.');
    nome = u.nome; nomeAba = ABA_VOTOS;
  }
  return comTrava(() => {
    const sh = aba(nomeAba, CAB_VOTOS);
    const fc = fmt(c);
    const ls = linhas(nomeAba, CAB_VOTOS);
    const k = ls.findIndex(x => String(x[0]) === fc);
    if (k === -1) {
      sh.appendRow([fc, nome, i, f.t, f.s + 'h', agoraTexto(), 0]);
    } else {
      const trocas = (Number(ls[k][6]) || 0) + (Number(ls[k][2]) === i ? 0 : 1);
      sh.getRange(k + 2, 3, 1, 5).setValues([[i, f.t, f.s + 'h', agoraTexto(), trocas]]);
    }
    return { voto: i };
  });
}

function resultado(req) {
  exigirAdmin(req);
  const r = FILMES.map((f, i) => ({ i, votos: 0 }));
  const escolha = {};
  linhas(ABA_VOTOS, CAB_VOTOS).forEach(l => {
    const i = Number(l[2]);
    if (!r[i]) return;
    r[i].votos++;
    escolha[l[0]] = i;
  });
  const votantes = linhas(ABA_CAD, CAB_CAD).map(l => ({
    cpf: String(l[0]), nome: String(l[1]), data: String(l[2]),
    filme: escolha[l[0]] === undefined ? null : escolha[l[0]]
  }));
  return { filmes: r, votantes, planilha: SpreadsheetApp.getActive().getUrl() };
}

function testeVoto(req) {
  exigirAdmin(req);
  return { voto: votoDe(ABA_TESTE, ADMIN_CPF) };
}

function limparTeste(req) {
  exigirAdmin(req);
  return comTrava(() => {
    const sh = aba(ABA_TESTE, CAB_VOTOS);
    if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
    return { voto: null };
  });
}

// ---------------------------------------------------------------- período de votação
function encerrada() { return Date.now() >= new Date(ENCERRA).getTime(); }

// ---------------------------------------------------------------- planilha
function aba(nome, cab) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.getRange('A:A').setNumberFormat('@'); // CPF como texto
    sh.setFrozenRows(1);
  }
  const atual = sh.getRange(1, 1, 1, cab.length).getValues()[0].join('|');
  if (atual !== cab.join('|')) sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
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

function votoDe(nomeAba, c) {
  const f = fmt(c);
  const l = linhas(nomeAba, CAB_VOTOS).find(x => String(x[0]) === f);
  return l ? Number(l[2]) : null;
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

// Rode esta função pelo editor para criar/atualizar as abas e autorizar o acesso à planilha.
function configurar() {
  aba(ABA_CAD, CAB_CAD); aba(ABA_VOTOS, CAB_VOTOS); aba(ABA_TESTE, CAB_VOTOS);
  const ss = SpreadsheetApp.getActive();
  [ABA_VOTOS, ABA_TESTE].forEach(n => { const sh = ss.getSheetByName(n); if (sh.getMaxColumns() > 7) sh.getRange(1, 8, sh.getMaxRows(), sh.getMaxColumns() - 7).clearContent(); });
  const padrao = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
  if (padrao && ss.getSheets().length > 1) ss.deleteSheet(padrao);
}
