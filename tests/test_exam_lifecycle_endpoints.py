from fastapi.testclient import TestClient

from backend.app.auth.dependencies import get_current_user
from backend.app.database import Base, SessionLocal, engine
from backend.app.main import app
from backend.app.models.enrollment import ExamEnrollment
from backend.app.models.exam_attempt import ExamAttempt


current_user = {"sub": "teacher-1", "email": "teacher@example.com", "roles": ["teacher"]}


def override_current_user():
    return current_user


app.dependency_overrides[get_current_user] = override_current_user
client = TestClient(app)


def setup_function():
    app.dependency_overrides[get_current_user] = override_current_user
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def test_full_exam_flow_lifecycle():
    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    created = client.post(
        "/exams/",
        json={
            "title": "Flow Test",
            "duration_minutes": 30,
            "start_time": "2026-01-01T00:00:00Z",
            "end_time": "2099-01-01T00:00:00Z",
        },
    )
    assert created.status_code == 201
    exam_id = created.json()["id"]

    publish = client.patch(f"/exams/{exam_id}/publish", json={})
    assert publish.status_code == 200

    db = SessionLocal()
    db.add(ExamEnrollment(exam_id=exam_id, student_id="student-1"))
    db.commit()
    db.close()

    current_user.update({"sub": "student-1", "roles": ["student"]})
    start = client.post(f"/exams/{exam_id}/start")
    assert start.status_code == 200
    attempt_id = start.json()["attempt_id"]

    save = client.post(f"/attempts/{attempt_id}/save-answer", json={"question_id": "q1", "answer": "A"})
    assert save.status_code == 200

    submit = client.post(f"/attempts/{attempt_id}/submit")
    assert submit.status_code == 200

    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    publish_results = client.patch(f"/exams/{exam_id}/publish-results")
    assert publish_results.status_code == 403 or publish_results.status_code == 409

    end_exam = client.patch(f"/exams/{exam_id}/end")
    assert end_exam.status_code == 200
    publish_results = client.patch(f"/exams/{exam_id}/publish-results")
    assert publish_results.status_code == 200

    current_user.update({"sub": "student-1", "roles": ["student"]})
    result = client.get(f"/results/{exam_id}")
    assert result.status_code == 200
    assert result.json()["evaluated"] is True


def test_violation_ingestion_flags_attempt_after_threshold():
    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    created = client.post(
        "/exams/",
        json={
            "title": "Violation Test",
            "duration_minutes": 30,
            "start_time": "2026-01-01T00:00:00Z",
            "end_time": "2099-01-01T00:00:00Z",
        },
    )
    exam_id = created.json()["id"]
    client.patch(f"/exams/{exam_id}/publish", json={})

    db = SessionLocal()
    db.add(ExamEnrollment(exam_id=exam_id, student_id="student-1"))
    db.commit()
    db.close()

    current_user.update({"sub": "student-1", "roles": ["student"]})
    attempt_id = client.post(f"/exams/{exam_id}/start").json()["attempt_id"]

    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    payload = {
        "attempt_id": attempt_id,
        "type": "tab_switch",
        "timestamp": "2026-02-01T00:00:00Z",
        "snapshot_path": "/tmp/snap.jpg",
        "severity": "major",
    }
    for _ in range(3):
        response = client.post("/violations/", json=payload)
        assert response.status_code == 200

    db = SessionLocal()
    attempt = db.query(ExamAttempt).filter_by(id=attempt_id).first()
    db.close()
    assert attempt.violation_count >= 3
    assert attempt.is_flagged is True


def test_student_sees_exam_before_start_but_cannot_start():
    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    created = client.post(
        "/exams/",
        json={
            "title": "Upcoming Exam Visibility",
            "duration_minutes": 30,
            "start_time": "2099-01-01T00:00:00Z",
            "end_time": "2099-01-01T01:00:00Z",
        },
    )
    assert created.status_code == 201
    exam_id = created.json()["id"]

    db = SessionLocal()
    db.add(ExamEnrollment(exam_id=exam_id, student_id="student-1"))
    db.commit()
    db.close()

    current_user.update({"sub": "student-1", "roles": ["student"]})
    available = client.get("/exams/available")
    assert available.status_code == 200
    assert any(exam["id"] == exam_id for exam in available.json())

    start = client.post(f"/exams/{exam_id}/start")
    assert start.status_code == 403


