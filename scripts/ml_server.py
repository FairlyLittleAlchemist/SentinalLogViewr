# -*- coding: utf-8 -*-
"""
XGBoost Incident Grader - FastAPI server
Port : 8004  (configured in app/api/incident-grade/route.ts)
Start: python scripts/ml_server.py

POST /predict   -> { label, confidence, probabilities }
GET  /health    -> { status, classes }
"""

from __future__ import annotations

import os
import sys

# Resolve paths relative to project root (wherever this script is called from)
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
MODEL_PATH   = os.path.join(SCRIPT_DIR, "ml_output", "best_model.pkl")

import warnings
warnings.filterwarnings("ignore")

import joblib
import numpy as np
import pandas as pd
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── load model ────────────────────────────────────────────────────────────────
print(f"[ml_server] Loading model from {MODEL_PATH} …")
_artifact    = joblib.load(MODEL_PATH)
_model       = _artifact["model"]
_target_le   = _artifact["label_encoder"]
_cat_le      = _artifact.get("cat_encoders", {})
_FEATURES    = _artifact["features"]
_CLASS_NAMES = list(_target_le.classes_)
print(f"[ml_server] Ready — classes: {_CLASS_NAMES}")

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="XGBoost Incident Grader", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── schemas ───────────────────────────────────────────────────────────────────
class IncidentRequest(BaseModel):
    # top-level fields (mapped from Alert object in the frontend)
    severity:           Optional[str] = None
    providerName:       Optional[str] = None
    modifiedBy:         Optional[str] = None
    sourceSystem:       Optional[str] = None
    incidentNumber:     Optional[float] = None
    createdTime:        Optional[str] = None
    closedTime:         Optional[str] = None
    firstActivityTime:  Optional[str] = None
    lastActivityTime:   Optional[str] = None
    alertIds:           Optional[str] = None
    bookmarkIds:        Optional[str] = None
    relatedRuleIds:     Optional[str] = None
    title:              Optional[str] = None
    # raw Sentinel row — carries all original CSV columns
    rawRow:             Optional[Dict[str, Any]] = None

class PredictionResponse(BaseModel):
    label:         str
    confidence:    float
    probabilities: Dict[str, float]

# ── helpers ───────────────────────────────────────────────────────────────────
def _rget(raw: dict, *keys: str) -> str:
    """Case-insensitive lookup in raw row, strips [UTC] suffixes."""
    def _norm(k: str) -> str:
        return k.lower().replace(" ", "").replace("[utc]", "").replace("-", "").replace("_", "")

    normalised = {_norm(k): str(v or "").strip() for k, v in raw.items()}
    for key in keys:
        v = normalised.get(_norm(key), "")
        if v and v.lower() not in ("nan", "null", "none", ""):
            return v
    return ""

def _encode_cat(le, value: str) -> int:
    """LabelEncoder transform with fallback for unseen values."""
    if not value or value.lower() in ("nan", "null", "none", ""):
        return -1
    try:
        return int(le.transform([value])[0])
    except ValueError:
        return abs(hash(value)) % max(len(le.classes_), 1)

def _count(v: Optional[str]) -> int:
    s = str(v or "").strip()
    if not s or s in ("[]", "nan", "null", "none"):
        return 0
    return s.count(",") + 1

def _parse_dt(v: Optional[str]) -> Optional[pd.Timestamp]:
    if not v:
        return None
    try:
        ts = pd.to_datetime(str(v), utc=True, errors="coerce")
        return ts if not pd.isnull(ts) else None
    except Exception:
        return None

