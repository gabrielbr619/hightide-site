var test = require('node:test');
var assert = require('node:assert/strict');
var CONC = require('./nucleo.js');
var COMUM = require('../comum/comum.js');

var BOM = String.fromCharCode(0xFEFF);
var HOJE = '2026-09-04';

/* ---------------- OFX ---------------- */

var OFX_SGML = [
  'OFXHEADER:100',
  'DATA:OFXSGML',
  'VERSION:102',
  '',
  '<OFX>',
  '<BANKMSGSRSV1><STMTTRNRS><STMTRS>',
  '<CURDEF>BRL',
  '<BANKTRANLIST>',
  '<DTSTART>20260801000000[-3:BRT]',
  '<STMTTRN>',
  '<TRNTYPE>DEBIT',
  '<DTPOSTED>20260815120000[-3:BRT]',
  '<TRNAMT>-1234,56',
  '<FITID>0001',
  '<CHECKNUM>551',
  '<MEMO>PAGTO FORNECEDOR ALFA',
  '</STMTTRN>',
  '</BANKTRANLIST>',
  '<LEDGERBAL><BALAMT>10000,00<DTASOF>20260901000000[-3:BRT]</LEDGERBAL>',
  '</STMTRS></STMTTRNRS></BANKMSGSRSV1>',
  '</OFX>'
].join('\r\n');

test('lerOFX lê SGML com TRNAMT em vírgula e DTPOSTED com fuso', function () {
  var lista = CONC.lerOFX(OFX_SGML);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].data, '2026-08-15');
  assert.equal(lista[0].valor, -1234.56);
  assert.equal(lista[0].descricao, 'PAGTO FORNECEDOR ALFA');
  assert.equal(lista[0].documento, '551');
  assert.equal(lista[0].id, '0001');
});

test('lerOFX ignora o saldo em BALAMT', function () {
  assert.equal(CONC.lerOFX(OFX_SGML).length, 1);
});

test('lerOFX lê SGML sem fechamento de STMTTRN', function () {
  var texto = [
    '<BANKTRANLIST>',
    '<STMTTRN>',
    '<DTPOSTED>20260801',
    '<TRNAMT>-100,00',
    '<FITID>A1',
    '<MEMO>TARIFA',
    '<STMTTRN>',
    '<DTPOSTED>20260802',
    '<TRNAMT>250,00',
    '<FITID>A2',
    '<MEMO>DEPOSITO',
    '</BANKTRANLIST>',
    '<LEDGERBAL><BALAMT>777,00'
  ].join('\n');
  var lista = CONC.lerOFX(texto);
  assert.equal(lista.length, 2);
  assert.equal(lista[0].valor, -100);
  assert.equal(lista[1].valor, 250);
  assert.equal(lista[1].descricao, 'DEPOSITO');
});

test('lerOFX decodifica as entidades XML do texto da tag', function () {
  var texto = '<STMTTRN><DTPOSTED>20260815<TRNAMT>-100,00<FITID>A&amp;1' +
    '<MEMO>PAGTO A &amp; B &lt;LTDA&gt; &#39;JR&#39;</MEMO></STMTTRN>';
  var lista = CONC.lerOFX(texto);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].descricao, "PAGTO A & B <LTDA> 'JR'");
  assert.equal(lista[0].id, 'A&1');
});

test('lerOFX lê OFX em XML com tags fechadas e cai no NAME', function () {
  var texto = '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>' +
    '<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260812100000</DTPOSTED>' +
    '<TRNAMT>3120.75</TRNAMT><FITID>ABC-1</FITID><NAME>PIX RECEBIDO DELTA</NAME>' +
    '</STMTTRN></BANKTRANLIST><LEDGERBAL><BALAMT>9999.99</BALAMT></LEDGERBAL>' +
    '</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>';
  var lista = CONC.lerOFX(texto);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].data, '2026-08-12');
  assert.equal(lista[0].valor, 3120.75);
  assert.equal(lista[0].descricao, 'PIX RECEBIDO DELTA');
  assert.equal(lista[0].id, 'ABC-1');
});

/* ---------------- planilha ---------------- */

