# -*- coding: utf-8 -*-
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import matplotlib.patheffects as pe
import os

fig, ax = plt.subplots(1, 1, figsize=(18, 10))
ax.set_xlim(0, 18)
ax.set_ylim(0, 10)
ax.axis('off')
fig.patch.set_facecolor('#F8F9FA')

# ── Colors ──
TW_GREEN      = '#8B9A46'
TW_GREEN_L    = '#A3B35C'
TW_BLUE       = '#3B82F6'
TW_ORANGE     = '#F59E0B'
TW_PURPLE     = '#8B5CF6'
TW_RED        = '#EF4444'
TW_GRAY       = '#4A4A4A'
TW_GRAY_L     = '#6B6B6B'
WHITE         = '#FFFFFF'
LIGHT_BG      = '#F0F2E8'


def draw_box(ax, x, y, w, h, title, subtitle_lines,
             color, icon='', radius=0.35):
    # Shadow
    shadow = FancyBboxPatch((x + 0.07, y - 0.07), w, h,
                             boxstyle=f"round,pad=0,rounding_size={radius}",
                             linewidth=0, facecolor='#00000018', zorder=1)
    ax.add_patch(shadow)

    # Main box
    box = FancyBboxPatch((x, y), w, h,
                          boxstyle=f"round,pad=0,rounding_size={radius}",
                          linewidth=1.5, edgecolor=color,
                          facecolor=WHITE, zorder=2)
    ax.add_patch(box)

    # Top color bar
    bar = FancyBboxPatch((x, y + h - 0.55), w, 0.55,
                          boxstyle=f"round,pad=0,rounding_size={radius}",
                          linewidth=0, facecolor=color, zorder=3,
                          clip_on=True)
    ax.add_patch(bar)
    # Cover bottom rounded corners of bar
    ax.add_patch(plt.Rectangle((x, y + h - 0.55), w, 0.28,
                                facecolor=color, linewidth=0, zorder=3))

    # Icon + Title
    full_title = f"{icon}  {title}" if icon else title
    ax.text(x + w/2, y + h - 0.27, full_title,
            ha='center', va='center', fontsize=9.5, fontweight='bold',
            color=WHITE, zorder=4)

    # Subtitle lines
    total = len(subtitle_lines)
    for i, line in enumerate(subtitle_lines):
        ty = y + h - 0.85 - i * 0.42
        ax.text(x + w/2, ty, line,
                ha='center', va='center', fontsize=8.2,
                color=TW_GRAY, zorder=4, wrap=True)


def arrow(ax, x1, y1, x2, y2, color='#AAAAAA', style='->', lw=2):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle=style, color=color,
                                lw=lw, connectionstyle='arc3,rad=0.0'),
                zorder=5)


def arrow_curved(ax, x1, y1, x2, y2, color='#AAAAAA', rad=0.2, lw=2):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle='->', color=color,
                                lw=lw,
                                connectionstyle=f'arc3,rad={rad}'),
                zorder=5)


# ════════════════════════════════════════════════════
# ROW 1  (y ~ 5.8)
# ════════════════════════════════════════════════════
BW, BH = 2.8, 2.5

# 1. Source de données
draw_box(ax, 0.3, 5.8, BW, BH,
         'Source de Donnees', ['Microsoft Sentinel', '(Logs & Incidents)'],
         TW_BLUE)

# 2. Ingestion & Stockage
draw_box(ax, 3.7, 5.8, BW, BH,
         'Ingestion & Stockage', ['Supabase', 'PostgreSQL'],
         TW_RED)

# 3. Orchestration n8n
draw_box(ax, 7.1, 5.8, BW, BH,
         'Orchestration', ['n8n Workflow', 'Automatisation du pipeline'],
         TW_ORANGE)

# 4. Application Web
draw_box(ax, 10.5, 5.8, BW, BH,
         'Application Web',
         ['Next.js + React', 'Alertes | Cas | Playbooks', 'SSO / RBAC'],
         TW_GREEN)

# 5. Power BI
draw_box(ax, 13.9, 5.8, 3.8, BH,
         'Dashboards & Reporting',
         ['Power BI Embedded', 'KPIs & Indicateurs SOC'],
         TW_GRAY)

