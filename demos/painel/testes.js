var test = require('node:test');
var assert = require('node:assert/strict');
var PAINEL = require('./nucleo.js');

var BOM = String.fromCharCode(0xFEFF);

var CAB = ['ID', 'Data', 'Vendedor', 'Valor', 'Quantidade'];
var LINHAS = [
  ['1', '10/01/2026', 'Ana', '100,00', '2'],
  ['2', '20/01/2026', 'Bruno', '50,00', '1'],
  ['3', '05/02/2026', 'Ana', '200,00', '4'],
  ['4', '18/02/2026', 'Carla', '150,00', '3'],
  ['5', '02/03/2026', 'Ana', '300,00', '6'],
  ['6', '09/03/2026', 'Bruno', '100,00', '2']
];

function porNome(perfil, nome) {
  var achado = null;
  perfil.forEach(function (p) { if (p.nome === nome) achado = p; });
  return achado;
}

/* ---------------- perfilar ---------------- */

test('perfilar reconhece data, número, categoria e id', function () {
  var perfil = PAINEL.perfilar(CAB, LINHAS);
  assert.equal(perfil.length, 5);
  assert.equal(porNome(perfil, 'ID').tipo, 'id');
  assert.equal(porNome(perfil, 'Data').tipo, 'data');
  assert.equal(porNome(perfil, 'Vendedor').tipo, 'categoria');
  assert.equal(porNome(perfil, 'Valor').tipo, 'numero');
  assert.equal(porNome(perfil, 'Quantidade').tipo, 'numero');
});

test('perfilar soma, faz a média e guarda o intervalo da coluna numérica', function () {
  var valor = porNome(PAINEL.perfilar(CAB, LINHAS), 'Valor');
  assert.equal(valor.indice, 3);
  assert.equal(valor.soma, 900);
  assert.equal(valor.media, 150);
  assert.equal(valor.min, 50);
  assert.equal(valor.max, 300);
});

test('perfilar conta distintos, vazios e os valores mais frequentes', function () {
  var linhas = LINHAS.map(function (l) { return l.slice(); });
  linhas[1] = ['2', '20/01/2026', '', '50,00', '1'];
  var vendedor = porNome(PAINEL.perfilar(CAB, linhas), 'Vendedor');
  assert.equal(vendedor.vazios, 1);
  assert.equal(vendedor.distintos, 3);
  assert.equal(vendedor.top[0].valor, 'Ana');
  assert.equal(vendedor.top[0].n, 3);
});

test('perfilar guarda a primeira e a última data da coluna de data', function () {
  var data = porNome(PAINEL.perfilar(CAB, LINHAS), 'Data');
  assert.equal(data.min, '2026-01-10');
  assert.equal(data.max, '2026-03-09');
});

test('perfilar desempata os mais frequentes pela ordem de aparição', function () {
  var linhas = [['Zulu'], ['Alfa'], ['Bravo'], ['Alfa'], ['Charlie'], ['Delta'], ['Eco']];
  var coluna = PAINEL.perfilar(['Etapa'], linhas)[0];
  assert.deepEqual(coluna.top.map(function (t) { return t.valor; }), ['Alfa', 'Zulu', 'Bravo', 'Charlie', 'Delta']);
  assert.deepEqual(coluna.top.map(function (t) { return t.n; }), [2, 1, 1, 1, 1]);
});

test('perfilar marca como id a coluna com cabeçalho Código, mesmo com valor repetido', function () {
  var linhas = [['A-10'], ['A-10'], ['B-20'], ['B-20'], ['C-30']];
  var coluna = PAINEL.perfilar(['Código'], linhas)[0];
  assert.equal(coluna.tipo, 'id');
});

