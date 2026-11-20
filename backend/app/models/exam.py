import json
import uuid
from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, Integer, String, Text
from sqlalchemy.orm import validates
from sqlalchemy.sql import func
from ..database import Base


class ExamStatus:
    DRAFT = "DRAFT"
    SCHEDULED = "SCHEDULED"
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"


class Exam(Base):
    __tablename__ = "exams"
    __table_args__ = (
        CheckConstraint(
            "(start_time IS NULL AND end_time IS NULL) OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)",
            name="ck_exams_time_window",
        ),
        CheckConstraint(
            "status IN ('DRAFT', 'SCHEDULED', 'ACTIVE', 'ENDED')",
            name="ck_exams_status",
        ),
        CheckConstraint(
            "violation_action IN ('warn', 'flag', 'terminate')",
            name="ck_exams_violation_action",
        ),
        CheckConstraint(
            "question_pool_mode IN ('fixed', 'dynamic_draw')",
            name="ck_exams_question_pool_mode",
        ),
        CheckConstraint(
            "max_attempts >= 1",
            name="ck_exams_max_attempts",
        ),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    question_ids = Column(Text, nullable=True)  # JSON array of selected question IDs
    wizard_config = Column(Text, nullable=True)  # JSON object for exam wizard settings
    start_time = Column(DateTime(timezone=True), nullable=True)
    end_time = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, nullable=False, default=ExamStatus.DRAFT)
    is_template = Column(Boolean, nullable=False, default=False)
    results_visible = Column(Boolean, nullable=False, default=False)
    digest_sent_at = Column(DateTime(timezone=True), nullable=True)

    # First-class operational & enforcement columns promoted from wizard_config
    max_attempts = Column(Integer, nullable=False, default=1)
    total_marks = Column(Integer, nullable=True)
    passing_marks = Column(Integer, nullable=True)
    violation_threshold = Column(Integer, nullable=False, default=3)
    violation_action = Column(String, nullable=False, default="warn")
    visible_before_start = Column(Boolean, nullable=False, default=False)
    question_pool_mode = Column(String, nullable=False, default="fixed")
    pool_draw_count = Column(Integer, nullable=True)

    created_by = Column(String, nullable=False)  # teacher user_id
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    @validates("wizard_config")
    def _sync_from_wizard_config(self, key, value):
        if value:
            try:
                cfg = json.loads(value) if isinstance(value, str) else value
                if isinstance(cfg, dict):
                    raw_att = cfg.get("maxAttempts") if cfg.get("maxAttempts") is not None else cfg.get("max_attempts")
                    if raw_att is not None:
                        self.max_attempts = max(1, int(raw_att))
                    raw_total = cfg.get("totalMarks") if cfg.get("totalMarks") is not None else cfg.get("total_marks")
                    if raw_total is not None and str(raw_total).isdigit():
                        self.total_marks = int(raw_total)
                    raw_pass = cfg.get("passingMarks") if cfg.get("passingMarks") is not None else cfg.get("passing_marks")
                    if raw_pass is not None and str(raw_pass).isdigit():
                        self.passing_marks = int(raw_pass)
                    raw_thresh = cfg.get("violationThreshold") if cfg.get("violationThreshold") is not None else cfg.get("violation_threshold")
                    if raw_thresh is not None:
                        self.violation_threshold = max(1, int(raw_thresh))
                    raw_act = cfg.get("violationAction") or cfg.get("violation_action")
                    if raw_act and str(raw_act).lower().strip() in ("warn", "flag", "terminate"):
                        self.violation_action = str(raw_act).lower().strip()
                    if "visibleBeforeStart" in cfg:
                        self.visible_before_start = bool(cfg["visibleBeforeStart"])
                    elif "publishImmediately" in cfg:
                        self.visible_before_start = bool(cfg["publishImmediately"])
                    raw_pool = cfg.get("questionPoolMode")
                    if raw_pool and str(raw_pool).lower().strip() in ("fixed", "dynamic_draw"):
                        self.question_pool_mode = str(raw_pool).lower().strip()
                    raw_k = cfg.get("poolDrawCount")
                    if raw_k is not None and str(raw_k).isdigit():
                        self.pool_draw_count = int(raw_k)
            except Exception:
                pass
        return value
