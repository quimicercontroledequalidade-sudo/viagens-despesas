/* Controle de Amostras — Quimicer */
'use strict';

const SUPABASE_URL = 'https://msjyjwwlafpjpixsnbjm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Rv9Aq6g6cU8prVxgJ5SYWw_5Q-RA8Ko';
const APP_VERSAO = '2026.11.05-1'; // mudar junto com versao.json a cada publicação
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ESTANTES = {
  laranja: 'Estante Laranja', amarela: 'Estante Amarela', azul: 'Estante Azul', verde: 'Estante Verde', branca: 'Estante Branca',
};
const S = { sessao: null, eu: null, amostras: [], filtro: { busca: '', estante: '', prateleira: '', situacao: 'ativa', validade: '' }, limite: 150 };

// ---------- utilitários ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dataBR = (iso) => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const hoje = () => new Date().toLocaleDateString('sv-SE');
const podeEditar = () => !!S.acesso; // Admin, Desenvolvedor e equipe Desenvolvimento
const podeApagar = () => ['admin', 'desenvolvedor'].includes(S.eu?.cargo);
const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function aviso(msg, erro = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (erro ? ' erro' : ''); t.hidden = false;
  clearTimeout(aviso._t); aviso._t = setTimeout(() => (t.hidden = true), erro ? 6000 : 3000);
}
function erro(e) {
  console.error(e);
  const m = e?.message || String(e);
  aviso(/row-level|permission/i.test(m) ? 'Você não tem permissão para esta ação.' : /Invalid login/i.test(m) ? 'E-mail ou senha incorretos.' : m, true);
}
async function q(p) { const { data, error } = await p; if (error) throw error; return data; }
function abrirModal(html) { $('#modal-box').innerHTML = html; $('#modal').hidden = false; return $('#modal-box'); }
function fecharModal() { $('#modal').hidden = true; $('#modal-box').innerHTML = ''; }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-fechar]')) fecharModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharModal(); });
function confirmar(msg, ok = 'Confirmar', perigo = false) {
  return new Promise((res) => {
    const b = abrirModal(`<h3>${esc(msg)}</h3><div class="acoes"><button class="btn sec" id="c-n">Cancelar</button><button class="btn ${perigo ? 'perigo' : ''}" id="c-s">${esc(ok)}</button></div>`);
    $('#c-n', b).onclick = () => { fecharModal(); res(false); };
    $('#c-s', b).onclick = () => { fecharModal(); res(true); };
  });
}

// ---------- situação de validade ----------
function statusValidade(a) {
  if (a.situacao === 'acabou') return { k: 'acabou', t: 'Acabou' };
  if (!a.data_validade) return (a.fab_texto || a.val_texto) ? { k: 'corrigir', t: 'Data a corrigir' } : { k: '', t: '' };
  const h = hoje();
  if (a.data_validade < h) return { k: 'vencida', t: 'Vencida' };
  const lim = new Date(); lim.setDate(lim.getDate() + 30);
  if (a.data_validade <= lim.toLocaleDateString('sv-SE')) return { k: 'vence', t: 'Vence em até 30 dias' };
  return { k: 'ok', t: 'No prazo' };
}
const badge = (a) => { const s = statusValidade(a); return s.k ? `<span class="st st-${s.k}">${esc(s.t)}</span>` : ''; };
function local(a, grande = false) {
  const c = a.estante || 'nenhuma';
  const nome = a.estante ? ESTANTES[a.estante] : 'Sem estante';
  if (grande) return `<div class="local-grande"><span class="bola c-${c}"></span>${esc(nome)}${a.prateleira ? ` · prateleira <span class="prat c-${c}">${esc(a.prateleira)}</span>` : ''}</div>`;
  return `<span class="local" title="${esc(nome)}${a.prateleira ? ' · prateleira ' + esc(a.prateleira) : ''}"><span class="bola c-${c}"></span>${a.prateleira ? `<span class="prat c-${c}">${esc(a.prateleira)}</span>` : ''}</span>`;
}

