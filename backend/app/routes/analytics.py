from fastapi import APIRouter, Depends
from fastapi.responses import Response, StreamingResponse
from ..database import SessionLocal
from ..auth.roles import require_role
from ..permissions.proctor_permissions import require_proctor
from ..services.analytics_service import get_exam_analytics, generate_csv_export, generate_pdf_export, get_exam_evidence

router = APIRouter(prefix="/exam-analytics", tags=["Analytics"])

@router.get("/{exam_id}")
def get_analytics(exam_id: str, user=Depends(require_role("teacher"))):
    db = SessionLocal()
    try:
        require_proctor(db, exam_id, user["sub"])
        return get_exam_analytics(db, exam_id)
    finally:
        db.close()

@router.get("/{exam_id}/export/csv")
def export_csv(exam_id: str, user=Depends(require_role("teacher"))):
    db = SessionLocal()
    try:
        require_proctor(db, exam_id, user["sub"])
        csv_data = generate_csv_export(db, exam_id)
        return Response(content=csv_data, media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=exam_{exam_id}_export.csv"})
    finally:
        db.close()

@router.get("/{exam_id}/export/pdf")
def export_pdf(exam_id: str, user=Depends(require_role("teacher"))):
    db = SessionLocal()
    try:
        require_proctor(db, exam_id, user["sub"])
        pdf_buffer = generate_pdf_export(db, exam_id)
        return StreamingResponse(pdf_buffer, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=exam_{exam_id}_report.pdf"})
    finally:
        db.close()

@router.get("/{exam_id}/evidence")
def get_evidence(exam_id: str, user=Depends(require_role("teacher"))):
    db = SessionLocal()
    try:
        require_proctor(db, exam_id, user["sub"])
        return get_exam_evidence(db, exam_id)
    finally:
        db.close()
