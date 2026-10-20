import os
import threading
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv

# ReportLab para PDFs profissionais
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

# Google Drive API
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

load_dotenv()

app = FastAPI(title="Yama PDV - Motor Central Otimizado")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

USUARIOS_LOJAS = {
    "loja-MOGI": {"email": "mogi@yamaprint.local", "unidade": "MOGI", "drive_resumo": "1_nXpre0UBFsiDTRNRh9nqVfgXWv9bQs0", "drive_vendas": "1ga5csmgQGgkoya-N6CUvEAo2vCM4nFTW"},
    "loja-SUZANO": {"email": "suzano@yamaprint.local", "unidade": "SUZANO", "drive_resumo": "1YAwCBmHhPcVmprpFzSdE9C1f0C7bmZCe", "drive_vendas": "1fXD-peFVuK2awS3Etx9-MZxnHYYrJbyq"},
}

SETORES_ORDEM = [
    "MATERIAIS", "CÓPIA", "IMPR. P/B", "IMPR. COLOR",
    "PLASTIFICAÇÃO", "ENCADERNAÇÃO", "CARIMBO", "GRÁFICA",
    "INFORMÁTICA", "PACOTE", "MENSALISTA", "RETIRADA"
]

SETOR_LABELS = {
    "MATERIAIS": "Materiais",
    "CÓPIA": "Cópia",
    "IMPR. P/B": "Impr. P/B",
    "IMPR. COLOR": "Impr. Color",
    "PLASTIFICAÇÃO": "Plastificação",
    "ENCADERNAÇÃO": "Encadernação",
    "CARIMBO": "Carimbo",
    "GRÁFICA": "Gráfica",
    "INFORMÁTICA": "Informática",
    "PACOTE": "Pacote",
    "MENSALISTA": "Mensalista",
    "RETIRADA": "Retirada"
}

class LoginInput(BaseModel):
    usuario: str
    senha: str

class AbrirCaixaInput(BaseModel):
    unidade: str
    troco_inicial: float

class TrocaCaixaInput(BaseModel):
    unidade: str
    acao: str

class ItemVendaInput(BaseModel):
    setor: str
    valor: float
    obs: Optional[str] = ""

class RegistrarVendaInput(BaseModel):
    unidade: str
    forma_pagto: str
    itens: List[ItemVendaInput]

class CancelarVendaInput(BaseModel):
    venda_id: str
    motivo: str


