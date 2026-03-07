#!/usr/bin/env python3
"""
normalize.py - CDTM Alumni Data Normalization Pipeline

Reads March_profiles.jsonl (Proxycurl format), applies school normalization,
classifies career paths via OpenAI, and outputs alumni_processed.json.

Usage:
    export OPENAI_API_KEY=sk-...
    python3 normalize.py
    python3 normalize.py --limit 10      # test with 10 profiles
    python3 normalize.py --resume        # skip already-processed alumni
"""

import json
import os
import re
import sys
import time
from pathlib import Path
from openai import OpenAI

# Load .env file if present (check script dir, then project root)
env_file = Path(__file__).parent / ".env"
if not env_file.exists():
    env_file = Path(__file__).parent.parent / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())

# ── Config ─────────────────────────────────────────────────────────────────────

PROJECT_ROOT    = str(Path(__file__).parent.parent)
DATA_DIR        = f"{PROJECT_ROOT}/data"
RAW_FILE        = f"{PROJECT_ROOT}/March_profiles.jsonl"
SCHOOLS_FILE    = f"{DATA_DIR}/unique_schools_normalized.json"
COMPANIES_CACHE = f"{DATA_DIR}/companies_normalized.json"
OUTPUT_FILE     = f"{DATA_DIR}/alumni_processed.json"

OPENAI_MODEL = "gpt-4o-mini"   # cheap + fast for classification tasks

CAREER_TYPES = [
    "Consulting",
    "Finance & Banking",
    "Big Tech",
    "Startup / Scale-up",
    "Corporate / Industry",
    "Entrepreneurship / Founder",
    "Academic / Research",
    "Government / NGO / Non-profit",
    "Other",
]

# ── Degree normalization (rule-based) ──────────────────────────────────────────

DEGREE_RULES = [
    # Doctorate
    (r"ph\.?d|doktor|dr\.|doctorate|doctoral", "Doctorate"),
    # Graduate
    (r"master|m\.sc|m\.a\.|mba|m\.eng|dipl\.(-ing|-kfm|-wi|-inform)|magister|staatsexamen|second.cycle", "Graduate"),
    # Undergraduate
    (r"bachelor|b\.sc|b\.a\.|b\.eng|first.cycle|licencjat|kandidat", "Undergraduate"),
    # Exchange
    (r"exchange|erasmus|visiting|study.abroad|semester.abroad|gastho|gaststu", "Exchange"),
    # High School
    (r"abitur|gymnasium|high.school|baccalaur|matura|leaving.cert|a.level", "High School"),
]

FIELD_RULES = [
    (r"computer.science|software|informatics|computing|ai\b|artificial.intell|machine.learn|data.sci", "Computer Science & AI"),
    (r"electrical|mechanical|civil|chemical|aerospace|biomedical|industrial.eng|systems.eng|engineering", "Engineering"),
    (r"business|management|bwl|economics|finance|accounting|marketing|entrepreneurship|commerce|mba", "Business & Economics"),
    (r"technology.management|tech.*manag|manag.*tech|wirtschaftsingenieur|technologiemanag", "Technology Management"),
    (r"information.system|hci|human.computer|media.informatics|wirtschaftsinformatik", "Information Systems & HCI"),
    (r"physics|mathematics|chemistry|biology|neuroscience|statistics|natural.sci", "Natural Sciences & Mathematics"),
    (r"medicine|medical|health|pharmacy|biotechnolog|life.sci|clinical", "Medicine & Health Sciences"),
    (r"psychology|sociology|political|social.sci|communication|philosophy|history|law|legal", "Humanities & Social Sciences"),
    (r"design|architecture|media|art|film|fashion|creative", "Design, Architecture & Media"),
]


def normalize_degree(raw_degree, raw_field=None):
    text = " ".join(filter(None, [raw_degree, raw_field])).lower()
    for pattern, label in DEGREE_RULES:
        if re.search(pattern, text):
            return label
    return None


