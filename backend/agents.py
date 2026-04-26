from openai import AsyncOpenAI
import os
import httpx
import asyncio
import rag_service


#agent names
AGENTS = {
    "diagnostician": "🔍 Diagnostician",
    "treatment":     "💊 Treatment Specialist",
    "agronomist":    "🌱 Agronomist",
    "risk_analyst":  "🌦️ Risk Analyst",
}


#router prompt returns one of the 4 agent keys
ROUTER_PROMPT = """\
You are a routing assistant for a wheat disease management app.
Read the user's latest message and decide which specialist should answer.

Specialists:
- diagnostician   → disease identification, symptoms, confirmation of scan results, disease biology
- treatment       → fungicides, pesticides, chemical/organic treatments, dosage, application timing
- agronomist      → soil health, irrigation, fertilization, crop rotation, prevention, farming practices
- risk_analyst    → weather impact on disease, spread risk, environmental conditions

Reply with ONLY the specialist key, nothing else.
Valid replies: diagnostician | treatment | agronomist | risk_analyst
"""

#agent system prompts
FORMATTING_RULE = """\

FORMATTING — this is a mobile chat app, NOT a document editor:
- Write like you're texting someone. Short paragraphs, plain sentences.
- NEVER use markdown: no **, no *, no #, no ---, no backticks, no bullet symbols.
- Use plain numbered lists (1. 2. 3.) only if you really need to list steps.
- No headers, no bold, no italics. Just natural language.
- Emojis are fine if they add clarity, but don't overdo it.
"""

AGENT_PROMPTS = {
    "diagnostician": f"""\
You are the Diagnostician agent inside Smart Vision, a wheat disease detection app \
used by farmers, primarily in Morocco and North Africa.

Your expertise:
- Identifying and explaining wheat diseases: Yellow Rust, Brown Rust, Blast (Magnaporthe), \
Septoria, Powdery Mildew, Fusarium, and others
- Interpreting AI scan results and explaining what they mean
- Describing symptoms, disease lifecycle, and how diseases spread
- Distinguishing between similar-looking diseases
- Explaining severity and urgency of a diagnosis

Rules:
1. If the conversation includes a recent scan result, reference it directly in your answer.
2. Stay strictly within disease identification and biology — do NOT give treatment advice, \
   redirect the user to the Treatment Specialist for that.
3. Be precise, practical, and evidence-based. Never fabricate symptoms or data.
4. Keep answers concise and actionable.
5. If you genuinely don't know, say "I don't know."
6. Respond in the same language as the user's message.
{FORMATTING_RULE}""",

    "treatment": f"""\
You are the Treatment Specialist agent inside Smart Vision, a wheat disease detection app \
used by farmers, primarily in Morocco and North Africa.

Your expertise:
- Fungicide and pesticide recommendations for wheat diseases
- Active ingredients, commercial product names, and modes of action
- Dosage, dilution rates, and application timing
- Spray intervals and pre-harvest intervals (PHI)
- Resistance management and product rotation
- Organic and biological treatment alternatives
- Cost-effectiveness considerations for smallholder farmers

Rules:
1. Always mention that local regulations vary — recommend the farmer checks with their local \
   agricultural extension office for approved products in their region.
2. Do NOT diagnose diseases — if asked to identify a disease, redirect to the Diagnostician.
3. Be precise and practical. Provide specific active ingredient names where possible.
4. If you genuinely don't know, say "I don't know."
5. Respond in the same language as the user's message.
{FORMATTING_RULE}""",

    "agronomist": f"""\
You are the Agronomist agent inside Smart Vision, a wheat disease detection app \
used by farmers, primarily in Morocco and North Africa.

Your expertise:
- Soil health, fertility, and amendment strategies
- Irrigation management and water stress
- Fertilization programs (NPK, micronutrients)
- Crop rotation and intercropping strategies
- Wheat variety selection and resistance
- Preventive cultural practices to reduce disease pressure
- Post-harvest management
- Sustainable and conservation agriculture
- Moroccan and North African agricultural context

Rules:
1. Focus on prevention, management practices, and agronomy — not disease treatment.
2. Tailor advice to smallholder farmers when context allows.
3. Be practical and evidence-based. Never fabricate recommendations.
4. If you genuinely don't know, say "I don't know."
5. Respond in the same language as the user's message.
{FORMATTING_RULE}""",

    "risk_analyst": f"""\
You are the Risk Analyst agent inside Smart Vision, a wheat disease detection app \
used by farmers, primarily in Morocco and North Africa.

Your expertise:
- How weather conditions (temperature, humidity, rainfall, wind) affect disease risk
- Disease spread dynamics and epidemic modeling (simplified for farmers)
- Seasonal risk calendars for wheat diseases in North Africa
- When environmental conditions are favorable for specific pathogens
- Field scouting recommendations based on risk level
- Early warning signs to watch for

Rules:
1. Reason about risk based on what you know about disease epidemiology and weather patterns.
2. If weather data is provided in the conversation, use it. Otherwise, reason from general knowledge.
3. Do not give treatment recommendations — redirect to the Treatment Specialist for that.
4. Be concise and use simple risk language (Low / Medium / High risk).
5. If you genuinely don't know, say "I don't know."
6. Respond in the same language as the user's message.
{FORMATTING_RULE}""",
}


