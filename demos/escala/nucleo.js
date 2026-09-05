/* Núcleo do gerador de escala: monta a escala do mês a partir de turnos, pessoas e regras,
   valida o resultado e refaz a partir de uma falta. Sem dependência da página. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('../comum/comum.js'));
  else raiz.ESC = fabrica(raiz.COMUM);
})(this, function (COMUM) {
  'use strict';

  var MINUTOS_DIA = 1440;

  function doisDigitos(n) { return (n < 10 ? '0' : '') + n; }

  function lista(v) { return ehLista(v) ? v : []; }

  function minutosHora(hhmm) {
    var m = String(hhmm == null ? '' : hhmm).match(/^(\d{1,2}):(\d{2})/);
    return m ? (+m[1]) * 60 + (+m[2]) : 0;
  }

  function ehNoite(turno) {
    return minutosHora(turno.fim) <= minutosHora(turno.inicio);
  }

  function sigla(turno) {
    if (turno.sigla) return String(turno.sigla).toUpperCase();
    var base = COMUM.limpo(turno.nome) || COMUM.limpo(turno.id);
    return COMUM.semAcento(base).charAt(0).toUpperCase();
  }

  /* duas siglas iguais fazem a grade mentir: quem colide na inicial fica com a 2ª letra e,
     se ainda colidir, com o índice — a mesma sigla vale para grade, legenda e CSV */
  function siglas(turnos) {
    var itens = ehLista(turnos) ? turnos : [];
    var mapa = {}, usadas = {};
    itens.forEach(function (t) {
      if (!t.sigla) return;
      var declarada = String(t.sigla).toUpperCase();
      mapa[t.id] = declarada;
      usadas[declarada] = true;
    });
    itens.forEach(function (t, i) {
      if (mapa[t.id]) return;
      var base = COMUM.semAcento(COMUM.limpo(t.nome) || COMUM.limpo(t.id)).toUpperCase();
      var opcoes = [base.charAt(0), base.slice(0, 2), base.charAt(0) + (i + 1)];
      var escolhida = opcoes[0];
      for (var k = 0; k < opcoes.length; k++) {
        if (opcoes[k] && !usadas[opcoes[k]]) { escolhida = opcoes[k]; break; }
      }
      mapa[t.id] = escolhida;
      usadas[escolhida] = true;
    });
    return mapa;
  }

  function diasDoMes(mes) {
    var m = String(mes == null ? '' : mes).match(/^(\d{4})-(\d{2})$/);
    if (!m) return [];
    var ano = +m[1], numero = +m[2];
    if (numero < 1 || numero > 12) return [];
    var total = new Date(Date.UTC(ano, numero, 0)).getUTCDate();
    var dias = [];
    for (var d = 1; d <= total; d++) dias.push(ano + '-' + m[2] + '-' + doisDigitos(d));
    return dias;
  }

  /* semana de trabalho é segunda a domingo, e diaSemana devolve 0 para domingo */
  function segunda(iso) {
    var ds = COMUM.diaSemana(iso);
    return COMUM.maisDias(iso, -(ds === 0 ? 6 : ds - 1));
  }

  /* ---------------- normalização da configuração ---------------- */

  function ehLista(v) { return Object.prototype.toString.call(v) === '[object Array]'; }

  /* lista vazia é escolha do visitante (turno que não acontece); só a ausência da chave vira todos os dias */
  function diasDoTurno(v) {
    if (!ehLista(v)) return [0, 1, 2, 3, 4, 5, 6];
    return v.map(Number).filter(function (d) { return d >= 0 && d <= 6; });
  }

  function normalizarTurno(t, i) {
    return {
      id: COMUM.limpo(t.id) || 'turno' + (i + 1),
      nome: COMUM.limpo(t.nome) || 'Turno ' + (i + 1),
      sigla: COMUM.limpo(t.sigla),
      inicio: COMUM.limpo(t.inicio) || '00:00',
      fim: COMUM.limpo(t.fim) || '00:00',
      vagas: Math.max(0, Math.floor(Number(t.vagas) || 0)),
      dias: diasDoTurno(t.dias)
    };
  }

  /* 0 é escolha possível (pessoa fora da escala neste mês); só a chave ausente vira o padrão,
     senão um campo apagado no formulário viraria 7 turnos por semana sem ninguém pedir */
  function maxSemanaDe(p) {
    if (p.maxSemana === undefined || p.maxSemana === null) return 7;
    return Math.max(0, Math.floor(Number(p.maxSemana)) || 0);
  }

  function normalizarPessoa(p, i) {
    return {
      id: COMUM.limpo(p.id) || 'p' + (i + 1),
      nome: COMUM.limpo(p.nome) || 'Pessoa ' + (i + 1),
      maxSemana: maxSemanaDe(p),
      folgas: lista(p.folgas).map(Number).filter(function (d) { return d >= 0 && d <= 6; }),
      naoFaz: lista(p.naoFaz).map(function (t) { return COMUM.limpo(t); }),
      ausencias: lista(p.ausencias).map(function (a) {
        var de = COMUM.data(a.de) || COMUM.data(a.ate);
        var ate = COMUM.data(a.ate) || de;
        return { de: de, ate: ate < de ? de : ate };
      }).filter(function (a) { return a.de; })
    };
  }

  function normalizar(config) {
    config = config || {};
    var regras = config.regras || {};
    var descanso = Number(regras.descansoHoras);
    var consecutivos = Number(regras.maxConsecutivos);
    return {
      mes: COMUM.limpo(config.mes),
      turnos: lista(config.turnos).map(normalizarTurno),
      pessoas: lista(config.pessoas).map(normalizarPessoa),
      regras: {
        descansoHoras: isFinite(descanso) && descanso >= 0 ? descanso : 11,
        maxConsecutivos: isFinite(consecutivos) && consecutivos > 0 ? Math.floor(consecutivos) : 6
      }
    };
  }

  /* noite por último: quem dorme de dia só sobra para a noite, e decidir isso antes
     travaria os turnos de dia sem necessidade */
  function ordenarTurnos(turnos) {
    return turnos.map(function (t, i) { return { t: t, i: i }; }).sort(function (a, b) {
      var na = ehNoite(a.t) ? 1 : 0, nb = ehNoite(b.t) ? 1 : 0;
      if (na !== nb) return na - nb;
      var ia = minutosHora(a.t.inicio), ib = minutosHora(b.t.inicio);
      if (ia !== ib) return ia - ib;
      return a.i - b.i;
    }).map(function (x) { return x.t; });
  }

  function ausente(pessoa, dia) {
    for (var i = 0; i < pessoa.ausencias.length; i++) {
      var a = pessoa.ausencias[i];
      if (dia >= a.de && dia <= a.ate) return true;
    }
    return false;
  }

  function inicioAbs(d, turno) { return d * MINUTOS_DIA + minutosHora(turno.inicio); }

  function fimAbs(d, turno) {
    return d * MINUTOS_DIA + minutosHora(turno.fim) + (ehNoite(turno) ? MINUTOS_DIA : 0);
  }

  function estadoInicial(pessoas) {
    var est = {};
    pessoas.forEach(function (p, i) {
      est[p.id] = {
        ordem: i, total: 0, porTurno: {}, fds: 0, noites: 0,
        fimAnterior: -Infinity, ultimoDia: -99, consecutivos: 0, consecutivosMax: 0,
        semana: {}, dias: {}
      };
    });
    return est;
  }

  function registrar(est, pessoa, d, dia, turno) {
    var e = est[pessoa.id];
    e.total++;
    e.porTurno[turno.id] = (e.porTurno[turno.id] || 0) + 1;
    if (ehNoite(turno)) e.noites++;
    var ds = COMUM.diaSemana(dia);
    if (ds === 0 || ds === 6) e.fds++;
    e.fimAnterior = fimAbs(d, turno);
    e.dias[dia] = turno.id;
    e.consecutivos = d === e.ultimoDia + 1 ? e.consecutivos + 1 : 1;
    e.ultimoDia = d;
    if (e.consecutivos > e.consecutivosMax) e.consecutivosMax = e.consecutivos;
    var sem = segunda(dia);
    e.semana[sem] = (e.semana[sem] || 0) + 1;
  }

  function bloqueio(config, est, pessoa, d, dia, turno) {
    var e = est[pessoa.id];
    if (e.dias[dia]) return 'indisponivel';
    if (pessoa.folgas.indexOf(COMUM.diaSemana(dia)) >= 0) return 'indisponivel';
    if (pessoa.naoFaz.indexOf(turno.id) >= 0) return 'indisponivel';
    if (ausente(pessoa, dia)) return 'indisponivel';
    if ((e.semana[segunda(dia)] || 0) >= pessoa.maxSemana) return 'semana';
    if (e.fimAnterior + config.regras.descansoHoras * 60 > inicioAbs(d, turno)) return 'descanso';
    var corrida = d === e.ultimoDia + 1 ? e.consecutivos + 1 : 1;
    if (corrida > config.regras.maxConsecutivos) return 'consecutivos';
    return '';
  }

  var ROTULO_BLOQUEIO = {
    semana: 'todos no limite semanal',
    descanso: 'descanso mínimo',
    consecutivos: 'limite de dias seguidos',
    indisponivel: 'ninguém disponível (folga/ausência)'
  };

  /* empate resolve nesta ordem: "ninguém disponível" é o fundo do poço, não a explicação */
  var ORDEM_BLOQUEIO = ['semana', 'descanso', 'consecutivos', 'indisponivel'];

  function motivoFalta(config, est, d, dia, turno) {
    var contas = {};
    config.pessoas.forEach(function (p) {
      var b = bloqueio(config, est, p, d, dia, turno);
      if (b) contas[b] = (contas[b] || 0) + 1;
    });
    var vencedor = '';
    ORDEM_BLOQUEIO.forEach(function (b) {
      if ((contas[b] || 0) > (contas[vencedor] || 0)) vencedor = b;
    });
    return ROTULO_BLOQUEIO[vencedor] || ROTULO_BLOQUEIO.indisponivel;
  }

  function ehFimDeSemana(dia) {
    var ds = COMUM.diaSemana(dia);
    return ds === 0 || ds === 6;
  }

  /* sábado e domingo pesam na vida de quem trabalha: no fim de semana, entre iguais, entra
     quem tem menos fins de semana escalados */
  function chaveEscolha(e, i, d, n, turno, dia) {
    if (ehFimDeSemana(dia)) return [e.fds, e.porTurno[turno.id] || 0, e.total, (i + d) % n, i];
    return [e.total, e.porTurno[turno.id] || 0, e.fds, (i + d) % n, i];
  }

  function escolher(config, est, d, dia, turno) {
    var melhor = null, chaveMelhor = null, n = config.pessoas.length || 1;
    config.pessoas.forEach(function (p, i) {
      if (bloqueio(config, est, p, d, dia, turno)) return;
      var chave = chaveEscolha(est[p.id], i, d, n, turno, dia);
      if (melhor && !menor(chave, chaveMelhor)) return;
      melhor = p;
      chaveMelhor = chave;
    });
    return melhor;
  }

  function menor(a, b) {
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] < b[i];
    }
    return false;
  }

  /* ---------------- geração ---------------- */

  function gerar(configBruta, opcoes) {
    var config = normalizar(configBruta);
    opcoes = opcoes || {};
    var congelar = opcoes.congelar && opcoes.congelar.grade ? opcoes.congelar : null;
    var dias = diasDoMes(config.mes);
    var turnos = ordenarTurnos(config.turnos);
    var est = estadoInicial(config.pessoas);
    var porId = {};
    config.pessoas.forEach(function (p) { porId[p.id] = p; });

    var grade = {}, descobertos = [], vagas = 0, preenchidas = 0;

    dias.forEach(function (dia, d) {
      var ds = COMUM.diaSemana(dia);
      var congelado = congelar && dia <= congelar.ate ? (congelar.grade[dia] || {}) : null;
      grade[dia] = {};
      turnos.forEach(function (turno) {
        if (turno.dias.indexOf(ds) < 0) return;
        vagas += turno.vagas;
        var escolhidos = [];
        if (congelado) {
          (congelado[turno.id] || []).forEach(function (id) {
            if (!porId[id] || escolhidos.length >= turno.vagas || est[id].dias[dia]) return;
            escolhidos.push(id);
            registrar(est, porId[id], d, dia, turno);
          });
        } else {
          while (escolhidos.length < turno.vagas) {
            var p = escolher(config, est, d, dia, turno);
            if (!p) break;
            escolhidos.push(p.id);
            registrar(est, p, d, dia, turno);
          }
        }
        grade[dia][turno.id] = escolhidos;
        preenchidas += escolhidos.length;
        if (escolhidos.length < turno.vagas) {
          descobertos.push({
            dia: dia,
            turnoId: turno.id,
            faltam: turno.vagas - escolhidos.length,
            motivo: motivoFalta(config, est, d, dia, turno)
          });
        }
      });
    });

    var porPessoa = {};
    config.pessoas.forEach(function (p) {
      var e = est[p.id];
      porPessoa[p.id] = {
        turnos: e.total,
        porTurno: e.porTurno,
        fds: e.fds,
        noites: e.noites,
        consecutivosMax: e.consecutivosMax
      };
    });

    return {
      grade: grade,
      porPessoa: porPessoa,
      descobertos: descobertos,
      cobertura: { vagas: vagas, preenchidas: preenchidas, pct: vagas ? preenchidas / vagas * 100 : 100 }
    };
  }

  /* ---------------- falta ---------------- */

  function fora(a, b) {
    return a.filter(function (id) { return b.indexOf(id) < 0; });
  }

  /* o índice olha a grade congelada inteira: quem cobre precisa caber entre o que já está
     marcado ANTES e DEPOIS do dia da falta, porque nada mais vai ser remontado */
  function resumirGrade(config, dias, turnos, grade) {
    var idx = {};
    config.pessoas.forEach(function (p) {
      idx[p.id] = { total: 0, porTurno: {}, fds: 0, dias: {}, semana: {} };
    });
    dias.forEach(function (dia) {
      turnos.forEach(function (turno) {
        ((grade[dia] || {})[turno.id] || []).forEach(function (id) {
          var e = idx[id];
          if (!e) return;
          e.total++;
          e.porTurno[turno.id] = (e.porTurno[turno.id] || 0) + 1;
          if (ehFimDeSemana(dia)) e.fds++;
          e.dias[dia] = turno.id;
          var sem = segunda(dia);
          e.semana[sem] = (e.semana[sem] || 0) + 1;
        });
      });
    });
    return idx;
  }

  function bloqueioCobertura(config, idx, mapaTurno, dias, d, turno, pessoa) {
    var dia = dias[d], e = idx[pessoa.id];
    if (e.dias[dia]) return 'indisponivel';
    if (pessoa.folgas.indexOf(COMUM.diaSemana(dia)) >= 0) return 'indisponivel';
    if (pessoa.naoFaz.indexOf(turno.id) >= 0) return 'indisponivel';
    if (ausente(pessoa, dia)) return 'indisponivel';
    if ((e.semana[segunda(dia)] || 0) >= pessoa.maxSemana) return 'semana';
    var minimo = config.regras.descansoHoras * 60;
    var antes = d > 0 ? e.dias[dias[d - 1]] : '';
    if (antes && fimAbs(d - 1, mapaTurno[antes]) + minimo > inicioAbs(d, turno)) return 'descanso';
    var depois = d + 1 < dias.length ? e.dias[dias[d + 1]] : '';
    if (depois && fimAbs(d, turno) + minimo > inicioAbs(d + 1, mapaTurno[depois])) return 'descanso';
    var corrida = 1, k;
    for (k = d - 1; k >= 0 && e.dias[dias[k]]; k--) corrida++;
    for (k = d + 1; k < dias.length && e.dias[dias[k]]; k++) corrida++;
    if (corrida > config.regras.maxConsecutivos) return 'consecutivos';
    return '';
  }

  function quemCobre(config, idx, mapaTurno, dias, d, turno) {
    var melhor = null, chaveMelhor = null, n = config.pessoas.length || 1;
    config.pessoas.forEach(function (p, i) {
      if (bloqueioCobertura(config, idx, mapaTurno, dias, d, turno, p)) return;
      var chave = chaveEscolha(idx[p.id], i, d, n, turno, dias[d]);
      if (melhor && !menor(chave, chaveMelhor)) return;
      melhor = p;
      chaveMelhor = chave;
    });
    return melhor;
  }

  function simularFalta(configBruta, grade, pessoaId, dia) {
    var config = normalizar(configBruta);
    config.pessoas = config.pessoas.map(function (p) {
      if (p.id !== pessoaId) return p;
      var copia = {};
      Object.keys(p).forEach(function (k) { copia[k] = p[k]; });
      copia.ausencias = p.ausencias.concat([{ de: dia, ate: dia }]);
      return copia;
    });

    var dias = diasDoMes(config.mes);
    var turnos = ordenarTurnos(config.turnos);
    var mapaTurno = {};
    turnos.forEach(function (t) { mapaTurno[t.id] = t; });
    var d = dias.indexOf(dia);

    /* uma falta de um dia não pode remontar o mês inteiro: só as vagas que a pessoa
       deixou naquele dia procuram alguém, o resto da grade fica exatamente como está */
    var nova = {};
    dias.forEach(function (atual) {
      var ds = COMUM.diaSemana(atual);
      nova[atual] = {};
      turnos.forEach(function (turno) {
        if (turno.dias.indexOf(ds) < 0) return;
        var antes = ((grade || {})[atual] || {})[turno.id] || [];
        nova[atual][turno.id] = atual === dia
          ? antes.filter(function (id) { return id !== pessoaId; })
          : antes.slice();
      });
    });

    if (d >= 0) {
      var idx = resumirGrade(config, dias, turnos, nova);
      turnos.forEach(function (turno) {
        var escolhidos = nova[dia][turno.id];
        if (!escolhidos) return;
        while (escolhidos.length < turno.vagas) {
          var p = quemCobre(config, idx, mapaTurno, dias, d, turno);
          if (!p) break;
          escolhidos.push(p.id);
          idx = resumirGrade(config, dias, turnos, nova);
        }
      });
    }

    var resultado = gerar(config, { congelar: { ate: dias[dias.length - 1] || dia, grade: nova } });
    var mudancas = [];
    turnos.forEach(function (turno) {
      var antes = ((grade || {})[dia] || {})[turno.id] || [];
      var depois = (resultado.grade[dia] || {})[turno.id] || [];
      var saiu = fora(antes, depois), entrou = fora(depois, antes);
      var n = Math.max(saiu.length, entrou.length);
      for (var k = 0; k < n; k++) {
        mudancas.push({ dia: dia, turnoId: turno.id, saiu: saiu[k] || '', entrou: entrou[k] || '' });
      }
    });

    return { resultado: resultado, mudancas: mudancas };
  }

  /* ---------------- validação ---------------- */

  function validar(configBruta, grade) {
    var config = normalizar(configBruta);
    var est = estadoInicial(config.pessoas);
    var turnos = ordenarTurnos(config.turnos);
    var porId = {};
    config.pessoas.forEach(function (p) { porId[p.id] = p; });
    var violacoes = [];

    diasDoMes(config.mes).forEach(function (dia, d) {
      var doDia = (grade || {})[dia] || {};
      turnos.forEach(function (turno) {
        (doDia[turno.id] || []).forEach(function (id) {
          var p = porId[id];
          if (!p) {
            violacoes.push({ dia: dia, pessoaId: id, regra: 'pessoa desconhecida' });
            return;
          }
          var e = est[id];
          if (e.dias[dia]) violacoes.push({ dia: dia, pessoaId: id, regra: 'dois turnos no mesmo dia' });
          if (p.folgas.indexOf(COMUM.diaSemana(dia)) >= 0) violacoes.push({ dia: dia, pessoaId: id, regra: 'folga fixa' });
          if (p.naoFaz.indexOf(turno.id) >= 0) violacoes.push({ dia: dia, pessoaId: id, regra: 'não faz o turno' });
          if (ausente(p, dia)) violacoes.push({ dia: dia, pessoaId: id, regra: 'ausência' });
          if ((e.semana[segunda(dia)] || 0) >= p.maxSemana) violacoes.push({ dia: dia, pessoaId: id, regra: 'limite semanal' });
          if (e.fimAnterior + config.regras.descansoHoras * 60 > inicioAbs(d, turno)) {
            violacoes.push({ dia: dia, pessoaId: id, regra: 'descanso mínimo' });
          }
          var corrida = d === e.ultimoDia + 1 ? e.consecutivos + 1 : 1;
          if (corrida > config.regras.maxConsecutivos) violacoes.push({ dia: dia, pessoaId: id, regra: 'dias consecutivos' });
          registrar(est, p, d, dia, turno);
        });
      });
    });

    return violacoes;
  }

  /* ---------------- exportação ---------------- */

  function nomePorId(config) {
    var mapa = {};
    config.pessoas.forEach(function (p) { mapa[p.id] = p.nome; });
    return mapa;
  }

  function linhasGrade(configBruta, resultado) {
    var config = normalizar(configBruta);
    var dias = diasDoMes(config.mes);
    var mapa = siglas(config.turnos);
    var linhas = [['Pessoa'].concat(dias.map(function (dia) { return COMUM.formatarData(dia); }))];
    config.pessoas.forEach(function (p) {
      linhas.push([p.nome].concat(dias.map(function (dia) {
        var doDia = ((resultado || {}).grade || {})[dia] || {};
        var achado = '';
        Object.keys(doDia).forEach(function (turnoId) {
          if (doDia[turnoId].indexOf(p.id) >= 0) achado = mapa[turnoId] || turnoId;
        });
        return achado;
      })));
    });
    return linhas;
  }

  function csvGrade(configBruta, resultado) {
    return COMUM.csv(linhasGrade(configBruta, resultado));
  }

  var SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  function csvPorDia(configBruta, resultado) {
    var config = normalizar(configBruta);
    var nomes = nomePorId(config);
    var turnos = ordenarTurnos(config.turnos);
    var linhas = [['Dia', 'Dia da semana', 'Turno', 'Horário', 'Vagas', 'Escalados', 'Faltam']];
    diasDoMes(config.mes).forEach(function (dia) {
      var ds = COMUM.diaSemana(dia);
      turnos.forEach(function (turno) {
        if (turno.dias.indexOf(ds) < 0) return;
        var escalados = ((resultado.grade || {})[dia] || {})[turno.id] || [];
        linhas.push([
          COMUM.formatarData(dia), SEMANA[ds], turno.nome,
          turno.inicio + '-' + turno.fim, String(turno.vagas),
          escalados.map(function (id) { return nomes[id] || id; }).join(', '),
          String(Math.max(0, turno.vagas - escalados.length))
        ]);
      });
    });
    return COMUM.csv(linhas);
  }

  /* ---------------- exemplo ---------------- */

  function exemplo(hoje) {
    var base = COMUM.data(hoje) || COMUM.hojeISO();
    var ano = +base.slice(0, 4), numero = +base.slice(5, 7) + 1;
    if (numero > 12) { numero = 1; ano++; }
    var mes = ano + '-' + doisDigitos(numero);
    var todos = [0, 1, 2, 3, 4, 5, 6];

    var pessoas = [
      ['ana', 'Ana Prado', 6, [0], []],
      ['bruno', 'Bruno Lima', 6, [1], []],
      ['carla', 'Carla Nunes', 5, [2], []],
      ['diego', 'Diego Alves', 6, [3], ['noite']],
      ['elisa', 'Elisa Rocha', 6, [4], []],
      ['fabio', 'Fábio Souza', 5, [5], []],
      ['gisele', 'Gisele Matos', 6, [6], []],
      ['hugo', 'Hugo Ferraz', 6, [0], []]
    ].map(function (p) {
      return { id: p[0], nome: p[1], maxSemana: p[2], folgas: p[3], naoFaz: p[4], ausencias: [] };
    });
    pessoas[7].ausencias = [{ de: mes + '-10', ate: mes + '-12' }];

    return {
      mes: mes,
      turnos: [
        { id: 'manha', nome: 'Manhã', inicio: '07:00', fim: '15:00', vagas: 2, dias: todos },
        { id: 'tarde', nome: 'Tarde', inicio: '15:00', fim: '23:00', vagas: 2, dias: todos },
        { id: 'noite', nome: 'Noite', inicio: '23:00', fim: '07:00', vagas: 1, dias: todos }
      ],
      pessoas: pessoas,
      regras: { descansoHoras: 11, maxConsecutivos: 6 }
    };
  }

  return {
    diasDoMes: diasDoMes,
    segunda: segunda,
    sigla: sigla,
    siglas: siglas,
    ehNoite: ehNoite,
    normalizar: normalizar,
    gerar: gerar,
    simularFalta: simularFalta,
    validar: validar,
    linhasGrade: linhasGrade,
    csvGrade: csvGrade,
    csvPorDia: csvPorDia,
    exemplo: exemplo
  };
});
