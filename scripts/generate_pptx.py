# -*- coding: utf-8 -*-
"""
Generate PFE Presentation PPTX - Teamwill SOC Sentinel
"""
import os
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

# ── Colors ──
TW_GREEN = RGBColor(0x8B, 0x9A, 0x46)
TW_GREEN_LIGHT = RGBColor(0xA3, 0xB3, 0x5C)
TW_GREEN_DARK = RGBColor(0x6B, 0x7A, 0x30)
TW_GRAY = RGBColor(0x4A, 0x4A, 0x4A)
TW_GRAY_DARK = RGBColor(0x2D, 0x2D, 0x2D)
TW_GRAY_LIGHT = RGBColor(0x6B, 0x6B, 0x6B)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
BLACK = RGBColor(0x00, 0x00, 0x00)
TW_BLUE = RGBColor(0x3B, 0x82, 0xF6)
TW_RED = RGBColor(0xEF, 0x44, 0x44)
TW_ORANGE = RGBColor(0xF5, 0x9E, 0x0B)
TW_PURPLE = RGBColor(0x8B, 0x5C, 0xF6)
LIGHT_BG = RGBColor(0xF0, 0xF2, 0xE8)
DARK_BG = RGBColor(0x1A, 0x1A, 0x2E)

SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)

prs = Presentation()
prs.slide_width = SLIDE_W
prs.slide_height = SLIDE_H


def add_bg(slide, color):
    bg = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = color


def add_rect(slide, left, top, width, height, fill_color, border_color=None):
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill_color
    if border_color:
        shape.line.color.rgb = border_color
        shape.line.width = Pt(1)
    else:
        shape.line.fill.background()
    return shape


def add_rounded_rect(slide, left, top, width, height, fill_color, border_color=None):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill_color
    if border_color:
        shape.line.color.rgb = border_color
        shape.line.width = Pt(1.5)
    else:
        shape.line.fill.background()
    return shape


def add_text_box(slide, left, top, width, height, text, font_size=14, bold=False,
                 color=TW_GRAY_DARK, align=PP_ALIGN.LEFT, font_name="Calibri"):
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = Pt(font_size)
    p.font.bold = bold
    p.font.color.rgb = color
    p.font.name = font_name
    p.alignment = align
    return txBox


def add_multiline(slide, left, top, width, height, lines, font_size=12, color=TW_GRAY_DARK,
                  bold_first=False, spacing=1.2, font_name="Calibri"):
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    for i, line in enumerate(lines):
        if i == 0:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
        p.text = line
        p.font.size = Pt(font_size)
        p.font.color.rgb = color
        p.font.name = font_name
        p.space_after = Pt(font_size * (spacing - 1) * 2)
        if bold_first and i == 0:
            p.font.bold = True
    return txBox


def add_green_bar(slide):
    add_rect(slide, Inches(0), Inches(0), SLIDE_W, Pt(5), TW_GREEN)


def add_footer(slide, num, dark=False):
    c = WHITE if dark else TW_GRAY_LIGHT
    add_text_box(slide, Inches(0.5), Inches(7.0), Inches(4), Inches(0.3),
                 f"PFE 2025/2026 — Molka BENHMIDA", 9, color=c)
    add_text_box(slide, Inches(9), Inches(7.0), Inches(4), Inches(0.3),
                 "Teamwill", 9, color=c, align=PP_ALIGN.RIGHT)

    circle = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(6.4), Inches(6.95), Inches(0.35), Inches(0.35))
    circle.fill.solid()
    circle.fill.fore_color.rgb = TW_GREEN
    circle.line.fill.background()
    tf = circle.text_frame
    tf.word_wrap = False
    p = tf.paragraphs[0]
    p.text = str(num)
    p.font.size = Pt(9)
    p.font.bold = True
    p.font.color.rgb = WHITE
    p.alignment = PP_ALIGN.CENTER
    tf.paragraphs[0].space_before = Pt(0)
    tf.paragraphs[0].space_after = Pt(0)


def add_logo(slide, dark=False):
    c = RGBColor(0xAA, 0xAA, 0xAA) if dark else TW_GRAY
    lc = RGBColor(0x55, 0x55, 0x55) if dark else TW_GREEN

    box = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(11.5), Inches(0.2), Inches(0.38), Inches(0.38))
    box.fill.background()
    box.line.color.rgb = lc
    box.line.width = Pt(1.5)
    tf = box.text_frame
    p = tf.paragraphs[0]
    p.text = "TW"
    p.font.size = Pt(9)
    p.font.bold = True
    p.font.color.rgb = c
    p.alignment = PP_ALIGN.CENTER

    add_text_box(slide, Inches(11.95), Inches(0.22), Inches(1.2), Inches(0.35),
                 "Teamwill", 13, bold=True, color=c)


def add_section_label(slide, text, dark=False):
    c = TW_GREEN_LIGHT if dark else TW_GREEN
    add_text_box(slide, Inches(0.7), Inches(0.5), Inches(5), Inches(0.3),
                 text, 10, bold=True, color=c)


def add_slide_title(slide, text, dark=False):
    c = WHITE if dark else TW_GRAY_DARK
    add_text_box(slide, Inches(0.7), Inches(0.85), Inches(10), Inches(0.6),
                 text, 30, bold=True, color=c)


