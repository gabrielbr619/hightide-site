var test = require('node:test');
var assert = require('node:assert/strict');
var COB = require('./nucleo.js');

var BOM = String.fromCharCode(0xFEFF);
var HOJE = '2026-09-05';

function titulo(extra) {
  var base = {
    nome: 'Ana Maria Souza',
    telefone: '11912345678',
    telefoneOk: true,
    valor: 1234.56,
    vencimento: '2026-09-05',
    documento: 'NF 2041',
    pago: false
  };
  Object.keys(extra || {}).forEach(function (k) { base[k] = extra[k]; });
  return base;
}

function planoDoExemplo() {
  var ex = COB.exemplo(HOJE);
  var mapa = COB.detectarColunas(ex.cabecalho, ex.linhas);
  return COB.plano(COB.montar(ex.cabecalho, ex.linhas, mapa), { hoje: HOJE, empresa: 'Maré Alta' });
}

/* ---------------- classificar ---------------- */

test('classificar separa depois de antes no limite de 7 dias', function () {
  assert.equal(COB.classificar(titulo({ vencimento: '2026-09-13' }), HOJE).etapa, 'depois');
  assert.equal(COB.classificar(titulo({ vencimento: '2026-09-12' }), HOJE).etapa, 'antes');
  assert.equal(COB.classificar(titulo({ vencimento: '2026-09-12' }), HOJE).dias, 7);
});

test('classificar marca vespera de 1 a 3 dias', function () {
  assert.equal(COB.classificar(titulo({ vencimento: '2026-09-09' }), HOJE).etapa, 'antes');
  assert.equal(COB.classificar(titulo({ vencimento: '2026-09-08' }), HOJE).etapa, 'vespera');
  assert.equal(COB.classificar(titulo({ vencimento: '2026-09-06' }), HOJE).etapa, 'vespera');
});

test('classificar marca hoje quando vence na data', function () {
  var r = COB.classificar(titulo({ vencimento: HOJE }), HOJE);
  assert.equal(r.etapa, 'hoje');
  assert.equal(r.dias, 0);
});

test('classificar separa atraso leve de atraso no limite de 7 dias', function () {
  assert.equal(COB.classificar(titulo({ vencimento: '2026-09-04' }), HOJE).etapa, 'atraso-leve');
  assert.equal(COB.classificar(titulo({ vencimento: '2026-08-29' }), HOJE).etapa, 'atraso-leve');
  assert.equal(COB.classificar(titulo({ vencimento: '2026-08-29' }), HOJE).dias, -7);
  assert.equal(COB.classificar(titulo({ vencimento: '2026-08-28' }), HOJE).etapa, 'atraso');
  assert.equal(COB.classificar(titulo({ vencimento: '2026-08-28' }), HOJE).dias, -8);
});

test('classificar devolve pago mesmo com vencimento vencido', function () {
  assert.equal(COB.classificar(titulo({ vencimento: '2026-07-01', pago: true }), HOJE).etapa, 'pago');
  assert.equal(COB.classificar(titulo({ vencimento: '2026-12-01', pago: true }), HOJE).etapa, 'pago');
});

test('classificar devolve sem-data quando falta o vencimento', function () {
  var r = COB.classificar(titulo({ vencimento: '' }), HOJE);
  assert.equal(r.etapa, 'sem-data');
  assert.equal(r.dias, null);
});

/* ---------------- mensagem e link ---------------- */

test('preencher substitui todos os campos e formata valor e data', function () {
  var modelo = '{nome}|{primeiro_nome}|{valor}|{vencimento}|{dias}|{documento}|{empresa}';
  var texto = COB.preencher(modelo, titulo({ vencimento: '2026-09-10' }), { empresa: 'Maré Alta', hoje: HOJE });
  assert.equal(texto, 'Ana Maria Souza|Ana|R$ 1.234,56|10/09/2026|5|NF 2041|Maré Alta');
});

test('preencher usa o atraso em dias positivos', function () {
  var texto = COB.preencher('{dias}', titulo({ vencimento: '2026-08-26' }), { empresa: 'Maré Alta', hoje: HOJE });
  assert.equal(texto, '10');
});

test('MODELOS tem um texto para cada etapa que cobra', function () {
  ['antes', 'vespera', 'hoje', 'atraso-leve', 'atraso'].forEach(function (etapa) {
    assert.equal(typeof COB.MODELOS[etapa], 'string');
    assert.ok(COB.MODELOS[etapa].indexOf('{valor}') >= 0, etapa + ' sem {valor}');
    assert.ok(/Obrigado, \{empresa\}\.$/.test(COB.MODELOS[etapa]), etapa + ' sem assinatura');
  });
});

