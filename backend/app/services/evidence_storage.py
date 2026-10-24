import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class EvidenceStorage:
    def save(self, data: bytes, key: str) -> str:
        raise NotImplementedError

    def resolve_url(self, stored_value: Optional[str]) -> Optional[str]:
        raise NotImplementedError

    def delete(self, key: str) -> None:
        raise NotImplementedError


class LocalStorage(EvidenceStorage):
    def __init__(self, base_dir: Optional[str] = None):
        self.base_dir = Path(base_dir or "data")

    def save(self, data: bytes, key: str) -> str:
        clean_key = key.lstrip("/\\")
        file_path = self.base_dir / clean_key
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(data)
        return clean_key

    def resolve_url(self, stored_value: Optional[str]) -> Optional[str]:
        if not stored_value:
            return stored_value
        if stored_value.startswith("http://") or stored_value.startswith("https://"):
            return stored_value
        if stored_value.startswith("/"):
            return stored_value
        return f"/{stored_value}"

    def delete(self, key: str) -> None:
        if not key:
            return
        clean_key = key.lstrip("/\\")
        file_path = self.base_dir / clean_key
        if file_path.is_file():
            try:
                file_path.unlink()
            except OSError as err:
                logger.warning("Failed to delete local evidence file: %s", err)


class S3Storage(EvidenceStorage):
    def __init__(self):
        import boto3
        from botocore.config import Config

        self.bucket = os.getenv("S3_BUCKET", "")
        self.ttl_seconds = int(os.getenv("EVIDENCE_URL_TTL_SECONDS", "3600"))

        client_config = Config(
            connect_timeout=5,
            read_timeout=10,
            retries={"max_attempts": 1},
        )

        client_kwargs = {
            "service_name": "s3",
            "region_name": os.getenv("S3_REGION", "auto"),
            "config": client_config,
        }

        endpoint_url = os.getenv("S3_ENDPOINT_URL")
        if endpoint_url:
            client_kwargs["endpoint_url"] = endpoint_url

        access_key = os.getenv("S3_ACCESS_KEY_ID")
        if access_key:
            client_kwargs["aws_access_key_id"] = access_key

        secret_key = os.getenv("S3_SECRET_ACCESS_KEY")
        if secret_key:
            client_kwargs["aws_secret_access_key"] = secret_key

        self.s3 = boto3.client(**client_kwargs)

    def save(self, data: bytes, key: str) -> str:
        clean_key = key.lstrip("/\\")
        self.s3.put_object(
            Bucket=self.bucket,
            Key=clean_key,
            Body=data,
            ContentType="image/jpeg",
        )
        return clean_key

    def resolve_url(self, stored_value: Optional[str]) -> Optional[str]:
        if not stored_value:
            return stored_value
        if stored_value.startswith("http://") or stored_value.startswith("https://"):
            return stored_value
        # Legacy values starting with "/evidence/" pass through unchanged
        if stored_value.startswith("/evidence/"):
            return stored_value

        clean_key = stored_value.lstrip("/\\")
        return self.s3.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": self.bucket, "Key": clean_key},
            ExpiresIn=self.ttl_seconds,
        )

    def delete(self, key: str) -> None:
        if not key or key.startswith("/evidence/"):
            return
        clean_key = key.lstrip("/\\")
        try:
            self.s3.delete_object(Bucket=self.bucket, Key=clean_key)
        except Exception as err:
            logger.warning("Failed to delete S3 evidence object: %s", type(err).__name__)


_storage_instance: Optional[EvidenceStorage] = None


def get_evidence_storage() -> EvidenceStorage:
    global _storage_instance
    if _storage_instance is not None:
        return _storage_instance

    backend_type = os.getenv("EVIDENCE_STORAGE", "local").strip().lower()
    if backend_type == "s3":
        _storage_instance = S3Storage()
    else:
        _storage_instance = LocalStorage()
    return _storage_instance


def set_evidence_storage(storage: Optional[EvidenceStorage]) -> None:
    """Set or reset active storage backend (useful for testing or dependency injection)."""
    global _storage_instance
    _storage_instance = storage


def resolve_evidence_field(raw_value: Optional[str], storage: Optional[EvidenceStorage] = None) -> Optional[str]:
    """Helper to resolve a stored evidence_files field (handles single key, JSON list, or URL)."""
    if not raw_value:
        return raw_value
    active_storage = storage or get_evidence_storage()
    if raw_value.startswith("["):
        try:
            items = json.loads(raw_value)
            if isinstance(items, list):
                resolved_list = [active_storage.resolve_url(item) for item in items if item]
                return json.dumps(resolved_list)
        except Exception:
            pass
    return active_storage.resolve_url(raw_value)


def delete_evidence_item(stored_value: Optional[str], storage: Optional[EvidenceStorage] = None) -> None:
    """Helper to delete evidence files from storage (handles single key or JSON list)."""
    if not stored_value:
        return
    active_storage = storage or get_evidence_storage()
    if stored_value.startswith("["):
        try:
            items = json.loads(stored_value)
            if isinstance(items, list):
                for item in items:
                    if item:
                        active_storage.delete(item)
                return
        except Exception:
            pass
    active_storage.delete(stored_value)


def purge_expired_evidence(
    db: Session,
    retention_days: Optional[int] = None,
    storage: Optional[EvidenceStorage] = None,
    now: Optional[datetime] = None,
) -> int:
    """Deletes evidence objects older than retention_days for violations whose dispute_status is not PENDING."""
    from ..models.violation import Violation

    if retention_days is None:
        retention_days = int(os.getenv("EVIDENCE_RETENTION_DAYS", "30"))

    active_storage = storage or get_evidence_storage()
    current_time = now or datetime.now(timezone.utc)
    cutoff = current_time - timedelta(days=retention_days)

    violations = (
        db.query(Violation)
        .filter(Violation.evidence_files.is_not(None))
        .filter(Violation.evidence_files != "")
        .filter(Violation.timestamp < cutoff)
        .all()
    )

    purged_count = 0
    for v in violations:
        if v.dispute_status == "PENDING":
            continue

        delete_evidence_item(v.evidence_files, active_storage)
        v.evidence_files = None
        purged_count += 1

    if purged_count > 0:
        db.commit()

    logger.info("Purged %d expired evidence object(s) older than %d days", purged_count, retention_days)
    return purged_count