#tools
WEATHER_TOOL = {
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Get current weather conditions at the user's location to assess wheat disease risk.",
        "parameters": {
            "type": "object",
            "properties": {
                "lat": {"type": "number", "description": "Latitude of the user's location"},
                "lon": {"type": "number", "description": "Longitude of the user's location"},
            },
            "required": ["lat", "lon"],
        },
    },
}

async def fetch_weather(lat: float, lon: float) -> str:
    """Call OpenWeatherMap and return a formatted weather summary string."""
    api_key = os.getenv("OPENWEATHER_API_KEY")
    if not api_key:
        return "Weather data unavailable (API key not configured)."
    try:
        url = "https://api.openweathermap.org/data/2.5/weather"
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(url, params={
                "lat": lat, "lon": lon,
                "appid": api_key,
                "units": "metric"
            })
        data = r.json()
        name    = data.get("name", "Unknown location")
        desc    = data["weather"][0]["description"].capitalize()
        temp    = data["main"]["temp"]
        humidity = data["main"]["humidity"]
        wind    = data["wind"]["speed"]
        rain    = data.get("rain", {}).get("1h", 0)
        return (
            f"Location: {name} | Conditions: {desc} | "
            f"Temperature: {temp}°C | Humidity: {humidity}% | "
            f"Wind: {wind} m/s | Rain last hour: {rain} mm"
        )
    except Exception as e:
        return f"Weather data unavailable: {str(e)}"


#functions
async def route_message(user_message: str) -> str:
    """
    Call the router agent to decide which specialist handles this message.
    Returns one of: diagnostician | treatment | agronomist | risk_analyst
    Falls back to 'agronomist' on any error.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return "agronomist"

    client = AsyncOpenAI(api_key=api_key)
    try:
        response = await client.chat.completions.create(
            model="gpt-5.4-nano",
            messages=[
                {"role": "system", "content": ROUTER_PROMPT},
                {"role": "user",   "content": user_message},
            ],
            max_completion_tokens=10,
            temperature=0.0,
        )
        agent_key = response.choices[0].message.content.strip().lower()
        return agent_key if agent_key in AGENTS else "agronomist"
    except Exception:
        return "agronomist"


async def _run_specialist(
    agent_key: str,
    conversation_history: list[dict],
    scan_context: str | None,
    scan_history: str | None,
    lat: float | None,
    lon: float | None,
    client: AsyncOpenAI,
) -> str:
    """Internal — runs one specialist and returns its raw insight."""
    system_prompt = AGENT_PROMPTS.get(agent_key, AGENT_PROMPTS["agronomist"])

    system_prompt += (
        "\n\nYou are part of an expert panel. Give ONLY your specific insight "
        "in 1-2 short sentences. Do not greet, do not redirect, no filler."
    )

    if scan_context:
        system_prompt += f"\n\nScan context: {scan_context}"
    if agent_key == "diagnostician" and scan_history:
        system_prompt += f"\n\nUser scan history:\n{scan_history}"

    #risk analyst pre-fetch live weather and inject it directly
    if agent_key == "risk_analyst" and lat is not None and lon is not None:
        weather_str = await fetch_weather(lat, lon)
        system_prompt += f"\n\nLIVE WEATHER DATA (already fetched — use this, do NOT ask the user):\n{weather_str}"

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(conversation_history)

    try:
        response = await client.chat.completions.create(
            model="gpt-5.4-nano",
            messages=messages,
            max_completion_tokens=200,
            temperature=0.3,
        )
        return response.choices[0].message.content or ""
    except Exception:
        return ""


SYNTHESIZER_PROMPT_TEMPLATE = """\
You are the final voice of Smart Vision's expert panel. Answer the user's question directly in 1-3 sentences.