# ════════════════════════════════════════════════════
# ROW 2  (y ~ 1.8)  —  Services IA
# ════════════════════════════════════════════════════
AIW = 3.6

# Classification
draw_box(ax, 0.3, 1.5, AIW, 3.5,
         'Classification des Alertes',
         ['Referentiel MITRE ATT&CK', '13 categories metier',
          'Priorites P1 -> P4', 'FastAPI :8001'],
         TW_BLUE)

# XGBoost
draw_box(ax, 4.6, 1.5, AIW, 3.5,
         'Detection Faux Positifs',
         ['Modele XGBoost', 'Entraine sur logs Sentinel',
          'TP | FP | Benin', 'FastAPI :8005'],
         TW_PURPLE)

# Risk Scoring
draw_box(ax, 8.9, 1.5, AIW, 3.5,
         'Scoring de Risque',
         ['LLM (Gemini / LLaMA)', 'Score 0 -> 100',
          'SLA automatique', 'FastAPI :8002'],
         TW_ORANGE)

# RAG
draw_box(ax, 13.2, 1.5, AIW, 3.5,
         'Recommandations RAG',
         ['Recherche semantique', 'Base de connaissances',
          'Generation LLM', 'FastAPI :8000'],
         TW_GREEN)

# ════════════════════════════════════════════════════
# ARROWS ROW 1
# ════════════════════════════════════════════════════
# Source → Stockage
arrow(ax, 0.3 + BW, 5.8 + BH/2, 3.7, 5.8 + BH/2, TW_BLUE)
# Stockage → Orchestration
arrow(ax, 3.7 + BW, 5.8 + BH/2, 7.1, 5.8 + BH/2, TW_RED)
# Orchestration → App Web
arrow(ax, 7.1 + BW, 5.8 + BH/2, 10.5, 5.8 + BH/2, TW_ORANGE)
# App Web → Power BI
arrow(ax, 10.5 + BW, 5.8 + BH/2, 13.9, 5.8 + BH/2, TW_GREEN)

# ════════════════════════════════════════════════════
# ARROWS n8n → IA services (down)
# ════════════════════════════════════════════════════
n8n_cx = 7.1 + BW/2   # centre x de n8n

# n8n → Classification
arrow_curved(ax, n8n_cx, 5.8, 0.3 + AIW/2, 1.5 + 3.5, TW_ORANGE, rad=-0.25)
# n8n → XGBoost
arrow_curved(ax, n8n_cx, 5.8, 4.6 + AIW/2, 1.5 + 3.5, TW_ORANGE, rad=-0.1)
# n8n → Risk
arrow_curved(ax, n8n_cx, 5.8, 8.9 + AIW/2, 1.5 + 3.5, TW_ORANGE, rad=0.1)
# n8n → RAG
arrow_curved(ax, n8n_cx, 5.8, 13.2 + AIW/2, 1.5 + 3.5, TW_ORANGE, rad=0.25)

# ════════════════════════════════════════════════════
# TITLE & LEGEND
# ════════════════════════════════════════════════════
ax.text(9, 9.55, 'Architecture Globale de la Solution',
        ha='center', va='center', fontsize=15, fontweight='bold',
        color=TW_GRAY)
ax.text(9, 9.15, 'Plateforme Intelligente de Traitement des Incidents Microsoft Sentinel — Teamwill',
        ha='center', va='center', fontsize=10, color=TW_GRAY_L)

# Thin separator line
ax.plot([0.3, 17.7], [9.0, 9.0], color='#DDDDDD', lw=1, zorder=1)

# TW logo bottom right
tw_box = FancyBboxPatch((16.8, 0.2), 0.9, 0.6,
                         boxstyle="round,pad=0,rounding_size=0.12",
                         linewidth=1.5, edgecolor=TW_GREEN, facecolor=WHITE, zorder=5)
ax.add_patch(tw_box)
ax.text(17.25, 0.5, 'TW', ha='center', va='center',
        fontsize=9, fontweight='bold', color=TW_GREEN, zorder=6)

# ── Save ──
out = os.path.join(os.path.expanduser("~"), "Documents", "architecture_soc.png")
plt.tight_layout(pad=0.3)
plt.savefig(out, dpi=180, bbox_inches='tight',
            facecolor=fig.get_facecolor())
print(f"Saved: {out}")
plt.close()
