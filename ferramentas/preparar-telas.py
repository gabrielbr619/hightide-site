"""Otimiza as capturas de tela do produto para a landing (webp, largura fixa)."""
import os
from PIL import Image

ORIGEM = (
    r"C:\Users\gabri\AppData\Local\Temp\claude\C--Users-gabri"
    r"\3b72d951-c3dd-4744-87f1-cca3078a331a\scratchpad"
    r"\high-tide-systems-frontend-legacy\public\landing"
)
DESTINO = r"C:\Users\gabri\hightide-home\telas"
LARGURA = 1400

TELAS = {
    "imagem-dashboard.png": "painel.webp",
    "imagem-agendarconsulta-agendamento.png": "agenda.webp",
    "imagem-ocupacao-agendamento.png": "relatorio.webp",
    "imagem-clientes-pessoas.png": "cadastro.webp",
    "imagem-chat2.png": "chat.webp",
}

os.makedirs(DESTINO, exist_ok=True)
for entrada, saida in TELAS.items():
    caminho = os.path.join(ORIGEM, entrada)
    if not os.path.exists(caminho):
        print("FALTA", entrada)
        continue
    img = Image.open(caminho).convert("RGB")
    if img.width > LARGURA:
        img = img.resize((LARGURA, round(img.height * LARGURA / img.width)), Image.LANCZOS)
    alvo = os.path.join(DESTINO, saida)
    img.save(alvo, "WEBP", quality=74, method=6)
    print(f"{saida:16} {img.width}x{img.height}  {os.path.getsize(alvo)//1024} KB")
