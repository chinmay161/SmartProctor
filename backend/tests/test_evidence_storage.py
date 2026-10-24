import base64
from datetime import datetime, timedelta, timezone
import pytest
from fastapi import HTTPException

from app.models.exam import Exam
from app.models.exam_session import ExamSession, SessionStatus
from app.models.violation import Violation
from app.routes.sessions import get_session_timeline, report_violation
from app.routes.violations import list_violations
from app.schemas.violation import ViolationReportRequest
from app.services.evidence_storage import (
    EvidenceStorage,
    LocalStorage,
    delete_evidence_item,
    purge_expired_evidence,
    resolve_evidence_field,
    set_evidence_storage,
)


class FakeMemoryStorage(EvidenceStorage):
    """In-memory storage backend for testing."""

    def __init__(self):
        self.saved: dict[str, bytes] = {}
        self.deleted: list[str] = []
        self.fail_save = False

    def save(self, data: bytes, key: str) -> str:
        if self.fail_save:
            raise RuntimeError("Fake storage write failure")
        clean_key = key.lstrip("/\\")
        self.saved[clean_key] = data
        return clean_key

    def resolve_url(self, stored_value: str | None) -> str | None:
        if not stored_value:
            return stored_value
        if stored_value.startswith("http://") or stored_value.startswith("https://"):
            return stored_value
        if stored_value.startswith("/evidence/"):
            return stored_value
        clean_key = stored_value.lstrip("/\\")
        return f"https://signed-storage.example.com/{clean_key}?token=mock_signature"

    def delete(self, key: str) -> None:
        if not key or key.startswith("/evidence/"):
            return
        clean_key = key.lstrip("/\\")
        self.deleted.append(clean_key)
        self.saved.pop(clean_key, None)


@pytest.fixture(autouse=True)
def _reset_storage():
    fake = FakeMemoryStorage()
    set_evidence_storage(fake)
    yield fake
    set_evidence_storage(None)


def _make_jpeg_bytes(length: int = 256) -> bytes:
    """Creates a dummy valid JPEG starting with FF D8 FF."""
    header = b"\xff\xd8\xff\xe0\x00\x10JFIF"
    if length <= len(header):
        return header[:length]
    return header + b"\x00" * (length - len(header))


def _make_base64_jpeg(length: int = 256) -> str:
    raw = _make_jpeg_bytes(length)
    return "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")


def test_key_format_and_storage(db, _reset_storage):
    storage: FakeMemoryStorage = _reset_storage
    exam = Exam(title="Storage Exam", created_by="teacher_1")
    db.add(exam)
    db.commit()

    session = ExamSession(
        exam_id=exam.id,
        student_id="student_123",
        status=SessionStatus.LIVE,
    )
    db.add(session)
    db.commit()

    payload = ViolationReportRequest(
        type="LOOK_AWAY",
        severity="minor",
        count=1,
        reason="Looking left",
        image=_make_base64_jpeg(500),
    )

    user = {"sub": "student_123", "roles": ["student"]}
    report_violation(session_id=session.id, payload=payload, user=user)

    v = db.query(Violation).filter_by(session_id=session.id).first()
    assert v is not None
    assert v.evidence_files is not None
    # Key must follow evidence/{exam_id}/{session_id}/{hex}.jpg
    assert v.evidence_files.startswith(f"evidence/{exam.id}/{session.id}/")
    assert v.evidence_files.endswith(".jpg")
    parts = v.evidence_files.split("/")
    assert len(parts) == 4
    uuid_part = parts[3].replace(".jpg", "")
    assert len(uuid_part) == 32  # uuid4().hex is 32 chars
    assert v.evidence_files in storage.saved


def test_key_format_unknown_exam(db, _reset_storage):
    exam = Exam(id="", title="Empty Exam", created_by="teacher_1")
    db.add(exam)
    db.commit()

    session = ExamSession(
        exam_id="",
        student_id="student_no_exam",
        status=SessionStatus.LIVE,
    )
    db.add(session)
    db.commit()

    payload = ViolationReportRequest(
        type="MULTIPLE_FACES",
        severity="major",
        count=1,
        image=_make_base64_jpeg(300),
    )
    user = {"sub": "student_no_exam", "roles": ["student"]}
    report_violation(session_id=session.id, payload=payload, user=user)

    v = db.query(Violation).filter_by(session_id=session.id).first()
    assert v is not None
    assert v.evidence_files.startswith(f"evidence/unknown/{session.id}/")


