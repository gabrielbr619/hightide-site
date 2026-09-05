var test = require('node:test');
var assert = require('node:assert/strict');
var ESC = require('./nucleo.js');
var COMUM = require('../comum/comum.js');

var BOM = String.fromCharCode(0xFEFF);
var HOJE = '2026-09-04';

function todosOsDias() { return [0, 1, 2, 3, 4, 5, 6]; }

function configSimples(extra) {
  var base = {
    mes: '2026-10',
    turnos: [{ id: 'dia', nome: 'Dia', inicio: '08:00', fim: '16:00', vagas: 1, dias: todosOsDias() }],
    pessoas: [
      { id: 'a', nome: 'Ana', maxSemana: 7, folgas: [], naoFaz: [], ausencias: [] },
      { id: 'b', nome: 'Bento', maxSemana: 7, folgas: [], naoFaz: [], ausencias: [] }
    ],
    regras: { descansoHoras: 11, maxConsecutivos: 30 }
  };
  Object.keys(extra || {}).forEach(function (k) { base[k] = extra[k]; });
  return base;
}

function turnoDaPessoa(grade, dia, pessoaId) {
  var achados = [];
  Object.keys(grade[dia] || {}).forEach(function (turnoId) {
    if (grade[dia][turnoId].indexOf(pessoaId) >= 0) achados.push(turnoId);
  });
  return achados;
}

/* ---------------- calendário ---------------- */

test('diasDoMes devolve o mês inteiro e conta o ano bissexto', function () {
  assert.equal(ESC.diasDoMes('2028-02').length, 29);
  assert.equal(ESC.diasDoMes('2027-02').length, 28);
  assert.equal(ESC.diasDoMes('2026-01').length, 31);
  assert.equal(ESC.diasDoMes('2026-04')[0], '2026-04-01');
  assert.equal(ESC.diasDoMes('2026-04')[29], '2026-04-30');
  assert.deepEqual(ESC.diasDoMes('lixo'), []);
});

test('segunda devolve a segunda-feira da semana', function () {
  assert.equal(ESC.segunda('2026-09-04'), '2026-08-31');
  assert.equal(ESC.segunda('2026-09-06'), '2026-08-31');
  assert.equal(ESC.segunda('2026-09-07'), '2026-09-07');
});

/* ---------------- regras da geração ---------------- */

test('ninguém entra em dois turnos no mesmo dia', function () {
  var r = ESC.gerar(ESC.exemplo(HOJE));
  Object.keys(r.grade).forEach(function (dia) {
    var vistos = {};
    Object.keys(r.grade[dia]).forEach(function (turnoId) {
      r.grade[dia][turnoId].forEach(function (id) {
        assert.ok(!vistos[id], id + ' aparece duas vezes em ' + dia);
        vistos[id] = true;
      });
    });
  });
});

test('folga fixa é respeitada', function () {
  var cfg = ESC.exemplo(HOJE);
  var r = ESC.gerar(cfg);
  cfg.pessoas.forEach(function (p) {
    ESC.diasDoMes(cfg.mes).forEach(function (dia) {
      if (p.folgas.indexOf(COMUM.diaSemana(dia)) < 0) return;
      assert.deepEqual(turnoDaPessoa(r.grade, dia, p.id), [], p.id + ' escalado na folga em ' + dia);
    });
  });
});

test('naoFaz é respeitado', function () {
  var cfg = configSimples({
    turnos: [
      { id: 'manha', nome: 'Manhã', inicio: '07:00', fim: '15:00', vagas: 1, dias: todosOsDias() },
      { id: 'noite', nome: 'Noite', inicio: '23:00', fim: '07:00', vagas: 1, dias: todosOsDias() }
    ],
    pessoas: [
      { id: 'a', nome: 'Ana', maxSemana: 7, folgas: [], naoFaz: ['noite'], ausencias: [] },
      { id: 'b', nome: 'Bento', maxSemana: 7, folgas: [], naoFaz: [], ausencias: [] }
    ]
  });
  var r = ESC.gerar(cfg);
  ESC.diasDoMes(cfg.mes).forEach(function (dia) {
    assert.ok(r.grade[dia].noite.indexOf('a') < 0, 'Ana escalada na noite em ' + dia);
  });
  assert.equal(r.porPessoa.a.porTurno.noite, undefined);
});