test('perfilar não fica quadrático em coluna de valores todos distintos', function () {
  var n = 20000, linhas = [], i;
  for (i = 0; i < n; i++) linhas.push(['PED-' + (1000000 + i)]);
  var inicio = Date.now();
  var coluna = PAINEL.perfilar(['Pedido'], linhas)[0];
  var gasto = Date.now() - inicio;
  assert.equal(coluna.distintos, n);
  assert.deepEqual(coluna.top.map(function (t) { return t.valor; }), ['PED-1000000', 'PED-1000001', 'PED-1000002', 'PED-1000003', 'PED-1000004']);
  assert.ok(gasto < 1000, 'perfilar de ' + n + ' valores distintos levou ' + gasto + ' ms');
});

/* ---------------- escolherPadrao ---------------- */

test('escolherPadrao prefere Valor a Quantidade e ignora a coluna de id', function () {
  var escolha = PAINEL.escolherPadrao(PAINEL.perfilar(CAB, LINHAS));
  assert.deepEqual(escolha, { metrica: 3, tempo: 1, dimensao: 2 });
});

test('escolherPadrao devolve -1 quando não há coluna do tipo', function () {
  var perfil = PAINEL.perfilar(['Observação'], [['entrega combinada para a manhã'], ['cliente pediu nota separada'], ['retirada no balcão pelo motorista'], ['trocar o produto avariado']]);
  assert.deepEqual(PAINEL.escolherPadrao(perfil), { metrica: -1, tempo: -1, dimensao: -1 });
});

/* ---------------- porPeriodo ---------------- */

test('porPeriodo agrega por mês e sai em ordem', function () {
  var series = PAINEL.porPeriodo(LINHAS, 1, 3, 'mes');
  assert.deepEqual(series.map(function (p) { return p.chave; }), ['2026-01', '2026-02', '2026-03']);
  assert.deepEqual(series.map(function (p) { return p.rotulo; }), ['jan/26', 'fev/26', 'mar/26']);
  assert.deepEqual(series.map(function (p) { return p.soma; }), [150, 350, 400]);
  assert.deepEqual(series.map(function (p) { return p.n; }), [2, 2, 2]);
});

test('porPeriodo por semana começa na segunda-feira', function () {
  var linhas = [
    ['05/01/2026', '10,00'],
    ['07/01/2026', '20,00'],
    ['11/01/2026', '30,00'],
    ['12/01/2026', '40,00']
  ];
  var series = PAINEL.porPeriodo(linhas, 0, 1, 'semana');
  assert.deepEqual(series.map(function (p) { return p.chave; }), ['2026-01-05', '2026-01-12']);
  assert.deepEqual(series.map(function (p) { return p.soma; }), [60, 40]);
});

test('porPeriodo por dia mantém uma linha por data', function () {
  var series = PAINEL.porPeriodo(LINHAS, 1, 3, 'dia');
  assert.equal(series.length, 6);
  assert.equal(series[0].chave, '2026-01-10');
  assert.equal(series[0].rotulo, '10/01');
});

test('porPeriodo com métrica -1 conta linhas', function () {
  var series = PAINEL.porPeriodo(LINHAS, 1, -1, 'mes');
  assert.deepEqual(series.map(function (p) { return p.soma; }), [2, 2, 2]);
  assert.deepEqual(series.map(function (p) { return p.n; }), [2, 2, 2]);
});

test('porPeriodo lê valor em real com milhar e ignora linha sem data', function () {
  var linhas = [
    ['10/01/2026', 'R$ 1.234,56'],
    ['20/01/2026', '(12,50)'],
    ['', 'R$ 999,00']
  ];
  var series = PAINEL.porPeriodo(linhas, 0, 1, 'mes');
  assert.equal(series.length, 1);
  assert.equal(series[0].n, 2);
  assert.ok(Math.abs(series[0].soma - 1222.06) < 0.001);
});

/* ---------------- porCategoria ---------------- */

test('porCategoria agrupa, ordena por soma e a porcentagem fecha em 100', function () {
  var itens = PAINEL.porCategoria(LINHAS, 2, 3, 8);
  assert.deepEqual(itens.map(function (i) { return i.rotulo; }), ['Ana', 'Bruno', 'Carla']);
  assert.deepEqual(itens.map(function (i) { return i.soma; }), [600, 150, 150]);
  var pct = itens.reduce(function (s, i) { return s + i.pct; }, 0);
  assert.ok(Math.abs(pct - 100) < 0.1, 'somou ' + pct);
});

