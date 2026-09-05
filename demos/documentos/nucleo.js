/* Núcleo do gerador de documentos: um dado, três documentos.
   montar() devolve um modelo neutro; html() e gerarPDF() só o desenham — assim o
   preview e o PDF nunca divergem. Sem dependência da página; jsPDF entra por parâmetro. */
(function (raiz) {
  'use strict';

  function centavos(v) { return Math.round((Number(v) || 0) * 100 + 1e-7) / 100; }
  function esquerda(v, n) { var s = String(v); while (s.length < n) s = '0' + s; return s; }
  function limpo(s) { return String(s == null ? '' : s).trim(); }

  /* ---------------- formatação ---------------- */

  function formatarValor(v) {
    return (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function formatarQtd(v) {
    return (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  }
  function formatarDoc(doc) {
    var s = limpo(doc), d = s.replace(/\D/g, '');
    if (d.length === 14 && d.length >= s.length - 4) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (d.length === 11 && d.length >= s.length - 3) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return s;
  }
  function formatarData(iso) {
    var d = String(iso || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.slice(8) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '';
  }
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function dataPorExtenso(iso) {
    var d = String(iso || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
    return Number(d.slice(8)) + ' de ' + MESES[Number(d.slice(5, 7)) - 1] + ' de ' + d.slice(0, 4);
  }
  function doisDigitos(n) { return (n < 10 ? '0' : '') + n; }
  function hojeISO() {
    var d = new Date();
    return d.getFullYear() + '-' + doisDigitos(d.getMonth() + 1) + '-' + doisDigitos(d.getDate());
  }
  function maisDias(iso, n) {
    var p = String(iso).slice(0, 10).split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    d.setUTCDate(d.getUTCDate() + (Number(n) || 0));
    return d.toISOString().slice(0, 10);
  }

  /* ---------------- por extenso ---------------- */

  var UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze',
                  'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  var DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  var CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  var ESCALAS = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões'], ['trilhão', 'trilhões']];

  function grupoPorExtenso(n) {
    if (n === 100) return 'cem';
    var partes = [], c = Math.floor(n / 100), r = n % 100;
    if (c) partes.push(CENTENAS[c]);
    if (r < 20) { if (r) partes.push(UNIDADES[r]); }
    else { partes.push(DEZENAS[Math.floor(r / 10)]); if (r % 10) partes.push(UNIDADES[r % 10]); }
    return partes.join(' e ');
  }

  /* "e" só antes de grupo abaixo de cem ou de centena redonda (mil e cem, mil e vinte);
     senão emenda direto (mil duzentos e cinquenta). Regra do Cegalla, a mesma dos cheques. */
  function inteiroPorExtenso(n) {
    if (n === 0) return 'zero';
    var grupos = [];
    while (n > 0) { grupos.push(n % 1000); n = Math.floor(n / 1000); }
    var partes = [];
    for (var i = grupos.length - 1; i >= 0; i--) {
      var g = grupos[i];
      if (!g) continue;
      var texto = (i === 1 && g === 1) ? 'mil'
        : grupoPorExtenso(g) + (i > 0 ? ' ' + ESCALAS[i][g === 1 ? 0 : 1] : '');
      partes.push({ texto: texto, valor: g });
    }
    var saida = partes[0].texto;
    for (var k = 1; k < partes.length; k++) {
      var v = partes[k].valor;
      saida += ((v < 100 || v % 100 === 0) ? ' e ' : ' ') + partes[k].texto;
    }
    return saida;
  }

  function porExtenso(valor) {
    var total = Math.round((Number(valor) || 0) * 100 + 1e-7);
    var reais = Math.floor(total / 100), cent = total % 100, partes = [];
    if (reais > 0) {
      partes.push(inteiroPorExtenso(reais) + (reais % 1000000 === 0 ? ' de' : '') + (reais === 1 ? ' real' : ' reais'));
    }
    if (cent > 0) partes.push(inteiroPorExtenso(cent) + (cent === 1 ? ' centavo' : ' centavos'));
    return partes.length ? partes.join(' e ') : 'zero reais';
  }

  /* ---------------- regras ---------------- */

  var TIPOS = {
    proposta: { titulo: 'Proposta comercial', prefixo: 'PROP', arquivo: 'proposta' },
    os:       { titulo: 'Ordem de serviço',   prefixo: 'OS',   arquivo: 'ordem-de-servico' },
    recibo:   { titulo: 'Recibo',             prefixo: 'REC',  arquivo: 'recibo' }
  };

  function numero(tipo, iso, seq) {
    return TIPOS[tipo].prefixo + '-' + String(iso).slice(0, 4) + '-' + esquerda(Math.max(1, Number(seq) || 1), 4);
  }

  function totais(itens, desconto) {
    var lista = (itens || []).map(function (it) {
      var qtd = Number(it.qtd) || 0, unitario = Number(it.unitario) || 0;
      return { descricao: limpo(it.descricao), qtd: qtd, un: limpo(it.un) || 'un', unitario: unitario, subtotal: centavos(qtd * unitario) };
    }).filter(function (it) { return it.descricao || it.subtotal > 0; });
    var subtotal = centavos(lista.reduce(function (s, it) { return s + it.subtotal; }, 0));
    var desc = Math.min(centavos(Math.max(0, Number(desconto) || 0)), subtotal);
    return { itens: lista, subtotal: subtotal, desconto: desc, total: centavos(subtotal - desc) };
  }

  function validar(d) {
    var erros = [];
    if (!limpo(d.emissor && d.emissor.nome)) erros.push('Falta o nome da sua empresa, quem emite o documento.');
    if (!limpo(d.cliente && d.cliente.nome)) erros.push('Falta o nome do cliente.');
    if (!totais(d.itens, 0).itens.length) erros.push('Inclua pelo menos um item com descrição e valor.');
    return erros;
  }

  function parte(p) {
    p = p || {};
    return { nome: limpo(p.nome), doc: formatarDoc(p.doc), endereco: limpo(p.endereco), contato: limpo(p.contato) };
  }

  function listaEm(itens) {
    var nomes = itens.map(function (it) { return it.descricao + (it.qtd > 1 ? ' (' + formatarQtd(it.qtd) + ' ' + it.un + ')' : ''); });
    if (nomes.length <= 1) return nomes.join('');
    return nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1];
  }

  function blocoTabela(t) {
    var linhasTotais = [];
    if (t.desconto > 0) {
      linhasTotais.push(['Subtotal', 'R$ ' + formatarValor(t.subtotal)]);
      linhasTotais.push(['Desconto', '- R$ ' + formatarValor(t.desconto)]);
    }
    linhasTotais.push(['Total', 'R$ ' + formatarValor(t.total)]);
    return {
      tipo: 'tabela',
      colunas: ['Descrição', 'Qtd', 'Valor unit. (R$)', 'Subtotal (R$)'],
      linhas: t.itens.map(function (it) {
        return [it.descricao, formatarQtd(it.qtd) + ' ' + it.un, formatarValor(it.unitario), formatarValor(it.subtotal)];
      }),
      totais: linhasTotais
    };
  }

  function blocoCampos(pares) {
    var itens = pares.filter(function (p) { return limpo(p[1]); });
    return itens.length ? { tipo: 'campos', itens: itens } : null;
  }

  function montar(tipo, d) {
    var regra = TIPOS[tipo];
    if (!regra) throw new Error('tipo de documento desconhecido: ' + tipo);
    var t = totais(d.itens, d.desconto);
    var data = String(d.data || hojeISO()).slice(0, 10);
    var m = {
      tipo: tipo,
      titulo: regra.titulo,
      arquivo: regra.arquivo,
      numero: numero(tipo, data, d.sequencia),
      data: data,
      dataExtenso: dataPorExtenso(data),
      cidade: limpo(d.cidade),
      emissor: parte(d.emissor),
      cliente: parte(d.cliente),
      total: t.total,
      blocos: []
    };
    var obs = limpo(d.observacoes) ? { tipo: 'texto', titulo: 'Observações', paragrafos: [limpo(d.observacoes)] } : null;
    var validade = Number(d.validade) || 0;

    if (tipo === 'proposta') {
      m.blocos.push({ tipo: 'texto', paragrafos: ['Apresentamos a seguir nossa proposta para o fornecimento dos itens e serviços descritos, nas condições indicadas.'] });
      m.blocos.push(blocoTabela(t));
      m.blocos.push(blocoCampos([
        ['Validade', validade ? validade + ' dias (até ' + formatarData(maisDias(data, validade)) + ')' : ''],
        ['Prazo de entrega', d.prazo],
        ['Pagamento', d.pagamento]
      ]));
      if (obs) m.blocos.push(obs);
      m.blocos.push({ tipo: 'assinaturas', linhas: [
        { nome: m.emissor.nome, papel: 'Emitente' },
        { nome: m.cliente.nome, papel: 'De acordo' }
      ] });
    } else if (tipo === 'os') {
      m.blocos.push({ tipo: 'texto', paragrafos: ['Fica autorizada a execução dos serviços e o fornecimento dos itens descritos abaixo, nas condições indicadas.'] });
      m.blocos.push(blocoTabela(t));
      m.blocos.push(blocoCampos([
        ['Prazo de execução', d.prazo],
        ['Pagamento', d.pagamento]
      ]));
      if (obs) m.blocos.push(obs);
      m.blocos.push({ tipo: 'assinaturas', linhas: [
        { nome: m.emissor.nome, papel: 'Responsável pela execução' },
        { nome: m.cliente.nome, papel: 'Autorização do cliente' }
      ] });
    } else {
      var quem = m.cliente.nome + (m.cliente.doc ? ', ' + (m.cliente.doc.length === 14 ? 'CPF' : 'CNPJ') + ' ' + m.cliente.doc + ',' : '');
      m.blocos.push({ tipo: 'texto', paragrafos: [
        'Recebemos de ' + quem + ' a importância de R$ ' + formatarValor(t.total) + ' (' + porExtenso(t.total) + '), referente a ' + listaEm(t.itens) + '.',
        'Para maior clareza, firmamos o presente recibo, dando plena e geral quitação do valor acima.',
        (m.cidade ? m.cidade + ', ' : '') + m.dataExtenso + '.'
      ] });
      m.blocos.push(blocoCampos([['Forma de pagamento', d.pagamento]]));
      if (obs) m.blocos.push(obs);
      m.blocos.push({ tipo: 'assinaturas', linhas: [{ nome: m.emissor.nome, papel: 'Recebemos' }] });
    }
    m.blocos = m.blocos.filter(Boolean);
    return m;
  }

  /* ---------------- HTML ---------------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* classes por coluna: no celular a tabela vira cartão e o rótulo entra por CSS */
  var COLUNAS = ['desc', 'qtd num', 'unit num', 'sub num'];
  var ROTULOS = ['', 'Qtd', 'Unit. R$', 'Subtotal'];

  function linhasParte(p, comContato) {
    return [p.doc, p.endereco, comContato ? p.contato : ''].filter(Boolean).map(function (l) { return '<span>' + esc(l) + '</span>'; }).join('');
  }

  function html(m) {
    var s = '<header class="doc__cabeca">' +
      '<div class="doc__emissor"><strong>' + esc(m.emissor.nome) + '</strong>' + linhasParte(m.emissor, true) + '</div>' +
      '<div class="doc__titulo"><h2>' + esc(m.titulo) + '</h2><span>Nº ' + esc(m.numero) + '</span>' +
      '<span>' + esc((m.cidade ? m.cidade + ', ' : '') + m.dataExtenso) + '</span></div>' +
      '</header>';
    if (m.tipo !== 'recibo') {
      s += '<section class="doc__cliente"><span class="doc__rotulo">Cliente</span>' +
        '<strong>' + esc(m.cliente.nome) + '</strong>' + linhasParte(m.cliente, false) + '</section>';
    }
    m.blocos.forEach(function (b) {
      if (b.tipo === 'texto') {
        s += '<section class="doc__texto">' + (b.titulo ? '<span class="doc__rotulo">' + esc(b.titulo) + '</span>' : '') +
          b.paragrafos.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</section>';
      } else if (b.tipo === 'tabela') {
        s += '<table class="doc__tabela"><thead><tr>' +
          b.colunas.map(function (c, i) { return '<th' + (i ? ' class="num"' : '') + '>' + esc(c) + '</th>'; }).join('') +
          '</tr></thead><tbody>' +
          b.linhas.map(function (l) {
            return '<tr>' + l.map(function (c, i) {
              return '<td class="' + COLUNAS[i] + '"' + (i ? ' data-rotulo="' + ROTULOS[i] + '"' : '') + '>' + esc(c) + '</td>';
            }).join('') + '</tr>';
          }).join('') + '</tbody></table>' +
          '<div class="doc__totais">' + b.totais.map(function (tt, i) {
            return '<div' + (i === b.totais.length - 1 ? ' class="total"' : '') + '><span>' + esc(tt[0]) + '</span><span>' + esc(tt[1]) + '</span></div>';
          }).join('') + '</div>';
      } else if (b.tipo === 'campos') {
        s += '<dl class="doc__campos">' + b.itens.map(function (c) {
          return '<div><dt>' + esc(c[0]) + '</dt><dd>' + esc(c[1]) + '</dd></div>';
        }).join('') + '</dl>';
      } else if (b.tipo === 'assinaturas') {
        s += '<div class="doc__assinaturas">' + b.linhas.map(function (a) {
          return '<div><i></i><strong>' + esc(a.nome) + '</strong><span>' + esc(a.papel) + '</span></div>';
        }).join('') + '</div>';
      }
    });
    return s;
  }

  /* ---------------- PDF ---------------- */

  function gerarPDF(m, lib) {
    var jsPDF = (lib || raiz.jspdf).jsPDF;
    var doc = new jsPDF({ unit: 'mm', format: 'a4' });
    var L = 20, R = 190, W = 170, FIM = 272, y;
    var azul = [7, 11, 24], cinza = [110, 118, 140];

    function fonte(estilo, tamanho, cor) {
      doc.setFont('helvetica', estilo);
      doc.setFontSize(tamanho);
      doc.setTextColor.apply(doc, cor || [20, 24, 40]);
    }
    function garantir(altura) {
      if (y + altura > FIM) { doc.addPage(); y = 20; }
    }
    function paragrafo(texto, tamanho) {
      fonte('normal', tamanho || 10);
      var linhas = doc.splitTextToSize(texto, W);
      var alturaLinha = (tamanho || 10) * 0.5;
      garantir(linhas.length * alturaLinha);
      doc.text(linhas, L, y);
      y += linhas.length * alturaLinha + 2.5;
    }
    function rotulo(texto) {
      fonte('bold', 8, cinza);
      doc.text(texto.toUpperCase(), L, y);
      y += 4.5;
    }

    /* cabeçalho: emissor à esquerda, título e número à direita */
    y = 20;
    fonte('bold', 11);
    doc.text(m.emissor.nome, L, y);
    var linhasEmissor = [m.emissor.doc, m.emissor.endereco, m.emissor.contato].filter(Boolean);
    fonte('normal', 8.5, cinza);
    linhasEmissor.forEach(function (l, i) { doc.text(l, L, y + 5 + i * 4); });
    var fimEmissor = y + 5 + linhasEmissor.length * 4;

    fonte('bold', 19, azul);
    doc.text(m.titulo, R, 21, { align: 'right' });
    fonte('normal', 9, cinza);
    doc.text('Nº ' + m.numero, R, 27.5, { align: 'right' });
    doc.text((m.cidade ? m.cidade + ', ' : '') + m.dataExtenso, R, 32, { align: 'right' });

    y = Math.max(fimEmissor, 36) + 4;
    doc.setDrawColor(200, 206, 224);
    doc.setLineWidth(0.3);
    doc.line(L, y, R, y);
    y += 8;

    if (m.tipo !== 'recibo') {
      rotulo('Cliente');
      fonte('bold', 10.5);
      doc.text(m.cliente.nome, L, y);
      y += 5;
      fonte('normal', 9, cinza);
      [m.cliente.doc, m.cliente.endereco].filter(Boolean).forEach(function (l) { doc.text(l, L, y); y += 4; });
      y += 5;
    }

    m.blocos.forEach(function (b) {
      if (b.tipo === 'texto') {
        if (b.titulo) { garantir(12); rotulo(b.titulo); }
        b.paragrafos.forEach(function (p) { paragrafo(p, b.titulo ? 9.5 : 10.5); });
        y += 2;
      } else if (b.tipo === 'tabela') {
        doc.autoTable({
          startY: y,
          head: [b.colunas],
          body: b.linhas,
          margin: { left: L, right: 20 },
          theme: 'grid',
          styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.2, lineColor: [200, 206, 224], lineWidth: 0.2, textColor: [20, 24, 40] },
          headStyles: { fillColor: azul, textColor: 255, fontStyle: 'bold' },
          columnStyles: { 1: { halign: 'right', cellWidth: 24 }, 2: { halign: 'right', cellWidth: 32 }, 3: { halign: 'right', cellWidth: 32 } }
        });
        y = doc.lastAutoTable.finalY + 4;
        garantir(b.totais.length * 6 + 4);
        b.totais.forEach(function (tt, i) {
          var ultimo = i === b.totais.length - 1;
          fonte(ultimo ? 'bold' : 'normal', ultimo ? 11.5 : 9.5, ultimo ? azul : cinza);
          doc.text(tt[0], R - 40, y, { align: 'right' });
          doc.text(tt[1], R, y, { align: 'right' });
          y += ultimo ? 7 : 5.5;
        });
        y += 4;
      } else if (b.tipo === 'campos') {
        garantir(b.itens.length * 9);
        b.itens.forEach(function (c) {
          fonte('bold', 8, cinza);
          doc.text(c[0].toUpperCase(), L, y);
          fonte('normal', 10);
          var linhas = doc.splitTextToSize(c[1], W - 48);
          garantir(linhas.length * 5);
          doc.text(linhas, L + 48, y);
          y += Math.max(1, linhas.length) * 5 + 2.5;
        });
        y += 3;
      } else if (b.tipo === 'assinaturas') {
        garantir(32);
        y = Math.max(y, y + 8);
        var n = b.linhas.length, largura = (W - (n - 1) * 12) / n;
        b.linhas.forEach(function (a, i) {
          var x = L + i * (largura + 12);
          doc.setDrawColor(20, 24, 40);
          doc.line(x, y + 14, x + largura, y + 14);
          fonte('bold', 9);
          doc.text(doc.splitTextToSize(a.nome, largura), x + largura / 2, y + 19, { align: 'center' });
          fonte('normal', 8, cinza);
          doc.text(a.papel, x + largura / 2, y + 27, { align: 'center' });
        });
        y += 32;
      }
    });

    var paginas = doc.internal.getNumberOfPages();
    for (var p = 1; p <= paginas; p++) {
      doc.setPage(p);
      fonte('normal', 7.5, cinza);
      doc.text(m.numero + (paginas > 1 ? '  ·  ' + p + '/' + paginas : ''), L, 287);
      doc.text('gerado em hightide.site', R, 287, { align: 'right' });
    }
    return doc;
  }

  /* ---------------- exemplo ---------------- */

  function exemplo() {
    return {
      emissor: { nome: 'Refrigeração Maré Alta Ltda', doc: '91847263000158', endereco: 'Rua Xavier da Silveira, 412 · Santos/SP', contato: '(13) 99123-4567 · contato@marealta.com.br' },
      cliente: { nome: 'Clínica Odonto Enseada Ltda', doc: '92735184000104', endereco: 'Av. Ana Costa, 300, sala 12 · Santos/SP', contato: '' },
      itens: [
        { descricao: 'Instalação de ar-condicionado split 12.000 BTU, com suporte e tubulação até 3 m', qtd: 3, un: 'un', unitario: 650 },
        { descricao: 'Limpeza e higienização de evaporadora', qtd: 5, un: 'un', unitario: 180 },
        { descricao: 'Deslocamento e materiais de fixação', qtd: 1, un: 'vb', unitario: 120 }
      ],
      desconto: 150,
      data: hojeISO(),
      cidade: 'Santos',
      validade: 15,
      prazo: '5 dias úteis após a aprovação',
      pagamento: '50% na aprovação e 50% na conclusão, via Pix ou boleto',
      observacoes: 'Garantia de 90 dias sobre a mão de obra. Equipamentos fornecidos pelo cliente.',
      sequencia: 1
    };
  }

  raiz.DOCS = {
    TIPOS: TIPOS,
    porExtenso: porExtenso,
    dataPorExtenso: dataPorExtenso,
    formatarValor: formatarValor,
    formatarQtd: formatarQtd,
    formatarDoc: formatarDoc,
    formatarData: formatarData,
    hojeISO: hojeISO,
    maisDias: maisDias,
    numero: numero,
    totais: totais,
    validar: validar,
    montar: montar,
    html: html,
    gerarPDF: gerarPDF,
    exemplo: exemplo
  };
})(window);
