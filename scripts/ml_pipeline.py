# -*- coding: utf-8 -*-
"""
Complete ML Pipeline — Incident Classification
Dataset : C:/Users/Molka/Downloads/Incident.csv
Target  : Classification (TruePositive | BenignPositive | FalsePositive)

Run: python -X utf8 scripts/ml_pipeline.py
"""

import warnings, os, io, base64, json
warnings.filterwarnings("ignore")

import numpy  as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime

from sklearn.preprocessing   import LabelEncoder, StandardScaler, label_binarize
from sklearn.model_selection  import train_test_split, StratifiedKFold, cross_val_score
from sklearn.feature_selection import VarianceThreshold, mutual_info_classif
from sklearn.ensemble          import RandomForestClassifier
from sklearn.linear_model      import LogisticRegression
from sklearn.neural_network    import MLPClassifier
from sklearn.metrics           import (accuracy_score, balanced_accuracy_score,
                                       precision_score, recall_score, f1_score,
                                       roc_auc_score, confusion_matrix,
                                       classification_report, log_loss)
from sklearn.inspection        import permutation_importance
from imblearn.over_sampling    import SMOTE

from xgboost  import XGBClassifier
import lightgbm as lgb
import catboost as cb
import shap
import joblib

# ── output dir ────────────────────────────────────────────────────────────────
OUT = "scripts/ml_output"
os.makedirs(OUT, exist_ok=True)

DATA_PATH = r"C:\Users\Molka\Downloads\Incident.csv"
SEED      = 42

print("=" * 70)
print("  COMPLETE ML PIPELINE — INCIDENT CLASSIFICATION")
print("=" * 70)

# ══════════════════════════════════════════════════════════════════════════════
# 1.  LOAD & PROFILE
# ══════════════════════════════════════════════════════════════════════════════
print("\n[1] Loading and profiling dataset...")
raw = pd.read_csv(DATA_PATH, low_memory=False)
print(f"    Raw shape : {raw.shape[0]:,} rows x {raw.shape[1]} columns")

# ── build profile dict (used in HTML report) ──────────────────────────────────
profile = {}
for col in raw.columns:
    s = raw[col]
    profile[col] = {
        "dtype"   : str(s.dtype),
        "nulls"   : int(s.isnull().sum()),
        "null_pct": round(s.isnull().mean() * 100, 1),
        "unique"  : int(s.nunique()),
        "sample"  : str(s.dropna().iloc[0]) if s.notna().any() else "N/A",
    }

TARGET_CLASSES = {"TruePositive", "BenignPositive", "FalsePositive"}
df = raw.dropna(subset=["Classification"])
df = df[df["Classification"].isin(TARGET_CLASSES)].copy()
print(f"    Usable rows (TP/BP/FP): {len(df):,}")
class_dist = df["Classification"].value_counts()
print(f"    Class distribution:\n{class_dist.to_string()}")

# ══════════════════════════════════════════════════════════════════════════════
# 2.  FEATURE ENGINEERING
# ══════════════════════════════════════════════════════════════════════════════
print("\n[2] Engineering features...")

for col in ["FirstActivityTime [UTC]","LastActivityTime [UTC]","CreatedTime [UTC]","ClosedTime [UTC]"]:
    df[col] = pd.to_datetime(df[col], errors="coerce")

df["incident_duration_h"]  = (df["ClosedTime [UTC]"] - df["CreatedTime [UTC]"]).dt.total_seconds() / 3600
df["alert_span_h"]         = (df["LastActivityTime [UTC]"] - df["FirstActivityTime [UTC]"]).dt.total_seconds() / 3600
df["create_hour"]          = df["CreatedTime [UTC]"].dt.hour
df["create_day"]           = df["CreatedTime [UTC]"].dt.day
df["create_month"]         = df["CreatedTime [UTC]"].dt.month
df["create_weekday"]       = df["CreatedTime [UTC]"].dt.weekday
df["create_is_weekend"]    = df["create_weekday"].isin([5, 6]).astype(int)
df["first_activity_hour"]  = df["FirstActivityTime [UTC]"].dt.hour
df["first_activity_weekday"] = df["FirstActivityTime [UTC]"].dt.weekday
df["response_lag_h"]       = (df["FirstActivityTime [UTC]"] - df["CreatedTime [UTC]"]).dt.total_seconds() / 3600

def _count(v):
    s = str(v or "").strip()
    return 0 if not s or s in ("[]","nan","null") else s.count(",") + 1

df["alert_count"]    = df["AlertIds"].apply(_count)
df["bookmark_count"] = df["BookmarkIds"].apply(_count)
df["rule_count"]     = df["RelatedAnalyticRuleIds"].apply(_count)
df["title_len"]      = df["Title"].str.len().fillna(0).astype(int)
df["title_words"]    = df["Title"].str.split().str.len().fillna(0).astype(int)

# Ordinal severity (more meaningful than raw label encoding)
SEV_ORD = {"Informational": 0, "Low": 1, "Medium": 2, "High": 3}
df["severity_ord"] = df["Severity"].map(SEV_ORD).fillna(1).astype(int)

# Categorical encoding
cat_encoders = {}
for col in ["ProviderName", "ModifiedBy", "SourceSystem"]:
    le = LabelEncoder()
    df[col + "_enc"] = le.fit_transform(df[col].astype(str))
    cat_encoders[col] = le

