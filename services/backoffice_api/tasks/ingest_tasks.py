import asyncio
import logging
from datetime import datetime
from database import SessionLocal
from models.knowledge_source import KnowledgeSource, KnowledgeDocument
from models.ingest_job import IngestJob
from services.vector_store import vector_store
from services.llm_service import llm_service
from services.graph.graph_builder import graph_builder
from services.ingestion.pdf_ingester import pdf_ingester
from services.ingestion.excel_ingester import excel_ingester
from services.ingestion.word_ingester import word_ingester
from services.ingestion.text_ingester import text_ingester
from services.ingestion.database_ingester import database_ingester
from services.ingestion.api_ingester import api_ingester
from services.ingestion.website_ingester import website_ingester
from services.ingestion.websearch_ingester import websearch_ingester
from tasks.celery_app import celery_app

logger = logging.getLogger(__name__)

@celery_app.task(bind=True, name="tasks.ingest_tasks.run_ingest_source_task")
def run_ingest_source_task(self, source_id: int):
    db = SessionLocal()
    job = None
    try:
        source = db.query(KnowledgeSource).filter(KnowledgeSource.id == source_id).first()
        if not source:
            logger.error(f"Source with id {source_id} not found.")
            return

        if not source.is_active:
            logger.warning(f"Source with id {source_id} ('{source.name}') is disabled (is_active=False). Ingestion aborted.")
            source.sync_status = "idle"
            db.commit()
            return

        job = IngestJob(
            source_id=source.id,
            status="processing",
            task_id=self.request.id,
            started_at=datetime.utcnow()
        )
        db.add(job)
        source.sync_status = "running"
        db.commit()
        db.refresh(job)

        raw_chunks = []
        source_type = source.source_type.lower()
        config = source.config or {}

        # If source is configured as an on-demand AI Tool (live query without vector ingestion), skip batch ingestion
        if config.get("is_tool") or (source_type in ["database", "api"] and config.get("parameters")):
            logger.info(f"Source with id {source_id} ('{source.name}') is configured as on-demand AI Tool. Skipping batch vector ingestion.")
            job.status = "completed"
            job.total_records = 0
            job.chunks_created = 0
            job.processed_records = 0
            job.completed_at = datetime.utcnow()
            source.sync_status = "active (tool)"
            source.last_synced_at = datetime.utcnow()
            db.commit()
            return

        # 1. Extraction by source type
        if source_type == "file":
            file_path = config.get("file_path")
            ext = config.get("file_type", "").lower()
            if not ext and file_path:
                ext = file_path.split(".")[-1].lower()

            if ext == "pdf":
                raw_chunks = pdf_ingester.extract_text(file_path)
            elif ext in ["xlsx", "xls"]:
                raw_chunks = excel_ingester.extract_text(file_path)
            elif ext in ["docx", "doc"]:
                raw_chunks = word_ingester.extract_text(file_path)
            else:
                raw_chunks = text_ingester.extract_text(file_path)

        elif source_type == "database":
            db_type = config.get("db_type", "mysql")
            query = config.get("query", "SELECT * FROM data")
            limit_cfg = config.get("limit", 5000)
            try:
                limit = int(limit_cfg)
            except (ValueError, TypeError):
                limit = 5000
            # If limit is 0 or negative, treat as None (unlimited: fetches all records in table)
            effective_limit = limit if limit > 0 else None
            raw_chunks = database_ingester.extract_knowledge(db_type, config, query, limit=effective_limit)

        elif source_type == "api":
            raw_chunks = asyncio.run(api_ingester.fetch_and_extract(config))

        elif source_type == "website":
            url = config.get("url")
            raw_chunks = asyncio.run(website_ingester.extract_url(url))

        elif source_type == "websearch":
            query = config.get("query")
            crawl = config.get("crawl_pages", True)
            raw_chunks = asyncio.run(websearch_ingester.search_and_extract(query, crawl_pages=crawl))

        raw_chunks = raw_chunks or []
        total_chunks = len(raw_chunks)
        total_records_count = sum(item.get("records_count", 0) for item in raw_chunks)
        job.total_records = total_records_count if total_records_count > 0 else total_chunks
        job.chunks_created = total_chunks
        db.commit()

        if total_chunks == 0:
            job.status = "completed"
            job.completed_at = datetime.utcnow()
            source.sync_status = "completed"
            source.last_synced_at = datetime.utcnow()
            db.commit()
            return

        # 2. Add chunks to ChromaDB Vector Store
        texts_to_index = []
        metas_to_index = []
        ids_to_index = []

        for idx, item in enumerate(raw_chunks, start=1):
            text = item.get("text", "")
            if not text.strip():
                continue
            chunk_id = f"src_{source.id}_chk_{idx}_{int(datetime.utcnow().timestamp())}"
            metadata = item.get("metadata", {}).copy()
            metadata["source_id"] = source.id
            metadata["source_name"] = source.name
            metadata["source_type"] = source.source_type

            texts_to_index.append(text)
            metas_to_index.append(metadata)
            ids_to_index.append(chunk_id)

        if texts_to_index:
            vector_store.add_chunks(texts_to_index, metas_to_index, ids_to_index)
            job.chunks_created = len(texts_to_index)
            db.commit()

        # 3. Extract Entities & Build Knowledge Graph
        total_entities = 0
        total_relations = 0

        # Sample key chunks for graph extraction (first 10 chunks for fast responsiveness)
        sample_size = min(10, len(texts_to_index))
        for chunk_text in texts_to_index[:sample_size]:
            try:
                extraction = llm_service.extract_entities_and_relations(chunk_text, db)
                ents = extraction.get("entities", [])
                rels = extraction.get("relationships", [])

                ent_count = graph_builder.upsert_entities(ents, source.id, source.name)
                rel_count = graph_builder.upsert_relationships(rels, source.id)

                total_entities += ent_count
                total_relations += rel_count
            except Exception as graph_err:
                logger.warning(f"Notice during graph extraction: {graph_err}")

        job.entities_extracted = total_entities
        job.relations_created = total_relations
        job.processed_records = total_records_count if total_records_count > 0 else total_chunks
        job.status = "completed"
        job.completed_at = datetime.utcnow()

        source.sync_status = "completed"
        source.last_synced_at = datetime.utcnow()
        db.commit()

    except Exception as e:
        logger.error(f"Error executing ingestion job: {e}", exc_info=True)
        if job:
            job.status = "failed"
            job.error_message = str(e)
            job.completed_at = datetime.utcnow()
        if source:
            source.sync_status = "failed"
        db.commit()
    finally:
        db.close()
