var test = require('node:test');
var assert = require('node:assert/strict');
var COMUM = require('./comum.js');

var BOM = String.fromCharCode(0xFEFF);

/* ---------------- texto ---------------- */

test('limpo apara e aceita null', function () {
  assert.equal(COMUM.limpo('  ola  '), 'ola');
  assert.equal(COMUM.limpo(null), '');
  assert.equal(COMUM.limpo(undefined), '');
  assert.equal(COMUM.limpo(12), '12');
});

test('semAcento remove diacríticos', function () {
  assert.equal(COMUM.semAcento('Guarujá São João'), 'Guaruja Sao Joao');
  assert.equal(COMUM.semAcento('Refrigeração'), 'Refrigeracao');
});

test('esc escapa os cinco caracteres de HTML', function () {
  assert.equal(COMUM.esc('<a href="x">Tom & Jerry\'s</a>'),
    '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
});

test('plural escolha singular e plural', function () {
  assert.equal(COMUM.plural(1, 'nota', 'notas'), '1 nota');
  assert.equal(COMUM.plural(3, 'nota', 'notas'), '3 notas');
  assert.equal(COMUM.plural(0, 'nota', 'notas'), '0 notas');
});

/* ---------------- numero ---------------- */

test('numero lê pt-BR com milhar e decimal', function () {
  assert.equal(COMUM.numero('1.234,56'), 1234.56);
});

test('numero ignora R$ e espaços', function () {
  assert.equal(COMUM.numero('R$ 1.234,56'), 1234.56);
  assert.equal(COMUM.numero('R$ 12,00'), 12);
});

test('numero aceita negativo com sinal', function () {
  assert.equal(COMUM.numero('-12,5'), -12.5);
});

test('numero trata parênteses como negativo', function () {
  assert.equal(COMUM.numero('(12,50)'), -12.5);
  assert.equal(COMUM.numero('(R$ 1.234,56)'), -1234.56);
});

test('numero lê ponto decimal sem milhar', function () {
  assert.equal(COMUM.numero('1234.56'), 1234.56);
});

test('numero lê formato en-US com os dois separadores', function () {
  assert.equal(COMUM.numero('1,234.56'), 1234.56);
});

test('numero descarta o sinal de porcentagem', function () {
  assert.equal(COMUM.numero('12%'), 12);
});

test('numero devolve o próprio number', function () {
  assert.equal(COMUM.numero(1234.56), 1234.56);
  assert.equal(COMUM.numero(0), 0);
  assert.equal(COMUM.numero(NaN), null);
});

test('numero devolve null para vazio e lixo', function () {
  assert.equal(COMUM.numero(''), null);
  assert.equal(COMUM.numero('   '), null);
  assert.equal(COMUM.numero(null), null);
  assert.equal(COMUM.numero('abc'), null);
  assert.equal(COMUM.numero('12/03/2026'), null);
});

test('numero trata ponto único de 3 dígitos como milhar', function () {
  assert.equal(COMUM.numero('1.234'), 1234);
});

test('numero trata pontos repetidos como milhar', function () {
  assert.equal(COMUM.numero('1.234.567'), 1234567);
});

/* ---------------- data ---------------- */

test('data lê dd/mm/aaaa', function () {
  assert.equal(COMUM.data('05/09/2026'), '2026-09-05');
  assert.equal(COMUM.data('5/9/2026'), '2026-09-05');
});

test('data lê dd/mm/aa como século 20aa', function () {
  assert.equal(COMUM.data('05/09/26'), '2026-09-05');
});

test('data lê dd-mm-aaaa', function () {
  assert.equal(COMUM.data('05-09-2026'), '2026-09-05');
});

test('data lê dd.mm.aaaa', function () {
  assert.equal(COMUM.data('05.09.2026'), '2026-09-05');
});

test('data lê aaaa-mm-dd', function () {
  assert.equal(COMUM.data('2026-09-05'), '2026-09-05');
});

test('data lê ISO com hora e fuso', function () {
  assert.equal(COMUM.data('2026-09-05T13:45:00-03:00'), '2026-09-05');
});

test('data lê aaaammdd', function () {
  assert.equal(COMUM.data('20260905'), '2026-09-05');
});

test('data lê objeto Date pela hora local', function () {
  assert.equal(COMUM.data(new Date(2026, 8, 5, 23, 30)), '2026-09-05');
});

test('data lê serial do Excel', function () {
  assert.equal(COMUM.data(45292), '2024-01-01');
});

test('data recusa dia impossível', function () {
  assert.equal(COMUM.data('31/02/2024'), '');
  assert.equal(COMUM.data('2026-13-01'), '');
  assert.equal(COMUM.data('30/02/2026'), '');
});

test('data recusa lixo e vazio', function () {
  assert.equal(COMUM.data(''), '');
  assert.equal(COMUM.data('abc'), '');
  assert.equal(COMUM.data(null), '');
});

/* ---------------- calendário ---------------- */

test('hojeISO devolve AAAA-MM-DD', function () {
  assert.match(COMUM.hojeISO(), /^\d{4}-\d{2}-\d{2}$/);
});

test('maisDias atravessa mês e ano', function () {
  assert.equal(COMUM.maisDias('2026-01-31', 1), '2026-02-01');
  assert.equal(COMUM.maisDias('2026-12-31', 1), '2027-01-01');
  assert.equal(COMUM.maisDias('2026-03-01', -1), '2026-02-28');
});

test('diasEntre conta b menos a', function () {
  assert.equal(COMUM.diasEntre('2026-09-01', '2026-09-05'), 4);
  assert.equal(COMUM.diasEntre('2026-09-05', '2026-09-01'), -4);
  assert.equal(COMUM.diasEntre('2026-09-05', '2026-09-05'), 0);
});

test('diaSemana devolve 0 para domingo', function () {
  assert.equal(COMUM.diaSemana('2026-09-05'), 6);
  assert.equal(COMUM.diaSemana('2026-09-06'), 0);
});

/* ---------------- formatação ---------------- */

test('formatarValor usa milhar com ponto e decimal com vírgula', function () {
  assert.equal(COMUM.formatarValor(1234.56), '1.234,56');
  assert.equal(COMUM.formatarValor(0), '0,00');
});

test('formatarData converte ISO em dd/mm/aaaa', function () {
  assert.equal(COMUM.formatarData('2026-09-05'), '05/09/2026');
  assert.equal(COMUM.formatarData(''), '');
});

test('formatarDoc aplica máscara de CPF e de CNPJ', function () {
  assert.equal(COMUM.formatarDoc('52998224725'), '529.982.247-25');
  assert.equal(COMUM.formatarDoc('11222333000181'), '11.222.333/0001-81');
});

test('formatarTelefone com 11 dígitos vira celular', function () {
  assert.equal(COMUM.formatarTelefone('11912345678'), '(11) 91234-5678');
});

test('formatarTelefone com 10 dígitos vira fixo', function () {
  assert.equal(COMUM.formatarTelefone('(11) 3123-4567'), '(11) 3123-4567');
  assert.equal(COMUM.formatarTelefone('1131234567'), '(11) 3123-4567');
});

test('formatarTelefone com tamanho estranho devolve os dígitos', function () {
  assert.equal(COMUM.formatarTelefone('12345'), '12345');
  assert.equal(COMUM.formatarTelefone(''), '');
});

/* ---------------- CSV ---------------- */

test('lerCSV pula BOM e respeita aspas', function () {
  var r = COMUM.lerCSV(BOM + 'Nome;Obs\r\n"Silva; Cia";"diz ""oi"""\r\n');
  assert.equal(r.separador, ';');
  assert.deepEqual(r.cabecalho, ['Nome', 'Obs']);
  assert.deepEqual(r.linhas, [['Silva; Cia', 'diz "oi"']]);
});

test('lerCSV detecta vírgula como separador', function () {
  var r = COMUM.lerCSV('a,b,c\n1,2,3\n');
  assert.equal(r.separador, ',');
  assert.deepEqual(r.linhas, [['1', '2', '3']]);
});

test('lerCSV completa linha curta e descarta linha vazia', function () {
  var r = COMUM.lerCSV('a;b;c\n1;2\n\n4;5;6\n');
  assert.deepEqual(r.linhas, [['1', '2', ''], ['4', '5', '6']]);
});

test('decodificar lê utf-8', function () {
  assert.equal(COMUM.decodificar(new Uint8Array([0x61, 0xC3, 0xA7, 0xC3, 0xA3, 0x6F])), 'ação');
});

test('decodificar cai para windows-1252 quando utf-8 falha', function () {
  assert.equal(COMUM.decodificar(new Uint8Array([0x61, 0xE7, 0xE3, 0x6F])), 'ação');
});

/* ---------------- normalização ---------------- */

test('normalizarDoc recupera zero à esquerda só na coluna de documento', function () {
  assert.equal(COMUM.normalizarDoc('1847263000158', true), '01847263000158');
  assert.equal(COMUM.normalizarDoc('1847263000158', false), '');
  assert.equal(COMUM.normalizarDoc('91.847.263/0001-58'), '91847263000158');
});

test('normalizarDoc descarta dígitos repetidos', function () {
  assert.equal(COMUM.normalizarDoc('11111111111'), '');
  assert.equal(COMUM.normalizarDoc('123'), '');
});

test('normalizarTelefone tira 55 e zero de operadora', function () {
  assert.equal(COMUM.normalizarTelefone('+55 (13) 99123-4567'), '13991234567');
  assert.equal(COMUM.normalizarTelefone('013991234567'), '13991234567');
  assert.equal(COMUM.normalizarTelefone('123'), '');
});

test('mesmoTelefone casa número sem DDD com o final do outro', function () {
  assert.equal(COMUM.mesmoTelefone('13991234567', '991234567'), true);
  assert.equal(COMUM.mesmoTelefone('13991234567', '13991234567'), true);
  assert.equal(COMUM.mesmoTelefone('13991234567', '13991234500'), false);
  assert.equal(COMUM.mesmoTelefone('', '991234567'), false);
});

test('normalizarEmail baixa a caixa e exige arroba', function () {
  assert.equal(COMUM.normalizarEmail('  MARIA@Gmail.COM '), 'maria@gmail.com');
  assert.equal(COMUM.normalizarEmail('sem-arroba'), '');
});

test('normalizarNome tira acento, sufixo e pontuação', function () {
  assert.equal(COMUM.normalizarNome('Refrigeração Maré Alta Ltda.'), 'REFRIGERACAO MARE ALTA');
  assert.equal(COMUM.chaveNome('Refrigeração Maré Alta Ltda.'), 'ALTA MARE REFRIGERACAO');
});

test('similaridade reconhece o mesmo nome em ordem diferente', function () {
  assert.equal(COMUM.similaridade('Padaria Central LTDA', 'CENTRAL PADARIA'), 1);
  assert.ok(COMUM.similaridade('Jose Antonio Ribeiro', 'Jose Antoni Ribeiro') > 0.9);
  assert.ok(COMUM.similaridade('Padaria Central', 'Hotel Enseada Azul') < 0.5);
});

test('levenshtein conta as edições', function () {
  assert.equal(COMUM.levenshtein('casa', 'casa'), 0);
  assert.equal(COMUM.levenshtein('casa', 'caso'), 1);
  assert.equal(COMUM.levenshtein('', 'abc'), 3);
});

/* ---------------- documentos ---------------- */

test('validarCPF aceita CPF com DV correto', function () {
  assert.equal(COMUM.validarCPF('529.982.247-25'), true);
  assert.equal(COMUM.validarCPF('52998224725'), true);
  assert.equal(COMUM.validarCPF('111.444.777-35'), true);
});

test('validarCPF recusa DV errado, repetidos e tamanho errado', function () {
  assert.equal(COMUM.validarCPF('111.111.111-11'), false);
  assert.equal(COMUM.validarCPF('529.982.247-26'), false);
  assert.equal(COMUM.validarCPF('1234567890'), false);
  assert.equal(COMUM.validarCPF(''), false);
});

test('validarCNPJ aceita CNPJ com DV correto', function () {
  assert.equal(COMUM.validarCNPJ('11.222.333/0001-81'), true);
  assert.equal(COMUM.validarCNPJ('11222333000181'), true);
});

test('validarCNPJ recusa DV errado e repetidos', function () {
  assert.equal(COMUM.validarCNPJ('11.222.333/0001-82'), false);
  assert.equal(COMUM.validarCNPJ('11.111.111/1111-11'), false);
  assert.equal(COMUM.validarCNPJ('112223330001'), false);
});

test('validarDoc diz qual é o documento', function () {
  assert.equal(COMUM.validarDoc('529.982.247-25'), 'cpf');
  assert.equal(COMUM.validarDoc('11.222.333/0001-81'), 'cnpj');
  assert.equal(COMUM.validarDoc('12345678901'), '');
  assert.equal(COMUM.validarDoc(''), '');
});

/* ---------------- tabelas de referência ---------------- */

test('DDDS tem os DDDs válidos e não os inválidos', function () {
  assert.equal(COMUM.DDDS['11'], true);
  assert.equal(COMUM.DDDS['13'], true);
  assert.equal(COMUM.DDDS['99'], true);
  assert.equal(COMUM.DDDS['20'], undefined);
  assert.equal(COMUM.DDDS['23'], undefined);
  assert.equal(COMUM.DDDS['10'], undefined);
  assert.equal(COMUM.DDDS['72'], undefined);
});

test('UFS tem 27 siglas e NOME_UF traz o nome com acento', function () {
  assert.equal(COMUM.UFS.length, 27);
  assert.ok(COMUM.UFS.indexOf('SP') >= 0);
  assert.equal(COMUM.NOME_UF.SP, 'São Paulo');
  assert.equal(COMUM.NOME_UF.CE, 'Ceará');
  assert.equal(COMUM.NOME_UF.ES, 'Espírito Santo');
  assert.equal(COMUM.NOME_UF.PR, 'Paraná');
});

/* ---------------- tipoColuna ---------------- */

test('tipoColuna com tudo vazio', function () {
  assert.equal(COMUM.tipoColuna('Coluna', ['', '   ', null]), 'vazio');
});

test('tipoColuna reconhece data', function () {
  assert.equal(COMUM.tipoColuna('Emissão', ['01/02/2026', '15/03/2026', '', '2026-04-01']), 'data');
});

test('tipoColuna reconhece numero', function () {
  assert.equal(COMUM.tipoColuna('Valor', ['1.234,56', '10,00', 'R$ 5,00', '-3,20']), 'numero');
});

test('tipoColuna reconhece documento', function () {
  assert.equal(COMUM.tipoColuna('CPF/CNPJ', ['529.982.247-25', '111.444.777-35', '11.222.333/0001-81']), 'documento');
});

test('tipoColuna reconhece email', function () {
  assert.equal(COMUM.tipoColuna('Contato', ['a@b.com', 'maria.souza@gmail.com', 'x@y.com.br']), 'email');
});

test('tipoColuna reconhece telefone', function () {
  assert.equal(COMUM.tipoColuna('Celular', ['(11) 91234-5678', '(13) 3222-1111', '+55 13 99123-4567']), 'telefone');
});

test('tipoColuna reconhece cep', function () {
  assert.equal(COMUM.tipoColuna('CEP', ['11013-151', '01310100', '11701-000']), 'cep');
});

test('tipoColuna reconhece categoria', function () {
  assert.equal(COMUM.tipoColuna('Status', ['Pago', 'Aberto', 'Pago', 'Aberto', 'Pago', 'Vencido']), 'categoria');
});

test('tipoColuna cai em texto quando tudo é distinto', function () {
  assert.equal(COMUM.tipoColuna('Observação', [
    'entrega combinada para a manhã', 'cliente pediu nota separada',
    'retirada no balcao pelo motorista', 'trocar o produto avariado']), 'texto');
});

test('tipoColuna usa o cabeçalho para desempatar', function () {
  assert.equal(COMUM.tipoColuna('Telefone', ['11912345678', '13991234567']), 'telefone');
  assert.equal(COMUM.tipoColuna('Documento', ['11912345678', '13991234567']), 'documento');
});

/* ---------------- exportação ---------------- */

test('csv sai com BOM, ponto e vírgula e CRLF', function () {
  var s = COMUM.csv([['Nome', 'Valor'], ['Maré Alta', '1.234,56']]);
  assert.equal(s.charCodeAt(0), 0xFEFF);
  assert.equal(s.slice(1), 'Nome;Valor\r\nMaré Alta;1.234,56\r\n');
});

test('csv põe entre aspas a célula com ponto e vírgula, aspas ou quebra', function () {
  var s = COMUM.csv([['A;B', 'diz "oi"', 'linha\nnova']]).slice(1);
  assert.equal(s, '"A;B";"diz ""oi""";"linha\nnova"\r\n');
});

test('csv aceita número na célula', function () {
  assert.equal(COMUM.csv([['a', 12, null]]).slice(1), 'a;12;\r\n');
});

test('tsv troca tab e quebra por espaço', function () {
  assert.equal(COMUM.tsv([['a\tb', 'c\nd'], ['1', '2']]), 'a b\tc d\r\n1\t2\r\n');
});

/* ---------------- lcg ---------------- */

test('lcg é determinístico para a mesma semente', function () {
  var a = COMUM.lcg(7), b = COMUM.lcg(7), c = COMUM.lcg(8);
  var sa = [a(), a(), a(), a(), a()];
  var sb = [b(), b(), b(), b(), b()];
  var sc = [c(), c(), c(), c(), c()];
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
});

test('lcg fica dentro de [0,1) e varia', function () {
  var r = COMUM.lcg(42), vistos = {}, i, v;
  for (i = 0; i < 500; i++) {
    v = r();
    assert.ok(v >= 0 && v < 1, 'fora do intervalo: ' + v);
    vistos[v] = true;
  }
  assert.ok(Object.keys(vistos).length > 400);
});
