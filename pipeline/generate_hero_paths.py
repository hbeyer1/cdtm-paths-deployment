#!/usr/bin/env python3
"""
generate_hero_paths.py - Generate hero_paths.json for the Sankey hero chart.

Classifies each alumni into 5 stages using Claude Sonnet from their
compressed path string in alumni_paths.json.

Stages:
  0. STUDIED       — field of study
  1. WENT ABROAD   — most notable international academic experience (nullable)
  2. FIRST CAREER  — first career direction after CDTM (required)
  3. REACHED       — senior milestone role (nullable, only if notable leap)
  4. ACHIEVEMENT   — extraordinary achievement (nullable)

Usage:
    python3 generate_hero_paths.py
    python3 generate_hero_paths.py --limit 20
    python3 generate_hero_paths.py --resume
"""

import json
import os
import sys
import time
from pathlib import Path
import anthropic

# Load .env
env_file = Path(__file__).parent / ".env"
if not env_file.exists():
    env_file = Path(__file__).parent.parent / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())

PROJECT_ROOT = str(Path(__file__).parent.parent)
PATHS_FILE   = f"{PROJECT_ROOT}/data/alumni_paths.json"
OUTPUT_FILE  = f"{PROJECT_ROOT}/data/hero_paths.json"
ANTHROPIC_MODEL = "claude-sonnet-4-6"

STAGES = ["STUDIED", "WENT ABROAD", "FIRST CAREER", "REACHED", "ACHIEVEMENT"]

# Relative x positions for the Sankey columns (0-1 range)
STAGE_X = [0.0, 0.22, 0.46, 0.70, 0.92]

STUDIED_CATS = [
    "CS & AI",
    "Engineering",
    "Business & Economics",
    "Natural Sciences",
    "Humanities & Social Sciences",
    "Design & Media",
    "Medicine",
]

ABROAD_CATS = [
    "Stanford / Berkeley / Caltech",
    "MIT / Harvard / Ivy League",
    "Oxford / Cambridge / UK",
    # null = no notable international academic experience or non-elite university
]

FIRST_CAREER_CATS = [
    "Consulting",
    "Tech",
    "Finance & VC",
    "Research / PhD",
]

REACHED_CATS = [
    "Founder / CEO",
    "Professor",
    "VC Partner",
    "Consulting Partner",
    "Corporate Executive",
    # null = still early career or no notable senior milestone
]

ACHIEVEMENT_CATS = [
    "Unicorn Founder",
    "Serial Founder",
    "YC Alumni",
    "Professor",
    # null = no extraordinary achievement to highlight
]

