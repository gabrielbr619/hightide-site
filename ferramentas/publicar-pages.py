"""Publica o site no GitHub Pages: monta site/ e empurra para o repositório público hightide-site.

O repositório de trabalho (hightide-home) é privado, e o GitHub Pages gratuito só serve repositório
público — por isso a pasta publicada vive num clone separado, regenerado inteiro a cada publicação.
"""
import os
import shutil
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(RAIZ, "site")
CLONE = os.path.join(os.path.dirname(RAIZ), "hightide-site")
REPO = "https://github.com/gabrielbr619/hightide-site.git"
MANTER = {".git", ".gitattributes", ".nojekyll", "README.md", "CNAME"}


def rodar(*cmd):
    r = subprocess.run(cmd, cwd=CLONE, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"falhou: {' '.join(cmd)}\n{r.stdout}{r.stderr}")
    return r.stdout.strip()


subprocess.run([sys.executable, os.path.join(RAIZ, "ferramentas", "publicar.py")], check=True)

if not os.path.isdir(os.path.join(CLONE, ".git")):
    subprocess.run(["git", "clone", "-q", REPO, CLONE], check=True)
rodar("git", "pull", "-q", "--ff-only")

for nome in os.listdir(CLONE):
    if nome in MANTER:
        continue
    caminho = os.path.join(CLONE, nome)
    shutil.rmtree(caminho) if os.path.isdir(caminho) else os.remove(caminho)
shutil.copytree(SITE, CLONE, dirs_exist_ok=True)

rodar("git", "add", "--all")
if not rodar("git", "status", "--porcelain"):
    print("nada mudou desde a última publicação")
    raise SystemExit(0)
mensagem = sys.argv[1] if len(sys.argv) > 1 else "Publicar o site"
rodar("git", "commit", "-q", "-m", mensagem)
rodar("git", "push", "-q")
print("publicado:", rodar("git", "log", "-1", "--format=%h %s"))
