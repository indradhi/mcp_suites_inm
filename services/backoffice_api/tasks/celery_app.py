from celery import Celery
from config import settings

celery_app = Celery(
    "mcp_tasks",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["tasks.ingest_tasks", "tasks.graph_tasks", "tasks.scheduler_tasks"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_routes={
        "tasks.ingest_tasks.*": {"queue": "ingestion"},
        "tasks.graph_tasks.*": {"queue": "graph"},
        "tasks.scheduler_tasks.*": {"queue": "default"},
    },
    beat_schedule={
        "check-scheduled-knowledge-sources-every-minute": {
            "task": "tasks.scheduler_tasks.check_and_trigger_scheduled_sources",
            "schedule": 60.0,
        }
    }
)
