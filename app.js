/* App Viagens & Despesas — Quimicer */
'use strict';

const SUPABASE_URL = 'https://msjyjwwlafpjpixsnbjm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Rv9Aq6g6cU8prVxgJ5SYWw_5Q-RA8Ko';
const BUCKET = 'comprovantes';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const S = {
  sessao: null, eu: null,
  categorias: [], centros: [], perfis: [], equipes: [],
  recuperandoSenha: false,
};

const CARGOS = { colaborador: 'Colaborador', gestor: 'Gestor', financeiro: 'Financeiro', admin: 'Administrador' };
const GRUPOS = { funcionario: 'Restituir ao funcionário', empresa: 'Pago pela empresa (cartão)', diversos: 'Diversos' };
const GRUPOS_CURTO = { funcionario: 'Eu paguei', empresa: 'Empresa / cartão', diversos: 'Diversos' };
const ST_DESP = { rascunho: 'Rascunho', enviada: 'Enviada', aprovada: 'Aprovada', recusada: 'Recusada', paga: 'Paga' };
const ST_VIAG = { aberta: 'Aberta', encerrada: 'Encerrada', cancelada: 'Cancelada' };

// ---------- utilitários ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (iso) => (iso ? Relatorio.dataBR(iso) : '');
const hoje = () => new Date().toLocaleDateString('sv-SE');
const eAdmin = () => S.eu?.cargo === 'admin';
const eFin = () => ['financeiro', 'admin'].includes(S.eu?.cargo);
const eGestor = () => ['gestor', 'admin'].includes(S.eu?.cargo);
const stBadge = (s, mapa = ST_DESP) => `<span class="st st-${esc(s)}">${esc(mapa[s] || s)}</span>`;
const nomePerfil = (id) => { const p = S.perfis.find((x) => x.id === id); return p ? (p.nome || p.email) : '—'; };
const parseValor = (s) => {
  s = String(s || '').trim().replace(/\s|R\$/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

function aviso(msg, erro = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (erro ? ' erro' : ''); t.hidden = false;
  clearTimeout(aviso._t); aviso._t = setTimeout(() => (t.hidden = true), erro ? 6000 : 3000);
}
function traduzErro(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e);
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/User already registered/i.test(m)) return 'Este e-mail já está cadastrado.';
  if (/Password should be at least/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/row-level security|violates row-level/i.test(m)) return 'Você não tem permissão para esta ação.';
  if (/rate limit/i.test(m)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (/mime type|not supported/i.test(m)) return 'Tipo de arquivo não aceito. Envie foto (JPG/PNG/HEIC) ou PDF.';
  if (/exceeded the maximum allowed size|Payload too large/i.test(m)) return 'Arquivo muito grande (máximo 10 MB).';
  return m;
}
function erro(e) { console.error(e); aviso(traduzErro(e), true); }
async function q(promessa) {
  const { data, error } = await promessa;
  if (error) throw error;
  return data;
}

function abrirModal(html, largo = false) {
  const box = $('#modal-box');
  box.className = 'modal-box' + (largo ? ' largo' : '');
  box.innerHTML = html;
  $('#modal').hidden = false;
  const f = box.querySelector('input:not([type=hidden]),select,textarea');
  if (f && window.innerWidth > 700) f.focus();
  return box;
}
function fecharModal() { $('#modal').hidden = true; $('#modal-box').innerHTML = ''; }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-fechar]')) fecharModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) fecharModal(); });

function confirmar(msg, textoOk = 'Confirmar', perigo = false) {
  return new Promise((res) => {
    const box = abrirModal(`<h3>${esc(msg)}</h3>
      <div class="acoes"><button class="btn sec" id="c-nao">Cancelar</button>
      <button class="btn ${perigo ? 'perigo' : ''}" id="c-sim">${esc(textoOk)}</button></div>`);
    box.querySelector('#c-nao').onclick = () => { fecharModal(); res(false); };
    box.querySelector('#c-sim').onclick = () => { fecharModal(); res(true); };
  });
}
function pedirTexto(titulo, rotulo) {
  return new Promise((res) => {
    const box = abrirModal(`<h3>${esc(titulo)}</h3><label>${esc(rotulo)}</label><textarea id="pt-txt"></textarea>
      <div class="acoes"><button class="btn sec" id="pt-nao">Cancelar</button><button class="btn" id="pt-sim">Confirmar</button></div>`);
    box.querySelector('#pt-nao').onclick = () => { fecharModal(); res(null); };
    box.querySelector('#pt-sim').onclick = () => {
      const v = box.querySelector('#pt-txt').value.trim();
      if (!v) return aviso('Preencha o campo.', true);
      fecharModal(); res(v);
    };
  });
}

// ---------- dados de apoio ----------
async function carregarApoio() {
  const [cats, cen, per, eq] = await Promise.all([
    q(sb.from('categorias').select('*').order('ordem')),
    q(sb.from('centros_custo').select('*').order('nome')),
    q(sb.from('perfis').select('*').order('nome')),
    q(sb.from('equipes').select('*').order('nome')),
  ]);
  S.categorias = cats; S.centros = cen; S.perfis = per; S.equipes = eq;
}
async function carregarEu() {
  const uid = S.sessao?.user?.id;
  if (!uid) { S.eu = null; return; }
  S.eu = await q(sb.from('perfis').select('*').eq('id', uid).maybeSingle());
}

// ---------- autenticação ----------
function telaLogin(modo = 'entrar') {
  $('#topo').hidden = true;
  const app = $('#app');
  const titulos = { entrar: 'Entrar', cadastrar: 'Criar conta', esqueci: 'Recuperar senha', nova: 'Nova senha' };
  app.innerHTML = `<div class="login">
    <div class="logo"><img src="logo_quimicer.png" alt="Quimicer"><h1>Viagens &amp; Despesas</h1></div>
    <div class="card"><h2 style="margin-top:0">${titulos[modo]}</h2>
    <form id="f-login">
      ${modo === 'cadastrar' ? '<label>Nome completo</label><input name="nome" required autocomplete="name">' : ''}
      ${modo !== 'nova' ? '<label>E-mail</label><input name="email" type="email" required autocomplete="email">' : ''}
      ${modo === 'entrar' || modo === 'cadastrar' || modo === 'nova'
        ? `<label>${modo === 'nova' ? 'Nova senha' : 'Senha'}</label><input name="senha" type="password" required minlength="6" autocomplete="${modo === 'entrar' ? 'current-password' : 'new-password'}">` : ''}
      <div class="acoes" style="justify-content:stretch"><button class="btn" style="flex:1">${titulos[modo]}</button></div>
    </form>
    <div class="linha entre peq" style="margin-top:.8rem">
      ${modo === 'entrar' ? '<button class="btn link" data-m="cadastrar">Criar conta</button><button class="btn link" data-m="esqueci">Esqueci a senha</button>'
        : modo === 'nova' ? '' : '<button class="btn link" data-m="entrar">Voltar para o login</button>'}
    </div></div></div>`;
  $$('[data-m]', app).forEach((b) => (b.onclick = () => telaLogin(b.dataset.m)));
  $('#f-login').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      if (modo === 'entrar') {
        await q(sb.auth.signInWithPassword({ email: f.get('email').trim(), password: f.get('senha') }));
      } else if (modo === 'cadastrar') {
        const r = await q(sb.auth.signUp({ email: f.get('email').trim(), password: f.get('senha'), options: { data: { nome: f.get('nome').trim() } } }));
        if (!r.session) { aviso('Conta criada. Faça o login.'); telaLogin('entrar'); }
      } else if (modo === 'esqueci') {
        await q(sb.auth.resetPasswordForEmail(f.get('email').trim(), { redirectTo: location.origin + location.pathname }));
        aviso('Se o e-mail estiver cadastrado, você receberá um link para criar nova senha.');
        telaLogin('entrar');
      } else if (modo === 'nova') {
        await q(sb.auth.updateUser({ password: f.get('senha') }));
        S.recuperandoSenha = false;
        aviso('Senha alterada.');
        iniciar();
      }
    } catch (err) { erro(err); } finally { btn.disabled = false; }
  };
}

