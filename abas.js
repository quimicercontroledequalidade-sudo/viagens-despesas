// Barra "Desenvolvimento": abas com os apps Quimicer dentro do app Viagens & Despesas.
// Para incluir um app novo, acrescente um item em APPS_ABAS.
(function () {
  const APPS_ABAS = [
    { id: 'viagens', nome: 'Viagens & Despesas', icone: '✈️', interno: true },
    { id: 'amostras', nome: 'Controle de Amostras', icone: '🧪', endereco: '', pronto: false, soDev: true,
      descricao: 'Controle das amostras AQM, com descrição dos produtos e local de armazenamento (estante/prateleira).' },
  ];
  window.DevAbas = { definirCargo() {} };
  if (window.top !== window.self) return; // já está dentro de outro painel: não repete as abas
  let cargo = null; // as abas "soDev" só aparecem para o Desenvolvedor
  const pode = (a) => !a.soDev || cargo === 'desenvolvedor';

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lembrar = (v) => { try { if (v === undefined) return localStorage.getItem('dev.aba'); localStorage.setItem('dev.aba', v); } catch { /* sem armazenamento */ } return v; };

  const barra = document.createElement('div');
  barra.className = 'dev-barra';
  barra.innerHTML = `<span class="dev-titulo">Desenvolvimento</span><nav class="dev-abas" role="tablist">${APPS_ABAS.map((a) =>
    `<button role="tab" data-aba="${a.id}"${a.soDev ? ' hidden' : ''}>${a.icone} ${esc(a.nome)}${a.interno || a.pronto ? '' : ' <span class="dev-breve">em breve</span>'}</button>`).join('')}</nav>`;
  document.body.prepend(barra);

  const area = document.createElement('div');
  area.className = 'dev-area'; area.hidden = true;
  barra.after(area);
  const quadros = {};

  function abrir(id) {
    const app = APPS_ABAS.find((a) => a.id === id && pode(a)) || APPS_ABAS[0];
    barra.querySelectorAll('[data-aba]').forEach((b) => { const on = b.dataset.aba === app.id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    document.body.classList.toggle('dev-outro', !app.interno);
    area.hidden = !!app.interno;
    Object.values(quadros).forEach((q) => (q.hidden = true));
    area.querySelector('.dev-aviso')?.remove();
    if (!app.interno) {
      if (app.pronto && app.endereco) {
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
    }
    if (!id || app.id === id) lembrar(app.id); // não esquece a aba preferida só porque ainda não está liberada
  }
  barra.addEventListener('click', (e) => { const b = e.target.closest('[data-aba]'); if (b) abrir(b.dataset.aba); });
  abrir(lembrar() || 'viagens');

  // chamado pelo app depois do login (e ao sair)
  window.DevAbas.definirCargo = (c) => {
    cargo = c || null;
    APPS_ABAS.forEach((a) => { const b = barra.querySelector(`[data-aba="${a.id}"]`); if (b) b.hidden = !pode(a); });
    const atual = barra.querySelector('[data-aba].on')?.dataset.aba;
    const desejada = lembrar() || atual;
    abrir(desejada); // se a aba lembrada não é permitida, volta para Viagens
  };
})();
