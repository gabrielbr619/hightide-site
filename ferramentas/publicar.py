"""Monta site/ — a pasta que vai para o Cloudflare Pages.

Copia a landing, as imagens e as amostras como estão (os links relativos entre elas
funcionam servidos de uma pasta só), deixando de fora testes, modelo e ferramentas.
"""
import os
import shutil

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(RAIZ, "site")
FORA = {"_modelo", "testes.js", "testes.html"}


def copiar_arvore(origem, destino):
    for nome in sorted(os.listdir(origem)):
        if nome in FORA:
            continue
        caminho = os.path.join(origem, nome)
        alvo = os.path.join(destino, nome)
        if os.path.isdir(caminho):
            os.makedirs(alvo, exist_ok=True)
            copiar_arvore(caminho, alvo)
        else:
            shutil.copy2(caminho, alvo)


if os.path.isdir(SITE):
    shutil.rmtree(SITE)
os.makedirs(SITE)

shutil.copy2(os.path.join(RAIZ, "index.html"), os.path.join(SITE, "index.html"))
for pasta in ("telas", "demos"):
    os.makedirs(os.path.join(SITE, pasta))
    copiar_arvore(os.path.join(RAIZ, pasta), os.path.join(SITE, pasta))

total = 0
arquivos = 0
for base, _, nomes in os.walk(SITE):
    for nome in nomes:
        arquivos += 1
        total += os.path.getsize(os.path.join(base, nome))
print(f"site/ pronto: {arquivos} arquivos, {total // 1024} KB")