SYSTEM_PROMPT = f"""\
You are a data analyst classifying CDTM alumni career trajectories.

CDTM (Center for Digital Technology and Management) is an elite honors program
jointly run by TU Munich (TUM) and LMU Munich. Alumni typically studied at TUM
or LMU and then went on to careers in tech, consulting, founding startups, etc.

CONTEXT — CDTM ECOSYSTEM:
The CDTM ecosystem has produced 9 unicorn companies (valuation >$1B):
- Trade Republic (Fintech, $12.5B) — founders: Christian Hecker, Thomas Pischke, Marco Cancellieri
- Personio (HR Tech, $8.5B) — founders: Hanno Renner, Ignaz Forstmeier, Roman Schumacher, Arseniy Vershinin
- EGYM (Fitness Tech, $7.5B) — founders: Philipp Roesch-Schlanderer, Florian Sauter
- Monzo Bank (Fintech, $5.9B) — founder: Jonas Huckestein
- Forto (Logistics, $2.1B) — founders: Michael Wax, Erik Muttersbach
- Razor Group (E-commerce, $1.2B) — founders: Tushar Ahluwalia, Jonas Diezun
- Cellares (Biotech) — founder: Fabian Gerlinghaus
- TIER Mobility (Mobility) — founder: Julian Blessin
- Foodora (Delivery, acquired by Delivery Hero) — founders: Konstantin Mehl, Manuel Thurner

Other notable CDTM startups: Freeletics, NavVis, IDnow, RobCo, Demodesk,
Kaia Health, TeleClinic, Limehome, StudySmarter, Orbem, tozero, unu, CalWave,
Nuclino, ZenML, Langfuse, StashAway, remberg, finn.auto, Marvel Fusion,
Recogni, Tacto, AVI Medical, Outfittery, Stylight, Plantura.

Notable exits: Payworks (acquired by Visa), Amiando (acquired by XING),
Magazino (acquired by Jungheinrich), aloqa (acquired by Motorola).

You will receive a batch of alumni, each as a compressed path string.
For each person, assign exactly 5 values corresponding to these stages:

STAGE 0 — STUDIED (field of study, REQUIRED):
  One of: {', '.join(STUDIED_CATS)}
  Classify based on their degree field. "Technology Management" from CDTM
  doesn't count — use their actual university degree field.
  Map: Wirtschaftsinformatik/Information Systems -> CS & AI.
  Map: Physics, Math, Chemistry, Biology -> Natural Sciences.
  Map: Architecture, Media -> Design & Media.
  Map: Medicine, Medical, Biomedical, Health Sciences -> Medicine.

STAGE 1 — WENT ABROAD (most notable international academic experience, NULLABLE):
  One of: {', '.join(ABROAD_CATS)}, or null
  Pick their single most notable international academic experience (outside Germany).
  ONLY assign a category for these elite universities:
  - "Stanford / Berkeley / Caltech": Stanford, UC Berkeley, Caltech, UCLA, USC,
    University of Washington, and other top US West Coast universities.
  - "MIT / Harvard / Ivy League": MIT, Harvard, Columbia, Wharton/UPenn, NYU, Yale,
    Princeton, Cornell, Brown, Dartmouth, Carnegie Mellon, Georgia Tech, and other
    top US East Coast universities.
  - "Oxford / Cambridge / UK": Oxford, Cambridge, Imperial College, LSE, UCL,
    Edinburgh, and other UK universities.
  - null: No notable international academic experience, OR went to a European
    university outside UK (INSEAD, HEC, Bocconi, ESADE, ETH, etc. -> null),
    OR went to an Asian/other university -> null.
  Only count academic stays (exchange, visiting scholar, semester abroad, degree).
  Don't count working abroad or internships abroad.

STAGE 2 — FIRST CAREER (first career direction after studies, REQUIRED):
  One of: {', '.join(FIRST_CAREER_CATS)}
  Their first significant career move after completing education.
  This is about where they STARTED, not where they are now:
  - "Consulting": McKinsey, BCG, Bain, Roland Berger, Deloitte, Accenture, etc.
  - "Tech": Software engineering, product management, data science, or any
    role at a tech company, startup, scale-up, or big tech (Google/Meta/Apple).
    Also includes traditional industry/corporate roles (automotive, manufacturing,
    pharma, telco, etc.) — any non-consulting, non-finance, non-research job.
    If someone founded a company as their first move, classify as "Tech" here
    (founding goes in REACHED stage).
  - "Finance & VC": Banking, VC, PE, investment roles
  - "Research / PhD": PhD, post-doc, research positions at universities or
    research institutes. IMPORTANT: "Visiting scholar" or "visiting researcher"
    positions during master's studies are NOT PhDs — these are common short-term
    academic exchanges that CDTM students do. Only classify as Research / PhD
    if the person actually pursued a doctoral degree or took a post-doc position
    AFTER completing their studies.

STAGE 3 — REACHED (senior milestone, NULLABLE):
  One of: {', '.join(REACHED_CATS)}, or null
  This stage captures whether someone has reached a notable senior milestone.
  Many alumni (especially younger ones) will be null here — that's expected.
  - "Founder / CEO": Founded or co-founded a company. This is the most common
    non-null value here since many CDTM alumni become founders.
  - "Professor": Holds a professor title at a university (full, associate, or
    assistant professor). Post-docs and lecturers do NOT count.
  - "VC Partner": Partner, General Partner, or Managing Director at a VC firm.
    Associates and principals do NOT count.
  - "Consulting Partner": Partner or Managing Director at a consulting firm.
    Principals and associate partners do NOT count.
  - "Corporate Executive": C-suite (CEO, CTO, CFO, COO) or VP/SVP at a large
    company. Directors and heads-of do NOT count unless at a very large company.
  - null: Still in an individual contributor or mid-level role, early in career,
    or no notable senior milestone yet. This should be ~40-50% of alumni.

STAGE 4 — ACHIEVEMENT (extraordinary achievement, NULLABLE):
  One of: {', '.join(ACHIEVEMENT_CATS)}, or null
  VERY STRICT — only assign for truly exceptional cases:
  - "Unicorn Founder": The person FOUNDED or CO-FOUNDED a unicorn company.
    They must have "founder" or "co-founded" in their path for that company.
    Working at, investing in, or being an early employee does NOT count.
    The ONLY qualifying unicorn companies are: Personio, Trade Republic, Monzo,
    Forto, TIER Mobility, Foodora, Razor Group, Cellares, EGYM.
    The ONLY qualifying people are the founders listed above in the CONTEXT section.
    Expected count: exactly ~17 people out of 1000+. If you tag more, you are wrong.
  - "Serial Founder": Founded 2+ SEPARATE companies (not just one). Look for
    multiple distinct "founded" / "co-founded" mentions for DIFFERENT companies.
    A single founder is NOT a serial founder.
  - "YC Alumni": Path explicitly mentions YC, Y Combinator, or "(YC Sxx)".
  - "Professor": Currently holds a professor title at a university.
  - null: No extraordinary achievement. MOST people (~95%) should be null here.

OUTPUT FORMAT:
Each person is prefixed with a numeric ID like [42]. Return a JSON object
mapping each ID (as a string) to an array of 5 values.
Use null (not the string "null") for nullable stages. Example:
{{
  "0": ["CS & AI", "Stanford / Berkeley / Caltech", "Consulting", "Founder / CEO", "Unicorn Founder"],
  "1": ["Engineering", null, "Tech", null, null],
  "2": ["Business & Economics", null, "Tech", "Founder / CEO", null]
}}

IMPORTANT:
- Use the exact category strings listed above. Do not invent new ones.
- Use JSON null, not the string "null", for empty nullable stages.
- Return ONLY valid JSON. No markdown, no explanation."""


