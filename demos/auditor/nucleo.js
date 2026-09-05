/* Núcleo do auditor de cadastro: dá papel a cada coluna, confere célula por célula,
   corrige o que dá para corrigir sozinho e separa o que precisa de olho humano. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('../comum/comum.js'));
  else raiz.AUD = fabrica(raiz.COMUM);
})(this, function (COMUM) {
  'use strict';

  var PAPEIS = ['nome', 'documento', 'email', 'telefone', 'cep', 'data', 'nascimento', 'uf', 'cidade', 'outro'];

  var NOME_PAPEL = {
    nome: 'Nome', documento: 'CPF/CNPJ', email: 'E-mail', telefone: 'Telefone', cep: 'CEP',
    data: 'Data', nascimento: 'Nascimento', uf: 'UF', cidade: 'Cidade', outro: 'Não confere'
  };

  function res(valor, corrigido, situacao, motivo) {
    return { valor: valor, corrigido: corrigido, situacao: situacao, motivo: motivo || '' };
  }

  /* ---------------- documento ---------------- */

  function verDocumento(s) {
    var bruto = COMUM.limpo(s);
    if (!bruto) return res(bruto, bruto, 'ok', '');
    if (!/^[\d.\-/ ]+$/.test(bruto)) return res(bruto, bruto, 'revisar', 'não parece CPF nem CNPJ');

    var d = bruto.replace(/\D/g, '');
    if (d.length === 11 || d.length === 14) {
      if (!COMUM.validarDoc(d)) return res(bruto, bruto, 'revisar', 'dígito verificador não bate');
      var mascara = COMUM.formatarDoc(d);
      return bruto === mascara ? res(bruto, mascara, 'ok', '') : res(bruto, mascara, 'corrigido', 'formatado');
    }
    /* Excel derruba o zero da frente: 10 dígitos puros ainda podem ser um CPF, 13 um CNPJ */
    if (d === bruto && d.length >= 9 && d.length <= 13) {
      var cheio = d.length <= 10 ? ('00' + d).slice(-11) : ('00' + d).slice(-14);
      if (COMUM.validarDoc(cheio)) {
        return res(bruto, COMUM.formatarDoc(cheio), 'corrigido', 'zero à esquerda recuperado');
      }
    }
    return res(bruto, bruto, 'revisar', 'não parece CPF nem CNPJ');
  }

  /* ---------------- e-mail ---------------- */

  var TROCA_DOMINIO = {
    'gmial.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com',
    'hotmal.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'outlok.com': 'outlook.com',
    'yaho.com.br': 'yahoo.com.br'
  };

  function verEmail(s) {
    var bruto = String(s == null ? '' : s);
    var t = COMUM.limpo(bruto);
    if (!t) return res(bruto, t, 'ok', '');
    if (/\s/.test(t)) return res(bruto, bruto, 'revisar', 'e-mail com espaço');

    var partes = t.split('@');
    if (partes.length > 2) return res(bruto, bruto, 'revisar', 'e-mail com dois @');
    if (partes.length < 2 || !partes[0] || !partes[1]) return res(bruto, bruto, 'revisar', 'e-mail sem @');

    var baixo = t.toLowerCase();
    var corte = baixo.split('@');
    /* o domínio vem do usuário: 'constructor' e afins são chaves de Object.prototype, não trocas */
    var trocado = Object.prototype.hasOwnProperty.call(TROCA_DOMINIO, corte[1]) && TROCA_DOMINIO[corte[1]];
    var dominio = trocado || corte[1];
    if (!/^[^.]+(\.[^.]+)+$/.test(dominio) || !/\.[a-z]{2,}$/.test(dominio)) {
      return res(bruto, bruto, 'revisar', 'domínio sem o final (.com, .br)');
    }

    var pronto = corte[0] + '@' + dominio;
    if (dominio !== corte[1]) return res(bruto, pronto, 'corrigido', 'domínio corrigido');
    if (pronto !== bruto) return res(bruto, pronto, 'corrigido', 'padronizado em minúsculas');
    return res(bruto, pronto, 'ok', '');
  }

  /* ---------------- telefone ---------------- */

  function verTelefone(s) {
    var bruto = COMUM.limpo(s);
    if (!bruto) return res(bruto, bruto, 'ok', '');

    var d = bruto.replace(/\D/g, '');
    if (!d) return res(bruto, bruto, 'revisar', 'não parece telefone');
    if (d.length === 8 || d.length === 9) return res(bruto, bruto, 'revisar', 'sem DDD');

    var n = COMUM.normalizarTelefone(bruto);
    if (!n || n.length < 10) return res(bruto, bruto, 'revisar', 'não parece telefone');
    if (!COMUM.DDDS[n.slice(0, 2)]) return res(bruto, bruto, 'revisar', 'DDD não existe');
    if (n.length === 11 && n.charAt(2) !== '9') return res(bruto, bruto, 'revisar', 'celular sem o 9');
    /* celular antigo de 10 dígitos: prefixo 7, 8 ou 9 é móvel e perdeu o nono dígito na migração */
    if (n.length === 10 && '789'.indexOf(n.charAt(2)) >= 0) {
      return res(bruto, bruto, 'revisar', 'celular sem o nono dígito');
    }

    var f = COMUM.formatarTelefone(n);
    return bruto === f ? res(bruto, f, 'ok', '') : res(bruto, f, 'corrigido', 'formatado');
  }

  /* ---------------- CEP ---------------- */

  function verCEP(s) {
    var bruto = COMUM.limpo(s);
    if (!bruto) return res(bruto, bruto, 'ok', '');
    var d = bruto.replace(/\D/g, '');
    if (/[^\d\-. ]/.test(bruto)) return res(bruto, bruto, 'revisar', 'CEP fora do formato');
    if (d.length === 8) {
      var f = d.slice(0, 5) + '-' + d.slice(5);
      return bruto === f ? res(bruto, f, 'ok', '') : res(bruto, f, 'corrigido', 'formatado');
    }
    if (d.length === 7 && d === bruto) {
      var cheio = '0' + d;
      return res(bruto, cheio.slice(0, 5) + '-' + cheio.slice(5), 'corrigido', 'zero à esquerda recuperado');
    }
    return res(bruto, bruto, 'revisar', 'CEP fora do formato');
  }

  /* ---------------- data ---------------- */

  function verData(s, opcoes) {
    opcoes = opcoes || {};
    var hoje = opcoes.hoje || COMUM.hojeISO();
    var bruto = COMUM.limpo(s);
    if (!bruto) return res(bruto, bruto, 'ok', '');

    var iso = COMUM.data(bruto);
    if (!iso) return res(bruto, bruto, 'revisar', 'data inválida');
    if (opcoes.nascimento) {
      if (iso > hoje) return res(bruto, bruto, 'revisar', 'nascimento no futuro');
      if (iso < (Number(hoje.slice(0, 4)) - 120) + hoje.slice(4)) {
        return res(bruto, bruto, 'revisar', 'mais de 120 anos');
      }
    }
    var f = COMUM.formatarData(iso);
    return bruto === f ? res(bruto, f, 'ok', '') : res(bruto, f, 'corrigido', 'formatada como dd/mm/aaaa');
  }

  /* ---------------- nome ---------------- */

  var PARTICULAS = { de: true, da: true, do: true, dos: true, das: true, e: true };

  function titulo(t) {
    return t.split(' ').map(function (p, i) {
      var b = p.toLowerCase();
      /* o token vem do usuário: 'constructor' e afins são chaves de Object.prototype, não partículas */
      if (i > 0 && Object.prototype.hasOwnProperty.call(PARTICULAS, b)) return b;
      return b.charAt(0).toUpperCase() + b.slice(1);
    }).join(' ');
  }

  function verNome(s) {
    var bruto = COMUM.limpo(s);
    if (!bruto) return res(bruto, bruto, 'ok', '');
    var t = bruto.replace(/\s+/g, ' ');
    if (/\d/.test(t)) return res(bruto, bruto, 'revisar', 'nome com número');
    if (t.split(' ').length < 2) return res(bruto, bruto, 'revisar', 'só um nome');

    if (t === t.toUpperCase() || t === t.toLowerCase()) {
      return res(bruto, titulo(t), 'corrigido', 'maiúsculas e minúsculas ajustadas');
    }
    return t === bruto ? res(bruto, t, 'ok', '') : res(bruto, t, 'corrigido', 'espaços ajustados');
  }

  /* ---------------- UF ---------------- */

  function verUF(s) {
    var bruto = COMUM.limpo(s);
    if (!bruto) return res(bruto, bruto, 'ok', '');
    var cima = bruto.toUpperCase();
    if (COMUM.NOME_UF[cima]) {
      return bruto === cima ? res(bruto, cima, 'ok', '') : res(bruto, cima, 'corrigido', 'sigla em maiúsculas');
    }
    var chave = COMUM.semAcento(bruto).toUpperCase();
    for (var i = 0; i < COMUM.UFS.length; i++) {
      var sigla = COMUM.UFS[i];
      if (COMUM.semAcento(COMUM.NOME_UF[sigla]).toUpperCase() === chave) {
        return res(bruto, sigla, 'corrigido', 'nome do estado trocado pela sigla');
      }
    }
    return res(bruto, bruto, 'revisar', 'UF que não existe');
  }

  /* ---------------- texto solto ---------------- */

  function verTexto(s) {
    var bruto = COMUM.limpo(s);
    var t = bruto.replace(/\s+/g, ' ');
    return t === bruto ? res(bruto, t, 'ok', '') : res(bruto, t, 'corrigido', 'espaços ajustados');
  }

  function verificar(papel, valor, opcoes) {
    opcoes = opcoes || {};
    var bruto = COMUM.limpo(valor);
    if (!bruto) {
      if (papel === 'nome' || papel === 'documento') return res(bruto, bruto, 'vazio', 'obrigatório em branco');
      return res(bruto, bruto, 'ok', '');
    }
    if (papel === 'documento') return verDocumento(valor);
    if (papel === 'email') return verEmail(valor);
    if (papel === 'telefone') return verTelefone(valor);
    if (papel === 'cep') return verCEP(valor);
    if (papel === 'nome') return verNome(valor);
    if (papel === 'uf') return verUF(valor);
    if (papel === 'data') return verData(valor, { hoje: opcoes.hoje });
    if (papel === 'nascimento') return verData(valor, { hoje: opcoes.hoje, nascimento: true });
    if (papel === 'cidade') return verTexto(valor);
    return res(bruto, bruto, 'ok', '');
  }

  /* ---------------- colunas ---------------- */

  /* "Estado civil" é coluna comum de cadastro: cabeçalho com "estado" só vira UF se o conteúdo for sigla ou nome de estado */
  function pareceColunaUF(valores) {
    var lista = [];
    (valores || []).forEach(function (v) { if (COMUM.limpo(v)) lista.push(v); });
    if (!lista.length) return false;
    var acertos = 0;
    lista.forEach(function (v) { if (verUF(v).situacao !== 'revisar') acertos++; });
    return acertos / lista.length >= 0.6;
  }

  var CABECALHO_PAPEL = [
    ['documento', /cpf|cnpj|documento|^doc/i],
    ['email', /e-?mail|correio/i],
    ['telefone', /telefone|fone|celular|whats|^tel$|movel|móvel/i],
    ['cep', /cep/i],
    ['uf', /^uf$|^sigla/i],
    ['uf', /estado/i, pareceColunaUF],
    ['cidade', /cidade|munic[íi]pio/i],
    ['nascimento', /nasc|aniv/i],
    ['data', /data|^dt|venc|emiss|cadastro/i],
    ['nome', /nome|raz[aã]o|cliente|fantasia|contato/i]
  ];

  var CONTEUDO_PAPEL = { documento: 'documento', email: 'email', telefone: 'telefone', cep: 'cep', data: 'data' };

  function papelDaColuna(nome, valores) {
    var cab = COMUM.limpo(nome);
    for (var i = 0; i < CABECALHO_PAPEL.length; i++) {
      var regra = CABECALHO_PAPEL[i];
      if (!regra[1].test(cab)) continue;
      if (regra[2] && !regra[2](valores)) continue;
      return regra[0];
    }
    return CONTEUDO_PAPEL[COMUM.tipoColuna(cab, valores)] || 'outro';
  }

  function detectarColunas(cabecalho, linhas) {
    cabecalho = cabecalho || [];
    linhas = linhas || [];
    return cabecalho.map(function (nome, indice) {
      var valores = linhas.map(function (l) { return l[indice]; });
      return { indice: indice, nome: COMUM.limpo(nome), papel: papelDaColuna(nome, valores) };
    });
  }

  /* ---------------- auditoria ---------------- */

  var PIOR = { ok: 0, corrigido: 1, revisar: 2, vazio: 2 };

  function auditar(cabecalho, linhas, colunas, opcoes) {
    cabecalho = cabecalho || [];
    linhas = linhas || [];
    colunas = colunas || detectarColunas(cabecalho, linhas);
    opcoes = opcoes || {};
    var hoje = opcoes.hoje || COMUM.hojeISO();

    var celulas = linhas.map(function (linha) {
      return colunas.map(function (col) {
        return verificar(col.papel, linha[col.indice], { hoje: hoje });
      });
    });

    var repetidos = marcarRepetidos(celulas, colunas);
    var contagem = colunas.map(function () { return { ok: 0, corrigidos: 0, revisar: 0, vazios: 0, exemplos: [] }; });
    var resumoLinhas = [];
    var avaliadas = 0, ok = 0, corrigidos = 0, aRevisar = 0;

    celulas.forEach(function (linha, i) {
      var pior = 'ok', motivos = [];
      linha.forEach(function (cel, j) {
        var c = contagem[j];
        if (cel.situacao === 'ok') c.ok++;
        else if (cel.situacao === 'corrigido') c.corrigidos++;
        else if (cel.situacao === 'vazio') c.vazios++;
        else c.revisar++;

        if (cel.situacao !== 'ok' && c.exemplos.length < 3) {
          c.exemplos.push(cel.situacao === 'corrigido'
            ? { de: cel.valor, para: cel.corrigido }
            : { de: cel.valor, motivo: cel.motivo });
        }
        if (colunas[j].papel !== 'outro') {
          avaliadas++;
          if (cel.situacao === 'ok') ok++;
          else if (cel.situacao === 'corrigido') corrigidos++;
          else aRevisar++;
        }
        if (cel.motivo) motivos.push(colunas[j].nome + ': ' + cel.motivo);
        if (PIOR[cel.situacao] > PIOR[pior]) pior = cel.situacao === 'vazio' ? 'revisar' : cel.situacao;
      });
      resumoLinhas.push({ indice: i, situacao: pior, motivos: motivos });
    });

    return {
      celulas: celulas,
      linhas: resumoLinhas,
      colunas: colunas.map(function (col, j) {
        return {
          indice: col.indice, nome: col.nome, papel: col.papel,
          ok: contagem[j].ok, corrigidos: contagem[j].corrigidos,
          revisar: contagem[j].revisar, vazios: contagem[j].vazios,
          exemplos: contagem[j].exemplos
        };
      }),
      nota: {
        antes: avaliadas ? Math.round(1000 * ok / avaliadas) / 10 : 0,
        depois: avaliadas ? Math.round(1000 * (ok + corrigidos) / avaliadas) / 10 : 0,
        revisarPct: avaliadas ? Math.round(1000 * aRevisar / avaliadas) / 10 : 0
      },
      repetidos: repetidos
    };
  }

  /* o mesmo CPF em duas linhas não é erro de digitação: é cadastro em duplicidade, e quem
     resolve é a pessoa — por isso vira revisar e não conta como corrigido */
  function marcarRepetidos(celulas, colunas) {
    var porDoc = {}, ordem = [];
    celulas.forEach(function (linha, i) {
      linha.forEach(function (cel, j) {
        if (colunas[j].papel !== 'documento') return;
        if (cel.situacao !== 'ok' && cel.situacao !== 'corrigido') return;
        var doc = String(cel.corrigido).replace(/\D/g, '');
        if (!doc) return;
        if (!porDoc[doc]) { porDoc[doc] = []; ordem.push(doc); }
        if (porDoc[doc].indexOf(i) < 0) porDoc[doc].push(i);
      });
    });

    var repetidos = [];
    ordem.forEach(function (doc) {
      if (porDoc[doc].length < 2) return;
      repetidos.push({ documento: doc, linhas: porDoc[doc] });
      porDoc[doc].forEach(function (i) {
        celulas[i].forEach(function (cel, j) {
          if (colunas[j].papel !== 'documento') return;
          if (String(cel.corrigido).replace(/\D/g, '') !== doc) return;
          cel.situacao = 'revisar';
          cel.motivo = 'documento repetido em outra linha';
        });
      });
    });
    return repetidos;
  }

  /* ---------------- exportação ---------------- */

  /* fonte única da planilha corrigida: o CSV do download e o TSV do Copiar saem daqui */
  function matriz(cabecalho, linhas, auditoria) {
    cabecalho = cabecalho || [];
    linhas = linhas || [];
    var saida = [cabecalho.concat(['Revisar'])];
    (auditoria.celulas || []).forEach(function (linha, i) {
      var valores = cabecalho.map(function (_, idx) {
        for (var j = 0; j < auditoria.colunas.length; j++) {
          if (auditoria.colunas[j].indice === idx) return linha[j].corrigido;
        }
        return linhas[i] ? linhas[i][idx] : '';
      });
      var pendencias = [];
      linha.forEach(function (cel, j) {
        if (cel.situacao === 'revisar' || cel.situacao === 'vazio') {
          pendencias.push(auditoria.colunas[j].nome + ': ' + cel.motivo);
        }
      });
      saida.push(valores.concat([pendencias.join(' · ')]));
    });
    return saida;
  }

  function csvCorrigido(cabecalho, linhas, auditoria) {
    return COMUM.csv(matriz(cabecalho, linhas, auditoria));
  }

  function csvPendencias(auditoria) {
    var saida = [['Linha', 'Coluna', 'Valor', 'Motivo']];
    (auditoria.celulas || []).forEach(function (linha, i) {
      linha.forEach(function (cel, j) {
        if (cel.situacao !== 'revisar' && cel.situacao !== 'vazio') return;
        saida.push([i + 2, auditoria.colunas[j].nome, cel.valor, cel.motivo]);
      });
    });
    return COMUM.csv(saida);
  }

  /* ---------------- exemplo ---------------- */

  var CABECALHO_EXEMPLO = ['Nome', 'CPF/CNPJ', 'E-mail', 'Telefone', 'CEP', 'Cidade', 'UF', 'Nascimento', 'Cadastro'];

  function exemplo(hoje) {
    hoje = hoje || COMUM.hojeISO();
    function cad(n) { return COMUM.formatarData(COMUM.maisDias(hoje, -n)); }
    var futuro = COMUM.formatarData(COMUM.maisDias(hoje, 200));
    var antigo = '15/06/' + (Number(hoje.slice(0, 4)) - 130);

    var linhas = [
      ['Maria Silva Ramos', '227.135.830-20', 'maria.ramos@exemplo.com', '(11) 91234-5678', '01310-100', 'São Paulo', 'SP', '12/03/1985', cad(40)],
      ['João Batista Nunes', '275.542.370-63', 'joao.nunes@exemplo.com', '(21) 3123-4567', '20040-020', 'Rio de Janeiro', 'RJ', '07/11/1978', cad(38)],
      ['Ana Paula Correia', '157.038.506-81', 'ana.correia@yahoo.com.br', '(31) 98765-4321', '30130-010', 'Belo Horizonte', 'MG', '23/05/1990', cad(35)],
      ['Carlos Eduardo Lima', '939.078.921-43', 'carlos.lima@exemplo.com', '(41) 99876-5432', '80010-010', 'Curitiba', 'PR', '02/09/1982', cad(33)],
      ['Beatriz Almeida', '797.984.260-02', 'beatriz.almeida@hotmail.com', '(51) 3456-7890', '90010-150', 'Porto Alegre', 'RS', '19/01/1995', cad(30)],
      ['Rafael dos Santos', '983.806.956-66', 'rafael.santos@exemplo.com', '(85) 98123-4567', '60160-230', 'Fortaleza', 'CE', '30/06/1988', cad(28)],
      ['Juliana Ferreira', '584.994.852-00', 'juliana.ferreira@outlook.com', '(48) 99234-5678', '88010-400', 'Florianópolis', 'SC', '14/08/1993', cad(25)],
      ['Marcos Vinicius Rocha', '315.590.997-80', 'marcos.rocha@exemplo.com', '(62) 3222-1100', '74020-020', 'Goiânia', 'GO', '05/12/1975', cad(22)],
      ['Patrícia Gomes', '538.653.529-36', 'patricia.gomes@exemplo.com', '(71) 98888-1122', '40020-000', 'Salvador', 'BA', '27/02/1986', cad(20)],
      ['Fernando Teixeira', '591.196.283-74', 'fernando.teixeira@exemplo.com', '(81) 99777-3344', '50030-230', 'Recife', 'PE', '08/04/1980', cad(18)],
      ['Camila Duarte', '845.217.827-10', 'camila.duarte@exemplo.com', '(27) 3333-4455', '29010-000', 'Vitória', 'ES', '16/10/1991', cad(15)],
      ['Renata Barros Pinto', '384.000.528-03', 'renata.pinto@exemplo.com', '(92) 98444-5566', '69005-040', 'Manaus', 'AM', '21/07/1984', cad(12)],

      ['MARIA DA CONCEIÇÃO SOUZA', '369.471.642-49', 'maria.souza@gmial.com', '(11) 91234-5678', '04567-000', 'São Paulo', 'SP', '03/03/1979', cad(11)],
      ['joão pedro de alencar', '246.434.516-45', 'joao.alencar@exemplo.com', '11987654321', '05409-002', 'São Paulo', 'sp', '12/12/1988', cad(10)],
      ['Ana Lúcia Prado', '4308454484', 'ana.prado@exemplo.com', '(21) 98765-4321', '22041-011', 'Rio de Janeiro', 'RJ', '1990-05-23', cad(9)],
      ['Pedro Henrique Sá', '5740936000172', 'contato@gamil.com', '(31) 3222-3344', '30140-071', 'Belo Horizonte', 'Minas Gerais', '17/09/1983', cad(8)],
      ['Otávio Nunes Braga', '64128539791', 'otavio.braga@exemplo.com', '(11) 94321-8765', '05010-000', 'São Paulo', 'SP', '19/09/1986', cad(13)],
      ['Luciana Moreira', '845.273.153-15', 'LUCIANA.MOREIRA@Exemplo.com', '(11) 3123-4567', '01415-000', 'São Paulo', 'SP', '25/04/1992', cad(7)],
      ['Thiago Nogueira', '159.318.872-29', 'thiago@hotmal.com', '4899234567', '88015-200', 'Florianópolis', 'SC', '11/11/1987', cad(6)],
      ['Gabriela Fontes', '223.965.454-69', 'gabriela.fontes@gmail.co', '(85) 98123-0000', '6016023', 'Fortaleza', 'CE', '06/06/1996', cad(5)],
      ['Vagner Ribeiro', '707.707.460-98', 'vagner.ribeiro@exemplo.com', '(11) 91234-1111', '04101020', 'São Paulo', 'SP', '09/02/1981', cad(4)],
      ['SÔNIA REGINA DOS ANJOS', '898.213.497-22', 'sonia.anjos@yaho.com.br', '(62) 99555-1234', '74125-020', 'Goiânia', 'GO', '28/08/1974', cad(3)],
      ['Elaine  Cristina  Vieira', '415.693.049-12', 'elaine.vieira@exemplo.com', '(71) 3111-2222', '41770-235', 'Salvador', 'BA', '13/01/1994', cad(2)],
      ['Ana', '805.784.319-55', 'ana@exemplo.com', '(11) 92222-3333', '01310-200', 'São Paulo', 'SP', '04/04/1989', cad(45)],
      ['Cliente 2', '615.368.058-58', 'cliente2@exemplo.com', '(21) 93333-4444', '20050-090', 'Rio de Janeiro', 'RJ', '15/05/1990', cad(44)],
      ['', '871.277.078-71', 'sem.nome@exemplo.com', '(31) 94444-5555', '30170-110', 'Belo Horizonte', 'MG', '22/06/1986', cad(43)],
      ['Roberto Carlos Meireles', '529.982.247-26', 'roberto.meireles@exemplo.com', '(41) 95555-6666', '80530-000', 'Curitiba', 'PR', '19/03/1977', cad(42)],
      ['Simone Vasconcelos', 'ABC123', 'simone.v@exemplo.com', '(51) 96666-7777', '90420-060', 'Porto Alegre', 'RS', '26/10/1993', cad(41)],
      ['Otávio Bastos', '', 'otavio.bastos@exemplo.com', '(85) 97777-8888', '60175-047', 'Fortaleza', 'CE', '31/07/1985', cad(39)],
      ['Débora Antunes', '335.105.795-42', 'debora.antunes', '(48) 98888-9999', '88035-001', 'Florianópolis', 'SC', '18/12/1991', cad(37)],
      ['Marcelo Pires', '983.946.681-00', 'marcelo@@exemplo.com', '(62) 99999-0000', '74150-020', 'Goiânia', 'GO', '24/02/1979', cad(36)],
      ['Vanessa Coelho', '803.969.700-01', 'vanessa coelho@exemplo.com', '(71) 91111-2222', '40170-110', 'Salvador', 'BA', '01/01/1990', cad(34)],
      ['Igor Fagundes', '505.554.227-63', 'igor.fagundes@exemplo.com', '912345678', '50050-000', 'Recife', 'PE', '12/12/1982', cad(32)],
      ['Larissa Xavier', '108.493.382-98', 'larissa.xavier@exemplo.com', '(23) 91234-5678', '29055-000', 'Vitória', 'ES', '03/08/1996', cad(31)],
      ['Bruno Sampaio', '442.961.566-75', 'bruno.sampaio@exemplo.com', '(11) 81234-5678', '02020-000', 'São Paulo', 'SP', '09/09/1984', cad(29)],
      ['Cristina Peixoto', '111.186.053-06', 'cristina.peixoto@exemplo.com', '(11) 93333-1234', '1234', 'São Paulo', 'SP', '05/05/1987', cad(27)],
      ['Alexandre Furtado', '691.788.514-24', 'alexandre.furtado@exemplo.com', '(21) 92222-4321', '22290-240', 'Rio de Janeiro', 'XX', '07/07/1981', cad(26)],
      ['Helena Quirino', '967.623.965-85', 'helena.quirino@exemplo.com', '(31) 93344-5566', '31270-901', 'Belo Horizonte', 'MG', '31/02/2024', cad(24)],
      ['Wagner Toledo', '456.237.046-70', 'wagner.toledo@exemplo.com', '(41) 94455-6677', '81530-000', 'Curitiba', 'PR', futuro, cad(23)],
      ['Nadir Espíndola', '757.349.114-02', 'nadir.espindola@exemplo.com', '(51) 95566-7788', '91330-002', 'Porto Alegre', 'RS', antigo, cad(21)],
      ['Silvana Antônia Prates', '805.784.319-55', 'silvana.prates@exemplo.com', '(11) 96677-8899', '03310-000', 'São Paulo', 'SP', '10/10/1983', cad(19)]
    ];

    return { nome: 'cadastro-exemplo.csv', cabecalho: CABECALHO_EXEMPLO.slice(), linhas: linhas };
  }

  return {
    PAPEIS: PAPEIS,
    NOME_PAPEL: NOME_PAPEL,
    verDocumento: verDocumento,
    verEmail: verEmail,
    verTelefone: verTelefone,
    verCEP: verCEP,
    verData: verData,
    verNome: verNome,
    verUF: verUF,
    verTexto: verTexto,
    verificar: verificar,
    detectarColunas: detectarColunas,
    auditar: auditar,
    matriz: matriz,
    csvCorrigido: csvCorrigido,
    csvPendencias: csvPendencias,
    exemplo: exemplo
  };
});
