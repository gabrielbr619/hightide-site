"""Gera dist/index.html com as telas embutidas como data URI.

O site hospedado pode servir telas/*.webp como arquivo; o Artifact é um HTML
único, então lá as imagens precisam viajar dentro do próprio arquivo.
"""
import base64
import os
import re

RAIZ = r"C:\Users\gabri\hightide-home"
FONTE = os.path.join(RAIZ, "index.html")
DESTINO = os.path.join(RAIZ, "dist", "index.html")

html = open(FONTE, encoding="utf-8").read()
os.makedirs(os.path.dirname(DESTINO), exist_ok=True)

# a fonte leva doctype (Pages e arquivo local); o Artifact embrulha num esqueleto próprio e pede sem
html = re.sub(r"^\s*<!DOCTYPE html>\s*", "", html, count=1, flags=re.IGNORECASE)

embutidas = 0
for arquivo in sorted(os.listdir(os.path.join(RAIZ, "telas"))):
    if arquivo.endswith(".svg"):
        continue
    ref = "telas/" + arquivo
    if ref not in html:
        continue
    dados = open(os.path.join(RAIZ, "telas", arquivo), "rb").read()
    tipo = "image/png" if arquivo.endswith(".png") else "image/webp"
    uri = f"data:{tipo};base64," + base64.b64encode(dados).decode("ascii")
    html = html.replace(ref, uri)
    embutidas += 1
    print(f"{arquivo:16} {len(dados)//1024:>4} KB -> {len(uri)//1024:>4} KB em base64")

if re.search(r'src="telas/|\'telas/', html):
    raise SystemExit("ERRO: sobrou referência a telas/ no HTML gerado")

open(DESTINO, "w", encoding="utf-8", newline="\n").write(html)
print(f"\n{embutidas} telas embutidas · dist/index.html = {os.path.getsize(DESTINO)//1024} KB")
