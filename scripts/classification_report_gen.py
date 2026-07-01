# -*- coding: utf-8 -*-
#!/usr/bin/env python3
"""
Classification Report Generator
Loads the trained XGBoost model and produces a full HTML report
on the Incident.csv test set.

Run: python -X utf8 scripts/classification_report_gen.py
"""

import warnings
warnings.filterwarnings("ignore")

import base64
import io
import os
from datetime import datetime

import joblib
import numpy as np
import pandas as pd

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import seaborn as sns

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, label_binarize
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    cohen_kappa_score,
    log_loss,
    confusion_matrix,
    classification_report,
    roc_auc_score,
    roc_curve,
    precision_recall_curve,
    average_precision_score,
    f1_score,
    matthews_corrcoef,
)

# ── paths ──────────────────────────────────────────────────────────────────────
DATA_PATH    = r"C:\Users\Molka\Downloads\Incident.csv"
MODEL_PATH   = r"scripts\xgboost_incident_model.pkl"
REPORT_PATH  = r"scripts\classification_report.html"

# ── helpers ────────────────────────────────────────────────────────────────────
def fig_to_b64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=130, bbox_inches="tight")
    buf.seek(0)
    return base64.b64encode(buf.read()).decode()

def _count_items(series: pd.Series) -> pd.Series:
    def _cnt(v):
        if pd.isna(v) or str(v).strip() in ("", "[]", "nan"):
            return 0
        return str(v).count(",") + 1
    return series.apply(_cnt)

# ── 1. load data & model ───────────────────────────────────────────────────────
print("[1] Loading model and data...")
artifact   = joblib.load(MODEL_PATH)
model      = artifact["model"]
target_le  = artifact["label_encoder"]
FEATURES   = artifact["features"]
CLASS_NAMES = target_le.classes_

df = pd.read_csv(DATA_PATH, low_memory=False)

TARGET_CLASSES = {"TruePositive", "BenignPositive", "FalsePositive"}
df = df.dropna(subset=["Classification"])
df = df[df["Classification"].isin(TARGET_CLASSES)].copy()

# ── 2. feature engineering (same pipeline as training) ────────────────────────
print("[2] Engineering features...")
dt_cols = {
    "FirstActivityTime [UTC]": None,
    "LastActivityTime [UTC]":  None,
    "CreatedTime [UTC]":       None,
    "ClosedTime [UTC]":        None,
}
for col in dt_cols:
    df[col] = pd.to_datetime(df[col], errors="coerce")

df["incident_duration_h"] = (
    df["ClosedTime [UTC]"] - df["CreatedTime [UTC]"]
).dt.total_seconds() / 3600
df["alert_span_h"] = (
    df["LastActivityTime [UTC]"] - df["FirstActivityTime [UTC]"]
).dt.total_seconds() / 3600

df["create_hour"]    = df["CreatedTime [UTC]"].dt.hour
df["create_day"]     = df["CreatedTime [UTC]"].dt.day
df["create_month"]   = df["CreatedTime [UTC]"].dt.month
df["create_weekday"] = df["CreatedTime [UTC]"].dt.weekday
df["first_activity_hour"]    = df["FirstActivityTime [UTC]"].dt.hour
df["first_activity_weekday"] = df["FirstActivityTime [UTC]"].dt.weekday

df["alert_count"]    = _count_items(df["AlertIds"])
df["bookmark_count"] = _count_items(df["BookmarkIds"])
df["rule_count"]     = _count_items(df["RelatedAnalyticRuleIds"])
df["title_len"]      = df["Title"].str.len().fillna(0).astype(int)
df["title_words"]    = df["Title"].str.split().str.len().fillna(0).astype(int)

for col in ["Severity", "ProviderName", "ModifiedBy", "SourceSystem"]:
    le = LabelEncoder()
    df[col + "_enc"] = le.fit_transform(df[col].astype(str))

X = df[FEATURES].fillna(-1).astype(float)
y = target_le.transform(df["Classification"])