def normalize_field(raw_field, raw_degree=None):
    text = " ".join(filter(None, [raw_field, raw_degree])).lower()
    for pattern, label in FIELD_RULES:
        if re.search(pattern, text):
            return label
    return "Other"


# ── Date helpers ───────────────────────────────────────────────────────────────

def extract_year(date_obj):
    """Extract year from Proxycurl date object {day, month, year} or None."""
    if not date_obj:
        return None
    if isinstance(date_obj, dict):
        return date_obj.get("year")
    # Fallback for string dates
    if isinstance(date_obj, str):
        m = re.search(r"\b(19|20)\d{2}\b", date_obj)
        return int(m.group()) if m else None
    return None


# ── OpenAI helpers ─────────────────────────────────────────────────────────────

def classify_schools_batch(client, schools):
    """Ask OpenAI to classify a batch of school names."""
    if not schools:
        return {}

    school_list = "\n".join(f"- {s}" for s in schools)
    prompt = f"""You are an education data expert. For each school below, return a JSON object.

Schools:
{school_list}

For each school return an entry in this exact JSON format:
{{
  "<exact school name>": {{
    "clean_name": "<canonical institution name>",
    "institution_type": "<one of: University, Business School, Technical University, High School, Online Platform, Research Institute, Other>",
    "country": "<country name or Unknown>",
    "is_top_tier": <true if globally recognized top institution, else false>,
    "is_stem_focused": <true if primarily STEM, else false>
  }}
}}

Return only valid JSON, no markdown."""

    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        response_format={"type": "json_object"},
    )
    try:
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"  Warning: could not parse school batch response: {e}")
        return {}


def classify_companies_batch(client, companies):
    """Ask OpenAI to classify company names into career types."""
    if not companies:
        return {}

    company_list = "\n".join(f"- {c}" for c in companies)
    prompt = f"""You are a career data expert. For each company below, classify it.

Companies:
{company_list}

Return a JSON object mapping each company name to its classification:
{{
  "<exact company name>": {{
    "career_type": "<one of: Consulting, Finance & Banking, Big Tech, Startup / Scale-up, Corporate / Industry, Entrepreneurship / Founder, Academic / Research, Government / NGO / Non-profit, Other>",
    "industry": "<brief industry label e.g. Software, Healthcare, Automotive, etc.>",
    "size_estimate": "<one of: Large (>10k), Mid (1k-10k), Small (<1k), Unknown>"
  }}
}}

Guidelines:
- McKinsey, BCG, Bain, Roland Berger → Consulting
- Goldman, JPMorgan, Deutsche Bank, VC/PE firms → Finance & Banking
- Google, Meta, Apple, Microsoft, Amazon → Big Tech
- Unknown or obviously tiny companies → Startup / Scale-up
- Own company / self-employed / GmbH founded by person → Entrepreneurship / Founder
- Universities, research labs → Academic / Research
- Return only valid JSON, no markdown."""

    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        response_format={"type": "json_object"},
    )
    try:
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"  Warning: could not parse company batch response: {e}")
        return {}


# ── Main processing ────────────────────────────────────────────────────────────

def is_cdtm_school(school_name):
    """Check if a school entry represents CDTM."""
    name = (school_name or "").lower()
    return "cdtm" in name or "center for digital technology" in name


def extract_cdtm_anchor_year(education_list):
    """Find CDTM entry in education and return its start year."""
    for edu in education_list:
        school = edu.get("school") or ""
        if is_cdtm_school(school):
            year = extract_year(edu.get("starts_at")) or extract_year(edu.get("ends_at"))
            if year:
                return year
    return None