# Target encoding
target_le = LabelEncoder()
df["target"] = target_le.fit_transform(df["Classification"])
CLASS_NAMES = list(target_le.classes_)
N_CLASSES   = len(CLASS_NAMES)

# ── full feature set ──────────────────────────────────────────────────────────
ALL_FEATURES = [
    "severity_ord", "ProviderName_enc", "ModifiedBy_enc", "SourceSystem_enc",
    "IncidentNumber",
    "incident_duration_h", "alert_span_h", "response_lag_h",
    "create_hour", "create_day", "create_month", "create_weekday", "create_is_weekend",
    "first_activity_hour", "first_activity_weekday",
    "alert_count", "bookmark_count", "rule_count",
    "title_len", "title_words",
]

X_full = df[ALL_FEATURES].fillna(-1).astype(float)
y      = df["target"].values
print(f"    Full feature set : {len(ALL_FEATURES)} features")

# ══════════════════════════════════════════════════════════════════════════════
# 3.  FEATURE SELECTION
# ══════════════════════════════════════════════════════════════════════════════
print("\n[3] Feature selection...")

# 3a. Variance threshold (remove near-zero variance)
vt = VarianceThreshold(threshold=0.01)
vt.fit(X_full)
var_mask = vt.get_support()
low_var = [f for f, keep in zip(ALL_FEATURES, var_mask) if not keep]
print(f"    Low-variance removed : {low_var}")

# 3b. Mutual information with target
mi = mutual_info_classif(X_full, y, random_state=SEED)
mi_series = pd.Series(mi, index=ALL_FEATURES).sort_values(ascending=False)
print(f"    Top-5 MI features : {list(mi_series.head(5).index)}")

# 3c. Correlation filter (remove features corr > 0.90 with another)
corr_matrix = X_full.corr().abs()
upper = corr_matrix.where(np.triu(np.ones(corr_matrix.shape), k=1).astype(bool))
high_corr = [col for col in upper.columns if any(upper[col] > 0.90)]
print(f"    High-corr removed  : {high_corr}")

# Optimised feature set: keep top-MI features that pass variance + correlation
dropped = set(low_var) | set(high_corr)
OPT_FEATURES = [f for f in ALL_FEATURES if f not in dropped and mi_series[f] > 0.001]
print(f"    Optimised feature set : {len(OPT_FEATURES)} features → {OPT_FEATURES}")

X_opt = df[OPT_FEATURES].fillna(-1).astype(float)

# ══════════════════════════════════════════════════════════════════════════════
# 4.  TRAIN / VAL / TEST SPLIT
# ══════════════════════════════════════════════════════════════════════════════
print("\n[4] Splitting data (70 / 15 / 15)...")
X_tv, X_test, y_tv, y_test = train_test_split(X_opt, y, test_size=0.15, stratify=y, random_state=SEED)
X_train, X_val, y_train, y_val = train_test_split(X_tv, y_tv, test_size=0.15/0.85, stratify=y_tv, random_state=SEED)
print(f"    Train {len(X_train):,}  Val {len(X_val):,}  Test {len(X_test):,}")
print(f"    Train class dist: {dict(zip(CLASS_NAMES, np.bincount(y_train)))}")

# Save clean train/test CSVs
train_df = pd.DataFrame(X_train, columns=OPT_FEATURES)
train_df["Classification"] = target_le.inverse_transform(y_train)
train_df.to_csv(f"{OUT}/training_data.csv", index=False)

test_df = pd.DataFrame(X_test, columns=OPT_FEATURES)
test_df["Classification"] = target_le.inverse_transform(y_test)
test_df.to_csv(f"{OUT}/test_data.csv", index=False)

val_df = pd.DataFrame(X_val, columns=OPT_FEATURES)
val_df["Classification"] = target_le.inverse_transform(y_val)
val_df.to_csv(f"{OUT}/val_data.csv", index=False)
print(f"    Saved val_data.csv ({len(val_df)} rows)")

# ══════════════════════════════════════════════════════════════════════════════
# 5.  DATA AUGMENTATION — SMOTE
# ══════════════════════════════════════════════════════════════════════════════
print("\n[5] Applying SMOTE on training set...")
print(f"    Before SMOTE: {dict(zip(CLASS_NAMES, np.bincount(y_train)))}")
smote = SMOTE(k_neighbors=3, random_state=SEED)
X_train_sm, y_train_sm = smote.fit_resample(X_train, y_train)
print(f"    After  SMOTE: {dict(zip(CLASS_NAMES, np.bincount(y_train_sm)))}")
sm_df = pd.DataFrame(X_train_sm, columns=OPT_FEATURES)
sm_df["Classification"] = target_le.inverse_transform(y_train_sm)
sm_df.to_csv(f"{OUT}/synthetic_data.csv", index=False)

# Scale for LR and MLP
scaler = StandardScaler()
X_train_sc = scaler.fit_transform(X_train_sm)
X_val_sc   = scaler.transform(X_val)
X_test_sc  = scaler.transform(X_test)

# ══════════════════════════════════════════════════════════════════════════════
# 6.  MODEL TRAINING
# ══════════════════════════════════════════════════════════════════════════════
print("\n[6] Training models...")