def test_student_attempt_history_shows_result_visibility_and_score_masking():
    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    created = client.post(
        "/exams/",
        json={
            "title": "History Visibility",
            "duration_minutes": 30,
            "question_ids": ["q1", "q2", "q3"],
            "start_time": "2026-01-01T00:00:00Z",
            "end_time": "2099-01-01T00:00:00Z",
        },
    )
    assert created.status_code == 201
    exam_id = created.json()["id"]
    assert client.patch(f"/exams/{exam_id}/publish", json={}).status_code == 200

    db = SessionLocal()
    db.add(ExamEnrollment(exam_id=exam_id, student_id="student-1"))
    db.commit()
    db.close()

    current_user.update({"sub": "student-1", "roles": ["student"]})
    start = client.post(f"/exams/{exam_id}/start")
    assert start.status_code == 200
    attempt_id = start.json()["attempt_id"]
    assert client.post(f"/attempts/{attempt_id}/submit").status_code == 200

    hidden_history = client.get("/attempts/history")
    assert hidden_history.status_code == 200
    hidden_item = next(item for item in hidden_history.json() if item["exam_id"] == exam_id)
    assert hidden_item["can_view_result"] is False
    assert hidden_item["score"] is None
    assert hidden_item["out_of"] == 3

    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    assert client.patch(f"/exams/{exam_id}/end").status_code == 200
    assert client.patch(f"/exams/{exam_id}/publish-results").status_code == 200

    current_user.update({"sub": "student-1", "roles": ["student"]})
    visible_history = client.get("/attempts/history")
    assert visible_history.status_code == 200
    visible_item = next(item for item in visible_history.json() if item["exam_id"] == exam_id)
    assert visible_item["can_view_result"] is True
    assert visible_item["score"] == 0


