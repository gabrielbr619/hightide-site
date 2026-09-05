/* Núcleo do conciliador: lê o extrato (OFX ou planilha) e os lançamentos do sistema,
   cruza os dois lados por valor, data, documento e soma, e exporta o que sobrou. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('../comum/comum.js'));
  else raiz.CONC = fabrica(raiz.COMUM);
})(this, function (COMUM) {
  'use strict';

  var CAMPOS = ['data', 'valor', 'debito', 'credito', 'tipo', 'descricao', 'documento'];

  /* ---------------- OFX ---------------- */

  var ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

  function entidades(s) {
    return s.replace(/&(#\d+|[a-z]+);/gi, function (todo, corpo) {
      if (corpo.charAt(0) === '#') return String.fromCharCode(Number(corpo.slice(1)));
      var achado = ENTIDADES[corpo.toLowerCase()];
      return achado === undefined ? todo : achado;
    });
  }

  function tag(bloco, nome) {
    var m = bloco.match(new RegExp('<' + nome + '>([^<\\r\\n]*)', 'i'));
    return m ? entidades(COMUM.limpo(m[1])) : '';
  }

  /* o SGML do OFX não fecha as tags folha: o valor vai do '>' até a próxima tag ou quebra de linha */
  function lerOFX(texto) {
    var partes = String(texto == null ? '' : texto).split(/<STMTTRN>/i).slice(1);
    var saida = [];
    partes.forEach(function (bruto, i) {
      var corte = bruto.search(/<\/STMTTRN>|<\/BANKTRANLIST>|<LEDGERBAL>/i);
      var bloco = corte >= 0 ? bruto.slice(0, corte) : bruto;
      var valor = COMUM.numero(tag(bloco, 'TRNAMT'));
      if (valor === null) return;
      var carimbo = tag(bloco, 'DTPOSTED').replace(/\D/g, '').slice(0, 8);
      saida.push({
        data: carimbo.length === 8 ? COMUM.data(carimbo) : '',
        valor: valor,
        descricao: tag(bloco, 'MEMO') || tag(bloco, 'NAME'),
        documento: tag(bloco, 'CHECKNUM'),
        id: tag(bloco, 'FITID') || ('ofx-' + (i + 1))
      });
    });
    return saida;
  }

  /* ---------------- planilha ---------------- */

  var CABECALHO = {
    data: /data/i,
    valor: /valor|montante/i,
    debito: /d[ée]bito|sa[ií]da/i,
    credito: /cr[ée]dito|entrada/i,
    tipo: /tipo|natureza|d\/c/i,
    descricao: /hist[óo]rico|descri|memo|lan[çc]amento/i,
    documento: /doc|n[úu]mero|nº|ref/i
  };

  var CONTEUDO = {
    data: ['data'],
    valor: ['numero'],
    debito: ['numero'],
    credito: ['numero'],
    tipo: ['categoria'],
    descricao: ['texto', 'categoria'],
    documento: ['numero', 'texto', 'categoria', 'documento']
  };

  /* coluna sem cabeçalho reconhecível só entra onde o conteúdo basta para decidir */
  var MINIMO = { data: 1, valor: 1, descricao: 1, debito: 3, credito: 3, tipo: 3, documento: 3 };
  var ORDEM = ['data', 'debito', 'credito', 'valor', 'tipo', 'documento', 'descricao'];

  function detectarColunas(cabecalho, linhas) {
    var cab = cabecalho || [], dados = linhas || [];
    var tipos = cab.map(function (nome, i) {
      return COMUM.tipoColuna(nome, dados.map(function (l) { return l && l[i]; }));
    });
    var mapa = {}, usadas = {};
    CAMPOS.forEach(function (c) { mapa[c] = -1; });

    ORDEM.forEach(function (campo) {
      var melhor = -1, melhorPontos = 0;
      cab.forEach(function (nome, i) {
        if (usadas[i]) return;
        var combina = CONTEUDO[campo].indexOf(tipos[i]) >= 0;
        if ((campo === 'data' || campo === 'valor' || campo === 'debito' || campo === 'credito') && !combina) return;
        var pontos = (CABECALHO[campo].test(COMUM.limpo(nome)) ? 3 : 0) + (combina ? 1 : 0);
        if (pontos > melhorPontos) { melhorPontos = pontos; melhor = i; }
      });
      if (melhor >= 0 && melhorPontos >= MINIMO[campo]) { mapa[campo] = melhor; usadas[melhor] = true; }
    });
    return mapa;
  }

  var SAIDA = /^d$|^deb|d[ée]bito|sa[ií]da|despesa|pagamento/i;
  var ENTRADA = /^c$|^cred|cr[ée]dito|entrada|receita|recebimento/i;

  function celula(linha, i) {
    return i >= 0 && linha && i < linha.length ? COMUM.limpo(linha[i]) : '';
  }

  function valorDaLinha(linha, col) {
    if (col.debito >= 0 || col.credito >= 0) {
      var d = COMUM.numero(celula(linha, col.debito));
      var c = COMUM.numero(celula(linha, col.credito));
      if (d === null && c === null) return null;
      return (c || 0) - (d || 0);
    }
    var v = COMUM.numero(celula(linha, col.valor));
    if (v === null) return null;
    var natureza = celula(linha, col.tipo);
    if (natureza) {
      if (SAIDA.test(natureza)) return -Math.abs(v);
      if (ENTRADA.test(natureza)) return Math.abs(v);
    }
    return v;
  }

  function lerTabela(cabecalho, linhas, mapa) {
    mapa = mapa || {};
    var col = detectarColunas(cabecalho, linhas);
    CAMPOS.forEach(function (c) {
      if (mapa[c] !== undefined && mapa[c] !== null && mapa[c] !== '') col[c] = Number(mapa[c]);
    });
    var saida = [];
    /* a lista continua sendo o contrato; a contagem viaja junto para a tela poder avisar
       quantas linhas ficaram de fora em vez de o total encolher em silêncio */
    saida.ignoradas = 0;
    (linhas || []).forEach(function (l, i) {
      var valor = valorDaLinha(l, col);
      if (valor === null) { saida.ignoradas++; return; }
      saida.push({
        data: col.data >= 0 ? COMUM.data(celula(l, col.data)) : '',
        valor: mapa.inverter ? -valor : valor,
        descricao: celula(l, col.descricao),
        documento: celula(l, col.documento),
        id: 'linha-' + (i + 2)
      });
    });
    return saida;
  }

  /* ---------------- conciliação ---------------- */

  function arredondar(n) { return Math.round(n * 100) / 100; }

  /* o extrato pacota o documento com zeros à esquerda e o sistema não: 000451 e 451 são o mesmo */
  function chaveDoc(s) {
    var t = COMUM.semAcento(COMUM.limpo(s)).toUpperCase().replace(/[^A-Z0-9]/g, '');
    /* tirar o zero na mão, e não por Number(): acima de 17 dígitos o número perde o fim do documento */
    return /^\d+$/.test(t) ? (t.replace(/^0+/, '') || '0') : t;
  }

  function preparar(lista) {
    return (lista || []).map(function (l, i) {
      var x = l || {};
      return {
        orig: x, i: i, usado: false,
        data: COMUM.limpo(x.data),
        valor: Number(x.valor) || 0,
        desc: COMUM.limpo(x.descricao),
        doc: chaveDoc(x.documento)
      };
    });
  }

  function pendentes(lista) {
    return lista.filter(function (x) { return !x.usado; });
  }

  /* teto de complexidade do trio: 120 candidatos são ~280 mil somas, o limite do que cabe num clique */
  var TETO_TRIOS = 120;

  /* soma de 2 ou 3 lançamentos que fecha o valor do banco; a ordem da janela mantém o resultado estável */
  function combinar(janela, alvo, tolerancia) {
    var i, j, k;
    for (i = 0; i < janela.length; i++) {
      for (j = i + 1; j < janela.length; j++) {
        if (Math.abs(janela[i].valor + janela[j].valor - alvo) <= tolerancia) return [janela[i], janela[j]];
      }
    }
    if (janela.length > TETO_TRIOS) return null;
    for (i = 0; i < janela.length; i++) {
      for (j = i + 1; j < janela.length; j++) {
        for (k = j + 1; k < janela.length; k++) {
          if (Math.abs(janela[i].valor + janela[j].valor + janela[k].valor - alvo) <= tolerancia) {
            return [janela[i], janela[j], janela[k]];
          }
        }
      }
    }
    return null;
  }

  function conciliar(banco, sistema, opcoes) {
    opcoes = opcoes || {};
    var tolValor = opcoes.toleranciaValor == null ? 0.01 : Math.abs(Number(opcoes.toleranciaValor));
    var tolDias = opcoes.toleranciaDias == null ? 3 : Math.abs(Number(opcoes.toleranciaDias));
    var b = preparar(banco), s = preparar(sistema);
    var pares = [];

    function fechar(x, lista, tipo, motivo) {
      x.usado = true;
      lista.forEach(function (y) { y.usado = true; });
      pares.push({
        banco: x.orig,
        sistema: lista.map(function (y) { return y.orig; }),
        tipo: tipo,
        motivo: motivo,
        ordem: x.data || '9999-99-99',
        indice: x.i
      });
    }

    b.forEach(function (x) {
      if (x.usado || !x.data) return;
      var melhor = null, melhorSim = -1;
      s.forEach(function (y) {
        if (y.usado || y.data !== x.data) return;
        if (Math.abs(x.valor - y.valor) > tolValor) return;
        var sim = COMUM.similaridade(x.desc, y.desc);
        if (sim > melhorSim) { melhorSim = sim; melhor = y; }
      });
      if (melhor) fechar(x, [melhor], 'certo', 'valor e data batem');
    });

    b.forEach(function (x) {
      if (x.usado || !x.data) return;
      var melhor = null, melhorDif = Infinity, melhorSim = -1;
      s.forEach(function (y) {
        if (y.usado || !y.data) return;
        if (Math.abs(x.valor - y.valor) > tolValor) return;
        var dif = Math.abs(COMUM.diasEntre(x.data, y.data));
        if (dif > tolDias) return;
        var sim = COMUM.similaridade(x.desc, y.desc);
        if (dif < melhorDif || (dif === melhorDif && sim > melhorSim)) {
          melhorDif = dif; melhorSim = sim; melhor = y;
        }
      });
      if (melhor) fechar(x, [melhor], 'provavel', 'data difere em ' + COMUM.plural(melhorDif, 'dia', 'dias'));
    });

    b.forEach(function (x) {
      if (x.usado || !x.doc) return;
      var melhor = null;
      for (var i = 0; i < s.length && !melhor; i++) {
        if (!s[i].usado && s[i].doc === x.doc && Math.abs(x.valor - s[i].valor) > tolValor) melhor = s[i];
      }
      if (melhor) {
        fechar(x, [melhor], 'divergente', 'valor difere em R$ ' + COMUM.formatarValor(Math.abs(x.valor - melhor.valor)));
      }
    });

    if (pendentes(b).length <= 400 && pendentes(s).length <= 400) {
      b.forEach(function (x) {
        if (x.usado || !x.data) return;
        var janela = pendentes(s).filter(function (y) {
          return y.data && Math.abs(COMUM.diasEntre(x.data, y.data)) <= tolDias;
        });
        var achado = combinar(janela, x.valor, tolValor);
        if (achado) fechar(x, achado, 'provavel', 'soma de ' + achado.length + ' lançamentos');
      });
    }

    pares.sort(function (p, q) {
      if (p.ordem !== q.ordem) return p.ordem < q.ordem ? -1 : 1;
      return p.indice - q.indice;
    });
    pares.forEach(function (p) { delete p.ordem; delete p.indice; });

    var soBanco = pendentes(b).map(function (x) { return x.orig; });
    var soSistema = pendentes(s).map(function (y) { return y.orig; });

    function faixa(tipo) {
      var n = 0, valor = 0;
      pares.forEach(function (p) {
        if (p.tipo !== tipo) return;
        n++;
        valor += Number(p.banco.valor) || 0;
      });
      return { n: n, valor: arredondar(valor) };
    }
    function total(lista) {
      var v = 0;
      lista.forEach(function (l) { v += Number(l.valor) || 0; });
      return arredondar(v);
    }

    var saldoBanco = total(banco || []);
    var saldoSistema = total(sistema || []);

    return {
      pares: pares,
      soBanco: soBanco,
      soSistema: soSistema,
      resumo: {
        conciliados: faixa('certo'),
        provaveis: faixa('provavel'),
        divergentes: faixa('divergente'),
        soBanco: { n: soBanco.length, valor: total(soBanco) },
        soSistema: { n: soSistema.length, valor: total(soSistema) },
        saldoBanco: saldoBanco,
        saldoSistema: saldoSistema,
        diferenca: arredondar(saldoBanco - saldoSistema)
      }
    };
  }

  /* volume movimentado por situação: a régua e o cartão precisam do módulo, porque o total
     assinado de um conjunto que tem entrada e saída encolhe (ou zera) sem que ele tenha sumido */
  function volumes(resultado) {
    var r = resultado || {};
    var saida = { certo: 0, provavel: 0, divergente: 0, soBanco: 0, soSistema: 0 };
    (r.pares || []).forEach(function (p) {
      if (saida[p.tipo] === undefined) return;
      saida[p.tipo] += Math.abs(Number(p.banco && p.banco.valor) || 0);
    });
    (r.soBanco || []).forEach(function (l) { saida.soBanco += Math.abs(Number(l.valor) || 0); });
    (r.soSistema || []).forEach(function (l) { saida.soSistema += Math.abs(Number(l.valor) || 0); });
    Object.keys(saida).forEach(function (k) { saida[k] = arredondar(saida[k]); });
    return saida;
  }

  /* sinal antes do símbolo e menos tipográfico (−), como a moeda sai em pt-BR */
  function reais(v) {
    var n = Number(v) || 0;
    return (n < 0 ? '−' : '') + 'R$ ' + COMUM.formatarValor(Math.abs(n));
  }

  /* ---------------- exportação ---------------- */

  var ROTULO = { certo: 'conciliado', provavel: 'provável', divergente: 'divergente' };

  function linhaLancamento(origem, l, situacao) {
    return [origem, COMUM.formatarData(l.data), l.descricao || '', l.documento || '',
      COMUM.formatarValor(l.valor), situacao];
  }

  function csvPendencias(resultado) {
    var r = resultado || {};
    var linhas = [['Origem', 'Data', 'Descrição', 'Documento', 'Valor', 'Situação']];
    (r.soBanco || []).forEach(function (l) { linhas.push(linhaLancamento('Banco', l, 'só no banco')); });
    (r.soSistema || []).forEach(function (l) { linhas.push(linhaLancamento('Sistema', l, 'só no sistema')); });
    (r.pares || []).forEach(function (p) {
      if (p.tipo !== 'divergente') return;
      linhas.push(linhaLancamento('Banco', p.banco, 'divergente — ' + p.motivo));
      p.sistema.forEach(function (l) { linhas.push(linhaLancamento('Sistema', l, 'divergente — ' + p.motivo)); });
    });
    return COMUM.csv(linhas);
  }

  function csvCompleto(resultado) {
    var r = resultado || {};
    var linhas = [['Situação', 'Motivo', 'Data banco', 'Descrição banco', 'Documento banco', 'Valor banco',
      'Data sistema', 'Descrição sistema', 'Documento sistema', 'Valor sistema']];
    (r.pares || []).forEach(function (p) {
      p.sistema.forEach(function (l, i) {
        var cabeca = i === 0
          ? [COMUM.formatarData(p.banco.data), p.banco.descricao || '', p.banco.documento || '', COMUM.formatarValor(p.banco.valor)]
          : ['', '', '', ''];
        linhas.push([ROTULO[p.tipo] || p.tipo, p.motivo].concat(cabeca,
          [COMUM.formatarData(l.data), l.descricao || '', l.documento || '', COMUM.formatarValor(l.valor)]));
      });
    });
    (r.soBanco || []).forEach(function (l) {
      linhas.push(['só no banco', '', COMUM.formatarData(l.data), l.descricao || '', l.documento || '',
        COMUM.formatarValor(l.valor), '', '', '', '']);
    });
    (r.soSistema || []).forEach(function (l) {
      linhas.push(['só no sistema', '', '', '', '', '', COMUM.formatarData(l.data), l.descricao || '',
        l.documento || '', COMUM.formatarValor(l.valor)]);
    });
    return COMUM.csv(linhas);
  }

  /* ---------------- exemplo ---------------- */

  /* Um mês de uma empresa fictícia: o extrato sai do banco em OFX e os lançamentos saem do ERP em
     CSV com tipo D/C. As diferenças plantadas são as do fechamento real — tarifa que ninguém lança,
     boleto pago com juros, pagamento parcelado e lançamento digitado duas vezes. */
  var BANCO_EXEMPLO = [
    [-29, -2450.00, 'PAGTO FORNECEDOR ALFA', ''],
    [-28, -378.90, 'DEBITO ENERGIA ELETRICA', ''],
    [-27, 5200.00, 'TED RECEBIDA CLIENTE BETA', ''],
    [-26, -1180.45, 'PAGTO BOLETO GAMA', ''],
    [-26, -49.90, 'TARIFA PACOTE DE SERVICOS', ''],
    [-25, -96.30, 'DEBITO INTERNET', ''],
    [-24, 3120.75, 'PIX RECEBIDO CLIENTE DELTA', ''],
    [-23, -740.00, 'PAGTO ALUGUEL SALA', ''],
    [-22, -215.60, 'DEBITO AGUA E ESGOTO', ''],
    [-21, 890.00, 'PIX RECEBIDO CLIENTE EPSILON', ''],
    [-20, -1105.00, 'PAGTO FORNECEDOR SIGMA', ''],
    [-19, -1560.20, 'PAGTO FOLHA SALARIOS', ''],
    [-18, -320.15, 'DEBITO TELEFONIA', ''],
    [-16, 2740.50, 'TED RECEBIDA CLIENTE ZETA', ''],
    [-15, -1500.00, 'PAGTO FORNECEDOR THETA', ''],
    [-14, -498.70, 'PAGTO MATERIAL ESCRITORIO', ''],
    [-13, 1680.00, 'PIX RECEBIDO CLIENTE LAMBDA', ''],
    [-12, -1875.00, 'PAGTO FORNECEDOR OMEGA', ''],
    [-11, -3.27, 'IOF SOBRE OPERACAO', ''],
    [-10, 1430.25, 'PIX RECEBIDO CLIENTE IOTA', ''],
    [-8, -655.40, 'DEBITO SEGURO EMPRESARIAL', ''],
    [-7, -845.30, 'PAGTO FRETE ENTREGA', ''],
    [-6, -1250.00, 'PAGTO BOLETO IOTA SERVICOS', '000451'],
    [-5, -1290.00, 'PAGTO HONORARIOS CONTABEIS', ''],
    [-3, 2050.00, 'TED RECEBIDA CLIENTE KAPPA', ''],
    [-1, 12.45, 'RENDIMENTO CONTA', '']
  ];

  var SISTEMA_EXEMPLO = [
    [-29, 'Pagamento Alfa Distribuidora', '', 'D', 2450.00],
    [-28, 'Conta de energia elétrica', '', 'D', 378.90],
    [-27, 'Recebimento Beta Comércio', '', 'C', 5200.00],
    [-26, 'Pagamento Gama Serviços', '', 'D', 1180.45],
    [-25, 'Internet do escritório', '', 'D', 96.30],
    [-24, 'Recebimento Delta Ltda', '', 'C', 3120.75],
    [-23, 'Aluguel da sala comercial', '', 'D', 740.00],
    [-22, 'Conta de água', '', 'D', 215.60],
    [-22, 'Pagamento Sigma Materiais', '', 'D', 1105.00],
    [-21, 'Recebimento Epsilon', '', 'C', 890.00],
    [-19, 'Folha de pagamento', '', 'D', 1560.20],
    [-18, 'Telefonia móvel', '', 'D', 320.15],
    [-16, 'Recebimento Zeta', '', 'C', 2740.50],
    [-16, 'Theta Insumos parcela 2', '', 'D', 600.00],
    [-15, 'Theta Insumos parcela 1', '', 'D', 900.00],
    [-14, 'Material de escritório', '', 'D', 498.70],
    [-14, 'Material de escritório lançado outra vez', '', 'D', 498.70],
    [-12, 'Recebimento Lambda', '', 'C', 1680.00],
    [-12, 'Pagamento Omega Insumos', '', 'D', 1875.00],
    [-10, 'Recebimento Iota', '', 'C', 1430.25],
    [-9, 'Cheque 8421 não compensado', '8421', 'D', 820.00],
    [-8, 'Seguro empresarial', '', 'D', 655.40],
    [-6, 'Boleto Iota Serviços', '000451', 'D', 1230.00],
    [-5, 'Honorários do contador', '', 'D', 1290.00],
    [-4, 'Frete de entrega', '', 'D', 845.30],
    [-4, 'Boleto Mu Papelaria não pago', '', 'D', 430.00],
    [-3, 'Recebimento Kappa', '', 'C', 2050.00]
  ];

  function carimbo(iso) { return iso.replace(/-/g, '') + '120000[-3:BRT]'; }

  function exemplo(hoje) {
    var base = COMUM.limpo(hoje) || COMUM.hojeISO();
    var inicio = COMUM.maisDias(base, -30);
    var linhas = [
      'OFXHEADER:100', 'DATA:OFXSGML', 'VERSION:102', 'SECURITY:NONE',
      'ENCODING:USASCII', 'CHARSET:1252', 'COMPRESSION:NONE',
      'OLDFILEUID:NONE', 'NEWFILEUID:NONE', '',
      '<OFX>', '<BANKMSGSRSV1><STMTTRNRS>', '<TRNUID>1', '<STMTRS>', '<CURDEF>BRL',
      '<BANKACCTFROM><BANKID>341<ACCTID>0041233-7<ACCTTYPE>CHECKING</BANKACCTFROM>',
      '<BANKTRANLIST>', '<DTSTART>' + carimbo(inicio), '<DTEND>' + carimbo(base)
    ];
    var saldo = 0;
    BANCO_EXEMPLO.forEach(function (t, i) {
      var data = COMUM.maisDias(base, t[0]);
      saldo += t[1];
      linhas.push('<STMTTRN>');
      linhas.push('<TRNTYPE>' + (t[1] < 0 ? 'DEBIT' : 'CREDIT'));
      linhas.push('<DTPOSTED>' + carimbo(data));
      linhas.push('<TRNAMT>' + t[1].toFixed(2).replace('.', ','));
      linhas.push('<FITID>' + data.replace(/-/g, '') + ('00' + (i + 1)).slice(-3));
      if (t[3]) linhas.push('<CHECKNUM>' + t[3]);
      linhas.push('<MEMO>' + t[2]);
      linhas.push('</STMTTRN>');
    });
    linhas.push('</BANKTRANLIST>');
    linhas.push('<LEDGERBAL><BALAMT>' + (18740.55 + saldo).toFixed(2).replace('.', ',') +
      '<DTASOF>' + carimbo(base) + '</LEDGERBAL>');
    linhas.push('</STMTRS></STMTTRNRS></BANKMSGSRSV1>');
    linhas.push('</OFX>');

    var planilha = [['Data', 'Histórico', 'Documento', 'Tipo', 'Valor']];
    SISTEMA_EXEMPLO.forEach(function (l) {
      planilha.push([COMUM.formatarData(COMUM.maisDias(base, l[0])), l[1], l[2], l[3],
        COMUM.formatarValor(l[4])]);
    });

    return {
      banco: { nome: 'extrato-exemplo.ofx', texto: linhas.join('\r\n') + '\r\n' },
      sistema: { nome: 'lancamentos-exemplo.csv', texto: COMUM.csv(planilha) }
    };
  }

  return {
    lerOFX: lerOFX,
    detectarColunas: detectarColunas,
    lerTabela: lerTabela,
    conciliar: conciliar,
    volumes: volumes,
    reais: reais,
    csvPendencias: csvPendencias,
    csvCompleto: csvCompleto,
    exemplo: exemplo
  };
});
