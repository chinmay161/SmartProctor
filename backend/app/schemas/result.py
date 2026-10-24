from datetime import datetime
from pydantic import BaseModel


class ExamResultResponse(BaseModel):
    exam_id: str
    attempt_id: str
    status: str
    score: int | None
    out_of: int
    submitted_at: datetime | None
    evaluated: bool
    is_provisional: bool = False
    provisional_message: str | None = None


class StudentExamHistoryItemResponse(BaseModel):
    exam_id: str
    exam_title: str
    exam_status: str
    attempt_status: str
    started_at: datetime
    submitted_at: datetime | None
    end_time: datetime | None
    score: int | None
    out_of: int
    can_view_result: bool
    is_provisional: bool = False
    provisional_message: str | None = None
    max_attempts: int = 1
    attempts_used: int = 1