def process_education(edu_list, school_map, cdtm_anchor_year):
    """Convert Proxycurl education entries into normalized records."""
    processed = []

    for edu in edu_list:
        school_raw = (edu.get("school") or "").strip()
        if not school_raw:
            continue

        is_cdtm = is_cdtm_school(school_raw)

        # Look up normalization
        norm = school_map.get(school_raw, {})
        school_clean = norm.get("clean_name") or school_raw
        institution_type = norm.get("institution_type") or "Unknown"
        country = norm.get("country") or "Unknown"
        is_top_tier = norm.get("is_top_tier", False)

        raw_degree = (edu.get("degree_name") or "").strip()
        raw_field = (edu.get("field_of_study") or "").strip()

        if is_cdtm:
            degree_level = "Honours"
            field = "Technology Management"
        else:
            degree_level = normalize_degree(raw_degree, raw_field)
            field = normalize_field(raw_field, raw_degree)

        start_year = extract_year(edu.get("starts_at"))
        end_year = extract_year(edu.get("ends_at"))

        # Infer pre/post CDTM
        if cdtm_anchor_year and start_year:
            relative = "pre_cdtm" if start_year < cdtm_anchor_year else "post_cdtm"
        elif cdtm_anchor_year and end_year:
            relative = "pre_cdtm" if end_year <= cdtm_anchor_year else "post_cdtm"
        else:
            relative = "unknown"

        if is_cdtm:
            relative = "cdtm"

        processed.append({
            "school_raw": school_raw,
            "school": school_clean,
            "institution_type": institution_type,
            "country": country,
            "is_top_tier": is_top_tier,
            "degree_raw": raw_degree,
            "field_raw": raw_field,
            "degree_level": degree_level,
            "field": field,
            "start_year": start_year,
            "end_year": end_year,
            "is_cdtm": is_cdtm,
            "relative_to_cdtm": relative,
        })

    return processed


def process_career(career_list, company_map, cdtm_anchor_year):
    """Convert Proxycurl experience entries into normalized records."""
    processed = []

    for job in career_list:
        company_raw = (job.get("company") or "").strip()
        if not company_raw:
            continue

        norm = company_map.get(company_raw, {})
        career_type = norm.get("career_type") or "Other"
        industry = norm.get("industry") or "Unknown"
        size = norm.get("size_estimate") or "Unknown"

        title = (job.get("title") or "").strip()
        start_year = extract_year(job.get("starts_at"))
        end_year = extract_year(job.get("ends_at"))
        current = end_year is None

        if cdtm_anchor_year and start_year:
            relative = "pre_cdtm" if start_year < cdtm_anchor_year else "post_cdtm"
        else:
            relative = "unknown"

        processed.append({
            "company": company_raw,
            "title": title,
            "career_type": career_type,
            "industry": industry,
            "company_size": size,
            "start_year": start_year,
            "end_year": end_year,
            "is_current": current,
            "relative_to_cdtm": relative,
        })

    return processed


def build_summary(edu_processed: list, career_processed: list) -> dict:
    """Derive high-level summary fields per alumni for easy visualization."""

    # Pre-CDTM universities (exclude high schools, online platforms, CDTM itself)
    pre_cdtm_edu = [
        e for e in edu_processed
        if e["relative_to_cdtm"] == "pre_cdtm"
        and not e["is_cdtm"]
        and e["degree_level"] not in ("High School", None)
        and e["institution_type"] not in ("Online Platform",)
    ]

    # Primary pre-CDTM school (top-tier preferred, else first)
    pre_cdtm_schools = [e["school"] for e in pre_cdtm_edu]
    top_tier = [e["school"] for e in pre_cdtm_edu if e.get("is_top_tier")]
    primary_school = top_tier[0] if top_tier else (pre_cdtm_schools[0] if pre_cdtm_schools else None)

    # Primary undergrad field
    undergrad = [e for e in pre_cdtm_edu if e["degree_level"] == "Undergraduate"]
    primary_field = undergrad[0]["field"] if undergrad else (pre_cdtm_edu[0]["field"] if pre_cdtm_edu else "Other")

    # Had exchange program
    had_exchange = any(e["degree_level"] == "Exchange" for e in edu_processed)

    # Post-CDTM graduate degree
    post_cdtm_edu = [
        e for e in edu_processed
        if e["relative_to_cdtm"] == "post_cdtm"
        and not e["is_cdtm"]
        and e["degree_level"] in ("Graduate", "Doctorate")
    ]
    post_cdtm_degree = post_cdtm_edu[0]["degree_level"] if post_cdtm_edu else None
    post_cdtm_school = post_cdtm_edu[0]["school"] if post_cdtm_edu else None

    # Career
    post_cdtm_jobs = sorted(
        [c for c in career_processed if c["relative_to_cdtm"] == "post_cdtm"],
        key=lambda x: x["start_year"] or 9999
    )
    first_career_type = post_cdtm_jobs[0]["career_type"] if post_cdtm_jobs else None

    current_jobs = [c for c in career_processed if c["is_current"]]
    current_career_type = current_jobs[0]["career_type"] if current_jobs else (
        post_cdtm_jobs[-1]["career_type"] if post_cdtm_jobs else None
    )

    return {
        "primary_pre_cdtm_school": primary_school,
        "pre_cdtm_schools": list(dict.fromkeys(pre_cdtm_schools)),  # deduplicated, ordered
        "primary_field": primary_field,
        "had_exchange": had_exchange,
        "post_cdtm_degree": post_cdtm_degree,
        "post_cdtm_school": post_cdtm_school,
        "first_career_type": first_career_type,
        "current_career_type": current_career_type,
    }