Rules:
1. Answer ONLY what was asked. Ignore specialist insights that are off-topic.
2. Be direct. No intro, no 'great question', no wrap-up.
3. Never mention 'specialists', 'agents', or 'panel'.
4. Never redirect or say 'consult X'.
5. If only one specialist's insight is relevant, use only that.
6. LANGUAGE (most important rule): The user's question is written in a specific language.
   You MUST reply in that EXACT same language. The reference documents are in French.
   Do NOT let the documents' language influence your response language.
   Detect the user's language from their question and match it exactly.
{extra}
{fmt}"""


async def run_panel(
    user_message: str,
    conversation_history: list[dict],
    scan_context: str | None = None,
    scan_history: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    db=None,
) -> str:
    """
    Runs all 4 specialists in parallel (with live weather + RAG context),
    then synthesizes their insights into one unified, natural response.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return "I'm sorry, the AI service is not configured."

    client = AsyncOpenAI(api_key=api_key)

    #retrieve relevant knowledge from PDFs (RAG)
    rag_context, rag_sources = "", []
    if db is not None:
        rag_context, rag_sources = await rag_service.search_knowledge_base(
            user_message, db, k=3
        )

    #merge RAG context into scan_context for the relevant specialists
    enriched_context = scan_context or ""
    if rag_context:
        enriched_context += (
            ("\n\n" if enriched_context else "") +
            "RELEVANT KNOWLEDGE BASE (from official Moroccan agricultural documents — "
            "use this information, but respond in the USER'S language, not the documents' language):\n"
            + rag_context
        )

    #run all 4 specialists concurrently (diagnostician + treatment get RAG context)
    diag, treat, agro, risk = await asyncio.gather(
        _run_specialist("diagnostician", conversation_history, enriched_context, scan_history, lat, lon, client),
        _run_specialist("treatment",     conversation_history, enriched_context, None,         lat, lon, client),
        _run_specialist("agronomist",    conversation_history, scan_context,     None,         lat, lon, client),
        _run_specialist("risk_analyst",  conversation_history, scan_context,     None,         lat, lon, client),
    )

    #build synthesis input
    panel_summary = (
        f"User's question: {user_message}\n\n"
        f"Diagnostician insight: {diag}\n\n"
        f"Treatment Specialist insight: {treat}\n\n"
        f"Agronomist insight: {agro}\n\n"
        f"Risk Analyst insight: {risk}"
    )

    #build citation footer for the synthesizer
    citation_rule = ""
    if rag_sources:
        source_list = ", ".join(rag_sources)
        citation_rule = (
            f"\n7. You have access to official document context. If you used it, "
            f"append at the very end of your reply (on a new line, in the user's language): "
            f"'(Source: {source_list})'"
        )

    #build language-locked synthesizer prompt
    synth_prompt = SYNTHESIZER_PROMPT_TEMPLATE.format(
        extra=citation_rule,
        fmt=FORMATTING_RULE,
    )

    synth_messages = [
        {"role": "system", "content": synth_prompt},
        {"role": "user",   "content": panel_summary},
    ]

    try:
        response = await client.chat.completions.create(
            model="gpt-5.4-nano",
            messages=synth_messages,
            max_completion_tokens=280,
            temperature=0.3,
        )
        return response.choices[0].message.content or "I don't know."
    except Exception as e:
        return f"I'm sorry, I encountered an error: {str(e)}"