def add_slide_subtitle(slide, text, dark=False):
    c = RGBColor(0x99, 0x99, 0x99) if dark else TW_GRAY_LIGHT
    add_text_box(slide, Inches(0.7), Inches(1.45), Inches(10), Inches(0.4),
                 text, 15, color=c)


def make_card(slide, left, top, width, height, title, body, accent_color=TW_GREEN, icon=""):
    card = add_rounded_rect(slide, left, top, width, height, WHITE, RGBColor(0xE5, 0xE7, 0xEB))
    card.shadow.inherit = False

    if icon:
        add_text_box(slide, left + Inches(0.2), top + Inches(0.15), Inches(0.5), Inches(0.4),
                     icon, 18, color=accent_color)

    add_text_box(slide, left + Inches(0.2), top + Inches(0.55), width - Inches(0.4), Inches(0.35),
                 title, 13, bold=True, color=TW_GRAY_DARK)

    add_text_box(slide, left + Inches(0.2), top + Inches(0.9), width - Inches(0.4), height - Inches(1.1),
                 body, 10, color=TW_GRAY_LIGHT)


def make_dark_card(slide, left, top, width, height, title, body, accent_color=TW_GREEN, border_left=False):
    card = add_rounded_rect(slide, left, top, width, height, RGBColor(0x2A, 0x2A, 0x3E))
    card.line.fill.background()

    if border_left:
        add_rect(slide, left, top + Inches(0.1), Pt(4), height - Inches(0.2), accent_color)

    add_text_box(slide, left + Inches(0.25), top + Inches(0.15), width - Inches(0.5), Inches(0.3),
                 title, 13, bold=True, color=WHITE)

    add_multiline(slide, left + Inches(0.25), top + Inches(0.5), width - Inches(0.5), height - Inches(0.6),
                  body if isinstance(body, list) else [body], 10, color=RGBColor(0xAA, 0xAA, 0xAA))


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 1: COVER
# ══════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank
add_bg(slide, DARK_BG)

# Green accent bar bottom
add_rect(slide, Inches(0), Inches(7.35), Inches(8), Pt(5), TW_GREEN)

# Decorative diagonal
shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(8), Inches(0), Inches(5.5), SLIDE_H)
shape.fill.solid()
shape.fill.fore_color.rgb = RGBColor(0x22, 0x22, 0x36)
shape.line.fill.background()
shape.rotation = 0

# Logo
add_text_box(slide, Inches(0.8), Inches(0.6), Inches(0.5), Inches(0.5),
             "TW", 18, bold=True, color=TW_GREEN_LIGHT)
add_text_box(slide, Inches(1.4), Inches(0.62), Inches(2), Inches(0.4),
             "Teamwill", 22, bold=True, color=RGBColor(0xDD, 0xDD, 0xDD))

# Title
add_text_box(slide, Inches(0.8), Inches(2.0), Inches(8), Inches(1.5),
             "Solution Intelligente pour le Traitement des Incidents Microsoft Sentinel",
             36, bold=True, color=WHITE)

# Subtitle
add_text_box(slide, Inches(0.8), Inches(3.7), Inches(8), Inches(0.8),
             "Conception et implementation d'une solution intelligente pour le traitement "
             "et l'orchestration des incidents Microsoft Sentinel a l'aide de n8n",
             14, color=RGBColor(0x99, 0x99, 0x99))

# Meta info
meta_items = [
    ("PRESENTEE PAR", "Molka BENHMIDA"),
    ("ENTREPRISE", "Teamwill"),
    ("ENCADRANT", "[Nom de l'encadrant]"),
    ("ANNEE", "2025 / 2026"),
]
for i, (label, value) in enumerate(meta_items):
    x = Inches(0.8 + i * 2.6)
    add_text_box(slide, x, Inches(5.2), Inches(2.4), Inches(0.2),
                 label, 8, bold=True, color=TW_GREEN_LIGHT)
    add_text_box(slide, x, Inches(5.45), Inches(2.4), Inches(0.3),
                 value, 12, color=RGBColor(0xCC, 0xCC, 0xCC))


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 2: PLAN
# ══════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_green_bar(slide)
add_logo(slide)
add_section_label(slide, "SOMMAIRE")
add_slide_title(slide, "Plan de la Presentation")
add_slide_subtitle(slide, "Vue d'ensemble du projet de fin d'etudes")
add_footer(slide, 2)

items_left = [
    "01  —  Contexte et Sujet du Stage",
    "02  —  Constat et Problematique",
    "03  —  Etude de l'Existant",
    "04  —  Solution Proposee",
    "05  —  Architecture Technique",
]
items_right = [
    "06  —  Methodologie et Technologies",
    "07  —  Planification en Sprints",
    "08  —  Travail Realise",
    "09  —  Demonstration",
    "10  —  Conclusion et Perspectives",
]

for i, item in enumerate(items_left):
    y = Inches(2.2 + i * 0.55)
    add_rect(slide, Inches(1.0), y, Inches(0.12), Inches(0.12), TW_GREEN)
    add_text_box(slide, Inches(1.3), y - Inches(0.05), Inches(5), Inches(0.3), item, 14, color=TW_GRAY_DARK)

for i, item in enumerate(items_right):
    y = Inches(2.2 + i * 0.55)
    add_rect(slide, Inches(7.0), y, Inches(0.12), Inches(0.12), TW_GREEN)
    add_text_box(slide, Inches(7.3), y - Inches(0.05), Inches(5), Inches(0.3), item, 14, color=TW_GRAY_DARK)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 3: CONTEXTE
