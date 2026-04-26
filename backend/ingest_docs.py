"""
One-time document ingestion script.
Run once: python ingest_docs.py

Reads every PDF in data/docs/, splits into chunks,
generates OpenAI embeddings, and stores in MongoDB Atlas
in the 'knowledge_base' collection.
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()

import pypdf
from openai import OpenAI
from pymongo import MongoClient

#config
DOCS_DIR    = Path(__file__).parent / "data" / "docs"
CHUNK_CHARS = 900    #target chunk size in characters
OVERLAP_WORDS = 25   #words to carry over between chunks
BATCH_SIZE  = 100    #embeddings per API call


def extract_text(pdf_path: Path) -> str:
    reader = pypdf.PdfReader(str(pdf_path))
    pages = []
    for page in reader.pages:
        t = page.extract_text()
        if t:
            pages.append(t)
    return "\n".join(pages)


def make_chunks(text: str, source: str) -> list[dict]:
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        segment = []
        length  = 0
        j = i
        while j < len(words) and length < CHUNK_CHARS:
            segment.append(words[j])
            length += len(words[j]) + 1
            j += 1
        chunk_str = " ".join(segment).strip()
        if len(chunk_str) > 80:          # skip noise
            chunks.append({"text": chunk_str, "source": source})
        # slide forward with overlap
        i = j - OVERLAP_WORDS if j - OVERLAP_WORDS > i else j
    return chunks


def main():
    api_key   = os.getenv("OPENAI_API_KEY")
    mongo_uri = os.getenv("MONGODB_URI")
    if not api_key:
        sys.exit("Missing OPENAI_API_KEY in .env")
    if not mongo_uri:
        sys.exit("Missing MONGODB_URI in .env")

    oai   = OpenAI(api_key=api_key)
    mongo = MongoClient(mongo_uri)
    db    = mongo["smartvision"]
    col   = db["knowledge_base"]

    #clear old data
    deleted = col.delete_many({}).deleted_count
    print(f"Cleared {deleted} old documents from knowledge_base.")

    if not DOCS_DIR.exists():
        sys.exit(f"Docs directory not found: {DOCS_DIR}")

    pdfs = list(DOCS_DIR.glob("*.pdf"))
    if not pdfs:
        sys.exit(f"No PDF files found in {DOCS_DIR}")

    #extract andd chunk
    all_chunks: list[dict] = []
    for pdf in pdfs:
        print(f"  Reading  {pdf.name} ...", end=" ")
        text   = extract_text(pdf)
        chunks = make_chunks(text, pdf.stem)
        all_chunks.extend(chunks)
        print(f"{len(chunks)} chunks")

    print(f"\nTotal chunks: {len(all_chunks)}")

    #embed in batches
    docs_to_insert = []
    for start in range(0, len(all_chunks), BATCH_SIZE):
        batch  = all_chunks[start : start + BATCH_SIZE]
        texts  = [c["text"] for c in batch]
        resp   = oai.embeddings.create(model="text-embedding-3-small", input=texts)
        for idx, emb_data in enumerate(resp.data):
            docs_to_insert.append({
                "text":      batch[idx]["text"],
                "source":    batch[idx]["source"],
                "embedding": emb_data.embedding,
            })
        done = min(start + BATCH_SIZE, len(all_chunks))
        print(f"  Embedded {done}/{len(all_chunks)} chunks ...")

    #insert
    col.insert_many(docs_to_insert)
    mongo.close()

    print(f"\nDone! {len(docs_to_insert)} document chunks stored in MongoDB → knowledge_base")
    print("\nNEXT STEP: Create the Atlas Vector Search index (see instructions below).")
    print("─" * 70)
    print("Index name  : knowledge_vector_index")
    print("Collection  : smartvision.knowledge_base")
    print("JSON config :")
    print("""{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536,
      "similarity": "cosine"
    }
  ]
}""")
    print("─" * 70)


if __name__ == "__main__":
    main()
