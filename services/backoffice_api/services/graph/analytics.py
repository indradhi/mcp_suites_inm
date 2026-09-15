import logging
from typing import List, Dict, Any, Optional
import networkx as nx
from services.graph.neo4j_client import neo4j_client

logger = logging.getLogger(__name__)

class GraphAnalytics:
    def get_full_subgraph(self, limit_nodes: int = 150) -> Dict[str, Any]:
        """
        Retrieves graph nodes and edges formatted for Cytoscape.js visualization.
        """
        query = """
        MATCH (n:Entity)
        OPTIONAL MATCH (n)-[r]->(m:Entity)
        WITH n, r, m
        LIMIT $limit
        RETURN n.name AS source,
               n.type AS source_type,
               n.description AS source_desc,
               type(r) AS relation,
               r.weight AS weight,
               m.name AS target,
               m.type AS target_type,
               m.description AS target_desc
        """
        records = neo4j_client.execute_read(query, {"limit": limit_nodes * 3})

        nodes_map = {}
        edges = []

        for row in records:
            src = row["source"]
            if src and src not in nodes_map:
                nodes_map[src] = {
                    "data": {
                        "id": src,
                        "label": src,
                        "type": row.get("source_type", "ENTITY"),
                        "description": row.get("source_desc", "")
                    }
                }

            tgt = row.get("target")
            if tgt:
                if tgt not in nodes_map:
                    nodes_map[tgt] = {
                        "data": {
                            "id": tgt,
                            "label": tgt,
                            "type": row.get("target_type", "ENTITY"),
                            "description": row.get("target_desc", "")
                        }
                    }

                rel = row.get("relation", "RELATED_TO")
                edge_id = f"{src}-{rel}-{tgt}"
                edges.append({
                    "data": {
                        "id": edge_id,
                        "source": src,
                        "target": tgt,
                        "label": rel,
                        "weight": row.get("weight", 1.0)
                    }
                })

        return {
            "elements": {
                "nodes": list(nodes_map.values()),
                "edges": edges
            },
            "stats": {
                "total_nodes": len(nodes_map),
                "total_edges": len(edges)
            }
        }

    def compute_network_metrics(self) -> Dict[str, Any]:
        """
        Builds a NetworkX graph from Neo4j edges to calculate centrality, hubs, and community clusters.
        """
        query = "MATCH (a:Entity)-[r]->(b:Entity) RETURN a.name AS u, b.name AS v, type(r) AS rel"
        records = neo4j_client.execute_read(query)

        G = nx.Graph()
        for r in records:
            G.add_edge(r["u"], r["v"], relation=r["rel"])

        if G.number_of_nodes() == 0:
            return {
                "node_count": 0,
                "edge_count": 0,
                "density": 0.0,
                "top_hubs": [],
                "communities_count": 0
            }

        # Calculate degree centrality
        degrees = dict(G.degree())
        sorted_hubs = sorted(degrees.items(), key=lambda x: x[1], reverse=True)[:10]

        # Connected components / clusters
        components = list(nx.connected_components(G))

        density = nx.density(G)

        return {
            "node_count": G.number_of_nodes(),
            "edge_count": G.number_of_edges(),
            "density": round(density, 4),
            "top_hubs": [{"name": node, "connections": deg} for node, deg in sorted_hubs],
            "communities_count": len(components),
            "largest_community_size": len(max(components, key=len)) if components else 0
        }

    def find_path(self, start_entity: str, end_entity: str) -> List[Dict[str, Any]]:
        query = """
        MATCH (a:Entity {name: $start}), (b:Entity {name: $end})
        MATCH p = allShortestPaths((a)-[*..4]-(b))
        RETURN [n in nodes(p) | {name: n.name, type: n.type}] AS path_nodes,
               [r in relationships(p) | {type: type(r), from: startNode(r).name, to: endNode(r).name}] AS path_edges
        LIMIT 3
        """
        return neo4j_client.execute_read(query, {"start": start_entity, "end": end_entity})

graph_analytics = GraphAnalytics()
