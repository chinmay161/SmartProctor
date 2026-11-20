import json

from fastapi import APIRouter, Depends, HTTPException

from ..auth.dependencies import canonicalize_role, get_current_user
from ..auth.roles import deny_access
from ..database import SessionLocal
from ..models.exam_question import ExamQuestion
from ..models.question import Question
from ..schemas.question import (
    QuestionCreateRequest,
    QuestionImportRequest,
    QuestionUpdateRequest,
)

router = APIRouter(prefix="/api/questions", tags=["Questions"])


def _require_question_access(user):
    """Only teachers and admins can access the question bank."""
    required = ["teacher", "admin"]
    roles = {canonicalize_role(r) for r in (user.get("roles") or [])}
    if not roles.intersection(required):
        deny_access(user, required)


def _require_question_write_access(user):
    required = ["teacher", "admin"]
    roles = {canonicalize_role(r) for r in (user.get("roles") or [])}
    if not roles.intersection(required):
        deny_access(user, required)


def _serialize_question_for_student(question) -> dict:
    options = []
    raw_options = None
    if hasattr(question, "options_json") and question.options_json:
        try:
            raw_options = json.loads(question.options_json)
        except Exception:
            raw_options = []
    elif hasattr(question, "options") and question.options:
        if isinstance(question.options, str):
            try:
                raw_options = json.loads(question.options)
            except Exception:
                raw_options = []
        elif isinstance(question.options, list):
            raw_options = question.options

    if isinstance(raw_options, list):
        for opt in raw_options:
            if isinstance(opt, dict):
                options.append({"text": opt.get("text", "")})
            else:
                options.append({"text": str(opt)})

    q_text = getattr(question, "question_text", None) or getattr(question, "text", "")
    q_id = getattr(question, "source_question_id", None) or str(question.id)

    return {
        "id": q_id,
        "type": getattr(question, "type", "mcq"),
        "subject": getattr(question, "subject", None),
        "difficulty": getattr(question, "difficulty", None),
        "questionText": q_text,
        "text": q_text,
        "options": options,
        "correctAnswer": None,
        "acceptedAnswers": [],
        "explanation": None,
        "tags": [],
        "marks": int(getattr(question, "marks", 1) or 1),
    }


def _serialize_question(question: Question) -> dict:
    options = []
    accepted_answers = []
    tags = []

    if question.options_json:
        try:
            parsed = json.loads(question.options_json)
            if isinstance(parsed, list):
                options = parsed
        except json.JSONDecodeError:
            options = []

    if question.accepted_answers_json:
        try:
            parsed = json.loads(question.accepted_answers_json)
            if isinstance(parsed, list):
                accepted_answers = [str(item) for item in parsed]
        except json.JSONDecodeError:
            accepted_answers = []

    if question.tags_json:
        try:
            parsed = json.loads(question.tags_json)
            if isinstance(parsed, list):
                tags = [str(item) for item in parsed]
        except json.JSONDecodeError:
            tags = []

    created = question.created_at.isoformat() if question.created_at else None
    return {
        "id": question.id,
        "type": question.type,
        "subject": question.subject,
        "difficulty": question.difficulty,
        "questionText": question.question_text,
        "text": question.question_text,
        "options": options,
        "correctAnswer": question.correct_answer,
        "acceptedAnswers": accepted_answers,
        "explanation": question.explanation,
        "tags": tags,
        "marks": question.marks,
        "usageCount": question.usage_count,
        "avgScore": question.avg_score,
        "avgTime": question.avg_time,
        "created_by": question.created_by,
        "createdDate": created,
        "created_at": created,
    }


def _normalize_question_type(question_type: str) -> str:
    normalized = (question_type or "").strip().lower()
    if normalized == "subjective":
        return "essay"
    return normalized