test('porCategoria junta o resto em Outros quando passa do top', function () {
  var itens = PAINEL.porCategoria(LINHAS, 2, 3, 2);
  assert.equal(itens.length, 3);
  assert.equal(itens[2].rotulo, 'Outros');
  assert.equal(itens[2].soma, 150);
  assert.equal(itens[2].n, 1);
  var pct = itens.reduce(function (s, i) { return s + i.pct; }, 0);
  assert.ok(Math.abs(pct - 100) < 0.1, 'somou ' + pct);
});

/* ---------------- kpis ---------------- */

test('kpis soma, faz a média, acha o melhor período e o líder', function () {
  var k = PAINEL.kpis(LINHAS, { metrica: 3, tempo: 1, dimensao: 2, granularidade: 'mes' });
  assert.equal(k.total, 900);
  assert.equal(k.registros, 6);
  assert.equal(k.media, 150);
  assert.equal(k.de, '2026-01-10');
  assert.equal(k.ate, '2026-03-09');
  assert.equal(k.melhor.rotulo, 'mar/26');
  assert.equal(k.melhor.soma, 400);
  assert.equal(k.pior.rotulo, 'jan/26');
  assert.equal(k.lider.rotulo, 'Ana');
  assert.ok(Math.abs(k.lider.pct - 66.6667) < 0.01);
});

test('kpis calcula a variação do último período contra o anterior', function () {
  var k = PAINEL.kpis(LINHAS, { metrica: 3, tempo: 1, dimensao: 2, granularidade: 'mes' });
  assert.ok(Math.abs(k.variacao - 14.2857) < 0.01, 'variação ' + k.variacao);
});

test('kpis devolve variação null com um período só', function () {
  var k = PAINEL.kpis(LINHAS.slice(0, 2), { metrica: 3, tempo: 1, dimensao: 2, granularidade: 'mes' });
  assert.equal(k.variacao, null);
  assert.equal(k.melhor.rotulo, 'jan/26');
});

test('kpis separa "sem período anterior" de "o anterior fechou em zero"', function () {
  var linhas = [
    ['10/01/2026', '0,00'],
    ['20/01/2026', '0,00'],
    ['05/02/2026', '300,00']
  ];
  var zerado = PAINEL.kpis(linhas, { metrica: 1, tempo: 0, dimensao: -1, granularidade: 'mes' });
  assert.equal(zerado.variacao, null);
  assert.equal(zerado.variacaoMotivo, 'anterior zero');

  var umSo = PAINEL.kpis(linhas.slice(0, 2), { metrica: 1, tempo: 0, dimensao: -1, granularidade: 'mes' });
  assert.equal(umSo.variacao, null);
  assert.equal(umSo.variacaoMotivo, 'sem anterior');

  var comparavel = PAINEL.kpis(LINHAS, { metrica: 3, tempo: 1, dimensao: 2, granularidade: 'mes' });
  assert.equal(comparavel.variacaoMotivo, '');
});

/* ---------------- gráficos ---------------- */

test('graficoLinha devolve svg com um ponto por período', function () {
  var series = PAINEL.porPeriodo(LINHAS, 1, 3, 'mes');
  var svg = PAINEL.graficoLinha(series);
  assert.ok(svg.indexOf('<svg') === 0, 'não começa com <svg: ' + svg.slice(0, 40));
  assert.equal((svg.match(/<circle/g) || []).length, series.length);
  assert.ok(svg.indexOf('viewBox') > 0);
  assert.ok(svg.indexOf('mar/26') > 0);
});

test('graficoLinha escapa o rótulo que chega com HTML', function () {
  var svg = PAINEL.graficoLinha([{ chave: 'a', rotulo: '<b>x</b>', soma: 10, n: 1 }, { chave: 'b', rotulo: 'y', soma: 20, n: 1 }]);
  assert.ok(svg.indexOf('<b>x</b>') < 0);
  assert.ok(svg.indexOf('&lt;b&gt;x&lt;/b&gt;') > 0);
});

