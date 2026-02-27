import json
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models.enrollment import ExamEnrollment
from ..models.exam import Exam, ExamStatus
from ..models.exam_answer import ExamAnswer
from ..models.exam_attempt import AttemptStatus, ExamAttempt
from ..models.exam_question import ExamQuestion
from ..models.question import Question
from ..models.violation import Violation
from ..schemas.attempt import AttemptGradePatchRequest


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _ensure_exam_exists(db: Session, exam_id: str) -> Exam:
    exam = db.query(Exam).filter_by(id=exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    return exam


def _ensure_enrolled(db: Session, exam_id: str, student_id: str) -> None:
    total_rows = db.query(ExamEnrollment).filter_by(exam_id=exam_id).count()
    if total_rows == 0:
        return
    enrolled = db.query(ExamEnrollment).filter_by(exam_id=exam_id, student_id=student_id).first()
    if not enrolled:
        raise HTTPException(status_code=403, detail="Student not enrolled")


def _is_student_enrolled_or_open(db: Session, exam_id: str, student_id: str) -> bool:
    total_rows = db.query(ExamEnrollment).filter_by(exam_id=exam_id).count()
    if total_rows == 0:
        return True
    enrolled = db.query(ExamEnrollment).filter_by(exam_id=exam_id, student_id=student_id).first()
    return enrolled is not None


def _parse_question_ids(exam: Exam) -> list[str]:
    if not exam.question_ids:
        return []
    try:
        parsed = json.loads(exam.question_ids)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item) for item in parsed]


def _parse_json(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (dict, list, int, float, bool)):
        return value
    if not isinstance(value, str):
        return value
    raw = value.strip()
    if not raw:
        return raw
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return value


def _normalize_text(value: Any) -> str:
    return str(value or "").strip().lower()


def _is_objective_type(raw_type: str | None) -> bool:
    qtype = _normalize_text(raw_type)
    return qtype in {"mcq", "multiple-choice", "multiple_choice", "true-false", "true_false", "boolean"}


def _is_true_false_type(raw_type: str | None) -> bool:
    qtype = _normalize_text(raw_type)
    return qtype in {"true-false", "true_false", "boolean"}


def _is_mcq_type(raw_type: str | None) -> bool:
    qtype = _normalize_text(raw_type)
    return qtype in {"mcq", "multiple-choice", "multiple_choice"}


def _letter_for_index(index: int) -> str:
    return chr(ord("a") + index)


def _mcq_candidate_values(student_answer: Any, options: list[Any]) -> set[str]:
    normalized = set()
    raw = _normalize_text(student_answer)
    if raw:
        normalized.add(raw)

    if len(raw) == 1 and raw.isalpha():
        idx = ord(raw) - ord("a")
        if 0 <= idx < len(options):
            option = options[idx]
            text = option.get("text") if isinstance(option, dict) else option
            option_text = _normalize_text(text)
            if option_text:
                normalized.add(option_text)

    for idx, option in enumerate(options):
        option_text = _normalize_text(option.get("text") if isinstance(option, dict) else option)
        if option_text and raw == option_text:
            normalized.add(_letter_for_index(idx))
    return normalized


def _mcq_correct_values(question: ExamQuestion, options: list[Any]) -> set[str]:
    values = set()
    raw = _normalize_text(question.correct_answer)
    if raw:
        values.add(raw)
    if len(raw) == 1 and raw.isalpha():
        idx = ord(raw) - ord("a")
        if 0 <= idx < len(options):
            option = options[idx]
            option_text = _normalize_text(option.get("text") if isinstance(option, dict) else option)
            if option_text:
                values.add(option_text)
    for idx, option in enumerate(options):
        option_text = _normalize_text(option.get("text") if isinstance(option, dict) else option)
        if option_text and option_text == raw:
            values.add(_letter_for_index(idx))
    return values


def _score_objective_answer(question: ExamQuestion, answer_value: Any) -> int:
    max_marks = int(question.marks or 1)
    if _is_true_false_type(question.type):
        return max_marks if _normalize_text(answer_value) == _normalize_text(question.correct_answer) else 0

    if _is_mcq_type(question.type):
        options_raw = _parse_json(question.options)
        options = options_raw if isinstance(options_raw, list) else []
        student_values = _mcq_candidate_values(answer_value, options)
        correct_values = _mcq_correct_values(question, options)
        return max_marks if student_values.intersection(correct_values) else 0

    return 0


