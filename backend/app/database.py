from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = "sqlite:///./smartproctor.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}  # required for SQLite
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


def ensure_schema_compatibility() -> None:
    """Apply lightweight SQLite-safe schema updates for evolving models."""
    if not DATABASE_URL.startswith("sqlite"):
        return

    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    statements = []

    if "exams" in tables:
        exam_columns = {column["name"] for column in inspector.get_columns("exams")}
        if "description" not in exam_columns:
            statements.append("ALTER TABLE exams ADD COLUMN description VARCHAR")
        if "duration_minutes" not in exam_columns:
            statements.append("ALTER TABLE exams ADD COLUMN duration_minutes INTEGER")
        if "question_ids" not in exam_columns:
            statements.append("ALTER TABLE exams ADD COLUMN question_ids TEXT")
        if "wizard_config" not in exam_columns:
            statements.append("ALTER TABLE exams ADD COLUMN wizard_config TEXT")
        if "start_time" not in exam_columns:
            statements.append("ALTER TABLE exams ADD COLUMN start_time DATETIME")
        if "end_time" not in exam_columns:
            statements.append("ALTER TABLE exams ADD COLUMN end_time DATETIME")
        if "status" not in exam_columns:
            statements.append("ALTER TABLE exams ADD COLUMN status VARCHAR NOT NULL DEFAULT 'SCHEDULED'")
        if "results_visible" not in exam_columns:
            statements.append("ALTER TABLE exams ADD COLUMN results_visible BOOLEAN NOT NULL DEFAULT 0")

    if "exam_sessions" in tables:
        session_columns = {column["name"] for column in inspector.get_columns("exam_sessions")}
        if "status" not in session_columns:
            statements.append("ALTER TABLE exam_sessions ADD COLUMN status VARCHAR DEFAULT 'CREATED'")
        if "created_at" not in session_columns:
            statements.append("ALTER TABLE exam_sessions ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP")
        if "started_at" not in session_columns:
            statements.append("ALTER TABLE exam_sessions ADD COLUMN started_at DATETIME")
        if "ended_at" not in session_columns:
            statements.append("ALTER TABLE exam_sessions ADD COLUMN ended_at DATETIME")
        if "auto_terminated" not in session_columns:
            statements.append("ALTER TABLE exam_sessions ADD COLUMN auto_terminated BOOLEAN NOT NULL DEFAULT 0")
        if "termination_reason" not in session_columns:
            statements.append("ALTER TABLE exam_sessions ADD COLUMN termination_reason VARCHAR")
        if "last_heartbeat" not in session_columns:
            statements.append("ALTER TABLE exam_sessions ADD COLUMN last_heartbeat DATETIME")
        if "reconnect_allowed_until" not in session_columns:
            statements.append("ALTER TABLE exam_sessions ADD COLUMN reconnect_allowed_until DATETIME")
        if "reconnect_attempts" not in session_columns:
            statements.append("ALTER TABLE exam_sessions ADD COLUMN reconnect_attempts INTEGER NOT NULL DEFAULT 0")
        if "resumed_at" not in session_columns:
            statements.append("ALTER TABLE exam_sessions ADD COLUMN resumed_at DATETIME")
        if "attempt_id" not in session_columns:
            statements.append("ALTER TABLE exam_sessions ADD COLUMN attempt_id VARCHAR")

    if "exam_questions" in tables:
        exam_question_columns = {column["name"] for column in inspector.get_columns("exam_questions")}
        if "source_question_id" not in exam_question_columns:
            statements.append("ALTER TABLE exam_questions ADD COLUMN source_question_id VARCHAR")
        if "marks" not in exam_question_columns:
            statements.append("ALTER TABLE exam_questions ADD COLUMN marks INTEGER NOT NULL DEFAULT 1")

    if "exam_answers" in tables:
        exam_answer_columns = {column["name"] for column in inspector.get_columns("exam_answers")}
        if "auto_score" not in exam_answer_columns:
            statements.append("ALTER TABLE exam_answers ADD COLUMN auto_score INTEGER")
        if "manual_score" not in exam_answer_columns:
            statements.append("ALTER TABLE exam_answers ADD COLUMN manual_score INTEGER")
        if "final_score" not in exam_answer_columns:
            statements.append("ALTER TABLE exam_answers ADD COLUMN final_score INTEGER")
        if "max_score" not in exam_answer_columns:
            statements.append("ALTER TABLE exam_answers ADD COLUMN max_score INTEGER NOT NULL DEFAULT 1")
        if "is_overridden" not in exam_answer_columns:
            statements.append("ALTER TABLE exam_answers ADD COLUMN is_overridden BOOLEAN NOT NULL DEFAULT 0")
        if "graded_at" not in exam_answer_columns:
            statements.append("ALTER TABLE exam_answers ADD COLUMN graded_at DATETIME")

    if "exam_attempts" in tables:
        attempt_columns = {column["name"] for column in inspector.get_columns("exam_attempts")}
        if "auto_score_total" not in attempt_columns:
            statements.append("ALTER TABLE exam_attempts ADD COLUMN auto_score_total INTEGER")
        if "max_score_total" not in attempt_columns:
            statements.append("ALTER TABLE exam_attempts ADD COLUMN max_score_total INTEGER")
        if "evaluated_at" not in attempt_columns:
            statements.append("ALTER TABLE exam_attempts ADD COLUMN evaluated_at DATETIME")
        if "grading_version" not in attempt_columns:
            statements.append("ALTER TABLE exam_attempts ADD COLUMN grading_version INTEGER NOT NULL DEFAULT 0")

    if "violations" in tables:
        violation_columns = {column["name"] for column in inspector.get_columns("violations")}
        if "attempt_id" not in violation_columns:
            statements.append("ALTER TABLE violations ADD COLUMN attempt_id VARCHAR")
        if "timestamp" not in violation_columns:
            statements.append("ALTER TABLE violations ADD COLUMN timestamp DATETIME")

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))
        if "exam_questions" in tables:
            connection.execute(text("UPDATE exam_questions SET marks = 1 WHERE marks IS NULL"))
            connection.execute(
                text(
                    "UPDATE exam_questions "
                    "SET source_question_id = id "
                    "WHERE source_question_id IS NULL OR TRIM(source_question_id) = ''"
                )
            )

        # SQLite cannot alter CHECK constraints directly; rebuild table when status constraint is outdated.
        if "exam_attempts" in tables:
            create_sql = connection.execute(
                text("SELECT sql FROM sqlite_master WHERE type='table' AND name='exam_attempts'")
            ).scalar()
            create_sql_text = str(create_sql or "")
            has_partial_status = "PARTIALLY_EVALUATED" in create_sql_text
            if not has_partial_status:
                connection.execute(text("PRAGMA foreign_keys=OFF"))
                connection.execute(text("ALTER TABLE exam_attempts RENAME TO exam_attempts_old"))
                connection.execute(
                    text(
                        """
                        CREATE TABLE exam_attempts (
                            id VARCHAR NOT NULL PRIMARY KEY,
                            exam_id VARCHAR NOT NULL,
                            student_id VARCHAR NOT NULL,
                            status VARCHAR NOT NULL DEFAULT 'IN_PROGRESS',
                            start_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            auto_submit_time DATETIME NOT NULL,
                            submitted_at DATETIME,
                            score INTEGER,
                            auto_score_total INTEGER,
                            max_score_total INTEGER,
                            evaluated_at DATETIME,
                            grading_version INTEGER NOT NULL DEFAULT 0,
                            violation_count INTEGER NOT NULL DEFAULT 0,
                            is_flagged BOOLEAN NOT NULL DEFAULT 0,
                            flagged_at DATETIME,
                            flag_reason VARCHAR,
                            CONSTRAINT uq_exam_attempt_student_exam UNIQUE (student_id, exam_id),
                            CONSTRAINT ck_exam_attempt_status CHECK (status IN ('IN_PROGRESS', 'SUBMITTED', 'PARTIALLY_EVALUATED', 'EVALUATED')),
                            CONSTRAINT ck_exam_attempt_submitted_after_start CHECK (submitted_at IS NULL OR submitted_at >= start_time),
                            FOREIGN KEY(exam_id) REFERENCES exams (id)
                        )
                        """
                    )
                )
                connection.execute(
                    text(
                        """
                        INSERT INTO exam_attempts (
                            id, exam_id, student_id, status, start_time, auto_submit_time, submitted_at,
                            score, auto_score_total, max_score_total, evaluated_at, grading_version,
                            violation_count, is_flagged, flagged_at, flag_reason
                        )
                        SELECT
                            id, exam_id, student_id, status, start_time, auto_submit_time, submitted_at,
                            score, auto_score_total, max_score_total, evaluated_at, COALESCE(grading_version, 0),
                            COALESCE(violation_count, 0), COALESCE(is_flagged, 0), flagged_at, flag_reason
                        FROM exam_attempts_old
                        """
                    )
                )
                connection.execute(text("DROP TABLE exam_attempts_old"))
                connection.execute(text("CREATE INDEX IF NOT EXISTS ix_exam_attempts_exam_id ON exam_attempts (exam_id)"))
                connection.execute(text("CREATE INDEX IF NOT EXISTS ix_exam_attempts_student_id ON exam_attempts (student_id)"))
                connection.execute(text("PRAGMA foreign_keys=ON"))
