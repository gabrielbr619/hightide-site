# hightide.site

Site da High Tide: a landing e as nove amostras que rodam inteiras no navegador do visitante.
Sem build, sem backend, sem dependência instalada — HTML, CSS e JS puros; onde uma lib é
necessária (SheetJS, jsPDF, ZXing) ela vem de CDN pinada e só quando é usada.

## Estrutura

```
index.html            landing
telas/                imagens da landing (logo, favicon, telas do High Tide Systems)
demos/<slug>/         uma amostra por pasta: index.html + nucleo.js (lógica pura) + testes
demos/comum/          kit compartilhado das amostras: base.css, comum.js, chrome.js
demos/_modelo/        esqueleto de amostra nova
ferramentas/          scripts de publicação (Python 3)
```

Amostras: `nfe`, `documentos`, `duplicados`, `conciliador`, `painel`, `auditor`, `boleto`,
`cobranca`, `escala`.

## Rodar local

Abrir `index.html` no navegador basta (`file://` funciona). Testes das amostras novas:

```
node --test demos/comum/testes.js demos/<slug>/testes.js
```

As três primeiras (`nfe`, `documentos`, `duplicados`) têm `testes.html` — abrir no navegador.

## Publicar

O site vai para o GitHub Pages pelo repositório público `gabrielbr619/hightide-site` (o Pages
gratuito não serve repositório privado). Um comando monta `site/` (landing + amostras + imagens,
sem testes nem ferramentas), copia para o clone `../hightide-site`, faz o commit e o push:

```
py ferramentas/publicar-pages.py "mensagem do commit"
```

`py ferramentas/publicar.py` sozinho só monta `site/`, sem publicar.

`ferramentas/empacotar.py` e `ferramentas/empacotar-demos.py` geram `dist/` — versões em
arquivo único, com imagens e scripts embutidos, para publicar como Artifact.
