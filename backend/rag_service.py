import os
from openai import AsyncOpenAI


ATLAS_INDEX_NAME = "knowledge_vector_index"
COLLECTION_NAME  = "knowledge_base"

#human-readable names for the source documents
SOURCE_LABELS = {
    "GUIDE-DU-DIAGNOSTIC-DES-PRINCIPALES-MALADIES-DES-CEREALES-D-AUTOMNE-AU-MAROC":
        "Moroccan Cereal Disease Diagnostic Guide",
    "Wheat_Blast_Priority_Brief":
        "Wheat Blast Priority Brief",
    "blés":
        "Wheat Cultivation Guide (Morocco)",
    "btta_77":
        "INRA Technical Bulletin No. 77",
}


async def search_knowledge_base(
    query: str, db, k: int = 3
) -> tuple[str, list[str]]:
    """
    Embed the query and search MongoDB Atlas Vector Search.
    Returns (context_str, [source_label, ...]).
    Falls back silently to ("", []) on any error.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or db is None:
        return "", []

    try:
        client = AsyncOpenAI(api_key=api_key)
        emb_response = await client.embeddings.create(
            model="text-embedding-3-small",
            input=query,
        )
        query_vector = emb_response.data[0].embedding

        pipeline = [
            {
                "$vectorSearch": {
                    "index": ATLAS_INDEX_NAME,
                    "path": "embedding",
                    "queryVector": query_vector,
                    "numCandidates": 60,
                    "limit": k,
                }
            },
            {
                "$project": {
                    "text": 1,
                    "source": 1,
                    "score": {"$meta": "vectorSearchScore"},
                    "_id": 0,
                }
            },
        ]

        results = await db[COLLECTION_NAME].aggregate(pipeline).to_list(k)
        if not results:
            return "", []

        parts   = []
        sources = []
        for r in results:
            raw_source = r.get("source", "document")
            label      = SOURCE_LABELS.get(raw_source, raw_source)
            text       = r.get("text", "").strip()
            if text:
                parts.append(f"[{label}]\n{text}")
                if label not in sources:
                    sources.append(label)

        return "\n\n---\n\n".join(parts), sources

    except Exception:
        return "", []