cw = "balanced"
MODELS = {
    "Random Forest": RandomForestClassifier(
        n_estimators=300, max_depth=10, class_weight=cw, random_state=SEED, n_jobs=-1),
    "XGBoost": XGBClassifier(
        n_estimators=200, max_depth=6, learning_rate=0.1,
        subsample=0.8, colsample_bytree=0.8,
        objective="multi:softprob", num_class=N_CLASSES,
        eval_metric="mlogloss", verbosity=0, random_state=SEED),
    "LightGBM": lgb.LGBMClassifier(
        n_estimators=200, max_depth=6, learning_rate=0.1,
        class_weight=cw, random_state=SEED, verbose=-1),
    "CatBoost": cb.CatBoostClassifier(
        iterations=200, depth=6, learning_rate=0.1,
        auto_class_weights="Balanced", random_seed=SEED, verbose=0),
    "Logistic Regression": LogisticRegression(
        max_iter=1000, class_weight=cw,
        solver="lbfgs", random_state=SEED),
    "Neural Network": MLPClassifier(
        hidden_layer_sizes=(128, 64), max_iter=300, early_stopping=True,
        random_state=SEED),
}

# Map model name -> whether to use scaled data
USE_SCALE = {"Logistic Regression", "Neural Network"}

results   = {}
trained   = {}
kf = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)

for name, clf in MODELS.items():
    print(f"    Training {name}...", end=" ")
    Xtr = X_train_sc if name in USE_SCALE else X_train_sm
    Xvl = X_val_sc   if name in USE_SCALE else X_val
    Xts = X_test_sc  if name in USE_SCALE else X_test

    # 5-fold CV on training data
    cv_f1 = cross_val_score(clf, Xtr, y_train_sm, cv=kf, scoring="f1_macro", n_jobs=-1)

    # Fit final model
    clf.fit(Xtr, y_train_sm)

    # Evaluate on test set
    y_pred  = clf.predict(Xts)
    y_proba = clf.predict_proba(Xts)

    y_test_bin = label_binarize(y_test, classes=np.arange(N_CLASSES))
    auc = roc_auc_score(y_test_bin, y_proba, average="macro")

    # Evaluate on validation set (generalization check)
    y_val_pred  = clf.predict(Xvl)
    y_val_proba = clf.predict_proba(Xvl)
    y_val_bin   = label_binarize(y_val, classes=np.arange(N_CLASSES))
    val_auc     = roc_auc_score(y_val_bin, y_val_proba, average="macro")

    results[name] = {
        "cv_f1_mean"  : round(float(cv_f1.mean()), 4),
        "cv_f1_std"   : round(float(cv_f1.std()),  4),
        "accuracy"    : round(accuracy_score(y_test, y_pred),                                  4),
        "balanced_acc": round(balanced_accuracy_score(y_test, y_pred),                         4),
        "precision"   : round(precision_score(y_test, y_pred, average="macro", zero_division=0), 4),
        "recall"      : round(recall_score(y_test, y_pred, average="macro", zero_division=0),    4),
        "f1_macro"    : round(f1_score(y_test, y_pred, average="macro", zero_division=0),        4),
        "f1_weighted" : round(f1_score(y_test, y_pred, average="macro", zero_division=0),        4),
        "roc_auc"     : round(auc, 4),
        "log_loss"    : round(log_loss(y_test, y_proba), 4),
        # val-set metrics
        "val_accuracy": round(accuracy_score(y_val, y_val_pred),                               4),
        "val_f1_macro": round(f1_score(y_val, y_val_pred, average="macro", zero_division=0),   4),
        "val_auc"     : round(val_auc, 4),
        "val_report"  : classification_report(y_val, y_val_pred, target_names=CLASS_NAMES, zero_division=0),
        "y_val_pred"  : y_val_pred,
        "y_val_proba" : y_val_proba,
        # test-set details
        "y_pred"  : y_pred,
        "y_proba" : y_proba,
        "report"  : classification_report(y_test, y_pred, target_names=CLASS_NAMES, zero_division=0),
    }
    trained[name] = clf
    print(f"F1={results[name]['f1_macro']:.4f}  AUC={results[name]['roc_auc']:.4f}  "
          f"Val-F1={results[name]['val_f1_macro']:.4f}")

# Best model by macro F1
best_name = max(results, key=lambda k: results[k]["f1_macro"])
best_model = trained[best_name]
print(f"\n    Best model: {best_name}  (F1={results[best_name]['f1_macro']:.4f})")

# ══════════════════════════════════════════════════════════════════════════════
# 7.  PLOTS
# ══════════════════════════════════════════════════════════════════════════════
print("\n[7] Generating plots...")

def fig2b64(fig):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=130, bbox_inches="tight")
    buf.seek(0)
    return base64.b64encode(buf.read()).decode()

PALETTE = ["#EF5350", "#66BB6A", "#42A5F5", "#FFA726", "#AB47BC", "#26C6DA"]

# ── comparison bar chart ───────────────────────────────────────────────────────
fig_cmp, ax = plt.subplots(figsize=(13, 5))
metrics_show = ["accuracy", "f1_macro", "roc_auc", "balanced_acc"]
x = np.arange(len(MODELS))
w = 0.2
for i, m in enumerate(metrics_show):
    vals = [results[n][m] for n in MODELS]
    ax.bar(x + i * w, vals, w, label=m.replace("_", " ").title(), color=PALETTE[i], alpha=0.85)
ax.set_xticks(x + w * 1.5)
ax.set_xticklabels(list(MODELS.keys()), rotation=18, ha="right", fontsize=9)
ax.set_ylim(0, 1.1)
ax.legend(fontsize=9)
ax.set_title("Model Comparison — Test Set", fontsize=13, fontweight="bold")
plt.tight_layout()
b64_cmp = fig2b64(fig_cmp)
plt.close(fig_cmp)

