from fastapi import FastAPI
from schemas.inference import SnapshotInferenceRequest
from inference.pipeline import run_snapshot_inference

app = FastAPI(title="SmartProctor AI Worker")


@app.post("/infer/snapshot")
def infer_snapshot(data: SnapshotInferenceRequest):
    results = run_snapshot_inference(data.snapshot_path)

    return {
        "session_id": data.session_id,
        "student_id": data.student_id,
        "violations": results
    }
