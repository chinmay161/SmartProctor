from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


ExamStatusLiteral = Literal["SCHEDULED", "ACTIVE", "ENDED"]


class ExamCreateRequest(BaseModel):
    title: str = Field(min_length=1)
    description: str | None = None
    duration_minutes: int | None = Field(default=None, ge=1)
    question_ids: list[str] = Field(default_factory=list)
    wizard_config: dict[str, Any] | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None

    @model_validator(mode="after")
    def validate_window(self):
        if (self.start_time is None) != (self.end_time is None):
            raise ValueError("start_time and end_time must both be set or both be null")
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class ExamUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    description: str | None = None
    duration_minutes: int | None = Field(default=None, ge=1)
    question_ids: list[str] | None = None
    wizard_config: dict[str, Any] | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None

    @model_validator(mode="after")
    def validate_window(self):
        if (self.start_time is None) != (self.end_time is None):
            raise ValueError("start_time and end_time must both be set or both be null")
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class ExamPublishRequest(BaseModel):
    start_time: datetime | None = None
    end_time: datetime | None = None


class ExamResponse(BaseModel):
    id: str
    title: str
    description: str | None
    duration_minutes: int | None
    question_ids: list[str] = Field(default_factory=list)
    wizard_config: dict[str, Any] | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    status: ExamStatusLiteral = "SCHEDULED"
    results_visible: bool = False
    submitted_count: int | None = None
    attempt_count: int | None = None
    evaluated_count: int | None = None
    violation_count: int | None = None
    average_score_percent: float | None = None
    created_by: str
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class GradeDistribution(BaseModel):
    A: int = 0
    B: int = 0
    C: int = 0
    D: int = 0
    F: int = 0


class CompletedExamAnalyticsResponse(BaseModel):
    exam_id: str
    title: str
    status: ExamStatusLiteral
    results_visible: bool
    attempt_count: int
    submitted_count: int
    evaluated_count: int
    not_started_count: int
    average_score_percent: float | None = None
    highest_score_percent: float | None = None
    lowest_score_percent: float | None = None
    grade_distribution: GradeDistribution
    total_violations: int
    violations_by_severity: dict[str, int]
    average_completion_minutes: float | None = None
    analytics_available: bool


class ViolationReportStudentRow(BaseModel):
    student_id: str
    attempt_ids: list[str]
    violation_count: int
    flagged: bool
    first_violation_at: datetime | None = None
    last_violation_at: datetime | None = None
    minor_count: int = 0
    major_count: int = 0
    severe_count: int = 0


class CompletedExamViolationReportResponse(BaseModel):
    exam_id: str
    exam_title: str
    status: ExamStatusLiteral
    results_visible: bool
    total_violations: int
    violations_by_severity: dict[str, int]
    violations_by_type: dict[str, int]
    generated_at: datetime
    rows: list[ViolationReportStudentRow]


class TeacherExamAttemptSummary(BaseModel):
    attempt_id: str
    student_id: str
    status: str
    score: int | None = None
    max_score_total: int | None = None
    submitted_at: datetime | None = None
    violation_count: int = 0
    is_flagged: bool = False