def classify_batch(client, batch, batch_offset):
    """Send a batch of path strings to Anthropic for classification.
    Uses numeric IDs to avoid name-matching issues."""
    lines = []
    for i, entry in enumerate(batch):
        lines.append(f"[{batch_offset + i}] {entry['path']}")
    user_msg = "\n".join(lines)

    for attempt in range(3):
        try:
            response = client.messages.create(
                model=ANTHROPIC_MODEL,
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                messages=[
                    {"role": "user", "content": user_msg},
                ],
                temperature=0,
            )
            text = response.content[0].text.strip()
            # Strip markdown code fences if present
            if text.startswith("```"):
                text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            result = json.loads(text)
            return result
        except json.JSONDecodeError as e:
            print(f"  JSON parse error (attempt {attempt + 1}): {e}")
            print(f"  Raw response: {text[:200]}...")
            if attempt < 2:
                time.sleep(2 ** attempt)
        except anthropic.RateLimitError:
            wait = 2 ** (attempt + 1)
            print(f"  Rate limited, waiting {wait}s...")
            time.sleep(wait)
        except Exception as e:
            print(f"  Error (attempt {attempt + 1}): {e}")
            if attempt < 2:
                time.sleep(2 ** attempt)
    return {}


def validate_entry(name, values):
    """Validate and fix a classified entry."""
    if not isinstance(values, list) or len(values) != 5:
        return None

    # Validate each stage
    valid_cats = [
        STUDIED_CATS,
        ABROAD_CATS + [None],
        FIRST_CAREER_CATS,
        REACHED_CATS + [None],
        ACHIEVEMENT_CATS + [None],
    ]

    # Common LLM mistakes -> correct category
    ALIASES = {
        # WENT ABROAD aliases (old format -> new)
        "US West Coast": "Stanford / Berkeley / Caltech",
        "US East Coast": "MIT / Harvard / Ivy League",
        "UK & Europe": "Oxford / Cambridge / UK",
        "European": None,
        "Asia & Other": None,
        # FIRST CAREER aliases
        "Founder": "Tech",            # founding goes in REACHED, not here
        "Founder / CEO": "Tech",      # same
        "Corporate": "Tech",          # merged into Tech
        "VC / Investor": "Finance & VC",
        "VC / Finance": "Finance & VC",
        # STUDIED aliases
        "Math & AI": "CS & AI",
        "CS & Media": "CS & AI",
        "Management & Technology": "Business & Economics",
        "Sociology": "Humanities & Social Sciences",
    }

    fixed = []
    for i, (val, cats) in enumerate(zip(values, valid_cats)):
        if val is None and None in cats:
            fixed.append(None)
        elif val in cats:
            fixed.append(val)
        elif val in ALIASES:
            alias = ALIASES[val]
            if alias is None and None in cats:
                fixed.append(None)
            elif alias is not None and alias in cats:
                fixed.append(alias)
            elif None in cats:
                fixed.append(None)
            else:
                print(f"  Warning: '{name}' stage {i} alias '{val}'->'{alias}' not in cats, using '{cats[0]}'")
                fixed.append(cats[0])
        else:
            # Try fuzzy match
            matched = False
            if val:
                val_lower = val.lower().strip()
                for cat in cats:
                    if cat and cat.lower() == val_lower:
                        fixed.append(cat)
                        matched = True
                        break
            if not matched:
                if None in cats:
                    fixed.append(None)
                else:
                    print(f"  Warning: '{name}' stage {i} invalid value '{val}', using '{cats[0]}'")
                    fixed.append(cats[0])

    return fixed


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Generate hero_paths.json via LLM classification")
    parser.add_argument("--limit", type=int, help="Only process N alumni")
    parser.add_argument("--resume", action="store_true", help="Skip already-classified alumni")
    parser.add_argument("--batch-size", type=int, default=30, help="Batch size for API calls")
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("Error: ANTHROPIC_API_KEY not set")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    # Load path strings
    with open(PATHS_FILE) as f:
        all_paths = json.load(f)
    print(f"Loaded {len(all_paths)} alumni paths")

    if args.limit:
        all_paths = all_paths[:args.limit]

    # Load existing if resuming
    existing = {}
    if args.resume and os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE) as f:
            data = json.load(f)
        for p in data.get("paths", []):
            existing[p["name"]] = p["values"]
        print(f"  {len(existing)} already classified")

    # Classify in batches
    to_process = [p for p in all_paths if p["name"] not in existing]
    total = len(to_process)
    total_batches = (total + args.batch_size - 1) // args.batch_size

    print(f"\n--- Classifying {total} alumni ({total_batches} batches of {args.batch_size}) ---")
    print(f"    Model: {ANTHROPIC_MODEL}")

    classified = dict(existing)
    t0 = time.time()

    for bi in range(0, total, args.batch_size):
        batch = to_process[bi:bi + args.batch_size]
        batch_num = bi // args.batch_size + 1

        elapsed = time.time() - t0
        if batch_num > 1:
            per_batch = elapsed / (batch_num - 1)
            remaining = per_batch * (total_batches - batch_num + 1)
            print(f"  Batch {batch_num}/{total_batches} ({len(batch)} people, ~{remaining:.0f}s remaining)...")
        else:
            print(f"  Batch {batch_num}/{total_batches} ({len(batch)} people)...")

        result = classify_batch(client, batch, bi)

        for i, entry in enumerate(batch):
            name = entry["name"]
            key = str(bi + i)
            if key in result:
                values = result[key]
                # Fix string "null" -> actual None
                if isinstance(values, list):
                    values = [None if v == "null" or v == "None" else v for v in values]
                validated = validate_entry(name, values)
                if validated:
                    classified[name] = validated
                else:
                    print(f"  Warning: invalid result for '{name}' (id {key}), skipping")
            else:
                print(f"  Warning: no result for id {key} ('{name}')")

        # Checkpoint every 5 batches
        if batch_num % 5 == 0:
            save_output(classified, all_paths)
            print(f"  (checkpoint: {len(classified)} classified)")

    # Final save
    save_output(classified, all_paths)

    elapsed = time.time() - t0
    print(f"\nDone! {len(classified)} alumni classified in {elapsed:.1f}s")
    print(f"Saved to {OUTPUT_FILE}")

    # Stats
    for si, stage in enumerate(STAGES):
        counts = {}
        nulls = 0
        for vals in classified.values():
            v = vals[si]
            if v is None:
                nulls += 1
            else:
                counts[v] = counts.get(v, 0) + 1
        print(f"\n{stage}:")
        for k, c in sorted(counts.items(), key=lambda x: -x[1]):
            print(f"  {k}: {c}")
        if nulls:
            print(f"  (null): {nulls}")