# ── 3. reproduce same train/test split as benchmark ───────────────────────────
print("[3] Reproducing 80/20 stratified split (seed=42)...")
X_reset = X.reset_index(drop=True)
y_reset = y.copy()
df_reset = df.reset_index(drop=True)

_, X_test, _, y_test, _, idx_test = train_test_split(
    X_reset, y_reset, df_reset.index,
    test_size=0.2, random_state=42, stratify=y_reset
)

print(f"    Test set: {len(X_test)} rows")
print(f"    Distribution: {dict(zip(CLASS_NAMES, np.bincount(y_test)))}")

# ── 4. predictions ────────────────────────────────────────────────────────────
print("[4] Running predictions...")
y_pred  = model.predict(X_test)
y_proba = model.predict_proba(X_test)

# ── 5. core metrics ───────────────────────────────────────────────────────────
test_acc   = accuracy_score(y_test, y_pred)
bal_acc    = balanced_accuracy_score(y_test, y_pred)
kappa      = cohen_kappa_score(y_test, y_pred)
mcc        = matthews_corrcoef(y_test, y_pred)
test_loss  = log_loss(y_test, y_proba)
macro_f1   = f1_score(y_test, y_pred, average="macro")
weighted_f1 = f1_score(y_test, y_pred, average="weighted")
y_test_bin = label_binarize(y_test, classes=np.arange(len(CLASS_NAMES)))
per_auc    = roc_auc_score(y_test_bin, y_proba, average=None)
macro_auc  = roc_auc_score(y_test_bin, y_proba, average="macro")
per_ap     = [average_precision_score(y_test_bin[:, i], y_proba[:, i]) for i in range(len(CLASS_NAMES))]

cr_dict    = classification_report(y_test, y_pred, target_names=CLASS_NAMES, output_dict=True, zero_division=0)
cr_text    = classification_report(y_test, y_pred, target_names=CLASS_NAMES, zero_division=0)

print("\n--- CLASSIFICATION REPORT ---")
print(cr_text)
print(f"Balanced Accuracy : {bal_acc:.4f}")
print(f"Cohen's Kappa     : {kappa:.4f}")
print(f"Matthews CC       : {mcc:.4f}")
print(f"Macro AUC-ROC     : {macro_auc:.4f}")

# ── 6. plots ──────────────────────────────────────────────────────────────────
print("[5] Generating plots...")
PALETTE = {"BenignPositive": "#2196F3", "FalsePositive": "#FF9800", "TruePositive": "#4CAF50"}
COLORS  = [PALETTE.get(c, "#607D8B") for c in CLASS_NAMES]

# --- (a) confusion matrix ---
fig_cm, ax = plt.subplots(figsize=(6, 5))
cm = confusion_matrix(y_test, y_pred)
sns.heatmap(
    cm, annot=True, fmt="d", cmap="Blues", ax=ax,
    xticklabels=CLASS_NAMES, yticklabels=CLASS_NAMES,
    linewidths=0.5, linecolor="white",
)
ax.set_title("Confusion Matrix", fontsize=13, fontweight="bold", pad=12)
ax.set_xlabel("Predicted Label", fontsize=11)
ax.set_ylabel("True Label", fontsize=11)
plt.tight_layout()
b64_cm = fig_to_b64(fig_cm)
plt.close(fig_cm)

# --- (b) normalized confusion matrix ---
fig_ncm, ax2 = plt.subplots(figsize=(6, 5))
cm_norm = cm.astype(float) / cm.sum(axis=1, keepdims=True)
sns.heatmap(
    cm_norm, annot=True, fmt=".2f", cmap="Blues", ax=ax2,
    xticklabels=CLASS_NAMES, yticklabels=CLASS_NAMES,
    vmin=0, vmax=1, linewidths=0.5, linecolor="white",
)
ax2.set_title("Normalized Confusion Matrix", fontsize=13, fontweight="bold", pad=12)
ax2.set_xlabel("Predicted Label", fontsize=11)
ax2.set_ylabel("True Label", fontsize=11)
plt.tight_layout()
b64_ncm = fig_to_b64(fig_ncm)
plt.close(fig_ncm)