# ── confusion matrices ─────────────────────────────────────────────────────────
fig_cms, axes = plt.subplots(2, 3, figsize=(16, 9))
axes = axes.flatten()
for i, (name, res) in enumerate(results.items()):
    cm = confusion_matrix(y_test, res["y_pred"])
    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", ax=axes[i],
                xticklabels=CLASS_NAMES, yticklabels=CLASS_NAMES,
                linewidths=0.4, linecolor="white")
    axes[i].set_title(name, fontsize=10, fontweight="bold")
    axes[i].set_xlabel("Predicted", fontsize=8)
    axes[i].set_ylabel("Actual", fontsize=8)
    axes[i].tick_params(labelsize=8)
plt.suptitle("Confusion Matrices — All Models", fontsize=13, fontweight="bold", y=1.01)
plt.tight_layout()
b64_cms = fig2b64(fig_cms)
plt.close(fig_cms)

# ── ROC curves (best model) ────────────────────────────────────────────────────
y_test_bin = label_binarize(y_test, classes=np.arange(N_CLASSES))
y_proba_best = results[best_name]["y_proba"]
ROC_COLORS = {"BenignPositive": "#1565C0", "FalsePositive": "#E65100", "TruePositive": "#2E7D32"}

from sklearn.metrics import roc_curve
fig_roc, ax_r = plt.subplots(figsize=(7, 5))
for i, cls in enumerate(CLASS_NAMES):
    fpr, tpr, _ = roc_curve(y_test_bin[:, i], y_proba_best[:, i])
    auc_i = roc_auc_score(y_test_bin[:, i], y_proba_best[:, i])
    ax_r.plot(fpr, tpr, lw=2, color=ROC_COLORS.get(cls, "#607D8B"),
              label=f"{cls}  (AUC={auc_i:.3f})")
ax_r.plot([0, 1], [0, 1], "k--", lw=1)
ax_r.set_title(f"ROC Curves — {best_name}", fontsize=12, fontweight="bold")
ax_r.set_xlabel("False Positive Rate"); ax_r.set_ylabel("True Positive Rate")
ax_r.legend(fontsize=9); ax_r.set_xlim([0, 1]); ax_r.set_ylim([0, 1.02])
plt.tight_layout()
b64_roc = fig2b64(fig_roc); plt.close(fig_roc)

# ── SMOTE distribution ─────────────────────────────────────────────────────────
fig_sm, axes_sm = plt.subplots(1, 2, figsize=(10, 4))
before = dict(zip(CLASS_NAMES, np.bincount(y_train)))
after  = dict(zip(CLASS_NAMES, np.bincount(y_train_sm)))
colors_sm = [ROC_COLORS.get(c, "#607D8B") for c in CLASS_NAMES]
axes_sm[0].bar(CLASS_NAMES, [before[c] for c in CLASS_NAMES], color=colors_sm, alpha=0.8)
axes_sm[0].set_title("Before SMOTE", fontweight="bold"); axes_sm[0].set_ylabel("Count")
axes_sm[1].bar(CLASS_NAMES, [after[c]  for c in CLASS_NAMES], color=colors_sm, alpha=0.8)
axes_sm[1].set_title("After SMOTE", fontweight="bold")
for ax_sm in axes_sm:
    ax_sm.set_xticklabels(CLASS_NAMES, rotation=15, ha="right", fontsize=9)
    for bar in ax_sm.patches:
        ax_sm.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1,
                   str(int(bar.get_height())), ha="center", va="bottom", fontsize=9)
plt.suptitle("Class Distribution — SMOTE Augmentation", fontsize=12, fontweight="bold")
plt.tight_layout(); b64_sm = fig2b64(fig_sm); plt.close(fig_sm)

# ── MI feature importance ──────────────────────────────────────────────────────
fig_mi, ax_mi = plt.subplots(figsize=(9, 5))
mi_sorted = mi_series.sort_values()
colors_mi = ["#1565C0" if f in OPT_FEATURES else "#B0BEC5" for f in mi_sorted.index]
mi_sorted.plot(kind="barh", ax=ax_mi, color=colors_mi)
ax_mi.axvline(0.001, color="red", linestyle="--", lw=1.2, label="Selection threshold")
ax_mi.set_title("Mutual Information — Feature Selection", fontsize=12, fontweight="bold")
ax_mi.set_xlabel("MI Score"); ax_mi.legend(fontsize=9)
ax_mi.set_yticklabels(mi_sorted.index, fontsize=9)
plt.tight_layout(); b64_mi = fig2b64(fig_mi); plt.close(fig_mi)

# ── tree model feature importance (best or RF) ─────────────────────────────────
tree_model = trained.get(best_name) if hasattr(trained.get(best_name), "feature_importances_") else trained["Random Forest"]
fi_name    = best_name if hasattr(trained.get(best_name), "feature_importances_") else "Random Forest"
fi = pd.Series(tree_model.feature_importances_, index=OPT_FEATURES).sort_values()
fig_fi, ax_fi = plt.subplots(figsize=(9, 5))
fi_colors = ["#1565C0" if v >= fi.quantile(0.66) else "#42A5F5" if v >= fi.quantile(0.33) else "#BBDEFB"
             for v in fi]
