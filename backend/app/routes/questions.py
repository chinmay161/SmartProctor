import json
from fastapi import APIRouter, Depends, HTTPException

from ..auth.dependencies import get_current_user
from ..database import SessionLocal
from ..models.question import Question

router = APIRouter(prefix="/api/questions", tags=["Questions"])


def _require_question_access(user):
    roles = set(user.get("roles") or [])
    if not roles.intersection({"teacher", "student", "admin"}):
        raise HTTPException(status_code=403, detail="Insufficient permissions")


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
        "createdDate": created,
        "created_at": created,
    }


def _seed_questions_if_empty(db) -> None:
    has_questions = db.query(Question.id).first()
    if has_questions:
        return

    seed = [
        {
            "id": "q1",
            "type": "mcq",
            "subject": "mathematics",
            "difficulty": "easy",
            "question_text": "What is the derivative of x^2 with respect to x?",
            "options": [
                {"text": "2x", "isCorrect": True},
                {"text": "x", "isCorrect": False},
                {"text": "2", "isCorrect": False},
                {"text": "x^2", "isCorrect": False},
            ],
            "correct_answer": "2x",
            "accepted_answers": [],
            "explanation": "Using the power rule, d/dx(x^2) = 2x.",
            "tags": ["calculus", "derivatives"],
            "marks": 2,
        },
        {
            "id": "q2",
            "type": "fill-blank",
            "subject": "mathematics",
            "difficulty": "easy",
            "question_text": "Solve the equation: 2x + 5 = 15",
            "options": [],
            "correct_answer": "5",
            "accepted_answers": ["5"],
            "explanation": "2x = 10, therefore x = 5.",
            "tags": ["algebra", "equations"],
            "marks": 3,
        },
        {
            "id": "q3",
            "type": "true-false",
            "subject": "mathematics",
            "difficulty": "easy",
            "question_text": "The sum of angles in a triangle is always 180 degrees.",
            "options": [],
            "correct_answer": "true",
            "accepted_answers": ["true"],
            "explanation": "In Euclidean geometry, triangle angles sum to 180 degrees.",
            "tags": ["geometry", "triangles"],
            "marks": 1,
        },
        {
            "id": "q4",
            "type": "essay",
            "subject": "mathematics",
            "difficulty": "hard",
            "question_text": "Explain the fundamental theorem of calculus and one practical application.",
            "options": [],
            "correct_answer": "",
            "accepted_answers": [],
            "explanation": "Answer should cover the derivative-integral relationship and applied area.",
            "tags": ["calculus", "theory"],
            "marks": 10,
        },
        {
            "id": "q5",
            "type": "mcq",
            "subject": "mathematics",
            "difficulty": "medium",
            "question_text": "Calculate the integral of sin(x) from 0 to pi",
            "options": [
                {"text": "2", "isCorrect": True},
                {"text": "0", "isCorrect": False},
                {"text": "1", "isCorrect": False},
                {"text": "pi", "isCorrect": False},
            ],
            "correct_answer": "2",
            "accepted_answers": [],
            "explanation": "Integral of sin(x) from 0 to pi evaluates to 2.",
            "tags": ["calculus", "integration"],
            "marks": 4,
        },
        {
            "id": "q6",
            "type": "mcq",
            "subject": "statistics",
            "difficulty": "easy",
            "question_text": "What is the probability of getting heads in a fair coin toss?",
            "options": [
                {"text": "0.5", "isCorrect": True},
                {"text": "0.25", "isCorrect": False},
                {"text": "1", "isCorrect": False},
                {"text": "0.75", "isCorrect": False},
            ],
            "correct_answer": "0.5",
            "accepted_answers": [],
            "explanation": "A fair coin has two equally likely outcomes.",
            "tags": ["statistics", "probability"],
            "marks": 2,
        },
    ]

    for item in seed:
        db.add(
            Question(
                id=item["id"],
                type=item["type"],
                subject=item["subject"],
                difficulty=item["difficulty"],
                question_text=item["question_text"],
                options_json=json.dumps(item["options"]),
                correct_answer=item["correct_answer"],
                accepted_answers_json=json.dumps(item["accepted_answers"]),
                explanation=item["explanation"],
                tags_json=json.dumps(item["tags"]),
                marks=item["marks"],
                usage_count=0,
                avg_score=0,
                avg_time=0,
            )
        )
    db.commit()


@router.get("/")
def list_questions(user=Depends(get_current_user)):
    _require_question_access(user)
    db = SessionLocal()
    try:
        _seed_questions_if_empty(db)
        questions = db.query(Question).order_by(Question.created_at.desc()).all()
        return [_serialize_question(question) for question in questions]
    finally:
        db.close()


@router.get("/{question_id}")
def get_question(question_id: str, user=Depends(get_current_user)):
    _require_question_access(user)
    db = SessionLocal()
    try:
        _seed_questions_if_empty(db)
        question = db.query(Question).filter_by(id=question_id).first()
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")
        return _serialize_question(question)
    finally:
        db.close()