def test_teacher_completed_exam_analytics_returns_metrics():
    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    seed_resp = client.get("/api/questions/")
    assert seed_resp.status_code == 200
    created = client.post(
        "/exams/",
        json={
            "title": "Analytics Metrics",
            "duration_minutes": 30,
            "question_ids": ["q1", "q2", "q3", "q4"],
            "start_time": "2026-01-01T00:00:00Z",
            "end_time": "2099-01-01T00:00:00Z",
        },
    )
    assert created.status_code == 201
    exam_id = created.json()["id"]
    assert client.patch(f"/exams/{exam_id}/publish", json={}).status_code == 200

    db = SessionLocal()
    db.add(ExamEnrollment(exam_id=exam_id, student_id="student-1"))
    db.add(ExamEnrollment(exam_id=exam_id, student_id="student-2"))
    db.add(ExamEnrollment(exam_id=exam_id, student_id="student-3"))
    db.commit()
    db.close()

    current_user.update({"sub": "student-1", "roles": ["student"]})
    attempt_1 = client.post(f"/exams/{exam_id}/start").json()["attempt_id"]
    assert client.post(f"/attempts/{attempt_1}/submit").status_code == 200

    current_user.update({"sub": "student-2", "roles": ["student"]})
    attempt_2 = client.post(f"/exams/{exam_id}/start").json()["attempt_id"]
    assert client.post(f"/attempts/{attempt_2}/submit").status_code == 200

    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    review_1 = client.get(f"/exams/{exam_id}/attempts/{attempt_1}")
    review_2 = client.get(f"/exams/{exam_id}/attempts/{attempt_2}")
    assert review_1.status_code == 200
    assert review_2.status_code == 200

    q1 = review_1.json()["questions"]
    q2 = review_2.json()["questions"]
    assert client.patch(
        f"/exams/{exam_id}/attempts/{attempt_1}/grade",
        json={
            "expected_grading_version": review_1.json()["grading_version"],
            "question_scores": [
                {"question_id": item["question_id"], "override_score": item["max_marks"]}
                if item["is_objective"]
                else {"question_id": item["question_id"], "manual_score": item["max_marks"]}
                for item in q1
            ],
        },
    ).status_code == 200
    assert client.patch(
        f"/exams/{exam_id}/attempts/{attempt_2}/grade",
        json={
            "expected_grading_version": review_2.json()["grading_version"],
            "question_scores": [
                {"question_id": item["question_id"], "override_score": 0}
                if item["is_objective"]
                else (
                    {"question_id": item["question_id"], "manual_score": 8}
                    if item["question_id"] == "q4"
                    else {"question_id": item["question_id"], "manual_score": 0}
                )
                for item in q2
            ],
        },
    ).status_code == 200

    severe_payload = {
        "attempt_id": attempt_1,
        "type": "face_absent",
        "timestamp": "2026-02-01T00:00:00Z",
        "snapshot_path": "/tmp/face.jpg",
        "severity": "severe",
    }
    major_payload = {
        "attempt_id": attempt_2,
        "type": "tab_switch",
        "timestamp": "2026-02-01T00:05:00Z",
        "snapshot_path": "/tmp/tab.jpg",
        "severity": "major",
    }
    assert client.post("/violations/", json=severe_payload).status_code == 200
    assert client.post("/violations/", json=major_payload).status_code == 200
    assert client.post("/violations/", json=major_payload).status_code == 200

    assert client.patch(f"/exams/{exam_id}/end").status_code == 200
    response = client.get(f"/exams/{exam_id}/analytics")
    assert response.status_code == 200
    payload = response.json()
    assert payload["attempt_count"] == 2
    assert payload["submitted_count"] == 2
    assert payload["evaluated_count"] == 2
    assert payload["not_started_count"] == 1
    assert payload["average_score_percent"] == 75.0
    assert payload["highest_score_percent"] == 100.0
    assert payload["lowest_score_percent"] == 50.0
    assert payload["grade_distribution"]["A"] == 1
    assert payload["grade_distribution"]["F"] == 1
    assert payload["total_violations"] == 3
    assert payload["violations_by_severity"]["severe"] == 1
    assert payload["violations_by_severity"]["major"] == 2
    assert payload["analytics_available"] is True


def test_teacher_completed_exam_analytics_no_data_returns_unavailable():
    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    created = client.post(
        "/exams/",
        json={
            "title": "No Data Analytics",
            "start_time": "2026-01-01T00:00:00Z",
            "end_time": "2099-01-01T00:00:00Z",
        },
    )
    assert created.status_code == 201
    exam_id = created.json()["id"]
    assert client.patch(f"/exams/{exam_id}/publish", json={}).status_code == 200
    assert client.patch(f"/exams/{exam_id}/end").status_code == 200

    response = client.get(f"/exams/{exam_id}/analytics")
    assert response.status_code == 200
    payload = response.json()
    assert payload["attempt_count"] == 0
    assert payload["submitted_count"] == 0
    assert payload["evaluated_count"] == 0
    assert payload["analytics_available"] is False
    assert payload["average_score_percent"] is None
    assert payload["highest_score_percent"] is None
    assert payload["lowest_score_percent"] is None