def obter_sessao_aberta(unidade: str):
    res = (
        supabase.table("caixa_sessoes")
        .select("*")
        .eq("unidade", unidade)
        .eq("status", "ABERTO")
        .order("aberto_em", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def calcular_dados_sessao(sessao_id: str, troco_inicial: float):
    vendas_raw = (
        supabase.table("vendas")
        .select("*")
        .eq("sessao_id", sessao_id)
        .order("numero_sequencial", desc=False)
        .execute()
        .data
    )

    total_vendas = 0.0
    dinheiro_liquido = 0.0
    repasse_caixa_2 = 0.0
    por_setor = {s: 0.0 for s in SETORES_ORDEM}
    por_pagto = {"DINHEIRO": 0.0, "PIX": 0.0, "DÉBITO": 0.0, "CRÉDITO": 0.0}

    vendas_formatadas = []
    ids_unicos_validos = set()

    for v in vendas_raw:
        valor = float(v["valor"])
        pagto = v["forma_pagto"]
        setor = v["setor"]
        obs = v["observacao"] or ""

        if pagto != "CANCELADO":
            ids_unicos_validos.add(v["numero_sequencial"])
            if setor == "RETIRADA":
                por_setor["RETIRADA"] += valor
                if pagto == "DINHEIRO":
                    dinheiro_liquido -= valor
            else:
                total_vendas += valor
                if setor in por_setor:
                    por_setor[setor] += valor
                if pagto in por_pagto:
                    por_pagto[pagto] += valor
                if pagto == "DINHEIRO":
                    dinheiro_liquido += valor
                    if v["is_caixa_2"]:
                        repasse_caixa_2 += valor

        hora_local = datetime.fromisoformat(v["criado_em"].replace("Z", "+00:00")).astimezone().strftime("%H:%M:%S")
        id_str = str(v["numero_sequencial"]).zfill(4)

        vendas_formatadas.append({
            "uuid": v["id"],
            "id": id_str,
            "setor": setor,
            "hora": hora_local,
            "valor": valor,
            "valorFormatado": f"R$ {valor:,.2f}".replace(".", "X").replace(",", ".").replace("X", ","),
            "pagamento": pagto,
            "obs": obs,
            "isCaixa2": v["is_caixa_2"]
        })

    vendas_formatadas.reverse()
    total_clientes = len(ids_unicos_validos)
    ticket_medio = (total_vendas / total_clientes) if total_clientes > 0 else 0.0

    return {
        "vendas": vendas_formatadas,
        "totais": {
            "totalVendas": round(total_vendas, 2),
            "saldoCaixa": round(troco_inicial + dinheiro_liquido, 2),
            "repasseCaixa2": round(repasse_caixa_2, 2),
            "totalClientesUnicos": total_clientes,
            "ticketMedio": round(ticket_medio, 2),
            "porSetor": por_setor,
            "porPagamento": por_pagto
        }
    }


import pickle
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow

def enviar_para_google_drive(caminho_arquivo: str, pasta_id: str):
    caminho_credenciais = os.path.join(os.path.dirname(__file__), "credentials.json")
    caminho_token = os.path.join(os.path.dirname(__file__), "token.pickle")
    
    if not os.path.exists(caminho_credenciais) or not pasta_id or "COLE_O_ID" in pasta_id:
        return

    try:
        creds = None
        SCOPES = ['https://www.googleapis.com/auth/drive']
        if os.path.exists(caminho_token):
            with open(caminho_token, 'rb') as token:
                creds = pickle.load(token)
                
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                flow = InstalledAppFlow.from_client_secrets_file(caminho_credenciais, SCOPES)
                creds = flow.run_local_server(port=0)
            with open(caminho_token, 'wb') as token:
                pickle.dump(creds, token)

        service = build('drive', 'v3', credentials=creds)
        nome_arquivo = os.path.basename(caminho_arquivo)
        file_metadata = {'name': nome_arquivo, 'parents': [pasta_id]}
        media = MediaFileUpload(caminho_arquivo, resumable=True)
        service.files().create(body=file_metadata, media_body=media, fields='id').execute()
    except Exception as e:
        print(f"❌ [DRIVE FALHA]: {str(e)}")

def gerar_pdfs_profissionais(unidade: str, sessao: dict, resumo: dict):
    pasta_relatorios = os.path.join(os.path.expanduser("~"), "Documents", f"Relatorios_PDV_{unidade}")
    os.makedirs(pasta_relatorios, exist_ok=True)

    agora = datetime.now()
    timestamp = agora.strftime("%d-%m-%y_%Hh%Mm")
    caminho_resumo = os.path.join(pasta_relatorios, f"Resumo{unidade}_{timestamp}.pdf")
    caminho_vendas = os.path.join(pasta_relatorios, f"Vendas{unidade}_{timestamp}.pdf")

    config_loja = USUARIOS_LOJAS.get(f"loja-{unidade}", {"drive_resumo": "", "drive_vendas": ""})

    # Margens e espaçamentos otimizados para leitura limpa sem gráficos
    doc_resumo = SimpleDocTemplate(caminho_resumo, pagesize=A4, rightMargin=36, leftMargin=36, topMargin=30, bottomMargin=30)
    elementos_resumo = []
    estilos = getSampleStyleSheet()

    # Fontes aumentadas (11pt) para máxima legibilidade
    estilo_tabela = ParagraphStyle('EstiloTabela', parent=estilos['Normal'], fontSize=11, fontName='Helvetica')
    estilo_tabela_bold = ParagraphStyle('EstiloTabelaBold', parent=estilos['Normal'], fontSize=11, fontName='Helvetica-Bold')

    # Cabeçalho Executivo Aumentado
    elementos_resumo.append(Paragraph(f"<b>RELATÓRIO DE FECHAMENTO DE CAIXA — UNIDADE {unidade}</b>", ParagraphStyle('Cab', fontSize=16, textColor=colors.HexColor('#0f172a'), alignment=0, fontName='Helvetica-Bold')))
    elementos_resumo.append(Spacer(1, 15))
    elementos_resumo.append(Spacer(1, 4))
    elementos_resumo.append(Paragraph(f"Data de Emissão: {agora.strftime('%d/%m/%Y às %H:%M:%S')} &nbsp;&nbsp;|&nbsp;&nbsp; Clientes Atendidos: <b>{resumo['totais']['totalClientesUnicos']}</b>", ParagraphStyle('Sub', fontSize=11, textColor=colors.HexColor('#64748b'), alignment=0)))
    elementos_resumo.append(Spacer(1, 8))
    elementos_resumo.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#0284c7'), spaceAfter=14))

    # Tabela 1: Faturamento por Setor (Com linhas mais altas e confortáveis)
    elementos_resumo.append(Paragraph("<b>1. Faturamento Detalhado por Setor</b>", ParagraphStyle('H2', fontSize=12, textColor=colors.HexColor('#0f172a'), fontName='Helvetica-Bold')))
    elementos_resumo.append(Spacer(1, 6))

    dados_tabela_setores = [["SETOR", "FATURAMENTO"]]
    for setor, valor in resumo["totais"]["porSetor"].items():
        val_fmt = f"R$ {valor:,.2f}".replace(".", "X").replace(",", ".").replace("X", ",")
        rotulo_p = Paragraph(SETOR_LABELS.get(setor, setor), estilo_tabela_bold)
        
        if setor == "RETIRADA":
            val_p = Paragraph(f'<font color="#e11d48"><b>{val_fmt}</b></font>', estilo_tabela_bold)
        else:
            val_p = Paragraph(val_fmt, estilo_tabela)
        dados_tabela_setores.append([rotulo_p, val_p])

    t_setores = Table(dados_tabela_setores, colWidths=[270, 270])
    t_setores.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0284c7')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5.5),
        ('TOPPADDING', (0, 0), (-1, -1), 5.5),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
    ]))
    elementos_resumo.append(t_setores)
    elementos_resumo.append(Spacer(1, 16))

    # Tabela 2: Resumo Financeiro e Fechamento (Com linhas espaçadas e limpas)
    elementos_resumo.append(Paragraph("<b>2. Resumo Financeiro e Fechamento de Caixa</b>", ParagraphStyle('H2B', fontSize=12, textColor=colors.HexColor('#0f172a'), fontName='Helvetica-Bold')))
    elementos_resumo.append(Spacer(1, 6))

    troco_fmt = f"R$ {float(sessao['troco_inicial']):,.2f}".replace(".", "X").replace(",", ".").replace("X", ",")
    dinheiro_fmt = f"R$ {resumo['totais']['porPagamento']['DINHEIRO']:,.2f}".replace(".", "X").replace(",", ".").replace("X", ",")
    pix_fmt = f"R$ {resumo['totais']['porPagamento']['PIX']:,.2f}".replace(".", "X").replace(",", ".").replace("X", ",")
    debito_fmt = f"R$ {resumo['totais']['porPagamento']['DÉBITO']:,.2f}".replace(".", "X").replace(",", ".").replace("X", ",")
    credito_fmt = f"R$ {resumo['totais']['porPagamento']['CRÉDITO']:,.2f}".replace(".", "X").replace(",", ".").replace("X", ",")
    repasse_fmt = f"R$ {resumo['totais']['repasseCaixa2']:,.2f}".replace(".", "X").replace(",", ".").replace("X", ",")
    ticket_fmt = f"R$ {resumo['totais']['ticketMedio']:,.2f}".replace(".", "X").replace(",", ".").replace("X", ",")
    total_fmt = f"R$ {resumo['totais']['totalVendas']:,.2f}".replace(".", "X").replace(",", ".").replace("X", ",")
    saldo_fmt = f"R$ {resumo['totais']['saldoCaixa']:,.2f}".replace(".", "X").replace(",", ".").replace("X", ",")

    dados_tabela_totais = [
        [Paragraph("Troco Inicial", estilo_tabela), Paragraph(troco_fmt, estilo_tabela)],
        [Paragraph("Total em Dinheiro", estilo_tabela), Paragraph(dinheiro_fmt, estilo_tabela)],
        [Paragraph("Total em PIX", estilo_tabela), Paragraph(pix_fmt, estilo_tabela)],
        [Paragraph("Total em Débito", estilo_tabela), Paragraph(debito_fmt, estilo_tabela)],
        [Paragraph("Total em Crédito", estilo_tabela), Paragraph(credito_fmt, estilo_tabela)],
        [Paragraph("Repasse 2º Caixa (Almoço)", estilo_tabela), Paragraph(repasse_fmt, estilo_tabela)],
        [Paragraph("TICKET MÉDIO", estilo_tabela_bold), Paragraph(f'<font color="#7c3aed"><b>{ticket_fmt}</b></font>', estilo_tabela_bold)],
        [Paragraph("FATURAMENTO", estilo_tabela_bold), Paragraph(f'<font color="#0369a1"><b>{total_fmt}</b></font>', estilo_tabela_bold)],
        [Paragraph("SALDO EM CAIXA", estilo_tabela_bold), Paragraph(f'<font color="#16a34a"><b>{saldo_fmt}</b></font>', estilo_tabela_bold)],
    ]
    t_totais = Table(dados_tabela_totais, colWidths=[270, 270])
    t_totais.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f1f5f9')),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
    ]))
    elementos_resumo.append(t_totais)
    

    doc_resumo.build(elementos_resumo)

    # --- PDF DE VENDAS ---
    doc_vendas = SimpleDocTemplate(caminho_vendas, pagesize=A4, rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30)
    elementos_vendas = []
    elementos_vendas.append(Paragraph(f"<b>YAMA PRINT - REGISTRO DETALHADO DE VENDAS</b>", ParagraphStyle('CabV', parent=estilos['Heading1'], fontSize=14, textColor=colors.HexColor('#0f172a'), alignment=1)))
    elementos_vendas.append(Paragraph(f"<b>Unidade:</b> {unidade} &nbsp;&nbsp;|&nbsp;&nbsp; <b>Fechamento:</b> {agora.strftime('%d/%m/%Y às %H:%M:%S')}", ParagraphStyle('SubV', parent=estilos['Normal'], fontSize=9, textColor=colors.HexColor('#64748b'), alignment=1)))
    elementos_vendas.append(Spacer(1, 10))
    elementos_vendas.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#0ea5e9')))
    elementos_vendas.append(Spacer(1, 10))

    dados_vendas_tabela = [["ID", "SETOR", "HORA", "VALOR", "PAGTO", "OBSERVAÇÃO"]]
    for v in resumo["vendas"]:
        dados_vendas_tabela.append([v["id"], v["setor"], v["hora"], v["valorFormatado"], v["pagamento"], v["obs"] or ""])

    t_vendas = Table(dados_vendas_tabela, colWidths=[40, 100, 55, 75, 75, 190])
    t_vendas.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0284c7')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
    ]))
    elementos_vendas.append(t_vendas)
    doc_vendas.build(elementos_vendas)

    enviar_para_google_drive(caminho_resumo, config_loja["drive_resumo"])
    enviar_para_google_drive(caminho_vendas, config_loja["drive_vendas"])

    return pasta_relatorios


