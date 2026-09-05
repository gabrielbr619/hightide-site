/* Núcleo do painel automático: perfila as colunas da planilha, escolhe o que medir,
   agrega no tempo e por categoria e desenha os gráficos. Sem DOM. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('../comum/comum.js'));
  else raiz.PAINEL = fabrica(raiz.COMUM);
})(this, function (COMUM) {
  'use strict';

  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  var REG_ID = /^id$|c[óo]digo|^n[º°]?$/;
  var REG_METRICA = /valor|total|receita|venda|fatur|preco|montante/;
  var REG_TEMPO = /data|emiss|venc|compet/;
  var REG_DIMENSAO = /vendedor|categoria|regiao|cliente|produto|status|tipo|filial|loja|setor|canal/;

  function chaveCabecalho(nome) {
    return COMUM.semAcento(COMUM.limpo(nome)).toLowerCase();
  }

  function celula(linha, indice) {
    return indice >= 0 && linha && indice < linha.length ? COMUM.limpo(linha[indice]) : '';
  }

  /* ---------------- perfil das colunas ---------------- */

  function frequencias(valores) {
    var contagem = {}, posicao = {}, ordem = [];
    valores.forEach(function (v) {
      /* posição memorizada aqui: com indexOf no comparador, coluna de valores todos distintos (ID, e-mail) empata sempre e o sort vira quadrático */
      if (contagem[v] === undefined) { contagem[v] = 0; posicao[v] = ordem.length; ordem.push(v); }
      contagem[v]++;
    });
    var top = ordem.slice().sort(function (a, b) {
      return contagem[b] - contagem[a] || posicao[a] - posicao[b];
    }).slice(0, 5).map(function (v) {
      return { valor: v, n: contagem[v] };
    });
    return { distintos: ordem.length, top: top };
  }

  function perfilarColuna(nome, indice, linhas) {
    var valores = linhas.map(function (l) { return celula(l, indice); });
    var cheios = valores.filter(function (v) { return v !== ''; });
    var freq = frequencias(cheios);
    var tipo = COMUM.tipoColuna(nome, cheios);

    var numeros = [], inteiros = true;
    cheios.forEach(function (v) {
      var n = COMUM.numero(v);
      if (n === null) { inteiros = false; return; }
      numeros.push(n);
      if (n !== Math.floor(n)) inteiros = false;
    });
    var todosNumeros = numeros.length === cheios.length && cheios.length > 0;
    var unicos = freq.distintos === cheios.length && cheios.length > 1;
    if ((tipo === 'numero' && todosNumeros && inteiros && unicos) || REG_ID.test(chaveCabecalho(nome))) {
      tipo = 'id';
    }

    var min = null, max = null, soma = null, media = null;
    if ((tipo === 'numero' || tipo === 'id') && numeros.length) {
      soma = 0;
      numeros.forEach(function (n) {
        soma += n;
        if (min === null || n < min) min = n;
        if (max === null || n > max) max = n;
      });
      media = soma / numeros.length;
    } else if (tipo === 'data') {
      cheios.forEach(function (v) {
        var iso = COMUM.data(v);
        if (!iso) return;
        if (min === null || iso < min) min = iso;
        if (max === null || iso > max) max = iso;
      });
    }

    return {
      indice: indice,
      nome: COMUM.limpo(nome),
      tipo: tipo,
      distintos: freq.distintos,
      vazios: valores.length - cheios.length,
      min: min,
      max: max,
      soma: soma,
      media: media,
      top: freq.top
    };
  }

  function perfilar(cabecalho, linhas) {
    var dados = linhas || [];
    return (cabecalho || []).map(function (nome, i) {
      return perfilarColuna(nome, i, dados);
    });
  }

  function primeiro(lista, preferencia) {
    for (var i = 0; i < lista.length; i++) {
      if (preferencia.test(chaveCabecalho(lista[i].nome))) return lista[i].indice;
    }
    return lista.length ? lista[0].indice : -1;
  }

  function escolherPadrao(perfil) {
    var lista = perfil || [];
    function doTipo(teste) { return lista.filter(teste); }
    return {
      metrica: primeiro(doTipo(function (p) { return p.tipo === 'numero'; }), REG_METRICA),
      tempo: primeiro(doTipo(function (p) { return p.tipo === 'data'; }), REG_TEMPO),
      dimensao: primeiro(doTipo(function (p) {
        return p.tipo === 'categoria' && p.distintos >= 2 && p.distintos <= 30;
      }), REG_DIMENSAO)
    };
  }

  /* ---------------- agregação ---------------- */

  function valorDe(linha, metrica) {
    if (metrica < 0) return 1;
    var n = COMUM.numero(celula(linha, metrica));
    return n === null ? 0 : n;
  }

  function chavePeriodo(iso, granularidade) {
    if (granularidade === 'dia') return iso;
    if (granularidade === 'semana') {
      var dia = COMUM.diaSemana(iso);
      return COMUM.maisDias(iso, -(dia === 0 ? 6 : dia - 1));
    }
    return iso.slice(0, 7);
  }

  function rotuloPeriodo(chave, granularidade) {
    if (granularidade === 'dia' || granularidade === 'semana') {
      return chave.slice(8) + '/' + chave.slice(5, 7);
    }
    return MESES[Number(chave.slice(5, 7)) - 1] + '/' + chave.slice(2, 4);
  }

  function porPeriodo(linhas, tempo, metrica, granularidade) {
    var gran = granularidade || 'mes';
    var mapa = {}, chaves = [];
    (linhas || []).forEach(function (l) {
      var iso = COMUM.data(celula(l, tempo));
      if (!iso) return;
      var chave = chavePeriodo(iso, gran);
      if (!mapa[chave]) {
        mapa[chave] = { chave: chave, rotulo: rotuloPeriodo(chave, gran), soma: 0, n: 0 };
        chaves.push(chave);
      }
      mapa[chave].soma += valorDe(l, metrica);
      mapa[chave].n++;
    });
    return chaves.sort().map(function (c) { return mapa[c]; });
  }

  function porCategoria(linhas, dimensao, metrica, top) {
    var limite = top || 8;
    var mapa = {}, chaves = [], total = 0;
    (linhas || []).forEach(function (l) {
      var rotulo = celula(l, dimensao) || '(vazio)';
      if (!mapa[rotulo]) { mapa[rotulo] = { rotulo: rotulo, soma: 0, n: 0, pct: 0 }; chaves.push(rotulo); }
      var v = valorDe(l, metrica);
      mapa[rotulo].soma += v;
      mapa[rotulo].n++;
      total += v;
    });
    var itens = chaves.map(function (c) { return mapa[c]; }).sort(function (a, b) {
      return b.soma - a.soma || b.n - a.n || (a.rotulo < b.rotulo ? -1 : 1);
    });
    if (itens.length > limite) {
      var resto = itens.slice(limite);
      var outros = { rotulo: 'Outros', soma: 0, n: 0, pct: 0 };
      resto.forEach(function (i) { outros.soma += i.soma; outros.n += i.n; });
      itens = itens.slice(0, limite).concat([outros]);
    }
    itens.forEach(function (i) { i.pct = total ? i.soma / total * 100 : 0; });
    return itens;
  }

  function kpis(linhas, escolha) {
    var op = escolha || {};
    var metrica = op.metrica === undefined ? -1 : op.metrica;
    var tempo = op.tempo === undefined ? -1 : op.tempo;
    var dimensao = op.dimensao === undefined ? -1 : op.dimensao;
    var gran = op.granularidade || 'mes';
    var lista = linhas || [];

    var total = 0;
    lista.forEach(function (l) { total += valorDe(l, metrica); });

    var de = '', ate = '';
    if (tempo >= 0) {
      lista.forEach(function (l) {
        var iso = COMUM.data(celula(l, tempo));
        if (!iso) return;
        if (!de || iso < de) de = iso;
        if (!ate || iso > ate) ate = iso;
      });
    }

    var periodos = tempo >= 0 ? porPeriodo(lista, tempo, metrica, gran) : [];
    var melhor = null, pior = null;
    periodos.forEach(function (p) {
      if (!melhor || p.soma > melhor.soma) melhor = { rotulo: p.rotulo, soma: p.soma };
      if (!pior || p.soma < pior.soma) pior = { rotulo: p.rotulo, soma: p.soma };
    });

    /* motivo separado: "não existe anterior" e "o anterior fechou em zero" viram frases diferentes na tela */
    var variacao = null, variacaoMotivo = 'sem anterior';
    if (periodos.length >= 2) {
      var anterior = periodos[periodos.length - 2].soma;
      var ultimo = periodos[periodos.length - 1].soma;
      if (anterior === 0) {
        variacaoMotivo = 'anterior zero';
      } else {
        variacao = (ultimo - anterior) / Math.abs(anterior) * 100;
        variacaoMotivo = '';
      }
    }

    var lider = null;
    if (dimensao >= 0) {
      var categorias = porCategoria(lista, dimensao, metrica, 9999);
      if (categorias.length) lider = { rotulo: categorias[0].rotulo, pct: categorias[0].pct };
    }

    return {
      total: total,
      registros: lista.length,
      media: lista.length ? total / lista.length : 0,
      de: de,
      ate: ate,
      melhor: melhor,
      pior: pior,
      variacao: variacao,
      variacaoMotivo: variacaoMotivo,
      lider: lider
    };
  }

  /* ---------------- gráficos ---------------- */

  /* O viewBox recebe a largura REAL em pixels do cartão: assim 1 unidade = 1 pixel e o
     texto de 12px do CSS sai com 12px na tela, do celular ao monitor. */
  var MIN_ROTULO = 48;

  function umaCasa(v) { return v.toFixed(1).replace('.', ','); }

  function semZero(s) { return s.replace(/,0$/, ''); }

  function curto(v) {
    var a = Math.abs(v);
    if (a >= 1000000) return semZero(umaCasa(v / 1000000)) + ' mi';
    if (a >= 1000) return semZero(umaCasa(v / 1000)) + ' mil';
    return semZero(umaCasa(v));
  }

  function inteiro(v) {
    return (Math.round(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  }

  function formatar(v, semCasas) {
    return semCasas ? inteiro(v) : COMUM.formatarValor(v);
  }

  function esc(s) { return COMUM.esc(s); }

  function n2(v) { return Math.round(v * 100) / 100; }

  function abrirSvg(largura, altura, rotulo) {
    return '<svg viewBox="0 0 ' + largura + ' ' + altura + '" role="img" aria-label="' +
      esc(rotulo) + '" style="width:100%;height:auto;display:block">';
  }

  /* de trás para a frente: o último rótulo é o que interessa e nunca cai */
  function indicesRotulo(n, espaco) {
    if (n <= 0) return [];
    var passo = Math.max(1, Math.ceil(MIN_ROTULO / (espaco > 0 ? espaco : 1)));
    var lista = [];
    for (var i = n - 1; i >= 0; i -= passo) lista.push(i);
    return lista.reverse();
  }

  function ancora(i, n) {
    if (n <= 1) return 'middle';
    return i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
  }

  function graficoLinha(series, opcoes) {
    var op = opcoes || {};
    var largura = op.largura || 640, altura = op.altura || 220;
    var semCasas = !!op.inteiro;
    var lista = series || [];
    var esquerda = 62, direita = 14, topo = 16, base = 30;
    var largTela = Math.max(40, largura - esquerda - direita), altTela = altura - topo - base;
    var partes = [abrirSvg(largura, altura, op.titulo || 'Série no tempo')];
    if (!lista.length) return partes.join('') + '</svg>';

    var max = -Infinity, min = Infinity;
    lista.forEach(function (p) {
      if (p.soma > max) max = p.soma;
      if (p.soma < min) min = p.soma;
    });
    if (min > 0) min = 0;
    if (max === min) max = min + 1;

    function x(i) { return lista.length === 1 ? esquerda + largTela / 2 : esquerda + largTela * i / (lista.length - 1); }
    function y(v) { return topo + altTela * (1 - (v - min) / (max - min)); }

    var k;
    for (k = 0; k <= 3; k++) {
      var valor = min + (max - min) * k / 3;
      var linhaY = n2(y(valor));
      partes.push('<line class="malha" x1="' + esquerda + '" y1="' + linhaY + '" x2="' + n2(esquerda + largTela) + '" y2="' + linhaY + '"/>');
      partes.push('<text class="eixo y" x="' + (esquerda - 8) + '" y="' + n2(linhaY + 4) + '" text-anchor="end">' + esc(curto(valor)) + '</text>');
    }

    var caminho = lista.map(function (p, i) {
      return (i ? 'L' : 'M') + n2(x(i)) + ' ' + n2(y(p.soma));
    }).join(' ');
    partes.push('<path class="area" d="' + caminho + ' L' + n2(x(lista.length - 1)) + ' ' + n2(y(min)) +
      ' L' + n2(x(0)) + ' ' + n2(y(min)) + ' Z"/>');
    partes.push('<path class="serie" d="' + caminho + '"/>');

    lista.forEach(function (p, i) {
      partes.push('<circle class="ponto" cx="' + n2(x(i)) + '" cy="' + n2(y(p.soma)) + '" r="3.5"><title>' +
        esc(p.rotulo + ': ' + formatar(p.soma, semCasas) + ' · ' + COMUM.plural(p.n, 'registro', 'registros')) + '</title></circle>');
    });

    var espaco = lista.length > 1 ? largTela / (lista.length - 1) : largTela;
    indicesRotulo(lista.length, espaco).forEach(function (i) {
      partes.push('<text class="eixo x" x="' + n2(x(i)) + '" y="' + (altura - 10) +
        '" text-anchor="' + ancora(i, lista.length) + '">' + esc(lista[i].rotulo) + '</text>');
    });
    return partes.join('') + '</svg>';
  }

  function graficoBarras(itens, opcoes) {
    var op = opcoes || {};
    var largura = op.largura || 640, altura = op.altura || 220;
    var semCasas = !!op.inteiro;
    var lista = itens || [];
    var esquerda = 62, direita = 14, topo = 16, base = 30;
    var largTela = Math.max(40, largura - esquerda - direita), altTela = altura - topo - base;
    var partes = [abrirSvg(largura, altura, op.titulo || 'Barras')];
    if (!lista.length) return partes.join('') + '</svg>';

    var max = 0;
    lista.forEach(function (i) { if (i.soma > max) max = i.soma; });
    if (max <= 0) max = 1;

    var faixa = largTela / lista.length;
    var larguraBarra = Math.max(2, Math.min(46, faixa * 0.62));
    lista.forEach(function (item, i) {
      var alto = Math.max(1, altTela * (item.soma > 0 ? item.soma / max : 0));
      var cx = esquerda + faixa * i + faixa / 2;
      partes.push('<rect class="barra" x="' + n2(cx - larguraBarra / 2) + '" y="' + n2(topo + altTela - alto) +
        '" width="' + n2(larguraBarra) + '" height="' + n2(alto) + '" rx="3"><title>' +
        esc(item.rotulo + ': ' + formatar(item.soma, semCasas)) + '</title></rect>');
    });

    indicesRotulo(lista.length, faixa).forEach(function (i) {
      partes.push('<text class="eixo x" x="' + n2(esquerda + faixa * i + faixa / 2) + '" y="' + (altura - 10) +
        '" text-anchor="middle">' + esc(lista[i].rotulo) + '</text>');
    });
    return partes.join('') + '</svg>';
  }

  /* horizontal em HTML, não em SVG: o rótulo de categoria é texto do documento e
     acompanha a fonte e a largura da coluna sem escalar junto com o desenho */
  function graficoBarrasH(itens, opcoes) {
    var op = opcoes || {};
    var semCasas = !!op.inteiro;
    var lista = itens || [];
    var partes = ['<div class="barrasH">'];
    if (!lista.length) return partes.join('') + '</div>';

    var max = 0;
    lista.forEach(function (i) { if (i.soma > max) max = i.soma; });
    if (max <= 0) max = 1;

    lista.forEach(function (item) {
      var pct = item.soma > 0 ? item.soma / max * 100 : 0;
      partes.push('<div class="barraH"><span class="rotulo">' + esc(item.rotulo) + '</span>' +
        '<span class="valor">' + esc(formatar(item.soma, semCasas) + ' · ' + umaCasa(item.pct) + '%') + '</span>' +
        '<i style="width:' + n2(Math.max(0.6, pct)) + '%"></i></div>');
    });
    return partes.join('') + '</div>';
  }

  function resumoCategorias(itens) {
    var lista = itens || [];
    var temOutros = lista.length > 0 && lista[lista.length - 1].rotulo === 'Outros';
    var grupos = lista.length - (temOutros ? 1 : 0);
    return {
      grupos: grupos,
      nota: temOutros ? 'as ' + grupos + ' maiores, o resto somado em Outros' : 'todas as ' + grupos
    };
  }

  /* ---------------- exportação ---------------- */

  function linhasAgregado(periodos, categorias, opcoes) {
    var semCasas = !!(opcoes && opcoes.inteiro);
    var linhas = [['Período', 'Soma', 'Registros']];
    (periodos || []).forEach(function (p) {
      linhas.push([p.rotulo, formatar(p.soma, semCasas), p.n]);
    });
    linhas.push([]);
    linhas.push(['Categoria', 'Soma', 'Registros', '% do total']);
    (categorias || []).forEach(function (c) {
      linhas.push([c.rotulo, formatar(c.soma, semCasas), c.n, umaCasa(c.pct)]);
    });
    return linhas;
  }

  function csvAgregado(periodos, categorias, opcoes) {
    return COMUM.csv(linhasAgregado(periodos, categorias, opcoes));
  }

  function tsvAgregado(periodos, categorias, opcoes) {
    return COMUM.tsv(linhasAgregado(periodos, categorias, opcoes));
  }

  function nomeColuna(perfil, indice, padrao) {
    var achado = padrao;
    (perfil || []).forEach(function (p) { if (p.indice === indice) achado = p.nome; });
    return achado;
  }

  function resumoTexto(k, escolha, perfil) {
    var op = escolha || {};
    var semCasas = !(op.metrica >= 0);
    var partes = [];
    var nomeMetrica = op.metrica >= 0 ? nomeColuna(perfil, op.metrica, 'Total') : 'Linhas';
    var periodo = k.de ? ', de ' + COMUM.formatarData(k.de) + ' a ' + COMUM.formatarData(k.ate) : '';
    partes.push(nomeMetrica + ': ' + formatar(k.total, semCasas) + ' em ' +
      COMUM.plural(k.registros, 'registro', 'registros') + periodo + '.');
    partes.push('Média de ' + formatar(k.media, semCasas) + ' por registro.');
    if (k.melhor) partes.push('Melhor período: ' + k.melhor.rotulo + ' com ' + formatar(k.melhor.soma, semCasas) + '.');
    if (k.variacao !== null) {
      partes.push('O último período ficou ' + umaCasa(Math.abs(k.variacao)) + '% ' +
        (k.variacao >= 0 ? 'acima' : 'abaixo') + ' do anterior.');
    } else if (k.variacaoMotivo === 'anterior zero') {
      partes.push('O período anterior fechou em zero.');
    }
    if (k.lider) {
      partes.push(nomeColuna(perfil, op.dimensao, 'Categoria') + ' que mais pesa: ' +
        k.lider.rotulo + ', com ' + umaCasa(k.lider.pct) + '% do total.');
    }
    return partes.join(' ');
  }

  /* ---------------- exemplo ---------------- */

  var VENDEDORES = ['Ana Prado', 'Bruno Lima', 'Carla Dias', 'Diego Matos', 'Elis Rocha', 'Fábio Nunes', 'Gisele Alves', 'Heitor Campos'];
  var REGIOES = ['Sudeste', 'Sul', 'Nordeste', 'Centro-Oeste', 'Norte'];
  var PRODUTOS = ['Assinatura', 'Implantação', 'Suporte', 'Treinamento', 'Licença', 'Consultoria'];

  function doisDigitos(n) { return (n < 10 ? '0' : '') + n; }

  function exemplo(hoje) {
    var dia = hoje || COMUM.hojeISO();
    var ano = Number(dia.slice(0, 4)), mes = Number(dia.slice(5, 7)), diaHoje = Number(dia.slice(8, 10));
    var sorteio = COMUM.lcg(7);
    var linhas = [];
    for (var k = 11; k >= 0; k--) {
      var m = mes - k, a = ano;
      while (m <= 0) { m += 12; a -= 1; }
      /* o mês corrente ainda não acabou: o exemplo não inventa venda com data no futuro */
      var ultimoDia = (k === 0) ? Math.min(28, diaHoje) : 28;
      var sazonal = 1 + 0.3 * Math.sin((m - 1) / 12 * Math.PI * 2);
      for (var j = 0; j < 20; j++) {
        var d = 1 + Math.floor(sorteio() * ultimoDia);
        var quantidade = 1 + Math.floor(sorteio() * 12);
        var unitario = 80 + Math.floor(sorteio() * 220);
        var valor = Math.round(quantidade * unitario * sazonal * 100) / 100;
        linhas.push([
          doisDigitos(d) + '/' + doisDigitos(m) + '/' + a,
          VENDEDORES[Math.floor(sorteio() * VENDEDORES.length)],
          REGIOES[Math.floor(sorteio() * REGIOES.length)],
          PRODUTOS[Math.floor(sorteio() * PRODUTOS.length)],
          String(quantidade),
          COMUM.formatarValor(valor)
        ]);
      }
    }
    return {
      nome: 'vendas-exemplo.csv',
      cabecalho: ['Data', 'Vendedor', 'Região', 'Produto', 'Quantidade', 'Valor'],
      linhas: linhas
    };
  }

  return {
    perfilar: perfilar,
    escolherPadrao: escolherPadrao,
    porPeriodo: porPeriodo,
    porCategoria: porCategoria,
    kpis: kpis,
    graficoLinha: graficoLinha,
    graficoBarras: graficoBarras,
    graficoBarrasH: graficoBarrasH,
    resumoCategorias: resumoCategorias,
    csvAgregado: csvAgregado,
    tsvAgregado: tsvAgregado,
    resumoTexto: resumoTexto,
    exemplo: exemplo,
    curto: curto,
    formatar: formatar
  };
});
