// Leitura de notas fiscais / recibos (foto) para pré-preencher a despesa.
// O texto vem do OCR (Tesseract.js, feito no próprio celular/computador — a foto não sai do aparelho para isso).
(function (root) {
  const CATEGORIAS_CHAVE = [
    // [palavras (regex), grupo preferido -> nome da categoria]
    [/IMOLA/, { diversos: 'Posto Imola', empresa: 'Combustível', funcionario: 'Combustível' }],
    [/SEM\s*PARAR/, { diversos: 'Sem Parar (pedágio)', empresa: 'Pedágio', funcionario: 'Outros' }],
    [/BOLETO/, { diversos: 'Boletos' }],
    [/PED[AÁ]GIO|AUTOBAN|ECOVIAS|ARTERIS|AUTOPISTA|CONCESSION[AÁ]RIA|RODOVIA|PRA[CÇ]A DE|TARIFA|CCR\b|TRIUNFO|ECOSUL|VIAPAR/, { empresa: 'Pedágio', funcionario: 'Outros', diversos: 'Sem Parar (pedágio)' }],
    [/POSTO|COMBUST|GASOLINA|ETANOL|DIESEL|[ÁA]LCOOL|ABASTEC|PETROBRAS|IPIRANGA|SHELL|\bBR\b|LITRO|\bLTS?\b/, { empresa: 'Combustível', funcionario: 'Combustível', diversos: 'Posto Imola' }],
    [/HOTEL|POUSADA|HOSPEDAGEM|DI[AÁ]RIA|HOSPEDE|H[OÓ]SPEDE|INN\b|MOTEL|FLAT/, { empresa: 'Hospedagem', funcionario: 'Hospedagem' }],
    [/A[EÉ]REA|AIRLINES|LATAM|\bGOL\b|AZUL|PASSAGEM A|BILHETE A|VOO\b/, { empresa: 'Avião', funcionario: 'Avião', diversos: 'Avião compra antecipada' }],
    [/ESTACIONAMENTO|ESTAPAR|PARKING|PARK\b|ZONA AZUL/, { empresa: 'Diversos', funcionario: 'Outros' }],
    [/TELEFON|CELULAR|RECARGA|\bVIVO\b|\bCLARO\b|\bTIM\b/, { funcionario: 'Telefone', empresa: 'Diversos' }],
    [/UBER|99\s?(POP|T[AÁ]XI|APP)|T[AÁ]XI|TAXI/, { funcionario: 'Outros', empresa: 'Diversos' }],
    [/RESTAURANTE|LANCHONETE|PADARIA|PANIFICADORA|CAF[EÉ]|CHURRASCARIA|PIZZARIA|BAR\b|LANCHE|REFEI[CÇ]|ALIMENTA|BUFFET|GRILL|COZINHA|SORVETERIA|CONFEITARIA|SUBWAY|MC ?DONALD|BURGER|PRATO|REFRIGERANTE|EXECUTIVO/, { empresa: 'Alimentação', funcionario: 'Alimentação' }],
  ];

  const IGNORAR_DESCR = /CNPJ|CPF|CUPOM|EXTRATO|NFC|NF-?E|DANFE|DOCUMENTO|AUXILIAR|SAT\b|S[EÉ]RIE|EMISS|CONSUMIDOR|RUA |AV\.|AVENIDA|ROD |RODOVIA|^\W*$|TELEFONE|FONE|INSCRI|\bIE\b|\bIM\b|\d{2}[\/.-]\d{2}[\/.-]\d{2,4}/;

  function normal(t) {
    return String(t || '').normalize('NFC').replace(/\r/g, '').replace(/[|]/g, ' ').replace(/[ \t]+/g, ' ')
      // erros comuns do OCR dentro de números: O -> 0, l/I -> 1
      .replace(/(?<=\d)[Oo]|[Oo](?=[\d]*[,.]\d{2}\b)/g, '0')
      .replace(/(?<=\d)[lI](?=[\d,.])/g, '1');
  }
  function paraNumero(s) {
    s = s.replace(/\s/g, '');
    // 1.234,56 | 1234,56 | 1234.56 (OCR às vezes troca vírgula por ponto)
    const m = s.match(/^(\d{1,3}(?:[.]\d{3})+|\d+)[,.](\d{2})$/);
    if (!m) return NaN;
    return Number(m[1].replace(/\./g, '') + '.' + m[2]);
  }
  const VALOR_RE = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+[,.]\d{2}|\d+\s?[,.]\s?\d{2})(?!\d)/g;

  function valoresDaLinha(l) {
    const out = [];
    for (const m of l.matchAll(VALOR_RE)) {
      const v = paraNumero(m[1]);
      if (isFinite(v) && v > 0 && v < 100000) out.push(v);
    }
    return out;
  }

  function acharValor(linhas) {
    const prioridades = [
      /VALOR\s*(A\s*)?PAGAR|VALOR\s*PAGO|TOTAL\s*A\s*PAGAR/,
      /VALOR\s*TOTAL(?!\s*DO\s*ITEM)|TOTAL\s*GERAL|TOTAL\s*R\$|^\s*TOTAL\b/,
      /\bTOTAL\b(?!\s*DE\s*ITENS)(?!.*ITEM)/,
      /TARIFA|VALOR\b/,
    ];
    for (const re of prioridades) {
      for (let i = linhas.length - 1; i >= 0; i--) {
        const L = linhas[i].toUpperCase();
        if (/SUBTOTAL|SUB TOTAL|DESCONTO|TROCO|QTD|TRIBUTOS|IMPOSTOS|LEI 12|APROX/.test(L)) continue;
        if (re.test(L)) {
          let vs = valoresDaLinha(linhas[i]);
          if (!vs.length && linhas[i + 1] && !/TROCO|DESCONTO|CNPJ|CPF/i.test(linhas[i + 1])) vs = valoresDaLinha(linhas[i + 1]); // valor na linha de baixo
          if (vs.length) return vs[vs.length - 1];
        }
      }
    }
    // sem palavra-chave: maior valor da nota
    const todos = linhas.filter((l) => !/TROCO|CNPJ|CPF/i.test(l)).flatMap(valoresDaLinha);
    return todos.length ? Math.max(...todos) : null;
  }

  function acharData(texto, hojeISO) {
    const hoje = hojeISO ? new Date(hojeISO + 'T12:00:00') : new Date();
    const limiteAntigo = new Date(hoje); limiteAntigo.setFullYear(hoje.getFullYear() - 2);
    const datas = [];
    for (const m of texto.matchAll(/(\d{1,2})\s?[\/.-]\s?(\d{1,2})\s?[\/.-]\s?(\d{4}|\d{2})(?!\d)/g)) {
      let [, d, mo, y] = m; d = +d; mo = +mo; y = +y;
      if (y < 100) y += 2000;
      if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
      const dt = new Date(y, mo - 1, d, 12);
      if (dt.getMonth() !== mo - 1) continue;
      if (dt > new Date(hoje.getTime() + 86400000) || dt < limiteAntigo) continue;
      datas.push(dt);
    }
    if (!datas.length) return null;
    const dt = datas[0]; // a primeira data costuma ser a de emissão
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  }

  function acharEstabelecimento(linhas) {
    for (const l of linhas.slice(0, 8)) {
      const t = l.trim();
      const letras = (t.match(/[A-Za-zÀ-ÿ]/g) || []).length;
      if (letras < 4 || IGNORAR_DESCR.test(t.toUpperCase())) continue;
      if (letras / t.length < 0.55) continue; // muita sujeira do OCR
      return t.replace(/\s+(LTDA|ME|EPP|EIRELI|S\/?A)\.?$/i, '').replace(/[^\wÀ-ÿ&.,'\- ]/g, '').trim().slice(0, 60);
    }
    return '';
  }

  function sugerirCategoria(texto, grupo) {
    const T = texto.toUpperCase();
    for (const [re, mapa] of CATEGORIAS_CHAVE) {
      if (re.test(T)) return mapa[grupo] || null;
    }
    return null;
  }

  // Interpreta o texto lido da nota
  function interpretar(texto, grupo = 'empresa', hojeISO) {
    const t = normal(texto);
    const linhas = t.split('\n').map((l) => l.trim()).filter(Boolean);
    return {
      data: acharData(t, hojeISO),
      valor: acharValor(linhas),
      descricao: acharEstabelecimento(linhas),
      categoria: sugerirCategoria(t, grupo),
    };
  }

  // ----- OCR no navegador -----
  let _tess = null, _worker = null;
  function carregarTesseract() {
    if (root.Tesseract) return Promise.resolve(root.Tesseract);
    if (_tess) return _tess;
    _tess = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
      s.onload = () => res(root.Tesseract); s.onerror = () => { _tess = null; rej(new Error('Não foi possível carregar o leitor de notas (verifique a internet).')); };
      document.head.appendChild(s);
    });
    return _tess;
  }
  async function prepararImagem(file) {
    // reduz e passa para tons de cinza com mais contraste — melhora a leitura
    const bmp = await createImageBitmap(file);
    const max = 1800, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext('2d');
    g.filter = 'grayscale(1) contrast(1.35)';
    g.drawImage(bmp, 0, 0, c.width, c.height);
    return c;
  }
  async function lerImagem(file, aoProgresso) {
    const T = await carregarTesseract();
    if (!_worker) {
      _worker = await T.createWorker('por', 1, {
        logger: (m) => { if (aoProgresso && m.status === 'recognizing text') aoProgresso(m.progress); },
      });
    }
    const img = await prepararImagem(file);
    const { data } = await _worker.recognize(img);
    return data.text || '';
  }

  // ----- PDF: usa o texto do próprio arquivo (nota eletrônica) ou lê a imagem da 1ª página (digitalizada) -----
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  let _pdfjs = null;
  function carregarPdfJs() {
    if (root.pdfjsLib) return Promise.resolve(root.pdfjsLib);
    if (_pdfjs) return _pdfjs;
    _pdfjs = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = PDFJS + 'pdf.min.js';
      s.onload = () => res(root.pdfjsLib); s.onerror = () => { _pdfjs = null; rej(new Error('Não foi possível carregar o leitor de PDF.')); };
      document.head.appendChild(s);
    });
    return _pdfjs;
  }
  async function lerPdf(file, aoProgresso) {
    const pdfjs = await carregarPdfJs();
    if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pagina = await doc.getPage(1);
    // 1) texto embutido, montado linha a linha
    const tc = await pagina.getTextContent();
    const linhas = new Map();
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      if (!linhas.has(y)) linhas.set(y, []);
      linhas.get(y).push([it.transform[4], it.str]);
    }
    const texto = [...linhas.entries()].sort((a, b) => b[0] - a[0])
      .map(([, its]) => its.sort((a, b) => a[0] - b[0]).map((x) => x[1]).join(' ')).join('\n');
    if ((texto.match(/[A-Za-zÀ-ÿ0-9]/g) || []).length > 40) return texto;
    // 2) PDF só com imagem: desenha a página e lê como foto
    const vp = pagina.getViewport({ scale: 2.2 });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await pagina.render({ canvasContext: g, viewport: vp }).promise;
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    return lerImagem(new File([blob], 'pagina1.png', { type: 'image/png' }), aoProgresso);
  }
  async function lerArquivo(file, aoProgresso) {
    const pdf = /pdf/i.test(file.type || '') || /\.pdf$/i.test(file.name || '');
    return pdf ? lerPdf(file, aoProgresso) : lerImagem(file, aoProgresso);
  }

  const api = { interpretar, lerImagem, lerPdf, lerArquivo, sugerirCategoria };
  if (typeof module !== 'undefined') module.exports = api; else root.LeitorNota = api;
})(typeof window !== 'undefined' ? window : globalThis);
