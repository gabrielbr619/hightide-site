"""Gera dist/demos/<slug>/index.html com o JS e as imagens embutidos.

No Cloudflare Pages a demo pode servir nucleo.js e ../../telas/*.webp como arquivo;
no Artifact é um HTML único, então tudo viaja dentro dele.
"""
import base64
import os
import re
import sys

RAIZ = r"C:\Users\gabri\hightide-home"
DEMOS = sys.argv[1:] or ["nfe"]


def data_uri(caminho):
    dados = open(caminho, "rb").read()
    tipo = "image/png" if caminho.endswith(".png") else "image/webp"
    return f"data:{tipo};base64," + base64.b64encode(dados).decode("ascii"), len(dados)


for slug in DEMOS:
    pasta = os.path.join(RAIZ, "demos", slug)
    fonte = os.path.join(pasta, "index.html")
    destino = os.path.join(RAIZ, "dist", "demos", slug, "index.html")
    html = open(fonte, encoding="utf-8").read()
    os.makedirs(os.path.dirname(destino), exist_ok=True)

    # a fonte leva doctype (sem ele o Pages renderiza em quirks mode e tabela não herda cor);
    # o Artifact embrulha o arquivo num esqueleto próprio e pede o conteúdo sem doctype
    html = re.sub(r'^\s*<!DOCTYPE html>\s*', '', html, count=1, flags=re.IGNORECASE)

    # o CSS compartilhado (../comum/base.css) e o da demo entram inline; fonte do Google fica como está
    for folha in re.findall(r'<link rel="stylesheet" href="([^":]+\.css)">', html):
        css = open(os.path.normpath(os.path.join(pasta, folha)), encoding="utf-8").read()
        if "</style" in css:
            raise SystemExit(f"ERRO: {folha} contém </style e não pode ser embutido")
        html = html.replace(f'<link rel="stylesheet" href="{folha}">', "<style>\n" + css + "\n</style>")
        print(f"  {folha:24} {len(css)//1024:>4} KB embutido")

    # só o JS local vai para dentro; lib de CDN (cdnjs, permitido no Artifact) fica como está
    for script in re.findall(r'<script src="([^":]+\.js)"></script>', html):
        js = open(os.path.normpath(os.path.join(pasta, script)), encoding="utf-8").read()
        if "</script" in js:
            raise SystemExit(f"ERRO: {script} contém </script e não pode ser embutido")
        html = html.replace(f'<script src="{script}"></script>', "<script>\n" + js + "\n</script>")
        print(f"  {script:24} {len(js)//1024:>4} KB embutido")

    for ref in sorted(set(re.findall(r'\.\./\.\./telas/([\w.-]+)', html))):
        uri, tamanho = data_uri(os.path.join(RAIZ, "telas", ref))
        html = html.replace("../../telas/" + ref, uri)
        print(f"  {ref:24} {tamanho//1024:>4} KB -> {len(uri)//1024:>4} KB em base64")

    sobras = re.findall(
        r'(\.\./\.\./telas/'
        r'|<script src="(?!https://cdnjs\.cloudflare\.com/)'
        r'|<link rel="stylesheet" href="(?!https?://))',
        html,
    )
    if sobras:
        raise SystemExit(f"ERRO: sobrou referência externa no HTML gerado: {sobras}")

    open(destino, "w", encoding="utf-8", newline="\n").write(html)
    print(f"{slug}: dist/demos/{slug}/index.html = {os.path.getsize(destino)//1024} KB\n")
