import re
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from database import SessionLocal
from models.knowledge_source import KnowledgeSource
from tasks.celery_app import celery_app
from tasks.ingest_tasks import run_ingest_source_task

logger = logging.getLogger(__name__)

# Standard preset intervals mapped to seconds
INTERVAL_PRESETS: Dict[str, int] = {
    "1h": 3600,
    "hourly": 3600,
    "every_1h": 3600,
    "2h": 7200,
    "every_2h": 7200,
    "3h": 10800,
    "every_3h": 10800,
    "6h": 21600,
    "every_6h": 21600,
    "12h": 43200,
    "every_12h": 43200,
    "24h": 86400,
    "daily": 86400,
    "every_24h": 86400,
    "weekly": 604800,
    "every_week": 604800,
}

def parse_interval_seconds(schedule_str: str) -> Optional[int]:
    """
    Parses preset interval strings like '1h', '6h', '24h', 'daily', or '30m' into total seconds.
    """
    if not schedule_str:
        return None
    s = schedule_str.strip().lower()
    if s in INTERVAL_PRESETS:
        return INTERVAL_PRESETS[s]

    match = re.match(r"^(\d+)\s*(m|min|minute|minutes|h|hr|hour|hours|d|day|days|w|week|weeks)$", s)
    if match:
        val = int(match.group(1))
        unit = match.group(2)
        if unit.startswith("m") and not unit.startswith("mon"):
            return val * 60
        elif unit.startswith("h"):
            return val * 3600
        elif unit.startswith("d"):
            return val * 86400
        elif unit.startswith("w"):
            return val * 604800
    return None

def match_cron_part(value: int, pattern: str, min_v: int, max_v: int) -> bool:
    """
    Evaluates whether an integer value matches a cron field pattern.
    Supports '*', '*/step', 'range (a-b)', 'list (a,b,c)', and exact numbers.
    """
    if pattern == "*":
        return True
    for item in pattern.split(","):
        item = item.strip()
        if not item:
            continue
        if "/" in item:
            left, step_str = item.split("/", 1)
            try:
                step = int(step_str)
                if step <= 0:
                    continue
                start = min_v if left == "*" else int(left)
                if value >= start and (value - start) % step == 0:
                    return True
            except ValueError:
                continue
        elif "-" in item:
            start_str, end_str = item.split("-", 1)
            try:
                if int(start_str) <= value <= int(end_str):
                    return True
            except ValueError:
                continue
        elif item.isdigit():
            val = int(item)
            if value == val:
                return True
            # For Day-of-Week: 7 is equivalent to 0 (Sunday)
            if max_v == 6 and val == 7 and value == 0:
                return True
    return False

def is_cron_due(cron_str: str, now: datetime, last_synced_at: Optional[datetime]) -> bool:
    """
    Checks if a 5-part cron expression (m h dom mon dow) matches the current minute.
    Also ensures at least 55 seconds have passed since last sync to prevent multiple triggers in the same minute.
    """
    parts = cron_str.strip().split()
    if len(parts) != 5:
        return False

    # Prevent duplicate triggers in the exact same minute
    if last_synced_at and (now - last_synced_at).total_seconds() < 55:
        return False

    m_str, h_str, dom_str, mon_str, dow_str = parts

    # Check against both UTC and GMT+7 (Asia/Jakarta WIB) to accommodate user intent
    for dt in [now, now + timedelta(hours=7)]:
        cron_dow = (dt.weekday() + 1) % 7  # 0=Sunday, 1=Monday ... 6=Saturday
        if (
            match_cron_part(dt.minute, m_str, 0, 59)
            and match_cron_part(dt.hour, h_str, 0, 23)
            and match_cron_part(dt.day, dom_str, 1, 31)
            and match_cron_part(dt.month, mon_str, 1, 12)
            and match_cron_part(cron_dow, dow_str, 0, 6)
        ):
            return True

    return False

def is_source_due(source: KnowledgeSource, now: datetime) -> bool:
    """
    Determines if a knowledge source is due for synchronization based on its schedule_cron.
    """
    if not source.is_active:
        return False
    if source.sync_status == "running":
        return False
    if not source.schedule_cron or not source.schedule_cron.strip():
        return False

    sched = source.schedule_cron.strip()

    # 1. Check if interval preset
    interval_sec = parse_interval_seconds(sched)
    if interval_sec is not None:
        if not source.last_synced_at:
            return True
        elapsed = (now - source.last_synced_at).total_seconds()
        return elapsed >= interval_sec

    # 2. Check if 5-field cron expression
    parts = sched.split()
    if len(parts) == 5:
        return is_cron_due(sched, now, source.last_synced_at)

    return False

def get_next_run_estimate(source: KnowledgeSource, now: datetime) -> Optional[datetime]:
    """
    Calculates the approximate next run time for interval-based sources.
    """
    if not source.is_active or not source.schedule_cron:
        return None

    interval_sec = parse_interval_seconds(source.schedule_cron)
    if interval_sec is not None:
        if not source.last_synced_at:
            return now
        return source.last_synced_at + timedelta(seconds=interval_sec)

    return None

@celery_app.task(name="tasks.scheduler_tasks.check_and_trigger_scheduled_sources")
def check_and_trigger_scheduled_sources() -> Dict[str, Any]:
    """
    Celery Beat periodic task executed every 60 seconds.
    Inspects all active KnowledgeSources, evaluates their cron/interval schedules,
    and dispatches ingestion tasks for any source that is due.
    """
    db = SessionLocal()
    now = datetime.utcnow()
    triggered = []

    try:
        sources = db.query(KnowledgeSource).filter(
            KnowledgeSource.is_active == True,
            KnowledgeSource.schedule_cron.isnot(None),
            KnowledgeSource.schedule_cron != ""
        ).all()

        for s in sources:
            # Skip if currently running
            if s.sync_status == "running":
                continue

            # Skip on-demand live query tools
            conf = s.config or {}
            if conf.get("is_tool") or (s.source_type in ["database", "api"] and conf.get("parameters")):
                continue

            if is_source_due(s, now):
                logger.info(
                    f"[Scheduler] Source #{s.id} ('{s.name}', type={s.source_type}) "
                    f"is due for auto-sync (schedule: '{s.schedule_cron}'). Triggering Celery ingest task."
                )
                run_ingest_source_task.delay(s.id)
                triggered.append({
                    "id": s.id,
                    "name": s.name,
                    "source_type": s.source_type,
                    "schedule_cron": s.schedule_cron
                })

        return {
            "status": "success",
            "active_scheduled_sources": len(sources),
            "triggered_count": len(triggered),
            "triggered_sources": triggered,
            "checked_at": now.isoformat() + "Z"
        }

    except Exception as e:
        logger.error(f"[Scheduler] Exception while evaluating scheduled sources: {e}", exc_info=True)
        return {"status": "error", "error": str(e)}
    finally:
        db.close()