def load_profiles(path, limit=None):
    """Load profiles from JSONL file."""
    profiles = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            profiles.append(json.loads(line))
            if limit and len(profiles) >= limit:
                break
    return profiles


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Normalize CDTM alumni data from Proxycurl JSONL")
    parser.add_argument("--limit", type=int, help="Only process N profiles (for testing)")
    parser.add_argument("--resume", action="store_true", help="Skip already-processed alumni")
    args = parser.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY environment variable not set.")
        print("Run: export OPENAI_API_KEY=sk-...")
        sys.exit(1)

    client = OpenAI(api_key=api_key)

    # ── Load raw data ──────────────────────────────────────────────────────────
    print("Loading raw profiles...")
    alumni_raw = load_profiles(RAW_FILE, limit=args.limit)
    print(f"  {len(alumni_raw)} profiles loaded")

    # ── Load existing output if resuming ───────────────────────────────────────
    existing_names = set()
    existing_output = []
    if args.resume and os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE) as f:
            existing_output = json.load(f)
        existing_names = {p["full_name"] for p in existing_output}
        print(f"  {len(existing_names)} already processed (will skip)")

    # ── Load or init school map ────────────────────────────────────────────────
    if os.path.exists(SCHOOLS_FILE):
        with open(SCHOOLS_FILE) as f:
            school_map = json.load(f)
        print(f"  {len(school_map)} schools in normalization map")
    else:
        school_map = {}
        print("  No school map found, will classify all schools")

    # ── Load or init company cache ─────────────────────────────────────────────
    if os.path.exists(COMPANIES_CACHE):
        with open(COMPANIES_CACHE) as f:
            company_map = json.load(f)
        print(f"  {len(company_map)} companies in cache")
    else:
        company_map = {}
        print("  No company cache found, will classify all companies")

    # ── Find new schools not in map ────────────────────────────────────────────
    all_schools = set()
    for person in alumni_raw:
        if person.get("full_name") in existing_names:
            continue
        for edu in person.get("education") or []:
            s = (edu.get("school") or "").strip()
            if s:
                all_schools.add(s)

    new_schools = [s for s in all_schools if s not in school_map]
    if new_schools:
        total_batches = (len(new_schools) + 49) // 50
        print(f"\n--- STEP 1/3: Classifying {len(new_schools)} schools ({total_batches} batches) ---")
        batch_size = 50
        t0 = time.time()
        for i in range(0, len(new_schools), batch_size):
            batch = new_schools[i:i + batch_size]
            batch_num = i // batch_size + 1
            elapsed = time.time() - t0
            if batch_num > 1:
                per_batch = elapsed / (batch_num - 1)
                remaining = per_batch * (total_batches - batch_num + 1)
                print(f"  Batch {batch_num}/{total_batches} (~{remaining:.0f}s remaining)...")
            else:
                print(f"  Batch {batch_num}/{total_batches}...")
            result = classify_schools_batch(client, batch)
            school_map.update(result)
        with open(SCHOOLS_FILE, "w") as f:
            json.dump(school_map, f, indent=2, ensure_ascii=False)
        print(f"  Done in {time.time() - t0:.1f}s. {len(school_map)} schools total.")
    else:
        print("\n--- STEP 1/3: Schools --- (no new schools to classify)")

    # ── Find new companies not in cache ───────────────────────────────────────
    all_companies = set()
    for person in alumni_raw:
        if person.get("full_name") in existing_names:
            continue
        for job in person.get("experiences") or []:
            c = (job.get("company") or "").strip()
            if c:
                all_companies.add(c)

    new_companies = [c for c in all_companies if c not in company_map]
    if new_companies:
        total_batches = (len(new_companies) + 79) // 80
        print(f"\n--- STEP 2/3: Classifying {len(new_companies)} companies ({total_batches} batches) ---")
        batch_size = 80
        t0 = time.time()
        for i in range(0, len(new_companies), batch_size):
            batch = new_companies[i:i + batch_size]
            batch_num = i // batch_size + 1
            elapsed = time.time() - t0
            if batch_num > 1:
                per_batch = elapsed / (batch_num - 1)
                remaining = per_batch * (total_batches - batch_num + 1)
                print(f"  Batch {batch_num}/{total_batches} (~{remaining:.0f}s remaining)...")
            else:
                print(f"  Batch {batch_num}/{total_batches}...")
            result = classify_companies_batch(client, batch)
            company_map.update(result)
            with open(COMPANIES_CACHE, "w") as f:
                json.dump(company_map, f, indent=2, ensure_ascii=False)
        print(f"  Done in {time.time() - t0:.1f}s. {len(company_map)} companies total.")
    else:
        print("\n--- STEP 2/3: Companies --- (no new companies to classify)")

    # ── Process each alumni ────────────────────────────────────────────────────
    to_process = [p for p in alumni_raw if p.get("full_name") not in existing_names]
    total = len(to_process)
    print(f"\n--- STEP 3/3: Processing {total} alumni profiles ---")
    output = list(existing_output)  # start with existing if resuming
    t0 = time.time()

    for i, person in enumerate(to_process):
        name = person.get("full_name")

        cdtm_anchor_year = extract_cdtm_anchor_year(person.get("education") or [])

        edu_processed = process_education(
            person.get("education") or [],
            school_map,
            cdtm_anchor_year,
        )

        career_processed = process_career(
            person.get("experiences") or [],
            company_map,
            cdtm_anchor_year,
        )

        summary = build_summary(edu_processed, career_processed)

        pub_id = person.get("public_identifier")
        linkedin_url = f"https://www.linkedin.com/in/{pub_id}" if pub_id else None

        location_parts = filter(None, [person.get("city"), person.get("state"), person.get("country_full_name")])
        location = ", ".join(location_parts) or None

        output.append({
            "full_name": name,
            "linkedin_url": linkedin_url,
            "location": location,
            "headline": person.get("headline"),
            "cdtm_anchor_year": cdtm_anchor_year,
            "education": edu_processed,
            "career": career_processed,
            "summary": summary,
        })

        done = i + 1
        if done % 100 == 0 or done == total:
            pct = done / total * 100
            elapsed = time.time() - t0
            print(f"  [{done}/{total}] {pct:.0f}% ({elapsed:.1f}s)")

    # ── Save output ────────────────────────────────────────────────────────────
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    total_time = time.time() - t0
    print(f"\nDone! Saved {len(output)} alumni to {OUTPUT_FILE} ({total_time:.1f}s)")

    # Quick stats
    with_school = sum(1 for p in output if p["summary"]["primary_pre_cdtm_school"])
    with_career = sum(1 for p in output if p["summary"]["first_career_type"])
    with_grad = sum(1 for p in output if p["summary"]["post_cdtm_degree"])
    print(f"  {with_school} have a primary pre-CDTM school")
    print(f"  {with_career} have a classified first post-CDTM career")
    print(f"  {with_grad} pursued a post-CDTM graduate degree")


if __name__ == "__main__":
    main()
