// Leitor de QR Code de nota fiscal (NFC-e, NF-e e CF-e SAT).
// Lê o QR pela câmera ou pela foto/PDF anexado e devolve a chave de acesso, o CNPJ do emitente,
// a data e o valor (quando o QR traz) e o link de consulta na SEFAZ.
(function (root) {
  const UF = { 11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO', 21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA',
    31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP', 41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF' };
  const MODELO = { 55: 'NF-e', 57: 'CT-e', 59: 'CF-e SAT', 65: 'NFC-e' };

  const num = (s) => { const v = parseFloat(String(s).replace(',', '.')); return isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null; };
  const dois = (n) => String(n).padStart(2, '0');

  // confere o dígito verificador da chave de 44 números (módulo 11)
  function chaveValida(ch) {
    if (!/^\d{44}$/.test(ch)) return false;
    let soma = 0, peso = 2;
    for (let i = 42; i >= 0; i--) { soma += +ch[i] * peso; peso = peso === 9 ? 2 : peso + 1; }
    const r = soma % 11; const dv = r < 2 ? 0 : 11 - r;
    return dv === +ch[43];
  }

  // Interpreta o texto do QR Code
  function interpretar(texto) {
    const t = String(texto || '').trim();
    const url = /^https?:\/\//i.test(t) ? t : null;
    let p = t;
    if (url) {
      try { const u = new URL(t); p = u.searchParams.get('p') || u.searchParams.get('chNFe') || decodeURIComponent(u.search.slice(1)); } catch { /* usa o texto todo */ }
    }
    const partes = p.split('|').map((x) => x.trim());
    let chave = (partes[0].match(/\d{44}/) || t.replace(/\D+(?=\d)/g, '').match(/\d{44}/) || [null])[0];
    if (!chave) return null;
    const r = {
      texto: t, url, chave, valida: chaveValida(chave),
      uf: UF[+chave.slice(0, 2)] || '', modelo: MODELO[+chave.slice(20, 22)] || 'Nota fiscal',
      cnpj: chave.slice(6, 20), serie: +chave.slice(22, 25), numero: +chave.slice(25, 34),
      ano: 2000 + +chave.slice(2, 4), mes: +chave.slice(4, 6), data: null, valor: null,
    };
    // CF-e SAT (SP): chave|AAAAMMDDhhmmss|valor|CPF|assinatura
    if (partes[1] && /^\d{14}$/.test(partes[1])) {
      const d = partes[1];
      r.data = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
      r.valor = num(partes[2]);
    } else if (partes[1] === '2' && partes.length >= 7) { // NFC-e v2 emitida em contingência: chave|2|amb|dia|valor|...
      if (/^\d{1,2}$/.test(partes[3])) r.data = `${r.ano}-${dois(r.mes)}-${dois(partes[3])}`;
      r.valor = num(partes[4]);
    } else if (partes[1] === '3' && partes.length >= 5) { // NFC-e v3 em contingência: chave|3|amb|dia|valor|...
      if (/^\d{1,2}$/.test(partes[3])) r.data = `${r.ano}-${dois(r.mes)}-${dois(partes[3])}`;
      r.valor = num(partes[4]);
    }
    if (r.data && isNaN(new Date(r.data + 'T12:00:00'))) r.data = null;
    return r;
  }

  // ---------- leitura da imagem ----------
  let _jsqr = null;
  function carregarJsQR() {
    if (root.jsQR) return Promise.resolve(root.jsQR);
    if (!_jsqr) _jsqr = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
      s.onload = () => res(root.jsQR); s.onerror = () => { _jsqr = null; rej(new Error('Não foi possível carregar o leitor de QR Code.')); };
      document.head.appendChild(s);
    });
    return _jsqr;
  }
  let _detector;
  async function detectorNativo() {
    if (_detector !== undefined) return _detector;
    _detector = null;
    try {
      if ('BarcodeDetector' in root && (await root.BarcodeDetector.getSupportedFormats()).includes('qr_code')) _detector = new root.BarcodeDetector({ formats: ['qr_code'] });
    } catch { /* sem detector nativo */ }
    return _detector;
  }

  // procura um QR num canvas; tenta o tamanho todo e versões menores (QR pequeno em foto grande)
  async function lerCanvas(canvas) {
    const nat = await detectorNativo();
    if (nat) {
      try { const r = await nat.detect(canvas); if (r[0]?.rawValue) return r[0].rawValue; } catch { /* tenta o jsQR */ }
    }
    const jsQR = await carregarJsQR();
    const tentar = (larg) => {
      const esc = Math.min(1, larg / canvas.width);
      const c = document.createElement('canvas');
      c.width = Math.round(canvas.width * esc); c.height = Math.round(canvas.height * esc);
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(canvas, 0, 0, c.width, c.height);
      const r = jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
      return r && r.data;
    };
    for (const l of [1600, 1100, 800, 2400]) { const r = tentar(l); if (r) return r; if (canvas.width <= l) break; }
    // QR costuma ficar no fim do cupom: tenta a metade de baixo ampliada
    const c = document.createElement('canvas'); const h = Math.round(canvas.height / 2);
    c.width = canvas.width; c.height = h; c.getContext('2d').drawImage(canvas, 0, h, canvas.width, h, 0, 0, canvas.width, h);
    const r = jsQR(c.getContext('2d').getImageData(0, 0, c.width, c.height).data, c.width, c.height);
    return r && r.data;
  }

  async function arquivoParaCanvas(file) {
    const pdf = /pdf/i.test(file.type || '') || /\.pdf$/i.test(file.name || '');
    if (pdf) {
      const pdfjs = root.pdfjsLib || (await root.LeitorNota?.carregarPdfJs?.());
      if (!pdfjs) return null;
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const pg = await doc.getPage(1); const vp = pg.getViewport({ scale: 2.5 });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: g, viewport: vp }).promise;
      return c;
    }
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0); return c;
    } finally { URL.revokeObjectURL(url); }
  }

  // procura o QR Code numa foto ou PDF já anexado (devolve null se não achar)
  async function lerArquivo(file) {
    try { const c = await arquivoParaCanvas(file); if (!c) return null; const t = await lerCanvas(c); return t ? interpretar(t) : null; }
    catch (e) { console.warn('QR', e); return null; }
  }

  // ---------- câmera ----------
  // abre a câmera numa camada por cima; devolve { qr, foto } ou null se a pessoa cancelar
  function lerCamera() {
    return new Promise(async (resolve) => {
      const camada = document.createElement('div');
      camada.className = 'qr-camada';
      camada.innerHTML = `<div class="qr-caixa"><div class="qr-video"><video playsinline muted autoplay></video><div class="qr-mira"></div></div>
        <p class="qr-msg">Aponte para o <b>QR Code</b> da nota</p><button type="button" class="btn sec qr-fechar">Cancelar</button></div>`;
      document.body.appendChild(camada);
      const video = camada.querySelector('video'); const msg = camada.querySelector('.qr-msg');
      let stream = null, parar = false;
      const fim = (r) => { parar = true; stream?.getTracks().forEach((t) => t.stop()); camada.remove(); resolve(r); };
      camada.querySelector('.qr-fechar').onclick = () => fim(null);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      } catch (e) {
        msg.innerHTML = 'Não foi possível abrir a câmera. Libere o acesso à câmera para este site e tente de novo.';
        return;
      }
      video.srcObject = stream; await video.play().catch(() => {});
      const c = document.createElement('canvas');
      const passo = async () => {
        if (parar) return;
        if (video.videoWidth) {
          c.width = video.videoWidth; c.height = video.videoHeight;
          c.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0);
          try {
            const t = await lerCanvas(c);
            const qr = t && interpretar(t);
            if (qr) {
              if (navigator.vibrate) navigator.vibrate(80);
              const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
              return fim({ qr, foto: new File([blob], `qrcode-nota-${qr.numero || 'nf'}.jpg`, { type: 'image/jpeg' }) });
            }
            if (t) msg.textContent = 'Este QR Code não é de nota fiscal.';
          } catch (e) { msg.textContent = e.message; }
        }
        setTimeout(passo, 250);
      };
      passo();
    });
  }

  // ---------- nome da empresa pelo CNPJ ----------
  async function buscarEmpresa(cnpj) {
    const chave = 'cnpj.' + cnpj;
    try { const c = localStorage.getItem(chave); if (c) return JSON.parse(c); } catch { /* sem armazenamento */ }
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: ctl.signal });
      if (!r.ok) return null;
      const j = await r.json();
      const emp = { nome: (j.nome_fantasia || '').trim() || (j.razao_social || '').trim(), razao: j.razao_social || '', atividade: j.cnae_fiscal_descricao || '', cidade: j.municipio ? `${j.municipio}/${j.uf}` : '' };
      try { localStorage.setItem(chave, JSON.stringify(emp)); } catch { /* sem armazenamento */ }
      return emp;
    } catch { return null; } finally { clearTimeout(tm); }
  }

  const cnpjFormatado = (c) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  const nomeBonito = (s) => String(s || '').toLowerCase().replace(/(^|[\s/.-])\S/g, (x) => x.toUpperCase())
    .replace(/\b(Ltda|Me|Epp|Eireli|S\/?A)\b\.?/gi, (x) => x.toUpperCase())
    .replace(/(?<=\s)(De|Do|Da|Dos|Das|E)(?=\s)/g, (x) => x.toLowerCase()).trim();

  const api = { interpretar, chaveValida, lerArquivo, lerCamera, buscarEmpresa, cnpjFormatado, nomeBonito };
  if (typeof module !== 'undefined') module.exports = api; else root.QRNota = api;
})(typeof window !== 'undefined' ? window : globalThis);