def _build_question_model(payload: QuestionCreateRequest, user: dict | None = None) -> Question:
    question_type = _normalize_question_type(payload.type)
    question_text = payload.questionText.strip()
    if not question_text:
        raise HTTPException(status_code=400, detail="Question text is required")

    options = []
    for option in payload.options:
        text = option.text.strip()
        if text:
            options.append({"text": text, "isCorrect": bool(option.isCorrect)})

    accepted_answers = [answer.strip() for answer in payload.acceptedAnswers if str(answer).strip()]
    tags = [tag.strip() for tag in payload.tags if str(tag).strip()]
    correct_answer = (payload.correctAnswer or "").strip()

    if question_type == "mcq":
        if len(options) < 2:
            raise HTTPException(status_code=400, detail="MCQ questions need at least two options")
        correct_options = [option["text"] for option in options if option["isCorrect"]]
        if not correct_options and correct_answer:
            correct_options = [correct_answer]
            options = [
                {**option, "isCorrect": option["text"] == correct_answer}
                for option in options
            ]
        if not correct_options:
            raise HTTPException(status_code=400, detail="Select one correct option for MCQ questions")
        correct_answer = correct_options[0]
    elif question_type == "true-false":
        normalized_answer = correct_answer.lower()
        if normalized_answer not in {"true", "false"}:
            raise HTTPException(status_code=400, detail="True/False questions must define a true or false answer")
        correct_answer = normalized_answer
        accepted_answers = [normalized_answer]
        options = []
    elif question_type == "fill-blank":
        if not accepted_answers and correct_answer:
            accepted_answers = [correct_answer]
        if not accepted_answers:
            raise HTTPException(status_code=400, detail="Fill in the blank questions need at least one accepted answer")
        correct_answer = accepted_answers[0]
        options = []
    elif question_type == "essay":
        correct_answer = correct_answer or ""
        accepted_answers = []
        options = []
    else:
        raise HTTPException(status_code=400, detail="Unsupported question type")

    creator_id = user.get("sub") if user else None

    return Question(
        id=(payload.id or None),
        type=question_type,
        subject=(payload.subject or "").strip() or None,
        difficulty=(payload.difficulty or "").strip() or None,
        question_text=question_text,
        options_json=json.dumps(options),
        correct_answer=correct_answer or None,
        accepted_answers_json=json.dumps(accepted_answers),
        explanation=(payload.explanation or "").strip() or None,
        tags_json=json.dumps(tags),
        marks=payload.marks,
        usage_count=0,
        avg_score=0,
        avg_time=0,
        created_by=creator_id,
    )


@router.get("/stats")
def get_question_stats(user=Depends(get_current_user)):
    """Return aggregated statistics for questions visible to the user."""
    _require_question_access(user)
    roles = {canonicalize_role(r) for r in (user.get("roles") or [])}
    db = SessionLocal()
    try:
        query = db.query(Question)
        if "admin" not in roles:
            query = query.filter(Question.created_by == user["sub"])
        questions = query.all()

        total = len(questions)
        mcq_count = sum(1 for q in questions if q.type in ("mcq", "multiple-choice"))
        essay_count = sum(1 for q in questions if q.type == "essay")
        scores = [q.avg_score for q in questions if q.avg_score is not None]
        avg_perf = round(sum(scores) / len(scores)) if scores else 0

        return {
            "totalQuestions": total,
            "mcqCount": mcq_count,
            "essayCount": essay_count,
            "avgPerformance": avg_perf,
        }
    finally:
        db.close()


@router.get("/")
def list_questions(user=Depends(get_current_user)):
    """List questions visible to the user: teachers only see their own questions, admins see all."""
    _require_question_access(user)
    roles = {canonicalize_role(r) for r in (user.get("roles") or [])}
    db = SessionLocal()
    try:
        query = db.query(Question)
        if "admin" not in roles:
            query = query.filter(Question.created_by == user["sub"])
        questions = query.order_by(Question.created_at.desc()).all()
        return [_serialize_question(question) for question in questions]
    finally:
        db.close()


@router.get("/{question_id}")
def get_question(question_id: str, user=Depends(get_current_user)):
    """Get a specific question by ID if owned by the teacher or if user is admin; students get sanitized view."""
    roles = {canonicalize_role(r) for r in (user.get("roles") or [])}
    db = SessionLocal()
    try:
        if "student" in roles and "teacher" not in roles and "admin" not in roles:
            # Student view: sanitized question without correct answers
            question = db.query(Question).filter_by(id=question_id).first()
            if not question:
                eq = db.query(ExamQuestion).filter(
                    (ExamQuestion.id == question_id) | (ExamQuestion.source_question_id == question_id)
                ).first()
                if eq:
                    return _serialize_question_for_student(eq)
                raise HTTPException(status_code=404, detail="Question not found")
            return _serialize_question_for_student(question)

        _require_question_access(user)
        query = db.query(Question).filter_by(id=question_id)
        if "admin" not in roles:
            query = query.filter(Question.created_by == user["sub"])
        question = query.first()
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")
        return _serialize_question(question)
    finally:
        db.close()


