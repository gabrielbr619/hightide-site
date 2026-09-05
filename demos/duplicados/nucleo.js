/* Núcleo do caça-duplicados: lê CSV, normaliza cadastro, cruza por documento, e-mail,
   telefone e nome (exato ou parecido), agrupa e exporta. Sem dependência da página. */
(function (raiz) {
  'use strict';

  var BOM = String.fromCharCode(0xFEFF);

  function limpo(s) { return String(s == null ? '' : s).trim(); }
  function semAcento(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  /* ---------------- CSV ---------------- */

  function contarFora(linha, sep) {
    var n = 0, aspas = false;
    for (var i = 0; i < linha.length; i++) {
      var c = linha.charAt(i);
      if (c === '"') aspas = !aspas;
      else if (!aspas && c === sep) n++;
    }
    return n;
  }

  function detectarSeparador(primeiraLinha) {
    var melhor = ';', max = -1;
    [';', ',', '\t', '|'].forEach(function (s) {
      var n = contarFora(primeiraLinha, s);
      if (n > max) { max = n; melhor = s; }
    });
    return melhor;
  }

  function parsear(texto, sep) {
    var linhas = [], linha = [], campo = '', aspas = false;
    for (var i = 0; i < texto.length; i++) {
      var c = texto.charAt(i);
      if (aspas) {
        if (c === '"') {
          if (texto.charAt(i + 1) === '"') { campo += '"'; i++; }
          else aspas = false;
        } else campo += c;
      } else if (c === '"') {
        aspas = true;
      } else if (c === sep) {
        linha.push(campo); campo = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && texto.charAt(i + 1) === '\n') i++;
        linha.push(campo); campo = '';
        linhas.push(linha); linha = [];
      } else {
        campo += c;
      }
    }
    if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
    return linhas;
  }

  function lerCSV(texto) {
    texto = String(texto || '');
    if (texto.charCodeAt(0) === 0xFEFF) texto = texto.slice(1);
    var separador = detectarSeparador(texto.split(/\r?\n/)[0] || '');
    var linhas = parsear(texto, separador).filter(function (l) {
      return l.some(function (c) { return c.trim() !== ''; });
    });
    var cabecalho = linhas.length ? linhas[0].map(function (c) { return c.trim(); }) : [];
    var dados = linhas.slice(1).map(function (l) {
      var copia = l.slice(0, cabecalho.length).map(function (c) { return c.trim(); });
      while (copia.length < cabecalho.length) copia.push('');
      return copia;
    });
    return { cabecalho: cabecalho, linhas: dados, separador: separador };
  }

  /* ---------------- normalização ---------------- */

  /* `daColunaDoc`: Excel derruba zero à esquerda (13 dígitos é CNPJ, 10 é CPF) — mas só vale
     completar quando o valor veio da coluna de documento; num telefone de 10 dígitos seria mentira */
  function normalizarDoc(s, daColunaDoc) {
    var bruto = limpo(s), d = bruto.replace(/\D/g, '');
    if (daColunaDoc && d === bruto) {
      if (d.length === 12 || d.length === 13) d = ('00' + d).slice(-14);
      if (d.length === 9 || d.length === 10) d = ('00' + d).slice(-11);
    }
    if (d.length !== 11 && d.length !== 14) return '';
    if (/^(\d)\1+$/.test(d)) return '';
    return d;
  }

  function normalizarTelefone(s) {
    var d = String(s || '').replace(/\D/g, '');
    if (d.length >= 12 && d.indexOf('55') === 0) d = d.slice(2);
    if (d.length >= 11 && d.charAt(0) === '0') d = d.slice(1);
    if (d.length < 8 || d.length > 11) return '';
    if (/^(\d)\1+$/.test(d)) return '';
    return d;
  }

  /* sem DDD de um lado: o número de 8-9 dígitos tem que ser o final do outro */
  function mesmoTelefone(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    var curto = a.length < b.length ? a : b, longo = a.length < b.length ? b : a;
    return curto.length <= 9 && longo.length >= 10 && longo.slice(-curto.length) === curto;
  }

  function normalizarEmail(s) {
    var e = limpo(s).toLowerCase();
    return e.indexOf('@') > 0 ? e : '';
  }

  function normalizarNome(s) {
    var t = semAcento(String(s || '')).toUpperCase().replace(/S\/A/g, 'SA');
    t = t.replace(/[^A-Z0-9 ]+/g, ' ');
    t = t.replace(/\b(LTDA|ME|EPP|EIRELI|MEI|SA|CIA)\b/g, ' ');
    return t.replace(/\s+/g, ' ').trim();
  }

  function chaveNome(s) {
    return normalizarNome(s).split(' ').filter(Boolean).sort().join(' ');
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var anterior = [], atual = [], i, j;
    for (j = 0; j <= b.length; j++) anterior[j] = j;
    for (i = 1; i <= a.length; i++) {
      atual[0] = i;
      for (j = 1; j <= b.length; j++) {
        var custo = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + custo);
      }
      var troca = anterior; anterior = atual; atual = troca;
    }
    return anterior[b.length];
  }

  function razao(a, b) {
    if (!a || !b) return 0;
    var maior = Math.max(a.length, b.length);
    return maior ? 1 - levenshtein(a, b) / maior : 0;
  }

  function similaridade(a, b) {
    var na = normalizarNome(a), nb = normalizarNome(b);
    if (!na || !nb) return 0;
    return Math.max(razao(na, nb), razao(chaveNome(a), chaveNome(b)));
  }

  /* ---------------- colunas ---------------- */

  var CABECALHOS = {
    doc:      [[/cnpj|cpf|documento|^doc\b|^doc$/i, 3]],
    email:    [[/e-?mail|correio/i, 3]],
    telefone: [[/telefone|fone|celular|whats|\btel\b|movel|móvel/i, 3]],
    cidade:   [[/cidade|municipio|município/i, 3]],
    nome:     [[/raz[aã]o/i, 3], [/^nome$|^cliente$|^nome do cliente$|^razao social$/i, 3], [/^nome |cliente|fantasia|empresa|contato|^nome/i, 1]]
  };

  function proporcao(linhas, idx, testa) {
    var total = 0, ok = 0;
    for (var i = 0; i < linhas.length && i < 400; i++) {
      var v = limpo(linhas[i][idx]);
      if (!v) continue;
      total++;
      if (testa(v)) ok++;
    }
    return total ? ok / total : 0;
  }

  var CONTEUDO = {
    doc: function (v) { return !!normalizarDoc(v); },
    email: function (v) { return !!normalizarEmail(v); },
    telefone: function (v) { return !normalizarDoc(v) && !!normalizarTelefone(v) && /\d/.test(v) && v.replace(/\D/g, '').length <= 13; },
    cidade: function (v) { return /^[A-Za-zÀ-ÿ' ]{3,}(\/[A-Za-z]{2})?$/.test(v) && v.split(' ').length <= 4; },
    nome: function (v) { return /[A-Za-zÀ-ÿ]{3,}/.test(v) && v.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= v.length * 0.6 && v.length >= 5; }
  };

  function detectarColunas(cabecalho, linhas) {
    var mapa = { nome: -1, doc: -1, telefone: -1, email: -1, cidade: -1 };
    var usadas = {};
    ['doc', 'email', 'telefone', 'cidade', 'nome'].forEach(function (campo) {
      var melhor = -1, melhorPontos = 0;
      cabecalho.forEach(function (titulo, idx) {
        if (usadas[idx]) return;
        var pontos = 0;
        CABECALHOS[campo].forEach(function (p) { if (p[0].test(limpo(titulo))) pontos = Math.max(pontos, p[1]); });
        /* cidade só pelo cabeçalho: qualquer coluna de texto curto passaria no teste de conteúdo */
        if (campo === 'cidade' && !pontos) return;
        var prop = linhas.length ? proporcao(linhas, idx, CONTEUDO[campo]) : 0;
        if (linhas.length && prop < 0.5 && campo !== 'nome' && campo !== 'cidade' && pontos < 3) pontos = 0;
        var total = pontos * 10 + prop;
        if ((pontos > 0 || prop >= 0.5) && total > melhorPontos) { melhorPontos = total; melhor = idx; }
      });
      if (melhor >= 0) { mapa[campo] = melhor; usadas[melhor] = true; }
    });
    return mapa;
  }

  /* ---------------- registros ---------------- */

  function montarRegistros(origem, cabecalho, linhas, mapa) {
    function pega(l, idx) { return idx >= 0 && idx < l.length ? limpo(l[idx]) : ''; }
    return linhas.map(function (l, i) {
      var nome = pega(l, mapa.nome), doc = pega(l, mapa.doc), tel = pega(l, mapa.telefone), email = pega(l, mapa.email);
      return {
        id: origem + ':' + (i + 2),
        origem: origem,
        linha: i + 2,
        nome: nome, doc: doc, telefone: tel, email: email, cidade: pega(l, mapa.cidade),
        nomeNorm: normalizarNome(nome),
        chave: chaveNome(nome),
        docNorm: normalizarDoc(doc, true),
        telefoneNorm: normalizarTelefone(tel),
        emailNorm: normalizarEmail(email),
        bruto: l
      };
    });
  }

  /* ---------------- encontrar ---------------- */

  var ORDEM_MOTIVOS = ['documento', 'e-mail', 'telefone', 'nome', 'nome parecido'];

  function encontrar(registros, opcoes) {
    opcoes = opcoes || {};
    var corte = opcoes.corte || 0.85;
    var n = registros.length;
    var pai = registros.map(function (_, i) { return i; });
    var motivosPar = {};

    function raizDe(i) { while (pai[i] !== i) { pai[i] = pai[pai[i]]; i = pai[i]; } return i; }
    function ligar(i, j, motivo) {
      var k = i < j ? i + '|' + j : j + '|' + i;
      (motivosPar[k] = motivosPar[k] || {})[motivo] = true;
      var a = raizDe(i), b = raizDe(j);
      if (a !== b) pai[b] = a;
    }
    function porChave(extrai, motivo, confirma) {
      var indice = {};
      registros.forEach(function (r, i) {
        var k = extrai(r);
        if (!k) return;
        (indice[k] = indice[k] || []).push(i);
      });
      Object.keys(indice).forEach(function (k) {
        var lista = indice[k];
        for (var a = 0; a < lista.length; a++) {
          for (var b = a + 1; b < lista.length; b++) {
            if (!confirma || confirma(registros[lista[a]], registros[lista[b]])) ligar(lista[a], lista[b], motivo);
          }
        }
      });
    }

    porChave(function (r) { return r.docNorm; }, 'documento');
    porChave(function (r) { return r.emailNorm; }, 'e-mail');
    porChave(function (r) { return r.telefoneNorm ? r.telefoneNorm.slice(-8) : ''; }, 'telefone',
      function (a, b) { return mesmoTelefone(a.telefoneNorm, b.telefoneNorm); });
    porChave(function (r) { return r.chave; }, 'nome');

    /* nome parecido: só compara quem divide a primeira ou a última palavra — sem isso é n² */
    var blocos = {}, vistos = {};
    registros.forEach(function (r, i) {
      var t = r.nomeNorm.split(' ').filter(Boolean);
      if (!t.length) return;
      var chaves = [t[0], t[t.length - 1]];
      chaves.forEach(function (k) { if (k.length >= 3) (blocos[k] = blocos[k] || []).push(i); });
    });
    Object.keys(blocos).forEach(function (k) {
      var lista = blocos[k];
      if (lista.length > 600) return;
      for (var a = 0; a < lista.length; a++) {
        for (var b = a + 1; b < lista.length; b++) {
          var i = lista[a], j = lista[b], par = i + '|' + j;
          if (vistos[par]) continue;
          vistos[par] = true;
          if (registros[i].chave === registros[j].chave) continue;
          var s = Math.max(razao(registros[i].nomeNorm, registros[j].nomeNorm), razao(registros[i].chave, registros[j].chave));
          if (s >= corte) ligar(i, j, 'nome parecido');
        }
      }
    });

    var porRaiz = {};
    registros.forEach(function (_, i) {
      var r = raizDe(i);
      (porRaiz[r] = porRaiz[r] || []).push(i);
    });
    var grupos = [];
    Object.keys(porRaiz).forEach(function (r) {
      var membros = porRaiz[r];
      if (membros.length < 2) return;
      var motivos = {};
      for (var a = 0; a < membros.length; a++) {
        for (var b = a + 1; b < membros.length; b++) {
          var m = motivosPar[membros[a] + '|' + membros[b]];
          if (m) Object.keys(m).forEach(function (x) { motivos[x] = true; });
        }
      }
      var lista = ORDEM_MOTIVOS.filter(function (x) { return motivos[x]; });
      var forte = motivos['documento'] || motivos['e-mail'] || (motivos['telefone'] && (motivos['nome'] || motivos['nome parecido']));
      var origens = {};
      membros.forEach(function (i) { origens[registros[i].origem] = true; });
      grupos.push({
        registros: membros.map(function (i) { return registros[i]; }),
        motivos: lista,
        certeza: forte ? 'certo' : 'provavel',
        entreArquivos: Object.keys(origens).length > 1
      });
    });
    grupos.sort(function (a, b) {
      if (a.certeza !== b.certeza) return a.certeza === 'certo' ? -1 : 1;
      return b.registros.length - a.registros.length;
    });
    grupos.forEach(function (g, i) { g.id = i + 1; });
    return { grupos: grupos };
  }

  function resumo(registros, resultado) {
    var origens = {};
    registros.forEach(function (r) { origens[r.origem] = true; });
    var envolvidos = 0, certos = 0, provaveis = 0, entre = 0;
    resultado.grupos.forEach(function (g) {
      envolvidos += g.registros.length;
      if (g.certeza === 'certo') certos++; else provaveis++;
      if (g.entreArquivos) entre++;
    });
    return {
      cadastros: registros.length,
      arquivos: Object.keys(origens).length,
      grupos: resultado.grupos.length,
      envolvidos: envolvidos,
      sobrando: envolvidos - resultado.grupos.length,
      certos: certos,
      provaveis: provaveis,
      entreArquivos: entre
    };
  }

  /* ---------------- exportação ---------------- */

  function campo(v) {
    var s = v == null ? '' : String(v);
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function planilha(cabecalho, linhas) {
    return BOM + [cabecalho].concat(linhas).map(function (l) { return l.map(campo).join(';'); }).join('\r\n') + '\r\n';
  }

  function csvRepetidos(grupos) {
    var linhas = [];
    grupos.forEach(function (g) {
      g.registros.forEach(function (r) {
        linhas.push([g.id, g.certeza === 'certo' ? 'certo' : 'provável', g.motivos.join(', '), r.origem, r.linha,
                     r.nome, r.doc, r.telefone, r.email, r.cidade]);
      });
    });
    return planilha(['Grupo', 'Certeza', 'Motivos', 'Origem', 'Linha', 'Nome', 'CNPJ/CPF', 'Telefone', 'E-mail', 'Cidade'], linhas);
  }

  var CAMPOS = ['nome', 'doc', 'telefone', 'email', 'cidade'];

  function completude(r) {
    return CAMPOS.reduce(function (s, c) { return s + (r[c] ? 1 : 0); }, 0) + (r.docNorm ? 0.5 : 0);
  }

  /* o mais completo manda; buraco dele é preenchido com o que os outros do grupo têm */
  function unificar(grupo) {
    var ordenados = grupo.registros.slice().sort(function (a, b) { return completude(b) - completude(a); });
    var base = {};
    CAMPOS.forEach(function (c) {
      base[c] = '';
      for (var i = 0; i < ordenados.length; i++) { if (ordenados[i][c]) { base[c] = ordenados[i][c]; break; } }
    });
    var origens = [];
    grupo.registros.forEach(function (r) { if (origens.indexOf(r.origem) < 0) origens.push(r.origem); });
    base.origens = origens.join(' + ');
    base.quantos = grupo.registros.length;
    return base;
  }

  function csvUnificado(registros, grupos) {
    var emGrupo = {};
    grupos.forEach(function (g) { g.registros.forEach(function (r) { emGrupo[r.id] = true; }); });
    var linhas = grupos.map(function (g) {
      var u = unificar(g);
      return [u.nome, u.doc, u.telefone, u.email, u.cidade, u.origens, u.quantos + ' cadastros'];
    });
    registros.forEach(function (r) {
      if (emGrupo[r.id]) return;
      linhas.push([r.nome, r.doc, r.telefone, r.email, r.cidade, r.origem, '1 cadastro']);
    });
    return planilha(['Nome', 'CNPJ/CPF', 'Telefone', 'E-mail', 'Cidade', 'Veio de', 'Cadastros'], linhas);
  }

  /* ---------------- exemplo ---------------- */

  /* Dois sistemas da mesma empresa fictícia: o ERP (exporta com ; e cabeçalho formal) e a
     planilha do comercial (exporta com , e cabeçalho solto). Repetições plantadas de cada tipo. */
  function exemplo() {
    var erp = [
      ['Código', 'Razão Social', 'Nome Fantasia', 'CNPJ/CPF', 'Telefone', 'E-mail', 'Cidade'],
      ['1001', 'REFRIGERACAO MARE ALTA LTDA', 'MARE ALTA', '91.847.263/0001-58', '(13) 99123-4567', 'contato@marealta.com.br', 'Santos'],
      ['1002', 'CLINICA ODONTO ENSEADA LTDA', 'ODONTO ENSEADA', '92.735.184/0001-04', '', '', 'Santos'],
      ['1003', 'JOSE ANTONIO RIBEIRO', '', '482.739.165-02', '(35) 99811-2233', '', 'Camanducaia'],
      ['1004', 'PADARIA CENTRAL LTDA', 'PADARIA CENTRAL', '11.222.333/0001-44', '(13) 3222-1111', 'padaria@central.com.br', 'Santos'],
      ['1005', 'MARIA SOUZA', '', '', '(13) 98888-7777', 'maria.souza@gmail.com', 'Sao Vicente'],
      ['1006', 'INSUMOS GUARUJA COMERCIO LTDA', 'INSUMOS GUARUJA', '95.314.790/0001-22', '(13) 3355-9090', 'compras@insumosguaruja.com.br', 'Guaruja'],
      ['1007', 'OFICINA LITORAL MECANICA ME', 'OFICINA LITORAL', '93.610.427/0001-90', '(13) 3261-4040', '', 'Praia Grande'],
      ['1008', 'TRANSPORTES ENSEADA LTDA', 'TRANSP ENSEADA', '94.528.016/0001-77', '(13) 3361-2020', 'fiscal@tenseada.com.br', 'Cubatao'],
      ['1009', 'PADARIA CENTRAL', '', '', '(13) 3222-1111', '', 'Santos'],
      ['1010', 'ESCOLA MARE DE SABERES LTDA', 'ESCOLA MARE', '96.428.135/0001-88', '(13) 3288-7000', 'secretaria@maresaberes.com.br', 'Santos'],
      ['1011', 'RESTAURANTE PRAIA DO SOL LTDA', 'PRAIA DO SOL', '97.531.246/0001-01', '(13) 3271-5151', '', 'Guaruja'],
      ['1012', 'ANA PAULA MARTINS', '', '312.456.789-10', '(13) 99777-1212', 'anapaula@hotmail.com', 'Santos']
    ];
    var planilha = [
      ['Cliente', 'Documento', 'Celular', 'Email', 'Cidade'],
      ['Maré Alta Refrigeração', '91847263000158', '', '', 'Santos'],
      ['Jose Antoni Ribeiro', '', '35998112233', '', ''],
      ['Clínica Odonto Enseada', '', '13 3232-8899', 'odonto@enseada.com.br', 'Santos'],
      ['Mercado Bom Preço', '55.666.777/0001-88', '(13) 3311-4455', '', 'Santos'],
      ['Mercado Bom Preco Ltda', '55666777000188', '', 'mercado@bompreco.com.br', ''],
      ['MARIA SOUZA', '', '', 'MARIA.SOUZA@GMAIL.COM', 'São Vicente'],
      ['Transportes Enseada', '', '', '', 'Cubatão'],
      ['Farmácia Central do Litoral', '98.765.432/0001-10', '(13) 3224-6060', '', 'Santos'],
      ['Ana Paula Martins', '', '+55 13 99777-1212', '', 'Santos'],
      ['Distribuidora Costa Verde ME', '90.123.456/0001-77', '(13) 3494-2211', '', 'Praia Grande'],
      ['Hotel Enseada Azul', '99.111.222/0001-33', '(13) 3386-1000', 'reservas@enseadaazul.com.br', 'Guarujá']
    ];
    function csv(linhas, sep) {
      return linhas.map(function (l) {
        return l.map(function (c) { return /[";,\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(sep);
      }).join('\r\n') + '\r\n';
    }
    return [
      { nome: 'clientes-sistema.csv', texto: csv(erp, ';') },
      { nome: 'clientes-planilha-comercial.csv', texto: csv(planilha, ',') }
    ];
  }

  raiz.DUP = {
    lerCSV: lerCSV,
    normalizarDoc: normalizarDoc,
    normalizarTelefone: normalizarTelefone,
    mesmoTelefone: mesmoTelefone,
    normalizarEmail: normalizarEmail,
    normalizarNome: normalizarNome,
    chaveNome: chaveNome,
    similaridade: similaridade,
    detectarColunas: detectarColunas,
    montarRegistros: montarRegistros,
    encontrar: encontrar,
    resumo: resumo,
    unificar: unificar,
    csvRepetidos: csvRepetidos,
    csvUnificado: csvUnificado,
    exemplo: exemplo
  };
})(window);