# ══════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_green_bar(slide)
add_logo(slide)
add_section_label(slide, "01 — CONTEXTE")
add_slide_title(slide, "Contexte et Sujet du Stage")
add_slide_subtitle(slide, "Stage PFE de 6 mois au sein de Teamwill")
add_footer(slide, 3)

make_card(slide, Inches(0.7), Inches(2.2), Inches(5.7), Inches(2.2),
          "Teamwill",
          "Cabinet de conseil et d'expertise en cybersecurite, accompagnant ses clients dans la protection "
          "de leurs systemes d'information. Utilise Microsoft Sentinel comme SIEM principal pour la "
          "surveillance et la detection des menaces.",
          TW_GREEN, "TW")

make_card(slide, Inches(6.8), Inches(2.2), Inches(5.7), Inches(2.2),
          "Microsoft Sentinel",
          "Solution SIEM/SOAR cloud-native de Microsoft, deployee dans Azure. Collecte et analyse "
          "les logs de securite provenant de multiples sources : Azure AD, Defender, firewalls, endpoints.",
          TW_BLUE)

make_card(slide, Inches(0.7), Inches(4.7), Inches(5.7), Inches(2.0),
          "Security Operations Center (SOC)",
          "Le SOC de Teamwill gere quotidiennement un volume important d'alertes et d'incidents "
          "de securite provenant de Microsoft Sentinel, necessitant un traitement rapide et precis.",
          TW_ORANGE)

make_card(slide, Inches(6.8), Inches(4.7), Inches(5.7), Inches(2.0),
          "Objectif du Stage",
          "Concevoir et implementer une solution intelligente pour automatiser le traitement, "
          "la classification et l'orchestration des incidents Sentinel a l'aide de n8n et de l'IA.",
          TW_PURPLE)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 4: PROBLEMATIQUE
# ══════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, DARK_BG)
add_green_bar(slide)
add_logo(slide, dark=True)
add_section_label(slide, "02 — CONSTAT", dark=True)
add_slide_title(slide, "Constat et Problematique", dark=True)
add_slide_subtitle(slide, "Les defis actuels du SOC", dark=True)
add_footer(slide, 4, dark=True)

make_dark_card(slide, Inches(0.7), Inches(2.2), Inches(3.7), Inches(2.8),
               "Alert Fatigue",
               ["Volume massif d'alertes quotidiennes",
                "generant une fatigue des analystes.",
                "Beaucoup d'alertes sont des faux",
                "positifs, diluant l'attention sur",
                "les vraies menaces."],
               TW_RED, border_left=True)

make_dark_card(slide, Inches(4.8), Inches(2.2), Inches(3.7), Inches(2.8),
               "Temps de Reponse",
               ["Le traitement manuel des incidents",
                "allonge le MTTD et MTTR.",
                "Les delais de reponse compromettent",
                "la posture de securite et augmentent",
                "le risque d'impact."],
               TW_ORANGE, border_left=True)

make_dark_card(slide, Inches(8.9), Inches(2.2), Inches(3.7), Inches(2.8),
               "Manque de Contexte",
               ["Les analystes manquent d'enrichissement",
                "automatique : pas de classification",
                "MITRE, pas de scoring de risque,",
                "pas de recommandations basees",
                "sur l'historique."],
               TW_PURPLE, border_left=True)

# Problematique box
prob = add_rounded_rect(slide, Inches(0.7), Inches(5.3), Inches(11.9), Inches(1.4),
                        RGBColor(0x25, 0x2B, 0x1A), TW_GREEN)
add_text_box(slide, Inches(1.0), Inches(5.4), Inches(3), Inches(0.25),
             "PROBLEMATIQUE", 9, bold=True, color=TW_GREEN_LIGHT)
add_text_box(slide, Inches(1.0), Inches(5.75), Inches(11.3), Inches(0.8),
             "Comment automatiser et optimiser le traitement des logs et incidents Microsoft Sentinel "
             "afin d'ameliorer la reactivite et la qualite des decisions SOC ?",
             15, color=WHITE)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 5: ETUDE DE L'EXISTANT
# ══════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_green_bar(slide)
add_logo(slide)
add_section_label(slide, "03 — ETUDE DE L'EXISTANT")
add_slide_title(slide, "Etude de l'Existant")
add_slide_subtitle(slide, "Analyse des solutions actuelles et leurs limites")
add_footer(slide, 5)

# Table header
cols = [
    (Inches(0.7), Inches(2.5)),
    (Inches(3.7), Inches(3.2)),
    (Inches(6.2), Inches(3.2)),
    (Inches(9.2), Inches(3.5)),
]
headers = ["Solution", "Description", "Avantages", "Limites"]
for (x, w), h in zip(cols, headers):
    rect = add_rect(slide, x, Inches(2.2), w, Inches(0.4), TW_GREEN)
    add_text_box(slide, x + Inches(0.1), Inches(2.22), w - Inches(0.2), Inches(0.35),
                 h, 11, bold=True, color=WHITE)

rows_data = [
    ["Microsoft Sentinel", "SIEM cloud-native Azure avec regles analytiques", "Integration Azure native, detection temps reel", "Pas de ML personnalise, orchestration limitee"],
    ["SOAR Classiques\n(XSOAR, Splunk)", "Plateformes d'orchestration et reponse automatisee", "Workflows avances, larges integrations", "Cout eleve, complexite, pas d'IA"],
    ["Traitement Manuel", "Triage et analyse par les analystes SOC", "Expertise humaine, jugement contextuel", "Lent, non scalable, sujet aux erreurs"],
    ["Scripts & Playbooks", "Automatisation via Logic Apps / scripts Python", "Personnalisable, cout reduit", "Pas de vision globale, maintenance lourde"],
]