function telaAguardando() {
  $('#topo').hidden = true;
  $('#app').innerHTML = `<div class="login"><div class="logo"><img src="logo_quimicer.png" alt="Quimicer"></div>
    <div class="card"><h2 style="margin-top:0">Cadastro recebido</h2>
    <p>Olá, ${esc(S.eu?.nome || S.sessao.user.email)}. Seu acesso precisa ser liberado por um administrador.</p>
    <p class="suave peq">Assim que for liberado, entre novamente.</p>
    <div class="acoes"><button class="btn sec" id="b-sair">Sair</button><button class="btn" id="b-rec">Verificar de novo</button></div></div></div>`;
  $('#b-sair').onclick = () => sb.auth.signOut();
  $('#b-rec').onclick = () => iniciar();
}

// ---------- menu e rotas ----------
function montarMenu() {
  $('#topo').hidden = false;
  const itens = [['#/viagens', 'Viagens']];
  if (eFin()) itens.push(['#/aprovacao', 'Aprovação']);
  itens.push(['#/relatorios', 'Relatórios']);
  if (eAdmin()) itens.push(['#/admin', 'Cadastros']);
  itens.push(['#/conta', S.eu.nome ? S.eu.nome.split(' ')[0] : 'Conta']);
  $('#menu').innerHTML = itens.map(([h, t]) => `<a href="${h}">${esc(t)}</a>`).join('') + '<button id="b-sair">Sair</button>';
  $('#b-sair').onclick = async () => { await sb.auth.signOut(); };
  $('#btn-menu').onclick = () => $('#menu').classList.toggle('aberto');
}
function marcarMenu() {
  const h = location.hash.split('/').slice(0, 2).join('/');
  $$('#menu a').forEach((a) => a.classList.toggle('ativo', a.getAttribute('href') === h || (h === '#/viagem' && a.getAttribute('href') === '#/viagens')));
  $('#menu').classList.remove('aberto');
}

async function rotear() {
  if (!S.eu || !S.eu.ativo) return;
  marcarMenu();
  const [, rota, id] = location.hash.split('/');
  const app = $('#app');
  app.innerHTML = '<div class="carregando">Carregando…</div>';
  try {
    if (rota === 'viagem' && id) await telaViagem(id);
    else if (rota === 'aprovacao' && eFin()) await telaAprovacao(id || 'enviada');
    else if (rota === 'relatorios') await telaRelatorios();
    else if (rota === 'admin' && eAdmin()) await telaAdmin(id || 'usuarios');
    else if (rota === 'conta') telaConta();
    else await telaViagens();
  } catch (e) { erro(e); app.innerHTML = `<div class="vazio">Não foi possível carregar. <button class="btn link" onclick="rotear()">Tentar de novo</button></div>`; }
}
window.addEventListener('hashchange', rotear);

// ---------- VIAGENS (lista) ----------
async function telaViagens() {
  const filtro = sessionStorage.getItem('filtroViagens') || (S.eu.cargo === 'colaborador' ? 'minhas' : 'todas');
  const viagens = await q(sb.from('viagens')
    .select('*, centros_custo(nome, codigo), viagem_participantes(perfil_id)')
    .order('data_inicio', { ascending: false }));
  const ids = viagens.map((v) => v.id);
  const desp = ids.length ? await q(sb.from('despesas').select('viagem_id, valor, status').in('viagem_id', ids)) : [];
  const tot = {}; const pend = {};
  desp.forEach((d) => {
    if (d.status !== 'recusada') tot[d.viagem_id] = (tot[d.viagem_id] || 0) + Number(d.valor);
    if (d.status === 'enviada') pend[d.viagem_id] = (pend[d.viagem_id] || 0) + 1;
  });
  const lista = viagens.filter((v) => filtro === 'todas' || v.viagem_participantes.some((p) => p.perfil_id === S.eu.id));
  const veTodas = S.eu.cargo !== 'colaborador';
  $('#app').innerHTML = `
    <div class="linha entre"><h1>Viagens</h1><button class="btn" id="b-nova">+ Nova viagem</button></div>
    ${veTodas ? `<div class="abas"><button data-f="minhas" class="${filtro === 'minhas' ? 'on' : ''}">Minhas</button>
      <button data-f="todas" class="${filtro === 'todas' ? 'on' : ''}">${eFin() ? 'Todas' : 'Minha equipe'}</button></div>` : '<div style="height:.8rem"></div>'}
    ${lista.length ? `<div class="grade">${lista.map((v) => `
      <a class="card viagem-card" href="#/viagem/${v.id}">
        <div class="linha entre"><h3>${esc(v.titulo || v.destino)}</h3>${stBadge(v.status, ST_VIAG)}</div>
        <div class="suave peq">${esc(v.destino)} · ${dataBR(v.data_inicio)}${v.data_fim ? ' a ' + dataBR(v.data_fim) : ''}</div>
        <div class="suave peq">${esc(v.viagem_participantes.map((p) => nomePerfil(p.perfil_id)).join(', '))}</div>
        ${v.centros_custo ? `<div class="suave peq">Centro de custo: ${esc(v.centros_custo.nome)}</div>` : ''}
        <div class="linha entre" style="margin-top:.5rem"><span class="total">${brl(tot[v.id])}</span>
        ${pend[v.id] ? `<span class="st st-enviada">${pend[v.id]} aguardando</span>` : ''}</div>
      </a>`).join('')}</div>`
      : '<div class="vazio card">Nenhuma viagem ainda. Clique em <b>+ Nova viagem</b> para começar.</div>'}`;
  $('#b-nova').onclick = () => formViagem();
  $$('[data-f]').forEach((b) => (b.onclick = () => { sessionStorage.setItem('filtroViagens', b.dataset.f); telaViagens(); }));
}

function opcoesCentros(sel) {
  return '<option value="">— selecione —</option>' + S.centros.filter((c) => c.ativo || c.id === sel)
    .map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc((c.codigo ? c.codigo + ' - ' : '') + c.nome)}${c.tipo === 'cliente' ? ' (cliente)' : ''}</option>`).join('');
}

function formViagem(v = null) {
  const novo = !v; v = v || { data_inicio: hoje(), status: 'aberta' };
  const box = abrirModal(`<h3>${novo ? 'Nova viagem' : 'Editar viagem'}</h3>
    <form id="f-v"><div class="campos">
      <div class="cheio"><label>Título do relatório</label><input name="titulo" value="${esc(v.titulo)}" placeholder="Ex.: VIAGEM Decorlit Julho 2026" maxlength="80"></div>
      <div><label>Destino *</label><input name="destino" required value="${esc(v.destino)}" placeholder="Cidade/UF"></div>
      <div><label>Centro de custo / cliente</label><select name="centro_custo_id">${opcoesCentros(v.centro_custo_id)}</select></div>
      <div><label>Data de início *</label><input name="data_inicio" type="date" required value="${esc(v.data_inicio)}"></div>
      <div><label>Data de fim</label><input name="data_fim" type="date" value="${esc(v.data_fim)}"></div>
      <div><label>Veículo da empresa</label><input name="veiculo_empresa" value="${esc(v.veiculo_empresa)}" placeholder="Placa/modelo (se houver)"></div>
      <div><label>Forma de pagamento</label><input name="forma_pagamento" value="${esc(v.forma_pagamento ?? (novo ? 'Cartão corporativo' : ''))}"></div>
      <div><label>KM inicial</label><input name="km_inicial" type="number" min="0" inputmode="numeric" value="${esc(v.km_inicial)}"></div>
      <div><label>KM final</label><input name="km_final" type="number" min="0" inputmode="numeric" value="${esc(v.km_final)}"></div>
      <div class="cheio"><label>Motivo</label><input name="motivo" value="${esc(v.motivo)}"></div>
      <div class="cheio"><label>Regiões visitadas, clientes e objetivos principais</label><textarea name="objetivos">${esc(v.objetivos)}</textarea></div>
      ${novo ? '' : `<div><label>Situação</label><select name="status">${Object.entries(ST_VIAG).map(([k, t]) => `<option value="${k}" ${k === v.status ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`}
    </div>
    <div class="acoes"><button type="button" class="btn sec" data-fechar>Cancelar</button><button class="btn">Salvar</button></div></form>`);
  box.querySelector('#f-v').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const reg = {
      titulo: f.titulo.trim() || null, destino: f.destino.trim(), centro_custo_id: f.centro_custo_id || null,
      data_inicio: f.data_inicio, data_fim: f.data_fim || null, veiculo_empresa: f.veiculo_empresa.trim() || null,
      forma_pagamento: f.forma_pagamento.trim() || null, km_inicial: f.km_inicial === '' ? null : Number(f.km_inicial),
      km_final: f.km_final === '' ? null : Number(f.km_final), motivo: f.motivo.trim() || null, objetivos: f.objetivos.trim() || null,
    };
    if (reg.data_fim && reg.data_fim < reg.data_inicio) return aviso('A data de fim não pode ser antes do início.', true);
    if (reg.km_final != null && reg.km_inicial != null && reg.km_final < reg.km_inicial) return aviso('O KM final não pode ser menor que o inicial.', true);
    if (!novo) reg.status = f.status;
    try {
      if (novo) {
        reg.colaborador_id = S.eu.id;
        const r = await q(sb.from('viagens').insert(reg).select('id').single());
        fecharModal(); location.hash = '#/viagem/' + r.id;
      } else {
        await q(sb.from('viagens').update(reg).eq('id', v.id));
        fecharModal(); aviso('Viagem atualizada.'); rotear();
      }
    } catch (err) { erro(err); }
  };
}

