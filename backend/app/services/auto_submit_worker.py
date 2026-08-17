try:
    from apscheduler.schedulers.background import BackgroundScheduler
except ImportError:  # pragma: no cover - fallback for environments without optional dependency
    BackgroundScheduler = None

from ..database import SessionLocal
from .attempt_service import process_expired_attempts


class AutoSubmitWorker:
    def __init__(self) -> None:
        self.scheduler = BackgroundScheduler(timezone="UTC") if BackgroundScheduler else None
        self.started = False

    def start(self) -> None:
        if self.started:
            return
        self.run_once()
        if self.scheduler:
            self.scheduler.add_job(self.run_once, "interval", seconds=30, id="exam_auto_submit", replace_existing=True)
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
