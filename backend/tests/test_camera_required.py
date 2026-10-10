import json

import pytest

from app.models.exam import Exam
from app.models.exam_rules import ExamRules
from app.routes.exams import _serialize_exam
from app.services.exam_service import camera_required_for_exam, exam_requires_camera


@pytest.mark.parametrize(
    "wizard,expected",
    [
        (None, False),
        ({}, False),
        ({"enableWebcam": False, "detectNoFace": False}, False),
        ({"enableWebcam": True}, True),
        ({"detectNoFace": True}, True),
        ({"detectMultipleFaces": True}, True),
        ({"detectMobilePhone": True}, True),
        ({"audioMonitoring": True, "browserLockdown": True}, False),
    ],
)
def test_wizard_expression_when_no_rules_row(wizard, expected):
    assert exam_requires_camera(wizard, None) is expected


def test_rules_row_wins_over_wizard():
    assert exam_requires_camera({"enableWebcam": True}, ExamRules(exam_id="e", camera_required=False)) is False
    assert exam_requires_camera({}, ExamRules(exam_id="e", camera_required=True)) is True


def test_exam_response_exposes_camera_required(db):
    exam = Exam(title="t", created_by="teacher", wizard_config=json.dumps({"enableWebcam": True}))
    db.add(exam)
    db.commit()
    assert _serialize_exam(exam).camera_required is True
    assert camera_required_for_exam(db, exam) is True

    db.add(ExamRules(exam_id=exam.id, camera_required=False))
    db.commit()
    assert _serialize_exam(exam).camera_required is False
    assert camera_required_for_exam(db, exam) is False
