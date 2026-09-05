var test = require('node:test');
var assert = require('node:assert/strict');
var BOL = require('./nucleo.js');

var BOM = String.fromCharCode(0xFEFF);

/* exemplo publicado pela FEBRABAN: Banco do Brasil, R$ 1,00, fator 3737 */
var BARRAS_BB = '00193373700000001000500940144816060680935031';
var LINHA_BB = '00190500954014481606906809350314337370000000100';

function zeros(s, n) {
  var t = String(s);
  while (t.length < n) t = '0' + t;
  return t;
}

/* monta um código de barras bancário válido, com o DV geral calculado */
function barrasBancario(banco, fator, centavos, livre) {
  var base = banco + '9' + fator + zeros(centavos, 10) + livre;
  return base.slice(0, 4) + BOL.mod11(base) + base.slice(4);
}

function barrasArrecadacao(segmento, identificador, valor11, livre29) {
  var base = '8' + segmento + identificador + valor11 + livre29;
  var dv = (identificador === '6' || identificador === '7') ? BOL.mod10(base) : BOL.mod11(base);
  return base.slice(0, 3) + dv + base.slice(3);
}

var LIVRE = '0123456789012345678901234';

/* ---------------- dígitos verificadores ---------------- */

test('mod10 confere os três campos do exemplo da FEBRABAN', function () {
  assert.equal(BOL.mod10('001905009'), 5);
  assert.equal(BOL.mod10('4014481606'), 9);
  assert.equal(BOL.mod10('0680935031'), 4);
});

test('mod10 dobra da direita para a esquerda', function () {
  assert.equal(BOL.mod10('123456789'), 7);
  assert.equal(BOL.mod10('0'), 0);
  assert.equal(BOL.mod10('5'), 9);
});

test('mod11 devolve o DV geral do exemplo da FEBRABAN', function () {
  assert.equal(BOL.mod11('0019' + '3737' + '0000000100' + '0500940144816060680935031'), 3);
});

test('mod11 devolve 1 quando o resto é 0, 1 ou 10', function () {
  assert.equal(BOL.mod11('0'), 1);
  assert.equal(BOL.mod11('5'), 1);
  assert.equal(BOL.mod11('1'), 9);
  assert.equal(BOL.mod11('11'), 6);
});

/* ---------------- leitura de boleto bancário ---------------- */

test('linha de 47 dígitos vira o código de barras de 44', function () {
  var r = BOL.ler(LINHA_BB, '2026-09-05');
  assert.equal(r.tipo, 'bancario');
  assert.equal(r.barras, BARRAS_BB);
  assert.equal(r.linha, LINHA_BB);
  assert.equal(r.valido, true);
  assert.deepEqual(r.erros, []);
  assert.equal(r.valor, 1);
});

test('código de barras de 44 dígitos gera a linha digitável de 47', function () {
  var r = BOL.ler(BARRAS_BB, '2026-09-05');
  assert.equal(r.linha.length, 47);
  assert.equal(r.linha, LINHA_BB);
  assert.equal(r.valido, true);
});

test('banco 341 vira Itaú e banco fora da lista vira Banco 999', function () {
  var itau = BOL.ler(BOL.gerarLinha(barrasBancario('341', '1000', 5000, LIVRE)), '2026-09-05');
  assert.equal(itau.banco.codigo, '341');
  assert.equal(itau.banco.nome, 'Itaú');
  var outro = BOL.ler(BOL.gerarLinha(barrasBancario('999', '1000', 5000, LIVRE)), '2026-09-05');
  assert.equal(outro.banco.nome, 'Banco 999');
});

test('a linha gerada por gerarLinha volta igual em ler', function () {
  var barras = barrasBancario('237', '1010', 123456, LIVRE);
  var linha = BOL.gerarLinha(barras);
  assert.equal(linha.length, 47);
  var r = BOL.ler(linha, '2026-09-05');
  assert.equal(r.barras, barras);
  assert.equal(r.linha, linha);
  assert.equal(r.valido, true);
  assert.equal(r.valor, 1234.56);
});

test('fator 1000 com hoje em 2026 cai na base nova, não em 2000', function () {
  var r = BOL.ler(BOL.gerarLinha(barrasBancario('341', '1000', 5000, LIVRE)), '2026-09-05');
  assert.equal(r.vencimento, '2025-02-22');
});