@app.post("/api/login")
def validar_login(dados: LoginInput):
    info = USUARIOS_LOJAS.get(dados.usuario)
    if not info:
        raise HTTPException(status_code=401, detail="Usuário inválido.")
    try:
        supabase.auth.sign_in_with_password({"email": info["email"], "password": dados.senha})
        return {"success": True, "unidade": info["unidade"], "usuario": dados.usuario}
    except Exception:
        raise HTTPException(status_code=401, detail="Usuário ou senha inválidos.")


@app.get("/api/status-caixa/{unidade}")
def obter_status_caixa(unidade: str):
    sessao = obter_sessao_aberta(unidade)
    if not sessao:
        return {"status": "Fechado", "dataHora": "CAIXA FECHADO", "trocoInicial": "0.00", "caixa2Ativo": False, "vendas": [], "totais": {"totalVendas": 0.0, "saldoCaixa": 0.0, "totalClientesUnicos": 0, "ticketMedio": 0.0}}

    dt_abertura = datetime.fromisoformat(sessao["aberto_em"].replace("Z", "+00:00")).astimezone()
    dados_vendas = calcular_dados_sessao(sessao["id"], float(sessao["troco_inicial"]))
    return {"status": "Aberto", "sessaoId": sessao["id"], "dataHora": dt_abertura.strftime("%d/%m/%Y, %H:%M:%S"), "trocoInicial": f"{float(sessao['troco_inicial']):.2f}", "caixa2Ativo": sessao["caixa_2_ativo"], "vendas": dados_vendas["vendas"], "totais": dados_vendas["totais"]}


