import json, os, base64, time, hashlib
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
import anthropic
from openai import OpenAI
import numpy as np
from dotenv import load_dotenv
import psycopg2
import psycopg2.extras
import posthog as posthog_lib

load_dotenv()
app = Flask(__name__, static_folder=".", static_url_path="")

# ── PostHog backend SDK ───────────────────────────────────────────────────
posthog_lib.project_api_key = os.environ.get("POSTHOG", "")
posthog_lib.host = "https://us.i.posthog.com"

# ── PostgreSQL persistent cache ───────────────────────────────────────────
_db_conn = None

def _get_db():
    global _db_conn
    url = os.environ.get("DATABASE_URL")
    if not url:
        return None
    try:
        if _db_conn is None or _db_conn.closed:
            _db_conn = psycopg2.connect(url)
            _db_conn.autocommit = True
        # Test connection
        with _db_conn.cursor() as cur:
            cur.execute("SELECT 1")
        return _db_conn
    except Exception:
        try:
            _db_conn = psycopg2.connect(url)
            _db_conn.autocommit = True
            return _db_conn
        except Exception as e:
            print(f"DB connection failed: {e}")
            return None

def _init_db():
    db = _get_db()
    if not db:
        print("No DATABASE_URL set — running without persistent cache")
        return
    with db.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS query_cache (
                id SERIAL PRIMARY KEY,
                cache_key TEXT UNIQUE NOT NULL,
                query TEXT NOT NULL,
                model TEXT NOT NULL,
                response_json JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                hit_count INTEGER DEFAULT 0,
                last_hit_at TIMESTAMP
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS event_log (
                id SERIAL PRIMARY KEY,
                event_type TEXT NOT NULL,
                data JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS chart_feedback (
                id SERIAL PRIMARY KEY,
                trace_id TEXT,
                query TEXT NOT NULL,
                model TEXT,
                rating TEXT NOT NULL,
                comment TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
    print("Database tables initialized")

_init_db()

def _cache_get(cache_key: str) -> dict | None:
    db = _get_db()
    if not db:
        return None
    try:
        with db.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "UPDATE query_cache SET hit_count = hit_count + 1, last_hit_at = NOW() "
                "WHERE cache_key = %s RETURNING response_json",
                (cache_key,),
            )
            row = cur.fetchone()
            return row["response_json"] if row else None
    except Exception as e:
        print(f"Cache get error: {e}")
        return None

def _cache_set(cache_key: str, query: str, model: str, data: dict):
    db = _get_db()
    if not db:
        return
    try:
        with db.cursor() as cur:
            cur.execute(
                "INSERT INTO query_cache (cache_key, query, model, response_json) "
                "VALUES (%s, %s, %s, %s) "
                "ON CONFLICT (cache_key) DO UPDATE SET response_json = EXCLUDED.response_json, "
                "created_at = NOW(), hit_count = 0",
                (cache_key, query, model, json.dumps(data, default=str)),
            )
    except Exception as e:
        print(f"Cache set error: {e}")

def _log_event(event_type: str, data: dict):
    db = _get_db()
    if not db:
        return
    try:
        with db.cursor() as cur:
            cur.execute(
                "INSERT INTO event_log (event_type, data) VALUES (%s, %s)",
                (event_type, json.dumps(data, default=str)),
            )
    except Exception as e:
        print(f"Event log error: {e}")

# ── Load dataset at startup ────────────────────────────────────────────────
with open("data/alumni_processed.json") as f:
    _alumni_raw = json.load(f)
_NAME_LOOKUP = {p["full_name"]: p for p in _alumni_raw if p.get("full_name")}

# Load pre-generated path summaries
_PATHS_FILE = "data/alumni_paths.json"
_alumni_paths = []
if os.path.exists(_PATHS_FILE):
    with open(_PATHS_FILE) as f:
        _alumni_paths = json.load(f)
    print(f"Loaded {len(_alumni_paths)} alumni path summaries")
else:
    print(f"WARNING: {_PATHS_FILE} not found. Run generate_paths.py first.")

# Load path embeddings for semantic search
_PATH_EMBEDDINGS_FILE = "data/path_embeddings.npy"
_path_embeddings = None
if os.path.exists(_PATH_EMBEDDINGS_FILE):
    _path_embeddings = np.load(_PATH_EMBEDDINGS_FILE)
    print(f"Loaded path embeddings: {_path_embeddings.shape}")
else:
    print(f"WARNING: {_PATH_EMBEDDINGS_FILE} not found. Semantic search disabled.")

_openai_client = None
def _get_openai_client():
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _openai_client

# ── Tool implementations (run locally on server) ───────────────────────────
def _tool_search_alumni(query: str, field: str = "any") -> list[dict]:
    """Case-insensitive text search across the dataset."""
    q = query.lower()
    results = []
    for p in _alumni_raw:
        hit = False
        if field in ("any", "name") and q in (p.get("full_name") or "").lower(): hit = True
        if field in ("any", "headline") and q in (p.get("headline") or "").lower(): hit = True
        if field in ("any", "education_school"):
            if any(q in (e.get("school") or "").lower() for e in p.get("education", [])): hit = True
        if field in ("any", "career_company"):
            if any(q in (c.get("company") or "").lower() for c in p.get("career", [])): hit = True
        if hit:
            results.append({
                "name": p["full_name"],
                "headline": (p.get("headline") or "").strip(),
                "cdtm_class": p.get("cdtm_class"),
                "cdtm_year": p.get("cdtm_anchor_year"),
                "education": [{"school": e["school"], "degree_raw": e.get("degree_raw",""), "end_year": e.get("end_year")}
                              for e in p.get("education", [])],
                "career": [{"company": c["company"], "title": c["title"], "start_year": c.get("start_year"),
                            "end_year": c.get("end_year"), "is_current": c.get("is_current")}
                           for c in p.get("career", [])],
            })
    return results

def _tool_get_alumni_details(names: list[str]) -> list[dict]:
    """Return full education + career records for named alumni."""
    return [_tool_search_alumni(name, "name")[0]
            for name in names if _NAME_LOOKUP.get(name)]

def _tool_filter_alumni(career_type: str = None, education_field: str = None,
                         is_current_founder: bool = None,
                         cdtm_year_from: int = None, cdtm_year_to: int = None) -> list[dict]:
    """Structured filter on normalized fields."""
    results = []
    for p in _alumni_raw:
        s = p.get("summary", {})
        if career_type and career_type.lower() not in (s.get("current_career_type") or "").lower(): continue
        if education_field and education_field.lower() not in (s.get("primary_field") or "").lower(): continue
        if is_current_founder is not None:
            founder_keywords = ["founder", "co-founder", "ceo", "cto"]
            current = (s.get("current_career_type") or "").lower()
            is_f = any(k in current for k in founder_keywords) or "founder" in (p.get("headline") or "").lower()
            if is_f != is_current_founder: continue
        year = p.get("cdtm_anchor_year")
        if cdtm_year_from and (not year or year < cdtm_year_from): continue
        if cdtm_year_to and (not year or year > cdtm_year_to): continue
        results.append({
            "name": p["full_name"], "headline": (p.get("headline") or "").strip(),
            "cdtm_class": p.get("cdtm_class"), "cdtm_year": year, "summary": s,
        })
    return results

MAX_PATH_RESULTS = 80

# Synonym groups: searching for any word in a group also matches the others
_SYNONYM_GROUPS = [
    {"founded", "co-founded", "founder", "co-founder", "founding"},
    {"ceo", "chief executive"},
    {"cto", "chief technology"},
    {"cfo", "chief financial"},
    {"consulting", "consultant", "advisory"},
    {"mckinsey", "mck"},
    {"startup", "start-up", "early-stage"},
    {"unicorn"},
    {"professor", "faculty", "tenure"},
    {"phd", "doctorate", "doctoral"},
    {"research", "researcher", "research scientist"},
    {"engineer", "engineering", "swe", "software engineer", "software developer"},
    {"product manager", "pm", "product management"},
    {"venture capital", "vc", "investor", "investing"},
    {"private equity", "pe"},
    {"investment banking", "ib"},
]

def _expand_synonyms(query_lower: str) -> list[str]:
    """Return a list of synonyms for a query term (including itself)."""
    expansions = [query_lower]
    for group in _SYNONYM_GROUPS:
        if query_lower in group:
            expansions.extend(s for s in group if s != query_lower)
            break
    return expansions

def _query_matches(q_lower: str, p_lower: str) -> bool:
    """Check if any synonym of q_lower appears in the path string."""
    return any(syn in p_lower for syn in _expand_synonyms(q_lower))

def _tool_search_paths(queries: list[str], match_all: bool = False) -> dict:
    """Search path summaries with synonym expansion. match_all=True requires ALL keywords to match (AND logic)."""
    all_paths = [entry["path"] for entry in _alumni_paths]
    results = []
    seen = set()
    for p in all_paths:
        p_lower = p.lower()
        q_lower = [q.lower() for q in queries]
        if match_all:
            hit = all(_query_matches(q, p_lower) for q in q_lower)
        else:
            hit = any(_query_matches(q, p_lower) for q in q_lower)
        if hit and p not in seen:
            results.append(p)
            seen.add(p)
    total = len(results)
    truncated = total > MAX_PATH_RESULTS
    return {
        "total": total,
        "truncated": truncated,
        "paths": results[:MAX_PATH_RESULTS],
        "hint": f"Showing {min(total, MAX_PATH_RESULTS)}/{total} results. Use match_all=true or more specific keywords to narrow down." if truncated else None,
    }

def _tool_semantic_search_paths(query: str, top_k: int = 40) -> dict:
    """Embed the query and find the most semantically similar path summaries."""
    if _path_embeddings is None:
        return {"error": "Path embeddings not loaded. Run embedding generation first."}
    client = _get_openai_client()
    resp = client.embeddings.create(model="text-embedding-3-small", input=[query])
    qvec = np.array(resp.data[0].embedding, dtype=np.float32)
    qvec = qvec / np.linalg.norm(qvec)

    scores = _path_embeddings @ qvec
    top_k = min(top_k, len(scores))
    top_indices = np.argsort(scores)[::-1][:top_k]

    results = []
    for idx in top_indices:
        if scores[idx] < 0.15:  # skip very low similarity
            break
        results.append({
            "path": _alumni_paths[int(idx)]["path"],
            "score": round(float(scores[idx]), 3),
        })
    return {
        "total": len(results),
        "paths": results,
    }

def _run_tool(name: str, inp: dict):
    if name == "search_paths":
        return _tool_search_paths(inp["queries"], inp.get("match_all", False))
    if name == "semantic_search_paths":
        return _tool_semantic_search_paths(inp["query"], inp.get("top_k", 40))
    if name == "search_alumni":
        return _tool_search_alumni(inp["query"], inp.get("field", "any"))
    if name == "get_alumni_details":
        return _tool_get_alumni_details(inp["names"])
    if name == "filter_alumni":
        return _tool_filter_alumni(**{k: v for k, v in inp.items()})
    return {"error": f"Unknown tool: {name}"}

# ── Tool definitions for Claude ────────────────────────────────────────────
# Core tools — always available (path-based search only)
TOOLS_CORE = [
    {
        "name": "search_paths",
        "description": (
            "Search compressed life-path summaries. Returns max 80 results with total count. "
            "Each path is a single line like: 'Name | CDTM Fall 2020 | station1 -> station2 -> ...'. "
            "By default uses OR logic (any keyword matches). Set match_all=true for AND logic "
            "(all keywords must appear in the same path). "
            "For cross-cutting queries like 'consulting to startup', use match_all=true with keywords "
            "from BOTH criteria, e.g. queries=['BCG', 'founded'] match_all=true. "
            "Or call multiple times with match_all=true using different consulting firm + founder combos. "
            "Results are capped at 80 — use more specific keywords or match_all if you get truncated results."
        ),
        "input_schema": {"type": "object", "required": ["queries"], "properties": {
            "queries": {"type": "array", "items": {"type": "string"},
                        "description": "List of keywords to search for"},
            "match_all": {"type": "boolean", "default": False,
                          "description": "If true, ALL keywords must match (AND logic). If false (default), ANY keyword matches (OR logic)."},
        }},
    },
    {
        "name": "semantic_search_paths",
        "description": (
            "Semantic search over life-path summaries using embeddings. "
            "Use this when keyword search is too narrow or you need conceptual matching "
            "(e.g. 'pivoted from finance to deep tech', 'serial entrepreneurs', "
            "'people who left big companies to start something'). "
            "Returns paths ranked by similarity score. Complements search_paths — "
            "use keyword search for specific companies/schools, semantic search for themes and patterns."
        ),
        "input_schema": {"type": "object", "required": ["query"], "properties": {
            "query": {"type": "string", "description": "Natural language description of the career pattern to find"},
            "top_k": {"type": "integer", "default": 40, "description": "Max results to return (default 40)"},
        }},
    },
]

# Detail tools — only available in detail mode
TOOLS_DETAIL = [
    {
        "name": "get_alumni_details",
        "description": (
            "Fetch full structured education + career records for specific alumni by exact name. "
            "Use this AFTER scanning paths to get detailed data for the people you want to include "
            "in the visualization."
        ),
        "input_schema": {"type": "object", "required": ["names"], "properties": {
            "names": {"type": "array", "items": {"type": "string"}, "description": "Exact full names"},
        }},
    },
    {
        "name": "search_alumni",
        "description": "Case-insensitive text search across full alumni records. Returns matching people with their full education and career history.",
        "input_schema": {"type": "object", "required": ["query"], "properties": {
            "query": {"type": "string", "description": "Text to search for"},
            "field": {"type": "string", "enum": ["any","name","headline","education_school","career_company"],
                      "description": "Which field to search (default: any)"},
        }},
    },
    {
        "name": "filter_alumni",
        "description": "Filter alumni by structured criteria (career type, field of study, founder status, CDTM year range).",
        "input_schema": {"type": "object", "properties": {
            "career_type": {"type": "string", "description": "e.g. 'Entrepreneurship', 'Consulting', 'Big Tech'"},
            "education_field": {"type": "string", "description": "e.g. 'Computer Science', 'Engineering', 'Business'"},
            "is_current_founder": {"type": "boolean"},
            "cdtm_year_from": {"type": "integer"},
            "cdtm_year_to": {"type": "integer"},
        }},
    },
]

def _build_tools(detail_mode: bool) -> list[dict]:
    return TOOLS_CORE + TOOLS_DETAIL if detail_mode else TOOLS_CORE

_SYSTEM_STRATEGY_LITE = """
STRATEGY — always follow this approach:

Step 1: SEARCH — Use BOTH search tools to find matching alumni from their compressed life-path summaries.
Each path is a single line like:
  "Name | CDTM Fall 2018 | TUM (CS) -> McKinsey (2y) -> co-founded Celonis [unicorn] (current)"

You have TWO search tools — use whichever fits best, or BOTH for thorough coverage:
  - search_paths: keyword search with synonym expansion. Best for specific companies, schools, roles.
    Use match_all=true for cross-cutting queries:
      search_paths(["McKinsey", "founded"], match_all=true)
  - semantic_search_paths: meaning-based search using embeddings. Best for themes and patterns:
      semantic_search_paths("people who left consulting to found startups")
      semantic_search_paths("unicorn founders from CDTM")

For broad or conceptual queries, prefer semantic_search_paths. For specific entities, prefer search_paths.
For best results, call BOTH in parallel and merge the results.

Step 2: BUILD — Extract column values DIRECTLY from the path summaries. The path strings contain
all the information you need: name, CDTM cohort, schools, degrees, companies, roles, durations,
and current status. Parse these to build the visualization columns. Do NOT call any other tools.

IMPORTANT: There are 1000+ alumni. Never try to fetch all paths at once — always use specific keywords."""

_SYSTEM_STRATEGY_DETAIL = """
STRATEGY — always follow this approach:

Step 1: SCAN — Use BOTH search tools to find matching alumni from their compressed life-path summaries.
Each path is a single line like:
  "Name | CDTM Fall 2018 | TUM (CS) -> McKinsey (2y) -> co-founded Celonis [unicorn] (current)"

You have TWO search tools — use whichever fits best, or BOTH for thorough coverage:
  - search_paths: keyword search with synonym expansion. Best for specific companies, schools, roles.
    Use match_all=true for cross-cutting queries:
      search_paths(["McKinsey", "founded"], match_all=true)
  - semantic_search_paths: meaning-based search using embeddings. Best for themes and patterns:
      semantic_search_paths("people who left consulting to found startups")
      semantic_search_paths("unicorn founders from CDTM")

For broad or conceptual queries, prefer semantic_search_paths. For specific entities, prefer search_paths.
For best results, call BOTH in parallel and merge the results.

Step 2: DEEP DIVE — Call get_alumni_details with the exact names of selected alumni to get
their full structured education + career records. Use this detailed data to build precise
column values for the visualization.

You may also use search_alumni or filter_alumni for targeted lookups.

IMPORTANT: There are 1000+ alumni. Never try to fetch all paths at once — always use specific keywords."""

_SYSTEM_COMMON = """You are an expert analyst for CDTM alumni data. You have tools to explore compressed
life-path summaries and detailed alumni records.
{strategy}

When done, return a final JSON object (and ONLY JSON — no markdown fences):

{{
  "analysis": "<2-4 sentences summarizing findings>",
  "title": "<short visualization title, max 60 chars>",
  "column_labels": ["LABEL1", "LABEL2", ...],
  "paths": [{{"name": "<full_name>", "values": ["val1", null, "val3", ...]}}]
}}

SKIP LOGIC — values can be null:
- If a person does NOT have a meaningful value for a column, use null (not "N/A" or "Other").
- Example: in a flow "EDUCATION → CONSULTING → STARTUP", someone who went straight from
  education to founding a startup (no consulting phase) should have null for the CONSULTING column.
- The visualization will draw their line directly from EDUCATION to STARTUP, skipping CONSULTING.
- This is much better than forcing everyone into every stage with catch-all buckets.
- Every person must have at least 2 non-null values.
- null is ONLY for genuinely inapplicable stages — not for missing data. Use "Unknown" for missing data.

column_labels: 4–8 ALL-CAPS labels that tell a story. More stages = better. Examples:
  YC query → ["CDTM COHORT", "YC BATCH", "YC COMPANY", "CURRENT STATUS"]
  Founders → ["BACKGROUND", "COMPANY", "INDUSTRY", "CURRENT ROLE"]
  Career pivots → ["FIRST CAREER", "PIVOT POINT", "CURRENT FIELD", "OUTCOME"]

COLUMN QUALITY — each column must reveal a meaningful pattern:
- EVERY column must have between 2 and 8 distinct values. This is a hard constraint.
- DEGENERATE COLUMNS — never include a column where:
  • A single value covers >80% of non-null people (no differentiation — drop the column entirely)
  • Most people have a unique value (too granular — aggregate into categories first)
  If a column would be degenerate, either merge values more aggressively or omit it.
  Consider using null for people who don't fit a column rather than forcing an "Other" bucket.
- Prefer columns that SPLIT the group into roughly balanced clusters (e.g. 3 groups of ~10
  is far better than 1 group of 25 + 5 singletons).
- Think about what makes a compelling flow: the reader should see forks and convergences.
  A column where everyone takes the same path adds nothing.

NORMALIZATION — this is critical for a readable chart:
- Each column should have at most 6–8 distinct values. Aggressively group similar entries.
- Normalize job titles semantically: "Visiting Student Researcher", "Visiting Researcher",
  "Research Intern" → all become "Visiting Researcher". "Software Engineer", "SWE",
  "Software Developer" → "Software Engineer". Use the most common/canonical form.
- FOUNDER ROLES — collapse aggressively. The ONLY valid founder categories are:
  "Founder" (includes Co-Founder, Founder & CEO, Co-Founder & CEO, Founding Engineer, etc.)
  "Founder & CTO" (only if the technical co-founder distinction matters for the query)
  Never output "Co-Founder", "Co-Founder & CEO", "Founder & CEO" etc. as separate values.
- Normalize other roles to functional categories when a column represents role type.
- Normalize company names: use the parent brand, not subsidiaries or legal entities.
- COHORT/YEAR COLUMNS — always use the exact CDTM class label (e.g. "Fall 2020", "Spring 2018").
  Keep individual semesters when there are ≤15 distinct values. Only group into year ranges
  (e.g. "2010–2014") when there are too many distinct semesters to display.
  Always sort cohort values chronologically (Spring before Fall within a year).
- MANDATORY GROUPING — after building all paths, review each column:
  • Count how many distinct values it has and how many people per value.
  • If more than 3 values have ≤2 people each, you MUST merge them into broader categories.
  • Example: 8 different company names with 1 person each → group by industry ("FinTech", "HealthTech", "SaaS", etc.)
  • Example: 10 unique job titles with 1 person each → group by function ("Engineering", "Product", "Operations", etc.)
  • The goal is clusters of 3+ people. Singletons should be rare exceptions, not the norm.
- Use "Other" as a catch-all for any tail group with ≤2 people.
- values must be short (max 30 chars) and consistent within a column.
- Use "Unknown" only for genuinely missing data.

Include 5–80 relevant alumni. If a query is too broad, pick the most illustrative subset.

Note: Y Combinator appears in alumni education entries with school = "Y Combinator"."""

def _build_system_prompt(detail_mode: bool) -> str:
    strategy = _SYSTEM_STRATEGY_DETAIL if detail_mode else _SYSTEM_STRATEGY_LITE
    return _SYSTEM_COMMON.format(strategy=strategy)

def _to_openai_tools(tools: list[dict]) -> list[dict]:
    return [
        {"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["input_schema"]}}
        for t in tools
    ]

ANTHROPIC_MODELS = {"claude-sonnet-4-6", "claude-haiku-4-5-20251001"}
OPENAI_MODELS = {"gpt-4.1", "gpt-5", "gpt-5.2", "gpt-5-mini"}
ALLOWED_MODELS = ANTHROPIC_MODELS | OPENAI_MODELS

# Cost per million tokens (USD) — input / output
MODEL_COSTS = {
    "claude-sonnet-4-6":        (3.0, 15.0),
    "claude-haiku-4-5-20251001": (0.80, 4.0),
    "gpt-4.1":                  (2.0, 8.0),
    "gpt-5-mini":               (1.50, 6.0),
    "gpt-5":                    (10.0, 30.0),
    "gpt-5.2":                  (10.0, 30.0),
}

# ── Trace helpers ─────────────────────────────────────────────────────────
TRACES_DIR = "traces"
os.makedirs(TRACES_DIR, exist_ok=True)

def _save_trace(trace: dict) -> str:
    """Save a trace to the traces/ directory. Returns the trace_id."""
    trace_id = trace["trace_id"]
    path = os.path.join(TRACES_DIR, f"{trace_id}.json")
    with open(path, "w") as f:
        json.dump(trace, f, indent=2, default=str)
    print(f"[Trace saved to {path}]")
    return trace_id

def _make_trace_id(model: str) -> str:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    short_model = model.replace("claude-", "").replace("-20251001", "").replace(".", "_")
    return f"{ts}_{short_model}"

# ── Anthropic agentic loop ────────────────────────────────────────────────
def _run_anthropic(query: str, model: str, detail_mode: bool = False) -> tuple[str, str]:
    """Returns (raw_response, trace_id)."""
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    messages = [{"role": "user", "content": query}]
    system = _build_system_prompt(detail_mode)
    tools = _build_tools(detail_mode)

    trace_id = _make_trace_id(model)
    trace = {
        "trace_id": trace_id,
        "timestamp": datetime.now().isoformat(),
        "query": query,
        "model": model,
        "provider": "anthropic",
        "detail_mode": detail_mode,
        "system_prompt": system,
        "turns": [],
        "final_response": None,
    }

    raw = ""
    turn = 0
    while True:
        turn += 1
        print(f"\n{'='*60}\n[Turn {turn}] Calling Claude ({model}) ({len(messages)} messages so far)")
        resp = client.messages.create(
            model=model, max_tokens=4096, system=system, tools=tools, messages=messages,
        )
        print(f"[Turn {turn}] stop_reason={resp.stop_reason}  blocks={[b.type for b in resp.content]}")

        usage = resp.usage
        turn_record = {
            "turn": turn, "stop_reason": resp.stop_reason, "tool_calls": [], "text": None,
            "input_tokens": usage.input_tokens, "output_tokens": usage.output_tokens,
        }
        messages.append({"role": "assistant", "content": resp.content})

        if resp.stop_reason == "end_turn":
            raw = next((b.text for b in resp.content if hasattr(b, "text")), "")
            turn_record["text"] = raw
            trace["turns"].append(turn_record)
            print(f"[Turn {turn}] Final text ({len(raw)} chars):\n{raw[:500]}")
            break
        if resp.stop_reason == "tool_use":
            tool_results = []
            for block in resp.content:
                if block.type == "text":
                    turn_record["text"] = block.text
                if block.type == "tool_use":
                    print(f"[Turn {turn}] Tool call: {block.name}({block.input})")
                    result = _run_tool(block.name, block.input)
                    result_len = len(result) if isinstance(result, list) else (result.get("total") if isinstance(result, dict) else None)
                    print(f"[Turn {turn}] Tool result: {result_len} items")
                    turn_record["tool_calls"].append({
                        "tool": block.name,
                        "input": block.input,
                        "result_count": result_len,
                        "result": result,
                    })
                    tool_results.append({
                        "type": "tool_result", "tool_use_id": block.id,
                        "content": json.dumps(result),
                    })
            trace["turns"].append(turn_record)
            messages.append({"role": "user", "content": tool_results})
            continue
        print(f"[Turn {turn}] Unexpected stop_reason: {resp.stop_reason}")
        trace["turns"].append(turn_record)
        break

    trace["final_response"] = raw
    _save_trace(trace)
    return raw, trace_id

# ── OpenAI agentic loop ──────────────────────────────────────────────────
MAX_OPENAI_TURNS = 15

def _run_openai(query: str, model: str, detail_mode: bool = False) -> tuple[str, str]:
    """Returns (raw_response, trace_id)."""
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    system = _build_system_prompt(detail_mode)
    tools = _build_tools(detail_mode)
    openai_tools = _to_openai_tools(tools)
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": query},
    ]

    trace_id = _make_trace_id(model)
    trace = {
        "trace_id": trace_id,
        "timestamp": datetime.now().isoformat(),
        "query": query,
        "model": model,
        "provider": "openai",
        "detail_mode": detail_mode,
        "system_prompt": system,
        "turns": [],
        "final_response": None,
    }

    raw = ""
    turn = 0
    while turn < MAX_OPENAI_TURNS:
        turn += 1
        print(f"\n{'='*60}\n[Turn {turn}] Calling OpenAI ({model}) ({len(messages)} messages so far)")
        resp = client.chat.completions.create(
            model=model, max_completion_tokens=16384, messages=messages, tools=openai_tools,
        )
        choice = resp.choices[0]
        msg = choice.message
        tc_count = len(msg.tool_calls or [])
        print(f"[Turn {turn}] finish_reason={choice.finish_reason}  tool_calls={tc_count}  content={len(msg.content or '')} chars")

        usage = resp.usage
        turn_record = {
            "turn": turn, "finish_reason": choice.finish_reason, "tool_calls": [], "text": None,
            "input_tokens": usage.prompt_tokens if usage else 0,
            "output_tokens": usage.completion_tokens if usage else 0,
        }
        messages.append(msg)

        if choice.finish_reason in ("stop", "length"):
            raw = msg.content or ""
            turn_record["text"] = raw
            trace["turns"].append(turn_record)
            if choice.finish_reason == "length":
                print(f"[Turn {turn}] WARNING: hit token limit, got {len(raw)} chars of partial content")
            print(f"[Turn {turn}] Final text ({len(raw)} chars):\n{raw[:500]}")
            break
        if choice.finish_reason in ("tool_calls", "function_call"):
            for tc in (msg.tool_calls or []):
                fname = tc.function.name
                args = json.loads(tc.function.arguments)
                print(f"[Turn {turn}] Tool call: {fname}({args})")
                result = _run_tool(fname, args)
                result_len = len(result) if isinstance(result, list) else (result.get("total") if isinstance(result, dict) else None)
                print(f"[Turn {turn}] Tool result: {result_len} items")
                turn_record["tool_calls"].append({
                    "tool": fname,
                    "input": args,
                    "result_count": result_len,
                    "result": result,
                })
                messages.append({
                    "role": "tool", "tool_call_id": tc.id,
                    "content": json.dumps(result),
                })
            trace["turns"].append(turn_record)
            continue
        print(f"[Turn {turn}] Unexpected finish_reason: {choice.finish_reason}")
        trace["turns"].append(turn_record)
        break

    trace["final_response"] = raw
    _save_trace(trace)
    return raw, trace_id

# ── Endpoint ───────────────────────────────────────────────────────────────
@app.route("/api/query", methods=["POST"])
def api_query():
    body = request.get_json(force=True, silent=True) or {}
    query = (body.get("query") or "").strip()
    if not query:
        return jsonify({"error": "query is required"}), 400

    model = body.get("model", "claude-sonnet-4-6")
    if model not in ALLOWED_MODELS:
        return jsonify({"error": f"unknown model: {model}"}), 400
    detail_mode = bool(body.get("detail_mode", False))

    # ── Check server-side cache (shared across all users) ──
    cache_key = f"{model}::{query.lower()}"
    cached = _cache_get(cache_key)
    if cached:
        _log_event("query_cache_hit", {"query": query, "model": model})
        try:
            posthog_lib.capture("server", "query_cache_hit", {"query": query, "model": model})
        except Exception:
            pass
        cached["cached"] = True
        return jsonify(cached)

    t0 = time.time()

    try:
        if model in OPENAI_MODELS:
            raw, trace_id = _run_openai(query, model, detail_mode)
        else:
            raw, trace_id = _run_anthropic(query, model, detail_mode)

        # Strip markdown fences if present
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"): raw = raw[4:]
        # Extract the first complete JSON object by matching braces
        start = raw.find("{")
        if start == -1:
            raise ValueError(f"No JSON object found in response: {raw[:300]}")
        depth = 0
        end = start
        in_str = False
        escape = False
        for i in range(start, len(raw)):
            c = raw[i]
            if escape:
                escape = False
                continue
            if c == '\\' and in_str:
                escape = True
                continue
            if c == '"' and not escape:
                in_str = not in_str
                continue
            if in_str:
                continue
            if c == '{': depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if depth != 0:
            raise ValueError(f"Unbalanced JSON braces in response: {raw[:300]}")
        data = json.loads(raw[start:end])

        # Enrich with linkedin; pad/trim values to column count (preserving nulls)
        n = len(data["column_labels"])
        for path in data.get("paths", []):
            person = _NAME_LOOKUP.get(path["name"], {})
            path["linkedin"] = person.get("linkedin_url")
            path.setdefault("headline", (person.get("headline") or "").strip())
            v = path.setdefault("values", [])
            while len(v) < n: v.append(None)
            path["values"] = v[:n]

        # Build debug summary from the trace
        duration_ms = round((time.time() - t0) * 1000)
        trace_path = os.path.join(TRACES_DIR, f"{trace_id}.json")
        debug = {"turns": [], "total_input_tokens": 0, "total_output_tokens": 0, "cost_usd": 0, "detail_mode": detail_mode, "duration_ms": duration_ms}
        if os.path.exists(trace_path):
            with open(trace_path) as tf:
                trace_data = json.load(tf)
            for t in trace_data.get("turns", []):
                inp_tok = t.get("input_tokens", 0)
                out_tok = t.get("output_tokens", 0)
                debug["total_input_tokens"] += inp_tok
                debug["total_output_tokens"] += out_tok
                turn_info = {
                    "turn": t["turn"],
                    "input_tokens": inp_tok,
                    "output_tokens": out_tok,
                    "tool_calls": [
                        {"tool": tc["tool"], "input": tc["input"], "result_count": tc.get("result_count")}
                        for tc in t.get("tool_calls", [])
                    ],
                }
                debug["turns"].append(turn_info)
            # Compute cost
            cost_in, cost_out = MODEL_COSTS.get(model, (0, 0))
            debug["cost_usd"] = round(
                (debug["total_input_tokens"] * cost_in + debug["total_output_tokens"] * cost_out) / 1_000_000, 4
            )

        # Include trace_id so frontend can attach the screenshot
        data["trace_id"] = trace_id
        data["debug"] = debug

        # ── Store in persistent cache ──
        _cache_set(cache_key, query, model, data)

        # ── Log event ──
        event_data = {
            "query": query, "model": model, "duration_ms": duration_ms,
            "num_paths": len(data.get("paths", [])),
            "total_input_tokens": debug["total_input_tokens"],
            "total_output_tokens": debug["total_output_tokens"],
            "cost_usd": debug["cost_usd"],
            "trace_id": trace_id,
        }
        _log_event("query_completed", event_data)
        try:
            posthog_lib.capture("server", "query_completed", event_data)
        except Exception:
            pass

        return jsonify(data)

    except json.JSONDecodeError as e:
        _log_event("query_error", {"query": query, "model": model, "error": str(e)})
        return jsonify({"error": f"AI returned invalid JSON: {e}"}), 502
    except Exception as e:
        _log_event("query_error", {"query": query, "model": model, "error": str(e)})
        app.logger.exception("Error in /api/query")
        return jsonify({"error": str(e)}), 500

@app.route("/api/popular-queries", methods=["GET"])
def api_popular_queries():
    """Return cached queries sorted by popularity (for cross-user suggestions)."""
    db = _get_db()
    if not db:
        return jsonify([])
    try:
        with db.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT query, model, hit_count, created_at "
                "FROM query_cache ORDER BY hit_count DESC, created_at DESC LIMIT 20"
            )
            rows = cur.fetchall()
        return jsonify([
            {"query": r["query"], "hit_count": r["hit_count"],
             "created_at": r["created_at"].isoformat() if r["created_at"] else None}
            for r in rows
        ])
    except Exception as e:
        print(f"Popular queries error: {e}")
        return jsonify([])

@app.route("/api/shared/<share_id>")
def api_shared(share_id):
    """Look up a cached query result by share ID (short hash of cache_key)."""
    db = _get_db()
    if not db:
        return jsonify({"error": "sharing unavailable"}), 503
    try:
        with db.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT query, response_json FROM query_cache "
                "WHERE md5(cache_key) LIKE %s || '%%' LIMIT 1",
                (share_id,),
            )
            row = cur.fetchone()
        if not row:
            return jsonify({"error": "shared graph not found"}), 404
        result = row["response_json"]
        result["query"] = row["query"]
        result["cached"] = True
        return jsonify(result)
    except Exception as e:
        print(f"Shared lookup error: {e}")
        return jsonify({"error": "lookup failed"}), 500

