try:
    from apscheduler.schedulers.background import BackgroundScheduler
except ImportError:  # pragma: no cover - fallback for environments without optional dependency
    BackgroundScheduler = None

from ..database import SessionLocal
from .attempt_service import process_expired_attempts
from .evidence_storage import purge_expired_evidence
from .telemetry_service import purge_expired_events


class AutoSubmitWorker:
    def __init__(self) -> None:
        self.scheduler = BackgroundScheduler(timezone="UTC") if BackgroundScheduler else None
        self.started = False

    def start(self) -> None:
        if self.started:
            return
        self.run_once()
        self.run_retention()
        self.run_event_retention()
        if self.scheduler:
            self.scheduler.add_job(self.run_once, "interval", seconds=30, id="exam_auto_submit", replace_existing=True)
            self.scheduler.add_job(self.run_retention, "interval", days=1, id="evidence_retention", replace_existing=True)
            self.scheduler.add_job(self.run_event_retention, "interval", days=1, id="event_retention", replace_existing=True)
            self.scheduler.start()
        self.started = True

    def shutdown(self) -> None:
        if not self.started:
            return
        if self.scheduler:
            self.scheduler.shutdown(wait=False)
        self.started = False

    def run_once(self) -> int:
        db = SessionLocal()
        try:
            return process_expired_attempts(db)
        finally:
            db.close()

    def run_retention(self) -> int:
        db = SessionLocal()
        try:
            return purge_expired_evidence(db)
        finally:
            db.close()

    def run_event_retention(self) -> int:
        db = SessionLocal()
        try:
            return purge_expired_events(db)
        finally:
            db.close()