# ── endpoint ──────────────────────────────────────────────────────────────────
@app.post("/predict", response_model=PredictionResponse)
def predict(req: IncidentRequest) -> PredictionResponse:
    raw = req.rawRow or {}

    # -- categorical fields ---------------------------------------------------
    severity   = req.severity       or _rget(raw, "Severity")       or ""
    provider   = req.providerName   or _rget(raw, "ProviderName")   or ""
    modified   = req.modifiedBy     or _rget(raw, "ModifiedBy")     or ""
    source_sys = req.sourceSystem   or _rget(raw, "SourceSystem")   or ""

    # Ordinal severity (matches ml_pipeline.py SEV_ORD mapping)
    _SEV_ORD = {"informational": 0, "low": 1, "medium": 2, "high": 3}
    sev_ord  = _SEV_ORD.get(severity.lower(), 1)

    sev_enc  = _encode_cat(_cat_le["Severity"],     severity.capitalize())  if "Severity"     in _cat_le else -1
    prov_enc = _encode_cat(_cat_le["ProviderName"], provider)               if "ProviderName" in _cat_le else -1
    mod_enc  = _encode_cat(_cat_le["ModifiedBy"],   modified)               if "ModifiedBy"   in _cat_le else -1
    src_enc  = _encode_cat(_cat_le["SourceSystem"], source_sys)             if "SourceSystem" in _cat_le else -1

    # -- numeric fields -------------------------------------------------------
    try:
        inc_num = float(req.incidentNumber or _rget(raw, "IncidentNumber") or 0)
    except (ValueError, TypeError):
        inc_num = 0.0

    # -- datetime features ----------------------------------------------------
    created   = _parse_dt(req.createdTime       or _rget(raw, "CreatedTime",       "TimeGenerated"))
    closed    = _parse_dt(req.closedTime        or _rget(raw, "ClosedTime"))
    first_act = _parse_dt(req.firstActivityTime or _rget(raw, "FirstActivityTime"))
    last_act  = _parse_dt(req.lastActivityTime  or _rget(raw, "LastActivityTime"))

    inc_dur_h    = (closed   - created  ).total_seconds() / 3600 if closed   and created   else -1
    alert_span_h = (last_act - first_act).total_seconds() / 3600 if last_act and first_act else -1

    c_hour  = created.hour      if created   else -1
    c_day   = created.day       if created   else -1
    c_month = created.month     if created   else -1
    c_wday  = created.weekday() if created   else -1
    fa_hour = first_act.hour      if first_act else -1
    fa_wday = first_act.weekday() if first_act else -1

    # -- count features -------------------------------------------------------
    alert_ids = req.alertIds      or _rget(raw, "AlertIds")
    bm_ids    = req.bookmarkIds   or _rget(raw, "BookmarkIds")
    rule_ids  = req.relatedRuleIds or _rget(raw, "RelatedAnalyticRuleIds")

    # -- text features --------------------------------------------------------
    title = req.title or _rget(raw, "Title") or ""

    # -- assemble feature row (all possible features, model filters to its list)
    row = {
        # ordinal severity (new pipeline)
        "severity_ord":           sev_ord,
        # label-encoded categoricals (old pipeline fallback)
        "Severity_enc":           sev_enc,
        "ProviderName_enc":       prov_enc,
        "ModifiedBy_enc":         mod_enc,
        "SourceSystem_enc":       src_enc,
        "IncidentNumber":         inc_num,
        "incident_duration_h":    inc_dur_h,
        "alert_span_h":           alert_span_h,
        "create_hour":            c_hour,
        "create_day":             c_day,
        "create_month":           c_month,
        "create_weekday":         c_wday,
        "create_is_weekend":      1 if c_wday in (5, 6) else (0 if c_wday >= 0 else -1),
        "first_activity_hour":    fa_hour,
        "first_activity_weekday": fa_wday,
        "alert_count":            _count(alert_ids),
        "bookmark_count":         _count(bm_ids),
        "rule_count":             _count(rule_ids),
        "title_len":              len(title),
        "title_words":            len(title.split()),
    }

    X = pd.DataFrame([{f: row.get(f, -1) for f in _FEATURES}])

    proba     = _model.predict_proba(X)[0]
    pred_idx  = int(np.argmax(proba))
    label     = _target_le.inverse_transform([pred_idx])[0]
    confidence = float(proba[pred_idx])
    proba_dict = {cls: float(p) for cls, p in zip(_CLASS_NAMES, proba)}

    return PredictionResponse(label=label, confidence=confidence, probabilities=proba_dict)


@app.get("/health")
def health():
    return {"status": "ok", "model": "XGBoost Incident Grader", "classes": _CLASS_NAMES}


# ── entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("ml_server:app", host="127.0.0.1", port=8004, reload=False)