@app.post("/api/abrir-caixa")
def abrir_caixa(dados: AbrirCaixaInput):
    if obter_sessao_aberta(dados.unidade):
        raise HTTPException(status_code=400, detail="O caixa já está aberto.")
    supabase.table("caixa_sessoes").insert({"unidade": dados.unidade, "status": "ABERTO", "troco_inicial": dados.troco_inicial, "caixa_2_ativo": False}).execute()
    return obter_status_caixa(dados.unidade)


@app.post("/api/troca-caixa")
def gerenciar_troca_caixa(dados: TrocaCaixaInput):
    sessao = obter_sessao_aberta(dados.unidade)
    if not sessao:
        raise HTTPException(status_code=400, detail="Abra o caixa principal primeiro.")
    if dados.acao == "iniciar":
        supabase.table("caixa_sessoes").update({"caixa_2_ativo": True}).eq("id", sessao["id"]).execute()
        return {"status": "iniciado", "caixa2Ativo": True, "mensagem": "2º CAIXA iniciado com sucesso!\n\nAs próximas vendas serão registradas no 2º CAIXA com troco fixo base de R$ 375,00."}
    else:
        resumo = calcular_dados_sessao(sessao["id"], float(sessao["troco_inicial"]))
        repasse = resumo["totais"]["repasseCaixa2"]
        supabase.table("caixa_sessoes").update({"caixa_2_ativo": False, "repasse_caixa_2": repasse}).eq("id", sessao["id"]).execute()
        return {"status": "finalizado", "caixa2Ativo": False, "mensagem": f"TROCA FINALIZADA!\n\nVALOR PARA REPASSE AO CAIXA PRINCIPAL: R$ {repasse:.2f}".replace('.', ',')}