test('fator 0000 fica sem vencimento', function () {
  var r = BOL.ler(BOL.gerarLinha(barrasBancario('341', '0000', 5000, LIVRE)), '2026-09-05');
  assert.equal(r.vencimento, '');
  assert.equal(r.dias, null);
});

test('valor zerado vira null, não R$ 0,00', function () {
  var r = BOL.ler(BOL.gerarLinha(barrasBancario('341', '1000', 0, LIVRE)), '2026-09-05');
  assert.equal(r.valor, null);
});

test('dias conta o vencimento menos hoje', function () {
  var r = BOL.ler(BOL.gerarLinha(barrasBancario('341', '1000', 5000, LIVRE)), '2025-02-20');
  assert.equal(r.vencimento, '2025-02-22');
  assert.equal(r.dias, 2);
});

test('DV de campo errado invalida sem impedir a leitura', function () {
  var certa = BOL.gerarLinha(barrasBancario('341', '1010', 5000, LIVRE));
  var errado = String((Number(certa.charAt(20)) + 1) % 10);
  var torta = certa.slice(0, 20) + errado + certa.slice(21);
  var r = BOL.ler(torta, '2026-09-05');
  assert.equal(r.valido, false);
  assert.deepEqual(r.erros, ['dígito verificador do campo 2 não bate']);
  assert.equal(r.banco.nome, 'Itaú');
  assert.equal(r.valor, 50);
});

test('DV geral errado é apontado com nome próprio', function () {
  var certa = BOL.gerarLinha(barrasBancario('341', '1010', 5000, LIVRE));
  var errado = String((Number(certa.charAt(32)) + 1) % 10);
  var torta = certa.slice(0, 32) + errado + certa.slice(33);
  var r = BOL.ler(torta, '2026-09-05');
  assert.equal(r.valido, false);
  assert.deepEqual(r.erros, ['dígito verificador geral não bate']);
});

test('pontos, espaços e traços são ignorados', function () {
  var r = BOL.ler('00190.50095 40144.816069 06809.350314 3 37370000000100', '2026-09-05');
  assert.equal(r.barras, BARRAS_BB);
  assert.equal(r.valido, true);
});

/* ---------------- erros de entrada ---------------- */

test('texto sem dígitos devolve erro', function () {
  var r = BOL.ler('cole aqui a linha do boleto', '2026-09-05');
  assert.ok(r.erro);
  assert.equal(r.valido, undefined);
});

test('quantidade de dígitos fora de 44, 47 e 48 devolve erro', function () {
  var r = BOL.ler('12345678901234567890', '2026-09-05');
  assert.ok(r.erro);
  assert.ok(r.erro.indexOf('20') >= 0);
});

/* ---------------- arrecadação ---------------- */

test('arrecadação de 48 dígitos traz valor e segmento', function () {
  var barras = barrasArrecadacao('3', '6', '00000015230', '01234567890123456789012345678');
  var linha = BOL.gerarLinha(barras);
  assert.equal(linha.length, 48);
  var r = BOL.ler(linha, '2026-09-05');
  assert.equal(r.tipo, 'arrecadacao');
  assert.equal(r.valido, true);
  assert.equal(r.valor, 152.3);
  assert.equal(r.segmento, 'Energia elétrica e gás');
  assert.equal(r.vencimento, '');
});

test('arrecadação de 44 dígitos gera a linha de 48', function () {
  var barras = barrasArrecadacao('1', '6', '00000009900', '01234567890123456789012345678');
  var r = BOL.ler(barras, '2026-09-05');
  assert.equal(r.linha.length, 48);
  assert.equal(r.linha, BOL.gerarLinha(barras));
  assert.equal(r.segmento, 'Prefeitura');
  assert.equal(r.valor, 99);
});

test('arrecadação com identificador de referência não tem valor em reais', function () {
  var barras = barrasArrecadacao('4', '7', '00000015230', '01234567890123456789012345678');
  var r = BOL.ler(BOL.gerarLinha(barras), '2026-09-05');
  assert.equal(r.segmento, 'Telecomunicações');
  assert.equal(r.valor, null);
});

test('arrecadação com identificador 8 tem valor em reais e DV por mod11', function () {
  var barras = barrasArrecadacao('5', '8', '00000034500', '01234567890123456789012345678');
  var linha = BOL.gerarLinha(barras);
  assert.equal(linha.length, 48);
  var r = BOL.ler(linha, '2026-09-05');
  assert.equal(r.valido, true);
  assert.deepEqual(r.erros, []);
  assert.equal(r.valor, 345);
  assert.equal(r.segmento, 'Órgão governamental');
});