# --- (c) ROC curves ---
fig_roc, ax3 = plt.subplots(figsize=(7, 5))
for i, (cls, col) in enumerate(zip(CLASS_NAMES, COLORS)):
    fpr, tpr, _ = roc_curve(y_test_bin[:, i], y_proba[:, i])
    ax3.plot(fpr, tpr, color=col, lw=2,
             label=f"{cls}  (AUC = {per_auc[i]:.3f})")
ax3.plot([0, 1], [0, 1], "k--", lw=1)
ax3.set_xlabel("False Positive Rate", fontsize=11)
ax3.set_ylabel("True Positive Rate", fontsize=11)
ax3.set_title("ROC Curves (One-vs-Rest)", fontsize=13, fontweight="bold")
ax3.legend(fontsize=9, loc="lower right")
ax3.set_xlim([0, 1]); ax3.set_ylim([0, 1.02])
plt.tight_layout()
b64_roc = fig_to_b64(fig_roc)
plt.close(fig_roc)

# --- (d) Precision-Recall curves ---
fig_pr, ax4 = plt.subplots(figsize=(7, 5))
for i, (cls, col) in enumerate(zip(CLASS_NAMES, COLORS)):
    prec, rec, _ = precision_recall_curve(y_test_bin[:, i], y_proba[:, i])
    ax4.plot(rec, prec, color=col, lw=2,
             label=f"{cls}  (AP = {per_ap[i]:.3f})")
ax4.set_xlabel("Recall", fontsize=11)
ax4.set_ylabel("Precision", fontsize=11)
ax4.set_title("Precision-Recall Curves", fontsize=13, fontweight="bold")
ax4.legend(fontsize=9, loc="upper right")
ax4.set_xlim([0, 1]); ax4.set_ylim([0, 1.05])
plt.tight_layout()
b64_pr = fig_to_b64(fig_pr)
plt.close(fig_pr)

# --- (e) per-class metrics bar chart ---
fig_bar, axes5 = plt.subplots(1, 3, figsize=(14, 4), sharey=False)
metrics_names = ["Precision", "Recall", "F1-Score"]
for mi, metric in enumerate(["precision", "recall", "f1-score"]):
    vals = [cr_dict[cls][metric] for cls in CLASS_NAMES]
    bars = axes5[mi].bar(CLASS_NAMES, vals, color=COLORS, alpha=0.85, edgecolor="white")
    axes5[mi].set_ylim(0, 1.15)
    axes5[mi].set_title(metrics_names[mi], fontsize=12, fontweight="bold")
    axes5[mi].set_xticklabels(CLASS_NAMES, rotation=15, ha="right", fontsize=9)
    for bar, val in zip(bars, vals):
        axes5[mi].text(bar.get_x() + bar.get_width() / 2,
                       bar.get_height() + 0.02, f"{val:.3f}",
                       ha="center", va="bottom", fontsize=9, fontweight="bold")
plt.suptitle("Per-Class Performance Metrics", fontsize=13, fontweight="bold", y=1.02)
plt.tight_layout()
b64_bar = fig_to_b64(fig_bar)
plt.close(fig_bar)

# --- (f) feature importance ---
fig_fi, ax6 = plt.subplots(figsize=(8, 5))
importances = pd.Series(model.feature_importances_, index=FEATURES).sort_values()
colors_fi   = ["#1565C0" if v >= importances.quantile(0.66)
                else "#42A5F5" if v >= importances.quantile(0.33)
                else "#BBDEFB" for v in importances]
