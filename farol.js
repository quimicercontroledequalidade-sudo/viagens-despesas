/* Farol de Indicadores — Técnica e Qualidade — Quimicer */
'use strict';

const SUPABASE_URL = 'https://msjyjwwlafpjpixsnbjm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Rv9Aq6g6cU8prVxgJ5SYWw_5Q-RA8Ko';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const { MESES, media, atingimento, status, score, statusScore } = FarolExcel;
const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const COR = { 'Dentro da Meta': 'ok', 'Atenção': 'atencao', 'Crítico': 'critico', 'Sem dados': 'sem' };

const agora = new Date();
const S = { eu: null, anos: [], ano: agora.getFullYear(), mes: agora.getMonth(), painel: null, inds: [], rascunho: {}, obsRascunho: null };

// ---------- utilitários ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eAdmin = () => ['admin', 'desenvolvedor'].includes(S.eu?.cargo);
const fmt = (n, casas = 1) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: casas }));
const fmtIn = (n) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 4, useGrouping: false }));
const lerNum = (t) => { const s = String(t ?? '').trim().replace(/\s/g, ''); if (!s) return null; const v = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return isFinite(v) ? v : NaN; };
function aviso(msg, erro = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (erro ? ' erro' : ''); t.hidden = false;
  clearTimeout(aviso._t); aviso._t = setTimeout(() => (t.hidden = true), erro ? 6000 : 3000);
}
function erro(e) {
  console.error(e);
  const m = e?.message || String(e);
  aviso(/row-level|permission|Sem permiss/i.test(m) ? 'Você não tem permissão para esta ação.' : /Invalid login/i.test(m) ? 'E-mail ou senha incorretos.' : m, true);
}
async function q(p) { const { data, error } = await p; if (error) throw error; return data; }
function abrirModal(html) { $('#modal-box').innerHTML = html; $('#modal').hidden = false; return $('#modal-box'); }
function fecharModal() { $('#modal').hidden = true; $('#modal-box').innerHTML = ''; }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-fechar]')) fecharModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharModal(); });
const luz = (st, txt) => `<span class="luz ${COR[st] || 'sem'}">${esc(txt ?? st)}</span>`;

// valores do indicador com o que a pessoa está digitando (para o farol mudar na hora)
function valoresAtuais(ind) {
  const v = [...(ind.valores || Array(12).fill(null))];
  if (Object.prototype.hasOwnProperty.call(S.rascunho, ind.id)) { const n = lerNum(S.rascunho[ind.id]); v[S.mes] = Number.isFinite(n) ? n : null; }
  return v;
}
const comRascunho = () => S.inds.map((i) => ({ ...i, valores: valoresAtuais(i) }));

// ---------- login ----------
function telaLogin() {
  $('#topo').hidden = true;
  $('#app').innerHTML = `<div class="login"><div class="logo"><img src="logo_quimicer.png" alt="Quimicer"><h1>Farol de Indicadores</h1></div>
    <form class="card" id="f-l"><label>E-mail</label><input name="email" type="email" required autocomplete="email">
      <label>Senha</label><input name="senha" type="password" required autocomplete="current-password">
      <div class="acoes"><button class="btn" style="flex:1;justify-content:center">Entrar</button></div>
      <p class="peq suave" style="text-align:center;margin:.8rem 0 0">Use o mesmo login do app Viagens &amp; Despesas.</p></form></div>`;
  $('#f-l').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { await q(sb.auth.signInWithPassword({ email: f.get('email').trim(), password: f.get('senha') })); iniciar(); } catch (err) { erro(err); }
  };
}

// ---------- dados ----------
async function carregar() {
  S.anos = (await q(sb.from('farol_paineis').select('ano').order('ano', { ascending: false }))).map((r) => r.ano);
  if (!S.anos.includes(S.ano)) S.ano = S.anos[0] ?? S.ano;
  S.painel = await q(sb.from('farol_paineis').select('*').eq('ano', S.ano).maybeSingle());
  S.inds = S.painel ? await q(sb.from('farol_indicadores').select('*').eq('ano', S.ano).order('ordem')) : [];
  S.rascunho = {}; S.obsRascunho = null;
}