def test_legacy_passthrough(_reset_storage):
    fake_storage: FakeMemoryStorage = _reset_storage
    legacy_url = "/evidence/session_old_abc.jpg"

    # Fake storage should return legacy unchanged
    assert fake_storage.resolve_url(legacy_url) == legacy_url

    # LocalStorage should return legacy unchanged
    local_storage = LocalStorage()
    assert local_storage.resolve_url(legacy_url) == legacy_url

    # resolve_evidence_field should pass single legacy path unchanged
    assert resolve_evidence_field(legacy_url, fake_storage) == legacy_url

    # resolve_evidence_field should pass JSON list of legacy paths unchanged
    json_legacy = '["/evidence/pic1.jpg", "/evidence/pic2.jpg"]'
    resolved = resolve_evidence_field(json_legacy, fake_storage)
    assert resolved == json_legacy


def test_oversize_upload_rejected(db):
    session = ExamSession(
        exam_id="e1",
        student_id="student_123",
        status=SessionStatus.LIVE,
    )
    db.add(session)
    db.commit()

    # Create oversized JPEG (> 1 MB)
    oversized_data = _make_jpeg_bytes(1024 * 1024 + 100)
    oversized_b64 = "data:image/jpeg;base64," + base64.b64encode(oversized_data).decode("ascii")

    payload = ViolationReportRequest(
        type="PHONE_DETECTED",
        severity="severe",
        count=1,
        image=oversized_b64,
    )
    user = {"sub": "student_123", "roles": ["student"]}

    with pytest.raises(HTTPException) as exc_info:
        report_violation(session_id=session.id, payload=payload, user=user)

    assert exc_info.value.status_code == 400
    assert "1MB limit" in exc_info.value.detail


def test_non_jpeg_rejected(db):
    session = ExamSession(
        exam_id="e1",
        student_id="student_123",
        status=SessionStatus.LIVE,
    )
    db.add(session)
    db.commit()

    # PNG magic bytes (not JPEG)
    png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
    png_b64 = "data:image/png;base64," + base64.b64encode(png_bytes).decode("ascii")

    payload = ViolationReportRequest(
        type="PHONE_DETECTED",
        severity="severe",
        count=1,
        image=png_b64,
    )
    user = {"sub": "student_123", "roles": ["student"]}

    with pytest.raises(HTTPException) as exc_info:
        report_violation(session_id=session.id, payload=payload, user=user)

    assert exc_info.value.status_code == 400
    assert "valid JPEG" in exc_info.value.detail


def test_upload_failure_still_saves_violation(db, _reset_storage):
    storage: FakeMemoryStorage = _reset_storage
    storage.fail_save = True

    session = ExamSession(
        exam_id="e1",
        student_id="student_fail",
        status=SessionStatus.LIVE,
    )
    db.add(session)
    db.commit()

    payload = ViolationReportRequest(
        type="TAB_SWITCH",
        severity="minor",
        count=1,
        reason="Tab lost focus",
        image=_make_base64_jpeg(300),
    )
    user = {"sub": "student_fail", "roles": ["student"]}

    # Does not raise; returns updated session
    updated = report_violation(session_id=session.id, payload=payload, user=user)
    assert updated.id == session.id

    v = db.query(Violation).filter_by(session_id=session.id).first()
    assert v is not None
    assert v.type == "TAB_SWITCH"
    # Evidence file is None because upload failed, but the violation was saved!
    assert v.evidence_files is None