for r, row in enumerate(rows_data):
    y_val = Inches(2.65 + r * 0.65)
    bg_c = RGBColor(0xFA, 0xFB, 0xF7) if r % 2 == 1 else WHITE
    for (x, w), val in zip(cols, row):
        add_rect(slide, x, y_val, w, Inches(0.6), bg_c)
        fs = 10 if len(val) > 40 else 11
        add_text_box(slide, x + Inches(0.1), y_val + Inches(0.05), w - Inches(0.2), Inches(0.5),
                     val, fs, color=TW_GRAY_DARK)

# Constat box
constat = add_rounded_rect(slide, Inches(0.7), Inches(5.5), Inches(11.9), Inches(1.1),
                           RGBColor(0xFE, 0xF3, 0xC7), RGBColor(0xFB, 0xBF, 0x24))
add_text_box(slide, Inches(1.0), Inches(5.6), Inches(3), Inches(0.2),
             "CONSTAT CLE", 9, bold=True, color=RGBColor(0x92, 0x40, 0x0E))
add_text_box(slide, Inches(1.0), Inches(5.85), Inches(11.3), Inches(0.6),
             "Aucune solution existante ne combine classification IA, scoring de risque LLM, "
             "detection de faux positifs ML et recommandations RAG dans un pipeline unifie.",
             12, color=RGBColor(0x78, 0x35, 0x0F))


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 6: SOLUTION PROPOSEE
# ══════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_green_bar(slide)
add_logo(slide)
add_section_label(slide, "04 — SOLUTION PROPOSEE")
add_slide_title(slide, "Solution Proposee")
add_slide_subtitle(slide, "Une plateforme SOC intelligente integrant IA, ML et orchestration")
add_footer(slide, 6)

services = [
    (Inches(0.7), "Classification Alertes", ":8001", "Classification MITRE ATT&CK\n16 categories, 4 priorites P1-P4\nResolution : TECHNIQUE > TACTIQUE > MOTS-CLES", TW_BLUE, "FastAPI  |  MITRE  |  Rules"),
    (Inches(3.8), "Detection Faux Positifs", ":8005", "Modele ML hybride TF-IDF + Metadata\nXGBoost / Random Forest / LightGBM\nSortie: TP | FP | BP + confiance", TW_PURPLE, "XGBoost  |  TF-IDF  |  SMOTE"),
    (Inches(6.9), "Risk Scoring LLM", ":8002", "Score de risque 0-100 via LLM\nDecomposition severity + context + frequency\nChain: Gemini > Groq > OpenAI", TW_ORANGE, "Gemini  |  LLaMA  |  SLA"),
    (Inches(10.0), "RAG Recommandations", ":8000", "Recherche hybride Keyword + Semantique\nEmbeddings + Vote KNN\nFallback LLM (LLaMA 3 8B)", TW_GREEN, "RAG  |  Embeddings  |  KNN"),
]

for x, title, port, desc, color, tech in services:
    # Card background
    card = add_rounded_rect(slide, x, Inches(2.2), Inches(2.8), Inches(3.0), WHITE, RGBColor(0xE5, 0xE7, 0xEB))
    # Left accent border
    add_rect(slide, x, Inches(2.3), Pt(4), Inches(2.8), color)
    # Port
    add_text_box(slide, x + Inches(0.2), Inches(2.3), Inches(1), Inches(0.2), f"PORT {port}", 8, bold=True, color=TW_GRAY_LIGHT)
    # Title
    add_text_box(slide, x + Inches(0.2), Inches(2.55), Inches(2.4), Inches(0.3), title, 12, bold=True, color=TW_GRAY_DARK)
    # Description
    add_text_box(slide, x + Inches(0.2), Inches(2.9), Inches(2.4), Inches(1.5), desc, 9, color=TW_GRAY_LIGHT)
    # Tech tags
    add_text_box(slide, x + Inches(0.2), Inches(4.6), Inches(2.4), Inches(0.3), tech, 8, bold=True, color=color)

# Flow pipeline at bottom
flow_items = [
    ("Sentinel CSV", TW_BLUE),
    ("n8n Webhook", TW_ORANGE),
    ("Classification", TW_PURPLE),
    ("RAG Analyse", TW_GREEN),
    ("Risk Score", TW_ORANGE),
    ("Plateforme Web", TW_GREEN),
    ("Supabase", TW_RED),
]
start_x = 0.5
for i, (label, color) in enumerate(flow_items):
    x = Inches(start_x + i * 1.8)
    box = add_rounded_rect(slide, x, Inches(5.7), Inches(1.5), Inches(0.45), WHITE, color)
    add_text_box(slide, x + Inches(0.05), Inches(5.72), Inches(1.4), Inches(0.4),
                 label, 9, bold=True, color=color, align=PP_ALIGN.CENTER)
    if i < len(flow_items) - 1:
        add_text_box(slide, x + Inches(1.5), Inches(5.7), Inches(0.3), Inches(0.45),
                     ">", 16, color=TW_GRAY_LIGHT, align=PP_ALIGN.CENTER)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 7: ARCHITECTURE
