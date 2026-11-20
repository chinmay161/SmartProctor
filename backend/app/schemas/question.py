from pydantic import BaseModel, Field


class QuestionOption(BaseModel):
    text: str = ""
    isCorrect: bool = False


class QuestionCreateRequest(BaseModel):
    id: str | None = None
    type: str = Field(..., min_length=1)
    subject: str | None = None
    difficulty: str | None = None
    questionText: str = Field(..., min_length=1)
    options: list[QuestionOption] = Field(default_factory=list)
    correctAnswer: str | None = None
    acceptedAnswers: list[str] = Field(default_factory=list)
    explanation: str | None = None
    tags: list[str] = Field(default_factory=list)
    marks: int = Field(default=1, ge=1)


class QuestionImportRequest(BaseModel):
    questions: list[QuestionCreateRequest] = Field(default_factory=list)


class QuestionUpdateRequest(BaseModel):
    type: str | None = None
    subject: str | None = None
    difficulty: str | None = None
    questionText: str | None = None
    options: list[QuestionOption] | None = None
    correctAnswer: str | None = None
    acceptedAnswers: list[str] | None = None
    explanation: str | None = None
    tags: list[str] | None = None
    marks: int | None = Field(default=None, ge=1)

