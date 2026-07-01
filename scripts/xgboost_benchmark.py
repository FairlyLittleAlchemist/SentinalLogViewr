# -*- coding: utf-8 -*-
#!/usr/bin/env python3
"""
XGBoost Benchmarking Script - Security Incident Classification
Methodology from: microsoft-security-incident.ipynb
Dataset       : C:/Users/Molka/Downloads/Incident.csv
Target        : Classification (TruePositive | BenignPositive | FalsePositive)

Run: python scripts/xgboost_benchmark.py
"""

import warnings
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")          # headless-safe; swap to "TkAgg" if you want live windows
import matplotlib.pyplot as plt
import seaborn as sns

from sklearn.preprocessing import LabelEncoder, label_binarize
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.metrics import (
    accuracy_score,
    log_loss,
    confusion_matrix,
    classification_report,
    roc_auc_score,
)
from xgboost import XGBClassifier
import joblib

# ── paths ─────────────────────────────────────────────────────────────────────
DATA_PATH   = r"C:\Users\Molka\Downloads\Incident.csv"
OUTPUT_IMG  = r"scripts\xgboost_benchmark_results.png"
OUTPUT_MODEL = r"scripts\xgboost_incident_model.pkl"

# ── 1. load ───────────────────────────────────────────────────────────────────
print("=" * 65)
print("  XGBoost Benchmarking  -  Security Incident Classification")
print("=" * 65)

df = pd.read_csv(DATA_PATH, low_memory=False)
print(f"\n[1] Loaded  {len(df):,} rows × {len(df.columns)} columns")

# ── 2. filter: keep only labelled TP / BP / FP rows ───────────────────────────
TARGET_CLASSES = {"TruePositive", "BenignPositive", "FalsePositive"}
df = df.dropna(subset=["Classification"])
df = df[df["Classification"].isin(TARGET_CLASSES)].copy()
print(f"[2] Classified rows (TP/BP/FP): {len(df):,}")
print(df["Classification"].value_counts().to_string())

# ── 3. datetime parsing ───────────────────────────────────────────────────────
dt_cols = {
    "first_activity": "FirstActivityTime [UTC]",
    "last_activity":  "LastActivityTime [UTC]",
    "created":        "CreatedTime [UTC]",
    "closed":         "ClosedTime [UTC]",
}
for key, col in dt_cols.items():
    df[col] = pd.to_datetime(df[col], errors="coerce")

# ── 4. feature engineering ────────────────────────────────────────────────────
# - durations
df["incident_duration_h"] = (
    df["ClosedTime [UTC]"] - df["CreatedTime [UTC]"]
).dt.total_seconds() / 3600

df["alert_span_h"] = (
    df["LastActivityTime [UTC]"] - df["FirstActivityTime [UTC]"]
).dt.total_seconds() / 3600

# - temporal from creation timestamp
for part, func in [
    ("create_hour",    lambda s: s.dt.hour),
    ("create_day",     lambda s: s.dt.day),
    ("create_month",   lambda s: s.dt.month),
    ("create_weekday", lambda s: s.dt.weekday),
]:
    df[part] = func(df["CreatedTime [UTC]"])

df["first_activity_hour"]    = df["FirstActivityTime [UTC]"].dt.hour
df["first_activity_weekday"] = df["FirstActivityTime [UTC]"].dt.weekday

# - count-based (parse JSON-array strings)
def _count_items(series: pd.Series) -> pd.Series:
    def _cnt(v):
        if pd.isna(v) or str(v).strip() in ("", "[]", "nan"):
            return 0
        return str(v).count(",") + 1
    return series.apply(_cnt)

df["alert_count"]    = _count_items(df["AlertIds"])
df["bookmark_count"] = _count_items(df["BookmarkIds"])
df["rule_count"]     = _count_items(df["RelatedAnalyticRuleIds"])

# - text length proxies
df["title_len"]   = df["Title"].str.len().fillna(0).astype(int)
df["title_words"] = df["Title"].str.split().str.len().fillna(0).astype(int)

# - categorical encoding (same approach as notebook: LabelEncoder per column)
label_encoders: dict = {}
CAT_COLS = ["Severity", "ProviderName", "ModifiedBy", "SourceSystem"]
for col in CAT_COLS:
    le = LabelEncoder()
    df[col + "_enc"] = le.fit_transform(df[col].astype(str))
    label_encoders[col] = le

# ── 5. feature matrix & target ────────────────────────────────────────────────
FEATURES = [
    "Severity_enc", "ProviderName_enc", "ModifiedBy_enc", "SourceSystem_enc",
    "IncidentNumber",
    "incident_duration_h", "alert_span_h",
    "create_hour", "create_day", "create_month", "create_weekday",
    "first_activity_hour", "first_activity_weekday",
    "alert_count", "bookmark_count", "rule_count",
    "title_len", "title_words",
]

X = df[FEATURES].fillna(-1).astype(float)

target_le = LabelEncoder()
y = target_le.fit_transform(df["Classification"])
CLASS_NAMES = target_le.classes_
N_CLASSES   = len(CLASS_NAMES)

print(f"\n[3] Features : {len(FEATURES)}")
print(f"    Classes  : {CLASS_NAMES}  (n={N_CLASSES})")

# ── 6. train / test split (80/20 stratified) ──────────────────────────────────
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)
print(f"\n[4] Split - train: {len(X_train):,}  test: {len(X_test):,}")

# ── 7. XGBoost - best hyper-params from notebook ─────────────────────────────
BEST_PARAMS = dict(
    colsample_bytree = 0.8,
    learning_rate    = 0.3,
    max_depth        = 15,
    n_estimators     = 200,
    objective        = "multi:softprob",   # softprob gives proper probabilities
    num_class        = N_CLASSES,
    reg_lambda       = 1.0,
    subsample        = 0.8,
    eval_metric      = "mlogloss",
    random_state     = 42,
    verbosity        = 0,
)

