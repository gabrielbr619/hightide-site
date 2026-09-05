/* Núcleo do extrator de NF-e: lê o XML, normaliza e exporta.
   Sem dependência da página — o testes.html carrega este mesmo arquivo. */
(function (raiz) {
  'use strict';

  var BOM = String.fromCharCode(0xFEFF);

  /* O XML da NF-e vem com namespace, às vezes com prefixo (nfe:emit). Buscar por
     localName em qualquer namespace é o único jeito que cobre os dois casos. */
  function achar(no, nome) {
    if (!no) return [];
    return Array.prototype.slice.call(no.getElementsByTagNameNS('*', nome));
  }
  function um(no, nome) {
    var l = achar(no, nome);
    return l.length ? l[0] : null;
  }
  function txt(no, nome) {
    var e = um(no, nome);
    return e ? (e.textContent || '').trim() : '';
  }
  function num(s) {
    var n = parseFloat(String(s).replace(',', '.'));
    return isFinite(n) ? n : 0;
  }
  function centavos(n) { return Math.round(n * 100) / 100; }
  function dia(s) { return String(s || '').slice(0, 10); }

  /* ---------------- formatação ---------------- */

  function formatarDoc(doc) {
    var d = String(doc || '').replace(/\D/g, '');
    if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return d || '—';
  }

  /* fatiar a string em vez de new Date(): 'YYYY-MM-DD' vira o dia anterior no fuso do Brasil */
  function formatarData(iso) {
    var d = dia(iso);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.slice(8) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '';
  }

  function formatarValor(v) {
    return (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function doisDigitos(n) { return (n < 10 ? '0' : '') + n; }

  function hojeISO() {
    var d = new Date();
    return d.getFullYear() + '-' + doisDigitos(d.getMonth() + 1) + '-' + doisDigitos(d.getDate());
  }

  function maisDias(iso, n) {
    var p = dia(iso).split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  /* ---------------- leitura ---------------- */

  var SITUACAO = {
    '100': 'autorizada', '150': 'autorizada',
    '101': 'cancelada', '135': 'cancelada', '151': 'cancelada', '155': 'cancelada',
    '110': 'denegada', '301': 'denegada', '302': 'denegada', '303': 'denegada'
  };

  function lerNota(infNFe, protocolo, arquivo) {
    var ide = um(infNFe, 'ide');
    var emit = um(infNFe, 'emit');
    var dest = um(infNFe, 'dest');
    var icms = um(um(infNFe, 'total'), 'ICMSTot');
    var cobr = um(infNFe, 'cobr');
    var pag = um(infNFe, 'pag');

    var id = (infNFe.getAttribute('Id') || '').replace(/\D/g, '');
    var chave = id.length === 44 ? id : txt(protocolo, 'chNFe').replace(/\D/g, '');

    var docEmit = txt(emit, 'CNPJ');
    var tipoDocEmit = 'CNPJ';
    if (!docEmit) {
      docEmit = txt(emit, 'CPF');
      if (docEmit) tipoDocEmit = 'CPF';
    }

    var parcelas = achar(cobr, 'dup').map(function (d) {
      return { numero: txt(d, 'nDup'), vencimento: dia(txt(d, 'dVenc')), valor: centavos(num(txt(d, 'vDup'))) };
    }).filter(function (p) { return p.vencimento; });
    parcelas.sort(function (a, b) { return a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : 0; });

    var formas = achar(pag, 'detPag').map(function (d) { return txt(d, 'tPag'); });
    var condicao;
    if (parcelas.length) condicao = 'a prazo';
    else if (formas.length && formas.every(function (f) { return f === '90'; })) condicao = 'sem pagamento';
    else if (formas.length) condicao = 'à vista';
    else condicao = txt(ide, 'indPag') === '1' ? 'a prazo' : 'à vista';

    var valor = centavos(num(txt(icms, 'vNF')));
    if (!valor && parcelas.length) {
      valor = centavos(parcelas.reduce(function (s, p) { return s + p.valor; }, 0));
    }

    var cStat = txt(protocolo, 'cStat');
    return {
      chave: chave,
      numero: txt(ide, 'nNF'),
      serie: txt(ide, 'serie'),
      modelo: txt(ide, 'mod'),
      natureza: txt(ide, 'natOp'),
      emissao: dia(txt(ide, 'dhEmi') || txt(ide, 'dEmi')),
      fornecedor: txt(emit, 'xNome') || txt(emit, 'xFant'),
      docEmit: docEmit,
      tipoDocEmit: tipoDocEmit,
      uf: txt(um(emit, 'enderEmit'), 'UF'),
      municipio: txt(um(emit, 'enderEmit'), 'xMun'),
      destinatario: txt(dest, 'xNome'),
      docDest: txt(dest, 'CNPJ') || txt(dest, 'CPF'),
      valor: valor,
      parcelas: parcelas,
      condicao: condicao,
      situacao: cStat ? (SITUACAO[cStat] || 'situação ' + cStat) : 'sem protocolo',
      arquivo: arquivo
    };
  }

  function vencimento(nota) {
    if (nota.parcelas.length) return nota.parcelas[0].vencimento;
    if (nota.condicao === 'à vista') return nota.emissao;
    return '';
  }

  var RECUSA = {
    procEventoNFe: 'evento de NF-e (cancelamento ou carta de correção), não é a nota',
    envEvento: 'evento de NF-e (cancelamento ou carta de correção), não é a nota',
    retEnvEvento: 'retorno de evento de NF-e, não é a nota',
    evento: 'evento de NF-e, não é a nota',
    cteProc: 'CT-e (conhecimento de transporte) — este extrator lê NF-e',
    CTe: 'CT-e (conhecimento de transporte) — este extrator lê NF-e',
    mdfeProc: 'MDF-e (manifesto de carga) — este extrator lê NF-e',
    MDFe: 'MDF-e (manifesto de carga) — este extrator lê NF-e',
    distDFeInt: 'consulta ao portal da SEFAZ, sem a nota dentro',
    retDistDFeInt: 'retorno de consulta à SEFAZ, sem a nota dentro'
  };

  function lerArquivo(arquivo, conteudo) {
    var saida = { arquivo: arquivo, tipo: 'erro', notas: [], motivo: '' };
    var texto = String(conteudo || '');
    if (texto.charCodeAt(0) === 0xFEFF) texto = texto.slice(1);
    texto = texto.trim();
    if (!texto) { saida.motivo = 'arquivo vazio'; return saida; }

    var doc;
    try {
      doc = new DOMParser().parseFromString(texto, 'application/xml');
    } catch (e) {
      saida.motivo = 'não foi possível ler como XML';
      return saida;
    }
    if (!doc || !doc.documentElement || doc.getElementsByTagName('parsererror').length) {
      saida.motivo = 'não é um XML válido';
      return saida;
    }

    var raizNome = doc.documentElement.localName || doc.documentElement.nodeName;
    if (RECUSA[raizNome]) {
      saida.tipo = raizNome.indexOf('vento') >= 0 ? 'evento' : 'outro';
      saida.motivo = RECUSA[raizNome];
      return saida;
    }

    var infs = achar(doc.documentElement, 'infNFe');
    if (!infs.length) {
      saida.tipo = 'outro';
      saida.motivo = 'XML sem NF-e dentro (raiz <' + raizNome + '>)';
      return saida;
    }

    var protocolos = achar(doc.documentElement, 'infProt');
    saida.tipo = 'notas';
    saida.notas = infs.map(function (inf, i) {
      /* um protocolo por nota quando o lote traz vários; senão o único que existe */
      var prot = protocolos.length === infs.length ? protocolos[i] : (protocolos.length === 1 ? protocolos[0] : null);
      return lerNota(inf, prot, arquivo);
    });
    return saida;
  }

  /* ---------------- juntar ---------------- */

  function melhorQue(nova, atual) {
    return atual.situacao === 'sem protocolo' && nova.situacao !== 'sem protocolo';
  }

  function juntar(resultados) {
    var porChave = {}, ordem = [], repetidas = 0, descartados = [], lidos = 0;

    resultados.forEach(function (r) {
      lidos++;
      if (r.tipo !== 'notas') {
        descartados.push({ arquivo: r.arquivo, motivo: r.motivo, tipo: r.tipo });
        return;
      }
      r.notas.forEach(function (n) {
        var k = n.chave || ('sem-chave:' + n.arquivo + ':' + n.serie + ':' + n.numero);
        if (!porChave[k]) { porChave[k] = n; ordem.push(k); return; }
        repetidas++;
        if (melhorQue(n, porChave[k])) porChave[k] = n;
      });
    });

    return {
      notas: ordem.map(function (k) { return porChave[k]; }),
      descartados: descartados,
      repetidas: repetidas,
      lidos: lidos
    };
  }

  /* ---------------- resumo ---------------- */

  function faixaVazia() { return { quantidade: 0, valor: 0 }; }

  function resumo(notas, hoje) {
    hoje = hoje || hojeISO();
    var limite = maisDias(hoje, 7);
    var r = {
      quantidade: 0, total: 0, fornecedores: 0,
      vencidas: faixaVazia(), semana: faixaVazia(), depois: faixaVazia(), semData: faixaVazia(),
      primeiraEmissao: '', ultimaEmissao: ''
    };
    var fornecedores = {};

    notas.forEach(function (n) {
      if (n.situacao === 'cancelada' || n.situacao === 'denegada') return;
      r.quantidade++;
      r.total = centavos(r.total + n.valor);
      if (n.docEmit) fornecedores[n.docEmit] = true;
      if (n.emissao) {
        if (!r.primeiraEmissao || n.emissao < r.primeiraEmissao) r.primeiraEmissao = n.emissao;
        if (!r.ultimaEmissao || n.emissao > r.ultimaEmissao) r.ultimaEmissao = n.emissao;
      }

      var lista = n.parcelas.length
        ? n.parcelas
        : (vencimento(n) ? [{ vencimento: vencimento(n), valor: n.valor }] : []);

      if (!lista.length) {
        r.semData.quantidade++;
        r.semData.valor = centavos(r.semData.valor + n.valor);
        return;
      }
      lista.forEach(function (p) {
        var faixa = p.vencimento < hoje ? r.vencidas : (p.vencimento <= limite ? r.semana : r.depois);
        faixa.quantidade++;
        faixa.valor = centavos(faixa.valor + p.valor);
      });
    });

    r.fornecedores = Object.keys(fornecedores).length;
    return r;
  }

  /* ---------------- CSV ---------------- */

  function campo(v) {
    var s = v == null ? '' : String(v);
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function moeda(v) { return (Number(v) || 0).toFixed(2).replace('.', ','); }

  /* ponto e vírgula, vírgula decimal e BOM: é o que o Excel em português abre com dois cliques */
  function planilha(cabecalho, linhas) {
    return BOM + [cabecalho].concat(linhas).map(function (l) {
      return l.map(campo).join(';');
    }).join('\r\n') + '\r\n';
  }

  function csvNotas(notas) {
    return planilha(
      ['Chave', 'Número', 'Série', 'Emissão', 'Fornecedor', 'CNPJ/CPF', 'UF', 'Destinatário',
       'CNPJ destinatário', 'Natureza da operação', 'Valor', 'Condição', 'Parcelas',
       'Primeiro vencimento', 'Situação', 'Arquivo'],
      notas.map(function (n) {
        return [n.chave, n.numero, n.serie, formatarData(n.emissao), n.fornecedor, formatarDoc(n.docEmit),
                n.uf, n.destinatario, n.docDest ? formatarDoc(n.docDest) : '', n.natureza, moeda(n.valor),
                n.condicao, n.parcelas.length || (vencimento(n) ? 1 : 0), formatarData(vencimento(n)),
                n.situacao, n.arquivo];
      })
    );
  }

  /* Contas a pagar: cancelada e denegada ficam de fora — pagar uma dessas é justamente
     o erro que a digitação manual comete. Elas continuam no CSV das notas. */
  function csvParcelas(notas) {
    var linhas = [];
    notas.forEach(function (n) {
      if (n.situacao === 'cancelada' || n.situacao === 'denegada') return;
      var lista = n.parcelas.length
        ? n.parcelas.map(function (p) { return { rotulo: p.numero || '—', vencimento: p.vencimento, valor: p.valor }; })
        : (vencimento(n) ? [{ rotulo: n.condicao, vencimento: vencimento(n), valor: n.valor }] : []);
      lista.forEach(function (p) {
        linhas.push([formatarData(p.vencimento), n.fornecedor, formatarDoc(n.docEmit), n.numero,
                     p.rotulo, moeda(p.valor), moeda(n.valor), n.situacao, n.chave, p.vencimento]);
      });
    });
    linhas.sort(function (a, b) { return a[9] < b[9] ? -1 : a[9] > b[9] ? 1 : 0; });
    linhas.forEach(function (l) { l.pop(); });
    return planilha(
      ['Vencimento', 'Fornecedor', 'CNPJ/CPF', 'Nota', 'Parcela', 'Valor da parcela',
       'Valor da nota', 'Situação', 'Chave'],
      linhas
    );
  }

  /* ---------------- dados de exemplo ---------------- */

  function dvChave(s) {
    var peso = 2, soma = 0;
    for (var i = s.length - 1; i >= 0; i--) {
      soma += Number(s.charAt(i)) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    var r = soma % 11;
    return (r === 0 || r === 1) ? '0' : String(11 - r);
  }

  function esquerda(v, n) {
    var s = String(v);
    while (s.length < n) s = '0' + s;
    return s;
  }

  function montarChave(cUF, emissao, doc, serie, numero) {
    var base = esquerda(cUF, 2) + emissao.slice(2, 4) + emissao.slice(5, 7) + esquerda(doc, 14) +
               '55' + esquerda(serie, 3) + esquerda(numero, 9) + '1' + esquerda(numero, 8);
    return base + dvChave(base);
  }

  var DESTINO = { doc: '19024871000133', nome: 'COMERCIO E SERVICOS ORLA LTDA', municipio: 'Santos' };

  function montarNFe(d) {
    var total = 0;
    var itens = d.itens.map(function (it, i) {
      var v = centavos(it.qtd * it.unit);
      total = centavos(total + v);
      return '<det nItem="' + (i + 1) + '"><prod><cProd>' + it.cod + '</cProd>' +
        '<xProd>' + it.nome + '</xProd><NCM>' + it.ncm + '</NCM><CFOP>' + it.cfop + '</CFOP>' +
        '<uCom>' + it.un + '</uCom><qCom>' + it.qtd.toFixed(4) + '</qCom>' +
        '<vUnCom>' + it.unit.toFixed(4) + '</vUnCom><vProd>' + v.toFixed(2) + '</vProd>' +
        '<indTot>1</indTot></prod></det>';
    }).join('');

    var chave = montarChave(d.cUF, d.emissao, d.doc, d.serie, d.numero);
    var docEmit = d.doc.length === 11 ? '<CPF>' + d.doc + '</CPF>' : '<CNPJ>' + d.doc + '</CNPJ>';

    var cobr = '';
    if (d.parcelas && d.parcelas.length) {
      var resto = total, corpo = '';
      d.parcelas.forEach(function (dias, i) {
        var v = i === d.parcelas.length - 1 ? resto : centavos(total / d.parcelas.length);
        resto = centavos(resto - v);
        corpo += '<dup><nDup>' + esquerda(i + 1, 3) + '</nDup><dVenc>' + maisDias(d.emissao, dias) +
                 '</dVenc><vDup>' + v.toFixed(2) + '</vDup></dup>';
      });
      cobr = '<cobr><fat><nFat>' + d.numero + '</nFat><vOrig>' + total.toFixed(2) + '</vOrig>' +
             '<vDesc>0.00</vDesc><vLiq>' + total.toFixed(2) + '</vLiq></fat>' + corpo + '</cobr>';
    }

    var aPrazo = !!(d.parcelas && d.parcelas.length);
    var pag = '<pag><detPag><indPag>' + (aPrazo ? '1' : '0') + '</indPag>' +
              '<tPag>' + (d.tPag || (aPrazo ? '15' : '01')) + '</tPag>' +
              '<vPag>' + total.toFixed(2) + '</vPag></detPag></pag>';

    var prot = '<protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><chNFe>' + chave + '</chNFe>' +
      '<dhRecbto>' + d.emissao + 'T18:12:41-03:00</dhRecbto><nProt>135' + esquerda(d.numero, 12) + '</nProt>' +
      '<cStat>' + (d.cStat || '100') + '</cStat><xMotivo>' +
      (d.cStat === '101' ? 'Cancelamento de NF-e homologado' : 'Autorizado o uso da NF-e') +
      '</xMotivo></infProt></protNFe>';

    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">\n' +
      '<NFe><infNFe versao="4.00" Id="NFe' + chave + '">' +
      '<ide><cUF>' + d.cUF + '</cUF><cNF>' + esquerda(d.numero, 8) + '</cNF><natOp>' + d.natureza + '</natOp>' +
      '<mod>55</mod><serie>' + d.serie + '</serie><nNF>' + d.numero + '</nNF>' +
      '<dhEmi>' + d.emissao + 'T' + (d.hora || '09:41:00') + '-03:00</dhEmi><tpNF>1</tpNF>' +
      '<idDest>1</idDest><tpImp>1</tpImp><tpEmis>1</tpEmis><finNFe>1</finNFe></ide>' +
      '<emit>' + docEmit + '<xNome>' + d.nome + '</xNome>' +
      (d.fantasia ? '<xFant>' + d.fantasia + '</xFant>' : '') +
      '<enderEmit><xLgr>' + d.rua + '</xLgr><nro>' + d.nro + '</nro><xBairro>' + d.bairro + '</xBairro>' +
      '<xMun>' + d.municipio + '</xMun><UF>' + d.uf + '</UF><CEP>' + d.cep + '</CEP></enderEmit>' +
      '<IE>' + d.ie + '</IE><CRT>3</CRT></emit>' +
      '<dest><CNPJ>' + DESTINO.doc + '</CNPJ><xNome>' + DESTINO.nome + '</xNome>' +
      '<enderDest><xMun>' + DESTINO.municipio + '</xMun><UF>SP</UF></enderDest><indIEDest>1</indIEDest></dest>' +
      itens +
      '<total><ICMSTot><vBC>' + total.toFixed(2) + '</vBC><vICMS>' + centavos(total * 0.18).toFixed(2) + '</vICMS>' +
      '<vProd>' + total.toFixed(2) + '</vProd><vFrete>0.00</vFrete><vDesc>0.00</vDesc>' +
      '<vNF>' + total.toFixed(2) + '</vNF></ICMSTot></total>' +
      cobr + pag +
      '</infNFe></NFe>\n' + prot + '\n</nfeProc>';
  }

  /* Empresas e documentos fictícios. As datas nascem coladas em "hoje" para o visitante ver
     vencido, a vencer e futuro — uma pasta congelada numa data fixa não mostra nada disso. */
  function exemplos() {
    var hoje = hojeISO();
    var modelos = [
      { dias: -38, cUF: '35', doc: '91847263000158', nome: 'METALURGICA BAIA SUL LTDA', fantasia: 'BAIA SUL',
        rua: 'Rua Xavier da Silveira', nro: '412', bairro: 'Alemoa', municipio: 'Santos', uf: 'SP',
        cep: '11095420', ie: '633104058119', serie: '1', numero: '18432',
        natureza: 'VENDA DE MERCADORIA ADQUIRIDA DE TERCEIROS', parcelas: [30, 60, 90],
        itens: [{ cod: 'CH-2000', nome: 'CHAPA ACO CARBONO 2,00MM 1200X3000', ncm: '72085100', cfop: '5102', un: 'PC', qtd: 24, unit: 386.5 },
                { cod: 'PF-0810', nome: 'PERFIL U 4 POL x 6M', ncm: '72163100', cfop: '5102', un: 'PC', qtd: 12, unit: 259.4 }] },

      { dias: -22, cUF: '35', doc: '92735184000104', nome: 'DISTRIBUIDORA COSTA VERDE ME',
        rua: 'Avenida Presidente Wilson', nro: '2870', bairro: 'Boqueirao', municipio: 'Praia Grande', uf: 'SP',
        cep: '11701000', ie: '447209813226', serie: '2', numero: '9071',
        natureza: 'VENDA DE MERCADORIA', parcelas: [28],
        itens: [{ cod: 'EMB-500', nome: 'CAIXA PAPELAO ONDULADO 40X30X25', ncm: '48191000', cfop: '5102', un: 'CX', qtd: 350, unit: 4.87 },
                { cod: 'FIT-048', nome: 'FITA ADESIVA 48MMX100M', ncm: '39191000', cfop: '5102', un: 'RL', qtd: 60, unit: 8.9 }] },

      { dias: -12, cUF: '35', doc: '93610427000190', nome: 'PAPELARIA MARE ALTA LTDA',
        rua: 'Rua Amador Bueno', nro: '145', bairro: 'Centro', municipio: 'Santos', uf: 'SP',
        cep: '11013151', ie: '633820117440', serie: '1', numero: '4417',
        natureza: 'VENDA', tPag: '03',
        itens: [{ cod: 'PAP-A4', nome: 'PAPEL SULFITE A4 75G RESMA 500FL', ncm: '48025610', cfop: '5102', un: 'RM', qtd: 30, unit: 24.9 },
                { cod: 'TON-26A', nome: 'TONER COMPATIVEL 26A PRETO', ncm: '84439990', cfop: '5102', un: 'UN', qtd: 4, unit: 118.0 }] },

      { dias: -46, cUF: '35', doc: '94528016000177', nome: 'TRANSPORTES ENSEADA LTDA',
        rua: 'Rodovia Conego Domenico Rangoni', nro: 'KM 258', bairro: 'Distrito Industrial',
        municipio: 'Cubatao', uf: 'SP', cep: '11573000', ie: '286440917305', serie: '1', numero: '2288',
        natureza: 'PRESTACAO DE SERVICO DE ARMAZENAGEM', parcelas: [40, 70],
        itens: [{ cod: 'ARM-MES', nome: 'ARMAZENAGEM MENSAL - POSICAO PALETE', ncm: '00000000', cfop: '5949', un: 'MES', qtd: 40, unit: 71.75 }] },

      { dias: -9, cUF: '35', doc: '95314790000122', nome: 'INSUMOS GUARUJA COMERCIO LTDA', fantasia: 'INSUMOS GUARUJA',
        rua: 'Avenida Adhemar de Barros', nro: '1904', bairro: 'Vicente de Carvalho',
        municipio: 'Guaruja', uf: 'SP', cep: '11460003', ie: '336128704551', serie: '1', numero: '11205',
        natureza: 'VENDA DE MERCADORIA', parcelas: [21, 45],
        itens: [{ cod: 'RES-25', nome: 'RESINA POLIESTER INSATURADA BOMBONA 25KG', ncm: '39073000', cfop: '5102', un: 'BB', qtd: 8, unit: 742.3 },
                { cod: 'CAT-01', nome: 'CATALISADOR MEK PEROXIDO 1L', ncm: '29055000', cfop: '5102', un: 'UN', qtd: 24, unit: 106.4 }] },

      { dias: -5, cUF: '31', doc: '48273916502', nome: 'JOSE ANTONIO RIBEIRO',
        rua: 'Estrada Municipal do Bom Retiro', nro: 'SN', bairro: 'Zona Rural',
        municipio: 'Camanducaia', uf: 'MG', cep: '37650000', ie: 'ISENTO', serie: '1', numero: '627',
        natureza: 'VENDA DE PRODUCAO DO ESTABELECIMENTO', tPag: '01',
        itens: [{ cod: 'CAF-SC', nome: 'CAFE CRU EM GRAO ARABICA SACA 60KG', ncm: '09011110', cfop: '5101', un: 'SC', qtd: 15, unit: 1284.0 }] },

      { dias: -30, cUF: '35', doc: '92735184000104', nome: 'DISTRIBUIDORA COSTA VERDE ME',
        rua: 'Avenida Presidente Wilson', nro: '2870', bairro: 'Boqueirao', municipio: 'Praia Grande', uf: 'SP',
        cep: '11701000', ie: '447209813226', serie: '2', numero: '8994',
        natureza: 'VENDA DE MERCADORIA', parcelas: [30], cStat: '101',
        itens: [{ cod: 'EMB-500', nome: 'CAIXA PAPELAO ONDULADO 40X30X25', ncm: '48191000', cfop: '5102', un: 'CX', qtd: 120, unit: 4.87 }] }
    ];

    var arquivos = modelos.map(function (d) {
      d.emissao = maisDias(hoje, d.dias);
      var xml = montarNFe(d);
      return { nome: xml.match(/Id="NFe(\d{44})"/)[1] + '-nfe.xml', texto: xml };
    });

    /* o mesmo arquivo baixado duas vezes — é assim que a pasta de verdade fica */
    arquivos.push({ nome: arquivos[0].nome.replace('-nfe.xml', '-nfe (1).xml'), texto: arquivos[0].texto });

    var cancelada = arquivos[6].nome.slice(0, 44);
    arquivos.push({
      nome: cancelada + '-procEventoNFe.xml',
      texto: '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">' +
        '<evento versao="1.00"><infEvento Id="ID110111' + cancelada + '01">' +
        '<cOrgao>35</cOrgao><tpAmb>1</tpAmb><CNPJ>92735184000104</CNPJ><chNFe>' + cancelada + '</chNFe>' +
        '<dhEvento>' + maisDias(hoje, -28) + 'T11:02:10-03:00</dhEvento><tpEvento>110111</tpEvento>' +
        '<nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento>' +
        '<detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>135260008812345</nProt>' +
        '<xJust>Erro na emissao do documento fiscal</xJust></detEvento></infEvento></evento>' +
        '<retEvento versao="1.00"><infEvento><tpAmb>1</tpAmb><cStat>135</cStat>' +
        '<xMotivo>Evento registrado e vinculado a NF-e</xMotivo></infEvento></retEvento></procEventoNFe>'
    });

    var chaveCte = montarChave('35', maisDias(hoje, -16), '96428135000188', '1', '443');
    arquivos.push({
      nome: chaveCte + '-cte.xml',
      texto: '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<cteProc xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00"><CTe>' +
        '<infCte versao="4.00" Id="CTe' + chaveCte + '">' +
        '<ide><cUF>35</cUF><mod>57</mod><serie>1</serie><nCT>443</nCT>' +
        '<natOp>PRESTACAO DE SERVICO DE TRANSPORTE</natOp></ide>' +
        '<emit><CNPJ>96428135000188</CNPJ><xNome>RODOVIARIO LITORAL SUL LTDA</xNome></emit>' +
        '<vPrest><vTPrest>1840.00</vTPrest></vPrest></infCte></CTe></cteProc>'
    });

    return arquivos;
  }

  raiz.NFE = {
    lerArquivo: lerArquivo,
    juntar: juntar,
    resumo: resumo,
    vencimento: vencimento,
    formatarDoc: formatarDoc,
    formatarData: formatarData,
    formatarValor: formatarValor,
    hojeISO: hojeISO,
    maisDias: maisDias,
    csvNotas: csvNotas,
    csvParcelas: csvParcelas,
    exemplos: exemplos
  };
})(window);