@app.post("/api/registrar-venda")
def registrar_venda(dados: RegistrarVendaInput):
    sessao = obter_sessao_aberta(dados.unidade)
    if not sessao:
        raise HTTPException(status_code=400, detail="Caixa fechado.")
    ultimas = supabase.table("vendas").select("numero_sequencial").eq("sessao_id", sessao["id"]).order("numero_sequencial", desc=True).limit(1).execute().data
    proximo_seq = (ultimas[0]["numero_sequencial"] + 1) if ultimas else 1
    is_c2 = sessao["caixa_2_ativo"]

    linhas_inserir = []
    for item in dados.itens:
        obs_final = item.obs or ""
        if is_c2:
            obs_final = f"[2º CAIXA] {obs_final}".strip()
        linhas_inserir.append({"sessao_id": sessao["id"], "unidade": dados.unidade, "numero_sequencial": proximo_seq, "setor": item.setor, "valor": item.valor, "quantidade": 1, "forma_pagto": dados.forma_pagto, "observacao": obs_final, "is_caixa_2": is_c2})

    supabase.table("vendas").insert(linhas_inserir).execute()
    return {"status": "sucesso", "id": str(proximo_seq).zfill(4), "pagamento": dados.forma_pagto, "hora": datetime.now().strftime("%H:%M:%S")}


@app.post("/api/cancelar-venda")
def cancelar_venda(dados: CancelarVendaInput):
    if not dados.motivo or not dados.motivo.strip():
        raise HTTPException(status_code=400, detail="O motivo da exclusão é obrigatório.")
    supabase.table("vendas").update({"forma_pagto": "CANCELADO", "observacao": dados.motivo.strip()}).eq("id", dados.venda_id).execute()
    return {"success": True, "message": "Venda excluída com sucesso."}


@app.post("/api/fechar-caixa/{unidade}")
def fechar_caixa(unidade: str):
    sessao = obter_sessao_aberta(unidade)
    if not sessao:
        raise HTTPException(status_code=400, detail="O caixa já está fechado.")
    if sessao["caixa_2_ativo"]:
        raise HTTPException(status_code=400, detail="Finalize o Caixa Almoço antes de fechar o dia.")

    resumo = calcular_dados_sessao(sessao["id"], float(sessao["troco_inicial"]))
    pasta_salva = gerar_pdfs_profissionais(unidade, sessao, resumo)
    supabase.table("caixa_sessoes").update({"status": "FECHADO", "fechado_em": datetime.now().isoformat(), "repasse_caixa_2": resumo["totais"]["repasseCaixa2"]}).eq("id", sessao["id"]).execute()
    return {"status": "Fechado", "pastaRelatorios": pasta_salva, "mensagem": f"Caixa fechado com sucesso!\nOs relatórios PDF foram enviados para a nuvem."}