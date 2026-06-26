import json
from typing import Any, Optional

from sqlalchemy.orm import Session

from . import db


def format_actor(actor: Optional[db.User]) -> str:
    if not actor:
        return "System"
    return f"{actor.first_name} {actor.last_name} ({actor.email})"


def record(
    database: Session,
    actor: Optional[db.User],
    action: str,
    *,
    resource_type: Optional[str] = None,
    resource_id: Optional[str | int] = None,
    target_label: Optional[str] = None,
    summary: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    database.add(
        db.AuditLog(
            user_id=actor.id if actor else None,
            actor_email=actor.email if actor else None,
            actor_first_name=actor.first_name if actor else None,
            actor_last_name=actor.last_name if actor else None,
            actor_role=actor.role if actor else None,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            target_label=target_label,
            summary=summary,
            details=summary,
            metadata_json=json.dumps(metadata, ensure_ascii=False) if metadata else None,
        )
    )


def log_to_dict(log: db.AuditLog) -> dict:
    actor_email = log.actor_email or (log.user.email if log.user else None)
    actor_first = log.actor_first_name or (log.user.first_name if log.user else None)
    actor_last = log.actor_last_name or (log.user.last_name if log.user else None)
    actor_role = log.actor_role or (log.user.role if log.user else None)
    display_name = " ".join(part for part in [actor_first, actor_last] if part).strip() or None

    metadata = None
    if log.metadata_json:
        try:
            metadata = json.loads(log.metadata_json)
        except json.JSONDecodeError:
            metadata = {"raw": log.metadata_json}

    return {
        "id": log.id,
        "action": log.action,
        "created_at": log.created_at.isoformat() if log.created_at else None,
        "resource_type": log.resource_type,
        "resource_id": log.resource_id,
        "target_label": log.target_label,
        "summary": log.summary or log.details,
        "metadata": metadata,
        "actor": {
            "id": log.user_id,
            "email": actor_email,
            "first_name": actor_first,
            "last_name": actor_last,
            "role": actor_role,
            "display_name": display_name,
        },
    }