// ---------- VIAGEM (detalhe) ----------
async function buscarViagem(id) {
  const v = await q(sb.from('viagens')
    .select('*, centros_custo(nome, codigo), viagem_participantes(perfil_id)')
    .eq('id', id).maybeSingle());
  if (!v) return null;
  const desp = await q(sb.from('despesas')
    .select('*, categorias(nome, grupo, coluna_relatorio), anexos(id, caminho, nome_arquivo, tipo_arquivo)')
    .eq('viagem_id', id).order('data').order('criado_em'));
  return { v, desp };
}

async function telaViagem(id) {
  const r = await buscarViagem(id);
  if (!r) { $('#app').innerHTML = '<div class="vazio card">Viagem não encontrada ou sem permissão. <a href="#/viagens">Voltar</a></div>'; return; }
  const { v, desp } = r;
  const participa = v.viagem_participantes.some((p) => p.perfil_id === S.eu.id);
  const podeEditar = participa || eFin();
  const total = desp.filter((d) => d.status !== 'recusada').reduce((s, d) => s + Number(d.valor), 0);
  const porGrupo = { funcionario: 0, empresa: 0, diversos: 0 };
  desp.filter((d) => d.status !== 'recusada').forEach((d) => (porGrupo[d.categorias.grupo] += Number(d.valor)));
  const meusRasc = desp.filter((d) => d.colaborador_id === S.eu.id && d.status === 'rascunho');

  $('#app').innerHTML = `
    <div class="peq"><a href="#/viagens">← Viagens</a></div>
    <div class="linha entre" style="margin-top:.4rem">
      <div><h1>${esc(v.titulo || v.destino)} ${stBadge(v.status, ST_VIAG)}</h1>
      <div class="suave">${esc(v.destino)} · ${dataBR(v.data_inicio)}${v.data_fim ? ' a ' + dataBR(v.data_fim) : ''}${v.centros_custo ? ' · ' + esc(v.centros_custo.nome) : ''}</div></div>
      <div class="linha">
        <button class="btn sec" id="b-xlsx">⬇ Excel</button>
        <button class="btn sec" id="b-pdf">🖨 PDF</button>
        ${podeEditar ? '<button class="btn sec" id="b-edit">Editar viagem</button>' : ''}
      </div>
    </div>
    <div class="card" style="margin-top:.8rem">
      <div class="campos">
        <div><label>Participantes</label><div>${v.viagem_participantes.map((p) => esc(nomePerfil(p.perfil_id))).join(', ')}
          ${participa || eAdmin() ? ' <button class="btn link peq" id="b-part">alterar</button>' : ''}</div></div>
        <div><label>Veículo / KM</label><div>${esc(v.veiculo_empresa || '—')}${v.km_inicial != null || v.km_final != null ? ` · ${esc(v.km_inicial ?? '?')} → ${esc(v.km_final ?? '?')} km` : ''}</div></div>
        <div><label>Forma de pagamento</label><div>${esc(v.forma_pagamento || '—')}</div></div>
        <div class="cheio"><label>Regiões, clientes e objetivos</label><div>${esc(v.objetivos || '—')}</div></div>
      </div>
    </div>
    <div class="linha entre"><h2>Despesas</h2>
      <div class="linha">
        ${meusRasc.length ? `<button class="btn ok" id="b-env">Enviar ${meusRasc.length} para aprovação</button>` : ''}
        ${participa && v.status === 'aberta' ? '<button class="btn" id="b-desp">+ Despesa</button>' : ''}
      </div></div>
    ${desp.length ? `<div class="tabela-wrap"><table class="t resp">
      <thead><tr><th>Data</th><th>Descrição / comprovantes</th><th>Categoria</th><th>Lançado por</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
      <tbody>${desp.map((d) => linhaDespesa(d)).join('')}</tbody>
      <tfoot><tr><td colspan="4">Total (sem recusadas)<div class="peq suave" style="font-weight:400">
        Restituir: ${brl(porGrupo.funcionario)} · Empresa: ${brl(porGrupo.empresa)} · Diversos: ${brl(porGrupo.diversos)}</div></td>
        <td class="num">${brl(total)}</td><td colspan="2"></td></tr></tfoot>
    </table></div>` : '<div class="vazio card">Nenhuma despesa lançada.</div>'}`;

  ligarAcoesDespesa(desp, () => telaViagem(id));
  $('#b-edit') && ($('#b-edit').onclick = () => formViagem(v));
  $('#b-desp') && ($('#b-desp').onclick = () => formDespesa(v));
  $('#b-part') && ($('#b-part').onclick = () => formParticipantes(v));
  $('#b-xlsx').onclick = () => baixarExcel(v, desp);
  $('#b-pdf').onclick = () => imprimirRelatorio(v, desp);
  $('#b-env') && ($('#b-env').onclick = async () => {
    const semAnexo = meusRasc.filter((d) => !d.anexos.length).length;
    const msg = `Enviar ${meusRasc.length} despesa(s) para o Financeiro?` + (semAnexo ? ` Atenção: ${semAnexo} sem comprovante.` : '');
    if (!(await confirmar(msg, 'Enviar'))) return;
    try {
      await q(sb.from('despesas').update({ status: 'enviada' }).in('id', meusRasc.map((d) => d.id)));
      aviso('Enviado para aprovação.'); telaViagem(id);
    } catch (e) { erro(e); }
  });
}

function linhaDespesa(d, extra = '') {
  const meu = d.colaborador_id === S.eu.id;
  const editavel = meu && ['rascunho', 'recusada'].includes(d.status);
  const botoes = [];
  if (editavel) botoes.push(`<button class="btn peq sec" data-acao="editar" data-id="${d.id}">Editar</button>`);
  if (meu && d.status === 'rascunho') botoes.push(`<button class="btn peq sec" data-acao="excluir" data-id="${d.id}">Excluir</button>`);
  if (meu && d.status === 'recusada') botoes.push(`<button class="btn peq ok" data-acao="reenviar" data-id="${d.id}">Reenviar</button>`);
  if (eFin() && d.status === 'enviada') {
    botoes.push(`<button class="btn peq ok" data-acao="aprovar" data-id="${d.id}">Aprovar</button>`);
    botoes.push(`<button class="btn peq perigo" data-acao="recusar" data-id="${d.id}">Recusar</button>`);
  }
  if (eFin() && d.status === 'aprovada') botoes.push(`<button class="btn peq" data-acao="pagar" data-id="${d.id}">Marcar paga</button>`);
  botoes.push(`<button class="btn peq link" data-acao="historico" data-id="${d.id}">Histórico</button>`);
  return `<tr>
    <td data-l="Data">${dataBR(d.data)}</td>
    <td data-l="Descrição">${esc(d.descricao || '')}
      <div class="anexos">${(d.anexos || []).map((a) => `<button class="anexo" data-anexo="${esc(a.caminho)}" data-tipo="${esc(a.tipo_arquivo || '')}">📎 ${esc(a.nome_arquivo.slice(0, 22))}</button>`).join('') || (d.status === 'rascunho' || d.status === 'recusada' ? '<span class="peq suave">sem comprovante</span>' : '')}</div>
      ${d.status === 'recusada' && d.motivo_recusa ? `<div class="peq" style="color:var(--perigo)">Motivo: ${esc(d.motivo_recusa)}</div>` : ''}
    </td>
    <td data-l="Categoria">${esc(d.categorias.nome)}<div class="grupo-tag">${esc(GRUPOS_CURTO[d.categorias.grupo])}</div></td>
    <td data-l="Lançado por">${esc(nomePerfil(d.colaborador_id))}${extra}</td>
    <td data-l="Valor" class="num">${brl(d.valor)}</td>
    <td data-l="Situação">${stBadge(d.status)}</td>
    <td class="acoes-td"><div class="linha">${botoes.join('')}</div></td></tr>`;
}