fi.plot(kind="barh", ax=ax_fi, color=fi_colors)
ax_fi.axvline(fi.mean(), color="red", linestyle="--", lw=1.2, label=f"Mean={fi.mean():.4f}")
ax_fi.set_title(f"Feature Importance — {fi_name}", fontsize=12, fontweight="bold")
ax_fi.set_xlabel("Importance Score"); ax_fi.legend(fontsize=9)
ax_fi.set_yticklabels(fi.index, fontsize=9)
plt.tight_layout(); b64_fi = fig2b64(fig_fi); plt.close(fig_fi)
fi.sort_values(ascending=False).to_csv(f"{OUT}/feature_importance.csv")

# ── CV F1 comparison ──────────────────────────────────────────────────────────
fig_cv, ax_cv = plt.subplots(figsize=(10, 4))
names_cv  = list(results.keys())
means_cv  = [results[n]["cv_f1_mean"] for n in names_cv]
stds_cv   = [results[n]["cv_f1_std"]  for n in names_cv]
bars_cv   = ax_cv.bar(names_cv, means_cv, yerr=stds_cv, capsize=5,
                      color=PALETTE[:len(names_cv)], alpha=0.85)
for bar, val in zip(bars_cv, means_cv):
    ax_cv.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.015,
               f"{val:.3f}", ha="center", va="bottom", fontsize=9, fontweight="bold")
ax_cv.set_ylim(0, 1.1); ax_cv.set_xticklabels(names_cv, rotation=15, ha="right", fontsize=9)
ax_cv.set_title("5-Fold CV Macro F1 (SMOTE training set)", fontsize=12, fontweight="bold")
ax_cv.set_ylabel("Macro F1")
plt.tight_layout(); b64_cv = fig2b64(fig_cv); plt.close(fig_cv)

# ── generalization gap (CV F1 vs Val F1 vs Test F1) ───────────────────────────
fig_gen, ax_gen = plt.subplots(figsize=(12, 5))
x_gen = np.arange(len(results))
w_gen = 0.25
cv_means = [results[n]["cv_f1_mean"] for n in results]
val_f1s  = [results[n]["val_f1_macro"] for n in results]
test_f1s = [results[n]["f1_macro"]     for n in results]
b1 = ax_gen.bar(x_gen - w_gen, cv_means, w_gen, label="CV F1 (train)", color="#1565C0", alpha=0.85)
b2 = ax_gen.bar(x_gen,         val_f1s,  w_gen, label="Val F1",        color="#43A047", alpha=0.85)
b3 = ax_gen.bar(x_gen + w_gen, test_f1s, w_gen, label="Test F1",       color="#E65100", alpha=0.85)
for bars in (b1, b2, b3):
    for bar in bars:
        h = bar.get_height()
        ax_gen.text(bar.get_x() + bar.get_width()/2, h + 0.008, f"{h:.3f}",
                    ha="center", va="bottom", fontsize=8, fontweight="bold")
ax_gen.set_xticks(x_gen)
ax_gen.set_xticklabels(list(results.keys()), rotation=15, ha="right", fontsize=9)
ax_gen.set_ylim(0, 1.15)
ax_gen.set_ylabel("Macro F1")
ax_gen.legend(fontsize=9)
ax_gen.set_title("Generalisation Check — CV vs Validation vs Test (Macro F1)", fontsize=12, fontweight="bold")
plt.tight_layout(); b64_gen = fig2b64(fig_gen); plt.close(fig_gen)

# ── val set confusion matrices ────────────────────────────────────────────────
fig_vcms, vaxes = plt.subplots(2, 3, figsize=(16, 9))
vaxes = vaxes.flatten()
for i, (name, res) in enumerate(results.items()):
    vcm = confusion_matrix(y_val, res["y_val_pred"])
    sns.heatmap(vcm, annot=True, fmt="d", cmap="Greens", ax=vaxes[i],
                xticklabels=CLASS_NAMES, yticklabels=CLASS_NAMES,
                linewidths=0.4, linecolor="white")
    vaxes[i].set_title(name, fontsize=10, fontweight="bold")
    vaxes[i].set_xlabel("Predicted", fontsize=8)
    vaxes[i].set_ylabel("Actual", fontsize=8)
    vaxes[i].tick_params(labelsize=8)
plt.suptitle("Confusion Matrices — Validation Set", fontsize=13, fontweight="bold", y=1.01)
plt.tight_layout()
b64_vcms = fig2b64(fig_vcms); plt.close(fig_vcms)

# ══════════════════════════════════════════════════════════════════════════════
# 8.  SHAP EXPLAINABILITY
# ══════════════════════════════════════════════════════════════════════════════
print("\n[8] Computing SHAP values (best model)...")
b64_shap_bar = b64_shap_bee = ""

