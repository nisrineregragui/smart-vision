from fastapi import APIRouter, HTTPException, Depends, Request, status
from pydantic import BaseModel
from datetime import datetime
from bson import ObjectId
from typing import Optional
from openai import AsyncOpenAI
import os

from auth_routes import get_current_user

router = APIRouter()

#strict agronomy-only system prompt
AGRONOMY_SYSTEM_PROMPT = """\
You are an expert agronomist assistant embedded in Smart Vision, a wheat disease \
detection application used by farmers in Morocco.

Your ONLY purpose is to answer questions about:
- Wheat and cereal cultivation
- Plant diseases (Yellow Rust, Brown Rust, Blast, Septoria, and others)
- Agronomy and agriculture in general
- Soil science, fertilization, and soil health
- Irrigation and water management
- Pesticides, herbicides, and crop protection
- Farming practices, mechanization, and post-harvest
- Agricultural economics, Moroccan agricultural policy

STRICT RULES — you MUST follow these exactly:
1. If the question is NOT about agriculture, agronomy, or farming in any way,
   respond ONLY with this exact sentence (nothing else):
   "I can only help with agronomy and agriculture questions."

2. If you are uncertain about the answer to an agricultural question, or the \
question requires knowledge you don't have, respond ONLY with:
   "I don't know."

3. NEVER fabricate statistics, invent research, or hallucinate recommendations.
4. NEVER discuss topics outside of agriculture and agronomy.
5. Be precise, practical, and evidence-based.
6. Keep responses concise and actionable.
"""

#helpers
def _to_oid(id_str: str) -> ObjectId:
    try:
        return ObjectId(id_str)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID format")


#pydantic models
class MessageCreate(BaseModel):
    content: str