function ligarAcoesDespesa(lista, recarregar) {
  $$('[data-anexo]').forEach((b) => (b.onclick = () => verAnexo(b.dataset.anexo, b.dataset.tipo, b.textContent)));
  $$('[data-acao]').forEach((b) => (b.onclick = async () => {
    const d = lista.find((x) => x.id === b.dataset.id);
    try {
      switch (b.dataset.acao) {
        case 'editar': {
          const v = await q(sb.from('viagens').select('*').eq('id', d.viagem_id).single());
          return formDespesa(v, d);
        }
        case 'excluir':
          if (!(await confirmar('Excluir esta despesa?', 'Excluir', true))) return;
          if (d.anexos.length) await sb.storage.from(BUCKET).remove(d.anexos.map((a) => a.caminho));
          await q(sb.from('despesas').delete().eq('id', d.id)); aviso('Despesa excluída.'); break;
        case 'reenviar':
          await q(sb.from('despesas').update({ status: 'enviada' }).eq('id', d.id)); aviso('Reenviada.'); break;
        case 'aprovar':
          await q(sb.from('despesas').update({ status: 'aprovada' }).eq('id', d.id)); aviso('Aprovada.'); break;
        case 'recusar': {
          const m = await pedirTexto('Recusar despesa', 'Motivo da recusa (o colaborador verá este texto)');
          if (!m) return;
          await q(sb.from('despesas').update({ status: 'recusada', motivo_recusa: m }).eq('id', d.id)); aviso('Recusada.'); break;
        }
        case 'pagar':
          await q(sb.from('despesas').update({ status: 'paga' }).eq('id', d.id)); aviso('Marcada como paga.'); break;
        case 'historico': return verHistorico(d);
      }
      recarregar();
    } catch (e) { erro(e); }
  }));
}

async function verHistorico(d) {
  const h = await q(sb.from('historico_despesas').select('*').eq('despesa_id', d.id).order('criado_em'));
  abrirModal(`<h3>Histórico da despesa</h3>
    <div class="tabela-wrap"><table class="t"><thead><tr><th>Quando</th><th>Quem</th><th>Situação</th><th>Comentário</th></tr></thead>
    <tbody>${h.map((x) => `<tr><td>${new Date(x.criado_em).toLocaleString('pt-BR')}</td><td>${esc(nomePerfil(x.usuario_id))}</td>
      <td>${x.status_anterior ? stBadge(x.status_anterior) + ' → ' : ''}${stBadge(x.status_novo)}</td><td>${esc(x.comentario || '')}</td></tr>`).join('')}</tbody></table></div>
    <div class="acoes"><button class="btn" data-fechar>Fechar</button></div>`);
}

async function verAnexo(caminho, tipo, nome) {
  try {
    const { signedUrl } = await q(sb.storage.from(BUCKET).createSignedUrl(caminho, 600));
    const pdf = /pdf/.test(tipo) || /\.pdf$/i.test(caminho);
    const img = /^image\/(jpeg|png|webp|gif)/.test(tipo);
    abrirModal(`<div class="linha entre"><h3>${esc(nome)}</h3><a class="btn sec peq" href="${signedUrl}" target="_blank" rel="noopener">Abrir em nova aba</a></div>
      <div class="visual">${pdf ? `<iframe src="${signedUrl}"></iframe>` : img ? `<img src="${signedUrl}" alt="">` : '<p class="vazio">Pré-visualização não disponível para este formato. Use “Abrir em nova aba”.</p>'}</div>
      <div class="acoes"><button class="btn" data-fechar>Fechar</button></div>`, true);
  } catch (e) { erro(e); }
}

async function formParticipantes(v) {
  const atuais = new Set(v.viagem_participantes.map((p) => p.perfil_id));
  const ativos = S.perfis.filter((p) => p.ativo);
  const box = abrirModal(`<h3>Participantes da viagem</h3>
    <p class="suave peq">Todos os participantes podem lançar despesas nesta viagem e saem no cabeçalho do relatório.</p>
    ${ativos.map((p) => `<label class="check"><input type="checkbox" value="${p.id}" ${atuais.has(p.id) ? 'checked' : ''}
      ${p.id === v.colaborador_id ? 'disabled' : ''}> ${esc(p.nome || p.email)}${p.id === v.colaborador_id ? ' <span class="suave peq">(criou a viagem)</span>' : ''}</label>`).join('')}
    <div class="acoes"><button class="btn sec" data-fechar>Cancelar</button><button class="btn" id="b-sp">Salvar</button></div>`);
  box.querySelector('#b-sp').onclick = async () => {
    const marcados = new Set($$('input[type=checkbox]', box).filter((c) => c.checked).map((c) => c.value));
    marcados.add(v.colaborador_id);
    const incluir = [...marcados].filter((x) => !atuais.has(x));
    const remover = [...atuais].filter((x) => !marcados.has(x));
    try {
      if (incluir.length) await q(sb.from('viagem_participantes').insert(incluir.map((p) => ({ viagem_id: v.id, perfil_id: p }))));
      if (remover.length) await q(sb.from('viagem_participantes').delete().eq('viagem_id', v.id).in('perfil_id', remover));
      fecharModal(); aviso('Participantes atualizados.'); rotear();
    } catch (e) { erro(e); }
  };
}