importances.plot(kind="barh", ax=ax6, color=colors_fi, edgecolor="white")
ax6.set_title("XGBoost Feature Importance", fontsize=13, fontweight="bold")
ax6.set_xlabel("Importance Score", fontsize=11)
ax6.axvline(importances.mean(), color="red", linestyle="--", lw=1.2, label=f"Mean = {importances.mean():.4f}")
ax6.legend(fontsize=9)
plt.tight_layout()
b64_fi = fig_to_b64(fig_fi)
plt.close(fig_fi)

# --- (g) probability distribution per class ---
fig_prob, axes7 = plt.subplots(1, 3, figsize=(15, 4))
for i, (cls, col) in enumerate(zip(CLASS_NAMES, COLORS)):
    mask_correct = (y_test == i) & (y_pred == i)
    mask_wrong   = (y_test == i) & (y_pred != i)
    axes7[i].hist(y_proba[y_test == i, i], bins=20, color=col, alpha=0.7, label="All true")
    axes7[i].hist(y_proba[mask_correct, i], bins=20, color="green", alpha=0.5, label="Correct")
    axes7[i].hist(y_proba[mask_wrong,   i], bins=20, color="red",   alpha=0.5, label="Wrong")
    axes7[i].set_title(f"{cls}", fontsize=11, fontweight="bold")
    axes7[i].set_xlabel("Predicted Probability", fontsize=9)
    axes7[i].set_ylabel("Count", fontsize=9)
    axes7[i].legend(fontsize=8)
plt.suptitle("Predicted Probability Distribution per Class", fontsize=13, fontweight="bold", y=1.02)
plt.tight_layout()
b64_prob = fig_to_b64(fig_prob)
plt.close(fig_prob)

# ── 7. build HTML report ──────────────────────────────────────────────────────
print("[6] Building HTML report...")

def metric_card(label, value, color="#1976D2"):
    return f"""
    <div class="card">
        <div class="card-value" style="color:{color}">{value}</div>
        <div class="card-label">{label}</div>
    </div>"""

def cls_row(cls_name, d, auc, ap, color):
    return f"""
    <tr>
        <td><span class="badge" style="background:{color}">{cls_name}</span></td>
        <td>{d['precision']:.4f}</td>
        <td>{d['recall']:.4f}</td>
        <td>{d['f1-score']:.4f}</td>
        <td>{int(d['support'])}</td>
        <td>{auc:.4f}</td>
        <td>{ap:.4f}</td>
    </tr>"""

CLS_COLORS = {"BenignPositive": "#1565C0", "FalsePositive": "#E65100", "TruePositive": "#2E7D32"}

rows_html = "".join(
    cls_row(cls, cr_dict[cls], per_auc[i], per_ap[i], CLS_COLORS.get(cls, "#607D8B"))
    for i, cls in enumerate(CLASS_NAMES)
)