def _question_lookup_for_attempt(db: Session, attempt: ExamAttempt) -> tuple[list[ExamQuestion], dict[str, ExamQuestion]]:
    questions = (
        db.query(ExamQuestion)
        .filter_by(exam_id=attempt.exam_id)
        .order_by(ExamQuestion.created_at.asc(), ExamQuestion.id.asc())
        .all()
    )
    lookup: dict[str, ExamQuestion] = {}
    for question in questions:
        lookup[str(question.id)] = question
        lookup[str(question.source_question_id)] = question
    return questions, lookup


def _answer_lookup_for_attempt(db: Session, attempt: ExamAttempt) -> dict[str, ExamAnswer]:
    answers = db.query(ExamAnswer).filter_by(attempt_id=attempt.id).all()
    lookup: dict[str, ExamAnswer] = {}
    for answer in answers:
        lookup[str(answer.question_id)] = answer
    return lookup


def ensure_exam_question_snapshots(db: Session, exam: Exam) -> None:
    existing = db.query(ExamQuestion).filter_by(exam_id=exam.id).first()
    if existing:
        return

    question_ids = _parse_question_ids(exam)
    if not question_ids:
        return

    source_questions = db.query(Question).filter(Question.id.in_(question_ids)).all()
    by_id = {q.id: q for q in source_questions}

    for qid in question_ids:
        q = by_id.get(qid)
        if not q:
            continue
        db.add(
            ExamQuestion(
                exam_id=exam.id,
                source_question_id=q.id,
                question_text=q.question_text,
                type=q.type,
                options=q.options_json,
                correct_answer=q.correct_answer,
                marks=int(q.marks or 1),
            )
        )
    db.flush()


def sync_exam_status_for_now(exam: Exam, now_utc: datetime) -> bool:
    changed = False
    start = _as_utc(exam.start_time)
    end = _as_utc(exam.end_time)
    if start and end:
        if exam.status == ExamStatus.SCHEDULED and now_utc >= start and now_utc < end:
            exam.status = ExamStatus.ACTIVE
            changed = True
        if exam.status in (ExamStatus.SCHEDULED, ExamStatus.ACTIVE) and now_utc >= end:
            exam.status = ExamStatus.ENDED
            changed = True
    return changed


def publish_exam(db: Session, exam_id: str, owner_id: str, start_time: datetime | None = None, end_time: datetime | None = None) -> Exam:
    exam = _ensure_exam_exists(db, exam_id)
    if exam.created_by != owner_id:
        raise HTTPException(status_code=403, detail="Not exam owner")
    if exam.status != ExamStatus.SCHEDULED:
        raise HTTPException(status_code=409, detail="Exam can only be published from SCHEDULED")

    if start_time is not None:
        exam.start_time = _as_utc(start_time)
    if end_time is not None:
        exam.end_time = _as_utc(end_time)
    if not exam.start_time or not exam.end_time:
        raise HTTPException(status_code=400, detail="start_time and end_time are required for publish")
    if _as_utc(exam.end_time) <= _as_utc(exam.start_time):
        raise HTTPException(status_code=400, detail="end_time must be after start_time")

    exam.status = ExamStatus.ACTIVE
    db.commit()
    db.refresh(exam)
    return exam


def _hydrate_attempt_answers_for_all_questions(db: Session, attempt: ExamAttempt) -> list[tuple[ExamQuestion, ExamAnswer]]:
    questions, answer_question_lookup = _question_lookup_for_attempt(db, attempt)
    answer_lookup = _answer_lookup_for_attempt(db, attempt)
    pairs: list[tuple[ExamQuestion, ExamAnswer]] = []
    changed = False

    for question in questions:
        answer = (
            answer_lookup.get(str(question.source_question_id))
            or answer_lookup.get(str(question.id))
        )
        if not answer:
            answer = ExamAnswer(
                attempt_id=attempt.id,
                question_id=question.source_question_id,
                answer=None,
                max_score=int(question.marks or 1),
            )
            db.add(answer)
            changed = True
        elif answer.max_score is None or int(answer.max_score) != int(question.marks or 1):
            answer.max_score = int(question.marks or 1)
            changed = True
        pairs.append((question, answer))

    if changed:
        db.flush()
    return pairs