#endpoints
@router.post("/conversations", status_code=201)
async def create_conversation(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    db = request.app.state.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    doc = {
        "email": current_user["email"],
        "title": "New Chat",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db["conversations"].insert_one(doc)
    return {"id": str(result.inserted_id), "title": "New Chat"}


@router.get("/conversations")
async def list_conversations(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    db = request.app.state.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    cursor = db["conversations"].find(
        {"email": current_user["email"]}
    ).sort("updated_at", -1)

    convs = await cursor.to_list(length=100)
    return {
        "conversations": [
            {
                "id": str(c["_id"]),
                "title": c.get("title", "New Chat"),
                "updated_at": c["updated_at"].isoformat(),
            }
            for c in convs
        ]
    }


@router.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    db = request.app.state.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    conv = await db["conversations"].find_one(
        {"_id": _to_oid(conversation_id), "email": current_user["email"]}
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    cursor = db["messages"].find(
        {"conversation_id": conversation_id}
    ).sort("created_at", 1)

    msgs = await cursor.to_list(length=500)
    return {
        "messages": [
            {
                "id": str(m["_id"]),
                "role": m["role"],
                "content": m["content"],
                "created_at": m["created_at"].isoformat(),
            }
            for m in msgs
        ]
    }


@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    body: MessageCreate,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    db = request.app.state.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    #ensure conversation belongs to the connected user
    conv = await db["conversations"].find_one(
        {"_id": _to_oid(conversation_id), "email": current_user["email"]}
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    #persist user message
    user_msg = {
        "conversation_id": conversation_id,
        "role": "user",
        "content": body.content,
        "created_at": datetime.utcnow(),
    }
    await db["messages"].insert_one(user_msg)

    #build context: last 20 messages
    cursor = db["messages"].find(
        {"conversation_id": conversation_id}
    ).sort("created_at", -1).limit(20)
    recent = await cursor.to_list(length=20)
    recent.reverse()

    openai_messages = [{"role": "system", "content": AGRONOMY_SYSTEM_PROMPT}]
    for m in recent:
        openai_messages.append({"role": m["role"], "content": m["content"]})

    #call openai gpt-5.4-mini
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    client = AsyncOpenAI(api_key=api_key)
    try:
        response = await client.chat.completions.create(
            model="gpt-5.4-mini",
            messages=openai_messages,
            max_completion_tokens=600,
            temperature=0.2,   #less hallucination
        )
        assistant_content = response.choices[0].message.content or "I don't know."
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OpenAI error: {str(e)}")

    #persist assistant message
    asst_result = await db["messages"].insert_one({
        "conversation_id": conversation_id,
        "role": "assistant",
        "content": assistant_content,
        "created_at": datetime.utcnow(),
    })

    #auto-title from first user message
    if conv.get("title") == "New Chat":
        title = body.content[:50].strip()
        if len(body.content) > 50:
            title += "…"
        await db["conversations"].update_one(
            {"_id": _to_oid(conversation_id)},
            {"$set": {"title": title, "updated_at": datetime.utcnow()}}
        )
    else:
        await db["conversations"].update_one(
            {"_id": _to_oid(conversation_id)},
            {"$set": {"updated_at": datetime.utcnow()}}
        )

    return {
        "id": str(asst_result.inserted_id),
        "role": "assistant",
        "content": assistant_content,
    }


@router.get("/summaries")
async def list_summaries(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Return all archived chat summaries for the current user."""
    db = request.app.state.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    cursor = db["chat_summaries"].find(
        {"email": current_user["email"]}
    ).sort("deleted_at", -1)

    docs = await cursor.to_list(length=200)
    return {
        "summaries": [
            {
                "id": str(d["_id"]),
                "title": d.get("title", "Untitled"),
                "message_count": d.get("message_count", 0),
                "created_at": d["created_at"].isoformat(),
                "deleted_at": d["deleted_at"].isoformat(),
                "summary": d.get("summary", ""),
                "messages": d.get("messages", []),
            }
            for d in docs
        ]
    }


@router.post("/conversations/{conversation_id}/archive", status_code=200)
async def archive_conversation(
    conversation_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Summarize, archive to chat_summaries, and then delete the live conversation."""
    db = request.app.state.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    conv = await db["conversations"].find_one(
        {"_id": _to_oid(conversation_id), "email": current_user["email"]}
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    #all messages for summarisation
    msg_count = await db["messages"].count_documents(
        {"conversation_id": conversation_id}
    )
    cursor = db["messages"].find(
        {"conversation_id": conversation_id}
    ).sort("created_at", 1)
    all_msgs = await cursor.to_list(length=500)

    #build transcript
    transcript_lines = []
    for m in all_msgs:
        role_label = "User" if m["role"] == "user" else "Assistant"
        transcript_lines.append(f"{role_label}: {m['content']}")
    transcript = "\n".join(transcript_lines)

    #generate summary with GPT-5.4-mini
    summary_text = ""
    api_key = os.getenv("OPENAI_API_KEY")
    if api_key and transcript.strip():
        client = AsyncOpenAI(api_key=api_key)
        try:
            resp = await client.chat.completions.create(
                model="gpt-5.4-mini",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an expert agricultural data analyst. Summarize the following conversation "
                            "between a farmer and an agronomist in 2-4 concise sentences. Focus on the specific "
                            "crop mentioned, any identified issues (diseases, pests, or nutrient deficiencies), "
                            "and the recommended treatment or next steps. If no specific problem is discussed, "
                            "summarize the general agricultural advice or guidance provided. Reply ONLY with "
                            "the summary, with no introductory text."
                        ),
                    },
                    {"role": "user", "content": transcript[:6000]},
                ],
                max_completion_tokens=200,
                temperature=0.3,
            )
            summary_text = resp.choices[0].message.content or ""
        except Exception:
            summary_text = ""

    if not summary_text:
        first_user = next((m for m in all_msgs if m["role"] == "user"), None)
        summary_text = first_user["content"][:200] if first_user else "No messages."

    #insert into archive with full message history
    await db["chat_summaries"].insert_one({
        "email": current_user["email"],
        "original_conversation_id": conversation_id,
        "title": conv.get("title", "Untitled"),
        "message_count": msg_count,
        "summary": summary_text,
        "messages": [
            {
                "role": m["role"],
                "content": m["content"],
                "created_at": m["created_at"]
            }
            for m in all_msgs
        ],
        "created_at": conv.get("created_at", datetime.utcnow()),
        "deleted_at": datetime.utcnow(),
    })

    #delete live conversation + messages
    await db["conversations"].delete_one({"_id": conv["_id"]})
    await db["messages"].delete_many({"conversation_id": conversation_id})
    return {"status": "archived", "summary": summary_text}


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    db = request.app.state.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database unavailable")

    #fetch the conversation before deleting to ensure ownership
    conv = await db["conversations"].find_one(
        {"_id": _to_oid(conversation_id), "email": current_user["email"]}
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    #hard delete of conversation and messages
    await db["conversations"].delete_one({"_id": conv["_id"]})
    await db["messages"].delete_many({"conversation_id": conversation_id})
    return None