# ══════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, DARK_BG)
add_green_bar(slide)
add_logo(slide, dark=True)
add_section_label(slide, "05 — ARCHITECTURE", dark=True)
add_slide_title(slide, "Architecture Technique", dark=True)
add_slide_subtitle(slide, "Architecture microservices avec orchestration n8n", dark=True)
add_footer(slide, 7, dark=True)

layers = [
    ("SOURCE DE DONNEES", Inches(2.1), [
        ("Microsoft Sentinel (Logs & Incidents CSV)", TW_BLUE, Inches(4.5), Inches(4.0)),
    ]),
    ("COUCHE ORCHESTRATION", Inches(3.2), [
        ("n8n Workflow (Webhook + Sequenceur)", TW_ORANGE, Inches(3.5), Inches(3.0)),
        ("Alert Sequencer (Node.js)", TW_ORANGE, Inches(7.0), Inches(3.0)),
    ]),
    ("COUCHE INTELLIGENCE ARTIFICIELLE", Inches(4.3), [
        ("Classifier\n:8001 MITRE", TW_PURPLE, Inches(1.0), Inches(2.5)),
        ("RAG Agent\n:8000 Reco", TW_PURPLE, Inches(3.8), Inches(2.5)),
        ("Risk Scorer\n:8002 Gemini", TW_PURPLE, Inches(6.6), Inches(2.5)),
        ("SentinelML\n:8005 XGBoost", TW_PURPLE, Inches(9.4), Inches(2.5)),
    ]),
    ("COUCHE PRESENTATION & STOCKAGE", Inches(5.7), [
        ("Plateforme Web\nNext.js 16 + React 19", TW_GREEN, Inches(1.5), Inches(3.0)),
        ("Power BI\nDashboards", TW_GRAY_LIGHT, Inches(5.0), Inches(2.5)),
        ("Supabase\nPostgreSQL + Auth", TW_RED, Inches(8.0), Inches(3.0)),
    ]),
]

for layer_label, y_start, boxes in layers:
    add_text_box(slide, Inches(0.7), y_start - Inches(0.25), Inches(5), Inches(0.2),
                 layer_label, 8, bold=True, color=RGBColor(0x66, 0x66, 0x66))
    for label, color, x, w in boxes:
        box = add_rounded_rect(slide, x, y_start, w, Inches(0.65), RGBColor(0x2A, 0x2A, 0x3E), color)
        add_text_box(slide, x + Inches(0.1), y_start + Inches(0.05), w - Inches(0.2), Inches(0.55),
                     label, 10, bold=True, color=color, align=PP_ALIGN.CENTER)

# Arrows between layers
for y in [Inches(2.8), Inches(3.9), Inches(5.3)]:
    add_text_box(slide, Inches(6.2), y, Inches(1), Inches(0.3),
                 "v", 18, color=RGBColor(0x66, 0x66, 0x66), align=PP_ALIGN.CENTER)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 8: METHODOLOGIE & TECHNOLOGIES
# ══════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_green_bar(slide)
add_logo(slide)
add_section_label(slide, "06 — METHODOLOGIE")
add_slide_title(slide, "Methodologie et Technologies")
add_slide_subtitle(slide, "Approche Agile Scrum — 6 sprints sur 6 mois")
add_footer(slide, 8)

# Scrum card
make_card(slide, Inches(0.7), Inches(2.2), Inches(5.5), Inches(4.3),
          "Methodologie Scrum",
          "Developpement iteratif et incremental avec des sprints de 4 semaines.\n\n"
          "  Sprint Planning au debut de chaque iteration\n"
          "  Daily stand-ups et retrospectives\n"
          "  Revue de sprint avec les parties prenantes\n"
          "  Backlog produit priorise et gere\n"
          "  Livraisons regulieres et retours continus",
          TW_GREEN)

# Tech categories on the right
tech_categories = [
    ("FRONTEND", "Next.js 16 | React 19 | Tailwind CSS | Radix UI | Recharts | TypeScript", TW_GREEN),
    ("BACKEND & BDD", "FastAPI | Python | Supabase | PostgreSQL | Next.js API Routes", TW_BLUE),
    ("MACHINE LEARNING", "XGBoost | Random Forest | LightGBM | TF-IDF | SMOTE | CTGAN / SDV", TW_PURPLE),
    ("IA & LLM", "Gemini | LLaMA 3 | OpenAI Embeddings | RAG | Vercel AI SDK", TW_ORANGE),
    ("ORCHESTRATION & BI", "n8n | Power BI | MITRE ATT&CK | Azure MSAL", TW_RED),
]

for i, (cat, techs, color) in enumerate(tech_categories):
    y = Inches(2.2 + i * 0.85)
    add_text_box(slide, Inches(6.5), y, Inches(3), Inches(0.2), cat, 9, bold=True, color=color)
    add_text_box(slide, Inches(6.5), y + Inches(0.22), Inches(6), Inches(0.5), techs, 11, color=TW_GRAY_DARK)
    if i < len(tech_categories) - 1:
        add_rect(slide, Inches(6.5), y + Inches(0.7), Inches(6), Pt(1), RGBColor(0xE5, 0xE7, 0xEB))


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 9: SPRINTS
# ══════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, LIGHT_BG)
add_green_bar(slide)
add_logo(slide)
add_section_label(slide, "07 — PLANIFICATION")
add_slide_title(slide, "Planification en Sprints")
add_slide_subtitle(slide, "6 sprints iteratifs — Duree totale : 6 mois")
add_footer(slide, 9)