test('arrecadação com identificador 9 não tem valor em reais', function () {
  var barras = barrasArrecadacao('9', '9', '00000034500', '01234567890123456789012345678');
  var r = BOL.ler(BOL.gerarLinha(barras), '2026-09-05');
  assert.equal(r.valido, true);
  assert.equal(r.valor, null);
  assert.equal(r.segmento, 'Uso exclusivo do banco');
});

test('bloco de arrecadação por mod11 com DV errado é apontado', function () {
  var certa = BOL.gerarLinha(barrasArrecadacao('5', '8', '00000034500', '01234567890123456789012345678'));
  var errado = String((Number(certa.charAt(35)) + 1) % 10);
  var torta = certa.slice(0, 35) + errado + certa.slice(36);
  var r = BOL.ler(torta, '2026-09-05');
  assert.equal(r.valido, false);
  assert.deepEqual(r.erros, ['dígito verificador do bloco 3 não bate']);
  assert.equal(r.valor, 345);
});

test('bloco de arrecadação com DV errado é apontado', function () {
  var certa = BOL.gerarLinha(barrasArrecadacao('2', '6', '00000015230', '01234567890123456789012345678'));
  var errado = String((Number(certa.charAt(23)) + 1) % 10);
  var torta = certa.slice(0, 23) + errado + certa.slice(24);
  var r = BOL.ler(torta, '2026-09-05');
  assert.equal(r.valido, false);
  assert.deepEqual(r.erros, ['dígito verificador do bloco 2 não bate']);
  assert.equal(r.segmento, 'Saneamento');
});

/* ---------------- lote e exportação ---------------- */

test('lerLote devolve uma leitura por linha não vazia', function () {
  var texto = LINHA_BB + '\n\n' + BARRAS_BB + '\r\n  qualquer coisa  \n';
  var lote = BOL.lerLote(texto, '2026-09-05');
  assert.equal(lote.length, 3);
  assert.equal(lote[0].valido, true);
  assert.equal(lote[1].valido, true);
  assert.ok(lote[2].erro);
});

test('linhasLote põe o cabeçalho, ordena por vencimento e descreve a linha inválida', function () {
  var hoje = '2026-09-05';
  var tarde = BOL.gerarLinha(barrasBancario('341', '1600', 10000, LIVRE));
  var cedo = BOL.gerarLinha(barrasBancario('237', '1500', 20000, LIVRE));
  var lote = BOL.lerLote(tarde + '\n' + cedo + '\n12345', hoje);
  var linhas = BOL.linhasLote(lote);

  assert.equal(linhas.length, 4);
  assert.deepEqual(linhas[0],
    ['Banco', 'Vencimento', 'Dias', 'Valor', 'Situação', 'Linha digitável', 'Código de barras']);
  assert.equal(linhas[1][0], 'Bradesco');
  assert.equal(linhas[1][3], '200,00');
  assert.equal(linhas[2][0], 'Itaú');
  assert.equal(linhas[2][3], '100,00');
  assert.deepEqual(linhas[3], ['', '', '', '', 'esperava 44, 47 ou 48 dígitos e vieram 5', '', '']);
});

test('csvLote nasce de linhasLote, na mesma ordem', function () {
  var hoje = '2026-09-05';
  var lote = BOL.lerLote(
    BOL.gerarLinha(barrasBancario('341', '1600', 10000, LIVRE)) + '\n' +
    BOL.gerarLinha(barrasBancario('237', '1500', 20000, LIVRE)), hoje);
  var corpo = BOL.csvLote(lote).slice(1).split('\r\n');
  assert.equal(corpo[1].split(';')[0], 'Bradesco');
  assert.equal(corpo[2].split(';')[0], 'Itaú');
});

test('csvLote sai com BOM, ponto e vírgula e cabeçalho', function () {
  var csv = BOL.csvLote(BOL.lerLote(LINHA_BB, '2026-09-05'));
  assert.equal(csv.slice(0, 1), BOM);
  var cabecalho = csv.slice(1).split('\r\n')[0];
  assert.equal(cabecalho, 'Banco;Vencimento;Dias;Valor;Situação;Linha digitável;Código de barras');
  assert.ok(csv.indexOf(LINHA_BB) > 0);
});