test('lerTabela com débito e crédito separados devolve o sinal', function () {
  var cabecalho = ['Data', 'Histórico', 'Débito', 'Crédito'];
  var linhas = [
    ['01/09/2026', 'Pagamento fornecedor', '1.180,45', ''],
    ['02/09/2026', 'Recebimento cliente', '', '5.200,00']
  ];
  var mapa = CONC.detectarColunas(cabecalho, linhas);
  assert.equal(mapa.debito, 2);
  assert.equal(mapa.credito, 3);
  var lista = CONC.lerTabela(cabecalho, linhas);
  assert.equal(lista[0].valor, -1180.45);
  assert.equal(lista[1].valor, 5200);
  assert.equal(lista[0].data, '2026-09-01');
  assert.equal(lista[0].descricao, 'Pagamento fornecedor');
});

test('lerTabela devolve crédito menos débito com o sinal que veio na célula', function () {
  var cabecalho = ['Data', 'Histórico', 'Débito', 'Crédito'];
  var linhas = [
    ['01/09/2026', 'Pagamento fornecedor', '1.180,45', ''],
    ['02/09/2026', 'Recebimento cliente', '', '5.200,00'],
    ['03/09/2026', 'Estorno de recebimento', '', '-320,00']
  ];
  var lista = CONC.lerTabela(cabecalho, linhas);
  assert.equal(lista[0].valor, -1180.45);
  assert.equal(lista[1].valor, 5200);
  assert.equal(lista[2].valor, -320);
});

test('lerTabela conta em ignoradas as linhas cujo valor não parseia', function () {
  var cabecalho = ['Data', 'Histórico', 'Valor'];
  var linhas = [
    ['01/09/2026', 'Pagamento', '100,00'],
    ['02/09/2026', 'Saldo anterior', ''],
    ['03/09/2026', 'Recebimento', '250,00'],
    ['04/09/2026', 'Total do mês', ''],
    ['05/09/2026', 'Tarifa', '-49,90']
  ];
  var lista = CONC.lerTabela(cabecalho, linhas);
  assert.equal(lista.length, 3);
  assert.equal(lista.ignoradas, 2);
});

test('detectarColunas acha data, histórico e valor pelo conteúdo com cabeçalho sem nome útil', function () {
  var cabecalho = ['A', 'B', 'C'];
  var linhas = [
    ['01/09/2026', 'Pagamento fornecedor alfa', '-1.180,45'],
    ['02/09/2026', 'Recebimento cliente beta', '5.200,00'],
    ['03/09/2026', 'Tarifa do pacote', '-49,90']
  ];
  var mapa = CONC.detectarColunas(cabecalho, linhas);
  assert.equal(mapa.data, 0);
  assert.equal(mapa.descricao, 1);
  assert.equal(mapa.valor, 2);
  assert.equal(mapa.debito, -1);
  assert.equal(mapa.credito, -1);
  var lista = CONC.lerTabela(cabecalho, linhas);
  assert.equal(lista.length, 3);
  assert.equal(lista[0].valor, -1180.45);
  assert.equal(lista[0].descricao, 'Pagamento fornecedor alfa');
});

test('lerTabela obedece o mapa com índices explícitos em vez do detectado', function () {
  var cabecalho = ['Data', 'Histórico', 'Valor', 'Valor convertido'];
  var linhas = [['01/09/2026', 'Pagamento', '100,00', '520,00']];
  assert.equal(CONC.detectarColunas(cabecalho, linhas).valor, 2);
  var lista = CONC.lerTabela(cabecalho, linhas,
    { data: 0, descricao: 1, valor: 3, debito: -1, credito: -1, tipo: -1, documento: -1 });
  assert.equal(lista[0].valor, 520);
  assert.equal(lista[0].descricao, 'Pagamento');
  assert.equal(lista[0].data, '2026-09-01');
});

test('lerTabela usa a coluna tipo D/C para o sinal', function () {
  var cabecalho = ['Data', 'Histórico', 'Tipo', 'Valor'];
  var linhas = [
    ['01/09/2026', 'Aluguel', 'D', '740,00'],
    ['02/09/2026', 'Venda balcão', 'C', '890,00']
  ];
  var mapa = CONC.detectarColunas(cabecalho, linhas);
  assert.equal(mapa.tipo, 2);
  assert.equal(mapa.valor, 3);
  var lista = CONC.lerTabela(cabecalho, linhas);
  assert.equal(lista[0].valor, -740);
  assert.equal(lista[1].valor, 890);
});

test('lerTabela com mapa.inverter troca o sinal dos dois', function () {
  var cabecalho = ['Data', 'Histórico', 'Valor'];
  var linhas = [['01/09/2026', 'Saída', '-100,00'], ['02/09/2026', 'Entrada', '250,00']];
  var lista = CONC.lerTabela(cabecalho, linhas, { inverter: true });
  assert.equal(lista[0].valor, 100);
  assert.equal(lista[1].valor, -250);
});