@app.route("/api/feedback", methods=["POST"])
def api_feedback():
    """Save chart feedback (thumbs up/down + optional comment)."""
    body = request.get_json(force=True, silent=True) or {}
    rating = body.get("rating", "")
    if rating not in ("up", "down"):
        return jsonify({"error": "rating must be 'up' or 'down'"}), 400
    query = (body.get("query") or "").strip()
    comment = (body.get("comment") or "").strip()[:500]
    trace_id = body.get("trace_id", "")
    model = body.get("model", "")

    # Save to DB
    db = _get_db()
    if db:
        try:
            with db.cursor() as cur:
                cur.execute(
                    "INSERT INTO chart_feedback (trace_id, query, model, rating, comment) "
                    "VALUES (%s, %s, %s, %s, %s)",
                    (trace_id, query, model, rating, comment or None),
                )
        except Exception as e:
            print(f"Feedback save error: {e}")

    # Log to event_log + PostHog
    event_data = {"query": query, "model": model, "rating": rating, "comment": comment, "trace_id": trace_id}
    _log_event("chart_feedback", event_data)
    try:
        posthog_lib.capture("server", "chart_feedback", event_data)
    except Exception:
        pass

    return jsonify({"ok": True})

@app.route("/api/trace-screenshot", methods=["POST"])
def api_trace_screenshot():
    """Save a PNG screenshot of the rendered chart alongside its trace."""
    body = request.get_json(force=True, silent=True) or {}
    trace_id = body.get("trace_id", "")
    image_data = body.get("image", "")
    if not trace_id or not image_data:
        return jsonify({"error": "trace_id and image required"}), 400

    # Strip data URL prefix if present
    if "," in image_data:
        image_data = image_data.split(",", 1)[1]

    png_path = os.path.join(TRACES_DIR, f"{trace_id}.png")
    with open(png_path, "wb") as f:
        f.write(base64.b64decode(image_data))
    print(f"[Screenshot saved to {png_path}]")
    return jsonify({"ok": True})

@app.route("/")
def index(): return send_from_directory(".", "index.html")

@app.route("/<path:p>")
def static_files(p): return send_from_directory(".", p)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=port == 5001)