test('preencher fecha com Obrigado sozinho quando não há empresa', function () {
  var t = titulo({ vencimento: HOJE });
  assert.ok(/Obrigado\.$/.test(COB.preencher(COB.MODELOS.hoje, t, { hoje: HOJE })));
  assert.ok(/Obrigado, Maré Alta\.$/.test(COB.preencher(COB.MODELOS.hoje, t, { empresa: 'Maré Alta', hoje: HOJE })));
});

test('preencher não inventa R$ 0,00 para título sem valor', function () {
  assert.equal(COB.preencher('{valor}', titulo({ valor: null }), { hoje: HOJE }), 'valor a confirmar');
});

test('linkWhats monta o wa.me com 55 e a mensagem escapada', function () {
  var link = COB.linkWhats('+55 (11) 91234-5678', 'Oi Ana, tudo bem?');
  assert.equal(link, 'https://wa.me/5511912345678?text=Oi%20Ana%2C%20tudo%20bem%3F');
});

test('linkWhats aceita fixo de 10 dígitos e recusa número sem DDD', function () {
  assert.equal(COB.linkWhats('(11) 3123-4567', 'oi'), 'https://wa.me/551131234567?text=oi');
  assert.equal(COB.linkWhats('98812-3344', 'oi'), '');
  assert.equal(COB.linkWhats('9881-2334', 'oi'), '');
  assert.equal(COB.linkWhats('', 'oi'), '');
});

/* ---------------- colunas e títulos ---------------- */

test('detectarColunas acha as colunas do exemplo', function () {
  var ex = COB.exemplo(HOJE);
  var mapa = COB.detectarColunas(ex.cabecalho, ex.linhas);
  assert.equal(ex.cabecalho[mapa.nome], 'Cliente');
  assert.equal(ex.cabecalho[mapa.documento], 'Documento');
  assert.equal(ex.cabecalho[mapa.email], 'E-mail');
  assert.equal(ex.cabecalho[mapa.telefone], 'Telefone');
  assert.equal(ex.cabecalho[mapa.vencimento], 'Vencimento');
  assert.equal(ex.cabecalho[mapa.valor], 'Valor (R$)');
  assert.equal(ex.cabecalho[mapa.status], 'Status');
});

test('detectarColunas prefere a coluna de vencimento à de emissão', function () {
  var cabecalho = ['Cliente', 'Emissão', 'Vencimento', 'Valor'];
  var linhas = [
    ['Padaria Trigo', '01/08/2026', '10/09/2026', '1.280,00'],
    ['Marcenaria Cedro', '02/08/2026', '11/09/2026', '3.450,00']
  ];
  var mapa = COB.detectarColunas(cabecalho, linhas);
  assert.equal(mapa.vencimento, 2);
  assert.equal(mapa.valor, 3);
});

test('montar normaliza telefone, valor e vencimento', function () {
  var cabecalho = ['Cliente', 'Telefone', 'Vencimento', 'Valor', 'Status'];
  var linhas = [['Padaria Trigo de Ouro', '+55 (11) 98812-3344', '10/09/2026', 'R$ 1.280,00', 'Em aberto']];
  var itens = COB.montar(cabecalho, linhas, COB.detectarColunas(cabecalho, linhas));
  assert.equal(itens.length, 1);
  assert.equal(itens[0].nome, 'Padaria Trigo de Ouro');
  assert.equal(itens[0].telefone, '11988123344');
  assert.equal(itens[0].telefoneOk, true);
  assert.equal(itens[0].valor, 1280);
  assert.equal(itens[0].vencimento, '2026-09-10');
  assert.equal(itens[0].pago, false);
});

test('montar marca pago pelo status e reprova telefone sem DDD', function () {
  var cabecalho = ['Cliente', 'Telefone', 'Vencimento', 'Valor', 'Status'];
  var linhas = [
    ['Studio Nove', '98812-3344', '01/09/2026', '1.150,00', ''],
    ['Restaurante Fogo Alto', '27 99688-3300', '26/08/2026', '2.900,00', 'Pago']
  ];
  var itens = COB.montar(cabecalho, linhas, COB.detectarColunas(cabecalho, linhas));
  assert.equal(itens[0].telefoneOk, false);
  assert.equal(itens[0].pago, false);
  assert.equal(itens[1].pago, true);
});