sprints = [
    ("S1", "Mois 1", "Analyse & Cadrage",
     "Etude de l'existant, analyse des besoins, specification fonctionnelle. Setup environnement."),
    ("S2", "Mois 2", "Ingestion & Base de Donnees",
     "Injection CSV Sentinel dans Supabase. Schema BDD (alerts, events, cases). Authentification."),
    ("S3", "Mois 3", "Plateforme Web",
     "Developpement Next.js : alertes, logs, cases, dashboards, playbooks. Systeme RBAC."),
    ("S4", "Mois 4", "Modeles ML",
     "Classification MITRE (16 categories). Detection faux positifs (XGBoost + TF-IDF + SMOTE)."),
    ("S5", "Mois 5", "Services IA & n8n",
     "APIs FastAPI (Risk Scorer, RAG). Workflow n8n (webhook, classification, scoring, stockage)."),
    ("S6", "Mois 6", "Power BI, Tests & Finalisation",
     "Integration Power BI, chatbot IA, tests E2E, remediation, documentation, optimisation."),
]

for i, (num, month, title, desc) in enumerate(sprints):
    col = i % 3
    row = i // 3
    x = Inches(0.7 + col * 4.1)
    y = Inches(2.2 + row * 2.5)

    # Sprint card
    card = add_rounded_rect(slide, x, y, Inches(3.8), Inches(2.1), WHITE, RGBColor(0xE5, 0xE7, 0xEB))

    # Sprint number circle
    circle = slide.shapes.add_shape(MSO_SHAPE.OVAL, x + Inches(0.15), y + Inches(0.15), Inches(0.4), Inches(0.4))
    circle.fill.solid()
    circle.fill.fore_color.rgb = TW_GREEN
    circle.line.fill.background()
    tf = circle.text_frame
    p = tf.paragraphs[0]
    p.text = num
    p.font.size = Pt(11)
    p.font.bold = True
    p.font.color.rgb = WHITE
    p.alignment = PP_ALIGN.CENTER

    # Month label
    add_text_box(slide, x + Inches(0.65), y + Inches(0.15), Inches(2), Inches(0.2),
                 month, 9, bold=True, color=TW_GREEN)
    # Title
    add_text_box(slide, x + Inches(0.65), y + Inches(0.38), Inches(3), Inches(0.3),
                 title, 13, bold=True, color=TW_GRAY_DARK)
    # Description
    add_text_box(slide, x + Inches(0.2), y + Inches(0.8), Inches(3.4), Inches(1.1),
                 desc, 10, color=TW_GRAY_LIGHT)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 10: TRAVAIL REALISE - PLATEFORME
# ══════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_green_bar(slide)
add_logo(slide)
add_section_label(slide, "08 — TRAVAIL REALISE")
add_slide_title(slide, "Plateforme Web SOC")
add_slide_subtitle(slide, "Application Next.js 16 avec plus de 15 modules fonctionnels")
add_footer(slide, 10)

modules = [
    ("Gestion des Alertes", "Consultation, filtrage multi-critere (severite, type, statut), recherche, vues sauvegardees, badges ML avec taux de confiance.", TW_BLUE),
    ("Gestion des Cas", "Creation de cas, notes, taches, preuves, timeline, hypotheses d'investigation, actions de reponse, tracking SLA.", TW_GREEN),
    ("Playbooks", "Bibliotheque avec versionning, etapes ordonnees (triage, investigation, containment), mode strict, approbation.", TW_PURPLE),
    ("Chatbot Sentinel AI", "Assistant IA specialise cybersecurite (GPT) avec expertise Azure Sentinel, MITRE ATT&CK, threat hunting.", TW_ORANGE),
    ("Remediation", "Dashboard avec recherche RAG, templates de scenarios, etapes de containment et validation, actions de reponse.", TW_RED),
    ("Administration", "Gestion des utilisateurs et roles (RBAC: admin, analyste, viewer). Auth Supabase + SSO Microsoft Entra ID.", TW_GRAY),
]

for i, (title, desc, color) in enumerate(modules):
    col = i % 3
    row = i // 3
    x = Inches(0.7 + col * 4.1)
    y = Inches(2.2 + row * 2.5)

    card = add_rounded_rect(slide, x, y, Inches(3.8), Inches(2.1), WHITE, RGBColor(0xE5, 0xE7, 0xEB))
    add_rect(slide, x, y + Inches(0.1), Pt(4), Inches(1.9), color)
    add_text_box(slide, x + Inches(0.25), y + Inches(0.2), Inches(3.3), Inches(0.3),
                 title, 14, bold=True, color=TW_GRAY_DARK)
    add_text_box(slide, x + Inches(0.25), y + Inches(0.6), Inches(3.3), Inches(1.3),
                 desc, 11, color=TW_GRAY_LIGHT)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 11: SERVICES IA/ML
# ══════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, DARK_BG)
add_green_bar(slide)
add_logo(slide, dark=True)
add_section_label(slide, "08 — TRAVAIL REALISE (SUITE)", dark=True)
add_slide_title(slide, "Services IA & Machine Learning", dark=True)
add_slide_subtitle(slide, "4 microservices FastAPI interconnectes", dark=True)
add_footer(slide, 11, dark=True)

