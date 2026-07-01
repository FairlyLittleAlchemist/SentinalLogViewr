import textwrap, pathlib

code = textwrap.dedent("""\
    from __future__ import annotations
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

    import uvicorn
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field
    from typing import List, Optional, Union, Any
    from classifier import IncidentClassifier, ClassificationResult

    app = FastAPI(title="Sentinel Incident Classifier", version="1.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    _clf = IncidentClassifier()


    class ClassifyRequest(BaseModel):
        alert_id:    Optional[str] = None
        tactics:     Optional[Union[List[str], str]] = Field(default=None)
        techniques:  Optional[Union[List[str], str]] = Field(default=None)
        title:       Optional[str] = None
        description: Optional[str] = None


    @app.post("/classify")
    def classify(req: ClassifyRequest):
        try:
            r = _clf.classify(
                tactics=req.tactics,
                techniques=req.techniques,
                title=req.title,
                description=req.description,
            )
            # On fusionne le resultat avec l'alert_id reçu
            res = r.to_dict()
            res["alert_id"] = req.alert_id
            return res
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


    @app.post("/classify/payload")
    def classify_payload(payload: dict):
        try:
            # On cherche l'ID dans le payload
            alert_id = payload.get("AlertId") or payload.get("body", {}).get("AlertId")
            
            r = _clf.classify_from_payload(payload)
            res = r.to_dict()
            res["alert_id"] = alert_id
            return res
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


    if __name__ == "__main__":
        uvicorn.run("api:app", host="0.0.0.0", port=8001, reload=False)
""")

dest = pathlib.Path(r"C:\Users\Molka\Desktop\SentinelClassifiy\api.py")
dest.write_text(code, encoding="utf-8")
print(f"Updated {dest}")