// ---------- tela ----------
function tela() {
  const p = S.painel;
  if (!p) {
    $('#app').innerHTML = `<div class="vazio card">Nenhum farol cadastrado ainda.${eAdmin() ? ' <button class="btn" id="b-novo-ano">➕ Criar farol de ' + S.ano + '</button>' : ''}</div>`;
    $('#b-novo-ano')?.addEventListener('click', novoAno);
    return;
  }
  const inds = comRascunho();
  const sc = score(inds), stSc = statusScore(sc);
  const somaPesos = inds.reduce((s, i) => s + (Number(i.peso) || 0), 0);
  const obs = S.obsRascunho ?? ((p.observacoes || {})[String(S.mes + 1)] || '');
  $('#app').innerHTML = `
    <div class="linha entre" style="margin-bottom:.6rem">
      <div><h1>Farol de Indicadores</h1><div class="suave">Área: <b>${esc(p.area)}</b> · ${esc(p.responsavel || '')}</div></div>
      <div class="linha">
        <select id="s-ano" title="Ano">${S.anos.map((a) => `<option ${a === S.ano ? 'selected' : ''}>${a}</option>`).join('')}</select>
        <select id="s-mes" title="Mês do farol">${MESES_LONGOS.map((m, i) => `<option value="${i}" ${i === S.mes ? 'selected' : ''}>${m}</option>`).join('')}</select>
      </div>
    </div>
    <p class="peq suave" style="margin:0 0 .8rem">${esc(p.okr || '')}</p>

    <div class="placar">
      <div class="placar-score ${COR[stSc]}"><div class="peq">Score ponderado da área — ${MESES[S.mes]}/${S.ano}</div><b>${fmt(sc)}%</b><div>${esc(stSc)}</div></div>
      <div class="placar-inds">${inds.map((i) => { const st = status(i); return `<div class="placar-ind"><span class="bolinha ${COR[st]}" title="${esc(st)}"></span><div><div class="peq">${esc(i.nome)}</div><b>${fmt(atingimento(i))}%</b> <span class="peq suave">${esc(st)}</span></div></div>`; }).join('')}</div>
    </div>

    <form class="card" id="f-mes">
      <div class="linha entre"><h3 style="margin:0">✏️ Lançar ${MESES_LONGOS[S.mes]} de ${S.ano}</h3>
        <span class="peq suave">Digite o valor apurado no mês. O farol muda na hora.</span></div>
      <div class="lanc">${inds.map((i) => {
        const v = Object.prototype.hasOwnProperty.call(S.rascunho, i.id) ? S.rascunho[i.id] : fmtIn((i.valores || [])[S.mes]);
        const st = status(i);
        return `<div class="lanc-l"><div class="lanc-nome"><b>${esc(i.nome)}</b><div class="peq suave">Meta ${fmt(i.meta, 2)} · ${i.direcao === 'menor' ? 'menor é melhor' : 'maior é melhor'} · peso ${fmt(i.peso)}%</div></div>
          <input class="lanc-v" data-ind="${i.id}" inputmode="decimal" autocomplete="off" value="${esc(v)}" placeholder="—">
          <div class="lanc-st">${luz(st)}<div class="peq suave">média ${fmt(media(i.valores), 2)} · ${fmt(atingimento(i))}%</div></div></div>`;
      }).join('')}</div>
      <label>Observações / Plano de Ação da Área — ${MESES_LONGOS[S.mes]} (ISO 9001, cláusula 10.2)</label>
      <textarea id="obs" rows="4" placeholder="Análise do mês, causas e ações para os indicadores em Atenção ou Crítico…">${esc(obs)}</textarea>
      <div class="acoes">
        ${eAdmin() ? '<button type="button" class="btn sec" id="b-config">⚙ Indicadores e metas</button>' : ''}
        <button type="button" class="btn sec" id="b-pdf">🖨 PDF</button>
        <button type="button" class="btn sec" id="b-excel">⬇ Excel</button>
        <button class="btn" id="b-salvar">💾 Salvar ${MESES[S.mes]}</button>
      </div>
    </form>

    <h3>Ano ${S.ano}</h3>
    <div class="tabela-wrap"><table class="tf farol"><thead><tr><th>Indicador</th><th class="num">Peso</th><th>Direção</th><th class="num">Meta</th>
      ${MESES.map((m, k) => `<th class="num ${k === S.mes ? 'dest' : ''}">${m}</th>`).join('')}<th class="num">Média</th><th class="num">Ating.</th><th>Status</th></tr></thead>
      <tbody>${inds.map((i) => `<tr><td>${esc(i.nome)}</td><td class="num">${fmt(i.peso)}</td><td class="peq">${i.direcao === 'menor' ? 'Menor é melhor' : 'Maior é melhor'}</td><td class="num">${fmt(i.meta, 2)}</td>
        ${i.valores.map((v, k) => `<td class="num ${k === S.mes ? 'dest' : ''}" data-mes="${k}">${fmt(v, 2)}</td>`).join('')}
        <td class="num">${fmt(media(i.valores), 2)}</td><td class="num">${fmt(atingimento(i))}</td><td>${luz(status(i))}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Score ponderado da área</td><td class="num ${somaPesos === 100 ? '' : 'alerta'}" title="Soma dos pesos">${fmt(somaPesos)}</td><td colspan="15"></td><td class="num"><b>${fmt(sc)}</b></td><td>${luz(stSc)}</td></tr></tfoot>
    </table></div>
    <p class="peq suave">Toque num mês da tabela para lançar ou corrigir aquele mês. ${somaPesos === 100 ? '' : '<b style="color:var(--perigo)">A soma dos pesos deveria ser 100%.</b>'} ${esc(p.nota || '')}</p>`;

  $('#s-ano').onchange = async (e) => { if (!(await descartar())) { e.target.value = S.ano; return; } S.ano = Number(e.target.value); await carregar(); tela(); };
  $('#s-mes').onchange = async (e) => { if (!(await descartar())) { e.target.value = S.mes; return; } S.mes = Number(e.target.value); S.rascunho = {}; S.obsRascunho = null; tela(); };
  $$('td[data-mes]').forEach((td) => (td.onclick = async () => { if (+td.dataset.mes === S.mes || !(await descartar())) return; S.mes = +td.dataset.mes; S.rascunho = {}; S.obsRascunho = null; tela(); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
  $$('.lanc-v').forEach((inp) => {
    inp.oninput = () => { S.rascunho[inp.dataset.ind] = inp.value; atualizarLuzes(); };
  });
  $('#obs').oninput = (e) => { S.obsRascunho = e.target.value; };
  $('#f-mes').onsubmit = (e) => { e.preventDefault(); salvar(); };
  $('#b-excel').onclick = baixarExcel;
  $('#b-pdf').onclick = imprimir;
  $('#b-config')?.addEventListener('click', configurar);
}

// atualiza só os faróis enquanto digita (sem redesenhar e perder o foco)
function atualizarLuzes() {
  const inds = comRascunho();
  inds.forEach((i) => {
    const l = $(`.lanc-v[data-ind="${i.id}"]`)?.closest('.lanc-l'); if (!l) return;
    const n = lerNum(S.rascunho[i.id]);
    $(`.lanc-v[data-ind="${i.id}"]`).classList.toggle('invalido', Number.isNaN(n));
    $('.lanc-st', l).innerHTML = `${luz(status(i))}<div class="peq suave">média ${fmt(media(i.valores), 2)} · ${fmt(atingimento(i))}%</div>`;
  });
  const sc = score(inds), st = statusScore(sc), box = $('.placar-score');
  box.className = 'placar-score ' + COR[st];
  box.innerHTML = `<div class="peq">Score ponderado da área — ${MESES[S.mes]}/${S.ano}</div><b>${fmt(sc)}%</b><div>${esc(st)}</div>`;
  $$('.placar-ind').forEach((el, k) => { const i = inds[k], s = status(i); el.innerHTML = `<span class="bolinha ${COR[s]}" title="${esc(s)}"></span><div><div class="peq">${esc(i.nome)}</div><b>${fmt(atingimento(i))}%</b> <span class="peq suave">${esc(s)}</span></div>`; });
}

const temRascunho = () => Object.keys(S.rascunho).length > 0 || S.obsRascunho !== null;
function descartar() {
  if (!temRascunho()) return Promise.resolve(true);
  return new Promise((res) => {
    const b = abrirModal(`<h3>Você tem alterações não salvas em ${MESES_LONGOS[S.mes]}.</h3><p>Deseja salvar antes de trocar?</p>
      <div class="acoes"><button class="btn sec" id="c-d">Descartar</button><button class="btn sec" id="c-n">Voltar</button><button class="btn" id="c-s">Salvar</button></div>`);
    $('#c-n', b).onclick = () => { fecharModal(); res(false); };
    $('#c-d', b).onclick = () => { fecharModal(); S.rascunho = {}; S.obsRascunho = null; res(true); };
    $('#c-s', b).onclick = async () => { fecharModal(); res(await salvar(false)); };
  });
}

async function salvar(redesenhar = true) {
  const mudou = Object.entries(S.rascunho).filter(([id, txt]) => { const i = S.inds.find((x) => x.id === id); const n = lerNum(txt); return (Number.isNaN(n) ? 'x' : n) !== (i.valores[S.mes] ?? null); });
  const ruim = mudou.find(([, t]) => Number.isNaN(lerNum(t)));
  if (ruim) { aviso('Há um valor que não é número. Corrija o campo em vermelho.', true); return false; }
  const btn = $('#b-salvar'); if (btn) btn.disabled = true;
  try {
    for (const [id, txt] of mudou) await q(sb.rpc('farol_lancar', { p_id: id, p_mes: S.mes + 1, p_valor: lerNum(txt) }));
    if (S.obsRascunho !== null && S.obsRascunho.trim() !== ((S.painel.observacoes || {})[String(S.mes + 1)] || '').trim()) {
      await q(sb.rpc('farol_observacao', { p_ano: S.ano, p_mes: S.mes + 1, p_texto: S.obsRascunho.trim() }));
    }
    aviso(mudou.length || S.obsRascunho !== null ? `${MESES_LONGOS[S.mes]} salvo.` : 'Nada para salvar.');
    await carregar();
    if (redesenhar) tela();
    return true;
  } catch (e) { erro(e); return false; } finally { if (btn) btn.disabled = false; }
}

// ---------- Excel e PDF ----------
let _modelo = null;
async function baixarExcel() {
  try {
    if (temRascunho()) aviso('O arquivo usa o que está na tela, inclusive o que ainda não foi salvo.');
    _modelo = _modelo || await (await fetch('modelo_farol.xlsx')).arrayBuffer();
    const painel = { ...S.painel, observacoes: { ...(S.painel.observacoes || {}), ...(S.obsRascunho !== null ? { [String(S.mes + 1)]: S.obsRascunho } : {}) } };
    const blob = await FarolExcel.gerarExcel(JSZip, _modelo, { painel, indicadores: comRascunho(), mes: S.mes });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `Farol_Tecnica_Qualidade_${S.ano}-${String(S.mes + 1).padStart(2, '0')}_${MESES[S.mes]}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) { erro(e); }
}