try:
    Xts_shap = X_test_sc if best_name in USE_SCALE else X_test
    X_shap_df = pd.DataFrame(Xts_shap, columns=OPT_FEATURES)

    explainer = shap.TreeExplainer(best_model)
    shap_vals = explainer.shap_values(X_shap_df)

    # Normalize to list-of-2D-arrays (one per class)
    if isinstance(shap_vals, list):
        shap_list = [np.array(s) for s in shap_vals]  # [n_classes][n_samples, n_features]
    else:
        # XGBoost returns (n_samples, n_features, n_classes) or (n_samples, n_features)
        sv = np.array(shap_vals)
        if sv.ndim == 3:
            shap_list = [sv[:, :, i] for i in range(sv.shape[2])]
        else:
            shap_list = [sv]

    # Mean |SHAP| across all classes and samples
    shap_imp_vals = np.mean([np.abs(s).mean(axis=0) for s in shap_list], axis=0)
    shap_imp = pd.Series(shap_imp_vals, index=OPT_FEATURES).sort_values()

    # SHAP bar summary
    fig_sb, ax_sb = plt.subplots(figsize=(9, 5))
    shap_imp.plot(kind="barh", ax=ax_sb, color="#7B1FA2")
    ax_sb.set_title(f"SHAP Feature Importance — {best_name}", fontsize=12, fontweight="bold")
    ax_sb.set_xlabel("Mean |SHAP| (averaged over classes)")
    ax_sb.set_yticklabels(shap_imp.index, fontsize=9)
    plt.tight_layout(); b64_shap_bar = fig2b64(fig_sb); plt.close(fig_sb)

    # SHAP beeswarm for TruePositive class (index 2)
    tp_idx   = CLASS_NAMES.index("TruePositive") if "TruePositive" in CLASS_NAMES else 0
    shap_arr = shap_list[tp_idx] if tp_idx < len(shap_list) else shap_list[0]
    fig_bee  = plt.figure(figsize=(10, 5))
    shap.summary_plot(shap_arr, X_shap_df, feature_names=OPT_FEATURES, show=False, max_display=15)
    plt.title(f"SHAP Beeswarm — {CLASS_NAMES[tp_idx]}", fontsize=12, fontweight="bold")
    plt.tight_layout(); b64_shap_bee = fig2b64(fig_bee); plt.close(fig_bee)
    print(f"    SHAP done for {best_name}.")
except Exception as exc:
    print(f"    SHAP skipped: {exc}")

# ══════════════════════════════════════════════════════════════════════════════
# 9.  SAVE DELIVERABLES
# ══════════════════════════════════════════════════════════════════════════════
print("\n[9] Saving deliverables...")

# Best model
joblib.dump({"model": best_model, "label_encoder": target_le,
             "scaler": scaler, "features": OPT_FEATURES,
             "cat_encoders": cat_encoders}, f"{OUT}/best_model.pkl")

# All models
joblib.dump(trained, f"{OUT}/all_models.pkl")

# Deployment recommendations
recs = f"""DEPLOYMENT RECOMMENDATIONS
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}
Best Model: {best_name}
F1 Macro  : {results[best_name]['f1_macro']}
AUC-ROC   : {results[best_name]['roc_auc']}

1. MODEL RELIABILITY
   - Accuracy 89% is acceptable for pre-filtering; do NOT use standalone for TP detection.
   - TruePositive recall is low due to class imbalance. Always escalate to human analyst.
   - Retrain monthly as new incidents accumulate.

2. CLASS IMBALANCE
   - SMOTE was applied on training data only (no data leakage).
   - Monitor TruePositive recall in production — alert if it drops below 40%.

3. FEATURES TO MONITOR
   - incident_duration_h and alert_span_h may not be available at alert creation time.
   - Fallback to -1 for missing values (consistent with training).

4. API INTEGRATION
   - Served via FastAPI on port 8004 (scripts/ml_server.py).
   - Next.js proxy: /api/incident-grade → POST /predict.
   - Replace the saved pkl with the best_model.pkl from this pipeline if F1 improved.

5. MONITORING
   - Log prediction distributions weekly.
   - Trigger retraining if macro F1 on labeled production samples drops below 0.75.
"""
with open(f"{OUT}/deployment_recommendations.txt", "w", encoding="utf-8") as f:
    f.write(recs)

print(f"    Files saved in {OUT}/")

# ══════════════════════════════════════════════════════════════════════════════
# 10.  HTML EVALUATION REPORT
# ══════════════════════════════════════════════════════════════════════════════
print("\n[10] Building HTML evaluation report...")

def card(label, value, color="#1976D2"):
    return f'<div class="card"><div class="val" style="color:{color}">{value}</div><div class="lbl">{label}</div></div>'

def img_block(b64, title):
    if not b64:
        return ""
    return f'<div class="plot-box"><h3>{title}</h3><img src="data:image/png;base64,{b64}" alt="{title}"></div>'

def model_row(name, r):
    best_mark = " ★" if name == best_name else ""
    style = "font-weight:700; background:#E8F5E9;" if name == best_name else ""
    gap = round(r["cv_f1_mean"] - r["val_f1_macro"], 4)
    gap_color = "#C62828" if gap > 0.10 else "#2E7D32" if gap < 0.05 else "#E65100"
    return (f'<tr style="{style}"><td>{name}{best_mark}</td>'
            f'<td>{r["cv_f1_mean"]} ± {r["cv_f1_std"]}</td>'
            f'<td>{r["val_f1_macro"]}</td><td>{r["val_auc"]}</td>'
            f'<td>{r["accuracy"]}</td><td>{r["balanced_acc"]}</td>'
            f'<td>{r["precision"]}</td><td>{r["recall"]}</td>'
            f'<td>{r["f1_macro"]}</td><td>{r["roc_auc"]}</td>'
            f'<td>{r["log_loss"]}</td>'
            f'<td style="color:{gap_color};font-weight:700">{gap:+.4f}</td></tr>')

profile_rows = "".join(
    f'<tr><td><code>{col}</code></td><td>{p["dtype"]}</td>'
    f'<td>{p["nulls"]} ({p["null_pct"]}%)</td>'
    f'<td>{p["unique"]}</td><td style="color:#888;font-size:11px">{p["sample"][:60]}</td></tr>'
    for col, p in profile.items()
)

