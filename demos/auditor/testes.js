var test = require('node:test');
var assert = require('node:assert/strict');
var AUD = require('./nucleo.js');
var COMUM = require('../comum/comum.js');

var BOM = String.fromCharCode(0xFEFF);
var HOJE = '2026-09-05';

/* ---------------- documento ---------------- */

test('verDocumento aceita CPF com máscara e DV certo', function () {
  var r = AUD.verDocumento('529.982.247-25');
  assert.equal(r.situacao, 'ok');
  assert.equal(r.corrigido, '529.982.247-25');
});

test('verDocumento formata CPF em dígitos puros', function () {
  var r = AUD.verDocumento('22713583020');
  assert.equal(r.situacao, 'corrigido');
  assert.equal(r.corrigido, '227.135.830-20');
  assert.equal(r.motivo, 'formatado');
});

test('verDocumento recupera o zero à esquerda do CPF', function () {
  var r = AUD.verDocumento('4308454484');
  assert.equal(r.situacao, 'corrigido');
  assert.equal(r.corrigido, '043.084.544-84');
  assert.equal(r.motivo, 'zero à esquerda recuperado');
});

test('verDocumento recupera o zero à esquerda do CNPJ', function () {
  var r = AUD.verDocumento('5740936000172');
  assert.equal(r.situacao, 'corrigido');
  assert.equal(r.corrigido, '05.740.936/0001-72');
  assert.equal(r.motivo, 'zero à esquerda recuperado');
});

test('verDocumento manda revisar quando o DV não bate', function () {
  var r = AUD.verDocumento('529.982.247-26');
  assert.equal(r.situacao, 'revisar');
  assert.equal(r.motivo, 'dígito verificador não bate');
});

test('verDocumento manda revisar letra e tamanho errado', function () {
  assert.equal(AUD.verDocumento('não tem').situacao, 'revisar');
  assert.equal(AUD.verDocumento('12345').situacao, 'revisar');
});

test('verDocumento aceita CNPJ com máscara', function () {
  var r = AUD.verDocumento('83.568.928/0001-02');
  assert.equal(r.situacao, 'ok');
});

/* ---------------- e-mail ---------------- */

test('verEmail apara e derruba as maiúsculas', function () {
  var r = AUD.verEmail('  Maria@Exemplo.COM ');
  assert.equal(r.situacao, 'corrigido');
  assert.equal(r.corrigido, 'maria@exemplo.com');
});

test('verEmail corrige domínio digitado errado', function () {
  assert.equal(AUD.verEmail('joao@gmial.com').corrigido, 'joao@gmail.com');
  assert.equal(AUD.verEmail('joao@gmial.com').motivo, 'domínio corrigido');
  assert.equal(AUD.verEmail('joao@gamil.com').corrigido, 'joao@gmail.com');
  assert.equal(AUD.verEmail('joao@gmail.co').corrigido, 'joao@gmail.com');
  assert.equal(AUD.verEmail('joao@gmail.con').corrigido, 'joao@gmail.com');
  assert.equal(AUD.verEmail('joao@hotmal.com').corrigido, 'joao@hotmail.com');
  assert.equal(AUD.verEmail('joao@hotmail.co').corrigido, 'joao@hotmail.com');
  assert.equal(AUD.verEmail('joao@outlok.com').corrigido, 'joao@outlook.com');
  assert.equal(AUD.verEmail('joao@yaho.com.br').corrigido, 'joao@yahoo.com.br');
});

test('verEmail deixa yahoo.com.br em paz', function () {
  assert.equal(AUD.verEmail('ana@yahoo.com.br').situacao, 'ok');
});

test('verEmail manda revisar sem @, com dois @, com espaço e sem domínio', function () {
  assert.equal(AUD.verEmail('semarroba.com').situacao, 'revisar');
  assert.equal(AUD.verEmail('ana@@exemplo.com').situacao, 'revisar');
  assert.equal(AUD.verEmail('ana silva@exemplo.com').situacao, 'revisar');
  assert.equal(AUD.verEmail('ana@exemplo').situacao, 'revisar');
});

/* ---------------- telefone ---------------- */

test('verTelefone aceita celular e fixo já formatados', function () {
  assert.equal(AUD.verTelefone('(11) 91234-5678').situacao, 'ok');
  assert.equal(AUD.verTelefone('(11) 3123-4567').situacao, 'ok');
});