// ---------- DESPESA (formulário com comprovantes) ----------
function formDespesa(v, d = null) {
  const novo = !d;
  let grupo = d ? d.categorias.grupo : 'empresa';
  const anexosExist = d ? [...d.anexos] : [];
  const removidos = [];
  let arquivos = [];
  const box = abrirModal(`<h3>${novo ? 'Nova despesa' : 'Editar despesa'}</h3>
    <form id="f-d">
      <label>Quem pagou?</label>
      <div class="seg" id="seg">${Object.entries(GRUPOS_CURTO).map(([k, t]) => `<button type="button" data-g="${k}">${t}</button>`).join('')}</div>
      <div class="peq suave" id="g-desc" style="margin-top:.25rem"></div>
      <div class="campos">
        <div><label>Categoria *</label><select name="categoria_id" id="sel-cat" required></select></div>
        <div><label>Data *</label><input name="data" type="date" required value="${esc(d?.data || hoje())}"></div>
        <div><label>Valor (R$) *</label><input name="valor" required inputmode="decimal" placeholder="0,00" value="${d ? String(d.valor).replace('.', ',') : ''}"></div>
        <div class="cheio"><label>Descrição</label><input name="descricao" value="${esc(d?.descricao)}" placeholder="Ex.: Almoço com cliente Infibra" maxlength="120"></div>
        <div class="cheio"><label>Comprovantes (foto ou PDF)</label>
          <input type="file" id="arq" accept="image/*,application/pdf,.heic,.heif" multiple>
          <div class="anexos" id="lista-anexos"></div></div>
      </div>
      <div class="acoes"><button type="button" class="btn sec" data-fechar>Cancelar</button>
        <button class="btn sec" data-envio="rascunho">Salvar rascunho</button>
        <button class="btn ok" data-envio="enviada">Salvar e enviar</button></div>
    </form>`);
  const desenharGrupo = () => {
    $$('#seg button', box).forEach((b) => b.classList.toggle('on', b.dataset.g === grupo));
    $('#g-desc', box).textContent = GRUPOS[grupo];
    const cats = S.categorias.filter((c) => c.grupo === grupo && (c.ativo || c.id === d?.categoria_id));
    $('#sel-cat', box).innerHTML = cats.map((c) => `<option value="${c.id}" ${c.id === d?.categoria_id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
  };
  const desenharAnexos = () => {
    $('#lista-anexos', box).innerHTML =
      anexosExist.map((a, i) => `<span class="anexo">📎 ${esc(a.nome_arquivo.slice(0, 24))}<span class="x" data-rx="${i}" title="Remover">✕</span></span>`).join('') +
      arquivos.map((f, i) => `<span class="anexo">🆕 ${esc(f.name.slice(0, 24))}<span class="x" data-rn="${i}" title="Remover">✕</span></span>`).join('');
    $$('[data-rx]', box).forEach((x) => (x.onclick = () => { removidos.push(anexosExist.splice(+x.dataset.rx, 1)[0]); desenharAnexos(); }));
    $$('[data-rn]', box).forEach((x) => (x.onclick = () => { arquivos.splice(+x.dataset.rn, 1); desenharAnexos(); }));
  };
  $$('#seg button', box).forEach((b) => (b.onclick = () => { grupo = b.dataset.g; desenharGrupo(); }));
  $('#arq', box).onchange = (e) => {
    for (const f of e.target.files) {
      if (f.size > 10 * 1024 * 1024 && !/^image\/(jpeg|png|webp)/.test(f.type)) { aviso(`"${f.name}" tem mais de 10 MB.`, true); continue; }
      arquivos.push(f);
    }
    e.target.value = ''; desenharAnexos();
  };
  desenharGrupo(); desenharAnexos();

  let envio = 'rascunho';
  $$('[data-envio]', box).forEach((b) => (b.onclick = () => (envio = b.dataset.envio)));
  $('#f-d', box).onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const valor = parseValor(f.valor);
    if (!(valor > 0)) return aviso('Informe um valor válido.', true);
    if (!f.categoria_id) return aviso('Escolha a categoria.', true);
    const btns = $$('button', box); btns.forEach((b) => (b.disabled = true));
    try {
      const reg = { categoria_id: f.categoria_id, data: f.data, valor, descricao: f.descricao.trim() || null, centro_custo_id: v.centro_custo_id || null };
      let id = d?.id;
      if (novo) {
        const r = await q(sb.from('despesas').insert({ ...reg, viagem_id: v.id, colaborador_id: S.eu.id, status: 'rascunho' }).select('id').single());
        id = r.id;
      } else {
        await q(sb.from('despesas').update({ ...reg, status: d.status === 'recusada' ? 'rascunho' : d.status }).eq('id', id));
      }
      for (const a of removidos) {
        await sb.storage.from(BUCKET).remove([a.caminho]);
        await q(sb.from('anexos').delete().eq('id', a.id));
      }
      for (const arq of arquivos) await enviarArquivo(id, arq);
      if (envio === 'enviada') await q(sb.from('despesas').update({ status: 'enviada' }).eq('id', id));
      fecharModal();
      aviso(envio === 'enviada' ? 'Despesa enviada para aprovação.' : 'Despesa salva.');
      rotear();
    } catch (err) { erro(err); btns.forEach((b) => (b.disabled = false)); }
  };
}

async function reduzirImagem(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 700 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const max = 2000, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return file; }
}

async function enviarArquivo(despesaId, original) {
  const file = await reduzirImagem(original);
  if (file.size > 10 * 1024 * 1024) throw new Error(`"${file.name}" tem mais de 10 MB.`);
  let tipo = file.type;
  if (!tipo && /\.hei[cf]$/i.test(file.name)) tipo = 'image/heic';
  const seguro = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-60);
  const caminho = `${despesaId}/${Date.now()}_${seguro}`;
  await q(sb.storage.from(BUCKET).upload(caminho, file, { contentType: tipo || 'application/octet-stream', upsert: false }));
  await q(sb.from('anexos').insert({ despesa_id: despesaId, caminho, nome_arquivo: file.name, tipo_arquivo: tipo, tamanho_bytes: file.size, enviado_por: S.eu.id }));
}

// ---------- RELATÓRIO (Excel e PDF no modelo Quimicer) ----------
function dadosRelatorio(v, desp) {
  const validas = desp.filter((d) => d.status !== 'recusada');
  const cc = v.centros_custo;
  return {
    titulo: v.titulo || ('VIAGEM ' + v.destino),
    participantes: v.viagem_participantes.map((p) => nomePerfil(p.perfil_id)),
    data_inicio: v.data_inicio, data_fim: v.data_fim, destino: v.destino,
    centro_custo: cc ? (cc.codigo ? cc.codigo + ' - ' : '') + cc.nome : '',
    veiculo: v.veiculo_empresa, km_inicial: v.km_inicial, km_final: v.km_final,
    forma_pagamento: v.forma_pagamento, objetivos: v.objetivos,
    despesas: validas.map((d) => ({ data: d.data, descricao: d.descricao || d.categorias.nome, coluna: d.categorias.coluna_relatorio, valor: d.valor })),
    pendentes: validas.filter((d) => d.status === 'rascunho').length,
  };
}

let _modelo = null, _logo = null;
async function baixarExcel(v, desp) {
  try {
    const dados = dadosRelatorio(v, desp);
    if (dados.pendentes && !(await confirmar(`Há ${dados.pendentes} despesa(s) em rascunho. Elas entram no relatório. Continuar?`, 'Gerar'))) return;
    aviso('Gerando Excel…');
    if (!_modelo) _modelo = await (await fetch('modelo_relatorio.xlsx', { cache: 'no-cache' })).arrayBuffer();
    if (!_logo) _logo = await (await fetch('logo_quimicer.png')).arrayBuffer();
    const buf = await Relatorio.gerarExcel(ExcelJS, _modelo, dados, _logo);
    baixarArquivo(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), Relatorio.nomeAba(dados.titulo) + '.xlsx');
  } catch (e) { erro(e); }
}
function baixarArquivo(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const COLS = 'EFGHIJKLMNOPQRSTUV'.split('');
const COL_NOMES = ['ALIMENTAÇÃO', 'HOSPEDAGEM', 'COMBUSTÍVEL', 'OUTROS', 'AVIÃO', 'GASTO COM CLIENTE', 'TELEFONE',
  'ALIMENTAÇÃO', 'HOSPEDAGEM', 'COMBUSTÍVEL', 'PEDÁGIO', 'AVIÃO', 'GASTO COM CLIENTE', 'DIVERSOS',
  'BOLETOS', 'AVIÃO COMPRA ANTECIPADA', 'POSTO IMOLA', 'SEM PARAR PEDÁGIO'];
async function imprimirRelatorio(v, desp) {
  const dados = dadosRelatorio(v, desp);
  if (dados.pendentes && !(await confirmar(`Há ${dados.pendentes} despesa(s) em rascunho. Elas entram no relatório. Continuar?`, 'Gerar'))) return;
  const ds = dados.despesas.slice().sort((a, b) => a.data.localeCompare(b.data));
  const linhas = Math.max(32, ds.length);
  const tot = Object.fromEntries(COLS.map((c) => [c, 0]));
  ds.forEach((d) => (tot[d.coluna] += Number(d.valor)));
  const n = (x) => (x ? Number(x).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
  const restituir = 'EFGHIJK'.split('').reduce((s, c) => s + tot[c], 0);
  const empresa = 'LMNOPQR'.split('').reduce((s, c) => s + tot[c], 0);
  const totalGeral = restituir + empresa + tot.S + tot.T + tot.U + tot.V;
  const largura = [9, 7, 7, 13, 6, 6, 6, 5, 6, 6, 5, 6, 6, 6, 5, 6, 6, 6, 6, 6, 5, 6];
  const periodo = dataBR(dados.data_inicio) + (dados.data_fim ? ' - ' + dataBR(dados.data_fim) : '');
  let corpo = '';
  for (let i = 0; i < linhas; i++) {
    const d = ds[i];
    corpo += `<tr><td class="c">${d ? dataBR(d.data) : ''}</td><td colspan="3">${d ? esc(d.descricao) : ''}</td>
      ${COLS.map((c) => `<td class="n">${d && d.coluna === c ? 'R$ ' + n(d.valor) : ''}</td>`).join('')}</tr>`;
  }
  const res = [['ADIANTAMENTO', 0], ['RESTITUIR FUNCIONÁRIO', restituir], ['VALOR PAGO PELA EMPRESA', empresa], ['BOLETOS', tot.S],
    ['AVIÃO COMPRA ANTECIPADA', tot.T], ['POSTO IMOLA', tot.U], ['SEM PARAR (PEDÁGIOS)', tot.V], ['TOTAL DESPESAS', totalGeral]];
  $('#print-area').innerHTML = `<table class="rel">
    <colgroup>${largura.map((w) => `<col style="width:${w}%">`).join('')}</colgroup>
    <tr><td colspan="4" rowspan="1" style="height:34pt"><img src="logo_quimicer.png" style="height:22pt"></td><td colspan="18" class="tit">RELATÓRIO DE DESPESAS</td></tr>
    <tr><td colspan="4" class="info">NOME FUNCIONÁRIO: ${esc(dados.participantes.join(' e '))}</td><td colspan="3" class="info">${esc(periodo)}</td>
      <td colspan="4" class="info">DESTINO: ${esc(dados.destino)}</td><td colspan="3" class="info">CENTRO DE CUSTO: ${esc(dados.centro_custo)}</td>
      <td colspan="4" class="info">VEÍCULO EMPRESA: ${esc(dados.veiculo || '')}\nKM INICIAL: ${esc(dados.km_inicial ?? '')}   KM FINAL: ${esc(dados.km_final ?? '')}</td>
      <td colspan="4" class="info">FORMA PAGAMENTO: ${esc(dados.forma_pagamento || '')}</td></tr>
    <tr><td rowspan="2" class="sub">DATA</td><td rowspan="2" colspan="3" class="sub">DESCRIÇÃO</td>
      <td colspan="7" class="cab">DESPESAS A RESTITUIR AO FUNCIONÁRIO</td><td colspan="7" class="cab">DESPESAS PAGAS POR RECURSOS DA EMPRESA</td><td colspan="4" class="cab">DIVERSOS</td></tr>
    <tr>${COL_NOMES.map((t) => `<td class="sub">${t}</td>`).join('')}</tr>
    ${corpo}
    <tr class="cian"><td class="c">-</td><td colspan="3" class="c b">TOTAIS</td>${COLS.map((c) => `<td class="n">R$ ${n(tot[c]) || '0,00'}</td>`).join('')}</tr>
    <tr><td colspan="4" class="sub" style="text-align:left">REGIÕES VISITADAS, CLIENTES E OBJETIVOS PRINCIPAIS</td>
      <td rowspan="6" class="cian c">NOTAS</td>
      <td colspan="11" rowspan="6" class="cian" style="vertical-align:top;font-size:5.8pt">JUNTE A ESTE RELATÓRIO TODAS AS NOTAS FISCAIS, RECIBOS E COMPROVANTES DE PAGAMENTO. AS GORJETAS MESMO INCLUÍDAS NAS CONTAS, DEVERÃO SER SEPARADAS. DESCREVER NO VERSO OS GASTOS COM PROMOÇÃO E/OU REPRODUÇÃO. RELACIONAR NA COLUNA ESPECÍFICA, OS VALORES "CREDITADOS À QUIMICER. PROCEDA E ANOTE A SOMATÓRIA DOS "TOTAIS" NA COLUNA "TOTAL DAS DESPESAS".</td>
      <td colspan="3" class="cab" style="text-align:left">${res[0][0]}</td><td></td><td colspan="2" class="n b">R$ ${n(res[0][1]) || '0,00'}</td></tr>
    ${res.slice(1, 6).map((r, i) => `<tr>${i === 0 ? `<td colspan="4" rowspan="5" class="c">${esc(dados.objetivos || '')}</td>` : ''}
      <td colspan="3" class="cab" style="text-align:left">${r[0]}</td><td></td><td colspan="2" class="n b">R$ ${n(r[1]) || '0,00'}</td></tr>`).join('')}
    <tr><td colspan="4" class="sub">Ass Funcionário</td><td colspan="4" class="sub">Líder</td><td colspan="4" class="sub">Diretor</td><td colspan="4" class="sub">Data</td>
      <td colspan="3" class="cab" style="text-align:left">${res[6][0]}</td><td></td><td colspan="2" class="n b">R$ ${n(res[6][1]) || '0,00'}</td></tr>
    <tr style="height:26pt"><td colspan="4"></td><td colspan="4"></td><td colspan="4"></td><td colspan="4"></td>
      <td colspan="3" class="cab" style="text-align:left">${res[7][0]}</td><td></td><td colspan="2" class="n b">R$ ${n(res[7][1]) || '0,00'}</td></tr>
  </table>`;
  const img = $('#print-area img');
  const imprimir = () => { const t = document.title; document.title = Relatorio.nomeAba(dados.titulo); window.print(); document.title = t; };
  if (img.complete) imprimir(); else { img.onload = imprimir; img.onerror = imprimir; }
}

// ---------- APROVAÇÃO (financeiro) ----------
async function telaAprovacao(aba) {
  const contagem = await q(sb.from('despesas').select('status').in('status', ['enviada', 'aprovada']));
  const c = { enviada: 0, aprovada: 0 }; contagem.forEach((x) => c[x.status]++);
  let consulta = sb.from('despesas')
    .select('*, categorias(nome, grupo, coluna_relatorio), anexos(id, caminho, nome_arquivo, tipo_arquivo), viagens(id, titulo, destino)')
    .eq('status', aba).order('data', { ascending: aba !== 'paga' });
  if (['paga', 'recusada'].includes(aba)) consulta = consulta.limit(200);
  const lista = await q(consulta);
  const total = lista.reduce((s, d) => s + Number(d.valor), 0);
  $('#app').innerHTML = `<h1>Aprovação</h1>
    <div class="abas">
      <button data-a="enviada" class="${aba === 'enviada' ? 'on' : ''}">A aprovar${c.enviada ? `<span class="cont">${c.enviada}</span>` : ''}</button>
      <button data-a="aprovada" class="${aba === 'aprovada' ? 'on' : ''}">A pagar${c.aprovada ? `<span class="cont">${c.aprovada}</span>` : ''}</button>
      <button data-a="paga" class="${aba === 'paga' ? 'on' : ''}">Pagas</button>
      <button data-a="recusada" class="${aba === 'recusada' ? 'on' : ''}">Recusadas</button>
    </div>
    ${lista.length ? `
      ${['enviada', 'aprovada'].includes(aba) ? `<div class="linha entre" style="margin-bottom:.6rem">
        <label class="check"><input type="checkbox" id="sel-todas"> Selecionar todas</label>
        <button class="btn ${aba === 'enviada' ? 'ok' : ''}" id="b-lote" disabled>${aba === 'enviada' ? 'Aprovar selecionadas' : 'Marcar selecionadas como pagas'}</button></div>` : ''}
      <div class="tabela-wrap"><table class="t resp"><thead><tr>${['enviada', 'aprovada'].includes(aba) ? '<th></th>' : ''}<th>Data</th><th>Descrição / comprovantes</th><th>Categoria</th><th>Colaborador / viagem</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
      <tbody>${lista.map((d) => (['enviada', 'aprovada'].includes(aba) ? `<tr><td class="sel-td"><label class="check" style="margin:0"><input type="checkbox" class="sel" value="${d.id}"> selecionar</label></td>` : '<tr>') +
        linhaDespesa(d, `<div class="peq"><a href="#/viagem/${d.viagem_id}">${esc(d.viagens?.titulo || d.viagens?.destino || '')}</a></div>`).slice(4)).join('')}</tbody>
      <tfoot><tr>${['enviada', 'aprovada'].includes(aba) ? '<td></td>' : ''}<td colspan="4">Total</td><td class="num">${brl(total)}</td><td colspan="2"></td></tr></tfoot></table></div>`
      : '<div class="vazio card">Nada por aqui.</div>'}`;
  $$('[data-a]').forEach((b) => (b.onclick = () => (location.hash = '#/aprovacao/' + b.dataset.a)));
  ligarAcoesDespesa(lista, () => telaAprovacao(aba));
  const lote = $('#b-lote');
  if (lote) {
    const atualizar = () => { const n = $$('.sel:checked').length; lote.disabled = !n; lote.textContent = (aba === 'enviada' ? 'Aprovar' : 'Marcar como pagas') + (n ? ` (${n})` : ' selecionadas'); };
    $$('.sel').forEach((x) => (x.onchange = atualizar));
    $('#sel-todas').onchange = (e) => { $$('.sel').forEach((x) => (x.checked = e.target.checked)); atualizar(); };
    lote.onclick = async () => {
      const ids = $$('.sel:checked').map((x) => x.value);
      if (!(await confirmar(`${aba === 'enviada' ? 'Aprovar' : 'Marcar como pagas'} ${ids.length} despesa(s)?`))) return;
      try { await q(sb.from('despesas').update({ status: aba === 'enviada' ? 'aprovada' : 'paga' }).in('id', ids)); aviso('Feito.'); telaAprovacao(aba); }
      catch (e) { erro(e); }
    };
  }
}

// ---------- RELATÓRIOS (período) ----------
async function telaRelatorios() {
  const f = JSON.parse(sessionStorage.getItem('filtroRel') || 'null') || {
    de: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString('sv-SE'), ate: hoje(), colab: '', centro: '', status: 'validas',
  };
  let c = sb.from('despesas').select('*, categorias(nome, grupo, coluna_relatorio), viagens(id, titulo, destino, centro_custo_id)')
    .gte('data', f.de).lte('data', f.ate).order('data');
  if (f.colab) c = c.eq('colaborador_id', f.colab);
  if (f.status === 'validas') c = c.neq('status', 'recusada'); else if (f.status) c = c.eq('status', f.status);
  let lista = await q(c);
  if (f.centro) lista = lista.filter((d) => (d.centro_custo_id || d.viagens?.centro_custo_id) === f.centro);
  const porCat = {};
  lista.forEach((d) => { const k = GRUPOS_CURTO[d.categorias.grupo] + ' — ' + d.categorias.nome; porCat[k] = (porCat[k] || 0) + Number(d.valor); });
  const total = lista.reduce((s, d) => s + Number(d.valor), 0);
  const pessoas = S.perfis.filter((p) => p.ativo || lista.some((d) => d.colaborador_id === p.id));
  $('#app').innerHTML = `<h1>Relatórios</h1>
    <p class="suave peq">O relatório no modelo Quimicer (Excel/PDF) é gerado dentro de cada viagem. Aqui você consulta despesas por período.</p>
    <form class="card" id="f-rel"><div class="campos">
      <div><label>De</label><input type="date" name="de" value="${esc(f.de)}"></div>
      <div><label>Até</label><input type="date" name="ate" value="${esc(f.ate)}"></div>
      <div><label>Colaborador</label><select name="colab"><option value="">Todos</option>${pessoas.map((p) => `<option value="${p.id}" ${p.id === f.colab ? 'selected' : ''}>${esc(p.nome || p.email)}</option>`).join('')}</select></div>
      <div><label>Centro de custo / cliente</label><select name="centro"><option value="">Todos</option>${S.centros.map((x) => `<option value="${x.id}" ${x.id === f.centro ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
      <div><label>Situação</label><select name="status">${[['validas', 'Todas exceto recusadas'], ['', 'Todas'], ...Object.entries(ST_DESP)].map(([k, t]) => `<option value="${k}" ${k === f.status ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    </div><div class="acoes"><button class="btn sec" type="button" id="b-xrel">⬇ Excel</button><button class="btn">Filtrar</button></div></form>
    ${lista.length ? `<div class="grade" style="margin-bottom:1rem">${Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([k, val]) => `<div class="card" style="margin:0"><div class="peq suave">${esc(k)}</div><b>${brl(val)}</b></div>`).join('')}</div>
    <div class="tabela-wrap"><table class="t"><thead><tr><th>Data</th><th>Viagem</th><th>Colaborador</th><th>Categoria</th><th>Descrição</th><th class="num">Valor</th><th>Situação</th></tr></thead>
    <tbody>${lista.map((d) => `<tr><td>${dataBR(d.data)}</td><td><a href="#/viagem/${d.viagem_id}">${esc(d.viagens?.titulo || d.viagens?.destino || '—')}</a></td>
      <td>${esc(nomePerfil(d.colaborador_id))}</td><td>${esc(d.categorias.nome)}<div class="grupo-tag">${esc(GRUPOS_CURTO[d.categorias.grupo])}</div></td>
      <td>${esc(d.descricao || '')}</td><td class="num">${brl(d.valor)}</td><td>${stBadge(d.status)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="5">Total (${lista.length} despesas)</td><td class="num">${brl(total)}</td><td></td></tr></tfoot></table></div>`
    : '<div class="vazio card">Nenhuma despesa no período.</div>'}`;
  $('#f-rel').onsubmit = (e) => { e.preventDefault(); sessionStorage.setItem('filtroRel', JSON.stringify(Object.fromEntries(new FormData(e.target)))); telaRelatorios(); };
  $('#b-xrel').onclick = async () => {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Despesas');
    ws.columns = [{ header: 'Data', key: 'data', width: 12 }, { header: 'Viagem', key: 'viagem', width: 30 }, { header: 'Colaborador', key: 'colab', width: 24 },
      { header: 'Quem pagou', key: 'grupo', width: 18 }, { header: 'Categoria', key: 'cat', width: 22 }, { header: 'Descrição', key: 'desc', width: 36 },
      { header: 'Valor (R$)', key: 'valor', width: 14 }, { header: 'Situação', key: 'st', width: 12 }];
    lista.forEach((d) => {
      const [y, m, dd] = d.data.split('-').map(Number);
      ws.addRow({ data: new Date(Date.UTC(y, m - 1, dd)), viagem: d.viagens?.titulo || d.viagens?.destino || '', colab: nomePerfil(d.colaborador_id), grupo: GRUPOS_CURTO[d.categorias.grupo], cat: d.categorias.nome, desc: d.descricao || '', valor: Number(d.valor), st: ST_DESP[d.status] });
    });
    const ult = lista.length + 1;
    ws.addRow({ desc: 'TOTAL', valor: { formula: `SUM(G2:G${ult})` } }).font = { bold: true };
    ws.getColumn('data').numFmt = 'dd/mm/yyyy'; ws.getColumn('valor').numFmt = '#,##0.00';
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF009999' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    baixarArquivo(new Blob([await wb.xlsx.writeBuffer()]), `despesas_${f.de}_a_${f.ate}.xlsx`);
  };
}

// ---------- CADASTROS (admin) ----------
async function telaAdmin(aba) {
  await carregarApoio();
  const abas = { usuarios: 'Usuários', equipes: 'Equipes', centros: 'Centros de custo / clientes', categorias: 'Categorias' };
  let html = `<h1>Cadastros</h1><div class="abas">${Object.entries(abas).map(([k, t]) => `<button data-ab="${k}" class="${k === aba ? 'on' : ''}">${t}${k === 'usuarios' && S.perfis.some((p) => !p.ativo) ? `<span class="cont">${S.perfis.filter((p) => !p.ativo).length}</span>` : ''}</button>`).join('')}</div>`;
  if (aba === 'usuarios') {
    html += `<p class="suave peq">Cada pessoa cria a própria conta na tela de login. Depois disso, ela aparece aqui como <b>aguardando</b>: defina o cargo, a equipe e marque <b>Liberado</b>.</p>
      <div class="tabela-wrap"><table class="t"><thead><tr><th>Nome</th><th>E-mail</th><th>Cargo</th><th>Equipe</th><th>Liberado</th></tr></thead><tbody>
      ${S.perfis.map((p) => `<tr data-p="${p.id}"><td><input data-c="nome" value="${esc(p.nome)}" style="min-width:160px"></td><td>${esc(p.email)}</td>
        <td><select data-c="cargo" ${p.id === S.eu.id ? 'disabled title="Você não pode mudar o próprio cargo"' : ''}>${Object.entries(CARGOS).map(([k, t]) => `<option value="${k}" ${k === p.cargo ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
        <td><select data-c="equipe_id"><option value="">—</option>${S.equipes.map((e) => `<option value="${e.id}" ${e.id === p.equipe_id ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}</select></td>
        <td><label class="check" style="margin:0"><input type="checkbox" data-c="ativo" ${p.ativo ? 'checked' : ''} ${p.id === S.eu.id ? 'disabled' : ''}> ${p.ativo ? '' : '<span class="st st-enviada">aguardando</span>'}</label></td></tr>`).join('')}
      </tbody></table></div>`;
  } else if (aba === 'equipes') {
    const gestores = S.perfis.filter((p) => p.ativo && ['gestor', 'admin'].includes(p.cargo));
    html += `<p class="suave peq">O gestor vê as viagens e despesas das pessoas da equipe dele. Só aparecem aqui usuários com cargo Gestor ou Administrador.</p>
      <form class="card linha" id="f-novo"><input name="nome" placeholder="Nome da nova equipe" required style="flex:1;min-width:180px"><button class="btn">Adicionar</button></form>
      <div class="tabela-wrap"><table class="t"><thead><tr><th>Equipe</th><th>Gestor</th><th>Pessoas</th><th>Ativa</th></tr></thead><tbody>
      ${S.equipes.map((e) => `<tr data-e="${e.id}"><td><input data-c="nome" value="${esc(e.nome)}"></td>
        <td><select data-c="gestor_id"><option value="">—</option>${gestores.map((g) => `<option value="${g.id}" ${g.id === e.gestor_id ? 'selected' : ''}>${esc(g.nome || g.email)}</option>`).join('')}</select></td>
        <td class="peq">${esc(S.perfis.filter((p) => p.equipe_id === e.id).map((p) => p.nome || p.email).join(', ') || '—')}</td>
        <td><input type="checkbox" data-c="ativo" ${e.ativo ? 'checked' : ''}></td></tr>`).join('') || '<tr><td colspan="4" class="vazio">Nenhuma equipe.</td></tr>'}
      </tbody></table></div>`;
  } else if (aba === 'centros') {
    html += `<form class="card" id="f-novo"><div class="campos"><div><label>Código</label><input name="codigo"></div><div><label>Nome *</label><input name="nome" required></div>
      <div><label>Tipo</label><select name="tipo"><option value="centro_custo">Centro de custo</option><option value="cliente">Cliente</option></select></div></div>
      <div class="acoes"><button class="btn">Adicionar</button></div></form>
      <div class="tabela-wrap"><table class="t"><thead><tr><th>Código</th><th>Nome</th><th>Tipo</th><th>Ativo</th></tr></thead><tbody>
      ${S.centros.map((c) => `<tr data-cc="${c.id}"><td><input data-c="codigo" value="${esc(c.codigo)}" style="max-width:110px"></td><td><input data-c="nome" value="${esc(c.nome)}"></td>
        <td><select data-c="tipo"><option value="centro_custo" ${c.tipo === 'centro_custo' ? 'selected' : ''}>Centro de custo</option><option value="cliente" ${c.tipo === 'cliente' ? 'selected' : ''}>Cliente</option></select></td>
        <td><input type="checkbox" data-c="ativo" ${c.ativo ? 'checked' : ''}></td></tr>`).join('') || '<tr><td colspan="4" class="vazio">Nenhum cadastrado.</td></tr>'}
      </tbody></table></div>`;
  } else {
    html += `<p class="suave peq">As categorias correspondem às colunas do relatório Quimicer e não podem ser criadas ou apagadas. Você pode renomear ou desativar.</p>
      <div class="tabela-wrap"><table class="t"><thead><tr><th>Quem pagou</th><th>Categoria</th><th>Coluna no Excel</th><th>Ativa</th></tr></thead><tbody>
      ${S.categorias.map((c) => `<tr data-cat="${c.id}"><td>${esc(GRUPOS[c.grupo])}</td><td><input data-c="nome" value="${esc(c.nome)}"></td><td>${esc(c.coluna_relatorio)}</td>
        <td><input type="checkbox" data-c="ativo" ${c.ativo ? 'checked' : ''}></td></tr>`).join('')}</tbody></table></div>`;
  }
  $('#app').innerHTML = html;
  $$('[data-ab]').forEach((b) => (b.onclick = () => (location.hash = '#/admin/' + b.dataset.ab)));

  const tabelas = { p: 'perfis', e: 'equipes', cc: 'centros_custo', cat: 'categorias' };
  $$('[data-c]').forEach((el) => (el.onchange = async () => {
    const tr = el.closest('tr'); const k = Object.keys(tabelas).find((x) => tr.dataset[x] !== undefined);
    let val = el.type === 'checkbox' ? el.checked : el.value.trim();
    if (el.dataset.c.endsWith('_id') && !val) val = null;
    if (el.dataset.c === 'nome' && !val && k !== 'p') { aviso('O nome não pode ficar vazio.', true); return; }
    try { await q(sb.from(tabelas[k]).update({ [el.dataset.c]: val }).eq('id', tr.dataset[k])); aviso('Salvo.'); if (el.type === 'checkbox' || el.dataset.c === 'cargo') telaAdmin(aba); }
    catch (e) { erro(e); }
  }));
  const fn = $('#f-novo');
  if (fn) fn.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    Object.keys(f).forEach((k) => (f[k] = f[k].trim() || null));
    try { await q(sb.from(aba === 'equipes' ? 'equipes' : 'centros_custo').insert(f)); aviso('Adicionado.'); telaAdmin(aba); }
    catch (err) { erro(/duplicate key/.test(err.message) ? new Error('Já existe um cadastro com esse nome/código.') : err); }
  };
}

// ---------- CONTA ----------
function telaConta() {
  $('#app').innerHTML = `<h1>Minha conta</h1>
    <div class="card"><div class="campos">
      <div><label>E-mail</label><div>${esc(S.eu.email)}</div></div>
      <div><label>Cargo</label><div>${esc(CARGOS[S.eu.cargo])}</div></div>
      <div><label>Equipe</label><div>${esc(S.equipes.find((e) => e.id === S.eu.equipe_id)?.nome || '—')}</div></div></div></div>
    <form class="card" id="f-nome"><label>Nome (aparece no relatório)</label><input name="nome" value="${esc(S.eu.nome)}" required>
      <div class="acoes"><button class="btn">Salvar nome</button></div></form>
    <form class="card" id="f-senha"><label>Nova senha</label><input name="senha" type="password" minlength="6" required autocomplete="new-password">
      <div class="acoes"><button class="btn">Trocar senha</button></div></form>`;
  $('#f-nome').onsubmit = async (e) => {
    e.preventDefault();
    try { const nome = new FormData(e.target).get('nome').trim(); await q(sb.from('perfis').update({ nome }).eq('id', S.eu.id)); S.eu.nome = nome; await carregarApoio(); montarMenu(); marcarMenu(); aviso('Nome salvo.'); }
    catch (err) { erro(err); }
  };
  $('#f-senha').onsubmit = async (e) => {
    e.preventDefault();
    try { await q(sb.auth.updateUser({ password: new FormData(e.target).get('senha') })); e.target.reset(); aviso('Senha alterada.'); }
    catch (err) { erro(err); }
  };
}

// ---------- início ----------
async function iniciar() {
  try {
    const { data } = await sb.auth.getSession();
    S.sessao = data.session;
    if (S.recuperandoSenha) return telaLogin('nova');
    if (!S.sessao) return telaLogin('entrar');
    await carregarEu();
    if (!S.eu || !S.eu.ativo) return telaAguardando();
    await carregarApoio();
    montarMenu();
    if (!location.hash || location.hash === '#') location.hash = '#/viagens'; else rotear();
  } catch (e) { erro(e); telaLogin('entrar'); }
}

let _ultimoUsuario;
sb.auth.onAuthStateChange((evento, sessao) => {
  if (evento === 'PASSWORD_RECOVERY') { S.recuperandoSenha = true; S.sessao = sessao; telaLogin('nova'); return; }
  const uid = sessao?.user?.id || null;
  if (evento === 'SIGNED_OUT' || (evento === 'SIGNED_IN' && uid !== _ultimoUsuario)) {
    _ultimoUsuario = uid;
    setTimeout(iniciar, 0);
  }
  _ultimoUsuario = uid;
});
iniciar();