def _recompute_attempt_totals_and_status(attempt: ExamAttempt, pairs: list[tuple[ExamQuestion, ExamAnswer]], now_utc: datetime) -> None:
    max_score_total = sum(int(answer.max_score or 0) for _, answer in pairs)
    auto_score_total = sum(int(answer.auto_score or 0) for _, answer in pairs if answer.auto_score is not None)
    current_score = sum(int(answer.final_score or 0) for _, answer in pairs if answer.final_score is not None)

    has_subjective = any(not _is_objective_type(question.type) for question, _ in pairs)
    has_ungraded_subjective = any(
        not _is_objective_type(question.type) and answer.final_score is None
        for question, answer in pairs
    )

    attempt.auto_score_total = auto_score_total
    attempt.max_score_total = max_score_total
    attempt.score = current_score
    if has_subjective and has_ungraded_subjective:
        attempt.status = AttemptStatus.PARTIALLY_EVALUATED
        attempt.evaluated_at = None
    else:
        attempt.status = AttemptStatus.EVALUATED
        attempt.evaluated_at = now_utc


def auto_grade_on_submit(db: Session, attempt: ExamAttempt) -> ExamAttempt:
    now_utc = utcnow()
    pairs = _hydrate_attempt_answers_for_all_questions(db, attempt)
    has_subjective = False

    for question, answer in pairs:
        answer.max_score = int(question.marks or 1)
        parsed_answer = _parse_json(answer.answer)
        if _is_objective_type(question.type):
            computed = _score_objective_answer(question, parsed_answer)
            answer.auto_score = computed
            answer.final_score = computed if not answer.is_overridden else answer.final_score
            if answer.final_score is None:
                answer.final_score = computed
            answer.graded_at = now_utc
        else:
            has_subjective = True
            answer.auto_score = None
            if not answer.is_overridden:
                answer.final_score = answer.manual_score
        if answer.final_score is not None and int(answer.final_score) > int(answer.max_score):
            answer.final_score = int(answer.max_score)

    _recompute_attempt_totals_and_status(attempt, pairs, now_utc)
    if has_subjective and attempt.status == AttemptStatus.EVALUATED:
        attempt.status = AttemptStatus.PARTIALLY_EVALUATED
        attempt.evaluated_at = None
    return attempt


def submit_attempt_internal(db: Session, attempt: ExamAttempt, *, now: datetime | None = None, reason: str | None = None) -> ExamAttempt:
    now_utc = _as_utc(now) or utcnow()
    if attempt.status != AttemptStatus.IN_PROGRESS:
        return attempt
    attempt.status = AttemptStatus.SUBMITTED
    attempt.submitted_at = now_utc
    auto_grade_on_submit(db, attempt)
    if reason:
        attempt.flag_reason = reason if attempt.flag_reason is None else attempt.flag_reason
    db.commit()
    db.refresh(attempt)
    return attempt


def force_end_exam(db: Session, exam_id: str, owner_id: str) -> tuple[Exam, int]:
    exam = _ensure_exam_exists(db, exam_id)
    if exam.created_by != owner_id:
        raise HTTPException(status_code=403, detail="Not exam owner")
    if exam.status != ExamStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="Exam can only end from ACTIVE")

    exam.status = ExamStatus.ENDED
    now_utc = utcnow()
    count = 0
    attempts = db.query(ExamAttempt).filter_by(exam_id=exam_id, status=AttemptStatus.IN_PROGRESS).all()
    for attempt in attempts:
        submit_attempt_internal(db, attempt, now=now_utc, reason="exam_ended_by_teacher")
        count += 1

    db.commit()
    db.refresh(exam)
    return exam, count