print(f"\n[5] Training XGBoost  (n_estimators={BEST_PARAMS['n_estimators']}, "
      f"max_depth={BEST_PARAMS['max_depth']}, lr={BEST_PARAMS['learning_rate']}) …")

model = XGBClassifier(**BEST_PARAMS)
model.fit(
    X_train, y_train,
    eval_set=[(X_train, y_train), (X_test, y_test)],
    verbose=False,
)
print("    Done.")

# ── 8. evaluation ─────────────────────────────────────────────────────────────
y_pred        = model.predict(X_test)
y_proba       = model.predict_proba(X_test)
y_train_pred  = model.predict(X_train)
y_train_proba = model.predict_proba(X_train)

train_acc  = accuracy_score(y_train, y_train_pred)
test_acc   = accuracy_score(y_test,  y_pred)
train_loss = log_loss(y_train, y_train_proba)
test_loss  = log_loss(y_test,  y_proba)

print("\n" + "=" * 65)
print("  BENCHMARK RESULTS")
print("=" * 65)
print(f"  Train Accuracy  : {train_acc * 100:.2f} %")
print(f"  Train Log-Loss  : {train_loss:.4f}")
print(f"  Test  Accuracy  : {test_acc  * 100:.2f} %")
print(f"  Test  Log-Loss  : {test_loss:.4f}")

# classification report
print("\n  Classification Report (Test Set):")
print(
    classification_report(
        y_test, y_pred,
        target_names=CLASS_NAMES,
        zero_division=0,
    )
)

# ROC-AUC
y_test_bin = label_binarize(y_test, classes=np.arange(N_CLASSES))
if y_test_bin.shape[1] > 1:
    per_class_auc = roc_auc_score(y_test_bin, y_proba, average=None)
    macro_auc     = roc_auc_score(y_test_bin, y_proba, average="macro")
    print("  AUC-ROC per class:")
    for cls, score in zip(CLASS_NAMES, per_class_auc):
        print(f"    {cls:<20} {score:.4f}")
    print(f"  Macro AUC-ROC        : {macro_auc:.4f}")

# ── 9. 5-fold stratified cross-validation ────────────────────────────────────
print("\n[6] 5-Fold Stratified Cross-Validation …")
kf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
cv_accs, cv_losses = [], []

for fold, (tr_idx, val_idx) in enumerate(kf.split(X, y), 1):
    m = XGBClassifier(**BEST_PARAMS)
    m.fit(X.iloc[tr_idx], y[tr_idx], verbose=False)
    preds  = m.predict(X.iloc[val_idx])
    probas = m.predict_proba(X.iloc[val_idx])
    acc  = accuracy_score(y[val_idx], preds)
    loss = log_loss(y[val_idx], probas)
    cv_accs.append(acc)
    cv_losses.append(loss)
    print(f"    Fold {fold}: Acc = {acc:.4f}   Log-Loss = {loss:.4f}")

print(f"\n  CV Accuracy  : {np.mean(cv_accs):.4f} ± {np.std(cv_accs):.4f}")
print(f"  CV Log-Loss  : {np.mean(cv_losses):.4f} ± {np.std(cv_losses):.4f}")

# ── 10. plots ─────────────────────────────────────────────────────────────────
fig, axes = plt.subplots(1, 3, figsize=(20, 6))
fig.suptitle("XGBoost Benchmark - Security Incident Classification", fontsize=14, fontweight="bold")

# (a) confusion matrix
cm = confusion_matrix(y_test, y_pred)
sns.heatmap(
    cm, annot=True, fmt="d", cmap="Blues", ax=axes[0],
    xticklabels=CLASS_NAMES, yticklabels=CLASS_NAMES,
)
axes[0].set_title("Confusion Matrix (Test Set)")
axes[0].set_xlabel("Predicted")
axes[0].set_ylabel("Actual")

# (b) feature importance
importances = (
    pd.Series(model.feature_importances_, index=FEATURES)
    .sort_values()
)
importances.plot(kind="barh", ax=axes[1], color="steelblue")
axes[1].set_title("Feature Importance (XGBoost)")
axes[1].set_xlabel("Importance Score")

# (c) CV accuracy per fold
fold_labels = [f"Fold {i}" for i in range(1, 6)]
bars = axes[2].bar(fold_labels, cv_accs, color="steelblue", alpha=0.8)
axes[2].axhline(
    np.mean(cv_accs), color="red", linestyle="--",
    label=f"Mean = {np.mean(cv_accs):.4f}",
)
axes[2].set_ylim(0, 1.05)
axes[2].set_title("5-Fold CV Accuracy")
axes[2].set_ylabel("Accuracy")
axes[2].legend()

# annotate bars
for bar, acc in zip(bars, cv_accs):
    axes[2].text(
        bar.get_x() + bar.get_width() / 2,
        bar.get_height() + 0.01,
        f"{acc:.3f}",
        ha="center", va="bottom", fontsize=9,
    )

plt.tight_layout()
plt.savefig(OUTPUT_IMG, dpi=150, bbox_inches="tight")
print(f"\n[7] Plot saved  : {OUTPUT_IMG}")

# ── 11. save model ────────────────────────────────────────────────────────────
joblib.dump({
    "model": model,
    "label_encoder": target_le,
    "features": FEATURES,
    "cat_encoders": label_encoders,   # saved so ml_server can encode live alerts
}, OUTPUT_MODEL)
print(f"[8] Model saved : {OUTPUT_MODEL}")

print("\n" + "=" * 65)
print("  Benchmark complete.")
print("=" * 65)