test('verTelefone formata dígitos puros e tira o 55', function () {
  var r = AUD.verTelefone('11912345678');
  assert.equal(r.situacao, 'corrigido');
  assert.equal(r.corrigido, '(11) 91234-5678');
  assert.equal(AUD.verTelefone('+55 (11) 91234-5678').corrigido, '(11) 91234-5678');
});

test('verTelefone manda revisar DDD que não existe', function () {
  var r = AUD.verTelefone('(23) 91234-5678');
  assert.equal(r.situacao, 'revisar');
  assert.equal(r.motivo, 'DDD não existe');
});

test('verTelefone manda revisar celular sem o 9', function () {
  var r = AUD.verTelefone('(11) 81234-5678');
  assert.equal(r.situacao, 'revisar');
  assert.equal(r.motivo, 'celular sem o 9');
});

test('verTelefone manda revisar celular de 10 dígitos sem o nono', function () {
  var r = AUD.verTelefone('4899234567');
  assert.equal(r.situacao, 'revisar');
  assert.equal(r.motivo, 'celular sem o nono dígito');
  assert.equal(AUD.verTelefone('(48) 8923-4567').situacao, 'revisar');
});

test('verTelefone aceita fixo de 10 dígitos', function () {
  var r = AUD.verTelefone('4832234567');
  assert.equal(r.situacao, 'corrigido');
  assert.equal(r.corrigido, '(48) 3223-4567');
  assert.equal(AUD.verTelefone('(48) 3223-4567').situacao, 'ok');
});

test('verTelefone manda revisar número sem DDD', function () {
  var r = AUD.verTelefone('91234-5678');
  assert.equal(r.situacao, 'revisar');
  assert.equal(r.motivo, 'sem DDD');
  assert.equal(AUD.verTelefone('3123-4567').motivo, 'sem DDD');
});

/* ---------------- CEP ---------------- */

test('verCEP aceita, formata e recupera o zero à esquerda', function () {
  assert.equal(AUD.verCEP('01310-100').situacao, 'ok');
  assert.equal(AUD.verCEP('01310100').corrigido, '01310-100');
  assert.equal(AUD.verCEP('01310100').situacao, 'corrigido');
  var z = AUD.verCEP('1310100');
  assert.equal(z.corrigido, '01310-100');
  assert.equal(z.motivo, 'zero à esquerda recuperado');
  assert.equal(AUD.verCEP('1234').situacao, 'revisar');
});

/* ---------------- data ---------------- */

test('verData manda revisar 31/02/2024', function () {
  var r = AUD.verData('31/02/2024', { hoje: HOJE });
  assert.equal(r.situacao, 'revisar');
  assert.equal(r.motivo, 'data inválida');
});

test('verData converte ISO para dd/mm/aaaa', function () {
  var r = AUD.verData('2024-03-31', { hoje: HOJE });
  assert.equal(r.situacao, 'corrigido');
  assert.equal(r.corrigido, '31/03/2024');
  assert.equal(AUD.verData('15/03/2024', { hoje: HOJE }).situacao, 'ok');
});

test('verData manda revisar nascimento no futuro', function () {
  var futuro = COMUM.formatarData(COMUM.maisDias(HOJE, 200));
  var r = AUD.verData(futuro, { nascimento: true, hoje: HOJE });
  assert.equal(r.situacao, 'revisar');
  assert.equal(r.motivo, 'nascimento no futuro');
});

test('verData manda revisar nascimento de mais de 120 anos', function () {
  var r = AUD.verData('15/06/1890', { nascimento: true, hoje: HOJE });
  assert.equal(r.situacao, 'revisar');
  assert.equal(r.motivo, 'mais de 120 anos');
  assert.equal(AUD.verData('12/03/1985', { nascimento: true, hoje: HOJE }).situacao, 'ok');
});

/* ---------------- nome ---------------- */

test('verNome faz Title Case mantendo a partícula minúscula', function () {
  assert.equal(AUD.verNome('MARIA DA SILVA').corrigido, 'Maria da Silva');
  assert.equal(AUD.verNome('MARIA DA SILVA').situacao, 'corrigido');
  assert.equal(AUD.verNome('joão dos santos e souza').corrigido, 'João dos Santos e Souza');
});

