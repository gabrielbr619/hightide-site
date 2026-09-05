/* Casca comum das demos: tema, entrada de arquivos, leitura de tabela, exportação e navegação.
   Depende de COMUM (comum.js) e só roda no navegador. */
(function (raiz) {
  'use strict';

  var XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

  var catalogo = [
    { slug: 'nfe', nome: 'Extrator de NF-e', frase: 'Da pasta de XML para a planilha, sem digitar.', entra: 'XML' },
    { slug: 'documentos', nome: 'Gerador de documentos', frase: 'Preencheu uma vez, saem proposta, ordem de serviço e recibo em PDF.', entra: 'formulário' },
    { slug: 'duplicados', nome: 'Caça-duplicados', frase: 'O mesmo cliente cadastrado duas vezes, em um sistema ou em dois. Ache todos.', entra: 'CSV/XLSX' },
    { slug: 'conciliador', nome: 'Conciliador bancário', frase: 'Extrato de um lado, lançamentos do outro: o que bate, o que falta e o que sobra.', entra: 'OFX/CSV' },
    { slug: 'painel', nome: 'Painel automático', frase: 'Sobe a planilha, saem os números e os gráficos — sem montar nada.', entra: 'CSV/XLSX' },
    { slug: 'auditor', nome: 'Auditor de cadastro', frase: 'CPF errado, e-mail torto, telefone sem DDD: a nota da sua base e a planilha corrigida.', entra: 'CSV/XLSX' },
    { slug: 'boleto', nome: 'Leitor de boleto', frase: 'Cole a linha digitável ou aponte a câmera: banco, valor e vencimento na hora.', entra: 'texto/câmera' },
    { slug: 'cobranca', nome: 'Cobrança no WhatsApp', frase: 'Contas a receber viram lembretes prontos, no dia certo, com o link de enviar.', entra: 'CSV/XLSX' },
    { slug: 'escala', nome: 'Gerador de escala', frase: 'Equipe, turnos e folgas entram; a escala do mês sai — e refaz quando alguém falta.', entra: 'formulário' }
  ];

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- tema (mesma chave da landing: a escolha vale nas duas) ---------- */
  function ligarTema() {
    var doc = document.documentElement;
    try {
      var salvo = localStorage.getItem('ht-tema');
      if (salvo) doc.setAttribute('data-theme', salvo);
    } catch (e) {}
    var botao = $('tema');
    if (!botao) return;
    botao.addEventListener('click', function () {
      var claroAgora = doc.getAttribute('data-theme')
        ? doc.getAttribute('data-theme') === 'light'
        : matchMedia('(prefers-color-scheme: light)').matches;
      var novo = claroAgora ? 'dark' : 'light';
      doc.setAttribute('data-theme', novo);
      try { localStorage.setItem('ht-tema', novo); } catch (e) {}
    });
  }

  function preencherOutras() {
    var caixa = $('outras');
    if (!caixa) return;
    var slug = document.body ? document.body.dataset.demo : '';
    var atual = -1;
    for (var i = 0; i < catalogo.length; i++) if (catalogo[i].slug === slug) atual = i;
    var partes = ['<span class="rotulo">Outras amostras para testar</span>'];
    for (var n = 1; n <= 3; n++) {
      var d = catalogo[(atual + n + catalogo.length) % catalogo.length];
      partes.push('<a href="../' + esc(d.slug) + '/index.html"><b>' + esc(d.nome) + '</b><span>' +
        esc(d.frase) + '</span><i>Testar agora</i></a>');
    }
    caixa.innerHTML = partes.join('');
  }

  function iniciar() {
    ligarTema();
    preencherOutras();
  }

  /* ---------- entrada de arquivos ---------- */
  /* Chrome devolve no máximo 100 entradas por readEntries: repetir até vir vazio */
  function lerDiretorio(entry) {
    var leitor = entry.createReader(), tudo = [];
    return new Promise(function (resolve, reject) {
      (function passo() {
        leitor.readEntries(function (lote) {
          if (!lote.length) return resolve(tudo);
          tudo = tudo.concat(Array.prototype.slice.call(lote));
          passo();
        }, reject);
      })();
    });
  }

  function arquivosDe(entry) {
    if (entry.isFile) {
      return new Promise(function (res, rej) { entry.file(res, rej); }).then(function (f) { return [f]; });
    }
    if (entry.isDirectory) {
      return lerDiretorio(entry).then(function (filhos) {
        return Promise.all(filhos.map(arquivosDe)).then(function (l) { return [].concat.apply([], l); });
      });
    }
    return Promise.resolve([]);
  }

  function arquivosDoDrop(dt) {
    var itens = Array.prototype.slice.call(dt.items || []);
    var entradas = itens.map(function (it) {
      return it.webkitGetAsEntry ? it.webkitGetAsEntry() : null;
    }).filter(Boolean);
    if (entradas.length) {
      return Promise.all(entradas.map(arquivosDe)).then(function (l) { return [].concat.apply([], l); });
    }
    return Promise.resolve(Array.prototype.slice.call(dt.files || []));
  }

  function soltar(op) {
    var area = op.area, entrada = op.entrada, entradaPasta = op.entradaPasta;
    var aoReceber = op.aoReceber || function () {};
    function entregar(lista) {
      var files = lista.filter(function (f) { return f && typeof f.name === 'string'; });
      if (files.length) aoReceber(files);
    }

    ['dragenter', 'dragover'].forEach(function (ev) {
      area.addEventListener(ev, function (e) { e.preventDefault(); area.classList.add('sobre'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      area.addEventListener(ev, function (e) {
        e.preventDefault();
        if (ev === 'drop' || !area.contains(e.relatedTarget)) area.classList.remove('sobre');
      });
    });
    area.addEventListener('drop', function (e) { arquivosDoDrop(e.dataTransfer).then(entregar); });
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('drop', function (e) { e.preventDefault(); });

    if (entrada) {
      area.addEventListener('click', function (e) {
        if (e.target.closest('button, input, a, select, textarea, label')) return;
        entrada.click();
      });
      area.addEventListener('keydown', function (e) {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === area) { e.preventDefault(); entrada.click(); }
      });
      entrada.addEventListener('change', function () {
        entregar(Array.prototype.slice.call(this.files));
        this.value = '';
      });
    }
    if (entradaPasta) {
      entradaPasta.addEventListener('change', function () {
        entregar(Array.prototype.slice.call(this.files));
        this.value = '';
      });
    }
  }

  /* ---------- leitura de tabela ---------- */
  var scripts = {};

  function carregarScript(url) {
    if (scripts[url]) return scripts[url];
    scripts[url] = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = function () { res(); };
      s.onerror = function () {
        delete scripts[url];
        rej(new Error('não foi possível carregar ' + url));
      };
      document.head.appendChild(s);
    });
    return scripts[url];
  }

  function doisDigitos(n) { return (n < 10 ? '0' : '') + n; }

  function celula(v) {
    if (v == null) return '';
    if (v instanceof Date) {
      return v.getFullYear() + '-' + doisDigitos(v.getMonth() + 1) + '-' + doisDigitos(v.getDate());
    }
    return String(v);
  }

  function lerPlanilha(nome, bytes) {
    return carregarScript(XLSX_URL).then(function () {
      if (!raiz.XLSX) throw new Error('não foi possível carregar o leitor de Excel — exporte como CSV');
      /* raw:true — com raw:false um CNPJ digitado como número vira "1.23457E+13" e perde os dígitos */
      var livro = raiz.XLSX.read(bytes, { type: 'array', cellDates: true });
      for (var i = 0; i < livro.SheetNames.length; i++) {
        var aba = livro.SheetNames[i];
        var linhas = raiz.XLSX.utils.sheet_to_json(livro.Sheets[aba], { header: 1, raw: true, defval: '' });
        linhas = linhas.map(function (l) {
          return (l || []).map(celula);
        }).filter(function (l) {
          return l.some(function (c) { return c.trim() !== ''; });
        });
        if (linhas.length < 2) continue;
        var cab = linhas[0].map(function (c) { return c.trim(); });
        var dados = linhas.slice(1).map(function (l) {
          var c = l.slice(0, cab.length).map(function (v) { return v.trim(); });
          while (c.length < cab.length) c.push('');
          return c;
        });
        return {
          nome: livro.SheetNames.length > 1 ? nome + ' / ' + aba : nome,
          cabecalho: cab,
          linhas: dados
        };
      }
      throw new Error('planilha sem linhas');
    });
  }

  function lerTabela(file) {
    var nome = file.name || '';
    var ext = (nome.split('.').pop() || '').toLowerCase();
    return file.arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf);
      if (ext === 'xlsx' || ext === 'xls') return lerPlanilha(nome, bytes);
      var t = COMUM.lerCSV(COMUM.decodificar(bytes));
      if (!t.cabecalho.length || !t.linhas.length) throw new Error('arquivo sem linhas de dados');
      return { nome: nome, cabecalho: t.cabecalho, linhas: t.linhas };
    }, function () {
      throw new Error('o navegador não conseguiu abrir ' + nome);
    });
  }

  /* ---------- exportar ---------- */
  function avisar(el, msg, ms) {
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(el._temporizador);
    el._temporizador = setTimeout(function () { el.hidden = true; }, ms || 2500);
  }

  function baixar(nome, conteudo, tipo) {
    var blob = new Blob([conteudo], { type: tipo || 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    avisar($('copiado'), 'Se o download não começou, o visualizador está bloqueando — use "Copiar" e cole na planilha.', 6000);
  }

  function copiar(texto) {
    function pelaMao() {
      var ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(texto).then(function () { return true; }, function () { return pelaMao(); });
    }
    return Promise.resolve(pelaMao());
  }

  /* ---------- navegação entre abertura e resultado ---------- */
  function mostrarResultado() {
    var abertura = $('abertura'), resultado = $('resultado');
    if (abertura) abertura.hidden = true;
    if (resultado) {
      resultado.hidden = false;
      resultado.style.animation = 'none';
      void resultado.offsetWidth;
      resultado.style.animation = '';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function voltar() {
    var abertura = $('abertura'), resultado = $('resultado'), area = $('solta');
    if (resultado) resultado.hidden = true;
    if (abertura) abertura.hidden = false;
    if (area) area.scrollIntoView({ block: 'center' });
  }

  raiz.HT = {
    catalogo: catalogo,
    iniciar: iniciar,
    soltar: soltar,
    lerTabela: lerTabela,
    carregarScript: carregarScript,
    baixar: baixar,
    copiar: copiar,
    avisar: avisar,
    mostrarResultado: mostrarResultado,
    voltar: voltar
  };
})(this);