ml_services = [
    ("Classification MITRE ATT&CK  (:8001)", [
        "16 categories (Email, Identity, Endpoint...)",
        "4 niveaux de priorite P1 (Critique) a P4",
        "Resolution : TECHNIQUE > TACTIQUE > MOTS-CLES",
        "Mapping MITRE ATT&CK v14 (14 tactiques)",
        "SLA par priorite (MTTD, MTTR)",
    ], TW_BLUE),
    ("Detection de Faux Positifs  (:8005)", [
        "TF-IDF sur Title + Description",
        "Metadata : severite, duree, heure, alertes",
        "XGBoost, Random Forest, LightGBM, LogReg",
        "Augmentation : SMOTE + CTGAN (SDV)",
        "Sortie : TP | FP | BP + confiance",
    ], TW_PURPLE),
    ("Risk Scoring LLM  (:8002)", [
        "Score 0-100 avec 4 niveaux de risque",
        "Decomposition : severity + asset + freq + ctx",
        "Analyse MITRE ATT&CK integree",
        "Chain: Gemini > Groq (LLaMA 70B) > OpenAI",
        "SLA auto : 15min | 1h | 24h",
    ], TW_ORANGE),
    ("RAG Recommandations  (:8000)", [
        "Recherche hybride : Keyword > Semantic > Broad",
        "Embeddings (text-embedding-3-small) Supabase",
        "Vote KNN pour classification par confiance",
        "Fallback LLM (LLaMA 3 8B) generation",
        "Sortie : remediation, containment, validation",
    ], TW_GREEN),
]

for i, (title, items, color) in enumerate(ml_services):
    col = i % 2
    row = i // 2
    x = Inches(0.7 + col * 6.2)
    y = Inches(2.2 + row * 2.5)

    card = add_rounded_rect(slide, x, y, Inches(5.8), Inches(2.2), RGBColor(0x2A, 0x2A, 0x3E))
    card.line.fill.background()
    add_rect(slide, x, y + Inches(0.1), Pt(4), Inches(2.0), color)

    add_text_box(slide, x + Inches(0.25), y + Inches(0.12), Inches(5.3), Inches(0.3),
                 title, 12, bold=True, color=WHITE)

    for j, item in enumerate(items):
        add_text_box(slide, x + Inches(0.4), y + Inches(0.5 + j * 0.3), Inches(5.1), Inches(0.28),
                     f"  {item}", 10, color=RGBColor(0xAA, 0xAA, 0xAA))
        # Bullet dot
        dot = slide.shapes.add_shape(MSO_SHAPE.OVAL, x + Inches(0.35), y + Inches(0.58 + j * 0.3), Pt(5), Pt(5))
        dot.fill.solid()
        dot.fill.fore_color.rgb = color
        dot.line.fill.background()


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 12: N8N + POWER BI
# ══════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_green_bar(slide)
add_logo(slide)
add_section_label(slide, "08 — TRAVAIL REALISE (SUITE)")
add_slide_title(slide, "Orchestration n8n & Power BI")
add_slide_subtitle(slide, "Pipeline automatise et tableaux de bord analytiques")
add_footer(slide, 12)

# n8n card
make_card(slide, Inches(0.7), Inches(2.2), Inches(5.7), Inches(4.3),
          "Workflow n8n",
          "Pipeline d'orchestration automatise :\n\n"
          "  1. Webhook — Reception des alertes (HTTP POST)\n"
          "  2. Classification — Appel service :8001 (MITRE)\n"
          "  3. Analyse RAG — Appel service :8000 (recommandations)\n"
          "  4. Risk Scoring — Appel service :8002 (LLM)\n"
          "  5. Notification — Envoi email Outlook\n"
          "  6. Stockage — Ecriture dans Supabase\n\n"
          "Alert Sequencer : script Node.js pour envoi\n"
          "sequentiel des alertes avec gestion d'etat.",
          TW_ORANGE)

# Power BI & Dashboard cards
make_card(slide, Inches(6.8), Inches(2.2), Inches(5.7), Inches(2.0),
          "Dashboard Power BI",
          "Rapports embarques dans la plateforme web :\n"
          "Vue d'ensemble, distribution severite/categorie,\n"
          "tendances temporelles, metriques SOC, sources d'attaque.",
          TW_BLUE)

make_card(slide, Inches(6.8), Inches(4.5), Inches(5.7), Inches(2.0),
          "Dashboard Analyste",
          "Jauge de risque, grading XGBoost par incident,\n"
          "mapping MITRE ATT&CK, export Excel avec mise en forme,\n"
          "filtres avances par classification et severite.",
          TW_GREEN)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 13: DEMONSTRATION
# ══════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, TW_GREEN)

# Title centered
add_text_box(slide, Inches(0), Inches(1.5), SLIDE_W, Inches(0.3),
             "09 — DEMONSTRATION", 10, bold=True, color=RGBColor(0xDD, 0xE8, 0xBB), align=PP_ALIGN.CENTER)
