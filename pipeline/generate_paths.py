"""
Generate compressed life-path strings for all CDTM alumni using Claude Haiku.
Outputs data/alumni_paths.json with one path string per person.

Usage:
  python generate_paths.py                # process all alumni
  python generate_paths.py --limit 5      # test with 5 alumni
  python generate_paths.py --resume       # skip already-generated paths
"""

import argparse
import json
import os
import time
import anthropic
from dotenv import load_dotenv

load_dotenv()

INPUT_PATH = "data/alumni_processed.json"
OUTPUT_PATH = "data/alumni_paths.json"
CONTEXT_PATH = "context/info.json"
MODEL = "claude-haiku-4-5-20251001"
MAX_RETRIES = 3

SYSTEM_PROMPT = """\
You are a data analyst specializing in career trajectory summarization.

You will receive a CDTM alumnus's education and career data as JSON entries,
pre-sorted chronologically. CDTM (Center for Digital Technology and Management)
is an elite honors program at TU Munich and LMU Munich -- think of it as the
common thread connecting all alumni.

Your job: distill their life path into a SINGLE concise line that captures the
major stations and decision points. This will be used for pattern-matching
across 1000+ alumni, so consistency and compression matter.

FORMAT:
Name | CDTM <year> | station1 -> station2 -> ... -> stationN

If the CDTM year is unknown, use "CDTM ?".

RULES:

1. CHRONOLOGICAL FLOW: Interweave education and career in time order.
   If dates overlap (e.g. working student during studies), nest them:
   "TUM (CS, + working student@BMW)"

2. MERGE PROMOTIONS: Multiple roles at the same company become ONE station
   with a role arc: "BCG (junior->associate, 2y)" or "Google (SWE->staff, 6y)"

3. DROP NOISE:
   - Skip high school unless it's international/notable
   - Skip HiWi/research assistant jobs during undergrad (unless at a notable lab)
   - Skip very short internships (<3 months) unless at a notable company
   - Skip volunteer/club roles unless they led to a founded company

4. KEEP what matters:
   - Every degree (compress: "TUM (CS, BSc+MSc)" if same school)
   - International exchanges/semesters abroad
   - Career pivots between industries
   - Founding a company (always include, even if it failed)
   - Notable employers (mark duration): "McKinsey (3y)", "Google (2y)"

5. ANNOTATE notable companies from the CDTM ecosystem:
   - Unicorns: append [unicorn] -- e.g. "co-founded Trade Republic [unicorn, 12.5B]"
   - High-growth: append funding -- e.g. "Tacto [Sequoia, 50M raised]"
   - Known exits: note it -- e.g. "Foodora [acq. by Delivery Hero]"

6. DURATION: Add duration for career stations >= 1 year: "(2y)", "(5y, current)"
   For current roles, always mark "(current)"

7. MAX LENGTH: Keep the entire line under 400 characters. Be aggressive about
   compression. Use abbreviations: TUM, LMU, MIT, SWE, PM, ML, CS, EE, etc.

8. MISSING DATES: If dates are missing, still place the entry in the most
   logical chronological position based on degree level and career seniority.

NOTABLE CDTM ECOSYSTEM COMPANIES (annotate these when they appear):

Unicorns: Trade Republic, Personio, EGYM, Monzo Bank, Forto, Razor Group,
Cellares, TIER Mobility, Foodora

High-growth: Marvel Fusion [laser fusion, 132M], Recogni [AI chips, 102M],
finn.auto [car subscriptions, 1B debt], Tacto [Sequoia+Index, 50M],
AVI Medical [Balderton, 50M], Manex AI [Lightspeed, 9M], avoltra [Project A],
Differential Bio [robotic lab automation]

Notable exits: Payworks (->Visa), Amiando (->XING), Magazino (->Jungheinrich),
aloqa (->Motorola), Stylight, Foodora (->Delivery Hero), PAY.ON AG (exited)

Other notable: Freeletics, NavVis, IDnow, RobCo, Celonis, Demodesk, Kaia Health,
TeleClinic, Limehome, StudySmarter, Orbem, tozero, unu, CalWave, Nuclino, ZenML,
Langfuse, StashAway, remberg, Cara Care, Climedo Health, Tanso, yuri Gravity,
Outfittery, Plantura, TradeLink, Tabular, Faktual

OUTPUT: Return ONLY the single-line path string. No explanation, no JSON wrapping."""