// ---------- login ----------
function telaLogin() {
  $('#topo').hidden = true;
  $('#app').innerHTML = `<div class="login"><div class="logo"><img src="logo_quimicer.png" alt="Quimicer"><h1>Controle de Amostras</h1></div>
    <form class="card" id="f-l"><label>E-mail</label><input name="email" type="email" required autocomplete="email">
      <label>Senha</label><input name="senha" type="password" required autocomplete="current-password">
      <div class="acoes"><button class="btn" style="flex:1;justify-content:center">Entrar</button></div>
      <p class="peq suave" style="text-align:center;margin:.8rem 0 0">Use o mesmo login do app Viagens &amp; Despesas.<br>
      Não tem conta? <a href="./#/cadastro">Criar conta</a></p></form></div>`;
  $('#f-l').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { await q(sb.auth.signInWithPassword({ email: f.get('email').trim(), password: f.get('senha') })); iniciar(); } catch (err) { erro(err); }
  };
}

// ---------- dados ----------
async function carregarAmostras() {
  const todas = [];
  for (let de = 0; ; de += 1000) {
    const parte = await q(sb.from('amostras').select('*').order('seq', { ascending: false }).range(de, de + 999));
    todas.push(...parte);
    if (parte.length < 1000) break;
  }
  S.amostras = todas;
}

function filtrar() {
  const f = S.filtro, b = sem(f.busca).trim();
  return S.amostras.filter((a) => {
    if (f.situacao && a.situacao !== f.situacao) return false;
    if (f.estante && (a.estante || 'nenhuma') !== f.estante) return false;
    if (f.prateleira && a.prateleira !== f.prateleira) return false;
    if (f.validade) {
      const s = statusValidade(a).k;
      if (f.validade === 'corrigir') { if (!(a.fab_texto || a.val_texto)) return false; }
      else if (f.validade === 'sem' ? (a.data_validade || a.val_texto) : s !== f.validade) return false;
    }
    if (b) {
      const alvo = sem([a.numero, a.descricao, a.fabricante, a.finalidade, a.observacoes].join(' '));
      if (!b.split(/\s+/).every((p) => alvo.includes(p))) return false;
    }
    return true;
  });
}