/* ---------------- conciliação ---------------- */

function lanc(data, valor, descricao, documento) {
  return { data: data, valor: valor, descricao: descricao || '', documento: documento || '', id: data + '|' + valor };
}

test('conciliar casa valor e data iguais como certo', function () {
  var r = CONC.conciliar(
    [lanc('2026-09-01', -740, 'PAGTO ALUGUEL SALA')],
    [lanc('2026-09-01', -740, 'Aluguel da sala')],
    { hoje: HOJE }
  );
  assert.equal(r.pares.length, 1);
  assert.equal(r.pares[0].tipo, 'certo');
  assert.equal(r.pares[0].sistema.length, 1);
  assert.equal(r.soBanco.length, 0);
  assert.equal(r.soSistema.length, 0);
});

test('conciliar marca provável quando a data difere 2 dias', function () {
  var r = CONC.conciliar(
    [lanc('2026-09-01', -1105, 'PAGTO FORNECEDOR SIGMA')],
    [lanc('2026-09-03', -1105, 'Pagamento Sigma')],
    { hoje: HOJE }
  );
  assert.equal(r.pares.length, 1);
  assert.equal(r.pares[0].tipo, 'provavel');
  assert.equal(r.pares[0].motivo, 'data difere em 2 dias');
});

test('conciliar não casa com 4 dias de diferença e tolerância 3', function () {
  var r = CONC.conciliar(
    [lanc('2026-09-01', -1105, 'PAGTO FORNECEDOR SIGMA')],
    [lanc('2026-09-05', -1105, 'Pagamento Sigma')],
    { toleranciaDias: 3, hoje: HOJE }
  );
  assert.equal(r.pares.length, 0);
  assert.equal(r.soBanco.length, 1);
  assert.equal(r.soSistema.length, 1);
});

test('conciliar marca divergente pelo documento quando o valor difere', function () {
  var r = CONC.conciliar(
    [lanc('2026-09-01', -1250, 'PAGTO BOLETO IOTA', '000451')],
    [lanc('2026-09-01', -1230, 'Boleto Iota Serviços', '451')],
    { hoje: HOJE }
  );
  assert.equal(r.pares.length, 1);
  assert.equal(r.pares[0].tipo, 'divergente');
  assert.equal(r.pares[0].motivo, 'valor difere em R$ 20,00');
});

test('conciliar junta 2 lançamentos do sistema num do banco', function () {
  var r = CONC.conciliar(
    [lanc('2026-09-01', -1500, 'PAGTO FORNECEDOR THETA')],
    [lanc('2026-09-01', -900, 'Theta parcela 1'), lanc('2026-09-02', -600, 'Theta parcela 2')],
    { hoje: HOJE }
  );
  assert.equal(r.pares.length, 1);
  assert.equal(r.pares[0].tipo, 'provavel');
  assert.equal(r.pares[0].motivo, 'soma de 2 lançamentos');
  assert.equal(r.pares[0].sistema.length, 2);
  assert.equal(r.soSistema.length, 0);
});

test('a soma acha o trio com a janela acima de 30 candidatos', function () {
  var sistema = [], i;
  for (i = 1; i <= 40; i++) sistema.push(lanc('2026-09-01', -100 * i, 'Parcela ' + i));
  var r = CONC.conciliar([lanc('2026-09-01', -100 * (38 + 39 + 40), 'PAGTO LOTE')], sistema, { hoje: HOJE });
  assert.equal(r.pares.length, 1);
  assert.equal(r.pares[0].motivo, 'soma de 3 lançamentos');
  assert.equal(r.soSistema.length, 37);
});

/* teto de complexidade: acima de 120 candidatos na janela a busca de trio sai de cena */
test('acima de 120 candidatos na janela a soma só tenta pares', function () {
  var sistema = [], i;
  for (i = 1; i <= 130; i++) sistema.push(lanc('2026-09-01', -100 * i, 'Parcela ' + i));
  var r = CONC.conciliar([lanc('2026-09-01', -100 * (128 + 129 + 130), 'PAGTO LOTE')], sistema, { hoje: HOJE });
  assert.equal(r.pares.length, 0);
  assert.equal(r.soBanco.length, 1);
  assert.equal(r.soSistema.length, 130);
});

