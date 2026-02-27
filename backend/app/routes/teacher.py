from fastapi import APIRouter, Depends
from ..auth.roles import require_role

router = APIRouter(prefix="/teacher", tags=["Teacher"])


@router.post("/create-exam")
def create_exam(
    user=Depends(require_role("teacher")),
):
    return {
        "message": "Exam created",
        "teacher": user["email"],
    }