test('ausência é respeitada', function () {
  var cfg = configSimples();
  cfg.pessoas[0].ausencias = [{ de: '2026-10-05', ate: '2026-10-08' }];
  var r = ESC.gerar(cfg);
  ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].forEach(function (dia) {
    assert.deepEqual(turnoDaPessoa(r.grade, dia, 'a'), [], 'escalado durante a ausência em ' + dia);
  });
  assert.ok(turnoDaPessoa(r.grade, '2026-10-09', 'a').length + turnoDaPessoa(r.grade, '2026-10-04', 'a').length > 0);
});

test('maxSemana é respeitado', function () {
  var cfg = configSimples();
  cfg.pessoas[0].maxSemana = 2;
  cfg.pessoas[1].maxSemana = 2;
  var r = ESC.gerar(cfg);
  var contas = {};
  ESC.diasDoMes(cfg.mes).forEach(function (dia) {
    Object.keys(r.grade[dia]).forEach(function (turnoId) {
      r.grade[dia][turnoId].forEach(function (id) {
        var chave = id + '|' + ESC.segunda(dia);
        contas[chave] = (contas[chave] || 0) + 1;
      });
    });
  });
  Object.keys(contas).forEach(function (chave) {
    assert.ok(contas[chave] <= 2, chave + ' passou do limite semanal: ' + contas[chave]);
  });
  assert.ok(r.descobertos.length > 0);
  assert.ok(r.descobertos.some(function (d) { return d.motivo === 'todos no limite semanal'; }));
});

test('quem faz a noite não entra na manhã do dia seguinte', function () {
  var cfg = ESC.exemplo(HOJE);
  var r = ESC.gerar(cfg);
  var dias = ESC.diasDoMes(cfg.mes);
  dias.forEach(function (dia, i) {
    if (i + 1 >= dias.length) return;
    var seguinte = dias[i + 1];
    (r.grade[dia].noite || []).forEach(function (id) {
      assert.ok((r.grade[seguinte].manha || []).indexOf(id) < 0, id + ' na manhã de ' + seguinte + ' depois da noite');
      assert.ok((r.grade[seguinte].tarde || []).indexOf(id) < 0, id + ' na tarde de ' + seguinte + ' depois da noite');
    });
  });
});

test('maxConsecutivos é respeitado', function () {
  var cfg = configSimples();
  cfg.regras = { descansoHoras: 11, maxConsecutivos: 3 };
  cfg.pessoas[1].ausencias = [{ de: '2026-10-01', ate: '2026-10-31' }];
  var r = ESC.gerar(cfg);
  var corrida = 0, maior = 0;
  ESC.diasDoMes(cfg.mes).forEach(function (dia) {
    if (turnoDaPessoa(r.grade, dia, 'a').length) { corrida++; if (corrida > maior) maior = corrida; }
    else corrida = 0;
  });
  assert.equal(maior, 3);
  assert.equal(r.porPessoa.a.consecutivosMax, 3);
  assert.ok(r.descobertos.some(function (d) { return d.motivo === 'limite de dias seguidos'; }));
});

test('o motivo do descoberto é o que bloqueia mais gente', function () {
  var cfg = configSimples({
    turnos: [{ id: 'dia', nome: 'Dia', inicio: '08:00', fim: '16:00', vagas: 1, dias: todosOsDias() }],
    pessoas: [
      { id: 'a', nome: 'Ana', maxSemana: 1, folgas: [], naoFaz: [], ausencias: [] },
      { id: 'b', nome: 'Bento', maxSemana: 7, folgas: todosOsDias(), naoFaz: [], ausencias: [] },
      { id: 'c', nome: 'Cida', maxSemana: 7, folgas: todosOsDias(), naoFaz: [], ausencias: [] },
      { id: 'd', nome: 'Davi', maxSemana: 7, folgas: todosOsDias(), naoFaz: [], ausencias: [] }
    ]
  });
  var r = ESC.gerar(cfg);
  assert.deepEqual(turnoDaPessoa(r.grade, '2026-10-01', 'a'), ['dia']);
  var segundo = r.descobertos.filter(function (d) { return d.dia === '2026-10-02'; })[0];
  assert.ok(segundo, 'o segundo dia não ficou descoberto');
  assert.equal(segundo.motivo, 'ninguém disponível (folga/ausência)');
});