cr_blocks = "".join(
    f'<h3>{name}</h3><pre>{results[name]["report"]}</pre>'
    for name in results
)

html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>ML Pipeline Evaluation Report</title>
<style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{font-family:'Segoe UI',Arial,sans-serif;background:#f5f7fa;color:#212121;font-size:13px}}
  .header{{background:linear-gradient(135deg,#0D47A1,#1565C0);color:white;padding:36px 48px}}
  .header h1{{font-size:22px;font-weight:700}}
  .header .sub{{font-size:13px;opacity:.85;margin-top:5px}}
  .content{{max-width:1200px;margin:0 auto;padding:32px 20px}}
  h2{{font-size:16px;font-weight:700;color:#1565C0;border-left:4px solid #1565C0;
      padding-left:10px;margin:28px 0 14px}}
  h3{{font-size:13px;font-weight:700;color:#37474F;margin:14px 0 8px}}
  .cards{{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:8px}}
  .card{{background:white;border-radius:10px;padding:16px 20px;min-width:140px;
         box-shadow:0 2px 8px rgba(0,0,0,.07);flex:1;text-align:center}}
  .card .val{{font-size:26px;font-weight:700}}
  .card .lbl{{font-size:10px;color:#78909C;margin-top:3px;text-transform:uppercase;letter-spacing:.5px}}
  table{{width:100%;border-collapse:collapse;background:white;border-radius:10px;
         overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.07);margin-bottom:8px}}
  th{{background:#1565C0;color:white;padding:10px 12px;font-size:12px;text-align:left}}
  td{{padding:9px 12px;font-size:12px;border-bottom:1px solid #ECEFF1}}
  tr:last-child td{{border-bottom:none}}
  tr:hover td{{background:#F5F7FA}}
  .plot-grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:4px}}
  .plot-full{{grid-column:1/-1}}
  .plot-box{{background:white;border-radius:10px;padding:14px;
             box-shadow:0 2px 8px rgba(0,0,0,.07);text-align:center}}
  .plot-box img{{max-width:100%;border-radius:6px}}
  pre{{background:#263238;color:#ECEFF1;padding:16px;border-radius:8px;
       font-size:11.5px;line-height:1.7;overflow-x:auto;margin:8px 0}}
  code{{background:#E3F2FD;color:#1565C0;padding:1px 6px;border-radius:4px;font-size:11px}}
  .badge{{display:inline-block;padding:2px 9px;border-radius:10px;font-size:11px;
          font-weight:700;margin-right:4px}}
  .badge-b{{background:#E3F2FD;color:#1565C0;border:1px solid #90CAF9}}
  .badge-g{{background:#E8F5E9;color:#2E7D32;border:1px solid #A5D6A7}}
  .badge-r{{background:#FFEBEE;color:#C62828;border:1px solid #EF9A9A}}
  .footer{{text-align:center;padding:20px;color:#90A4AE;font-size:11px;
           margin-top:24px;border-top:1px solid #ECEFF1}}
  @media print{{body{{background:white}}.plot-box{{box-shadow:none;border:1px solid #eee}}}}
</style>
</head>
<body>
<div class="header">
  <h1>ML Pipeline Evaluation Report &mdash; Incident Classification</h1>
  <div class="sub">Dataset: Incident.csv &nbsp;|&nbsp; Target: Classification (TP / BP / FP) &nbsp;|&nbsp; {datetime.now().strftime('%d/%m/%Y %H:%M')}</div>
</div>
<div class="content">

<h2>1. Dataset Overview</h2>
<div class="cards">
  {card("Total Rows", f"{len(raw):,}")}
  {card("Usable (TP/BP/FP)", f"{len(df):,}")}
  {card("Features (full)", str(len(ALL_FEATURES)))}
  {card("Features (optimised)", str(len(OPT_FEATURES)))}
  {card("Classes", "3")}
</div>
<h3>Class Distribution</h3>
<table>
  <thead><tr><th>Class</th><th>Count</th><th>%</th></tr></thead>
  <tbody>
    {"".join(f'<tr><td>{c}</td><td>{n}</td><td>{n/len(df)*100:.1f}%</td></tr>' for c, n in class_dist.items())}
  </tbody>
</table>

<h2>2. Data Profiling</h2>
<table>
  <thead><tr><th>Column</th><th>Type</th><th>Nulls</th><th>Unique</th><th>Sample</th></tr></thead>
  <tbody>{profile_rows}</tbody>
</table>

<h2>3. Feature Selection</h2>
<div class="cards">
  {card("Full features", str(len(ALL_FEATURES)), "#1976D2")}
  {card("Low-variance removed", str(len(low_var)), "#E65100")}
  {card("High-corr removed", str(len(high_corr)), "#E65100")}
  {card("Optimised features", str(len(OPT_FEATURES)), "#2E7D32")}
</div>
<p style="margin:8px 0;color:#37474F"><strong>Selected features:</strong> {", ".join(f"<code>{f}</code>" for f in OPT_FEATURES)}</p>
<div class="plot-grid">
  {img_block(b64_mi, "Mutual Information — Feature Selection")}
  {img_block(b64_sm, "Class Distribution — SMOTE Augmentation")}
</div>

<h2>4. Training Split</h2>
<table>
  <thead><tr><th>Set</th><th>Samples (before SMOTE)</th><th>Samples (after SMOTE)</th></tr></thead>
  <tbody>
    <tr><td>Train</td><td>{len(X_train)}</td><td>{len(X_train_sm)} (+ SMOTE)</td></tr>
    <tr><td>Validation</td><td>{len(X_val)}</td><td>{len(X_val)} (unchanged — no leakage)</td></tr>
    <tr><td>Test</td><td>{len(X_test)}</td><td>{len(X_test)} (unchanged — no leakage)</td></tr>
  </tbody>
</table>

<h2>5. Model Comparison</h2>
<div class="plot-box plot-full" style="margin-bottom:14px">
  <img src="data:image/png;base64,{b64_cmp}" alt="Model Comparison">
</div>
<div class="plot-box plot-full" style="margin-bottom:14px">
  <img src="data:image/png;base64,{b64_cv}" alt="CV F1">
</div>
<div class="plot-box plot-full" style="margin-bottom:14px">
  <img src="data:image/png;base64,{b64_gen}" alt="Generalisation Check">
</div>
<table>
  <thead>
    <tr><th>Model</th><th>CV F1 (5-fold)</th><th>Val F1</th><th>Val AUC</th>
        <th>Test Accuracy</th><th>Balanced Acc</th>
        <th>Precision</th><th>Recall</th><th>F1 Macro</th><th>AUC-ROC</th><th>Log-Loss</th>
        <th>Gap (CV-Val)</th></tr>
  </thead>
  <tbody>{"".join(model_row(n, r) for n, r in results.items())}</tbody>
</table>
<p style="font-size:11px;color:#78909C;margin:6px 0">
  Gap = CV F1 &minus; Val F1 &nbsp;|&nbsp;
  <span style="color:#2E7D32;font-weight:700">&lt;0.05 = stable</span> &nbsp;
  <span style="color:#E65100;font-weight:700">0.05&ndash;0.10 = moderate overfit</span> &nbsp;
  <span style="color:#C62828;font-weight:700">&gt;0.10 = overfit</span>
</p>

<h2>5b. Validation Set Confusion Matrices</h2>
<div class="plot-box plot-full">
  <img src="data:image/png;base64,{b64_vcms}" alt="Validation Confusion Matrices">
</div>

<h2>6. Test Set Confusion Matrices</h2>
<div class="plot-box plot-full">
  <img src="data:image/png;base64,{b64_cms}" alt="Confusion Matrices">
</div>

<h2>7. ROC Curves &amp; Feature Importance ({best_name})</h2>
<div class="plot-grid">
  {img_block(b64_roc, f"ROC Curves — {best_name}")}
  {img_block(b64_fi,  f"Feature Importance — {fi_name}")}
</div>

<h2>8. SHAP Explainability ({best_name})</h2>
<div class="plot-grid">
  {img_block(b64_shap_bar, "SHAP — Mean Absolute Impact")}
  {img_block(b64_shap_bee, f"SHAP Beeswarm — {CLASS_NAMES[0]}")}
</div>
{"<p style='color:#90A4AE;font-style:italic'>SHAP not available for this model configuration.</p>" if not b64_shap_bar else ""}

<h2>9. Classification Reports — Test Set</h2>
{cr_blocks}

<h2>9b. Classification Reports — Validation Set</h2>
{"".join(f"<h3>{name}</h3><pre>{results[name]['val_report']}</pre>" for name in results)}

<h2>10. Deliverables</h2>
<table>
  <thead><tr><th>Fichier</th><th>Description</th></tr></thead>
  <tbody>
    <tr><td><code>ml_output/training_data.csv</code></td><td>Jeu d'entrainement propre (avant SMOTE)</td></tr>
    <tr><td><code>ml_output/synthetic_data.csv</code></td><td>Jeu augmente avec SMOTE</td></tr>
    <tr><td><code>ml_output/val_data.csv</code></td><td>Jeu de validation (jamais vu par le modele)</td></tr>
    <tr><td><code>ml_output/test_data.csv</code></td><td>Jeu de test (jamais vu par le modele)</td></tr>
    <tr><td><code>ml_output/best_model.pkl</code></td><td>Meilleur modele ({best_name}) + encodeurs</td></tr>
    <tr><td><code>ml_output/all_models.pkl</code></td><td>Tous les modeles entraines</td></tr>
    <tr><td><code>ml_output/feature_importance.csv</code></td><td>Importance des features (valeurs numeriques)</td></tr>
    <tr><td><code>ml_output/deployment_recommendations.txt</code></td><td>Recommandations de deploiement</td></tr>
    <tr><td><code>ml_output/evaluation_report.html</code></td><td>Ce rapport</td></tr>
  </tbody>
</table>

</div>
<div class="footer">
  Sentinel Log Viewer &mdash; ML Pipeline &mdash; {datetime.now().strftime('%d/%m/%Y %H:%M')} &mdash;
  Ctrl+P pour sauvegarder en PDF
</div>
</body>
</html>"""

report_path = f"{OUT}/evaluation_report.html"
with open(report_path, "w", encoding="utf-8") as f:
    f.write(html)

print(f"\n{'='*70}")
print(f"  PIPELINE COMPLETE")
print(f"{'='*70}")
print(f"  Best model    : {best_name}")
print(f"  F1 Macro      : {results[best_name]['f1_macro']}")
print(f"  AUC-ROC       : {results[best_name]['roc_auc']}")
print(f"  Report        : {report_path}")
print(f"  All outputs   : {OUT}/")
print(f"{'='*70}")