html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Rapport de Classification - XGBoost Incidents</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #f5f7fa; color: #212121; }}
  .header {{ background: linear-gradient(135deg, #1565C0, #0D47A1); color: white; padding: 36px 48px; }}
  .header h1 {{ font-size: 26px; font-weight: 700; letter-spacing: 0.5px; }}
  .header .sub {{ font-size: 14px; opacity: 0.85; margin-top: 6px; }}
  .header .meta {{ font-size: 12px; opacity: 0.7; margin-top: 4px; }}
  .content {{ max-width: 1200px; margin: 0 auto; padding: 32px 24px; }}
  h2 {{ font-size: 18px; font-weight: 600; color: #1565C0; border-left: 4px solid #1565C0;
        padding-left: 10px; margin: 32px 0 16px; }}
  h3 {{ font-size: 15px; font-weight: 600; color: #37474F; margin: 20px 0 10px; }}
  /* summary cards */
  .cards {{ display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 8px; }}
  .card {{ background: white; border-radius: 10px; padding: 18px 22px; min-width: 150px;
           box-shadow: 0 2px 8px rgba(0,0,0,.08); flex: 1; text-align: center; }}
  .card-value {{ font-size: 28px; font-weight: 700; }}
  .card-label {{ font-size: 11px; color: #78909C; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }}
  /* table */
  .table-wrap {{ overflow-x: auto; }}
  table {{ width: 100%; border-collapse: collapse; background: white;
           border-radius: 10px; overflow: hidden;
           box-shadow: 0 2px 8px rgba(0,0,0,.08); }}
  th {{ background: #1565C0; color: white; padding: 12px 16px; font-size: 13px; text-align: left; }}
  td {{ padding: 11px 16px; font-size: 13px; border-bottom: 1px solid #ECEFF1; }}
  tr:last-child td {{ border-bottom: none; }}
  tr:hover td {{ background: #F5F7FA; }}
  .badge {{ display: inline-block; padding: 3px 10px; border-radius: 12px;
            color: white; font-size: 12px; font-weight: 600; }}
  /* plots */
  .plot-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 4px; }}
  .plot-full  {{ grid-column: 1 / -1; }}
  .plot-box {{ background: white; border-radius: 10px; padding: 16px;
               box-shadow: 0 2px 8px rgba(0,0,0,.08); text-align: center; }}
  .plot-box img {{ max-width: 100%; height: auto; border-radius: 6px; }}
  /* code block */
  pre {{ background: #263238; color: #ECEFF1; padding: 20px; border-radius: 8px;
         font-size: 12.5px; line-height: 1.7; overflow-x: auto;
         box-shadow: 0 2px 8px rgba(0,0,0,.15); }}
  .footer {{ text-align: center; padding: 24px; color: #90A4AE; font-size: 12px;
             margin-top: 32px; border-top: 1px solid #ECEFF1; }}
</style>
</head>
<body>

<div class="header">
  <h1>Rapport de Classification &mdash; XGBoost</h1>
  <div class="sub">Prediction d'incidents de securite : TruePositive / BenignPositive / FalsePositive</div>
  <div class="meta">
    Dataset : Incident.csv &nbsp;|&nbsp;
    Modele  : XGBoost (max_depth=15, n_estimators=200, lr=0.3) &nbsp;|&nbsp;
    Date    : {datetime.now().strftime("%d/%m/%Y %H:%M")}
  </div>
</div>

<div class="content">

  <!-- ── OVERVIEW CARDS ── -->
  <h2>Vue d'ensemble</h2>
  <div class="cards">
    {metric_card("Accuracy", f"{test_acc*100:.2f}%", "#1976D2")}
    {metric_card("Balanced Accuracy", f"{bal_acc*100:.2f}%", "#388E3C")}
    {metric_card("Macro F1", f"{macro_f1:.4f}", "#F57C00")}
    {metric_card("Macro AUC-ROC", f"{macro_auc:.4f}", "#7B1FA2")}
    {metric_card("Cohen's Kappa", f"{kappa:.4f}", "#00838F")}
    {metric_card("Log-Loss", f"{test_loss:.4f}", "#C62828")}
    {metric_card("MCC", f"{mcc:.4f}", "#37474F")}
    {metric_card("Test Samples", f"{len(y_test)}", "#455A64")}
  </div>

  <!-- ── PER-CLASS TABLE ── -->
  <h2>Metriques par classe</h2>
  <div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Classe</th>
        <th>Precision</th>
        <th>Rappel</th>
        <th>F1-Score</th>
        <th>Support</th>
        <th>AUC-ROC</th>
        <th>Avg Precision</th>
      </tr>
    </thead>
    <tbody>
      {rows_html}
    </tbody>
    <tfoot>
      <tr style="background:#E3F2FD; font-weight:600;">
        <td>Macro Avg</td>
        <td>{cr_dict["macro avg"]["precision"]:.4f}</td>
        <td>{cr_dict["macro avg"]["recall"]:.4f}</td>
        <td>{cr_dict["macro avg"]["f1-score"]:.4f}</td>
        <td>{int(cr_dict["macro avg"]["support"])}</td>
        <td>{macro_auc:.4f}</td>
        <td>{np.mean(per_ap):.4f}</td>
      </tr>
      <tr style="background:#E8F5E9; font-weight:600;">
        <td>Weighted Avg</td>
        <td>{cr_dict["weighted avg"]["precision"]:.4f}</td>
        <td>{cr_dict["weighted avg"]["recall"]:.4f}</td>
        <td>{cr_dict["weighted avg"]["f1-score"]:.4f}</td>
        <td>{int(cr_dict["weighted avg"]["support"])}</td>
        <td>-</td>
        <td>-</td>
      </tr>
    </tfoot>
  </table>
  </div>

  <!-- ── CONFUSION MATRICES ── -->
  <h2>Matrices de Confusion</h2>
  <div class="plot-grid">
    <div class="plot-box">
      <h3>Comptages bruts</h3>
      <img src="data:image/png;base64,{b64_cm}" alt="Confusion Matrix">
    </div>
    <div class="plot-box">
      <h3>Normalisee (par ligne)</h3>
      <img src="data:image/png;base64,{b64_ncm}" alt="Normalized Confusion Matrix">
    </div>
  </div>

  <!-- ── ROC & PR CURVES ── -->
  <h2>Courbes ROC &amp; Precision-Rappel</h2>
  <div class="plot-grid">
    <div class="plot-box">
      <h3>ROC Curves (One-vs-Rest)</h3>
      <img src="data:image/png;base64,{b64_roc}" alt="ROC Curves">
    </div>
    <div class="plot-box">
      <h3>Precision-Recall Curves</h3>
      <img src="data:image/png;base64,{b64_pr}" alt="PR Curves">
    </div>
  </div>

  <!-- ── PER-CLASS METRICS BAR ── -->
  <h2>Precision / Rappel / F1 par classe</h2>
  <div class="plot-box plot-full">
    <img src="data:image/png;base64,{b64_bar}" alt="Per-class metrics">
  </div>

  <!-- ── FEATURE IMPORTANCE ── -->
  <h2>Importance des Features</h2>
  <div class="plot-box plot-full">
    <img src="data:image/png;base64,{b64_fi}" alt="Feature Importance">
  </div>

  <!-- ── PROBABILITY DISTRIBUTIONS ── -->
  <h2>Distribution des Probabilites Predites</h2>
  <div class="plot-box plot-full">
    <img src="data:image/png;base64,{b64_prob}" alt="Probability Distributions">
  </div>

  <!-- ── RAW REPORT ── -->
  <h2>Rapport brut (sklearn)</h2>
  <pre>{cr_text}
Balanced Accuracy  : {bal_acc:.4f}
Cohen's Kappa      : {kappa:.4f}
Matthews Corr Coef : {mcc:.4f}
Log-Loss           : {test_loss:.4f}
Macro AUC-ROC      : {macro_auc:.4f}

AUC-ROC par classe :
  BenignPositive   {per_auc[0]:.4f}   (AP = {per_ap[0]:.4f})
  FalsePositive    {per_auc[1]:.4f}   (AP = {per_ap[1]:.4f})
  TruePositive     {per_auc[2]:.4f}   (AP = {per_ap[2]:.4f})</pre>

  <!-- ── HYPERPARAMETERS ── -->
  <h2>Hyperparametres du modele</h2>
  <pre>colsample_bytree : 0.8
learning_rate    : 0.3
max_depth        : 15
n_estimators     : 200
objective        : multi:softprob
num_class        : 3
reg_lambda       : 1.0
subsample        : 0.8
eval_metric      : mlogloss</pre>

</div>

<div class="footer">
  Sentinel Log Viewer &mdash; XGBoost Security Incident Classifier &mdash;
  Genere le {datetime.now().strftime("%d/%m/%Y a %H:%M")}
</div>

</body>
</html>"""

with open(REPORT_PATH, "w", encoding="utf-8") as f:
    f.write(html)

print(f"\n[7] HTML report saved : {REPORT_PATH}")
print("    Open it in your browser to view the full report.")
print("\nDone.")