test('maxSemana só ganha o padrão quando a chave não vem', function () {
  assert.equal(ESC.normalizar({ pessoas: [{ id: 'a', nome: 'Ana' }] }).pessoas[0].maxSemana, 7);
  assert.equal(ESC.normalizar({ pessoas: [{ id: 'a', maxSemana: 3 }] }).pessoas[0].maxSemana, 3);
  assert.equal(ESC.normalizar({ pessoas: [{ id: 'a', maxSemana: 0 }] }).pessoas[0].maxSemana, 0);
  assert.equal(ESC.normalizar({ pessoas: [{ id: 'a', maxSemana: '' }] }).pessoas[0].maxSemana, 0);
  var cfg = configSimples();
  cfg.pessoas[0].maxSemana = 0;
  assert.deepEqual(turnoDaPessoa(ESC.gerar(cfg).grade, '2026-10-01', 'a'), []);
});

test('descoberto traz motivo quando há 1 pessoa e 2 vagas', function () {
  var cfg = configSimples({
    turnos: [{ id: 'dia', nome: 'Dia', inicio: '08:00', fim: '16:00', vagas: 2, dias: todosOsDias() }],
    pessoas: [{ id: 'a', nome: 'Ana', maxSemana: 7, folgas: [], naoFaz: [], ausencias: [] }],
    regras: { descansoHoras: 11, maxConsecutivos: 31 }
  });
  var r = ESC.gerar(cfg);
  assert.equal(r.descobertos.length, 31);
  assert.equal(r.descobertos[0].faltam, 1);
  assert.equal(r.descobertos[0].turnoId, 'dia');
  assert.equal(r.descobertos[0].motivo, 'ninguém disponível (folga/ausência)');
  assert.equal(r.cobertura.vagas, 62);
  assert.equal(r.cobertura.preenchidas, 31);
  assert.equal(Math.round(r.cobertura.pct), 50);
});

/* ---------------- dias em que o turno acontece ---------------- */

test('turno sem nenhum dia marcado não acontece', function () {
  var cfg = configSimples({
    turnos: [{ id: 'dia', nome: 'Dia', inicio: '08:00', fim: '16:00', vagas: 1, dias: [] }]
  });
  assert.deepEqual(ESC.normalizar(cfg).turnos[0].dias, []);
  var r = ESC.gerar(cfg);
  assert.equal(r.cobertura.vagas, 0);
  assert.equal(r.cobertura.preenchidas, 0);
  assert.deepEqual(r.descobertos, []);
  ESC.diasDoMes(cfg.mes).forEach(function (dia) {
    assert.deepEqual(r.grade[dia], {}, 'escalou alguém em ' + dia);
  });
});

