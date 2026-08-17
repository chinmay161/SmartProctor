import json
from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException

from ..auth.roles import require_role
from ..database import SessionLocal
from ..models.exam import Exam
from ..models.exam_answer import ExamAnswer
from ..models.exam_attempt import ExamAttempt, AttemptStatus
from ..permissions.attempt_permissions import require_attempt_owner
from ..schemas.attempt import (
    AttemptStartResponse,
    EvaluateAttemptRequest,
    ResumeAttemptResponse,
    SaveAnswerRequest,
    SubmitAttemptResponse,
)
from ..schemas.result import ExamResultResponse
from ..services.attempt_service import evaluate_attempt, resume_attempt, start_exam_attempt, submit_attempt, save_answer
from ..schemas.result import StudentExamHistoryItemResponse

router = APIRouter(tags=["Attempts"])


def _count_questions(question_ids_json: str | None) -> int:
    if not question_ids_json:
        return 0
    try:
        parsed = json.loads(question_ids_json)
    except json.JSONDecodeError:
        return 0
    if not isinstance(parsed, list):
        return 0
    return len(parsed)


@router.post("/exams/{exam_id}/start", response_model=AttemptStartResponse)
def start_attempt(exam_id: str, user=Depends(require_role("student"))):
    db = SessionLocal()
    try:
        attempt = start_exam_attempt(db, exam_id, user["sub"])
        now = attempt.start_time
        auto_submit = attempt.auto_submit_time
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        if auto_submit.tzinfo is None:
            auto_submit = auto_submit.replace(tzinfo=timezone.utc)
        remaining = int((auto_submit - now).total_seconds())
        return AttemptStartResponse(
            attempt_id=attempt.id,
            auto_submit_time=attempt.auto_submit_time,
            duration_remaining_seconds=max(remaining, 0),
        )
    finally:
        db.close()


@router.post("/attempts/{attempt_id}/save-answer")
def save_answer_endpoint(attempt_id: str, payload: SaveAnswerRequest, user=Depends(require_role("student"))):
    db = SessionLocal()
    try:
        attempt = require_attempt_owner(db, attempt_id, user["sub"])
        answer = save_answer(db, attempt, payload.question_id, payload.answer)
        return {"status": "saved", "answer_id": answer.id, "last_saved_at": answer.last_saved_at}
    finally:
        db.close()


@router.post("/attempts/{attempt_id}/submit", response_model=SubmitAttemptResponse)
def submit_attempt_endpoint(attempt_id: str, user=Depends(require_role("student"))):
    db = SessionLocal()
    try:
        attempt = require_attempt_owner(db, attempt_id, user["sub"])
        submitted = submit_attempt(db, attempt)
        return SubmitAttemptResponse(
            attempt_id=submitted.id,
            status=submitted.status,
            submitted_at=submitted.submitted_at,
            score=submitted.score,
        )
    finally:
        db.close()


@router.get("/attempts/{exam_id}/resume", response_model=ResumeAttemptResponse)
def resume_exam_attempt(exam_id: str, user=Depends(require_role("student"))):
    db = SessionLocal()
    try:
        attempt, answers, remaining = resume_attempt(db, exam_id, user["sub"])
        serialized_answers = []
        for answer in answers:
            value = answer.answer
            try:
                value = json.loads(answer.answer) if answer.answer is not None else None
            except (TypeError, json.JSONDecodeError):
                value = answer.answer
            serialized_answers.append(
                {
                    "question_id": answer.question_id,
                    "answer": value,
                    "last_saved_at": answer.last_saved_at,
                }
            )
        return ResumeAttemptResponse(
            attempt_id=attempt.id,
            exam_id=attempt.exam_id,
            auto_submit_time=attempt.auto_submit_time,
            duration_remaining_seconds=remaining,
            saved_answers=serialized_answers,
        )
    finally:
        db.close()


@router.get("/attempts/history", response_model=list[StudentExamHistoryItemResponse])
def list_student_attempt_history(user=Depends(require_role("student"))):
    db = SessionLocal()
    try:
        attempts = (
            db.query(ExamAttempt)
            .filter_by(student_id=user["sub"])
            .filter(ExamAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.PARTIALLY_EVALUATED, AttemptStatus.EVALUATED]))
            .order_by(ExamAttempt.submitted_at.desc(), ExamAttempt.start_time.desc())
            .all()
        )
        if not attempts:
            return []

        exam_ids = list({attempt.exam_id for attempt in attempts})
        exams = db.query(Exam).filter(Exam.id.in_(exam_ids)).all()
        exam_by_id = {exam.id: exam for exam in exams}

        history: list[StudentExamHistoryItemResponse] = []
        for attempt in attempts:
            exam = exam_by_id.get(attempt.exam_id)
            if not exam:
                continue
            is_result_visible = bool(exam.results_visible and attempt.status == AttemptStatus.EVALUATED)
            history.append(
                StudentExamHistoryItemResponse(
                    exam_id=exam.id,
                    exam_title=exam.title,
                    exam_status=exam.status,
                    attempt_status=attempt.status,
                    started_at=attempt.start_time,
                    submitted_at=attempt.submitted_at,
                    end_time=exam.end_time,
                    score=attempt.score if is_result_visible else None,
                    out_of=_count_questions(exam.question_ids),
                    can_view_result=is_result_visible,
                )
            )

        return history
    finally:
        db.close()


@router.patch("/attempts/{attempt_id}/evaluate")
def evaluate_attempt_endpoint(
    attempt_id: str,
    payload: EvaluateAttemptRequest,
    user=Depends(require_role("teacher")),
):
    db = SessionLocal()
    try:
        attempt = evaluate_attempt(db, attempt_id, user["sub"], payload.score)
        return {"attempt_id": attempt.id, "status": attempt.status, "score": attempt.score}
    finally:
        db.close()


@router.get("/results/{exam_id}", response_model=ExamResultResponse)
def get_result(exam_id: str, user=Depends(require_role("student"))):
    db = SessionLocal()
    try:
        attempt = db.query(ExamAttempt).filter_by(exam_id=exam_id, student_id=user["sub"]).first()
        if not attempt:
            raise HTTPException(status_code=404, detail="Result not found")
        exam = db.query(Exam).filter_by(id=exam_id).first()
        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")
        if attempt.status != AttemptStatus.EVALUATED:
            raise HTTPException(status_code=403, detail="Result not available")
        if not exam.results_visible:
            raise HTTPException(status_code=403, detail="Results are not published")
        return ExamResultResponse(
            exam_id=exam_id,
            attempt_id=attempt.id,
            status=attempt.status,
            score=attempt.score,
            submitted_at=attempt.submitted_at,
            evaluated=True,
        )
    finally:
        db.close()
