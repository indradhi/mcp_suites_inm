import asyncio
import logging
from tasks.celery_app import celery_app
from services.graph.analytics import graph_analytics
from services.graph.insight_generator import insight_generator

logger = logging.getLogger(__name__)

@celery_app.task(name="tasks.graph_tasks.recompute_graph_metrics")
def recompute_graph_metrics():
    logger.info("Recomputing knowledge graph analytics metrics...")
    metrics = graph_analytics.compute_network_metrics()
    logger.info(f"Graph metrics recomputed: {metrics}")
    return metrics