def save_output(classified, all_paths):
    """Save hero_paths.json with barycenter-optimized node ordering."""
    # Build paths list preserving original order
    paths = []
    for entry in all_paths:
        name = entry["name"]
        if name in classified:
            paths.append({"name": name, "values": classified[name]})

    # Compute optimal node orders using barycenter heuristic
    n_cols = len(STAGES)
    node_orders = []

    for ci in range(n_cols):
        # Get unique values in this column
        val_counts = {}
        for p in paths:
            v = p["values"][ci]
            if v is not None:
                val_counts[v] = val_counts.get(v, 0) + 1

        if ci == 0:
            # First column: sort by count descending
            ordered = sorted(val_counts.keys(), key=lambda v: -val_counts[v])
        else:
            # Barycenter: average position of connected nodes in previous column
            prev_vals = node_orders[ci - 1]
            prev_pos = {v: i for i, v in enumerate(prev_vals)}

            val_bary = {}
            val_count = {}
            for p in paths:
                curr = p["values"][ci]
                prev = p["values"][ci - 1]
                if curr is None or prev is None:
                    continue
                if prev not in prev_pos:
                    continue
                val_bary[curr] = val_bary.get(curr, 0) + prev_pos[prev]
                val_count[curr] = val_count.get(curr, 0) + 1

            for v in val_bary:
                val_bary[v] /= val_count[v]

            # Sort by barycenter, with unconnected nodes at end
            ordered = sorted(
                val_counts.keys(),
                key=lambda v: (val_bary.get(v, 999), -val_counts.get(v, 0))
            )

        node_orders.append(ordered)

    output = {
        "stages": STAGES,
        "stage_x": STAGE_X,
        "node_orders": node_orders,
        "paths": paths,
    }

    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()
