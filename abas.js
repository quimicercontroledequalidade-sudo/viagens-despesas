// Barra "Desenvolvimento": abas com os apps Quimicer dentro do app Viagens & Despesas.
// Para incluir um app novo, acrescente um item em APPS_ABAS.
(function () {
  const APPS_ABAS = [
    { id: 'cadastros', nome: 'Cadastros', icone: '👥', interno: true, rota: '#/admin', soAdmin: true },
    { id: 'viagens', nome: 'Viagens & Despesas', icone: '✈️', interno: true },
    { id: 'amostras', nome: 'Controle de Amostras', icone: '🧪', endereco: 'amostras.html', pronto: true, soDev: true,
      descricao: 'Controle das amostras AQM, com descrição dos produtos e local de armazenamento (estante/prateleira).' },
  ];
  window.DevAbas = { definirCargo() {} };
  if (window.top !== window.self) return; // já está dentro de outro painel: não repete as abas
  let cargo = null; // "soDev" só para o Desenvolvedor; "soAdmin" para Admin e Desenvolvedor
  const pode = (a) => (!a.soDev || cargo === 'desenvolvedor') && (!a.soAdmin || cargo === 'admin' || cargo === 'desenvolvedor');
  const PADRAO = 'viagens';

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lembrar = (v) => { try { if (v === undefined) return localStorage.getItem('dev.aba'); localStorage.setItem('dev.aba', v); } catch { /* sem armazenamento */ } return v; };

  const barra = document.createElement('div');
  barra.className = 'dev-barra';
  barra.innerHTML = `<span class="dev-titulo">Desenvolvimento</span><nav class="dev-abas" role="tablist">${APPS_ABAS.map((a) =>
    `<button role="tab" data-aba="${a.id}"${a.soDev || a.soAdmin ? ' hidden' : ''}>${a.icone} ${esc(a.nome)}${a.interno || a.pronto ? '' : ' <span class="dev-breve">em breve</span>'}</button>`).join('')}</nav>`;
  document.body.prepend(barra);

  const area = document.createElement('div');
  area.className = 'dev-area'; area.hidden = true;
  barra.after(area);
  const quadros = {};

  function marcar(id) {
    barra.querySelectorAll('[data-aba]').forEach((b) => { const on = b.dataset.aba === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  }

  function abrir(id, deClique) {
    const app = APPS_ABAS.find((a) => a.id === id && pode(a)) || APPS_ABAS.find((a) => a.id === PADRAO);
    marcar(app.id);
    document.body.classList.toggle('dev-outro', !app.interno);
    area.hidden = !!app.interno;
    Object.values(quadros).forEach((q) => (q.hidden = true));
    area.querySelector('.dev-aviso')?.remove();
    if (app.interno) {
      const naCadastros = location.hash.startsWith('#/admin');
      if (app.rota && !naCadastros) location.hash = app.rota;
      else if (!app.rota && naCadastros && deClique) location.hash = '#/viagens';
    } else if (app.pronto && app.endereco) {
      if (!quadros[app.id]) {
        const f = document.createElement('iframe');
        f.src = app.endereco; f.title = app.nome; f.allow = 'camera; clipboard-read; clipboard-write; fullscreen';
        area.appendChild(f); quadros[app.id] = f;
      }
      quadros[app.id].hidden = false;
    } else {
      area.insertAdjacentHTML('beforeend', `<div class="dev-aviso"><div class="dev-ic">${app.icone}</div><h2>${esc(app.nome)}</h2>
        <p>${esc(app.descricao || '')}</p><p><b>Em breve.</b> Esta aba será liberada quando o app for publicado.</p></div>`);
    }
    if (!id || app.id === id) lembrar(app.id); // não esquece a aba preferida só porque ainda não está liberada
  }
  barra.addEventListener('click', (e) => { const b = e.target.closest('[data-aba]'); if (b) abrir(b.dataset.aba, true); });

  // quando o app muda de tela (ex.: menu "Cadastros"), a aba certa fica marcada
  window.addEventListener('hashchange', () => {
    const atual = barra.querySelector('[data-aba].on')?.dataset.aba;
    const cad = APPS_ABAS[0];
    if (location.hash.startsWith('#/admin') && pode(cad)) { if (atual !== 'cadastros') { marcar('cadastros'); lembrar('cadastros'); } }
    else if (atual === 'cadastros') { marcar(PADRAO); lembrar(PADRAO); }
  });

  const inicial = location.hash.startsWith('#/admin') ? 'cadastros' : (lembrar() === 'cadastros' ? PADRAO : lembrar() || PADRAO);
  abrir(inicial);

  // chamado pelo app depois do login (e ao sair)
  window.DevAbas.definirCargo = (c) => {
    cargo = c || null;
    APPS_ABAS.forEach((a) => { const b = barra.querySelector(`[data-aba="${a.id}"]`); if (b) b.hidden = !pode(a); });
    const atual = barra.querySelector('[data-aba].on')?.dataset.aba;
    abrir(location.hash.startsWith('#/admin') ? 'cadastros' : (atual === 'cadastros' ? PADRAO : lembrar() || atual)); // aba não permitida → volta para Viagens
  };
})();
