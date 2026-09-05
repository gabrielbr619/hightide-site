/* Núcleo da cobrança no WhatsApp: lê a planilha de contas a receber, classifica cada título
   por etapa da régua e monta a mensagem e o link de envio. Puro, sem DOM. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('../comum/comum.js'));
  else raiz.COB = fabrica(raiz.COMUM);
})(this, function (COMUM) {
  'use strict';

  var ETAPAS = ['atraso', 'atraso-leve', 'hoje', 'vespera', 'antes', 'depois', 'sem-data', 'pago'];

  var ETIQUETAS = {
    atraso: 'em atraso',
    'atraso-leve': 'atraso recente',
    hoje: 'vence hoje',
    vespera: 'vence em breve',
    antes: 'aviso antecipado',
    depois: 'ainda não',
    'sem-data': 'sem data',
    pago: 'pago'
  };

  var MODELOS = {
    antes: 'Oi {primeiro_nome}, tudo bem? Passando para lembrar da fatura de {valor}, ' +
      'que vence em {vencimento} — daqui a {dias} dias. Se já pagou, é só ignorar. Obrigado, {empresa}.',
    vespera: 'Oi {primeiro_nome}, tudo bem? A fatura de {valor} vence em {vencimento}. ' +
      'Se precisar da segunda via do boleto, me avisa por aqui. Obrigado, {empresa}.',
    hoje: 'Oi {primeiro_nome}, a fatura de {valor} vence hoje, {vencimento}. ' +
      'Se quiser, mando o boleto de novo por aqui. Obrigado, {empresa}.',
    'atraso-leve': 'Oi {primeiro_nome}, a fatura de {valor} venceu em {vencimento}, há {dias} dias. ' +
      'Consegue acertar ainda hoje? Se já pagou, me avisa que eu dou baixa. Obrigado, {empresa}.',
    atraso: 'Oi {primeiro_nome}, a fatura de {valor} está aberta desde {vencimento}, há {dias} dias. ' +
      'Podemos combinar uma data para o pagamento? Obrigado, {empresa}.'
  };

  /* ---------------- colunas ---------------- */

  var CABECALHOS = {
    vencimento: /venc/i,
    valor: /valor|total|montante|saldo|receber|pre[çc]o|d[ée]bito/i,
    telefone: /telefone|fone|celular|whats|\btel\b|m[óo]vel|movel/i,
    email: /e-?mail|correio/i,
    documento: /documento|t[íi]tulo|duplicata|fatura|boleto|nota|n[úu]mero|^n[º°]?$|^doc/i,
    status: /status|situa[çc][ãa]o|pago|baixa|liquid/i,
    nome: /cliente|nome|raz[ãa]o|sacado|devedor|fantasia|empresa/i
  };

  var TIPOS = {
    vencimento: 'data',
    valor: 'numero',
    telefone: 'telefone',
    email: 'email',
    documento: '',
    status: '',
    nome: ''
  };

  var ORDEM = ['vencimento', 'valor', 'telefone', 'email', 'documento', 'status', 'nome'];

  function coluna(linhas, idx) {
    var valores = [];
    for (var i = 0; i < linhas.length && i < 400; i++) valores.push(linhas[i][idx]);
    return valores;
  }

  function detectarColunas(cabecalho, linhas) {
    cabecalho = cabecalho || [];
    linhas = linhas || [];
    var tipos = cabecalho.map(function (titulo, idx) {
      return COMUM.tipoColuna(titulo, coluna(linhas, idx));
    });
    var mapa = {}, usadas = {};
    ORDEM.forEach(function (campo) { mapa[campo] = -1; });

    ORDEM.forEach(function (campo) {
      var melhor = -1, melhorPontos = 0;
      cabecalho.forEach(function (titulo, idx) {
        if (usadas[idx]) return;
        var pontos = (CABECALHOS[campo].test(COMUM.limpo(titulo)) ? 30 : 0) +
          (TIPOS[campo] && tipos[idx] === TIPOS[campo] ? 1 : 0);
        if (pontos > melhorPontos) { melhorPontos = pontos; melhor = idx; }
      });
      if (melhor >= 0) { mapa[campo] = melhor; usadas[melhor] = true; }
    });
    return mapa;
  }

  /* ---------------- títulos ---------------- */

  function pega(linha, idx) {
    return idx >= 0 && idx < linha.length ? COMUM.limpo(linha[idx]) : '';
  }

  function montar(cabecalho, linhas, mapa) {
    linhas = linhas || [];
    mapa = mapa || detectarColunas(cabecalho, linhas);
    return linhas.map(function (l) {
      var telefone = COMUM.normalizarTelefone(pega(l, mapa.telefone));
      var valor = COMUM.numero(pega(l, mapa.valor));
      var status = COMUM.semAcento(pega(l, mapa.status)).toLowerCase();
      return {
        nome: pega(l, mapa.nome),
        telefone: telefone,
        telefoneOk: telefone.length >= 10 && COMUM.DDDS[telefone.slice(0, 2)] === true,
        /* null e zero são coisas diferentes aqui: valor ilegível não entra nas somas nem vira "R$ 0,00" */
        valor: valor,
        vencimento: COMUM.data(pega(l, mapa.vencimento)),
        documento: pega(l, mapa.documento),
        pago: /pag|quit|liquid|baix/.test(status)
      };
    });
  }

  /* ---------------- régua ---------------- */

  function classificar(titulo, hoje) {
    hoje = hoje || COMUM.hojeISO();
    var venc = titulo && titulo.vencimento ? titulo.vencimento : '';
    var dias = venc ? COMUM.diasEntre(hoje, venc) : null;
    if (titulo && titulo.pago) return { etapa: 'pago', dias: dias };
    if (!venc) return { etapa: 'sem-data', dias: null };
    var etapa;
    if (dias > 7) etapa = 'depois';
    else if (dias >= 4) etapa = 'antes';
    else if (dias >= 1) etapa = 'vespera';
    else if (dias === 0) etapa = 'hoje';
    else if (dias >= -7) etapa = 'atraso-leve';
    else etapa = 'atraso';
    return { etapa: etapa, dias: dias };
  }

  /* ---------------- mensagem ---------------- */

  function primeiroNome(nome) {
    return COMUM.limpo(nome).split(/\s+/)[0] || '';
  }

  function preencher(modelo, titulo, opcoes) {
    opcoes = opcoes || {};
    var empresa = COMUM.limpo(opcoes.empresa);
    var dias = classificar(titulo, opcoes.hoje).dias;
    var texto = String(modelo || '');
    /* sem empresa a assinatura vira "Obrigado." — a vírgula pendurada denunciaria o campo vazio */
    if (!empresa) texto = texto.replace(/,\s*\{empresa\}/g, '');
    var campos = {
      nome: COMUM.limpo(titulo.nome),
      primeiro_nome: primeiroNome(titulo.nome),
      valor: titulo.valor === null || titulo.valor === undefined ? 'valor a confirmar' : 'R$ ' + COMUM.formatarValor(titulo.valor),
      vencimento: COMUM.formatarData(titulo.vencimento),
      /* o modelo já diz "há" ou "daqui a": o sinal do atraso viraria "há -10 dias" */
      dias: dias === null ? '' : String(Math.abs(dias)),
      documento: titulo.documento || '',
      empresa: empresa
    };
    return texto.replace(/\{(\w+)\}/g, function (todo, campo) {
      return Object.prototype.hasOwnProperty.call(campos, campo) ? campos[campo] : todo;
    });
  }

  function linkWhats(telefone, mensagem) {
    var d = COMUM.normalizarTelefone(telefone);
    if (d.length < 10 || d.length > 11) return '';
    return 'https://wa.me/55' + d + '?text=' + encodeURIComponent(String(mensagem == null ? '' : mensagem));
  }

  /* ---------------- plano ---------------- */

  function plano(titulos, opcoes) {
    opcoes = opcoes || {};
    var hoje = opcoes.hoje || COMUM.hojeISO();
    var modelos = {};
    Object.keys(MODELOS).forEach(function (k) { modelos[k] = MODELOS[k]; });
    Object.keys(opcoes.modelos || {}).forEach(function (k) { modelos[k] = opcoes.modelos[k]; });

    return (titulos || []).map(function (t) {
      var c = classificar(t, hoje);
      var modelo = modelos[c.etapa] || '';
      var mensagem = modelo ? preencher(modelo, t, { empresa: opcoes.empresa, hoje: hoje }) : '';
      return {
        nome: t.nome,
        telefone: t.telefone,
        telefoneOk: t.telefoneOk,
        valor: t.valor,
        vencimento: t.vencimento,
        documento: t.documento,
        pago: t.pago,
        etapa: c.etapa,
        dias: c.dias,
        etiqueta: ETIQUETAS[c.etapa] || c.etapa,
        mensagem: mensagem,
        link: mensagem ? linkWhats(t.telefone, mensagem) : ''
      };
    });
  }

  function faixa(lista) {
    var valor = 0;
    lista.forEach(function (t) { valor += t.valor || 0; });
    return { n: lista.length, valor: valor };
  }

  function filtrar(plano, testa) {
    return (plano || []).filter(testa);
  }

  function resumo(plano) {
    return {
      atrasado: faixa(filtrar(plano, function (t) { return t.etapa === 'atraso' || t.etapa === 'atraso-leve'; })),
      hoje: faixa(filtrar(plano, function (t) { return t.etapa === 'hoje'; })),
      proximos7: faixa(filtrar(plano, function (t) { return t.etapa === 'vespera' || t.etapa === 'antes'; })),
      depois: faixa(filtrar(plano, function (t) { return t.etapa === 'depois'; })),
      semTelefone: faixa(filtrar(plano, function (t) { return !t.pago && !t.telefoneOk; })),
      semValor: faixa(filtrar(plano, function (t) { return !t.pago && t.valor === null; })),
      pagos: faixa(filtrar(plano, function (t) { return t.etapa === 'pago'; }))
    };
  }

  /* ---------------- exportação ---------------- */

  function csvPlano(plano) {
    var linhas = [['Cliente', 'Telefone', 'Documento', 'Vencimento', 'Dias', 'Valor', 'Etapa', 'Etiqueta', 'Mensagem', 'Link']];
    (plano || []).forEach(function (t) {
      linhas.push([
        t.nome,
        COMUM.formatarTelefone(t.telefone),
        t.documento,
        COMUM.formatarData(t.vencimento),
        t.dias === null ? '' : t.dias,
        t.valor === null || t.valor === undefined ? '' : COMUM.formatarValor(t.valor),
        t.etapa,
        t.etiqueta || t.etapa,
        t.mensagem,
        t.link
      ]);
    });
    return COMUM.csv(linhas);
  }

  /* ---------------- exemplo ---------------- */

  var BASE_EXEMPLO = [
    ['Padaria Trigo de Ouro', 'NF 2041', 'financeiro@trigodeouro.com.br', '+55 (11) 98812-3344', -25, '1.280,00', ''],
    ['Marcenaria Cedro', 'NF 2038', 'contato@marcenariacedro.com.br', '(21) 99640-2277', -14, '3.450,00', 'Em aberto'],
    ['Clínica Bem Viver', 'NF 2052', 'adm@bemviver.com.br', '31 98701-4455', -6, '890,00', 'Em aberto'],
    ['Auto Peças Ipiranga', 'NF 2055', 'compras@apipiranga.com.br', '(11) 3123-4567', -3, '2.480,00', ''],
    ['Studio Nove Design', 'NF 2058', 'ola@studionove.com.br', '98812-3344', -1, '1.150,00', 'Em aberto'],
    ['Mercado São Jorge', 'NF 2061', 'financeiro@saojorge.com.br', '41 99118-2020', 0, '4.320,00', 'Em aberto'],
    ['Escola Primeiro Passo', 'NF 2062', 'secretaria@primeiropasso.com.br', '(47) 98844-1290', 0, '760,00', ''],
    ['Transportes Litoral', 'NF 2064', 'fiscal@translitoral.com.br', '51 99502-3311', 1, '5.900,00', 'Em aberto'],
    ['Café da Esquina', 'NF 2066', 'contato@cafedaesquina.com.br', '(61) 98230-7744', 2, '430,00', ''],
    ['Oficina Bom Motor', 'NF 2069', 'bommotor@oficina.com.br', '62 99444-8080', 3, '1.980,00', 'Em aberto'],
    ['Floricultura Jardim', 'NF 2070', '', '', 3, '320,00', ''],
    ['Sorveteria Polar', 'NF 2073', 'polar@sorveteriapolar.com.br', '71 98155-6622', 4, '640,00', 'Em aberto'],
    ['Academia Corpo Livre', 'NF 2075', 'contato@corpolivre.com.br', '(81) 99733-1144', 5, '1.100,00', ''],
    ['Gráfica Impressa', 'NF 2077', 'orcamento@graficaimpressa.com.br', '85 98622-9033', 6, '2.150,00', 'Em aberto'],
    ['Pousada Maré Mansa', 'NF 2079', 'reservas@maremansa.com.br', '(48) 99811-4747', 7, '3.780,00', ''],
    ['Construtora Alvorada', 'NF 2081', 'obras@construtoraalvorada.com.br', '11 97722-5566', 12, '8.400,00', 'Em aberto'],
    ['Laboratório Vida', 'NF 2084', 'financeiro@labvida.com.br', '(19) 98533-2211', 20, '1.640,00', ''],
    ['Restaurante Fogo Alto', 'NF 2036', 'contato@fogoalto.com.br', '27 99688-3300', -10, '2.900,00', 'Pago']
  ];

  function exemplo(hoje) {
    hoje = hoje || COMUM.hojeISO();
    return {
      nome: 'contas-a-receber-exemplo.csv',
      cabecalho: ['Cliente', 'Documento', 'E-mail', 'Telefone', 'Vencimento', 'Valor (R$)', 'Status'],
      linhas: BASE_EXEMPLO.map(function (l) {
        return [l[0], l[1], l[2], l[3], COMUM.formatarData(COMUM.maisDias(hoje, l[4])), l[5], l[6]];
      })
    };
  }

  return {
    ETAPAS: ETAPAS,
    ETIQUETAS: ETIQUETAS,
    MODELOS: MODELOS,
    detectarColunas: detectarColunas,
    montar: montar,
    classificar: classificar,
    preencher: preencher,
    linkWhats: linkWhats,
    plano: plano,
    resumo: resumo,
    csvPlano: csvPlano,
    exemplo: exemplo
  };
});