function imprimir() {
  const p = S.painel, inds = comRascunho(), sc = score(inds);
  const obs = S.obsRascunho ?? ((p.observacoes || {})[String(S.mes + 1)] || '');
  $('#impressao').innerHTML = `<div class="imp">
    <img src="logo_quimicer.png" class="imp-logo" alt="Quimicer">
    <div class="imp-tit">Farol de Indicadores – Área: ${esc(p.area)} (ligado ao(s) OKR(s) da Diretoria abaixo)</div>
    <div class="imp-okr">${esc(p.okr || '')}</div>
    <div class="imp-resp"><b>Responsável:</b> ${esc(p.responsavel || '')} &nbsp;&nbsp; <b>Ano:</b> ${p.ano} &nbsp;&nbsp; <b>Farol de:</b> ${MESES_LONGOS[S.mes]}</div>
    <div class="imp-nota">${esc(p.nota || '')}</div>
    <table class="imp-t"><thead><tr><th>Indicador</th><th>Peso (%)</th><th>Direção</th><th>Meta</th>${MESES.map((m, k) => `<th class="${k === S.mes ? 'dest' : ''}">${m}</th>`).join('')}<th>Acum. / Média</th><th>Atingimento (%)</th><th>Status</th></tr></thead>
    <tbody>${inds.map((i) => `<tr><td class="nome">${esc(i.nome)}</td><td>${fmt(i.peso)}</td><td class="dir">${i.direcao === 'menor' ? 'Menor é melhor' : 'Maior é melhor'}</td><td class="val">${fmt(i.meta, 2)}</td>
      ${i.valores.map((v, k) => `<td class="val ${k === S.mes ? 'dest' : ''}">${fmt(v, 2)}</td>`).join('')}<td>${fmt(media(i.valores), 1)}</td><td>${fmt(atingimento(i), 1)}</td><td class="stf ${COR[status(i)]}">${esc(status(i))}</td></tr>`).join('')}
    <tr class="soma"><td>Soma dos Pesos (deve ser 100%)</td><td>${fmt(inds.reduce((s, i) => s + (Number(i.peso) || 0), 0))}</td><td colspan="17"></td></tr>
    <tr class="score"><td colspan="17">Score Ponderado da Área</td><td>${fmt(sc, 1)}</td><td class="stf ${COR[statusScore(sc)]}">${esc(statusScore(sc))}</td></tr></tbody></table>
    <div class="imp-obs-t">Observações / Plano de Ação da Área (ISO 9001, cláusula 10.2) — ${MESES[S.mes]}/${p.ano}:</div>
    <div class="imp-obs">${esc(obs)}</div></div>`;
  const tituloAntes = document.title;
  document.title = `Farol_Tecnica_Qualidade_${S.ano}-${String(S.mes + 1).padStart(2, '0')}`;
  setTimeout(() => { window.print(); document.title = tituloAntes; }, 150);
}

