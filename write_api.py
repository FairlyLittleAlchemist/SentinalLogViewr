import textwrap, pathlib

code = textwrap.dedent("""\
    from __future__ import annotations
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

    import uvicorn
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field
    from typing import List, Optional, Union
    from classifier import IncidentClassifier, ClassificationResult

    app = FastAPI(title="Sentinel Incident Classifier", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    _clf = IncidentClassifier()


    class ClassifyRequest(BaseModel):
        tactics:     Optional[Union[List[str], str]] = Field(default=None)
        techniques:  Optional[Union[List[str], str]] = Field(default=None)
        title:       Optional[str] = None
        description: Optional[str] = None


    class ClassifyResponse(BaseModel):
        category:       str
        confidence:     str
        matched_on:     str
        matched_values: List[str]
        description:    str


    class HealthResponse(BaseModel):
        status:     str
        version:    str
        categories: List[str]


    @app.get("/health", response_model=HealthResponse)
    def health():
        return HealthResponse(
            status="ok",
            version="1.0.0",
            categories=[
                "Malware",
                "Phishing",
                "Brute Force",
                "Acces non autorise",
                "Exfiltration de donnees",
            ],
        )


    @app.post("/classify", response_model=ClassifyResponse)
    def classify(req: ClassifyRequest):
        try:
            r = _clf.classify(
                tactics=req.tactics,
                techniques=req.techniques,
                title=req.title,
                description=req.description,
            )
            return ClassifyResponse(**r.to_dict())
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


    @app.post("/classify/payload", response_model=ClassifyResponse)
    def classify_payload(payload: dict):
        try:
            r = _clf.classify_from_payload(payload)
            return ClassifyResponse(**r.to_dict())
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


    if __name__ == "__main__":
        uvicorn.run("api:app", host="0.0.0.0", port=8001, reload=False)
""")

dest = pathlib.Path(r"C:\Users\Molka\Desktop\SentinelClassifiy\api.py")
dest.write_text(code, encoding="utf-8")
print(f"Written {dest} ({len(code)} bytes)")
