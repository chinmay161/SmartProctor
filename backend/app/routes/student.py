from fastapi import APIRouter, Depends
from ..auth.roles import require_role

router = APIRouter(prefix="/student", tags=["Student"])


@router.get("/dashboard")
def student_dashboard(
    user=Depends(require_role("student")),
):
    return {
        "message": "Student dashboard",
        "email": user["email"],
    }