test('montar deixa o valor em null quando a planilha não traz número', function () {
  var cabecalho = ['Cliente', 'Telefone', 'Vencimento', 'Valor', 'Status'];
  var linhas = [
    ['Padaria Trigo', '11988123344', '10/09/2026', '', ''],
    ['Marcenaria Cedro', '21996402277', '11/09/2026', 'a combinar', '']
  ];
  var itens = COB.montar(cabecalho, linhas, COB.detectarColunas(cabecalho, linhas));
  assert.equal(itens[0].valor, null);
  assert.equal(itens[1].valor, null);
});

/* ---------------- plano e resumo ---------------- */

test('plano deixa depois e pago sem mensagem e sem link', function () {
  var itens = [
    titulo({ nome: 'Construtora Alvorada', vencimento: '2026-09-20' }),
    titulo({ nome: 'Restaurante Fogo Alto', vencimento: '2026-08-26', pago: true })
  ];
  var p = COB.plano(itens, { hoje: HOJE, empresa: 'Maré Alta' });
  assert.equal(p[0].etapa, 'depois');
  assert.equal(p[0].mensagem, '');
  assert.equal(p[0].link, '');
  assert.equal(p[1].etapa, 'pago');
  assert.equal(p[1].mensagem, '');
});

test('plano usa o modelo trocado da etapa', function () {
  var p = COB.plano([titulo({ vencimento: '2026-08-20' })], {
    hoje: HOJE,
    empresa: 'Maré Alta',
    modelos: { atraso: 'Recado para {primeiro_nome} sobre {valor}' }
  });
  assert.equal(p[0].mensagem, 'Recado para Ana sobre R$ 1.234,56');
  assert.ok(p[0].link.indexOf('https://wa.me/5511912345678?text=') === 0);
});

test('resumo do exemplo bate as contagens de cada faixa', function () {
  var r = COB.resumo(planoDoExemplo());
  assert.equal(r.atrasado.n, 5);
  assert.equal(r.atrasado.valor, 9250);
  assert.equal(r.hoje.n, 2);
  assert.equal(r.hoje.valor, 5080);
  assert.equal(r.proximos7.n, 8);
  assert.equal(r.proximos7.valor, 16300);
  assert.equal(r.depois.n, 2);
  assert.equal(r.pagos.n, 1);
  assert.equal(r.semTelefone.n, 2);
});

test('resumo tira o título sem valor das somas e conta à parte', function () {
  var itens = [
    titulo({ nome: 'Com valor', vencimento: '2026-08-20', valor: 1000 }),
    titulo({ nome: 'Sem valor', vencimento: '2026-08-20', valor: null })
  ];
  var r = COB.resumo(COB.plano(itens, { hoje: HOJE }));
  assert.equal(r.atrasado.n, 2);
  assert.equal(r.atrasado.valor, 1000);
  assert.equal(r.semValor.n, 1);
});

test('exemplo tem 18 títulos e dois em atraso de mais de 7 dias', function () {
  var p = planoDoExemplo();
  assert.equal(p.length, 18);
  assert.equal(p.filter(function (t) { return t.etapa === 'atraso'; }).length, 2);
  assert.equal(p.filter(function (t) { return t.etapa === 'atraso-leve'; }).length, 3);
  assert.equal(p.filter(function (t) { return t.etapa === 'vespera'; }).length, 4);
  assert.equal(p.filter(function (t) { return t.etapa === 'antes'; }).length, 4);
});

test('exemplo é igual em duas chamadas com a mesma data', function () {
  assert.deepEqual(COB.exemplo(HOJE), COB.exemplo(HOJE));
  assert.equal(COB.exemplo(HOJE).nome, 'contas-a-receber-exemplo.csv');
});

/* ---------------- exportação ---------------- */

test('csvPlano sai com BOM, ponto e vírgula e uma linha por título', function () {
  var p = planoDoExemplo();
  var texto = COB.csvPlano(p);
  assert.equal(texto.charAt(0), BOM);
  var linhas = texto.replace(BOM, '').trim().split('\r\n');
  assert.equal(linhas[0], 'Cliente;Telefone;Documento;Vencimento;Dias;Valor;Etapa;Etiqueta;Mensagem;Link');
  assert.equal(linhas.length, 19);
});

test('csvPlano separa a chave da etapa do texto humano', function () {
  var linhas = COB.csvPlano(planoDoExemplo()).replace(BOM, '').trim().split('\r\n');
  assert.ok(linhas[1].indexOf(';atraso;em atraso;') > 0, linhas[1]);
});