test('documento de 20 dígitos distinto por 1 dígito não vira o mesmo documento', function () {
  var r = CONC.conciliar(
    [lanc('2026-09-01', -100, 'PAGTO NOTA', '12345678901234567890')],
    [lanc('2026-09-01', -250, 'Pagamento nota', '12345678901234567891')],
    { hoje: HOJE }
  );
  assert.equal(r.pares.length, 0);
  assert.equal(r.soBanco.length, 1);
  assert.equal(r.soSistema.length, 1);
});

test('cada lançamento entra em no máximo um par', function () {
  var r = CONC.conciliar(
    [lanc('2026-09-01', -100, 'PAGTO X')],
    [lanc('2026-09-01', -100, 'Pagamento X'), lanc('2026-09-01', -100, 'Pagamento X repetido')],
    { hoje: HOJE }
  );
  assert.equal(r.pares.length, 1);
  assert.equal(r.pares[0].sistema.length, 1);
  assert.equal(r.soSistema.length, 1);
  assert.equal(r.soSistema[0].descricao, 'Pagamento X repetido');
});

test('resumo soma cada situação e a diferença de saldo', function () {
  var r = CONC.conciliar(
    [lanc('2026-09-01', -100, 'PAGTO X'), lanc('2026-09-02', 250, 'TED RECEBIDA'), lanc('2026-09-03', -49.9, 'TARIFA')],
    [lanc('2026-09-01', -100, 'Pagamento X'), lanc('2026-09-04', 250, 'Recebimento'), lanc('2026-09-10', -70, 'Cheque não compensado')],
    { hoje: HOJE }
  );
  assert.deepEqual(r.resumo.conciliados, { n: 1, valor: -100 });
  assert.deepEqual(r.resumo.provaveis, { n: 1, valor: 250 });
  assert.deepEqual(r.resumo.divergentes, { n: 0, valor: 0 });
  assert.deepEqual(r.resumo.soBanco, { n: 1, valor: -49.9 });
  assert.deepEqual(r.resumo.soSistema, { n: 1, valor: -70 });
  assert.equal(r.resumo.saldoBanco, 100.1);
  assert.equal(r.resumo.saldoSistema, 80);
  assert.equal(r.resumo.diferenca, 20.1);
});

/* os cartões de número saem daqui: saldo de cada lado e a diferença entre eles */
test('resumo traz os dois saldos com sinal e a diferença negativa quando o sistema soma mais', function () {
  var r = CONC.conciliar(
    [lanc('2026-09-01', -100, 'PAGTO X'), lanc('2026-09-02', 250, 'TED RECEBIDA')],
    [lanc('2026-09-01', -100, 'Pagamento X'), lanc('2026-09-02', 250, 'Recebimento'),
      lanc('2026-09-05', 200, 'Recebimento não conciliado')],
    { hoje: HOJE }
  );
  assert.equal(r.resumo.saldoBanco, 150);
  assert.equal(r.resumo.saldoSistema, 350);
  assert.equal(r.resumo.diferenca, -200);
});

test('reais põe o sinal antes do símbolo', function () {
  assert.equal(CONC.reais(-2450), '−R$ 2.450,00');
  assert.equal(CONC.reais(2450), 'R$ 2.450,00');
  assert.equal(CONC.reais(0), 'R$ 0,00');
});

test('volumes soma o módulo de cada lançamento em vez do líquido', function () {
  var r = CONC.conciliar(
    [lanc('2026-09-01', -100, 'PAGTO X'), lanc('2026-09-02', 250, 'TED RECEBIDA'),
      lanc('2026-09-03', 400, 'DEPOSITO EM DINHEIRO'), lanc('2026-09-03', -400, 'ESTORNO DEPOSITO')],
    [lanc('2026-09-01', -100, 'Pagamento X'), lanc('2026-09-04', 250, 'Recebimento')],
    { hoje: HOJE }
  );
  var v = CONC.volumes(r);
  assert.equal(r.resumo.soBanco.valor, 0);
  assert.equal(v.soBanco, 800);
  assert.equal(v.certo, 100);
  assert.equal(v.provavel, 250);
  assert.equal(v.divergente, 0);
  assert.equal(v.soSistema, 0);
});

/* ---------------- exportação ---------------- */

