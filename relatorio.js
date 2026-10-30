// Preenche o modelo de relatório Quimicer (modelo_relatorio.xlsx)
(function (root) {
  const FIRST = 6, MAXROWS = 150, LAST = FIRST + MAXROWS - 1, VISIBLE = 32;
  const OBJ_ROW = LAST + 3; // A158

  function nomeAba(t) {
    return (t || 'RELATORIO').replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31).trim() || 'RELATORIO';
  }
  function dataBR(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return d + '/' + m + '/' + y;
  }

  // dados: { titulo, participantes:[nomes], data_inicio, data_fim, destino, centro_custo,
  //          veiculo, km_inicial, km_final, forma_pagamento, objetivos,
  //          despesas:[{data, descricao, coluna, valor}] }
  async function gerarExcel(ExcelJS, modeloBuffer, dados, logoBuffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(modeloBuffer);
    const ws = wb.worksheets[0];
    ws.name = nomeAba(dados.titulo);
    if (logoBuffer) {
      const img = wb.addImage({ buffer: logoBuffer, extension: 'png' });
      ws.addImage(img, { tl: { col: 0.32, row: 0.25 }, ext: { width: 206, height: 42 }, editAs: 'oneCell' });
    }

    ws.getCell('A3').value = 'NOME FUNCIONÁRIO: ' + (dados.participantes || []).join(' e ');
    ws.getCell('E3').value = dataBR(dados.data_inicio) + (dados.data_fim ? ' - ' + dataBR(dados.data_fim) : '');
    ws.getCell('H3').value = 'DESTINO: ' + (dados.destino || '');
    ws.getCell('L3').value = 'CENTRO DE CUSTO: ' + (dados.centro_custo || '');
    ws.getCell('O3').value = 'VEÍCULO EMPRESA: ' + (dados.veiculo || '') +
      '\nKM INICIAL: ' + (dados.km_inicial ?? '') + '        KM FINAL: ' + (dados.km_final ?? '');
    ws.getCell('S3').value = 'FORMA PAGAMENTO: ' + (dados.forma_pagamento || '');
    ws.getCell('A' + OBJ_ROW).value = dados.objetivos || '';

    const desp = (dados.despesas || []).slice().sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    if (desp.length > MAXROWS) throw new Error('O relatório comporta até ' + MAXROWS + ' despesas.');
    desp.forEach((d, i) => {
      const r = FIRST + i;
      const [y, m, dd] = d.data.slice(0, 10).split('-').map(Number);
      ws.getCell('A' + r).value = new Date(Date.UTC(y, m - 1, dd));
      ws.getCell('B' + r).value = d.descricao || '';
      ws.getCell(d.coluna + r).value = Number(d.valor);
    });
    const visiveis = Math.max(VISIBLE, desp.length);
    for (let r = FIRST; r <= LAST; r++) ws.getRow(r).hidden = (r - FIRST) >= visiveis;

    wb.calcProperties = Object.assign({}, wb.calcProperties, { fullCalcOnLoad: true });
    return await wb.xlsx.writeBuffer();
  }

  const api = { gerarExcel, dataBR, nomeAba, FIRST, MAXROWS };
  if (typeof module !== 'undefined') module.exports = api; else root.Relatorio = api;
})(this);