def list_available_exams_for_student(db: Session, student_id: str) -> list[Exam]:
    now_utc = utcnow()
    exams = db.query(Exam).filter(Exam.start_time.is_not(None), Exam.end_time.is_not(None)).all()
    status_changed = False
    for exam in exams:
        status_changed = sync_exam_status_for_now(exam, now_utc) or status_changed
    if status_changed:
        db.commit()

    result: list[Exam] = []
    for exam in exams:
        if not _is_student_enrolled_or_open(db, exam.id, student_id):
            continue
        if not (now_utc < _as_utc(exam.end_time)):
            continue
        if exam.status not in (ExamStatus.SCHEDULED, ExamStatus.ACTIVE):
            continue

        submitted = (
            db.query(ExamAttempt)
            .filter_by(exam_id=exam.id, student_id=student_id)
            .filter(ExamAttempt.status.in_([AttemptStatus.SUBMITTED, AttemptStatus.PARTIALLY_EVALUATED, AttemptStatus.EVALUATED]))
            .first()
        )
        if not submitted:
            result.append(exam)
    return result


def start_exam_attempt(db: Session, exam_id: str, student_id: str) -> ExamAttempt:
    exam = _ensure_exam_exists(db, exam_id)
    _ensure_enrolled(db, exam_id, student_id)
    now_utc = utcnow()
    if sync_exam_status_for_now(exam, now_utc):
        db.commit()
        db.refresh(exam)
    if _as_utc(exam.start_time) is None or _as_utc(exam.end_time) is None:
        raise HTTPException(status_code=403, detail="Exam is not scheduled for attempts")
    if now_utc < _as_utc(exam.start_time):
        raise HTTPException(status_code=403, detail="Exam has not started")
    if now_utc >= _as_utc(exam.end_time):
        raise HTTPException(status_code=403, detail="Exam has ended")
    if exam.status != ExamStatus.ACTIVE:
        raise HTTPException(status_code=403, detail="Exam is not active")

    existing = db.query(ExamAttempt).filter_by(exam_id=exam_id, student_id=student_id).first()
    if existing:
        if existing.status in (AttemptStatus.SUBMITTED, AttemptStatus.PARTIALLY_EVALUATED, AttemptStatus.EVALUATED):
            raise HTTPException(status_code=403, detail="Attempt already submitted")
        return existing

    ensure_exam_question_snapshots(db, exam)

    duration = exam.duration_minutes or 0
    desired = now_utc + timedelta(minutes=duration)
    auto_submit_time = min(desired, _as_utc(exam.end_time))
    if auto_submit_time > _as_utc(exam.end_time):
        raise HTTPException(status_code=400, detail="Invalid auto_submit_time")

    attempt = ExamAttempt(
        exam_id=exam_id,
        student_id=student_id,
        status=AttemptStatus.IN_PROGRESS,
        start_time=now_utc,
        auto_submit_time=auto_submit_time,
    )
    try:
        db.add(attempt)
        db.commit()
        db.refresh(attempt)
        return attempt
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Attempt already exists")


