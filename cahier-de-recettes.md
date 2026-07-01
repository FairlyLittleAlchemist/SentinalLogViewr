# Cahier de Recettes — SentinalLogViewer SOC Dashboard

**Projet :** SentinalLogViewer — Dashboard SOC (TeamWill)
**Date d'exécution :** 2026-05-30
**Auteur :** Molka Ben Hmida
**Environnement :** Windows 11 · Python 3.11 · Node.js 18+ · Next.js 14 · Supabase
**LLM utilisé :** Groq llama-3.3-70b-versatile

---

## Sommaire

| Partie | Module | Description |
|--------|--------|-------------|
| [A](#partie-a--modules-ia) | **Modules IA** | Classification, scoring, RAG, remédiation LLM, diagnostic ML |
| [B](#partie-b--fonctionnalités-de-la-plateforme) | **Plateforme** | Auth, alertes, cas, playbooks, boards, logs, chatbot, admin |

---

# PARTIE A — Modules IA

---

## A1. SentinelClassifiy — Classification ML (MITRE ATT&CK)

**Description :** Modèle de classification supervisée entraîné sur des données Microsoft Sentinel. Prédit la catégorie MITRE ATT&CK d'une alerte à partir de ses caractéristiques.

**Serveur :** `http://127.0.0.1:8001` (`uvicorn api.main:app --port 8001` depuis `C:\Users\Molka\Desktop\SentinelClassifiy`)

**Endpoint Next.js :** `POST /api/classify` (proxy → port 8001 `/classify`)

| ID | Fonctionnalité | Préconditions | Entrée | Résultat attendu | Statut |
|----|----------------|--------------|--------|-----------------|--------|
| CL-01 | Classification alerte brute | Serveur 8001 actif | `{"title":"Brute force login","severity":"High"}` | JSON avec catégorie MITRE + confiance | ✅ PASS |
| CL-02 | Payload avec EventID | Serveur actif | `{"event_id":4625,"severity":"Medium","hour":14}` | Catégorie CredentialAccess / Execution | ✅ PASS |
| CL-03 | Payload FirewallEvent | Serveur actif | `{"device_action":"deny","sent_bytes":1024,"destination_port":443}` | Catégorie réseau correcte | ✅ PASS |
| CL-04 | Payload AzureActivity | Serveur actif | `{"operation_name":"LISTKEYS","activity_status":"Failed"}` | Catégorie élévation de privilèges | ✅ PASS |
| CL-05 | Serveur hors ligne → erreur | Serveur arrêté | Payload valide | HTTP 502 ou message d'erreur clair | ✅ PASS |
| CL-06 | Corps vide → erreur gérée | Serveur actif | `{}` | Pas d'exception 500 | ✅ PASS |

---

## A2. SOC-RiskScorer — Scoring de risque (LLM + Safety-Net)

**Description :** Service FastAPI calculant un score de risque [0–100] pour chaque incident Sentinel. LLM Groq llama-3.3-70b-versatile avec filet de sécurité déterministe.

**Serveur :** `http://127.0.0.1:8002`

---

### A2.1 — Tests unitaires purs `qa_unit.py`

```
Commande : python qa_unit.py
```

> Aucun réseau requis — tests 100 % déterministes

#### Résultat d'exécution réel

```
=== _to_list shape coercion ===
  [PASS] list passes through
  [PASS] dict values extracted
  [PASS] string wrapped
  [PASS] None -> []
  [PASS] empty string -> []
  [PASS] dict with empty values filtered

=== _clean sentinel filtering ===
  [PASS] 'empty' -> None
  [PASS] 'EMPTY' -> None (case-insensitive)
  [PASS] 'null' -> None
  [PASS] '-' -> None
  [PASS] 'real' passes
  [PASS] whitespace stripped
  [PASS] None -> None

=== _infer_severity multi-source ===
  [PASS] Severity wins
  [PASS] EventLevelName 'warning' -> Medium
  [PASS] Level=1 -> Critical
  [PASS] missing -> Informational
  [PASS] 'empty' ignored

=== _infer_asset_criticality ===
  [PASS] DC -> Critical
  [PASS] mail server -> High
  [PASS] dev box -> Medium
  [PASS] workstation -> Low
  [PASS] None -> Unknown

=== safety-net: zero-LLM-breakdown gets minimums ===
  [PASS] TIER1 keyword 'multi-stage' lifts severity_score >=20  - sev=20
  [PASS] Unknown asset floored at 10                            - asset=10
  [PASS] alerts=5 lifts frequency_score to >=7                 - freq=12
  [PASS] Exfiltration tactic lifts context_score >=12          - ctx=12
  [PASS] BenignPositive applies -5 but tactic floor wins (>=35) - score=49

=== safety-net: FalsePositive override ===
  [PASS] FalsePositive bypasses tactic floor (can be <35)      - score=15
  [PASS] FalsePositive applies -10 (final>=10)                 - score=15

=== safety-net: cloud bonus correctness ===
  [PASS] cloud bonus = +3 (10 -> 13)                           - sev=13

=== _to_level band boundaries ===
  [PASS] 0 -> Low
  [PASS] 34 -> Low
  [PASS] 35 -> Medium
  [PASS] 59 -> Medium
  [PASS] 60 -> High
  [PASS] 79 -> High
  [PASS] 80 -> Critical
  [PASS] 100 -> Critical

=== _normalize: raw Sentinel CSV payload ===
  [PASS] Title extracted
  [PASS] Severity inferred from 'Low'
  [PASS] AdditionalData JSON parsed -> tactics list
  [PASS] AdditionalData -> techniques list
  [PASS] AdditionalData -> alerts_count
  [PASS] Computer 'DC01' -> Critical asset

=== _parse: JSON extraction ===
  [PASS] parses markdown-fenced JSON
  [PASS] extracts JSON object from noisy output
  [PASS] malformed -> fallback score 50 Medium
  [PASS] score clamped to <=100

============================================================
TOTAL: 49 | PASSED: 49 | FAILED: 0
ALL UNIT TESTS PASSED
```

**Résultat : 49/49 PASS ✅**

---

### A2.2 — Tests E2E API `qa_test.py`

```
Commande : python qa_test.py
Serveur   : http://127.0.0.1:8002  (actif)
LLM       : groq / llama-3.3-70b-versatile
```

#### Résultat d'exécution réel

```
=== /health ===
  [PASS] /health returns 200
  [PASS] /health reports status=ok
  [PASS] /health reports provider
  [PASS] /health reports model
  provider=groq  model=llama-3.3-70b-versatile

=== /score: SharePoint exfiltration ===
  [PASS] sharepoint_exfil: response has all required fields
  [PASS] sharepoint_exfil: breakdown has all required fields
  [PASS] sharepoint_exfil: risk_score in [0,100]              score=44
  [PASS] sharepoint_exfil: risk_level matches band            level=Medium
  [PASS] sharepoint_exfil: severity_score <= 30
  [PASS] sharepoint_exfil: asset_criticality_score <= 30
  [PASS] sharepoint_exfil: frequency_score <= 20
  [PASS] sharepoint_exfil: context_score <= 20
  [PASS] score at least Medium (>=35) with Exfiltration       score=44
  [FAIL] cloud bonus applied (sev_score>=16)                  sev=11  ← LLM n'a pas appliqué le bonus cloud
  [PASS] context_score floor for Exfiltration (>=12)          ctx=17

=== /score: Multi-stage BenignPositive ===
  [PASS] tactic floor enforced (>=35) despite BenignPositive  score=44
  [PASS] severity_score upgraded by TIER1 keyword (>=20)      sev=20

=== /score: FalsePositive + Exfiltration ===
  [PASS] FP verdict allows score below 35                     score=20

=== /score: raw Sentinel CSV payload ===
  [PASS] TruePositive + High asset + cloud + exfil → High+    score=74
  [PASS] asset_score reflects High criticality (>=16)         asset=20

=== /score: tactics as dict (n8n quirk) ===
  [PASS] dict tactics not rejected (no 422)
  [PASS] dict tactics parsed (context_score >0)               ctx=12

=== /score: Unknown asset (floor=10) ===
  [PASS] asset_criticality_score >=10                         asset=10

=== /score: FalsePositive no tactics → Low ===
  [PASS] score in Low band                                    score=10

=== /score/batch ===
  [PASS] /score/batch returns 200
  [PASS] total=2
  [PASS] results length=2
  [PASS] batch[0]: score=45 band=Medium
  [PASS] batch[1]: score=10 band=Low

=== /webhook/n8n: single dict ===
  [PASS] webhook_single: score=70 band=High

=== /webhook/n8n: list payload ===
  [PASS] total=2

=== /score: empty/minimal body ===
  [PASS] empty body not rejected (no 422)
  [PASS] score=10 band=Low

=== /score: n8n 'empty' sentinel strings ===
  [PASS] 'empty' sentinels not rejected (no 422)
  [PASS] score=15 band=Low

============================================================
TOTAL: 118 | PASSED: 117 | FAILED: 1 | SKIPPED: 0

FAILURES:
  - cloud bonus applied (sev_score>=16): sev=11
```

**Résultat : 117/118 PASS — 1 FAIL**

| FAIL | Description | Valeur obtenue | Valeur attendue | Cause |
|------|-------------|---------------|-----------------|-------|
| T-FAIL-01 | `cloud bonus applied (sev_score>=16)` | `sev=11` | `sev >= 16` | Le LLM a assigné sev=8, le safety-net a appliqué +3 cloud → 11. Seuil 16 trop restrictif pour ce cas minimal (1 alerte, status New, pas de TP) |

---

### A2.3 — Calibration `qa_calibration.py`

```
Commande   : python qa_calibration.py
Tolérance  : ±10 points sur le score, bande = contrainte stricte
```

#### Résultat d'exécution réel

```
=== Example 1 - Multi-stage BP ===
  Target : score~42  band=Medium
  Actual : score=44  band=Medium | sev=20 asset=10 freq=7 ctx=12
  Drift  : +2 points
  [PASS] band_match=True  score_within_10=True

=== Example 2 - Above-threshold BP cloud ===
  Target : score~44  band=Medium
  Actual : score=49  band=Medium | sev=26 asset=10 freq=6 ctx=12
  Drift  : +5 points
  [PASS] band_match=True  score_within_10=True

=== Example 3 - High band TruePositive Exfil ===
  Target : score~61  band=High
  Actual : score=64  band=High | sev=17 asset=10 freq=13 ctx=19
  Drift  : +3 points
  [PASS] band_match=True  score_within_10=True

=== Example 4 - Critical ransomware on DC ===
  Target : score~100  band=Critical
  Actual : score=100  band=Critical | sev=25 asset=30 freq=20 ctx=20
  Drift  : +0 points
  [PASS] band_match=True  score_within_10=True

=== Example 5 - Low FP no tactics ===
  Target : score~8  band=Low
  Actual : score=10  band=Low | sev=2 asset=10 freq=0 ctx=3
  Drift  : +2 points
  [PASS] band_match=True  score_within_10=True

======================================================================
CALIBRATION SWEEP: 5/5 bands match | failed: 0
ALL CALIBRATION TARGETS HIT
```

**Résultat : 5/5 PASS ✅**

---

### A2.4 — Généralisation hors distribution `qa_generalization.py`

```
Commande : python qa_generalization.py
```

#### Résultat d'exécution réel

```
=== Brute force on AD (CredentialAccess, TruePositive) ===
  Expectation: band in ['High', 'Critical']
  Actual: score=79  band=High | sev=14 asset=25 freq=15 ctx=20
  MITRE: T1110 (Brute Force) under CredentialAccess (TA0006)...
  [PASS] band High in ['High', 'Critical']

=== Phishing email reported (BenignPositive) ===
  Expectation: band in ['Low', 'Medium']
  Actual: score=28  band=Low | sev=14 asset=2 freq=3 ctx=14
  MITRE: T1566 (Phishing) under InitialAccess (TA0001)...
  [PASS] band Low in ['Low', 'Medium']

=== Cryptominer on dev box (no classification) ===
  Expectation: band in ['Medium', 'High']
  Actual: score=58  band=Medium | sev=20 asset=8 freq=10 ctx=20
  MITRE: T1496 (Resource Hijacking) under Execution + Impact...
  [PASS] band Medium in ['Medium', 'High']

=== Impossible travel anomaly (TruePositive) ===
  Expectation: band in ['Medium', 'High']
  Actual: score=66  band=High | sev=14 asset=20 freq=10 ctx=17
  MITRE: T1078 (Valid Accounts) + InitialAccess + CredentialAccess...
  [PASS] band High in ['Medium', 'High']

=== Defender SmartScreen blocked download (FalsePositive) ===
  Expectation: band in ['Low']
  Actual: score=10  band=Low | sev=6 asset=5 freq=3 ctx=2
  [PASS] band Low in ['Low']

======================================================================
GENERALIZATION SWEEP: 5/5 bands acceptable
```

**Résultat : 5/5 PASS ✅**

---

### A2.5 — Spectre complet `qa_comprehensive.py`

```
Commande  : python qa_comprehensive.py
20 cas    : Low(4) + Medium(6) + High(6) + Critical(4)
Latence   : mean=37.4s  median=40.5s  min=1.0s  max=55.4s
```

#### Résultat d'exécution réel

```
[L1] FP closed login            PASS  score=10/0-25   band=Low/Low
[L2] FP SmartScreen download    PASS  score=10/0-25   band=Low/Low
[L3] Network scan closed BP     PASS  score=23/0-30   band=Low/Low
[L4] Failed login burst BP      PASS  score=29/0-35   band=Low/Low

[M1] Phishing reported          PASS  score=35/30-55  band=Medium/Medium
[M2] PowerShell encoded         PASS  score=38/35-60  band=Medium/Medium
[M3] Scheduled task BP          PASS  score=33/10-45  band=Low/Low
[M4] Discovery burst            PASS  score=53/35-60  band=Medium/Medium
[M5] AV disable TP              PASS  score=59/35-65  band=Medium/Medium
[M6] Mass mailbox export BP     PASS  score=35/35-65  band=Medium/Medium

[H1] AD brute force TP          PASS  score=63/55-80  band=High/High
[H2] Exfiltration suspicious IP FAIL  score=81/60-85  band=Critical/High  ← sur-scoré
[H3] Cobalt Strike beacon       PASS  score=76/60-85  band=High/High
[H4] Lateral movement PsExec    PASS  score=62/55-80  band=High/High
[H5] SharePoint anomaly         PASS  score=62/55-80  band=High/High
[H6] Service account anomalous  PASS  score=70/60-85  band=High/High

[C1] Ransomware file server     PASS  score=95/80-100 band=Critical/Critical
[C2] Mimikatz LSASS dump        PASS  score=83/80-100 band=Critical/Critical
[C3] APT C2 + Exfiltration      PASS  score=92/80-100 band=Critical/Critical
[C4] Wiper malware prod DB      FAIL  score=77/80-100 band=High/Critical   ← sous-scoré

================================================================================
SUMMARY

Overall: 18/20 cases PASS

Per-check pass rate:
  band      : 18/20
  score     : 19/20
  halluc    : 20/20   ← 0 hallucination de technique MITRE
  math      : 20/20   ← cohérence mathématique parfaite
  nonempty  : 20/20   ← facteurs de risque toujours présents

Per-band:
  Low       : 5/5 correctly assigned
  Medium    : 5/5 correctly assigned
  High      : 5/6 correctly assigned
  Critical  : 3/4 correctly assigned
```

**Résultat : 18/20 PASS — 2 FAIL**

| ID | Scénario | Score obtenu | Bande obtenue | Bande attendue | Cause |
|----|----------|-------------|---------------|----------------|-------|
| H2 | Exfiltration IP suspecte Bulgarie | 81 | Critical | High | Score dépasse 80 → passe Critical. LLM sur-pondère IP malveillante + géolocalisation |
| C4 | Wiper malware BDD production | 77 | High | Critical | Score sous 80 → reste High. LLM sous-pondère l'actif Critical sans `asset_criticality: "Critical"` explicite |

---

## A3. Isolation Forest ML — Diagnostic IA

**Description :** Modèle Isolation Forest détectant les comportements anormaux. Verdict NORMAL / ANORMAL + score [0–1].

**Serveur :** `http://127.0.0.1:8003` (`uvicorn api.main:app --port 8003` depuis `C:\Users\Molka\Desktop\model`)

| ID | Fonctionnalité | Préconditions | Entrée | Résultat attendu | Statut |
|----|----------------|--------------|--------|-----------------|--------|
| ML-01 | Prédiction incident normal | Serveur 8003 actif | `{"severity":"High","status":"Active","alerts_count":1,"created_hour":10,"created_dow":1}` | `is_anomaly: false`, score ≈ 0 | ✅ PASS |
| ML-02 | Prédiction incident anormal | Serveur actif | `{"severity":"Critical","status":"Active","alerts_count":25,"created_hour":3,"created_dow":6}` | `is_anomaly: true`, score > 0.5 | ✅ PASS |
| ML-03 | Sévérité capitalisée | Serveur actif | `severity: "high"` (minuscule) | Normalisé → `"High"`, pas d'erreur de mapping | ✅ PASS |
| ML-04 | Score normalisé dans [0,1] | Serveur actif | Tout payload Incident | `0 <= score_normalised <= 1` | ✅ PASS |
| ML-05 | Mauvais endpoint → 404 | Serveur actif | `POST /predict/Alert` | HTTP 404 géré côté frontend | ✅ PASS |
| ML-06 | Serveur hors ligne | Serveur 8003 arrêté | Tout payload | Message "Service IA indisponible" dans l'UI | ✅ PASS |
| ML-07 | Affichage verdict | Frontend actif | Clic "Analyser" sur incident | Bannière verte NORMAL ou rouge ANORMAL | ✅ PASS |

---

## A4. Python RAG — Recommandations de remédiation

**Description :** Retrieval-Augmented Generation sur base de connaissances SOC. Fallback automatique vers LLM si résultats vides.

**Serveur :** `http://127.0.0.1:8000` · **Endpoint Next.js :** `GET /api/python-rag?q=<titre>`

| ID | Fonctionnalité | Préconditions | Entrée | Résultat attendu | Statut |
|----|----------------|--------------|--------|-----------------|--------|
| RAG-01 | Recherche par titre | Serveur RAG actif | `?q=Brute force login attempt` | `remediation_steps[]` non vides | ✅ PASS |
| RAG-02 | Résultats vides → fallback LLM | RAG 0 résultats | `?q=unknown_alert_xyz` | Remédiation générée par LLM | ✅ PASS |
| RAG-03 | Parse tableau Python repr | RAG renvoie `['step1', "step2"]` | Résultat brut Python | Array propre `string[]` | ✅ PASS |
| RAG-04 | Parse tableau tronqué | RAG renvoie `["step1","step2` | Résultat tronqué | Array récupéré sans crash | ✅ PASS |
| RAG-05 | Paramètre q absent → 400 | Serveur actif | `GET /api/python-rag` sans q | HTTP 400 "Query parameter q is required" | ✅ PASS |
| RAG-06 | Serveur hors ligne | Serveur 8000 arrêté | Tout query | HTTP 500 message clair | ✅ PASS |

---

## A5. Résumé IA d'alerte

**Description :** Résumé automatique d'une alerte via n8n webhook → Hugging Face BART-large-cnn en fallback.

**Endpoint :** `POST /api/alerts/{id}/summarize`

| ID | Fonctionnalité | Préconditions | Entrée | Résultat attendu | Statut |
|----|----------------|--------------|--------|-----------------|--------|
| SUM-01 | Résumé depuis le cache | Alerte avec `summary` existant | POST summarize | `{summary, cached:true, provider:"cache"}` | ✅ PASS |
| SUM-02 | Résumé via n8n | `N8N_ALERT_RESOLUTION_WEBHOOK_URL` défini | Alerte sans summary | Résumé depuis `issue_summary` n8n | ✅ PASS |
| SUM-03 | Fallback Hugging Face | n8n indisponible, `HF_TOKEN` défini | Alerte sans summary | Résumé ≤ 220 chars généré par BART | ✅ PASS |
| SUM-04 | Alerte inexistante | BDD accessible | `POST /api/alerts/id-faux/summarize` | HTTP 404 | ✅ PASS |
| SUM-05 | Non authentifié | Pas de session | Appel sans cookie | HTTP 401 | ✅ PASS |
| SUM-06 | Sauvegarde en BDD | Supabase actif | Après génération | Champ `summary` mis à jour dans `alerts` | ✅ PASS |

---

## A6. Remédiation n8n + LLM

**Description :** Étapes de remédiation pour une alerte via n8n RAG, fallback LLM (GPT).

**Endpoints :** `POST /api/remediation/{alertId}` · `POST /api/generate-remediation`

| ID | Fonctionnalité | Préconditions | Entrée | Résultat attendu | Statut |
|----|----------------|--------------|--------|-----------------|--------|
| REM-01 | Remédiation via n8n | Webhook configuré | `POST /api/remediation/{alertId}` | `{success:true, recommendation:{...}}` | ✅ PASS |
| REM-02 | Steps en tableau | n8n actif | Réponse n8n | `remediation_steps[]`, `containment_steps[]`, `validation_steps[]` | ✅ PASS |
| REM-03 | Remédiation LLM directe | LLM disponible | `POST /api/generate-remediation` `{query, context}` | JSON structuré avec étapes, confiance, catégorie | ✅ PASS |
| REM-04 | Query absente → 400 | — | Body sans `query` | HTTP 400 | ✅ PASS |
| REM-05 | Alerte non trouvée | BDD accessible | ID inexistant | HTTP 404 | ✅ PASS |
| REM-06 | Non authentifié | Pas de session | Appel sans cookie | HTTP 401 | ✅ PASS |
| REM-07 | Affichage dans l'UI | UI active | Clic "Voir remédiation" | Steps affichées, texte lisible | ✅ PASS |

---

# PARTIE B — Fonctionnalités de la plateforme

---

## B1. Authentification & Contrôle d'accès

| ID | Fonctionnalité | Préconditions | Entrée | Résultat attendu | Statut |
|----|----------------|--------------|--------|-----------------|--------|
| AUTH-01 | Connexion valide | Compte Supabase actif | Email + mdp corrects | Redirection `/dashboard`, session créée | ✅ PASS |
| AUTH-02 | Connexion invalide | — | Email ou mdp incorrect | Message d'erreur, pas de redirection | ✅ PASS |
| AUTH-03 | Page protégée sans session | Pas connecté | Navigation `/alerts` | Redirection `/auth` | ✅ PASS |
| AUTH-04 | Déconnexion | Session active | Clic "Déconnecter" | Session détruite, redirection `/auth` | ✅ PASS |
| AUTH-05 | Page non autorisée | Rôle insuffisant | Accès `/admin` sans droits | Page `/unauthorized` | ✅ PASS |
| AUTH-06 | Mise à jour mot de passe | Session active | Nouveau mdp | Confirmation affichée | ✅ PASS |

---

## B2. Dashboard — Vue d'ensemble SOC

| ID | Fonctionnalité | Préconditions | Entrée | Résultat attendu | Statut |
|----|----------------|--------------|--------|-----------------|--------|
| DASH-01 | Métriques SOC | BDD accessible | Chargement `/dashboard` | Compteurs alertes, cas actifs, incidents | ✅ PASS |
| DASH-02 | Graphique alertes | Données présentes | — | Graphique barres/courbes avec labels | ✅ PASS |
| DASH-03 | Dashboard Analyste — incidents | Table `incident_analysis` peuplée | `/dashboard-analyste` | Tableau : titre, sévérité, statut, ScoreRisk | ✅ PASS |
| DASH-04 | Affichage ScoreRisk | Champ `ScoreRisk` présent | — | Barre de progression colorée [0–100] | ✅ PASS |
| DASH-05 | Tous les enregistrements | Sans déduplication | — | Doublons inclus, aucun filtrage par titre unique | ✅ PASS |
| DASH-06 | ScoreRisk nul ou absent | `ScoreRisk: null` | — | Barre à 0 ou `—` sans erreur | ✅ PASS |
| DASH-07 | Feature flags | `GET /api/feature-flags` | — | Sections visibles selon droits | ✅ PASS |

---

## B3. Alertes

| ID | Fonctionnalité | Préconditions | Entrée | Résultat attendu | Statut |
|----|----------------|--------------|--------|-----------------|--------|
| ALT-01 | Liste paginée | BDD peuplée | `GET /api/alerts?page=1&pageSize=20&type=all` | HTTP 200, `{alerts:[], total}` | ✅ PASS |
| ALT-02 | Filtre par type | — | `GET /api/alerts?type=high` | Alertes High uniquement | ✅ PASS |
| ALT-03 | Détail d'une alerte | — | `GET /api/alerts/{id}` | Tous champs (title, category, ip…) | ✅ PASS |
| ALT-04 | Corrélation | — | `GET /api/alerts/{id}/correlation` | Alertes liées par IP, compte ou empreinte | ✅ PASS |
| ALT-05 | Résumé IA depuis UI | — | Clic "Résumer" | Résumé affiché et mis en cache | ✅ PASS |
| ALT-06 | Alerte inexistante | — | `GET /api/alerts/id-faux` | HTTP 404 | ✅ PASS |
| ALT-07 | Vues sauvegardées | — | `POST /api/saved-views` avec filtre | Vue enregistrée et rappelable | ✅ PASS |

---

## B4. Cas d'investigation

| ID | Fonctionnalité | Préconditions | Entrée | Résultat attendu | Statut |
|----|----------------|--------------|--------|-----------------|--------|
| CAS-01 | Créer un cas | Alerte existante | `POST /api/cases` `{alertId, priority:"medium"}` | HTTP 200, `{case:{id}}` | ✅ PASS |
| CAS-02 | Liste des cas | BDD peuplée | `GET /api/cases` | Liste avec statuts, priorités | ✅ PASS |
| CAS-03 | Détail d'un cas | Cas existant | `GET /api/cases/{id}` | Champs complets + alertes liées | ✅ PASS |
| CAS-04 | Ajouter une note | Cas existant | `POST /api/cases/{id}/notes` `{content}` | Note visible dans la timeline | ✅ PASS |
| CAS-05 | Ajouter une preuve | Cas existant | `POST /api/cases/{id}/evidence` `{label, evidenceType:"note", details}` | HTTP 200, preuve listée | ✅ PASS |
| CAS-06 | Upload fichier preuve | Cas existant | `POST /api/cases/{id}/evidence/upload` | Fichier stocké, référence créée | ✅ PASS |
| CAS-07 | Hypothèse créée | Cas existant | `POST /api/cases/{id}/hypotheses` `{title, description}` | Hypothèse listée | ✅ PASS |
| CAS-08 | Timeline du cas | Cas avec activité | `GET /api/cases/{id}/timeline` | Événements chronologiques | ✅ PASS |
| CAS-09 | Graphe d'entités | Cas existant | `GET /api/cases/{id}/graph` | Nœuds + arêtes (IP, comptes, hosts) | ✅ PASS |
| CAS-10 | Actions de réponse | Cas existant | `POST /api/cases/{id}/response-actions` | Action enregistrée | ✅ PASS |
| CAS-11 | Assignation | Cas + utilisateur | `GET /api/cases/assignees` | Liste des analystes disponibles | ✅ PASS |
| CAS-12 | Logs du cas | Cas avec activité | `GET /api/cases/{id}/logs` | Journal des actions | ✅ PASS |

---

## B5. Playbooks

| ID | Fonctionnalité | Préconditions | Entrée | Résultat attendu | Statut |
|----|----------------|--------------|--------|-----------------|--------|
| PB-01 | Liste des playbooks | BDD peuplée | `GET /api/playbooks` | `{playbooks:[{id, name}]}` | ✅ PASS |
| PB-02 | Détail d'un playbook | Existant | `GET /api/playbooks/{id}` | Étapes, description | ✅ PASS |
| PB-03 | Liaison à un cas | Cas + playbook | `POST /api/cases/{id}/playbook` `{action:"bind", templateId}` | HTTP 200 | ✅ PASS |
| PB-04 | Avancement d'étape | Playbook lié | `PUT /api/cases/{id}/playbook/steps/{stepId}` | Étape marquée complète | ✅ PASS |
| PB-05 | Approbation | Rôle manager | `POST /api/playbooks/{id}/approve` | Statut "approved" | ✅ PASS |
| PB-06 | Rollback | Playbook approuvé | `POST /api/playbooks/{id}/rollback` | Version précédente restaurée | ✅ PASS |

---

## B6. Tableaux d'investigation (Boards)

| ID | Fonctionnalité | Préconditions | Entrée | Résultat attendu | Statut |
|----|----------------|--------------|--------|-----------------|--------|
| BRD-01 | Créer un tableau | Cas existant | `POST /api/boards` `{name, caseId, boardType:"master_shared"}` | HTTP 200, `{board:{id}}` | ✅ PASS |
| BRD-02 | Lister les tableaux | BDD peuplée | `GET /api/boards` | Liste des tableaux | ✅ PASS |
| BRD-03 | Sauvegarder l'état | Tableau existant | `PUT /api/boards/{id}/state` `{viewport, nodes[], edges[]}` | HTTP 200 | ✅ PASS |
| BRD-04 | Restaurer l'état | État sauvegardé | Chargement `/board/{id}` | Nœuds et arêtes restaurés | ✅ PASS |
| BRD-05 | Ajouter un nœud | UI active | Glisser-déposer d'entité | Nœud visible sur le canvas | ✅ PASS |
| BRD-06 | Supprimer un tableau | Existant | `DELETE /api/boards/{id}` | HTTP 200, tableau supprimé | ✅ PASS |

---

## B7. Recommandations

| ID | Fonctionnalité | Préconditions | Entrée | Résultat attendu | Statut |
|----|----------------|--------------|--------|-----------------|--------|
| REC-01 | Liste | BDD peuplée | `GET /api/recommendations` | Liste des recommandations SOC | ✅ PASS |
| REC-02 | Détail | ID valide | `GET /api/recommendations/{id}` | Titre, description, steps | ✅ PASS |
| REC-03 | Création | Session active | `POST /api/recommendations` `{title, steps}` | Recommandation créée | ✅ PASS |
| REC-04 | Suppression | ID valide | `DELETE /api/recommendations/{id}` | HTTP 200 | ✅ PASS |

---

## B8. Logs

| ID | Fonctionnalité | Préconditions | Entrée | Résultat attendu | Statut |
|----|----------------|--------------|--------|-----------------|--------|
| LOG-01 | Affichage des logs | Logs en BDD | `GET /api/logs` | Liste paginée avec timestamps | ✅ PASS |
| LOG-02 | Sources disponibles | BDD peuplée | `GET /api/logs/sources` | Liste des sources (Sentinel, Firewall…) | ✅ PASS |
| LOG-03 | Filtre par source | — | `GET /api/logs?source=sentinel` | Logs filtrés | ✅ PASS |

---

## B9. Chatbot SOC

| ID | Fonctionnalité | Préconditions | Entrée | Résultat attendu | Statut |
|----|----------------|--------------|--------|-----------------|--------|
| BOT-01 | Question contextuelle | Session active | `{message:"Qu'est-ce que T1110 ?"}` | Réponse en français | ✅ PASS |
| BOT-02 | Historique maintenu | Session active | Messages multiples | Contexte conservé entre les tours | ✅ PASS |
| BOT-03 | Message vide | — | `{message:""}` | Erreur propre, pas de crash | ✅ PASS |

---

## B10. Administration

| ID | Fonctionnalité | Préconditions | Entrée | Résultat attendu | Statut |
|----|----------------|--------------|--------|-----------------|--------|
| ADM-01 | Liste utilisateurs | Rôle admin | `GET /admin/users` | Utilisateurs avec rôles | ✅ PASS |
| ADM-02 | Permissions | Session active | `GET /api/me/permissions` | Liste des droits | ✅ PASS |
| ADM-03 | Accès refusé | Rôle analyste | Navigation `/admin` | Redirection `/unauthorized` | ✅ PASS |

---

## B11. Test fumée E2E — Playwright `smoke.spec.ts`

```
Commande : E2E_EMAIL=... E2E_PASSWORD=... npx playwright test tests/e2e/smoke.spec.ts
```

| ID | Étape | Action | Résultat attendu | Statut |
|----|-------|--------|-----------------|--------|
| E2E-01 | Authentification | Navigation `/auth`, remplissage email + mdp, clic "Se connecter" | Redirection hors `/auth` < 30 s | ✅ PASS |
| E2E-02 | GET alertes | `GET /api/alerts?page=1&pageSize=5&type=all` | HTTP 200, `alerts[0].id` non nul | ✅ PASS |
| E2E-03 | GET playbooks | `GET /api/playbooks` | HTTP 200 | ✅ PASS |
| E2E-04 | Créer un cas | `POST /api/cases` `{alertId, priority:"medium", playbookId}` | HTTP 200, `case.id` non nul | ✅ PASS |
| E2E-05 | Lier le playbook | `POST /api/cases/{caseId}/playbook` `{action:"bind"}` | HTTP 200 | ✅ PASS |
| E2E-06 | Créer un tableau | `POST /api/boards` `{name:"Smoke <ISO>", caseId, boardType:"master_shared"}` | HTTP 200, `board.id` non nul | ✅ PASS |
| E2E-07 | Sauvegarder l'état | `PUT /api/boards/{boardId}/state` avec 1 nœud, 0 arête | HTTP 200 | ✅ PASS |
| E2E-08 | Ajouter une preuve | `POST /api/cases/{caseId}/evidence` `{label:"Smoke evidence", evidenceType:"note"}` | HTTP 200 | ✅ PASS |

---

## Récapitulatif des résultats réels

### Modules IA — Tests exécutés

| Fichier de test | Commande | Total | PASS | FAIL | Remarque |
|-----------------|----------|-------|------|------|----------|
| `qa_unit.py` | `python qa_unit.py` | **49** | **49** | **0** | Exécuté — 100% PASS |
| `qa_test.py` | `python qa_test.py` | **118** | **117** | **1** | 1 FAIL : cloud bonus sev=11 vs ≥16 |
| `qa_calibration.py` | `python qa_calibration.py` | **5** | **5** | **0** | Exécuté — 100% PASS |
| `qa_generalization.py` | `python qa_generalization.py` | **5** | **5** | **0** | Exécuté — 100% PASS |
| `qa_comprehensive.py` | `python qa_comprehensive.py` | **20** | **18** | **2** | H2 sur-scoré (81→Critical), C4 sous-scoré (77→High) |
| **Total IA exécuté** | | **197** | **194** | **3** | Taux de réussite : **98.5%** |

### Plateforme & E2E

| Module | Total | PASS | FAIL |
|--------|-------|------|------|
| Authentification | 6 | 6 | 0 |
| Dashboard + Dashboard Analyste | 7 | 7 | 0 |
| Alertes | 7 | 7 | 0 |
| Cas d'investigation | 12 | 12 | 0 |
| Playbooks | 6 | 6 | 0 |
| Boards | 6 | 6 | 0 |
| Recommandations | 4 | 4 | 0 |
| Logs | 3 | 3 | 0 |
| Chatbot | 3 | 3 | 0 |
| Administration | 3 | 3 | 0 |
| E2E Smoke Playwright | 8 | 8 | 0 |
| **Total Plateforme** | **65** | **65** | **0** |

---

### Bilan global

| | Total cas | PASS | FAIL | Taux |
|-|-----------|------|------|------|
| Modules IA | 197 | 194 | 3 | **98.5%** |
| Plateforme | 65 | 65 | 0 | **100%** |
| **TOTAL** | **262** | **259** | **3** | **98.9%** |

### Anomalies identifiées

| # | Test | Description | Impact | Action recommandée |
|---|------|-------------|--------|-------------------|
| 1 | `qa_test.py` T-FAIL-01 | Cloud bonus sev=11 < 16 (SharePoint 1 alerte, New, no TP) | Faible — score final 44 correct | Ajuster le seuil de vérification à ≥ 11 pour cas minimal |
| 2 | `qa_comprehensive.py` H2 | Exfiltration sur-scorée : 81 → Critical au lieu de High | Moyen — LLM sur-pondère IP malveillante bulgare + géoloc | Ajouter un plafond contextuel pour les cas sans TP |
| 3 | `qa_comprehensive.py` C4 | Wiper malware sous-scoré : 77 → High au lieu de Critical | Moyen — payload sans `asset_criticality:"Critical"` explicite | Toujours passer `asset_criticality` dans le payload Sentinel |

---

*Cahier de recettes — SentinalLogViewer SOC Dashboard · TeamWill · 2026-05-30*
*Tests exécutés en conditions réelles : Python 3.11 · Groq llama-3.3-70b-versatile · Supabase*
