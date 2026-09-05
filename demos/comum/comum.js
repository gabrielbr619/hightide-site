/* Kit comum das demos: texto, número, data, documento, CSV. Puro e sem DOM —
   o navegador carrega como <script>, o node --test carrega com require. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.COMUM = fabrica();
})(this, function () {
  'use strict';

  var BOM = String.fromCharCode(0xFEFF);

  /* ---------------- texto ---------------- */

  function limpo(s) { return String(s == null ? '' : s).trim(); }

  function semAcento(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function plural(n, um, muitos) {
    return n + ' ' + (Number(n) === 1 ? um : muitos);
  }

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

  /* planilha exportada do Windows costuma sair em windows-1252; utf-8 com fatal é o único
     jeito de saber qual das duas é, porque windows-1252 aceita qualquer byte */
  function decodificar(bytes) {
    var b = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(b);
    } catch (e) {
      try { return new TextDecoder('windows-1252').decode(b); }
      catch (e2) { return new TextDecoder('latin1').decode(b); }
    }
  }

  /* ---------------- número ---------------- */

  function numero(s) {
    if (typeof s === 'number') return isFinite(s) ? s : null;
    var t = limpo(s);
    if (!t) return null;
    var negativo = false;
    if (t.charAt(0) === '(' && t.charAt(t.length - 1) === ')') { negativo = true; t = t.slice(1, -1); }
    t = t.replace(/R\$/gi, '').replace(/%/g, '').replace(/[\s ]/g, '');
    if (t.charAt(0) === '-') { negativo = !negativo; t = t.slice(1); }
    else if (t.charAt(0) === '+') t = t.slice(1);
    if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null;

    var temVirgula = t.indexOf(',') >= 0, temPonto = t.indexOf('.') >= 0;
    if (temVirgula && temPonto) {
      if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(/,/g, '.');
      else t = t.replace(/,/g, '');
    } else if (temVirgula) {
      /* só vírgula: decimal, salvo quando são vários grupos de três (1,234,567) */
      t = /^\d{1,3}(,\d{3})+$/.test(t) && t.split(',').length > 2 ? t.replace(/,/g, '') : t.replace(/,/g, '.');
    } else if (temPonto) {
      if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    }
    var n = parseFloat(t);
    if (!isFinite(n)) return null;
    return negativo ? -n : n;
  }

  /* ---------------- data ---------------- */

  function doisDigitos(n) { return (n < 10 ? '0' : '') + n; }

  function existe(a, m, d) {
    if (!(a >= 100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
    var t = new Date(Date.UTC(a, m - 1, d));
    return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }

  function montarISO(a, m, d) {
    return existe(a, m, d) ? a + '-' + doisDigitos(m) + '-' + doisDigitos(d) : '';
  }

  var BASE_EXCEL = Date.UTC(1899, 11, 30);

  function data(s) {
    if (s instanceof Date) {
      return isNaN(s.getTime()) ? '' : montarISO(s.getFullYear(), s.getMonth() + 1, s.getDate());
    }
    if (typeof s === 'number') {
      if (!isFinite(s)) return '';
      if (s >= 20000 && s <= 80000) {
        var e = new Date(BASE_EXCEL + Math.floor(s) * 86400000);
        return montarISO(e.getUTCFullYear(), e.getUTCMonth() + 1, e.getUTCDate());
      }
      s = String(s);
    }
    var t = limpo(s);
    if (!t) return '';
    var m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ]|$)/);
    if (m) return montarISO(+m[1], +m[2], +m[3]);
    m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
    if (m) return montarISO(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
    m = t.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return montarISO(+m[1], +m[2], +m[3]);
    return '';
  }

  function dia(s) { return String(s == null ? '' : s).slice(0, 10); }

  function hojeISO() {
    var d = new Date();
    return d.getFullYear() + '-' + doisDigitos(d.getMonth() + 1) + '-' + doisDigitos(d.getDate());
  }

  function emUTC(iso) {
    var p = dia(iso).split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }

  function maisDias(iso, n) {
    var d = new Date(emUTC(iso));
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function diasEntre(a, b) {
    return Math.round((emUTC(b) - emUTC(a)) / 86400000);
  }

  function diaSemana(iso) {
    return new Date(emUTC(iso)).getUTCDay();
  }

  /* ---------------- formatação ---------------- */

  function formatarValor(v) {
    return (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* fatiar a string em vez de new Date(): 'AAAA-MM-DD' vira o dia anterior no fuso do Brasil */
  function formatarData(iso) {
    var d = dia(iso);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.slice(8) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '';
  }

  function formatarDoc(doc) {
    var d = String(doc || '').replace(/\D/g, '');
    if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return d || '—';
  }

  function formatarTelefone(tel) {
    var d = String(tel == null ? '' : tel).replace(/\D/g, '');
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return d;
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

  /* ---------------- documentos ---------------- */

  function digitos(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }

  function validarCPF(s) {
    var d = digitos(s);
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    var i, soma, resto;
    for (var dv = 0; dv < 2; dv++) {
      soma = 0;
      for (i = 0; i < 9 + dv; i++) soma += Number(d.charAt(i)) * (10 + dv - i);
      resto = (soma * 10) % 11;
      if (resto === 10) resto = 0;
      if (resto !== Number(d.charAt(9 + dv))) return false;
    }
    return true;
  }

  var PESOS_CNPJ = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  function validarCNPJ(s) {
    var d = digitos(s);
    if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
    for (var dv = 0; dv < 2; dv++) {
      var pesos = PESOS_CNPJ.slice(dv ? 0 : 1), soma = 0;
      for (var i = 0; i < pesos.length; i++) soma += Number(d.charAt(i)) * pesos[i];
      var resto = soma % 11;
      var esperado = resto < 2 ? 0 : 11 - resto;
      if (esperado !== Number(d.charAt(12 + dv))) return false;
    }
    return true;
  }

  function validarDoc(s) {
    var d = digitos(s);
    if (d.length === 11) return validarCPF(d) ? 'cpf' : '';
    if (d.length === 14) return validarCNPJ(d) ? 'cnpj' : '';
    return '';
  }

  /* ---------------- tabelas de referência ---------------- */

  var DDDS = {};
  [11, 12, 13, 14, 15, 16, 17, 18, 19,
   21, 22, 24, 27, 28,
   31, 32, 33, 34, 35, 37, 38,
   41, 42, 43, 44, 45, 46, 47, 48, 49,
   51, 53, 54, 55,
   61, 62, 63, 64, 65, 66, 67, 68, 69,
   71, 73, 74, 75, 77, 79,
   81, 82, 83, 84, 85, 86, 87, 88, 89,
   91, 92, 93, 94, 95, 96, 97, 98, 99].forEach(function (n) { DDDS[String(n)] = true; });

  var NOME_UF = {
    AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
    DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
    MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
    PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
    RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
    SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins'
  };

  var UFS = Object.keys(NOME_UF);

  /* ---------------- tipo de coluna ---------------- */

  var CAB_TIPO = {
    documento: /cpf|cnpj|documento/i,
    cep: /cep/i,
    telefone: /fone|cel|whats/i,
    email: /mail/i,
    data: /data|dt|venc|emiss/i,
    numero: /valor|total|preço|preco|qtd/i
  };

  var ORDEM_TIPO = ['documento', 'cep', 'telefone', 'email', 'data', 'numero'];

  /* parêntese, mais e espaço são marca de telefone: sem isso um celular de 11 dígitos
     formatado passaria por CPF, que também tem 11 */
  function pareceDocumento(v) {
    if (validarDoc(v)) return true;
    if (/[()+\s]/.test(v)) return false;
    var d = digitos(v);
    return (d.length === 11 || d.length === 14) && /^[\d./-]+$/.test(v);
  }

  function pareceCEP(v) { return /^\d{5}-?\d{3}$/.test(v); }

  function pareceTelefone(v, cabecalhoTelefone) {
    var d = digitos(v);
    if (d.length < 8 || d.length > 13) return false;
    return cabecalhoTelefone || /[()+\-\s]/.test(v);
  }

  function pareceEmail(v) {
    var a = v.indexOf('@');
    return a > 0 && v.indexOf('.', a) > a + 1 && !/\s/.test(v);
  }

  function tipoColuna(nome, valores) {
    var cab = limpo(nome);
    var lista = [];
    (valores || []).forEach(function (v) { var t = limpo(v); if (t) lista.push(t); });
    if (!lista.length) return 'vazio';

    var cabTel = CAB_TIPO.telefone.test(cab);
    var testes = {
      documento: pareceDocumento,
      cep: pareceCEP,
      telefone: function (v) { return pareceTelefone(v, cabTel); },
      email: pareceEmail,
      data: function (v) { return data(v) !== ''; },
      numero: function (v) {
        return numero(v) !== null && !pareceDocumento(v) && !pareceCEP(v) && !pareceTelefone(v, false);
      }
    };

    var amostra = lista.slice(0, 400);
    var candidatos = ORDEM_TIPO.filter(function (t) {
      var ok = 0;
      amostra.forEach(function (v) { if (testes[t](v)) ok++; });
      return ok / amostra.length >= 0.8;
    });
    if (candidatos.length) {
      for (var i = 0; i < candidatos.length; i++) {
        if (CAB_TIPO[candidatos[i]].test(cab)) return candidatos[i];
      }
      return candidatos[0];
    }

    var distintos = {};
    lista.forEach(function (v) { distintos[v] = true; });
    var n = Object.keys(distintos).length;
    return (n <= 25 && n / lista.length <= 0.5) ? 'categoria' : 'texto';
  }

  /* ---------------- exportação ---------------- */

  function celulaCSV(v) {
    var s = v == null ? '' : String(v);
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /* ponto e vírgula, vírgula decimal e BOM: é o que o Excel em português abre com dois cliques */
  function csv(linhas) {
    return BOM + (linhas || []).map(function (l) {
      return l.map(celulaCSV).join(';');
    }).join('\r\n') + '\r\n';
  }

  function tsv(linhas) {
    return (linhas || []).map(function (l) {
      return l.map(function (v) {
        return (v == null ? '' : String(v)).replace(/[\t\r\n]+/g, ' ');
      }).join('\t');
    }).join('\r\n') + '\r\n';
  }

  /* ---------------- pseudoaleatório ---------------- */

  /* Park-Miller: exemplo() precisa ser igual em toda visita, e Math.random não é */
  function lcg(semente) {
    var s = Math.abs(Math.floor(Number(semente) || 1)) % 2147483646;
    if (s === 0) s = 1;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  return {
    limpo: limpo,
    semAcento: semAcento,
    esc: esc,
    plural: plural,
    lerCSV: lerCSV,
    decodificar: decodificar,
    numero: numero,
    data: data,
    hojeISO: hojeISO,
    maisDias: maisDias,
    diasEntre: diasEntre,
    diaSemana: diaSemana,
    formatarValor: formatarValor,
    formatarData: formatarData,
    formatarDoc: formatarDoc,
    formatarTelefone: formatarTelefone,
    normalizarDoc: normalizarDoc,
    normalizarTelefone: normalizarTelefone,
    mesmoTelefone: mesmoTelefone,
    normalizarEmail: normalizarEmail,
    normalizarNome: normalizarNome,
    chaveNome: chaveNome,
    levenshtein: levenshtein,
    similaridade: similaridade,
    validarCPF: validarCPF,
    validarCNPJ: validarCNPJ,
    validarDoc: validarDoc,
    DDDS: DDDS,
    UFS: UFS,
    NOME_UF: NOME_UF,
    tipoColuna: tipoColuna,
    csv: csv,
    tsv: tsv,
    lcg: lcg
  };
});
