// Preenche a planilha PADRÃO da Quimicer (modelo_relatorio.xlsx) sem alterar a formatação:
// o arquivo original é aberto como está e só os valores das células são escritos.
// Fórmulas, estilos, logo, mesclagens e configuração de impressão permanecem os do modelo.
(function (root) {
  const COLS = 'ABCDEFGHIJKLMNOPQRSTUVW'.split('');
  const FIRST = 6, BASE_LAST = 37, TOT = 38; // linhas de despesas 6..37 e totais na 38 (no modelo)
  const VAL_COLS = 'EFGHIJKLMNOPQRSTUV'.split('');

  const xmlEsc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const colIdx = (c) => COLS.indexOf(c);
  function nomeAba(t) {
    return (t || 'RELATORIO').replace(/[\[\]:*?\/\\']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'RELATORIO';
  }
  function dataBR(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return d + '/' + m + '/' + y;
  }
  function serialExcel(iso) {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
  }
  const num = (v) => String(Math.round(Number(v) * 100) / 100);

  // ---------- edição de células no XML ----------
  function rowRe(r) { return new RegExp('<row r="' + r + '"[^>]*?(?:/>|>[\\s\\S]*?</row>)'); }
  function cellRe(ref) { return new RegExp('<c r="' + ref + '"((?:\\s[^>]*?)?)(?:/>|>[\\s\\S]*?</c>)'); }
  function attrsSemTipo(attrs) { return attrs.replace(/\s+t="[^"]*"/, ''); }

  function setCell(xml, ref, conteudo, tipo) {
    // conteudo: XML interno da célula (<v>, <is>, <f>...), tipo: valor do atributo t ou null
    const re = cellRe(ref);
    const m = xml.match(re);
    const novo = (attrs) => '<c r="' + ref + '"' + attrsSemTipo(attrs) + (tipo ? ' t="' + tipo + '"' : '') +
      (conteudo ? '>' + conteudo + '</c>' : '/>');
    if (m) return xml.replace(re, novo(m[1]));
    // célula não existe na linha: insere na posição certa
    const col = ref.match(/^[A-Z]+/)[0], r = ref.slice(col.length);
    const rr = rowRe(r), rm = xml.match(rr);
    if (!rm) throw new Error('Linha ' + r + ' não existe no modelo.');
    let linha = rm[0];
    if (linha.endsWith('/>')) linha = linha.slice(0, -2) + '></row>';
    const cells = [...linha.matchAll(/<c r="([A-Z]+)\d+"/g)];
    const depois = cells.find((c) => colIdx(c[1]) > colIdx(col));
    const cel = novo('');
    linha = depois ? linha.slice(0, depois.index) + cel + linha.slice(depois.index) : linha.replace('</row>', cel + '</row>');
    return xml.replace(rr, linha);
  }
  const setStr = (xml, ref, txt) => setCell(xml, ref, '<is><t xml:space="preserve">' + xmlEsc(txt) + '</t></is>', 'inlineStr');
  const setNum = (xml, ref, v) => setCell(xml, ref, '<v>' + v + '</v>', null);
  const limpar = (xml, ref) => (xml.match(cellRe(ref)) ? setCell(xml, ref, '', null) : xml);
  function setFormula(xml, ref, formula, valor) {
    return setCell(xml, ref, '<f>' + formula + '</f><v>' + valor + '</v>', null);
  }

  // Desloca referências de linhas >= de (em fórmulas) — usado quando há mais de 32 despesas
  function deslocarRefs(f, de, n) {
    return f.replace(/(\$?)([A-Z]{1,2})(\$?)(\d+)/g, (m, a, c, b, r) => (Number(r) >= de ? a + c + b + (Number(r) + n) : m));
  }

  // Insere 'extra' linhas de despesa depois da linha 37, copiando a linha 37 do modelo
  function inserirLinhas(xml, extra) {
    if (!extra) return xml;
    // 1) desloca as linhas a partir da 38 (de baixo para cima)
    const linhas = [...xml.matchAll(/<row r="(\d+)"/g)].map((m) => Number(m[1])).filter((r) => r >= TOT).sort((a, b) => b - a);
    for (const r of linhas) {
      const re = rowRe(r);
      xml = xml.replace(re, (bloco) => bloco
        .replace('<row r="' + r + '"', '<row r="' + (r + extra) + '"')
        .replace(/<c r="([A-Z]+)(\d+)"/g, (m, c, rr) => '<c r="' + c + (Number(rr) + extra) + '"')
        .replace(/<f([^>]*)>([^<]*)<\/f>/g, (m, at, f) => '<f' + at.replace(/ref="([^"]+)"/, (x, rf) => 'ref="' + deslocarRefs(rf, TOT, extra) + '"') + '>' + deslocarRefs(f, TOT, extra) + '</f>'));
    }
    // 2) cria as novas linhas copiando a 37
    const modelo = xml.match(rowRe(BASE_LAST))[0];
    let novas = '';
    for (let i = 1; i <= extra; i++) {
      const r = BASE_LAST + i;
      novas += modelo.replace('<row r="' + BASE_LAST + '"', '<row r="' + r + '"')
        .replace(/<c r="([A-Z]+)37"/g, (m, c) => '<c r="' + c + r + '"');
    }
    xml = xml.replace(modelo, modelo + novas);
    // 3) mesclagens: desloca as de baixo e adiciona B:D nas novas linhas
    xml = xml.replace(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/g, (m, c1, r1, c2, r2) =>
      '<mergeCell ref="' + c1 + (Number(r1) >= TOT ? Number(r1) + extra : r1) + ':' + c2 + (Number(r2) >= TOT ? Number(r2) + extra : r2) + '"/>');
    let mm = '';
    for (let i = 1; i <= extra; i++) mm += '<mergeCell ref="B' + (BASE_LAST + i) + ':D' + (BASE_LAST + i) + '"/>';
    xml = xml.replace(/<mergeCells count="(\d+)">/, (m, n) => '<mergeCells count="' + (Number(n) + extra) + '">' + mm);
    // 4) dimensão da planilha
    xml = xml.replace(/<dimension ref="A1:([A-Z]+)(\d+)"\/>/, (m, c, r) => '<dimension ref="A1:' + c + (Number(r) + extra) + '"/>');
    return xml;
  }

  // dados: { titulo, participantes:[nomes], data_inicio, data_fim, destino, centro_custo,
  //          veiculo, km_inicial, km_final, forma_pagamento, objetivos,
  //          despesas:[{data, descricao, coluna, valor}] }
  async function gerarExcel(JSZip, modeloBuffer, dados) {
    const zip = await JSZip.loadAsync(modeloBuffer);
    let xml = await zip.file('xl/worksheets/sheet1.xml').async('string');

    const desp = (dados.despesas || []).slice().sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    const extra = Math.max(0, desp.length - (BASE_LAST - FIRST + 1));
    const LAST = BASE_LAST + extra, T = TOT + extra; // última linha de despesa e linha de totais

    // 1) limpa os exemplos do modelo (linhas 6..37)
    for (let r = FIRST; r <= BASE_LAST; r++) for (const c of ['A', 'B', ...VAL_COLS]) xml = limpar(xml, c + r);

    // 2) cabeçalho (preserva o texto do modelo e acrescenta os dados)
    const nomes = (dados.participantes || []).join(' e ');
    xml = setStr(xml, 'A3', 'NOME FUNCIONÁRIO: ' + nomes);
    xml = setStr(xml, 'E3', dataBR(dados.data_inicio) + (dados.data_fim ? ' - ' + dataBR(dados.data_fim) : ''));
    xml = setStr(xml, 'H3', 'DESTINO: ' + (dados.destino || ''));
    xml = setStr(xml, 'L3', 'CENTRO DE CUSTO: ' + (dados.centro_custo || ''));
    // mesma célula do modelo, com quebras de linha reais (o modelo usava espaços)
    xml = setStr(xml, 'O3', 'VEÍCULO EMPRESA: ' + (dados.veiculo || '') +
      '\nKM INICIAL: ' + (dados.km_inicial ?? '') + '\nKM FINAL: ' + (dados.km_final ?? ''));
    xml = setStr(xml, 'S3', 'FORMA PAGAMENTO: ' + (dados.forma_pagamento || ''));

    // 3) linhas extras, se houver mais de 32 despesas
    xml = inserirLinhas(xml, extra);

    // 4) despesas
    const tot = Object.fromEntries(VAL_COLS.map((c) => [c, 0]));
    desp.forEach((d, i) => {
      const r = FIRST + i;
      xml = setNum(xml, 'A' + r, serialExcel(d.data));
      xml = setStr(xml, 'B' + r, d.descricao || '');
      xml = setNum(xml, d.coluna + r, num(d.valor));
      tot[d.coluna] += Number(d.valor);
    });

    // 5) fórmulas de totais (mesmas do modelo, ajustadas ao número de linhas) + valores calculados
    const cadeia = (c, pular = []) => {
      const p = []; for (let r = FIRST; r <= LAST; r++) if (!pular.includes(r)) p.push(c + r);
      return p.join('+');
    };
    for (const c of VAL_COLS) {
      const formula = c === 'M' || c === 'V' ? cadeia(c) : 'SUM(' + c + FIRST + ':' + c + LAST + ')';
      xml = setFormula(xml, c + T, formula, num(tot[c]));
    }
    const adi = 0;
    const restituir = 'EFGHIJK'.split('').reduce((s, c) => s + tot[c], 0);
    const empresa = 'LMNOPQR'.split('').reduce((s, c) => s + tot[c], 0) - adi;
    const total = restituir + empresa + tot.S + tot.T + tot.U + tot.V + adi;
    const U = (n) => 'U' + (T + n);
    xml = setNum(xml, U(1), adi);
    xml = setFormula(xml, U(2), 'E' + T + '+F' + T + '+G' + T + '+H' + T + '+I' + T + '+J' + T + '+K' + T, num(restituir));
    xml = setFormula(xml, U(3), 'L' + T + '+M' + T + '+N' + T + '+O' + T + '+P' + T + '+Q' + T + '+R' + T + '-' + U(1), num(empresa));
    xml = setFormula(xml, U(4), 'S' + T, num(tot.S));
    xml = setFormula(xml, U(5), 'T' + T, num(tot.T));
    xml = setFormula(xml, U(6), 'U' + T, num(tot.U));
    xml = setFormula(xml, U(7), 'V' + T, num(tot.V));
    xml = setFormula(xml, U(8), U(2) + '+' + U(3) + '+' + U(4) + '+' + U(6) + '+' + U(7) + '+' + U(1) + '+' + U(5), num(total));

    // 6) regiões / clientes / objetivos
    xml = setStr(xml, 'A' + (T + 2), dados.objetivos || '');

    // seleção/aba ativa para o topo
    xml = xml.replace(/<selection [^>]*\/>/, '<selection activeCell="A1" sqref="A1"/>');
    zip.file('xl/worksheets/sheet1.xml', xml);

    // 7) nome da aba e recálculo ao abrir
    let wb = await zip.file('xl/workbook.xml').async('string');
    wb = wb.replace(/<sheet name="[^"]*"/, '<sheet name="' + xmlEsc(nomeAba(dados.titulo)) + '"');
    wb = wb.replace(/<calcPr([^>]*?)\/>/, (m, a) => '<calcPr' + a.replace(/\s*fullCalcOnLoad="[^"]*"/, '') + ' fullCalcOnLoad="1"/>');
    zip.file('xl/workbook.xml', wb);
    // a cadeia de cálculo antiga não vale mais (o Excel recria sozinho)
    if (zip.file('xl/calcChain.xml')) {
      zip.remove('xl/calcChain.xml');
      const ct = await zip.file('[Content_Types].xml').async('string');
      zip.file('[Content_Types].xml', ct.replace(/<Override PartName="\/xl\/calcChain.xml"[^>]*\/>/, ''));
      const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
      zip.file('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship [^>]*Target="calcChain.xml"\/>/, ''));
    }
    return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }

  const api = { gerarExcel, dataBR, nomeAba, FIRST };
  if (typeof module !== 'undefined') module.exports = api; else root.Relatorio = api;
})(this);