// ---------- configuração (Admin / Desenvolvedor) ----------
function configurar() {
  const p = S.painel;
  const b = abrirModal(`<h3>⚙ Indicadores e metas — ${S.ano}</h3>
    <form id="f-cfg">
      <label>OKR(s) da Diretoria vinculado(s)</label><input name="okr" value="${esc(p.okr || '')}">
      <label>Responsável</label><input name="responsavel" value="${esc(p.responsavel || '')}">
      <label>Nota do farol</label><textarea name="nota" rows="2">${esc(p.nota || '')}</textarea>
      <div class="tabela-wrap" style="margin-top:.8rem"><table class="tf cfg"><thead><tr><th>Indicador</th><th>Peso (%)</th><th>Direção</th><th>Meta</th></tr></thead><tbody>
      ${S.inds.map((i) => `<tr data-id="${i.id}"><td><input data-c="nome" value="${esc(i.nome)}" required></td><td><input data-c="peso" inputmode="decimal" value="${fmtIn(i.peso)}" style="width:80px"></td>
        <td><select data-c="direcao"><option value="maior" ${i.direcao === 'maior' ? 'selected' : ''}>Maior é melhor</option><option value="menor" ${i.direcao === 'menor' ? 'selected' : ''}>Menor é melhor</option></select></td>
        <td><input data-c="meta" inputmode="decimal" value="${fmtIn(i.meta)}" style="width:90px"></td></tr>`).join('')}
      </tbody></table></div>
      <p class="peq suave" id="cfg-soma"></p>
      <div class="acoes"><button type="button" class="btn sec" id="b-ano-novo">➕ Criar farol de ${Math.max(...S.anos) + 1}</button><button type="button" class="btn sec" data-fechar>Cancelar</button><button class="btn">Salvar</button></div>
    </form>`);
  const soma = () => { const t = $$('[data-c="peso"]', b).reduce((s, el) => s + (lerNum(el.value) || 0), 0); $('#cfg-soma', b).innerHTML = `Soma dos pesos: <b style="color:${t === 100 ? 'var(--ok)' : 'var(--perigo)'}">${fmt(t, 2)}%</b> (deve ser 100%)`; };
  $$('[data-c="peso"]', b).forEach((el) => (el.oninput = soma)); soma();
  $('#b-ano-novo', b).onclick = () => { fecharModal(); novoAno(); };
  $('#f-cfg', b).onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      for (const tr of $$('tr[data-id]', b)) {
        const reg = { nome: $('[data-c="nome"]', tr).value.trim(), peso: lerNum($('[data-c="peso"]', tr).value) || 0, direcao: $('[data-c="direcao"]', tr).value, meta: lerNum($('[data-c="meta"]', tr).value) };
        if (Number.isNaN(reg.meta) || Number.isNaN(reg.peso)) throw new Error('Peso e meta precisam ser números.');
        await q(sb.from('farol_indicadores').update(reg).eq('id', tr.dataset.id));
      }
      await q(sb.from('farol_paineis').update({ okr: f.get('okr').trim(), responsavel: f.get('responsavel').trim(), nota: f.get('nota').trim() }).eq('ano', S.ano));
      fecharModal(); aviso('Indicadores atualizados.'); await carregar(); tela();
    } catch (err) { erro(err); }
  };
}