// ---------- tela principal ----------
function telaLista() {
  const ativas = S.amostras.filter((a) => a.situacao === 'ativa');
  const cont = (fn) => ativas.filter(fn).length;
  const n = {
    total: ativas.length,
    vencida: cont((a) => statusValidade(a).k === 'vencida'),
    vence: cont((a) => statusValidade(a).k === 'vence'),
    corrigir: S.amostras.filter((a) => a.fab_texto || a.val_texto).length,
    acabou: S.amostras.filter((a) => a.situacao === 'acabou').length,
  };
  const porEstante = {};
  ativas.forEach((a) => { const k = a.estante || 'nenhuma'; porEstante[k] = (porEstante[k] || 0) + 1; });
  const f = S.filtro;
  const prateleiras = [...new Set(S.amostras.map((a) => a.prateleira).filter(Boolean))].sort();
  const card = (chave, rot, val, sit, vld) => `<button data-atalho="${chave}" data-sit="${sit}" data-vld="${vld}" class="${f.situacao === sit && f.validade === vld ? 'on' : ''}">
    <span class="peq suave">${rot}</span><b>${val}</b></button>`;

  $('#app').innerHTML = `
    <div class="linha entre"><h1>Amostras</h1>
      <div class="linha">${podeEditar() ? '<button class="btn" id="b-nova">+ Nova amostra</button>' : ''}<button class="btn sec" id="b-excel">⬇ Excel</button></div></div>
    <div class="resumo">
      ${card('todas', 'Amostras ativas', n.total, 'ativa', '')}
      ${card('vencidas', '🔴 Vencidas', n.vencida, 'ativa', 'vencida')}
      ${card('vence', '🟡 Vencem em 30 dias', n.vence, 'ativa', 'vence')}
      ${card('corrigir', '✏️ Datas a corrigir', n.corrigir, '', 'corrigir')}
      ${card('acabou', '⚪ Acabaram', n.acabou, 'acabou', '')}
    </div>
    <div class="estantes">
      <button class="chip ${!f.estante ? 'on' : ''}" data-est="">Todas as estantes</button>
      ${[...Object.keys(ESTANTES), 'nenhuma'].filter((k) => porEstante[k] || k === f.estante).map((k) => `<button class="chip ${f.estante === k ? 'on' : ''}" data-est="${k}">
        <span class="bola c-${k}"></span>${k === 'nenhuma' ? 'Sem estante' : ESTANTES[k].replace('Estante ', '')} <span class="suave">${porEstante[k] || 0}</span></button>`).join('')}
    </div>
    <div class="filtros">
      <input class="busca" id="busca" type="search" placeholder="🔎 Buscar por número, produto, fabricante, finalidade…" value="${esc(f.busca)}">
      <select id="f-prat"><option value="">Todas as prateleiras</option>${prateleiras.map((p) => `<option ${p === f.prateleira ? 'selected' : ''}>${p}</option>`).join('')}</select>
      <select id="f-sit"><option value="ativa" ${f.situacao === 'ativa' ? 'selected' : ''}>Só ativas</option><option value="acabou" ${f.situacao === 'acabou' ? 'selected' : ''}>Só as que acabaram</option><option value="" ${!f.situacao ? 'selected' : ''}>Ativas e acabadas</option></select>
      <select id="f-val"><option value="">Qualquer validade</option>
        ${[['vencida', 'Vencidas'], ['vence', 'Vencem em 30 dias'], ['ok', 'No prazo'], ['corrigir', 'Data a corrigir'], ['sem', 'Sem validade']].map(([k, t]) => `<option value="${k}" ${f.validade === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
    </div>
    <div id="resultado"></div>`;

  desenharTabela();
  $('#busca').oninput = (e) => { S.filtro.busca = e.target.value; S.limite = 150; desenharTabela(); };
  $('#f-prat').onchange = (e) => { S.filtro.prateleira = e.target.value; S.limite = 150; telaLista(); };
  $('#f-sit').onchange = (e) => { S.filtro.situacao = e.target.value; S.limite = 150; telaLista(); };
  $('#f-val').onchange = (e) => { S.filtro.validade = e.target.value; S.limite = 150; telaLista(); };
  $$('[data-est]').forEach((b) => (b.onclick = () => { S.filtro.estante = b.dataset.est; S.limite = 150; telaLista(); }));
  $$('[data-atalho]').forEach((b) => (b.onclick = () => { Object.assign(S.filtro, { situacao: b.dataset.sit, validade: b.dataset.vld, estante: '', prateleira: '', busca: '' }); S.limite = 150; telaLista(); }));
  $('#b-nova') && ($('#b-nova').onclick = () => formAmostra());
  $('#b-excel').onclick = exportarExcel;
  const busca = $('#busca'); if (document.activeElement !== busca && S.filtro.busca) { busca.focus(); busca.setSelectionRange(busca.value.length, busca.value.length); }
}

function desenharTabela() {
  const lista = filtrar();
  const mostrar = lista.slice(0, S.limite);
  $('#resultado').innerHTML = `<p class="peq suave">${lista.length} amostra(s) encontrada(s)</p>
    ${lista.length ? `<div class="tabela-wrap"><table class="t"><thead><tr><th>Nº</th><th>Produto</th><th>Fabricante</th><th>Finalidade</th><th>Local</th><th>Validade</th></tr></thead>
    <tbody>${mostrar.map((a) => `<tr data-id="${a.id}" class="${a.situacao === 'acabou' ? 'acabou' : ''}">
      <td class="num">${esc(a.numero)}</td><td class="d-desc">${esc(a.descricao || '—')}</td><td class="d-fab">${esc(a.fabricante || '')}</td>
      <td class="d-fin">${esc(a.finalidade || '')}</td><td>${local(a)}</td>
      <td>${a.data_validade ? dataBR(a.data_validade) : esc(a.val_texto || '')} ${badge(a)}</td></tr>`).join('')}</tbody></table></div>
    ${lista.length > S.limite ? `<div class="mais"><button class="btn sec" id="b-mais">Mostrar mais (${lista.length - S.limite} restantes)</button></div>` : ''}`
    : '<div class="vazio card">Nenhuma amostra encontrada com esses filtros.</div>'}`;
  $$('#resultado tbody tr').forEach((tr) => (tr.onclick = () => verFicha(S.amostras.find((a) => a.id === tr.dataset.id))));
  $('#b-mais') && ($('#b-mais').onclick = () => { S.limite += 300; desenharTabela(); });
}

// ---------- ficha ----------
function verFicha(a) {
  const linha = (rot, val) => (val ? `<dt>${rot}</dt><dd>${val}</dd>` : '');
  const box = abrirModal(`<div class="linha entre"><h3 class="grande">${esc(a.numero)} — ${esc(a.descricao || 'sem descrição')}</h3></div>
    ${local(a, true)}
    <div>${badge(a)}</div>
    <dl class="ficha">
      ${linha('Fabricante', esc(a.fabricante))}
      ${linha('Projeto / finalidade', esc(a.finalidade))}
      ${linha('Data de fabricação', a.data_fabricacao ? dataBR(a.data_fabricacao) : a.fab_texto ? `<span class="st st-corrigir">na planilha: "${esc(a.fab_texto)}"</span>` : '')}
      ${linha('Data de validade', a.data_validade ? dataBR(a.data_validade) : a.val_texto ? `<span class="st st-corrigir">na planilha: "${esc(a.val_texto)}"</span>` : '')}
      ${linha('Custo', a.custo != null ? Number(a.custo).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '')}
      ${linha('Observações', esc(a.observacoes).replace(/\n/g, '<br>'))}
    </dl>
    <div class="acoes">
      ${podeEditar() ? `${podeApagar() ? '<button class="btn sec perigo-txt" id="f-apagar">🗑 Apagar</button>' : ''}
        <button class="btn sec" id="ficha-sit">${a.situacao === 'acabou' ? '↩️ Reativar' : '⚪ Marcar que acabou'}</button>
        <button class="btn sec" id="f-editar">✏️ Editar</button>` : ''}
      <button class="btn" data-fechar>Fechar</button>
    </div>`);
  if (!podeEditar()) return;
  $('#f-editar', box).onclick = () => formAmostra(a);
  $('#ficha-sit', box).onclick = async () => {
    try {
      const nova = a.situacao === 'acabou' ? 'ativa' : 'acabou';
      const [r] = await q(sb.from('amostras').update({ situacao: nova }).eq('id', a.id).select());
      Object.assign(a, r); fecharModal(); aviso(nova === 'acabou' ? `${a.numero} marcada como "acabou".` : `${a.numero} reativada.`); telaLista();
    } catch (e) { erro(e); }
  };
  if ($('#f-apagar', box)) $('#f-apagar', box).onclick = async () => {
    if (!(await confirmar(`Apagar a amostra ${a.numero} (${a.descricao || ''})? Isso não pode ser desfeito. Se o produto só acabou, prefira "Marcar que acabou".`, 'Apagar', true))) return;
    try { await q(sb.from('amostras').delete().eq('id', a.id)); S.amostras = S.amostras.filter((x) => x.id !== a.id); aviso('Amostra apagada.'); telaLista(); } catch (e) { erro(e); }
  };
}

// ---------- cadastro / edição ----------
function formAmostra(a = null) {
  const nova = !a; a = a || { situacao: 'ativa' };
  const lista = (campo) => [...new Set(S.amostras.map((x) => x[campo]).filter(Boolean))].sort((x, y) => x.localeCompare(y));
  const proximo = 'AQM-' + (Math.max(100000, ...S.amostras.map((x) => x.seq)) + 1);
  const box = abrirModal(`<h3>${nova ? `Nova amostra <span class="suave peq">(número previsto: ${proximo})</span>` : 'Editar ' + esc(a.numero)}</h3>
    <form id="f-a"><div class="campos">
      <div class="cheio"><label>Produto / descrição *</label><input name="descricao" required maxlength="150" value="${esc(a.descricao)}"></div>
      <div><label>Fabricante</label><input name="fabricante" list="dl-fab" maxlength="80" value="${esc(a.fabricante)}"><datalist id="dl-fab">${lista('fabricante').map((x) => `<option value="${esc(x)}">`).join('')}</datalist></div>
      <div><label>Projeto / finalidade</label><input name="finalidade" list="dl-fin" maxlength="100" value="${esc(a.finalidade)}"><datalist id="dl-fin">${lista('finalidade').map((x) => `<option value="${esc(x)}">`).join('')}</datalist></div>
      <div><label>Estante (cor) *</label><select name="estante" required><option value="">— escolha —</option>${Object.entries(ESTANTES).map(([k, t]) => `<option value="${k}" ${a.estante === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div><label>Prateleira (letra) *</label><select name="prateleira" required><option value="">—</option>${'ABCDEFGH'.split('').map((p) => `<option ${a.prateleira === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
      <div><label>Data de fabricação</label><input type="date" name="data_fabricacao" value="${esc(a.data_fabricacao)}">${a.fab_texto ? `<span class="peq suave">Na planilha: "${esc(a.fab_texto)}"</span>` : ''}</div>
      <div><label>Data de validade</label><input type="date" name="data_validade" value="${esc(a.data_validade)}">${a.val_texto ? `<span class="peq suave">Na planilha: "${esc(a.val_texto)}"</span>` : ''}</div>
      <div><label>Custo (R$)</label><input name="custo" inputmode="decimal" value="${a.custo != null ? String(a.custo).replace('.', ',') : ''}"></div>
      <div><label>Situação</label><select name="situacao"><option value="ativa" ${a.situacao === 'ativa' ? 'selected' : ''}>Ativa</option><option value="acabou" ${a.situacao === 'acabou' ? 'selected' : ''}>Acabou</option></select></div>
      <div class="cheio"><label>Observações</label><textarea name="observacoes">${esc(a.observacoes)}</textarea></div>
    </div>
    <div class="acoes"><button type="button" class="btn sec" data-fechar>Cancelar</button><button class="btn">Salvar</button></div></form>`);
  $('#f-a', box).onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    let custo = String(f.custo || '').trim().replace(/R\$|\s/g, '');
    if (custo.includes(',')) custo = custo.replace(/\./g, '').replace(',', '.');
    custo = custo === '' ? null : Number(custo);
    if (custo !== null && !isFinite(custo)) return aviso('Custo inválido.', true);
    if (f.data_fabricacao && f.data_validade && f.data_validade < f.data_fabricacao && !(await confirmar('A validade está antes da fabricação. Salvar mesmo assim?'))) return;
    const reg = {
      descricao: f.descricao.trim(), fabricante: f.fabricante.trim() || null, finalidade: f.finalidade.trim() || null,
      estante: f.estante || null, prateleira: f.prateleira || null, data_fabricacao: f.data_fabricacao || null, data_validade: f.data_validade || null,
      custo, situacao: f.situacao, observacoes: f.observacoes.trim() || null,
    };
    // datas corrigidas: apaga o texto antigo da planilha
    if (!nova) { if (reg.data_fabricacao) reg.fab_texto = null; if (reg.data_validade) reg.val_texto = null; }
    try {
      if (nova) {
        const r = await q(sb.from('amostras').insert(reg).select().single());
        S.amostras.unshift(r); fecharModal(); aviso(`Amostra ${r.numero} cadastrada. Anote o número na etiqueta.`); telaLista(); verFicha(r);
      } else {
        const [r] = await q(sb.from('amostras').update(reg).eq('id', a.id).select());
        Object.assign(a, r); fecharModal(); aviso('Alterações salvas.'); telaLista();
      }
    } catch (err) { erro(err); }
  };
}

// ---------- Excel ----------
async function exportarExcel() {
  try {
    const lista = filtrar();
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Amostras');
    ws.columns = [
      { header: 'Nº Amostra', key: 'numero', width: 13 }, { header: 'Descrição', key: 'descricao', width: 34 }, { header: 'Fabricante', key: 'fabricante', width: 20 },
      { header: 'Data de fab.', key: 'fab', width: 12 }, { header: 'Data de val.', key: 'val', width: 12 }, { header: 'Custo', key: 'custo', width: 11 },
      { header: 'Projeto / finalidade', key: 'finalidade', width: 24 }, { header: 'Estante', key: 'estante', width: 10 }, { header: 'Prateleira', key: 'prat', width: 10 },
      { header: 'Situação', key: 'sit', width: 10 }, { header: 'Observações', key: 'obs', width: 60 },
    ];
    const cores = { laranja: 'FFF28C28', amarela: 'FFFFFF00', azul: 'FF4472C4', verde: 'FF00A933' };
    const d = (iso, txt) => { if (!iso) return txt || ''; const [y, m, dd] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)); };
    lista.slice().sort((x, y) => x.seq - y.seq).forEach((a) => {
      const row = ws.addRow({ numero: a.numero, descricao: a.descricao || '', fabricante: a.fabricante || '', fab: d(a.data_fabricacao, a.fab_texto), val: d(a.data_validade, a.val_texto),
        custo: a.custo != null ? Number(a.custo) : '', finalidade: a.finalidade || '', estante: a.estante ? ESTANTES[a.estante].replace('Estante ', '') : '', prat: a.prateleira || '',
        sit: a.situacao === 'acabou' ? 'Acabou' : 'Ativa', obs: a.observacoes || '' });
      if (cores[a.estante]) row.getCell('prat').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cores[a.estante] } };
    });
    ws.getColumn('fab').numFmt = 'dd/mm/yyyy'; ws.getColumn('val').numFmt = 'dd/mm/yyyy'; ws.getColumn('custo').numFmt = '"R$" #,##0.00';
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF009999' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: 'A1', to: 'K1' };
    const blob = new Blob([await wb.xlsx.writeBuffer()]);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Controle_de_amostras_${hoje()}.xlsx`; document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { erro(e); }
}

// ---------- atualizar ----------
async function atualizarApp() {
  try {
    if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); }
    await Promise.all(['amostras.html', 'amostras.js', 'amostras.css'].map((a) => fetch(a, { cache: 'reload' }).catch(() => {})));
  } catch { /* segue */ }
  location.replace(location.pathname + '?v=' + Date.now());
}

// ---------- início ----------
async function iniciar() {
  try {
    const { data } = await sb.auth.getSession();
    S.sessao = data.session;
    if (!S.sessao) return telaLogin();
    S.eu = await q(sb.from('perfis').select('*').eq('id', S.sessao.user.id).maybeSingle());
    $('#topo').hidden = false;
    $('#quem').textContent = S.eu ? (S.eu.nome || S.eu.email) : '';
    if (!S.eu || !S.eu.ativo) { $('#app').innerHTML = '<div class="vazio card">Seu acesso ainda não foi liberado por um administrador.</div>'; return; }
    S.acesso = await q(sb.rpc('pode_amostras'));
    if (!S.acesso) { $('#app').innerHTML = '<div class="vazio card">Você ainda não tem acesso ao Controle de Amostras. Peça ao desenvolvedor para liberar a aba <b>🧪 Controle de Amostras</b> para você.</div>'; return; }
    $('#app').innerHTML = '<div class="vazio">Carregando amostras…</div>';
    await carregarAmostras();
    telaLista();
  } catch (e) { erro(e); $('#app').innerHTML = '<div class="vazio card">Não foi possível carregar. <button class="btn sec" onclick="iniciar()">Tentar de novo</button></div>'; }
}
$('#b-sair').onclick = async () => { await sb.auth.signOut(); iniciar(); };
$('#b-atualizar').onclick = atualizarApp;
iniciar();
