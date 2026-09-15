import logging
from typing import Dict, Any, List
from services.graph.analytics import graph_analytics
from services.llm_service import llm_service
from services.graph.neo4j_client import neo4j_client

logger = logging.getLogger(__name__)

class InsightGenerator:
    async def generate_network_insights(self, db=None) -> List[Dict[str, Any]]:
        """
        Analyzes graph metrics and uses LLM to synthesize actionable profiling insights.
        """
        metrics = graph_analytics.compute_network_metrics()
        if metrics["node_count"] == 0:
            return [{
                "title": "Knowledge Graph Empty",
                "category": "Status",
                "description": "No entities or relations have been indexed yet. Ingest knowledge sources (databases, files, APIs, websites) to populate the network.",
                "importance": "LOW"
            }]

        insights = []

        # 1. Hub Analysis Insight
        top_hubs = metrics.get("top_hubs", [])
        if top_hubs:
            hub_names = ", ".join([f"'{h['name']}' ({h['connections']} links)" for h in top_hubs[:3]])
            insights.append({
                "title": "Primary Central Connectors",
                "category": "Network Topology",
                "description": f"The top authoritative central hubs in your data network are {hub_names}. These entities bridge the highest volume of information across documents.",
                "importance": "HIGH",
                "metadata": {"hubs": top_hubs[:5]}
            })

        # 2. Cluster / Community Insight
        comm_count = metrics.get("communities_count", 0)
        largest_size = metrics.get("largest_community_size", 0)
        if comm_count > 1:
            insights.append({
                "title": "Community Cluster Partitioning",
                "category": "Cluster Analysis",
                "description": f"Identified {comm_count} distinct data clusters. The largest cluster encompasses {largest_size} interconnected entities, while smaller sub-networks remain modular.",
                "importance": "MEDIUM",
                "metadata": {"communities_count": comm_count}
            })

        # 3. Network Density
        density = metrics.get("density", 0.0)
        insights.append({
            "title": "Network Cohesion & Density",
            "category": "Profiling",
            "description": f"Overall network connection density is {density}. " + 
                           ("Knowledge is tightly coupled and cross-referenced." if density > 0.05 else "Knowledge has focused domain bridges with sparse cross-silo links."),
            "importance": "LOW",
            "metadata": {"density": density}
        })

        return insights

    def get_entity_profiling_summary(self, entity_name: str) -> Dict[str, Any]:
        """
        Retrieves in-depth entity profiling details and connected relationships.
        """
        query = """
        MATCH (e:Entity {name: $name})
        OPTIONAL MATCH (e)-[r]-(neighbor:Entity)
        RETURN e.name AS name,
               e.type AS type,
               e.description AS description,
               e.source_name AS source,
               collect(DISTINCT {
                   relation: type(r),
                   connected_entity: neighbor.name,
                   entity_type: neighbor.type
               }) AS connections
        LIMIT 1
        """
        records = neo4j_client.execute_read(query, {"name": entity_name})
        if not records:
            return {}

        rec = records[0]
        conns = rec.get("connections", [])
        return {
            "entity": rec["name"],
            "type": rec["type"],
            "description": rec.get("description", ""),
            "source": rec.get("source", "Unknown"),
            "total_connections": len(conns),
            "network_connections": conns
        }

insight_generator = InsightGenerator()
