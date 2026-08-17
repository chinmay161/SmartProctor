from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


AttemptStatusLiteral = Literal["IN_PROGRESS", "SUBMITTED", "PARTIALLY_EVALUATED", "EVALUATED"]


class AttemptStartResponse(BaseModel):
    attempt_id: str
    auto_submit_time: datetime
    duration_remaining_seconds: int


class SaveAnswerRequest(BaseModel):
    question_id: str = Field(min_length=1)
    answer: Any


class SubmitAttemptResponse(BaseModel):
    attempt_id: str
    status: AttemptStatusLiteral
    submitted_at: datetime
    score: int | None = None


class EvaluateAttemptRequest(BaseModel):
    score: int = Field(ge=0)


class AttemptReviewQuestionScorePatch(BaseModel):
    question_id: str = Field(min_length=1)
    manual_score: int | None = Field(default=None, ge=0)
    override_score: int | None = Field(default=None, ge=0)


class AttemptGradePatchRequest(BaseModel):
    expected_grading_version: int = Field(ge=0)
    question_scores: list[AttemptReviewQuestionScorePatch] = Field(default_factory=list)


class AttemptReviewQuestion(BaseModel):
    question_id: str
    source_question_id: str
    question_text: str
    question_type: str
    options: list[Any] = Field(default_factory=list)
    student_answer: Any = None
    correct_answer: Any = None
    is_objective: bool
    max_marks: int
    auto_score: int | None = None
    manual_score: int | None = None
    final_score: int | None = None
    is_overridden: bool = False


class AttemptReviewResponse(BaseModel):
    exam_id: str
    exam_title: str
    attempt_id: str
    student_id: str
    status: AttemptStatusLiteral
    score: int | None = None
    auto_score_total: int | None = None
    max_score_total: int | None = None
    grading_version: int
    read_only: bool
    submitted_at: datetime | None = None
    evaluated_at: datetime | None = None
    questions: list[AttemptReviewQuestion]


class AttemptResponse(BaseModel):
    id: str
    exam_id: str
    student_id: str
    status: AttemptStatusLiteral
    start_time: datetime
    auto_submit_time: datetime
    submitted_at: datetime | None
    score: int | None
    violation_count: int
    is_flagged: bool
    flagged_at: datetime | None = None
    flag_reason: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ResumeAttemptResponse(BaseModel):
    attempt_id: str
    exam_id: str
    auto_submit_time: datetime
    duration_remaining_seconds: int
    saved_answers: list[dict[str, Any]]