@router.post("/")
def create_question(payload: QuestionCreateRequest, user=Depends(get_current_user)):
    """Create a new question scoped to the calling teacher."""
    _require_question_write_access(user)
    db = SessionLocal()
    try:
        question = _build_question_model(payload, user=user)
        if question.id and db.query(Question.id).filter_by(id=question.id).first():
            raise HTTPException(status_code=409, detail="Question ID already exists")
        db.add(question)
        db.commit()
        db.refresh(question)
        return _serialize_question(question)
    finally:
        db.close()


@router.put("/{question_id}")
def update_question(
    question_id: str,
    payload: QuestionUpdateRequest,
    user=Depends(get_current_user),
):
    """Update a question owned by the calling teacher (or any question if admin)."""
    _require_question_write_access(user)
    roles = {canonicalize_role(r) for r in (user.get("roles") or [])}
    db = SessionLocal()
    try:
        query = db.query(Question).filter_by(id=question_id)
        if "admin" not in roles:
            query = query.filter(Question.created_by == user["sub"])
        question = query.first()
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")

        if payload.questionText is not None:
            text = payload.questionText.strip()
            if not text:
                raise HTTPException(status_code=400, detail="Question text cannot be empty")
            question.question_text = text

        if payload.type is not None:
            question.type = _normalize_question_type(payload.type)

        if payload.subject is not None:
            question.subject = payload.subject.strip() or None

        if payload.difficulty is not None:
            question.difficulty = payload.difficulty.strip() or None

        if payload.options is not None:
            options = []
            for option in payload.options:
                otext = option.text.strip()
                if otext:
                    options.append({"text": otext, "isCorrect": bool(option.isCorrect)})
            question.options_json = json.dumps(options)

        if payload.correctAnswer is not None:
            question.correct_answer = payload.correctAnswer.strip() or None

        if payload.acceptedAnswers is not None:
            answers = [str(a).strip() for a in payload.acceptedAnswers if str(a).strip()]
            question.accepted_answers_json = json.dumps(answers)

        if payload.explanation is not None:
            question.explanation = payload.explanation.strip() or None

        if payload.tags is not None:
            tags = [str(t).strip() for t in payload.tags if str(t).strip()]
            question.tags_json = json.dumps(tags)

        if payload.marks is not None:
            if payload.marks < 1:
                raise HTTPException(status_code=400, detail="Marks must be at least 1")
            question.marks = payload.marks

        db.commit()
        db.refresh(question)
        return _serialize_question(question)
    finally:
        db.close()


@router.delete("/{question_id}")
def delete_question(question_id: str, user=Depends(get_current_user)):
    """Delete a question owned by the calling teacher (or any question if admin)."""
    _require_question_write_access(user)
    roles = {canonicalize_role(r) for r in (user.get("roles") or [])}
    db = SessionLocal()
    try:
        query = db.query(Question).filter_by(id=question_id)
        if "admin" not in roles:
            query = query.filter(Question.created_by == user["sub"])
        question = query.first()
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")

        db.delete(question)
        db.commit()
        return {"message": "Question deleted successfully", "id": question_id}
    finally:
        db.close()


@router.post("/import")
def import_questions(payload: QuestionImportRequest, user=Depends(get_current_user)):
    """Import a list of questions, associating them with the calling teacher."""
    _require_question_write_access(user)
    if not payload.questions:
        raise HTTPException(status_code=400, detail="No questions provided for import")

    db = SessionLocal()
    try:
        ids_in_payload = [item.id for item in payload.questions if item.id]
        if len(ids_in_payload) != len(set(ids_in_payload)):
            raise HTTPException(status_code=400, detail="Imported questions contain duplicate IDs")

        existing_ids = set()
        if ids_in_payload:
            rows = db.query(Question.id).filter(Question.id.in_(ids_in_payload)).all()
            existing_ids = {row[0] for row in rows}
        if existing_ids:
            raise HTTPException(
                status_code=409,
                detail=f"Question IDs already exist: {', '.join(sorted(existing_ids))}",
            )

        created_questions = []
        for item in payload.questions:
            question = _build_question_model(item, user=user)
            db.add(question)
            created_questions.append(question)

        db.commit()

        for question in created_questions:
            db.refresh(question)

        return [_serialize_question(question) for question in created_questions]
    finally:
        db.close()