def save_answer(db: Session, attempt: ExamAttempt, question_id: str, answer: Any) -> ExamAnswer:
    now_utc = utcnow()
    if attempt.status != AttemptStatus.IN_PROGRESS:
        raise HTTPException(status_code=403, detail="Attempt is not editable")
    if now_utc >= _as_utc(attempt.auto_submit_time):
        raise HTTPException(status_code=403, detail="Attempt has expired")

    questions, question_lookup = _question_lookup_for_attempt(db, attempt)
    question = question_lookup.get(str(question_id)) if questions else None
    target_question_id = str(question.source_question_id) if question else str(question_id)
    target_marks = int(question.marks or 1) if question else 1

    existing = (
        db.query(ExamAnswer)
        .filter_by(attempt_id=attempt.id, question_id=target_question_id)
        .first()
        or (db.query(ExamAnswer).filter_by(attempt_id=attempt.id, question_id=str(question.id)).first() if question else None)
    )
    payload = json.dumps(answer) if not isinstance(answer, str) else answer
    if existing:
        existing.answer = payload
        existing.max_score = target_marks
        existing.last_saved_at = now_utc
        db.commit()
        db.refresh(existing)
        return existing

    record = ExamAnswer(
        attempt_id=attempt.id,
        question_id=target_question_id,
        answer=payload,
        max_score=target_marks,
        last_saved_at=now_utc,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def submit_attempt(db: Session, attempt: ExamAttempt) -> ExamAttempt:
    now_utc = utcnow()
    if attempt.status != AttemptStatus.IN_PROGRESS:
        raise HTTPException(status_code=409, detail="Attempt cannot be submitted")
    if now_utc >= _as_utc(attempt.auto_submit_time):
        raise HTTPException(status_code=403, detail="Attempt expired")
    return submit_attempt_internal(db, attempt, now=now_utc)


def _require_attempt_for_teacher(db: Session, exam_id: str, attempt_id: str, teacher_id: str) -> tuple[Exam, ExamAttempt]:
    exam = _ensure_exam_exists(db, exam_id)
    if exam.created_by != teacher_id:
        raise HTTPException(status_code=403, detail="Not exam owner")
    attempt = db.query(ExamAttempt).filter_by(id=attempt_id, exam_id=exam_id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    return exam, attempt


def build_attempt_review_payload(db: Session, exam_id: str, attempt_id: str, teacher_id: str) -> dict[str, Any]:
    exam, attempt = _require_attempt_for_teacher(db, exam_id, attempt_id, teacher_id)
    pairs = _hydrate_attempt_answers_for_all_questions(db, attempt)
    questions_payload: list[dict[str, Any]] = []

    for question, answer in pairs:
        options = _parse_json(question.options)
        options_list = options if isinstance(options, list) else []
        student_answer = _parse_json(answer.answer)
        questions_payload.append(
            {
                "question_id": str(question.source_question_id),
                "source_question_id": str(question.source_question_id),
                "question_text": question.question_text,
                "question_type": question.type,
                "options": options_list,
                "student_answer": student_answer,
                "correct_answer": question.correct_answer if _is_objective_type(question.type) else None,
                "is_objective": _is_objective_type(question.type),
                "max_marks": int(answer.max_score or question.marks or 1),
                "auto_score": answer.auto_score,
                "manual_score": answer.manual_score,
                "final_score": answer.final_score,
                "is_overridden": bool(answer.is_overridden),
            }
        )

    db.commit()
    db.refresh(attempt)
    return {
        "exam_id": exam.id,
        "exam_title": exam.title,
        "attempt_id": attempt.id,
        "student_id": attempt.student_id,
        "status": attempt.status,
        "score": attempt.score,
        "auto_score_total": attempt.auto_score_total,
        "max_score_total": attempt.max_score_total,
        "grading_version": int(attempt.grading_version or 0),
        "read_only": attempt.status == AttemptStatus.EVALUATED,
        "submitted_at": attempt.submitted_at,
        "evaluated_at": attempt.evaluated_at,
        "questions": questions_payload,
    }


def apply_manual_grades(
    db: Session,
    exam_id: str,
    attempt_id: str,
    teacher_id: str,
    payload: AttemptGradePatchRequest,
) -> ExamAttempt:
    _, attempt = _require_attempt_for_teacher(db, exam_id, attempt_id, teacher_id)
    if attempt.status == AttemptStatus.IN_PROGRESS:
        raise HTTPException(status_code=409, detail="Attempt must be submitted before grading")
    if int(attempt.grading_version or 0) != int(payload.expected_grading_version):
        raise HTTPException(status_code=409, detail="Attempt grading version conflict")

    now_utc = utcnow()
    pairs = _hydrate_attempt_answers_for_all_questions(db, attempt)
    question_answer_by_id: dict[str, tuple[ExamQuestion, ExamAnswer]] = {}
    for question, answer in pairs:
        question_answer_by_id[str(question.id)] = (question, answer)
        question_answer_by_id[str(question.source_question_id)] = (question, answer)

    for update in payload.question_scores:
        pair = question_answer_by_id.get(str(update.question_id))
        if not pair:
            raise HTTPException(status_code=400, detail=f"Unknown question_id in payload: {update.question_id}")
        question, answer = pair
        max_score = int(answer.max_score or question.marks or 1)

        if update.override_score is not None:
            if int(update.override_score) > max_score:
                raise HTTPException(status_code=400, detail=f"Score exceeds max marks for question {update.question_id}")
            answer.final_score = int(update.override_score)
            answer.is_overridden = True
            if not _is_objective_type(question.type):
                answer.manual_score = int(update.override_score)
            answer.graded_at = now_utc
            continue

        if update.manual_score is not None:
            if int(update.manual_score) > max_score:
                raise HTTPException(status_code=400, detail=f"Score exceeds max marks for question {update.question_id}")
            answer.final_score = int(update.manual_score)
            if _is_objective_type(question.type):
                answer.is_overridden = True
            else:
                answer.manual_score = int(update.manual_score)
                answer.is_overridden = False
            answer.graded_at = now_utc

    _recompute_attempt_totals_and_status(attempt, pairs, now_utc)
    attempt.grading_version = int(attempt.grading_version or 0) + 1
    db.commit()
    db.refresh(attempt)
    return attempt


def evaluate_attempt(db: Session, attempt_id: str, teacher_id: str, score: int) -> ExamAttempt:
    attempt = db.query(ExamAttempt).filter_by(id=attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    exam = _ensure_exam_exists(db, attempt.exam_id)
    if exam.created_by != teacher_id:
        raise HTTPException(status_code=403, detail="Not exam owner")

    auto_grade_on_submit(db, attempt)
    if attempt.status != AttemptStatus.EVALUATED:
        raise HTTPException(status_code=409, detail="Use the per-question grading endpoint for attempts requiring manual grading")
    if score != int(attempt.score or 0):
        raise HTTPException(
            status_code=409,
            detail="Legacy evaluate endpoint no longer accepts arbitrary total score; use deterministic grading results",
        )

    db.commit()
    db.refresh(attempt)
    return attempt


def resume_attempt(db: Session, exam_id: str, student_id: str) -> tuple[ExamAttempt, list[ExamAnswer], int]:
    now_utc = utcnow()
    attempt = db.query(ExamAttempt).filter_by(exam_id=exam_id, student_id=student_id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt.status != AttemptStatus.IN_PROGRESS:
        raise HTTPException(status_code=403, detail="Attempt is not resumable")
    if now_utc >= _as_utc(attempt.auto_submit_time):
        raise HTTPException(status_code=403, detail="Attempt has expired")
    remaining = int((_as_utc(attempt.auto_submit_time) - now_utc).total_seconds())
    answers = db.query(ExamAnswer).filter_by(attempt_id=attempt.id).all()
    return attempt, answers, max(remaining, 0)


def process_expired_attempts(db: Session, *, now: datetime | None = None) -> int:
    now_utc = _as_utc(now) or utcnow()
    attempts = (
        db.query(ExamAttempt)
        .filter_by(status=AttemptStatus.IN_PROGRESS)
        .filter(ExamAttempt.auto_submit_time <= now_utc)
        .all()
    )
    count = 0
    for attempt in attempts:
        submit_attempt_internal(db, attempt, now=now_utc, reason="auto_submit")
        count += 1
    return count


def ingest_violation(
    db: Session,
    *,
    attempt_id: str | None,
    session_id: str | None,
    student_id: str,
    violation_type: str,
    violation_timestamp: datetime,
    snapshot_path: str | None,
    severity: str,
) -> Violation:
    attempt = None
    if attempt_id:
        attempt = db.query(ExamAttempt).filter_by(id=attempt_id).first()
        if not attempt:
            raise HTTPException(status_code=404, detail="Attempt not found")

    violation = Violation(
        attempt_id=attempt_id,
        session_id=session_id,
        student_id=student_id,
        type=violation_type,
        timestamp=_as_utc(violation_timestamp) or utcnow(),
        details=snapshot_path,
        severity=severity,
        source="ai",
        count=1,
    )
    db.add(violation)

    if attempt:
        attempt.violation_count = (attempt.violation_count or 0) + 1
        threshold = 3
        if attempt.violation_count >= threshold:
            attempt.is_flagged = True
            attempt.flagged_at = utcnow()
            attempt.flag_reason = f"{severity}_threshold_exceeded"

    db.commit()
    db.refresh(violation)
    return violation