test('turno sem a chave dias acontece todos os dias', function () {
  var semChave = { id: 'dia', nome: 'Dia', inicio: '08:00', fim: '16:00', vagas: 1 };
  assert.deepEqual(ESC.normalizar({ mes: '2026-10', turnos: [semChave] }).turnos[0].dias, [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(ESC.normalizar({ mes: '2026-10', turnos: [{ id: 'x', dias: 'seg' }] }).turnos[0].dias, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(ESC.gerar(configSimples({ turnos: [semChave] })).cobertura.vagas, 31);
});

test('só os turnos com dias marcados entram na cobertura', function () {
  var cfg = configSimples({
    turnos: [
      { id: 'dia', nome: 'Dia', inicio: '08:00', fim: '16:00', vagas: 1, dias: [1, 2, 3, 4, 5] },
      { id: 'fim', nome: 'Fim de semana', inicio: '09:00', fim: '17:00', vagas: 1, dias: [] }
    ]
  });
  var r = ESC.gerar(cfg);
  var uteis = ESC.diasDoMes(cfg.mes).filter(function (d) {
    var ds = COMUM.diaSemana(d);
    return ds >= 1 && ds <= 5;
  }).length;
  assert.equal(r.cobertura.vagas, uteis);
  ESC.diasDoMes(cfg.mes).forEach(function (dia) {
    assert.ok(!(r.grade[dia] || {}).fim, 'o turno sem dias apareceu em ' + dia);
  });
});

/* ---------------- exemplo ---------------- */

test('exemplo usa o mês seguinte a hoje e vira o ano em dezembro', function () {
  assert.equal(ESC.exemplo('2026-09-04').mes, '2026-10');
  assert.equal(ESC.exemplo('2026-12-20').mes, '2027-01');
  assert.equal(ESC.exemplo('2026-01-31').mes, '2026-02');
});

test('exemplo é determinístico e tem 8 pessoas e 3 turnos', function () {
  var a = ESC.exemplo(HOJE), b = ESC.exemplo(HOJE);
  assert.deepEqual(a, b);
  assert.equal(a.pessoas.length, 8);
  assert.equal(a.turnos.length, 3);
  assert.equal(a.pessoas.filter(function (p) { return p.naoFaz.indexOf('noite') >= 0; }).length, 1);
  assert.equal(a.pessoas.filter(function (p) { return p.ausencias.length; }).length, 1);
  assert.deepEqual(ESC.gerar(a).grade, ESC.gerar(b).grade);
});

test('validar não acha violação na escala do exemplo', function () {
  var cfg = ESC.exemplo(HOJE);
  var r = ESC.gerar(cfg);
  assert.deepEqual(ESC.validar(cfg, r.grade), []);
});

test('validar acusa a grade montada na mão que quebra as regras', function () {
  var cfg = configSimples();
  cfg.pessoas[0].folgas = [COMUM.diaSemana('2026-10-01')];
  var grade = {};
  grade['2026-10-01'] = { dia: ['a'] };
  var v = ESC.validar(cfg, grade);
  assert.equal(v.length, 1);
  assert.equal(v[0].dia, '2026-10-01');
  assert.equal(v[0].pessoaId, 'a');
  assert.equal(v[0].regra, 'folga fixa');
});

test('a cobertura do exemplo passa de 95%', function () {
  var r = ESC.gerar(ESC.exemplo(HOJE));
  assert.ok(r.cobertura.pct >= 95, 'cobertura ficou em ' + r.cobertura.pct.toFixed(1) + '%');
  assert.equal(r.cobertura.preenchidas + r.descobertos.reduce(function (s, d) { return s + d.faltam; }, 0), r.cobertura.vagas);
});

test('as noites ficam divididas entre quem pode fazer noite (diferença ≤ 2)', function () {
  var cfg = ESC.exemplo(HOJE);
  var r = ESC.gerar(cfg);
  var noites = cfg.pessoas.filter(function (p) { return p.naoFaz.indexOf('noite') < 0; })
    .map(function (p) { return r.porPessoa[p.id].noites; });
  assert.ok(noites.length === 7);
  assert.ok(Math.max.apply(null, noites) - Math.min.apply(null, noites) <= 2,
    'noites por pessoa: ' + noites.join(', '));
});

test('os fins de semana ficam equilibrados entre a equipe (diferença ≤ 3)', function () {
  var cfg = ESC.exemplo(HOJE);
  var r = ESC.gerar(cfg);
  var fds = cfg.pessoas.map(function (p) { return r.porPessoa[p.id].fds; });
  assert.ok(Math.max.apply(null, fds) - Math.min.apply(null, fds) <= 3,
    'fins de semana por pessoa: ' + fds.join(', '));
});

test('porPessoa soma os turnos preenchidos e conta fins de semana', function () {
  var cfg = ESC.exemplo(HOJE);
  var r = ESC.gerar(cfg);
  var soma = cfg.pessoas.reduce(function (s, p) { return s + r.porPessoa[p.id].turnos; }, 0);
  assert.equal(soma, r.cobertura.preenchidas);
  cfg.pessoas.forEach(function (p) {
    assert.ok(r.porPessoa[p.id].fds >= 0);
    assert.ok(r.porPessoa[p.id].consecutivosMax <= cfg.regras.maxConsecutivos);
  });
});

/* ---------------- congelar e simular falta ---------------- */

test('congelar mantém o passado e só refaz dali em diante', function () {
  var cfg = ESC.exemplo(HOJE);
  var r1 = ESC.gerar(cfg);
  var dias = ESC.diasDoMes(cfg.mes);
  var corte = dias[14];
  var cfg2 = ESC.exemplo(HOJE);
  cfg2.pessoas[0].ausencias = [{ de: dias[20], ate: dias[22] }];
  var r2 = ESC.gerar(cfg2, { congelar: { ate: corte, grade: r1.grade } });
  dias.forEach(function (dia) {
    if (dia <= corte) assert.deepEqual(r2.grade[dia], r1.grade[dia], 'dia congelado mudou: ' + dia);
  });
  [dias[20], dias[21], dias[22]].forEach(function (dia) {
    assert.deepEqual(turnoDaPessoa(r2.grade, dia, cfg.pessoas[0].id), []);
  });
});

test('simularFalta refaz só a partir do dia e mostra quem cobre', function () {
  var cfg = ESC.exemplo(HOJE);
  var r = ESC.gerar(cfg);
  var dias = ESC.diasDoMes(cfg.mes);
  var dia = dias[9];
  var quem = r.grade[dia].manha[0];
  var s = ESC.simularFalta(cfg, r.grade, quem, dia);

  dias.forEach(function (d) {
    if (d < dia) assert.deepEqual(s.resultado.grade[d], r.grade[d], 'mudou antes da falta: ' + d);
  });
  assert.deepEqual(turnoDaPessoa(s.resultado.grade, dia, quem), []);
  assert.ok(s.mudancas.length > 0);
  s.mudancas.forEach(function (m) { assert.ok(m.dia >= dia, 'mudança antes da falta: ' + m.dia); });
  assert.ok(s.mudancas.some(function (m) {
    return m.dia === dia && m.turnoId === 'manha' && m.saiu === quem;
  }), 'a saída de quem faltou não apareceu nas mudanças');
});

test('simularFalta muda só o dia da falta', function () {
  var cfg = ESC.exemplo(HOJE);
  var r = ESC.gerar(cfg);
  var dias = ESC.diasDoMes(cfg.mes);
  var dia = dias[9];
  var quem = r.grade[dia].manha[0];
  var doDia = turnoDaPessoa(r.grade, dia, quem).length;
  var s = ESC.simularFalta(cfg, r.grade, quem, dia);

  s.mudancas.forEach(function (m) {
    assert.equal(m.dia, dia, 'mudança fora do dia da falta: ' + m.dia);
  });
  assert.ok(s.mudancas.length <= doDia,
    doDia + ' turno(s) da pessoa no dia viraram ' + s.mudancas.length + ' mudanças');
  dias.forEach(function (d) {
    if (d !== dia) assert.deepEqual(s.resultado.grade[d], r.grade[d], 'dia intocado mudou: ' + d);
  });
});

test('quem cobre a falta respeita todas as regras', function () {
  var cfg = ESC.exemplo(HOJE);
  var r = ESC.gerar(cfg);
  var dias = ESC.diasDoMes(cfg.mes);
  var dia = dias[9];
  var quem = r.grade[dia].manha[0];
  var s = ESC.simularFalta(cfg, r.grade, quem, dia);

  var comFalta = ESC.exemplo(HOJE);
  comFalta.pessoas.forEach(function (p) {
    if (p.id === quem) p.ausencias = p.ausencias.concat([{ de: dia, ate: dia }]);
  });
  assert.deepEqual(ESC.validar(comFalta, s.resultado.grade), []);
});

/* ---------------- exportação ---------------- */

test('csvGrade tem BOM, uma linha por pessoa e a sigla do turno', function () {
  var cfg = configSimples();
  var r = ESC.gerar(cfg);
  var texto = ESC.csvGrade(cfg, r);
  assert.equal(texto.charAt(0), BOM);
  var linhas = texto.slice(1).trim().split('\r\n');
  assert.equal(linhas.length, 3);
  assert.equal(linhas[0].split(';').length, 32);
  assert.equal(linhas[0].split(';')[0], 'Pessoa');
  assert.equal(linhas[1].split(';')[0], 'Ana');
  assert.ok(linhas[1].split(';').indexOf('D') > 0, 'sigla do turno não apareceu: ' + linhas[1]);
});

test('csvPorDia lista dia, turno e quem está escalado', function () {
  var cfg = configSimples();
  var r = ESC.gerar(cfg);
  var linhas = ESC.csvPorDia(cfg, r).slice(1).trim().split('\r\n');
  assert.equal(linhas.length, 32);
  assert.equal(linhas[0], 'Dia;Dia da semana;Turno;Horário;Vagas;Escalados;Faltam');
  var primeira = linhas[1].split(';');
  assert.equal(primeira[0], '01/10/2026');
  assert.equal(primeira[2], 'Dia');
  assert.equal(primeira[3], '08:00-16:00');
  assert.equal(primeira[4], '1');
  assert.equal(primeira[5], 'Ana');
  assert.equal(primeira[6], '0');
});

test('linhasGrade é a matriz que o CSV da grade publica', function () {
  var cfg = configSimples();
  var r = ESC.gerar(cfg);
  var linhas = ESC.linhasGrade(cfg, r);
  assert.equal(linhas.length, 3);
  assert.equal(linhas[0].length, 32);
  assert.equal(linhas[0][0], 'Pessoa');
  assert.equal(linhas[0][1], '01/10/2026');
  assert.equal(linhas[1][0], 'Ana');
  assert.equal(ESC.csvGrade(cfg, r), COMUM.csv(linhas));
});

test('siglas desambiguam turnos que começam com a mesma letra', function () {
  assert.deepEqual(ESC.siglas([
    { id: 'm', nome: 'Manhã' }, { id: 'ma', nome: 'Madrugada' }, { id: 't', nome: 'Tarde' }
  ]), { m: 'M', ma: 'MA', t: 'T' });
  assert.deepEqual(ESC.siglas([
    { id: 'a', nome: 'Manhã' }, { id: 'b', nome: 'Madrugada' }, { id: 'c', nome: 'Manobra' }
  ]), { a: 'M', b: 'MA', c: 'M3' });
  assert.deepEqual(ESC.siglas([
    { id: 'x', nome: 'Plantão', sigla: 'PL' }, { id: 'y', nome: 'Pico' }
  ]), { x: 'PL', y: 'P' });
});

test('csvGrade usa a sigla desambiguada', function () {
  var cfg = configSimples({
    turnos: [
      { id: 'manha', nome: 'Manhã', inicio: '07:00', fim: '15:00', vagas: 1, dias: todosOsDias() },
      { id: 'madrugada', nome: 'Madrugada', inicio: '23:00', fim: '07:00', vagas: 1, dias: todosOsDias() }
    ]
  });
  var r = ESC.gerar(cfg);
  var celulas = [];
  ESC.linhasGrade(cfg, r).slice(1).forEach(function (l) { celulas = celulas.concat(l.slice(1)); });
  assert.ok(celulas.indexOf('M') >= 0, 'a sigla da manhã não apareceu');
  assert.ok(celulas.indexOf('MA') >= 0, 'a sigla desambiguada não apareceu');
});

test('sigla vem do nome do turno e respeita a sigla declarada', function () {
  assert.equal(ESC.sigla({ id: 'manha', nome: 'Manhã' }), 'M');
  assert.equal(ESC.sigla({ id: 'x', nome: 'Plantão', sigla: 'PL' }), 'PL');
  assert.equal(ESC.sigla({ id: 'y', nome: '' }), 'Y');
});