test('graficoBarras devolve uma barra por item', function () {
  var series = PAINEL.porPeriodo(LINHAS, 1, 3, 'mes');
  var svg = PAINEL.graficoBarras(series);
  assert.equal((svg.match(/<rect/g) || []).length, series.length);
});

test('graficoLinha afasta os rótulos do eixo X e sempre mostra o último', function () {
  var series = [], i;
  for (i = 1; i <= 12; i++) series.push({ chave: 'k' + i, rotulo: 'p' + i, soma: i * 10, n: 1 });
  var svg = PAINEL.graficoLinha(series, { largura: 320, altura: 200 });
  var rotulos = svg.match(/<text class="eixo x"/g) || [];
  var largTela = 320 - 62 - 14;
  assert.ok(rotulos.length > 0 && rotulos.length <= Math.floor(largTela / 48) + 1,
    'rótulos do eixo X: ' + rotulos.length);
  assert.ok(/text-anchor="end">p12</.test(svg), 'o último rótulo sumiu ou não ancorou no fim');
});

test('curto encurta milhar e milhão e não inventa casa decimal', function () {
  assert.equal(PAINEL.curto(1234), '1,2 mil');
  assert.equal(PAINEL.curto(3400000), '3,4 mi');
  assert.equal(PAINEL.curto(950), '950');
});

test('graficoBarrasH devolve HTML com uma linha por item, rótulo e porcentagem', function () {
  var itens = PAINEL.porCategoria(LINHAS, 2, 3, 8);
  var html = PAINEL.graficoBarrasH(itens);
  assert.equal(html.indexOf('<svg'), -1, 'ainda saiu SVG');
  assert.equal((html.match(/class="barraH"/g) || []).length, itens.length);
  assert.equal((html.match(/<i /g) || []).length, itens.length);
  assert.ok(html.indexOf('Ana') > 0);
  assert.ok(html.indexOf('%') > 0);
});

test('graficoBarrasH escapa o rótulo que chega com HTML', function () {
  var html = PAINEL.graficoBarrasH([{ rotulo: '<b>x</b>', soma: 10, n: 1, pct: 100 }]);
  assert.equal(html.indexOf('<b>x</b>'), -1);
  assert.ok(html.indexOf('&lt;b&gt;x&lt;/b&gt;') > 0);
});

test('resumoCategorias só fala em Outros quando Outros existe', function () {
  var comOutros = PAINEL.porCategoria(LINHAS, 2, 3, 2);
  assert.deepEqual(PAINEL.resumoCategorias(comOutros), { grupos: 2, nota: 'as 2 maiores, o resto somado em Outros' });
  var todas = PAINEL.porCategoria(LINHAS, 2, 3, 8);
  assert.deepEqual(PAINEL.resumoCategorias(todas), { grupos: 3, nota: 'todas as 3' });
});

/* ---------------- exportação ---------------- */

test('csvAgregado sai com BOM, ponto e vírgula e as duas seções', function () {
  var periodos = PAINEL.porPeriodo(LINHAS, 1, 3, 'mes');
  var categorias = PAINEL.porCategoria(LINHAS, 2, 3, 8);
  var texto = PAINEL.csvAgregado(periodos, categorias);
  assert.equal(texto.charCodeAt(0), 0xFEFF);
  assert.ok(texto.indexOf('Período;') > 0 || texto.slice(1).indexOf('Período;') === 0);
  assert.ok(texto.indexOf('jan/26;150,00;2') > 0);
  assert.ok(texto.indexOf('Ana;600,00;3') > 0);
  assert.equal(texto.indexOf(BOM, 1), -1);
});

test('tsvAgregado leva as mesmas linhas do csv, com tabulação e sem BOM', function () {
  var periodos = PAINEL.porPeriodo(LINHAS, 1, 3, 'mes');
  var categorias = PAINEL.porCategoria(LINHAS, 2, 3, 8);
  var tsv = PAINEL.tsvAgregado(periodos, categorias);
  var csv = PAINEL.csvAgregado(periodos, categorias);
  assert.equal(tsv.indexOf(BOM), -1);
  assert.ok(tsv.indexOf('jan/26\t150,00\t2') > 0, tsv);
  assert.ok(tsv.indexOf('Ana\t600,00\t3') > 0, tsv);
  assert.equal(tsv.split('\r\n').length, csv.split('\r\n').length);
});

