"""Prepara a logo original da High Tide para os dois temas + o favicon.

A original tem o hexágono coral e o wordmark preto. Em fundo escuro o preto some,
e inverter a imagem inteira (o que o produto fazia) deixaria o hexágono ciano.
Aqui só o texto muda de cor; o coral da marca fica intacto.
"""
import os
from PIL import Image

ORIGEM = (
    r"C:\Users\gabri\AppData\Local\Temp\claude\C--Users-gabri"
    r"\3b72d951-c3dd-4744-87f1-cca3078a331a\scratchpad"
    r"\high-tide-systems-frontend-legacy\public\logo_horizontal_sem_fundo.png"
)
DESTINO = r"C:\Users\gabri\hightide-home\telas"
ALTURA = 120         # ~2,6x a altura de exibição (46px) — nítida em tela retina
CLARO = (234, 239, 255)   # --tinta do tema escuro

os.makedirs(DESTINO, exist_ok=True)
orig = Image.open(ORIGEM).convert("RGBA")


def redimensionar(img, altura):
    return img.resize((round(img.width * altura / img.height), altura), Image.LANCZOS)


def recolorir_texto(img, cor):
    """Troca só os pixels acinzentados (o wordmark) — o coral do hexágono não é tocado."""
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if max(r, g, b) - min(r, g, b) < 40 and (r + g + b) / 3 < 150:
                px[x, y] = (cor[0], cor[1], cor[2], a)
    return img


claro = redimensionar(orig.copy(), ALTURA)
claro.save(os.path.join(DESTINO, "logo-clara.webp"), "WEBP", quality=92, method=6)

escuro = recolorir_texto(redimensionar(orig.copy(), ALTURA), CLARO)
escuro.save(os.path.join(DESTINO, "logo-escura.webp"), "WEBP", quality=92, method=6)

# favicon: só o hexágono, quadrado, sobre o azul-noite
largura_simbolo = round(orig.height * 1.12)
simbolo = orig.crop((0, 0, largura_simbolo, orig.height))
lado = max(simbolo.size)
quadro = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
quadro.paste(simbolo, ((lado - simbolo.width) // 2, (lado - simbolo.height) // 2), simbolo)
quadro = quadro.resize((180, 180), Image.LANCZOS)

fundo = Image.new("RGBA", (256, 256), (7, 11, 24, 255))
fundo.paste(quadro, (38, 38), quadro)
fundo.save(os.path.join(DESTINO, "favicon.png"), "PNG", optimize=True)

for nome in ("logo-clara.webp", "logo-escura.webp", "favicon.png"):
    caminho = os.path.join(DESTINO, nome)
    print(f"{nome:20} {Image.open(caminho).size}  {os.path.getsize(caminho)//1024} KB")