test('verNome tira espaço dobrado e aceita nome já certo', function () {
  assert.equal(AUD.verNome('Maria  Silva').corrigido, 'Maria Silva');
  assert.equal(AUD.verNome('Maria Silva').situacao, 'ok');
});

test('verNome manda revisar um token só e nome com número', function () {
  var r = AUD.verNome('Ana');
  assert.equal(r.situacao, 'revisar');
  assert.equal(r.motivo, 'só um nome');
  assert.equal(AUD.verNome('Cliente 2').situacao, 'revisar');
});

/* ---------------- UF ---------------- */

test('verUF aceita sigla, corrige minúscula e traduz o nome do estado', function () {
  assert.equal(AUD.verUF('SP').situacao, 'ok');
  assert.equal(AUD.verUF('sp').corrigido, 'SP');
  assert.equal(AUD.verUF('sp').situacao, 'corrigido');
  assert.equal(AUD.verUF('São Paulo').corrigido, 'SP');
  assert.equal(AUD.verUF('Sao Paulo').corrigido, 'SP');
  assert.equal(AUD.verUF('Rio Grande do Sul').corrigido, 'RS');
  assert.equal(AUD.verUF('XX').situacao, 'revisar');
});

/* ---------------- texto solto ---------------- */

test('verTexto apara o espaço dobrado e aceita a cidade já certa', function () {
  var r = AUD.verTexto('São  Paulo');
  assert.equal(r.situacao, 'corrigido');
  assert.equal(r.corrigido, 'São Paulo');
  assert.equal(r.motivo, 'espaços ajustados');
  assert.equal(AUD.verTexto('São Paulo').situacao, 'ok');
});

/* ---------------- chave herdada de Object ---------------- */

test('verEmail e verNome não confundem chave herdada de Object com dado', function () {
  assert.equal(AUD.verEmail('ana@constructor.com').situacao, 'ok');
  assert.equal(AUD.verEmail('ana@constructor').situacao, 'revisar');
  assert.equal(AUD.verNome('JOSE CONSTRUCTOR SILVA').corrigido, 'Jose Constructor Silva');
});

/* ---------------- colunas ---------------- */

test('detectarColunas dá o papel de cada coluna do cadastro', function () {
  var ex = AUD.exemplo(HOJE);
  var papeis = AUD.detectarColunas(ex.cabecalho, ex.linhas).map(function (c) { return c.papel; });
  assert.deepEqual(papeis,
    ['nome', 'documento', 'email', 'telefone', 'cep', 'cidade', 'uf', 'nascimento', 'data']);
});

test('detectarColunas não toma Estado Civil por UF', function () {
  var cab = ['Nome', 'CPF', 'Estado Civil'];
  var linhas = [
    ['Maria Silva Ramos', '529.982.247-25', 'Casada'],
    ['João Batista Nunes', '227.135.830-20', 'Solteiro'],
    ['Ana Paula Correia', '157.038.506-81', 'Viúva']
  ];
  var colunas = AUD.detectarColunas(cab, linhas);
  assert.deepEqual(colunas.map(function (c) { return c.papel; }), ['nome', 'documento', 'outro']);
  var a = AUD.auditar(cab, linhas, colunas, { hoje: HOJE });
  assert.equal(a.nota.antes, 100);
  assert.equal(a.nota.revisarPct, 0);
});

test('detectarColunas dá UF a uma coluna Estado com siglas e nomes de estado', function () {
  var cab = ['Nome', 'Estado'];
  var linhas = [
    ['Maria Silva Ramos', 'SP'],
    ['João Batista Nunes', 'rj'],
    ['Ana Paula Correia', 'Minas Gerais']
  ];
  assert.equal(AUD.detectarColunas(cab, linhas)[1].papel, 'uf');
});

test('detectarColunas cai no conteúdo quando o cabeçalho não diz', function () {
  var cab = ['Coluna A', 'Coluna B'];
  var linhas = [['529.982.247-25', 'maria@exemplo.com'], ['227.135.830-20', 'joao@exemplo.com']];
  var papeis = AUD.detectarColunas(cab, linhas).map(function (c) { return c.papel; });
  assert.deepEqual(papeis, ['documento', 'email']);
});

/* ---------------- auditoria ---------------- */