test('métrica -1 conta linhas e sai sem casas decimais', function () {
  var escolha = { metrica: -1, tempo: 1, dimensao: 2, granularidade: 'mes' };
  var k = PAINEL.kpis(LINHAS, escolha);
  assert.equal(k.total, 6);

  var texto = PAINEL.resumoTexto(k, escolha, PAINEL.perfilar(CAB, LINHAS));
  assert.equal(texto.indexOf('Linhas: 6 em 6 registros'), 0, texto);
  assert.equal(texto.indexOf(',00'), -1, texto);

  var csv = PAINEL.csvAgregado(
    PAINEL.porPeriodo(LINHAS, 1, -1, 'mes'),
    PAINEL.porCategoria(LINHAS, 2, -1, 8),
    { inteiro: true });
  assert.ok(csv.indexOf('jan/26;2;2') > 0, csv);
  assert.equal(PAINEL.formatar(1234, true), '1.234');
  assert.equal(PAINEL.formatar(1234, false), '1.234,00');
});

test('resumoTexto cita o total, o melhor período e o líder', function () {
  var perfil = PAINEL.perfilar(CAB, LINHAS);
  var escolha = PAINEL.escolherPadrao(perfil);
  var texto = PAINEL.resumoTexto(PAINEL.kpis(LINHAS, escolha), escolha, perfil);
  assert.ok(texto.indexOf('900,00') > 0, texto);
  assert.ok(texto.indexOf('mar/26') > 0, texto);
  assert.ok(texto.indexOf('Ana') > 0, texto);
  assert.ok(texto.indexOf('6 registros') > 0, texto);
});

/* ---------------- exemplo ---------------- */

test('exemplo traz 240 linhas em 12 meses até hoje', function () {
  var ex = PAINEL.exemplo('2026-09-04');
  assert.equal(ex.nome, 'vendas-exemplo.csv');
  assert.deepEqual(ex.cabecalho, ['Data', 'Vendedor', 'Região', 'Produto', 'Quantidade', 'Valor']);
  assert.equal(ex.linhas.length, 240);
  var meses = {};
  ex.linhas.forEach(function (l) {
    var iso = require('../comum/comum.js').data(l[0]);
    assert.ok(iso, 'data ilegível: ' + l[0]);
    assert.ok(iso <= '2026-09-04', 'data no futuro: ' + iso);
    meses[iso.slice(0, 7)] = true;
  });
  assert.equal(Object.keys(meses).length, 12);
});

test('exemplo é determinístico para a mesma data', function () {
  assert.deepEqual(PAINEL.exemplo('2026-09-04').linhas, PAINEL.exemplo('2026-09-04').linhas);
  assert.notDeepEqual(PAINEL.exemplo('2026-09-04').linhas, PAINEL.exemplo('2026-05-20').linhas);
});

test('o exemplo passa pelo caminho completo: perfil, escolha e números', function () {
  var ex = PAINEL.exemplo('2026-09-04');
  var perfil = PAINEL.perfilar(ex.cabecalho, ex.linhas);
  var escolha = PAINEL.escolherPadrao(perfil);
  assert.equal(perfil[escolha.metrica].nome, 'Valor');
  assert.equal(perfil[escolha.tempo].nome, 'Data');
  assert.equal(perfil[escolha.dimensao].nome, 'Vendedor');
  var k = PAINEL.kpis(ex.linhas, escolha);
  assert.equal(k.registros, 240);
  assert.ok(k.total > 0);
  assert.equal(PAINEL.porPeriodo(ex.linhas, escolha.tempo, escolha.metrica, 'mes').length, 12);
  assert.ok(k.lider.pct > 0 && k.lider.pct < 100);
});