async function novoAno() {
  const novo = S.anos.length ? Math.max(...S.anos) + 1 : S.ano;
  try {
    await q(sb.rpc('farol_novo_ano', { p_ano: novo }));
    S.ano = novo; S.mes = 0; await carregar(); tela();
    aviso(`Farol de ${novo} criado com os mesmos indicadores e metas. Ajuste as metas em ⚙ se precisar.`);
  } catch (e) { erro(e); }
}

// ---------- atualizar ----------
async function atualizarApp() {
  try {
    if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); }
    await Promise.all(['farol.html', 'farol.js', 'farol.css', 'farol_excel.js', 'modelo_farol.xlsx'].map((a) => fetch(a, { cache: 'reload' }).catch(() => {})));
  } catch { /* segue */ }
  location.replace(location.pathname + '?v=' + Date.now());
}

// ---------- início ----------
async function iniciar() {
  try {
    const { data } = await sb.auth.getSession();
    if (!data.session) return telaLogin();
    S.eu = await q(sb.from('perfis').select('*').eq('id', data.session.user.id).maybeSingle());
    $('#topo').hidden = false;
    $('#quem').textContent = S.eu ? (S.eu.nome || S.eu.email) : '';
    if (!S.eu || !S.eu.ativo) { $('#app').innerHTML = '<div class="vazio card">Seu acesso ainda não foi liberado por um administrador.</div>'; return; }
    if (!(await q(sb.rpc('pode_farol')))) { $('#app').innerHTML = '<div class="vazio card">Você ainda não tem acesso ao Farol de Indicadores. Peça ao desenvolvedor para liberar a aba <b>🚦 Farol</b> para você.</div>'; return; }
    $('#app').innerHTML = '<div class="vazio">Carregando o farol…</div>';
    await carregar();
    tela();
  } catch (e) { erro(e); $('#app').innerHTML = '<div class="vazio card">Não foi possível carregar. <button class="btn sec" onclick="iniciar()">Tentar de novo</button></div>'; }
}
window.addEventListener('beforeunload', (e) => { if (temRascunho()) { e.preventDefault(); e.returnValue = ''; } });
$('#b-sair').onclick = async () => { await sb.auth.signOut(); iniciar(); };
$('#b-atualizar').onclick = atualizarApp;
iniciar();