test('lerLote guarda o número e o texto de cada linha, inclusive das rejeitadas', function () {
  var texto = LINHA_BB + '\n\n  12345678901234567890  \n';
  var lote = BOL.lerLote(texto, '2026-09-05');
  assert.equal(lote.length, 2);
  assert.equal(lote[0].numero, 1);
  assert.equal(lote[0].texto, LINHA_BB);
  assert.equal(lote[1].numero, 3);
  assert.equal(lote[1].texto, '12345678901234567890');
  assert.ok(lote[1].erro);
});

test('motivoSemBoleto explica a linha rejeitada com a contagem de dígitos', function () {
  var lote = BOL.lerLote('0019050095401448160690680935031433737000000010', '2026-09-05');
  var motivo = BOL.motivoSemBoleto(lote);
  assert.ok(motivo.indexOf('esperava 44, 47 ou 48 dígitos e vieram 46') >= 0);
  assert.ok(motivo.indexOf('Nenhuma das') < 0);
});

test('motivoSemBoleto agrupa os motivos e aponta as linhas', function () {
  var lote = BOL.lerLote('12345\ncole aqui\n67890', '2026-09-05');
  var motivo = BOL.motivoSemBoleto(lote);
  assert.ok(motivo.indexOf('Nenhuma das 3 linhas') >= 0);
  assert.ok(motivo.indexOf('esperava 44, 47 ou 48 dígitos e vieram 5 (linhas 1, 3)') >= 0);
  assert.ok(motivo.indexOf('não achei dígitos aqui') >= 0);
  assert.ok(motivo.indexOf('(linha 2)') >= 0);
});

test('motivoSemBoleto fica vazio quando não há linha rejeitada', function () {
  assert.equal(BOL.motivoSemBoleto(BOL.lerLote(LINHA_BB, '2026-09-05')), '');
  assert.equal(BOL.motivoSemBoleto([]), '');
});

test('situacao descreve vencido, hoje e a vencer', function () {
  assert.equal(BOL.situacao({ valido: true, vencimento: '2026-09-01', dias: -4 }), 'vencido há 4 dias');
  assert.equal(BOL.situacao({ valido: true, vencimento: '2026-09-05', dias: 0 }), 'vence hoje');
  assert.equal(BOL.situacao({ valido: true, vencimento: '2026-09-12', dias: 7 }), 'vence em 7 dias');
  assert.equal(BOL.situacao({ valido: true, vencimento: '', dias: null }), 'sem vencimento');
  assert.equal(BOL.situacao({ valido: false, vencimento: '', dias: null, erros: ['x'] }), 'dígito verificador não bate');
});

/* ---------------- exemplo ---------------- */

test('exemplo entrega 8 linhas e é sempre igual', function () {
  assert.equal(BOL.exemplo('2026-09-05'), BOL.exemplo('2026-09-05'));
  var linhas = BOL.exemplo('2026-09-05').split('\n');
  assert.equal(linhas.length, 8);
  linhas.forEach(function (l) { assert.ok(/^\d+$/.test(l)); });
});

test('exemplo cobre os vencimentos combinados, a arrecadação e o DV errado', function () {
  var hoje = '2026-09-05';
  var lote = BOL.lerLote(BOL.exemplo(hoje), hoje);
  assert.equal(lote.length, 8);

  var bancarios = lote.filter(function (l) { return l.tipo === 'bancario'; });
  assert.equal(bancarios.length, 7);

  var validos = bancarios.filter(function (l) { return l.valido; });
  assert.equal(validos.length, 6);
  assert.deepEqual(validos.map(function (l) { return l.dias; }), [-5, 0, 2, 7, 20, 45]);
  assert.equal(validos.filter(function (l) { return l.valor === null; }).length, 1);

  var bancos = {};
  validos.forEach(function (l) { bancos[l.banco.codigo] = true; });
  assert.equal(Object.keys(bancos).length, 6);

  var arrecadacao = lote.filter(function (l) { return l.tipo === 'arrecadacao'; });
  assert.equal(arrecadacao.length, 1);
  assert.equal(arrecadacao[0].valido, true);
  assert.ok(arrecadacao[0].valor > 0);

  var tortos = lote.filter(function (l) { return l.valido === false; });
  assert.equal(tortos.length, 1);
  assert.ok(tortos[0].erros.length > 0);
});