test('csvPendencias sai com BOM, ponto e vírgula e só o que não bateu', function () {
  var r = CONC.conciliar(
    [lanc('2026-09-01', -100, 'PAGTO X'), lanc('2026-09-03', -49.9, 'TARIFA')],
    [lanc('2026-09-01', -100, 'Pagamento X'), lanc('2026-09-10', -70, 'Cheque não compensado')],
    { hoje: HOJE }
  );
  var texto = CONC.csvPendencias(r);
  assert.equal(texto.charCodeAt(0), 0xFEFF);
  var linhas = texto.slice(1).trim().split('\r\n');
  assert.equal(linhas[0], 'Origem;Data;Descrição;Documento;Valor;Situação');
  assert.equal(linhas.length, 3);
  assert.ok(linhas[1].indexOf('TARIFA') >= 0);
  assert.ok(linhas[2].indexOf('Cheque não compensado') >= 0);
});

test('csvCompleto traz uma linha por lançamento dos dois lados', function () {
  var r = CONC.conciliar(
    [lanc('2026-09-01', -1500, 'PAGTO THETA'), lanc('2026-09-03', -49.9, 'TARIFA')],
    [lanc('2026-09-01', -900, 'Theta 1'), lanc('2026-09-02', -600, 'Theta 2'), lanc('2026-09-10', -70, 'Cheque')],
    { hoje: HOJE }
  );
  var texto = CONC.csvCompleto(r);
  assert.equal(texto.charCodeAt(0), 0xFEFF);
  var linhas = texto.slice(1).trim().split('\r\n');
  assert.equal(linhas[0].indexOf('Situação;'), 0);
  assert.equal(linhas.length, 5);
});

/* ---------------- exemplo ---------------- */

function conciliarExemplo() {
  var ex = CONC.exemplo(HOJE);
  var banco = CONC.lerOFX(ex.banco.texto);
  var tabela = COMUM.lerCSV(ex.sistema.texto);
  var sistema = CONC.lerTabela(tabela.cabecalho, tabela.linhas);
  return { ex: ex, banco: banco, sistema: sistema, r: CONC.conciliar(banco, sistema, { hoje: HOJE }) };
}

test('exemplo entrega OFX de verdade e planilha lida pelo kit', function () {
  var e = conciliarExemplo();
  assert.equal(e.ex.banco.nome, 'extrato-exemplo.ofx');
  assert.equal(e.ex.sistema.nome, 'lancamentos-exemplo.csv');
  assert.equal(e.banco.length, 26);
  assert.equal(e.sistema.length, 27);
  assert.ok(e.banco.every(function (l) { return /^\d{4}-\d{2}-\d{2}$/.test(l.data) && l.valor !== 0; }));
  assert.ok(e.sistema.every(function (l) { return /^\d{4}-\d{2}-\d{2}$/.test(l.data) && l.valor !== 0; }));
});

test('exemplo é determinístico e fica nos últimos 30 dias', function () {
  var a = CONC.exemplo(HOJE), b = CONC.exemplo(HOJE);
  assert.equal(a.banco.texto, b.banco.texto);
  assert.equal(a.sistema.texto, b.sistema.texto);
  CONC.lerOFX(a.banco.texto).forEach(function (l) {
    assert.ok(l.data <= HOJE && l.data >= COMUM.maisDias(HOJE, -30));
  });
});

test('exemplo dá 18 certos, 3 prováveis por data, 1 soma, 1 divergente, 3 e 3 sozinhos', function () {
  var r = conciliarExemplo().r;
  function conta(f) { return r.pares.filter(f).length; }
  assert.equal(conta(function (p) { return p.tipo === 'certo'; }), 18);
  assert.equal(conta(function (p) { return p.tipo === 'provavel' && p.motivo.indexOf('data difere') === 0; }), 3);
  assert.equal(conta(function (p) { return p.motivo.indexOf('soma de') === 0; }), 1);
  assert.equal(conta(function (p) { return p.tipo === 'divergente'; }), 1);
  assert.equal(r.soBanco.length, 3);
  assert.equal(r.soSistema.length, 3);
  var provavel = r.pares.filter(function (p) { return p.motivo.indexOf('data difere') === 0; })[0];
  assert.equal(provavel.motivo, 'data difere em 2 dias');
});

test('volumes do exemplo trazem o valor movimentado, não o saldo líquido', function () {
  var r = conciliarExemplo().r;
  var v = CONC.volumes(r);
  assert.equal(v.certo, 26692.20);
  assert.equal(v.provavel, 5130.30);
  assert.equal(v.divergente, 1250);
  assert.equal(v.soBanco, 65.62);
  assert.equal(v.soSistema, 1748.70);
  assert.ok(Math.abs(r.resumo.conciliados.valor) < v.certo);
});