var CAB3 = ['Nome', 'CPF', 'E-mail'];
var LINHAS3 = [
  ['Maria Silva', '529.982.247-25', 'maria@exemplo.com'],
  ['joão souza', '22713583020', 'JOAO@Exemplo.com'],
  ['Ana', '529.982.247-26', 'semarroba.com']
];

test('auditar calcula a nota antes e depois das correções', function () {
  var a = AUD.auditar(CAB3, LINHAS3, AUD.detectarColunas(CAB3, LINHAS3), { hoje: HOJE });
  assert.equal(a.nota.antes, 33.3);
  assert.equal(a.nota.depois, 66.7);
  assert.equal(a.nota.revisarPct, 33.3);
  assert.deepEqual(a.linhas.map(function (l) { return l.situacao; }), ['ok', 'corrigido', 'revisar']);
});

test('auditar deixa a coluna de papel outro fora do denominador da nota', function () {
  var cab = CAB3.concat(['Observação']);
  var linhas = [
    LINHAS3[0].concat(['comprou na loja']),
    LINHAS3[1].concat(['veio pelo site']),
    LINHAS3[2].concat(['cadastro antigo'])
  ];
  var colunas = AUD.detectarColunas(cab, linhas);
  assert.equal(colunas[3].papel, 'outro');
  var a = AUD.auditar(cab, linhas, colunas, { hoje: HOJE });
  assert.equal(a.nota.antes, 33.3);
  assert.equal(a.nota.depois, 66.7);
  assert.equal(a.nota.revisarPct, 33.3);
});

test('auditar conta por coluna e guarda exemplos de correção', function () {
  var a = AUD.auditar(CAB3, LINHAS3, AUD.detectarColunas(CAB3, LINHAS3), { hoje: HOJE });
  assert.deepEqual(a.colunas.map(function (c) { return c.ok; }), [1, 1, 1]);
  assert.deepEqual(a.colunas.map(function (c) { return c.corrigidos; }), [1, 1, 1]);
  assert.deepEqual(a.colunas.map(function (c) { return c.revisar; }), [1, 1, 1]);
  assert.equal(a.colunas[1].exemplos[0].de, '22713583020');
  assert.equal(a.colunas[1].exemplos[0].para, '227.135.830-20');
});

test('auditar marca vazio obrigatório em nome e documento, e não pune o resto', function () {
  var cab = ['Nome', 'CPF', 'Telefone'];
  var a = AUD.auditar(cab, [['', '', '']], AUD.detectarColunas(cab, [['', '', '']]), { hoje: HOJE });
  assert.equal(a.celulas[0][0].situacao, 'vazio');
  assert.equal(a.celulas[0][0].motivo, 'obrigatório em branco');
  assert.equal(a.celulas[0][1].situacao, 'vazio');
  assert.equal(a.celulas[0][2].situacao, 'ok');
  assert.equal(a.celulas[0][2].motivo, '');
});

test('auditar acha documento repetido e manda revisar as duas linhas', function () {
  var cab = ['Nome', 'CPF'];
  var linhas = [['Maria Silva', '529.982.247-25'], ['Maria S Silva', '52998224725']];
  var a = AUD.auditar(cab, linhas, AUD.detectarColunas(cab, linhas), { hoje: HOJE });
  assert.equal(a.repetidos.length, 1);
  assert.equal(a.repetidos[0].documento, '52998224725');
  assert.deepEqual(a.repetidos[0].linhas, [0, 1]);
  assert.equal(a.celulas[0][1].situacao, 'revisar');
  assert.equal(a.celulas[1][1].situacao, 'revisar');
  assert.equal(a.colunas[1].corrigidos, 0);
});

/* ---------------- exportação ---------------- */

test('matriz traz o cabeçalho, os valores corrigidos e a coluna Revisar', function () {
  var a = AUD.auditar(CAB3, LINHAS3, AUD.detectarColunas(CAB3, LINHAS3), { hoje: HOJE });
  var m = AUD.matriz(CAB3, LINHAS3, a);
  assert.equal(m.length, 4);
  assert.deepEqual(m[0], ['Nome', 'CPF', 'E-mail', 'Revisar']);
  assert.deepEqual(m[2], ['João Souza', '227.135.830-20', 'joao@exemplo.com', '']);
  assert.equal(m[3][0], 'Ana');
  assert.ok(m[3][3].indexOf('só um nome') >= 0);
});