def test_violation_report_json_for_exam_owner():
    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    created = client.post(
        "/exams/",
        json={
            "title": "Violation JSON Report",
            "duration_minutes": 30,
            "start_time": "2026-01-01T00:00:00Z",
            "end_time": "2099-01-01T00:00:00Z",
        },
    )
    assert created.status_code == 201
    exam_id = created.json()["id"]
    assert client.patch(f"/exams/{exam_id}/publish", json={}).status_code == 200

    db = SessionLocal()
    db.add(ExamEnrollment(exam_id=exam_id, student_id="student-1"))
    db.commit()
    db.close()

    current_user.update({"sub": "student-1", "roles": ["student"]})
    attempt_id = client.post(f"/exams/{exam_id}/start").json()["attempt_id"]
    assert client.post(f"/attempts/{attempt_id}/submit").status_code == 200

    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    violation_payload = {
        "attempt_id": attempt_id,
        "type": "tab_switch",
        "timestamp": "2026-02-01T00:00:00Z",
        "snapshot_path": "/tmp/snap.jpg",
        "severity": "major",
    }
    assert client.post("/violations/", json=violation_payload).status_code == 200
    assert client.patch(f"/exams/{exam_id}/end").status_code == 200

    response = client.get(f"/exams/{exam_id}/violation-report?format=json&download=false")
    assert response.status_code == 200
    payload = response.json()
    assert payload["exam_id"] == exam_id
    assert payload["total_violations"] == 1
    assert payload["violations_by_severity"]["major"] == 1
    assert len(payload["rows"]) == 1
    assert payload["rows"][0]["student_id"] == "student-1"


def test_violation_report_csv_download_headers_and_content():
    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    created = client.post(
        "/exams/",
        json={
            "title": "Violation CSV Report",
            "start_time": "2026-01-01T00:00:00Z",
            "end_time": "2099-01-01T00:00:00Z",
        },
    )
    assert created.status_code == 201
    exam_id = created.json()["id"]
    assert client.patch(f"/exams/{exam_id}/publish", json={}).status_code == 200
    assert client.patch(f"/exams/{exam_id}/end").status_code == 200

    response = client.get(f"/exams/{exam_id}/violation-report?format=csv&download=true")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment; filename=" in response.headers.get("content-disposition", "")
    assert "student_id,attempt_ids,violation_count,flagged" in response.text


def test_publish_results_idempotent_already_released():
    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    created = client.post(
        "/exams/",
        json={
            "title": "Idempotent Release",
            "start_time": "2026-01-01T00:00:00Z",
            "end_time": "2099-01-01T00:00:00Z",
        },
    )
    assert created.status_code == 201
    exam_id = created.json()["id"]
    assert client.patch(f"/exams/{exam_id}/publish", json={}).status_code == 200
    assert client.patch(f"/exams/{exam_id}/end").status_code == 200

    first = client.patch(f"/exams/{exam_id}/publish-results")
    assert first.status_code == 200
    assert first.json()["already_released"] is False

    second = client.patch(f"/exams/{exam_id}/publish-results")
    assert second.status_code == 200
    assert second.json()["already_released"] is True


def test_analytics_and_report_forbidden_for_non_owner_teacher():
    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    created = client.post(
        "/exams/",
        json={
            "title": "Owner Scoped Metrics",
            "start_time": "2026-01-01T00:00:00Z",
            "end_time": "2099-01-01T00:00:00Z",
        },
    )
    assert created.status_code == 201
    exam_id = created.json()["id"]
    assert client.patch(f"/exams/{exam_id}/publish", json={}).status_code == 200
    assert client.patch(f"/exams/{exam_id}/end").status_code == 200

    current_user.update({"sub": "teacher-2", "roles": ["teacher"]})
    analytics = client.get(f"/exams/{exam_id}/analytics")
    assert analytics.status_code == 403
    report = client.get(f"/exams/{exam_id}/violation-report?format=json&download=false")
    assert report.status_code == 403


def test_analytics_includes_session_level_violations():
    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    created = client.post(
        "/exams/",
        json={
            "title": "Session Violations",
            "start_time": "2026-01-01T00:00:00Z",
            "end_time": "2099-01-01T00:00:00Z",
        },
    )
    assert created.status_code == 201
    exam_id = created.json()["id"]
    assert client.patch(f"/exams/{exam_id}/publish", json={}).status_code == 200

    db = SessionLocal()
    db.add(ExamEnrollment(exam_id=exam_id, student_id="student-1"))
    db.commit()
    db.close()

    current_user.update({"sub": "student-1", "roles": ["student"]})
    session = client.post(f"/sessions/{exam_id}/start")
    assert session.status_code == 200
    session_id = session.json()["session_id"]
    assert client.post(f"/sessions/session/{session_id}/violation?severity=major&count=2").status_code == 200

    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    assert client.patch(f"/exams/{exam_id}/end").status_code == 200
    analytics = client.get(f"/exams/{exam_id}/analytics")
    assert analytics.status_code == 200
    assert analytics.json()["total_violations"] >= 2