add_text_box(slide, Inches(0), Inches(2.0), SLIDE_W, Inches(0.8),
             "Demonstration en Direct", 44, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
add_text_box(slide, Inches(2), Inches(3.0), Inches(9), Inches(0.6),
             "Presentation live de la plateforme SOC, du pipeline n8n et des resultats des modeles IA/ML",
             16, color=RGBColor(0xDD, 0xE8, 0xBB), align=PP_ALIGN.CENTER)

demo_items = [
    ("Plateforme Web", "Alertes, Cas, Playbooks"),
    ("Pipeline n8n", "Workflow automatise"),
    ("IA & ML", "Classification, Scoring, RAG"),
    ("Power BI", "Dashboards analytiques"),
]
for i, (title, sub) in enumerate(demo_items):
    x = Inches(1.5 + i * 2.8)
    box = add_rounded_rect(slide, x, Inches(4.2), Inches(2.4), Inches(1.5),
                           RGBColor(0x7B, 0x8A, 0x3A))
    box.line.fill.background()
    add_text_box(slide, x + Inches(0.2), Inches(4.5), Inches(2.0), Inches(0.3),
                 title, 14, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    add_text_box(slide, x + Inches(0.2), Inches(4.85), Inches(2.0), Inches(0.3),
                 sub, 11, color=RGBColor(0xDD, 0xE8, 0xBB), align=PP_ALIGN.CENTER)

add_footer(slide, 13, dark=True)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 14: CONCLUSION
# ══════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, WHITE)
add_green_bar(slide)
add_logo(slide)
add_section_label(slide, "10 — CONCLUSION")
add_slide_title(slide, "Conclusion et Perspectives")
add_slide_subtitle(slide, "Bilan du projet et axes d'evolution")
add_footer(slide, 14)

# Bilan
add_text_box(slide, Inches(0.7), Inches(2.1), Inches(4), Inches(0.3),
             "Bilan — Objectifs Atteints", 14, bold=True, color=TW_GREEN)

bilan_items = [
    "Automatisation complete du pipeline via n8n",
    "Classification MITRE ATT&CK (16 categories, 4 priorites)",
    "Detection des faux positifs par ML hybride (XGBoost)",
    "Scoring de risque LLM avec SLA (Gemini, LLaMA)",
    "Recommandations RAG basees sur l'historique",
    "Plateforme web complete (cas, playbooks, dashboards)",
    "Power BI embarque pour visualisation et reporting",
]
for i, item in enumerate(bilan_items):
    y = Inches(2.5 + i * 0.38)
    dot = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(0.9), y + Inches(0.07), Pt(7), Pt(7))
    dot.fill.solid()
    dot.fill.fore_color.rgb = TW_GREEN
    dot.line.fill.background()
    add_text_box(slide, Inches(1.2), y, Inches(5), Inches(0.35), item, 11, color=TW_GRAY_DARK)

# Perspectives
add_text_box(slide, Inches(6.8), Inches(2.1), Inches(5), Inches(0.3),
             "Perspectives d'Evolution", 14, bold=True, color=TW_PURPLE)

perspectives = [
    ("Integration Temps Reel", "Connecter directement a l'API Microsoft Sentinel pour un traitement en temps reel.", TW_BLUE),
    ("Enrichissement Threat Intelligence", "Integration feeds CTI (VirusTotal, AbuseIPDB, MISP) pour enrichir les IOC.", TW_ORANGE),
    ("Apprentissage Continu", "Retraining periodique des modeles ML avec feedbacks analystes.", TW_PURPLE),
    ("Deploiement Cloud", "Conteneurisation Docker et deploiement Azure en production.", TW_GREEN),
]

for i, (title, desc, color) in enumerate(perspectives):
    y = Inches(2.5 + i * 1.1)
    card = add_rounded_rect(slide, Inches(6.8), y, Inches(5.7), Inches(0.9), WHITE, RGBColor(0xE5, 0xE7, 0xEB))
    add_rect(slide, Inches(6.8), y + Inches(0.05), Pt(4), Inches(0.8), color)
    add_text_box(slide, Inches(7.1), y + Inches(0.08), Inches(5.2), Inches(0.25),
                 title, 11, bold=True, color=TW_GRAY_DARK)
    add_text_box(slide, Inches(7.1), y + Inches(0.35), Inches(5.2), Inches(0.45),
                 desc, 10, color=TW_GRAY_LIGHT)


# ══════════════════════════════════════════════════════════════════════════════
# SLIDE 15: MERCI
# ══════════════════════════════════════════════════════════════════════════════
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, TW_GREEN)

add_text_box(slide, Inches(0), Inches(2.0), SLIDE_W, Inches(1.2),
             "Merci !", 64, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
add_text_box(slide, Inches(0), Inches(3.5), SLIDE_W, Inches(0.6),
             "Questions & Discussion", 22, color=RGBColor(0xDD, 0xE8, 0xBB), align=PP_ALIGN.CENTER)

# Logo at bottom
add_text_box(slide, Inches(5.7), Inches(5.0), Inches(0.5), Inches(0.5),
             "TW", 18, bold=True, color=RGBColor(0xDD, 0xE8, 0xBB), align=PP_ALIGN.CENTER)
add_text_box(slide, Inches(6.2), Inches(5.02), Inches(2), Inches(0.4),
             "Teamwill", 20, bold=True, color=WHITE, align=PP_ALIGN.LEFT)

add_text_box(slide, Inches(0), Inches(5.8), SLIDE_W, Inches(0.4),
             "Molka BENHMIDA — PFE 2025/2026", 13, color=RGBColor(0xCC, 0xD8, 0xAA), align=PP_ALIGN.CENTER)


# ══════════════════════════════════════════════════════════════════════════════
# SAVE
# ══════════════════════════════════════════════════════════════════════════════
output_path = os.path.join(os.path.expanduser("~"), "Documents", "presentation-pfe-teamwill.pptx")
prs.save(output_path)
print(f"Presentation saved to: {output_path}")