def test_retention_skips_pending_disputes(db, _reset_storage):
    storage: FakeMemoryStorage = _reset_storage

    now = datetime.now(timezone.utc)
    old_time = now - timedelta(days=45)
    recent_time = now - timedelta(days=5)

    storage.save(b"v1-bytes", "evidence/e1/s1/v1.jpg")
    storage.save(b"v2-bytes", "evidence/e1/s1/v2.jpg")
    storage.save(b"v3-bytes", "evidence/e1/s1/v3.jpg")
    storage.save(b"v4-bytes", "evidence/e1/s1/v4.jpg")

    # v1: old, NONE dispute -> should be purged
    v1 = Violation(
        id="v1",
        session_id="s1",
        student_id="st1",
        severity="minor",
        evidence_files="evidence/e1/s1/v1.jpg",
        dispute_status="NONE",
        timestamp=old_time,
    )
    # v2: old, PENDING dispute -> must be SKIPPED
    v2 = Violation(
        id="v2",
        session_id="s1",
        student_id="st2",
        severity="major",
        evidence_files="evidence/e1/s1/v2.jpg",
        dispute_status="PENDING",
        timestamp=old_time,
    )
    # v3: old, ACCEPTED dispute -> should be purged
    v3 = Violation(
        id="v3",
        session_id="s1",
        student_id="st3",
        severity="minor",
        evidence_files="evidence/e1/s1/v3.jpg",
        dispute_status="ACCEPTED",
        timestamp=old_time,
    )
    # v4: recent, NONE dispute -> not expired
    v4 = Violation(
        id="v4",
        session_id="s1",
        student_id="st4",
        severity="minor",
        evidence_files="evidence/e1/s1/v4.jpg",
        dispute_status="NONE",
        timestamp=recent_time,
    )

    db.add_all([v1, v2, v3, v4])
    db.commit()

    purged = purge_expired_evidence(db, retention_days=30, storage=storage, now=now)
    assert purged == 2

    db.refresh(v1)
    db.refresh(v2)
    db.refresh(v3)
    db.refresh(v4)

    # v1 & v3 evidence_files cleared in DB
    assert v1.evidence_files is None
    assert v3.evidence_files is None

    # v2 (PENDING) preserved in DB and storage
    assert v2.evidence_files == "evidence/e1/s1/v2.jpg"
    assert "evidence/e1/s1/v2.jpg" in storage.saved

    # v4 (recent) preserved in DB and storage
    assert v4.evidence_files == "evidence/e1/s1/v4.jpg"
    assert "evidence/e1/s1/v4.jpg" in storage.saved

    # Purged files removed from storage
    assert "evidence/e1/s1/v1.jpg" in storage.deleted
    assert "evidence/e1/s1/v3.jpg" in storage.deleted


def test_list_violations_resolution_and_permissions(db, _reset_storage):
    exam = Exam(title="Exam Auth", created_by="teacher_1")
    db.add(exam)
    db.commit()

    session = ExamSession(
        exam_id=exam.id,
        student_id="student_alice",
        status=SessionStatus.LIVE,
    )
    db.add(session)
    db.commit()

    v = Violation(
        session_id=session.id,
        student_id="student_alice",
        severity="minor",
        type="AUDIO_SPIKE",
        evidence_files=f"evidence/{exam.id}/{session.id}/pic.jpg",
    )
    db.add(v)
    db.commit()

    # Teacher can view and gets signed URL
    teacher_user = {"sub": "teacher_1", "roles": ["teacher"]}
    res_teacher = list_violations(session_id=session.id, user=teacher_user)
    assert len(res_teacher) == 1
    assert "signed-storage.example.com" in res_teacher[0]["evidence_files"]

    # Student Alice can view her own session
    alice_user = {"sub": "student_alice", "roles": ["student"]}
    res_alice = list_violations(session_id=session.id, user=alice_user)
    assert len(res_alice) == 1
    assert "signed-storage.example.com" in res_alice[0]["evidence_files"]

    # Student Bob is forbidden from viewing Alice's session
    bob_user = {"sub": "student_bob", "roles": ["student"]}
    with pytest.raises(HTTPException) as exc_info:
        list_violations(session_id=session.id, user=bob_user)
    assert exc_info.value.status_code == 403


def test_timeline_evidence_resolution(db, _reset_storage):
    exam = Exam(title="Timeline Exam", created_by="teacher_1")
    db.add(exam)
    db.commit()

    session = ExamSession(
        exam_id=exam.id,
        student_id="student_t",
        status=SessionStatus.LIVE,
    )
    db.add(session)
    db.commit()

    v = Violation(
        session_id=session.id,
        student_id="student_t",
        severity="minor",
        type="LOOK_AWAY",
        evidence_files=f"evidence/{exam.id}/{session.id}/frame.jpg",
    )
    db.add(v)
    db.commit()

    teacher_user = {"sub": "teacher_1", "roles": ["admin"]}
    timeline = get_session_timeline(session_id=session.id, user=teacher_user)
    violation_event = [item for item in timeline if item["event"] == "VIOLATION_RECORD"]
    assert len(violation_event) == 1
    evidence_list = violation_event[0]["data"]["evidence"]
    assert len(evidence_list) == 1
    assert "signed-storage.example.com" in evidence_list[0]
