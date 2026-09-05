/* Leitor de boleto: linha digitável (47/48) e código de barras (44) → banco, valor e vencimento.
   Puro e sem DOM — o navegador carrega como <script>, o node --test carrega com require. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('../comum/comum.js'));
  else raiz.BOL = fabrica(raiz.COMUM);
})(this, function (COMUM) {
  'use strict';

  var BANCOS = {
    '001': 'Banco do Brasil',
    '033': 'Santander',
    '041': 'Banrisul',
    '070': 'BRB',
    '077': 'Inter',
    '104': 'Caixa',
    '208': 'BTG Pactual',
    '212': 'Original',
    '237': 'Bradesco',
    '260': 'Nubank',
    '290': 'PagBank',
    '323': 'Mercado Pago',
    '336': 'C6',
    '341': 'Itaú',
    '380': 'PicPay',
    '389': 'Mercantil',
    '403': 'Cora',
    '422': 'Safra',
    '461': 'Asaas',
    '623': 'Pan',
    '633': 'Rendimento',
    '637': 'Sofisa',
    '655': 'BV',
    '707': 'Daycoval',
    '745': 'Citibank',
    '748': 'Sicredi',
    '756': 'Sicoob'
  };

  var SEGMENTOS = {
    '1': 'Prefeitura',
    '2': 'Saneamento',
    '3': 'Energia elétrica e gás',
    '4': 'Telecomunicações',
    '5': 'Órgão governamental',
    '6': 'Carnê e outros',
    '7': 'Multa de trânsito',
    '9': 'Uso exclusivo do banco'
  };

  /* a data de vencimento é o fator somado a uma base; a base virou outra em 22/02/2025,
     quando o contador estourou 9999 e voltou a 1000 */
  var BASE_ANTIGA = '1997-10-07';
  var BASE_NOVA = '2025-02-22';

  function digitos(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }

  function zeros(v, n) {
    var t = String(v);
    while (t.length < n) t = '0' + t;
    return t;
  }

  function mod10(d) {
    var s = digitos(d), soma = 0, peso = 2;
    for (var i = s.length - 1; i >= 0; i--) {
      var p = Number(s.charAt(i)) * peso;
      soma += p > 9 ? p - 9 : p;
      peso = peso === 2 ? 1 : 2;
    }
    return (10 - soma % 10) % 10;
  }

  function mod11(d) {
    var s = digitos(d), soma = 0, peso = 2;
    for (var i = s.length - 1; i >= 0; i--) {
      soma += Number(s.charAt(i)) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    var resto = soma % 11;
    var dv = 11 - resto;
    return (resto === 0 || resto === 1 || dv === 10) ? 1 : dv;
  }

  function nomeBanco(codigo) {
    return BANCOS[codigo] || ('Banco ' + codigo);
  }

  function dataDoFator(fator, hoje) {
    var n = Number(fator);
    if (!n) return '';
    var antiga = COMUM.maisDias(BASE_ANTIGA, n);
    var nova = COMUM.maisDias(BASE_NOVA, n - 1000);
    return Math.abs(COMUM.diasEntre(antiga, hoje)) <= Math.abs(COMUM.diasEntre(nova, hoje)) ? antiga : nova;
  }

  function semDVGeral(barras) {
    return barras.slice(0, 4) + barras.slice(5);
  }

  function montarBancario(barras, linha, erros, hoje) {
    var valorDigitos = barras.slice(9, 19);
    var vencimento = dataDoFator(barras.slice(5, 9), hoje);
    var codigo = barras.slice(0, 3);
    return {
      tipo: 'bancario',
      barras: barras,
      linha: linha,
      banco: { codigo: codigo, nome: nomeBanco(codigo) },
      valor: valorDigitos === '0000000000' ? null : Number(valorDigitos) / 100,
      vencimento: vencimento,
      dias: vencimento ? COMUM.diasEntre(hoje, vencimento) : null,
      segmento: '',
      valido: erros.length === 0,
      erros: erros
    };
  }

  function montarArrecadacao(barras, linha, erros, hoje) {
    var identificador = barras.charAt(2);
    var emReais = identificador === '6' || identificador === '8';
    var valor = Number(barras.slice(4, 15)) / 100;
    return {
      tipo: 'arrecadacao',
      barras: barras,
      linha: linha,
      banco: { codigo: '', nome: '' },
      valor: emReais && valor > 0 ? valor : null,
      vencimento: '',
      dias: null,
      segmento: SEGMENTOS[barras.charAt(1)] || 'Convênio',
      valido: erros.length === 0,
      erros: erros
    };
  }

  function dvDeBloco(identificador) {
    return (identificador === '6' || identificador === '7') ? mod10 : mod11;
  }

  function gerarLinha(barras) {
    var b = digitos(barras);
    if (b.length !== 44) return '';
    if (b.charAt(0) === '8') {
      var dv = dvDeBloco(b.charAt(2)), saida = '';
      for (var i = 0; i < 4; i++) {
        var bloco = b.slice(i * 11, i * 11 + 11);
        saida += bloco + dv(bloco);
      }
      return saida;
    }
    var c1 = b.slice(0, 4) + b.slice(19, 24);
    var c2 = b.slice(24, 34);
    var c3 = b.slice(34, 44);
    return c1 + mod10(c1) + c2 + mod10(c2) + c3 + mod10(c3) + b.charAt(4) + b.slice(5, 19);
  }

  function lerBancarioLinha(linha, hoje) {
    var c1 = linha.slice(0, 9), c2 = linha.slice(10, 20), c3 = linha.slice(21, 31);
    var dvGeral = linha.charAt(32), campo5 = linha.slice(33);
    var barras = c1.slice(0, 4) + dvGeral + campo5 + c1.slice(4) + c2 + c3;
    var erros = [];
    if (String(mod10(c1)) !== linha.charAt(9)) erros.push('dígito verificador do campo 1 não bate');
    if (String(mod10(c2)) !== linha.charAt(20)) erros.push('dígito verificador do campo 2 não bate');
    if (String(mod10(c3)) !== linha.charAt(31)) erros.push('dígito verificador do campo 3 não bate');
    if (String(mod11(semDVGeral(barras))) !== dvGeral) erros.push('dígito verificador geral não bate');
    return montarBancario(barras, linha, erros, hoje);
  }

  function lerBancarioBarras(barras, hoje) {
    var erros = [];
    if (String(mod11(semDVGeral(barras))) !== barras.charAt(4)) erros.push('dígito verificador geral não bate');
    return montarBancario(barras, gerarLinha(barras), erros, hoje);
  }

  function lerArrecadacaoLinha(linha, hoje) {
    var barras = '', erros = [], i;
    for (i = 0; i < 4; i++) barras += linha.slice(i * 12, i * 12 + 11);
    var dv = dvDeBloco(barras.charAt(2));
    for (i = 0; i < 4; i++) {
      var bloco = linha.slice(i * 12, i * 12 + 11);
      if (String(dv(bloco)) !== linha.charAt(i * 12 + 11)) {
        erros.push('dígito verificador do bloco ' + (i + 1) + ' não bate');
      }
    }
    erros = erros.concat(erroGeralArrecadacao(barras));
    return montarArrecadacao(barras, linha, erros, hoje);
  }

  function erroGeralArrecadacao(barras) {
    var dv = dvDeBloco(barras.charAt(2));
    return String(dv(barras.slice(0, 3) + barras.slice(4))) === barras.charAt(3)
      ? [] : ['dígito verificador geral não bate'];
  }

  function lerArrecadacaoBarras(barras, hoje) {
    return montarArrecadacao(barras, gerarLinha(barras), erroGeralArrecadacao(barras), hoje);
  }

  function ler(texto, hoje) {
    hoje = hoje || COMUM.hojeISO();
    var d = digitos(texto);
    if (!d) return { erro: 'não achei dígitos aqui — cole a linha digitável do boleto' };
    if (d.length === 47) return lerBancarioLinha(d, hoje);
    if (d.length === 48) {
      if (d.charAt(0) !== '8') return { erro: '48 dígitos só existem em conta de concessionária, que começa com 8' };
      return lerArrecadacaoLinha(d, hoje);
    }
    if (d.length === 44) {
      return d.charAt(0) === '8' ? lerArrecadacaoBarras(d, hoje) : lerBancarioBarras(d, hoje);
    }
    return { erro: 'esperava 44, 47 ou 48 dígitos e vieram ' + d.length };
  }

  function lerLote(texto, hoje) {
    hoje = hoje || COMUM.hojeISO();
    var leituras = [];
    String(texto == null ? '' : texto).split(/\r?\n/).forEach(function (l, i) {
      var limpa = COMUM.limpo(l);
      if (!limpa) return;
      var leitura = ler(limpa, hoje);
      /* a linha de origem fica junto para a tela poder apontar qual foi rejeitada e por quê */
      leitura.numero = i + 1;
      leitura.texto = limpa;
      leituras.push(leitura);
    });
    return leituras;
  }

  function motivoSemBoleto(leituras) {
    var ruins = (leituras || []).filter(function (l) { return l && l.erro; });
    if (!ruins.length) return '';
    if (ruins.length === 1) return 'Essa linha não é um boleto: ' + ruins[0].erro + '.';

    var ordem = [], porErro = {};
    ruins.forEach(function (l, i) {
      if (!porErro[l.erro]) { porErro[l.erro] = []; ordem.push(l.erro); }
      porErro[l.erro].push(l.numero || i + 1);
    });
    var partes = ordem.slice(0, 3).map(function (e) {
      var ns = porErro[e];
      return e + ' (' + (ns.length === 1 ? 'linha ' : 'linhas ') + ns.join(', ') + ')';
    });
    if (ordem.length > 3) partes.push(COMUM.plural(ordem.length - 3, 'outro motivo', 'outros motivos'));
    return 'Nenhuma das ' + ruins.length + ' linhas é um boleto: ' + partes.join('; ') + '.';
  }

  function situacao(leitura) {
    if (!leitura || leitura.erro) return 'não deu para ler';
    if (!leitura.valido) return 'dígito verificador não bate';
    if (!leitura.vencimento) return 'sem vencimento';
    if (leitura.dias < 0) return 'vencido há ' + COMUM.plural(-leitura.dias, 'dia', 'dias');
    if (leitura.dias === 0) return 'vence hoje';
    return 'vence em ' + COMUM.plural(leitura.dias, 'dia', 'dias');
  }

  /* boleto sem vencimento (e linha rejeitada) vai para o fim: quem paga lê a lista em ordem de saída do dinheiro */
  function chaveOrdem(l) {
    return (l && !l.erro && l.vencimento) ? l.vencimento : '9999-99-99';
  }

  /* a exportação e a tela saem daqui: CSV, TSV e tabela na mesma ordem, com as mesmas colunas */
  function linhasLote(leituras) {
    var linhas = [['Banco', 'Vencimento', 'Dias', 'Valor', 'Situação', 'Linha digitável', 'Código de barras']];
    (leituras || []).slice().sort(function (a, b) {
      var x = chaveOrdem(a), y = chaveOrdem(b);
      return x < y ? -1 : x > y ? 1 : 0;
    }).forEach(function (l) {
      if (l.erro) {
        linhas.push(['', '', '', '', l.erro, '', '']);
        return;
      }
      linhas.push([
        l.tipo === 'arrecadacao' ? l.segmento : l.banco.nome,
        COMUM.formatarData(l.vencimento),
        l.vencimento ? l.dias : '',
        l.valor == null ? '' : COMUM.formatarValor(l.valor),
        situacao(l),
        l.linha,
        l.barras
      ]);
    });
    return linhas;
  }

  function csvLote(leituras) {
    return COMUM.csv(linhasLote(leituras));
  }

  /* ---------------- exemplo ---------------- */

  function fatorDe(iso) {
    var n = COMUM.diasEntre(BASE_NOVA, iso) + 1000;
    if (n < 1) n = COMUM.diasEntre(BASE_ANTIGA, iso);
    return zeros(n, 4);
  }

  function sorteados(sorteio, n) {
    var s = '';
    for (var i = 0; i < n; i++) s += String(Math.floor(sorteio() * 10));
    return s;
  }

  function barrasBancario(banco, fator, centavos, livre) {
    var base = banco + '9' + fator + zeros(centavos, 10) + livre;
    return base.slice(0, 4) + mod11(base) + base.slice(4);
  }

  function barrasArrecadacao(segmento, identificador, centavos, livre) {
    var base = '8' + segmento + identificador + zeros(centavos, 11) + livre;
    return base.slice(0, 3) + dvDeBloco(identificador)(base) + base.slice(3);
  }

  function exemplo(hoje) {
    hoje = hoje || COMUM.hojeISO();
    var sorteio = COMUM.lcg(19);
    var pedidos = [
      ['341', -5, 128790],
      ['237', 0, 45600],
      ['001', 2, 231045],
      ['104', 7, 89900],
      ['033', 20, 1520000],
      ['756', 45, 0]
    ];
    var linhas = pedidos.map(function (p) {
      var vencimento = COMUM.maisDias(hoje, p[1]);
      return gerarLinha(barrasBancario(p[0], fatorDe(vencimento), p[2], sorteados(sorteio, 25)));
    });
    linhas.push(gerarLinha(barrasArrecadacao('3', '6', 18790, sorteados(sorteio, 29))));

    var certa = gerarLinha(barrasBancario('237', fatorDe(COMUM.maisDias(hoje, 12)), 67500, sorteados(sorteio, 25)));
    var trocado = String((Number(certa.charAt(9)) + 1) % 10);
    linhas.push(certa.slice(0, 9) + trocado + certa.slice(10));

    return linhas.join('\n');
  }

  return {
    BANCOS: BANCOS,
    SEGMENTOS: SEGMENTOS,
    mod10: mod10,
    mod11: mod11,
    ler: ler,
    gerarLinha: gerarLinha,
    lerLote: lerLote,
    motivoSemBoleto: motivoSemBoleto,
    situacao: situacao,
    linhasLote: linhasLote,
    csvLote: csvLote,
    exemplo: exemplo
  };
});