test('csvCorrigido sai com BOM, valores corrigidos e coluna Revisar', function () {
  var a = AUD.auditar(CAB3, LINHAS3, AUD.detectarColunas(CAB3, LINHAS3), { hoje: HOJE });
  var texto = AUD.csvCorrigido(CAB3, LINHAS3, a);
  assert.equal(texto.charAt(0), BOM);
  var linhas = texto.slice(1).split('\r\n');
  assert.equal(linhas[0], 'Nome;CPF;E-mail;Revisar');
  assert.equal(linhas[2], 'João Souza;227.135.830-20;joao@exemplo.com;');
  assert.ok(linhas[3].indexOf('só um nome') >= 0);
});

test('csvPendencias lista linha, coluna, valor e motivo', function () {
  var a = AUD.auditar(CAB3, LINHAS3, AUD.detectarColunas(CAB3, LINHAS3), { hoje: HOJE });
  var linhas = AUD.csvPendencias(a).slice(1).split('\r\n');
  assert.equal(linhas[0], 'Linha;Coluna;Valor;Motivo');
  assert.equal(linhas[1], '4;Nome;Ana;só um nome');
  assert.equal(linhas.filter(function (l) { return l !== ''; }).length, 4);
});

/* ---------------- exemplo ---------------- */

test('exemplo traz 41 linhas do cadastro com as colunas combinadas', function () {
  var ex = AUD.exemplo(HOJE);
  assert.equal(ex.cabecalho.join(';'), 'Nome;CPF/CNPJ;E-mail;Telefone;CEP;Cidade;UF;Nascimento;Cadastro');
  assert.equal(ex.linhas.length, 41);
  assert.ok(ex.linhas.every(function (l) { return l.length === 9; }));
});

test('exemplo é determinístico com o mesmo hoje', function () {
  assert.equal(JSON.stringify(AUD.exemplo(HOJE)), JSON.stringify(AUD.exemplo(HOJE)));
});

test('exemplo tem 12 linhas perfeitas e um documento repetido', function () {
  var ex = AUD.exemplo(HOJE);
  var a = AUD.auditar(ex.cabecalho, ex.linhas, AUD.detectarColunas(ex.cabecalho, ex.linhas), { hoje: HOJE });
  var perfeitas = a.linhas.filter(function (l) { return l.situacao === 'ok'; });
  assert.equal(perfeitas.length, 12);
  assert.equal(a.repetidos.length, 1);
  assert.equal(a.repetidos[0].linhas.length, 2);
});

test('a nota do exemplo é 89,4 antes e 94,6 depois das correções', function () {
  var ex = AUD.exemplo(HOJE);
  var a = AUD.auditar(ex.cabecalho, ex.linhas, AUD.detectarColunas(ex.cabecalho, ex.linhas), { hoje: HOJE });
  assert.deepEqual(a.colunas.map(function (c) { return [c.ok, c.corrigidos, c.revisar, c.vazios]; }), [
    [34, 4, 2, 1], [33, 3, 4, 1], [32, 6, 3, 0], [36, 1, 4, 0], [38, 2, 1, 0],
    [41, 0, 0, 0], [38, 2, 1, 0], [37, 1, 3, 0], [41, 0, 0, 0]
  ]);
  /* contagem acima somada à mão: 330 ok, 19 corrigidas e 20 pendentes em 369 células avaliadas */
  assert.equal(a.nota.antes, 89.4);
  assert.equal(a.nota.depois, 94.6);
  assert.equal(a.nota.revisarPct, 5.4);
});

test('exemplo cobre todos os verificadores com pelo menos uma correção e uma revisão', function () {
  var ex = AUD.exemplo(HOJE);
  var a = AUD.auditar(ex.cabecalho, ex.linhas, AUD.detectarColunas(ex.cabecalho, ex.linhas), { hoje: HOJE });
  ['nome', 'documento', 'email', 'telefone', 'cep', 'uf', 'nascimento'].forEach(function (papel) {
    var col = a.colunas.filter(function (c) { return c.papel === papel; })[0];
    assert.ok(col, 'coluna de papel ' + papel);
    assert.ok(col.corrigidos > 0, papel + ' sem correção');
    assert.ok(col.revisar > 0, papel + ' sem revisão');
  });
});