def build_timeline(person):
    """Merge education and career entries into a chronological list for the LLM."""
    entries = []

    for edu in person.get("education", []):
        entries.append({
            "type": "education",
            "school": edu.get("school", ""),
            "degree": edu.get("degree_raw", ""),
            "field": edu.get("field_raw") or edu.get("field", ""),
            "country": edu.get("country", ""),
            "start_year": edu.get("start_year"),
            "end_year": edu.get("end_year"),
            "is_cdtm": edu.get("is_cdtm", False),
            "relative_to_cdtm": edu.get("relative_to_cdtm", "unknown"),
        })

    for job in person.get("career", []):
        entries.append({
            "type": "career",
            "company": job.get("company", ""),
            "title": job.get("title", ""),
            "career_type": job.get("career_type", ""),
            "start_year": job.get("start_year"),
            "end_year": job.get("end_year"),
            "is_current": job.get("is_current", False),
            "relative_to_cdtm": job.get("relative_to_cdtm", "unknown"),
        })

    # Sort: by start_year (or end_year fallback), then by relative_to_cdtm phase
    phase_order = {"pre_cdtm": 0, "cdtm": 1, "post_cdtm": 2, "unknown": 1.5}

    def sort_key(e):
        year = e.get("start_year") or e.get("end_year") or 9999
        phase = phase_order.get(e.get("relative_to_cdtm", "unknown"), 1.5)
        # Education before career within same year
        type_order = 0 if e["type"] == "education" else 1
        return (year, phase, type_order)

    entries.sort(key=sort_key)
    return entries


def generate_path(client, person):
    """Call Haiku to generate a path string for one person."""
    name = person.get("full_name", "Unknown")
    cdtm_year = person.get("cdtm_anchor_year")
    timeline = build_timeline(person)

    user_msg = json.dumps({
        "name": name,
        "cdtm_year": cdtm_year,
        "headline": (person.get("headline") or "").strip(),
        "timeline": timeline,
    }, indent=2)

    for attempt in range(MAX_RETRIES):
        try:
            resp = client.messages.create(
                model=MODEL,
                max_tokens=300,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_msg}],
            )
            text = resp.content[0].text.strip()
            # Remove any accidental markdown or quotes
            if text.startswith('"') and text.endswith('"'):
                text = text[1:-1]
            if text.startswith("```"):
                text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            return text
        except anthropic.RateLimitError:
            wait = 2 ** attempt
            print(f"  Rate limited, waiting {wait}s...")
            time.sleep(wait)
        except Exception as e:
            print(f"  Error for {name} (attempt {attempt+1}): {e}")
            if attempt == MAX_RETRIES - 1:
                return f"{name} | CDTM {cdtm_year or '?'} | [generation failed]"
            time.sleep(1)


def main():
    parser = argparse.ArgumentParser(description="Generate alumni path strings")
    parser.add_argument("--limit", type=int, help="Only process N alumni (for testing)")
    parser.add_argument("--resume", action="store_true", help="Skip already-generated paths")
    args = parser.parse_args()

    with open(INPUT_PATH) as f:
        alumni = json.load(f)

    # Load existing paths if resuming
    existing = {}
    if args.resume and os.path.exists(OUTPUT_PATH):
        with open(OUTPUT_PATH) as f:
            for entry in json.load(f):
                existing[entry["name"]] = entry["path"]
        print(f"Loaded {len(existing)} existing paths")

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    to_process = alumni[:args.limit] if args.limit else alumni
    results = []
    skipped = 0

    print(f"Processing {len(to_process)} alumni with {MODEL}...\n")

    for i, person in enumerate(to_process):
        name = person.get("full_name", "Unknown")

        if args.resume and name in existing:
            results.append({"name": name, "path": existing[name]})
            skipped += 1
            continue

        path = generate_path(client, person)
        results.append({"name": name, "path": path})

        if (i + 1) % 10 == 0 or i == 0:
            print(f"[{i+1}/{len(to_process)}] {path[:120]}...")

        # Save progress every 50 alumni
        if (i + 1) % 50 == 0:
            with open(OUTPUT_PATH, "w") as f:
                json.dump(results, f, indent=2, ensure_ascii=False)
            print(f"  (saved checkpoint: {len(results)} paths)")

    # Final save
    with open(OUTPUT_PATH, "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\nDone! {len(results)} paths written to {OUTPUT_PATH}")
    if skipped:
        print(f"  ({skipped} reused from previous run)")


if __name__ == "__main__":
    main()