def test_mixed_exam_submit_is_partially_evaluated_then_can_be_completed():
    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    assert client.get("/api/questions/").status_code == 200
    created = client.post(
        "/exams/",
        json={
            "title": "Mixed Grading Flow",
            "duration_minutes": 30,
            "question_ids": ["q1", "q4"],
            "start_time": "2026-01-01T00:00:00Z",
            "end_time": "2099-01-01T00:00:00Z",
        },
    )
    assert created.status_code == 201
    exam_id = created.json()["id"]
    assert client.patch(f"/exams/{exam_id}/publish", json={}).status_code == 200

    db = SessionLocal()
    db.add(ExamEnrollment(exam_id=exam_id, student_id="student-1"))
    db.commit()
    db.close()

    current_user.update({"sub": "student-1", "roles": ["student"]})
    attempt_id = client.post(f"/exams/{exam_id}/start").json()["attempt_id"]
    assert client.post(f"/attempts/{attempt_id}/save-answer", json={"question_id": "q1", "answer": "a"}).status_code == 200
    submit = client.post(f"/attempts/{attempt_id}/submit")
    assert submit.status_code == 200
    assert submit.json()["status"] == "PARTIALLY_EVALUATED"

    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    review = client.get(f"/exams/{exam_id}/attempts/{attempt_id}")
    assert review.status_code == 200
    assert review.json()["status"] == "PARTIALLY_EVALUATED"

    essay = next(item for item in review.json()["questions"] if item["question_id"] == "q4")
    grade = client.patch(
        f"/exams/{exam_id}/attempts/{attempt_id}/grade",
        json={
            "expected_grading_version": review.json()["grading_version"],
            "question_scores": [{"question_id": essay["question_id"], "manual_score": essay["max_marks"]}],
        },
    )
    assert grade.status_code == 200
    assert grade.json()["status"] == "EVALUATED"


def test_grade_endpoint_rejects_stale_grading_version():
    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    assert client.get("/api/questions/").status_code == 200
    created = client.post(
        "/exams/",
        json={
            "title": "Version Guard",
            "duration_minutes": 30,
            "question_ids": ["q4"],
            "start_time": "2026-01-01T00:00:00Z",
            "end_time": "2099-01-01T00:00:00Z",
        },
    )
    exam_id = created.json()["id"]
    assert client.patch(f"/exams/{exam_id}/publish", json={}).status_code == 200

    db = SessionLocal()
    db.add(ExamEnrollment(exam_id=exam_id, student_id="student-1"))
    db.commit()
    db.close()

    current_user.update({"sub": "student-1", "roles": ["student"]})
    attempt_id = client.post(f"/exams/{exam_id}/start").json()["attempt_id"]
    assert client.post(f"/attempts/{attempt_id}/submit").status_code == 200

    current_user.update({"sub": "teacher-1", "roles": ["teacher"]})
    review = client.get(f"/exams/{exam_id}/attempts/{attempt_id}")
    version = review.json()["grading_version"]
    question_id = review.json()["questions"][0]["question_id"]
    assert client.patch(
        f"/exams/{exam_id}/attempts/{attempt_id}/grade",
        json={
            "expected_grading_version": version,
            "question_scores": [{"question_id": question_id, "manual_score": 1}],
        },
    ).status_code == 200

    stale = client.patch(
        f"/exams/{exam_id}/attempts/{attempt_id}/grade",
        json={
            "expected_grading_version": version,
            "question_scores": [{"question_id": question_id, "manual_score": 2}],
        },
    )
    assert stale.status_code == 409
