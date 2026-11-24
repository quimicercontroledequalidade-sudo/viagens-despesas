// Gera o Farol de Indicadores no modelo Excel da Quimicer (modelo_farol.xlsx),
// mantendo formatação, logo, fórmulas e o farol colorido (formatação condicional) da planilha original.
(function (root) {
  const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const COL_MES = 'EFGHIJKLMNOP'.split(''); // JAN..DEZ
  const LINHAS = [8, 9, 10, 11, 12]; // linhas dos indicadores no modelo

  // ---------- cálculos (iguais às fórmulas da planilha) ----------
  const numero = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
  function media(valores) { // AVERAGEIF(E:P,"<>0") — ignora vazios e zeros
    const v = (valores || []).map(numero).filter((x) => x !== null && x !== 0);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  }
  function atingimento(ind) {
    const q = media(ind.valores), d = numero(ind.meta) || 0;
    if (ind.direcao === 'menor') return q === 0 ? 0 : Math.min((d / q) * 100, 150);
    return d ? (q / d) * 100 : 0;
  }
  function status(ind) {
    const q = media(ind.valores), d = numero(ind.meta) || 0;
    if (q === 0 || d === 0) return 'Sem dados';
    return statusDe(atingimento(ind));
  }
  const statusDe = (r) => (r >= 100 ? 'Dentro da Meta' : r >= 80 ? 'Atenção' : 'Crítico');
  function score(inds) { return inds.reduce((s, i) => s + (numero(i.peso) || 0) * atingimento(i), 0) / 100; }
  const statusScore = (sc) => (sc === 0 ? 'Sem dados' : statusDe(sc));

  // ---------- Excel ----------
  const xmlEsc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function trocarCelula(xml, ref, novo) {
    const re = new RegExp(`<c r="${ref}"(?:\\s[^>]*?)?(?:/>|>[\\s\\S]*?</c>)`);
    if (!re.test(xml)) throw new Error('Célula não encontrada no modelo: ' + ref);
    return xml.replace(re, (m) => novo(m.match(/ s="(\d+)"/)?.[1]));
  }
  const celTexto = (ref, txt) => (s) => `<c r="${ref}"${s ? ` s="${s}"` : ''} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(txt)}</t></is></c>`;
  const celNum = (ref, v, estilo) => (s) => { const st = estilo || s; const n = numero(v); return n === null ? `<c r="${ref}"${st ? ` s="${st}"` : ''}/>` : `<c r="${ref}"${st ? ` s="${st}"` : ''} t="n"><v>${n}</v></c>`; };
  const celForm = (ref, f, v, texto) => (s) => `<c r="${ref}"${s ? ` s="${s}"` : ''} t="${texto ? 'str' : 'n'}"><f aca="false">${xmlEsc(f)}</f><v>${texto ? xmlEsc(v) : v}</v></c>`;

  async function gerarExcel(JSZip, modelo, dados) {
    const { painel, indicadores, mes } = dados; // mes: 0..11 (coluna destacada)
    const zip = await JSZip.loadAsync(modelo);
    const caminho = 'xl/worksheets/sheet1.xml';
    let x = await zip.file(caminho).async('string');

    x = trocarCelula(x, 'A3', celTexto('A3', painel.okr || ''));
    x = trocarCelula(x, 'B4', celTexto('B4', painel.responsavel || ''));
    x = trocarCelula(x, 'F4', celNum('F4', painel.ano));
    x = trocarCelula(x, 'A5', celTexto('A5', painel.nota || ''));
    x = trocarCelula(x, 'A6', celTexto('A6', `➡ Farol de ${MESES[mes]}/${painel.ano}. Preencha apenas a coluna destacada (${MESES[mes]}) e o campo de Observações/Plano de Ação mais abaixo. Não altere as demais colunas.`));

    LINHAS.forEach((ln, i) => {
      const ind = indicadores[i];
      // estilos da própria linha no modelo: coluna comum (JAN) e coluna destacada (NOV)
      const estilo = (ref) => (x.match(new RegExp(`<c r="${ref}"[^>]*? s="(\\d+)"`)) || [])[1];
      const base = estilo('E' + ln), dest = estilo('O' + ln);
      if (!ind) { // linha sem indicador fica em branco
        ['A', 'B', 'C', 'D', ...COL_MES].forEach((c) => { x = trocarCelula(x, c + ln, (s) => `<c r="${c}${ln}"${s ? ` s="${s}"` : ''}/>`); });
        x = trocarCelula(x, 'Q' + ln, celForm('Q' + ln, `IFERROR(AVERAGEIF(E${ln}:P${ln},"<>0"),0)`, 0));
        x = trocarCelula(x, 'R' + ln, celForm('R' + ln, `IFERROR(Q${ln}/D${ln}*100,0)`, 0));
        x = trocarCelula(x, 'S' + ln, celForm('S' + ln, `IF(OR(Q${ln}=0,D${ln}=0),"Sem dados",IF(R${ln}>=100,"Dentro da Meta",IF(R${ln}>=80,"Atenção","Crítico")))`, 'Sem dados', true));
        return;
      }
      x = trocarCelula(x, 'A' + ln, celTexto('A' + ln, ind.nome));
      x = trocarCelula(x, 'B' + ln, celNum('B' + ln, ind.peso));
      x = trocarCelula(x, 'C' + ln, celTexto('C' + ln, ind.direcao === 'menor' ? 'Menor é melhor' : 'Maior é melhor'));
      x = trocarCelula(x, 'D' + ln, celNum('D' + ln, ind.meta, base));
      COL_MES.forEach((c, m) => { x = trocarCelula(x, c + ln, celNum(c + ln, (ind.valores || [])[m], m === mes ? dest : base)); });
      const q = media(ind.valores), r = atingimento(ind);
      x = trocarCelula(x, 'Q' + ln, celForm('Q' + ln, `IFERROR(AVERAGEIF(E${ln}:P${ln},"<>0"),0)`, q));
      x = trocarCelula(x, 'R' + ln, celForm('R' + ln, ind.direcao === 'menor' ? `IF(Q${ln}=0,0,IFERROR(MIN(D${ln}/Q${ln}*100,150),0))` : `IFERROR(Q${ln}/D${ln}*100,0)`, r));
      x = trocarCelula(x, 'S' + ln, celForm('S' + ln, `IF(OR(Q${ln}=0,D${ln}=0),"Sem dados",IF(R${ln}>=100,"Dentro da Meta",IF(R${ln}>=80,"Atenção","Crítico")))`, status(ind), true));
    });
    const soma = indicadores.slice(0, 5).reduce((s, i) => s + (numero(i.peso) || 0), 0);
    x = trocarCelula(x, 'B13', celForm('B13', 'SUM(B8:B12)', soma));
    const sc = score(indicadores.slice(0, 5));
    x = trocarCelula(x, 'R15', celForm('R15', 'IFERROR(SUMPRODUCT(B8:B12,R8:R12)/100,0)', sc));
    x = trocarCelula(x, 'S15', celForm('S15', 'IF(R15=0,"Sem dados",IF(R15>=100,"Dentro da Meta",IF(R15>=80,"Atenção","Crítico")))', statusScore(sc), true));
    x = trocarCelula(x, 'A17', celTexto('A17', `Observações / Plano de Ação da Área (ISO 9001, cláusula 10.2) — ${MESES[mes]}/${painel.ano}:`));
    x = trocarCelula(x, 'A18', celTexto('A18', ((painel.observacoes || {})[String(mes + 1)] || '').trim()));
    // aumenta a caixa de observações conforme o tamanho do texto
    const obs = ((painel.observacoes || {})[String(mes + 1)] || '').trim();
    const linhasObs = obs ? obs.split('\n').reduce((t, l) => t + Math.max(1, Math.ceil(l.length / 190)), 0) : 3;
    const alt = Math.max(15, Math.ceil((linhasObs * 13.5) / 3));
    [18, 19, 20].forEach((r) => { x = x.replace(new RegExp(`(<row r="${r}"[^>]*?) ht="[\\d.]+"`), `$1 ht="${alt}"`); });
    // observações com quebra de linha e alinhadas no topo: usa o estilo da célula e ativa quebra automática
    // impressão: paisagem, tudo em 1 página
    x = x.replace('<pageSetUpPr fitToPage="false"/>', '<pageSetUpPr fitToPage="true"/>')
      .replace(/orientation="portrait"/, 'orientation="landscape"')
      .replace(/<pageMargins [^>]*\/>/, '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>');
    zip.file(caminho, x);

    // a planilha recalcula tudo ao abrir
    let wb = await zip.file('xl/workbook.xml').async('string');
    wb = wb.replace(/<calcPr([^>]*?)\/>/, (m, a) => (/fullCalcOnLoad/.test(a) ? m : `<calcPr${a} fullCalcOnLoad="1"/>`));
    zip.file('xl/workbook.xml', wb);
    if (zip.file('xl/calcChain.xml')) zip.remove('xl/calcChain.xml');
    // observações: quebra de linha e texto no topo (estilo 25 do modelo, usado só em A18:S20)
    let st = await zip.file('xl/styles.xml').async('string');
    st = st.replace(/(<cellXfs[^>]*>)([\s\S]*?)(<\/cellXfs>)/, (m, a, corpo, z) => {
      let i = -1;
      return a + corpo.replace(/<xf [^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g, (xf) => (++i === 25 ? xf.replace(/vertical="bottom"/, 'vertical="top"').replace(/wrapText="false"/, 'wrapText="true"') : xf)) + z;
    });
    zip.file('xl/styles.xml', st);
    return zip.generateAsync({ type: dados.tipo || 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
  }

  const api = { MESES, media, atingimento, status, score, statusScore, gerarExcel };
  if (typeof module !== 'undefined') module.exports = api; else root.FarolExcel = api;
})(typeof window !== 'undefined' ? window : globalThis);
