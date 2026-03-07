// ═══════════════════════════════════════════════════════════════════════════════
// CDTM Alumni Pathways — D3 v7
// Each alumni = one individual line flowing through categorical columns.
// Lines are coloured by field of study and bundle visually where paths overlap.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Loading animation (Claude Code–style) ───────────────────────────────────
const LOADING_WORDS = [
    // CDTM startups
    "Trade Republicaning", "Personioing", "EGYMnastics", "Monzoing",
    "Fortocoming", "Razor sharp", "Cellare-brating", "TIER-less",
    "Foodora-ble", "Stylighting", "Freeleting", "Luminoving", "Tactful",
    "NavVigating", "RobCo-piloting", "Orbem-iting", "Langfusing",
    "Demodesk-ing", "ZenML-ifying", "Nucli-noting", "Tozero-ing",
    "Marvel-ous fusing", "Recognizing", "finn-ishing",
    // CDTM culture
    "Trend Reporting", "Pivoting", "Exiting", "Pitch Decking",
    "Prototyping", "Design Thinking", "Venture Scouting",
    "Cap Table-ing", "Term Sheet-ing", "Due Diligence-ing",
    "Product Roasting",
];
const SPINNER_CHARS = ['·', '✻', '✽', '✶', '✳', '✢'];
let _loadingInterval = null;
let _spinnerInterval = null;
let _loadingWordIdx  = 0;
let _spinnerIdx      = 0;

function startLoadingWords() {
    const chart = document.getElementById("chart");
    // Shuffle words
    for (let i = LOADING_WORDS.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [LOADING_WORDS[i], LOADING_WORDS[j]] = [LOADING_WORDS[j], LOADING_WORDS[i]];
    }
    _loadingWordIdx = 0;
    _spinnerIdx = 0;

    // Render the loading strip into the chart area
    chart.innerHTML = `<div class="loading-strip">
        <div style="display:flex;align-items:center;gap:10px;justify-content:center">
            <span class="loading-spinner-char" id="loading-spinner">${SPINNER_CHARS[0]}</span>
            <span class="loading-words" id="loading-word-container"></span>
        </div>
        <div id="activity-steps" class="activity-steps"></div>
    </div>`;

    const wordEl = document.getElementById("loading-word-container");
    _setLoadingWord(wordEl, LOADING_WORDS[0]);

    // Cycle words
    _loadingInterval = setInterval(() => {
        _loadingWordIdx = (_loadingWordIdx + 1) % LOADING_WORDS.length;
        const word = LOADING_WORDS[_loadingWordIdx];
        const span = wordEl.querySelector(".loading-word");
        if (span) span.classList.add("fade-out");
        setTimeout(() => _setLoadingWord(wordEl, word), 250);
    }, 2200);

    // Cycle ASCII spinner
    _spinnerInterval = setInterval(() => {
        _spinnerIdx = (_spinnerIdx + 1) % SPINNER_CHARS.length;
        const el = document.getElementById("loading-spinner");
        if (el) el.textContent = SPINNER_CHARS[_spinnerIdx];
    }, 180);
}

function _setLoadingWord(el, word) {
    el.innerHTML = `<span class="loading-word fade-in">${word}</span>`;
}

function stopLoadingWords() {
    clearInterval(_loadingInterval);
    clearInterval(_spinnerInterval);
    _loadingInterval = null;
    _spinnerInterval = null;
}

// ─── Layout constants ──────────────────────────────────────────────────────────
const MARGIN    = { top: 64, right: 230, bottom: 36, left: 230 };
const OVAL_RX   = 11;  // fixed half-width of every oval node
const NODE_GAP  = 14;  // vertical gap between nodes within a column
const CHART_H   = 680; // svg height
const BG_COLOR  = "#f5f0e8"; // cream — matches page background

// ─── Colour palettes ───────────────────────────────────────────────────────────
// Each palette maps semantic keys to hex colours.
// Shared structural keys (Unknown, None, Other, etc.) get muted tones in all palettes.

const PALETTE_DEFS = {
    // CDTM Blue & Gold — pastel blues with warm gold accents (matches hero graph)
    cdtm: {
        name: "CDTM",
        preview: ["#1b3a6b","#93c5fd","#2e6ca4","#e2b84a","#bfdbfe"],
        colors: {
            "Engineering":"#2e6ca4","Business & Economics":"#d4a83a","Computer Science & AI":"#1b3a6b",
            "Technology Management":"#e2b84a","Information Systems & HCI":"#4889d0",
            "Natural Sciences & Mathematics":"#7ab3e8","Humanities & Social Sciences":"#c9a84e",
            "Design, Architecture & Media":"#a5c8ef","Medicine & Health Sciences":"#3b7dc9",
            "Consulting":"#1e4d8c","Finance & Banking":"#d6bc5e","Big Tech":"#14305a",
            "Startup / Scale-up":"#e2b84a","Corporate / Industry":"#8aaec4",
            "Entrepreneurship / Founder":"#c49530","Academic / Research":"#2e6ca4",
            "Government / NGO / Non-profit":"#93c5fd",
            "Graduate":"#4889d0","Doctorate":"#1b3a6b",
            "TU Munich":"#1e4d8c","LMU Munich":"#d4a83a","Elite International":"#2e6ca4",
            "Other German Univ.":"#8aaec4","Other Intl. Univ.":"#bfdbfe",
            "Berkeley / MIT":"#3b7dc9","Elite Research":"#4889d0",
            "Unicorn Founder":"#e2b84a","CDTM Founder":"#c49530","CDTM Employee":"#93c5fd",
            "CS & AI":"#1b3a6b","Business":"#d4a83a",
        },
    },
    // Deeper blue tones — navy to sky with amber highlights
    ocean: {
        name: "Ocean",
        preview: ["#14305a","#4889d0","#d0e4f7","#e9c46a","#7ab3e8"],
        colors: {
            "Engineering":"#3b7dc9","Business & Economics":"#e9c46a","Computer Science & AI":"#14305a",
            "Technology Management":"#d6bc5e","Information Systems & HCI":"#7ab3e8",
            "Natural Sciences & Mathematics":"#a5c8ef","Humanities & Social Sciences":"#c9a84e",
            "Design, Architecture & Media":"#93c5fd","Medicine & Health Sciences":"#4889d0",
            "Consulting":"#1b3a6b","Finance & Banking":"#e2b84a","Big Tech":"#1e4d8c",
            "Startup / Scale-up":"#d4a83a","Corporate / Industry":"#8aaec4",
            "Entrepreneurship / Founder":"#c49530","Academic / Research":"#2e6ca4",
            "Government / NGO / Non-profit":"#bfdbfe",
            "Graduate":"#4889d0","Doctorate":"#14305a",
            "TU Munich":"#1b3a6b","LMU Munich":"#e9c46a","Elite International":"#2e6ca4",
            "Other German Univ.":"#8aaec4","Other Intl. Univ.":"#c4ddf5",
            "Berkeley / MIT":"#3b7dc9","Elite Research":"#7ab3e8",
            "Unicorn Founder":"#e9c46a","CDTM Founder":"#d4a83a","CDTM Employee":"#93c5fd",
            "CS & AI":"#14305a","Business":"#e9c46a",
        },
    },
    // Soft pastel — lighter, airy blue & gold tones
    pastel: {
        name: "Pastel",
        preview: ["#93c5fd","#bfdbfe","#e2b84a","#d0e4f7","#4889d0"],
        colors: {
            "Engineering":"#7ab3e8","Business & Economics":"#e2b84a","Computer Science & AI":"#4889d0",
            "Technology Management":"#d6bc5e","Information Systems & HCI":"#93c5fd",
            "Natural Sciences & Mathematics":"#a5c8ef","Humanities & Social Sciences":"#c9a84e",
            "Design, Architecture & Media":"#bfdbfe","Medicine & Health Sciences":"#7ab3e8",
            "Consulting":"#4889d0","Finance & Banking":"#d4a83a","Big Tech":"#2e6ca4",
            "Startup / Scale-up":"#e2b84a","Corporate / Industry":"#c4ddf5",
            "Entrepreneurship / Founder":"#c49530","Academic / Research":"#93c5fd",
            "Government / NGO / Non-profit":"#d0e4f7",
            "Graduate":"#93c5fd","Doctorate":"#4889d0",
            "TU Munich":"#3b7dc9","LMU Munich":"#d6bc5e","Elite International":"#7ab3e8",
            "Other German Univ.":"#c4ddf5","Other Intl. Univ.":"#d0e4f7",
            "Berkeley / MIT":"#a5c8ef","Elite Research":"#93c5fd",
            "Unicorn Founder":"#e2b84a","CDTM Founder":"#d4a83a","CDTM Employee":"#bfdbfe",
            "CS & AI":"#4889d0","Business":"#e2b84a",
        },
    },
    // High contrast — deep navy with bright gold
    contrast: {
        name: "Bold",
        preview: ["#0e2240","#0065bd","#e2b84a","#3b7dc9","#f5d98a"],
        colors: {
            "Engineering":"#0065bd","Business & Economics":"#e2b84a","Computer Science & AI":"#0e2240",
            "Technology Management":"#d4a83a","Information Systems & HCI":"#3b7dc9",
            "Natural Sciences & Mathematics":"#4889d0","Humanities & Social Sciences":"#c49530",
            "Design, Architecture & Media":"#7ab3e8","Medicine & Health Sciences":"#2e6ca4",
            "Consulting":"#1b3a6b","Finance & Banking":"#f5d98a","Big Tech":"#0e2240",
            "Startup / Scale-up":"#e2b84a","Corporate / Industry":"#5a84a8",
            "Entrepreneurship / Founder":"#b8880a","Academic / Research":"#0065bd",
            "Government / NGO / Non-profit":"#93c5fd",
            "Graduate":"#3b7dc9","Doctorate":"#0e2240",
            "TU Munich":"#0065bd","LMU Munich":"#e2b84a","Elite International":"#1b3a6b",
            "Other German Univ.":"#5a84a8","Other Intl. Univ.":"#a5c8ef",
            "Berkeley / MIT":"#2e6ca4","Elite Research":"#3b7dc9",
            "Unicorn Founder":"#e2b84a","CDTM Founder":"#c49530","CDTM Employee":"#7ab3e8",
            "CS & AI":"#0e2240","Business":"#e2b84a",
        },
    },
};

// Muted structural values shared across all palettes
const MUTED = {
    "Other":"#94a3b8","Unknown":"#cbd5e1","No further degree":"#cbd5e1",
    "None":"#d4cfc6","Other Fields":"#94a3b8","Other University":"#94a3b8",
};

let activePaletteName = "cdtm";
const PALETTE = {};

function applyPalette(name) {
    activePaletteName = name;
    const def = PALETTE_DEFS[name];
    if (!def) return;
    // Clear and repopulate PALETTE in-place so all references stay valid
    Object.keys(PALETTE).forEach(k => delete PALETTE[k]);
    Object.assign(PALETTE, MUTED, def.colors);
    // Update pill UI
    document.querySelectorAll(".palette-pill").forEach(el => {
        el.classList.toggle("active", el.dataset.palette === name);
    });
}

function initPaletteToggle() {
    const container = document.getElementById("palette-pills");
    if (!container) return;
    for (const [key, def] of Object.entries(PALETTE_DEFS)) {
        const pill = document.createElement("button");
        pill.className = "palette-pill" + (key === activePaletteName ? " active" : "");
        pill.dataset.palette = key;
        pill.title = def.name;
        def.preview.forEach(c => {
            const sw = document.createElement("span");
            sw.className = "palette-swatch";
            sw.style.background = c;
            pill.appendChild(sw);
        });
        pill.addEventListener("click", () => {
            applyPalette(key);
            // Re-render current view
            if (activeView && activeView.id !== "explore") {
                if (window.renderView) window.renderView(activeView);
            } else if (lastExploreResult) {
                renderDynamic(lastExploreResult);
            }
        });
        container.appendChild(pill);
    }
}

// Initialize default palette
applyPalette(activePaletteName);

function fieldColor(person) {
    return PALETTE[person.primary_field] || PALETTE["Other"] || "#94a3b8";
}
function nodeColor(value) {
    return PALETTE[value] || "#94a3b8";
}

// ─── CDTM Ecosystem & University helpers ───────────────────────────────────────

const CDTM_UNICORN_SET = new Set([
    'trade republic','personio','egym','monzo','monzo bank',
    'forto','razor group','cellares','tier','tier mobility','foodora',
]);
const CDTM_COMPANY_SET = new Set([
    ...CDTM_UNICORN_SET,
    'marvel fusion','recogni','finn','finn.auto','tacto','avi medical',
    'manex ai','avoltra','differential bio',
    'demodesk','remberg','zavvy','deskbird','zenml','langfuse',
    'tabular','nuclino','faktual','maqsam','bowatt','sitefire','y42',
    'stashaway','idnow','payworks','amiando','pay.on ag','insurmagic',
    'thinxnet','finanzchef24','aloqa',
    'unu','navvis','tradelink','alpas','emidat','lemonflow',
    'freeletics','teleclinic','kaia health','cara care','climedo health',
    'vantis','neru health','venneos',
    'robco','tozero','orbem','tanso','tacterion','magazino','calwave',
    'outfittery','stylight','limehome','studysmarter','plantura','heycater',
]);

function _matchesCdtmSet(company, set) {
    const c = (company || '').toLowerCase().trim();
    if (c.length < 3) return false;
    for (const k of set) { if (c.includes(k) || (k.length >= 5 && k.includes(c))) return true; }
    return false;
}

function deriveUniversityType(school) {
    if (!school) return null;
    const s = school.toLowerCase();
    if (s.includes('technical university of munich') || s.includes('technische universit') ||
        s.includes('tu münchen') || s.includes('tu munich') || s === 'tum')
        return 'TU Munich';
    if (s.includes('ludwig maximilian') || s.startsWith('lmu') ||
        (s.includes('university of munich') && !s.includes('technical')))
        return 'LMU Munich';
    for (const kw of ['massachusetts institute','stanford','harvard','berkeley','yale','princeton',
        'caltech','california institute of technology','columbia university','columbia business',
        'carnegie mellon','cornell','eth zurich','eth zürich','epfl','école polytechnique',
        'ecole polytechnique','university of oxford','oxford','university of cambridge',
        'imperial college','london school of economics','insead','hec paris','bocconi',
        'london business school','university of chicago','duke university','dartmouth',
        'nyu','new york university','university of pennsylvania']) {
        if (s.includes(kw)) return 'Elite International';
    }
    for (const kw of ['münchen','munchen','berlin','hamburg','heidelberg','mannheim','frankfurt',
        'karlsruhe','freiburg','stuttgart','köln','cologne','dortmund','bochum','augsburg',
        'erlangen','tübingen','regensburg','würzburg','dresden','hannover','aachen','rwth',
        'kiel','mainz','münster','passau','ulm','germany','german','whu','esmt']) {
        if (s.includes(kw)) return 'Other German Univ.';
    }
    return 'Other Intl. Univ.';
}

const _EXCHANGE_KW = ['visiting','exchange','non-degree','erasmus','semester abroad',
    'study abroad','transatlantic','research scholar','research fellow','research assistant'];

function deriveResearchStint(educationArr) {
    for (const edu of (educationArr || [])) {
        const school = (edu.school || '').toLowerCase();
        const degree = (edu.degree_raw || '').toLowerCase();
        const isExchange = edu.degree_level === 'Exchange' ||
            _EXCHANGE_KW.some(k => degree.includes(k));
        if (!isExchange) continue;
        if (school.includes('berkeley') || school.includes('massachusetts institute') ||
            school === 'mit' || school.includes('mit sloan') || school.includes('uc berkeley'))
            return 'Berkeley / MIT';
        for (const kw of ['stanford','harvard','columbia','carnegie mellon','cornell','yale',
            'princeton','caltech','oxford','cambridge','eth zurich','eth zürich','epfl',
            'imperial college','london school of economics','hec paris','insead',
            'university of chicago','duke','dartmouth']) {
            if (school.includes(kw)) return 'Elite Research';
        }
    }
    return 'None';
}

function deriveCdtmEcosystem(careerArr) {
    const RANK = { 'Unicorn Founder': 4, 'CDTM Founder': 3, 'CDTM Employee': 2, 'None': 1 };
    let best = 'None';
    for (const c of (careerArr || [])) {
        if (c.relative_to_cdtm === 'pre_cdtm') continue;
        const isFounder = c.career_type === 'Entrepreneurship / Founder' ||
            (c.title || '').toLowerCase().includes('founder');
        const isUnicorn = _matchesCdtmSet(c.company, CDTM_UNICORN_SET);
        const isCdtm   = isUnicorn || _matchesCdtmSet(c.company, CDTM_COMPANY_SET);
        const result   = isUnicorn && isFounder ? 'Unicorn Founder'
                       : isCdtm   && isFounder ? 'CDTM Founder'
                       : isCdtm               ? 'CDTM Employee'
                       : 'None';
        if (RANK[result] > RANK[best]) best = result;
    }
    return best;
}

function deriveFirstCareer(careerArr) {
    const sorted = (careerArr || [])
        .filter(c => c.relative_to_cdtm !== 'pre_cdtm' && c.career_type)
        .sort((a, b) => (a.start_year || 9999) - (b.start_year || 9999));
    // Prefer post_cdtm; fall back to unknown timing
    const post = sorted.filter(c => c.relative_to_cdtm === 'post_cdtm');
    return (post[0] || sorted[0])?.career_type || null;
}

// ─── Views ─────────────────────────────────────────────────────────────────────
// CDTM is intentionally excluded as a column — every single alumnus passes
// through it, so it adds no information to the path structure.
const VIEWS = [
    {
        id:    "education",
        label: "Education",
        desc:  "University Type  →  Field of Study  →  Research Stint  →  Post-CDTM Degree",
        columns: [
            { key: "university_type",  label: "UNIVERSITY",       topN: null, nullLabel: "Unknown" },
            { key: "primary_field",    label: "FIELD OF STUDY",   topN: null, nullLabel: "Other"             },
            { key: "research_stint",   label: "RESEARCH STINT",   topN: null, nullLabel: "None"              },
            { key: "post_cdtm_degree", label: "POST-CDTM DEGREE", topN: null, nullLabel: "No further degree" },
        ],
    },
    {
        id:    "career",
        label: "Career",
        desc:  "Field of Study  →  First Career  →  CDTM Ecosystem  →  Current Role",
        columns: [
            { key: "primary_field",       label: "FIELD OF STUDY",  topN: null, nullLabel: "Other"   },
            { key: "first_career_type",   label: "FIRST CAREER",    topN: null, nullLabel: "Unknown" },
            { key: "cdtm_ecosystem",      label: "CDTM ECOSYSTEM",  topN: null, nullLabel: "None"    },
            { key: "current_career_type", label: "CURRENT ROLE",    topN: null, nullLabel: "Unknown" },
        ],
    },
    {
        id:    "full",
        label: "Full Path",
        desc:  "Background  →  Research Stint  →  First Career  →  CDTM Ecosystem  →  Current Role",
        columns: [
            { key: "study_background",    label: "BACKGROUND",      topN: null, nullLabel: "Other Fields" },
            { key: "research_stint",      label: "RESEARCH STINT",  topN: null, nullLabel: "None"         },
            { key: "first_career_type",   label: "FIRST CAREER",    topN: null, nullLabel: "Unknown"      },
            { key: "cdtm_ecosystem",      label: "CDTM ECOSYSTEM",  topN: null, nullLabel: "None"         },
            { key: "current_career_type", label: "CURRENT ROLE",    topN: null, nullLabel: "Unknown"      },
        ],
    },
    {
        id:      "explore",
        label:   "Explore ✦",
        desc:    "Ask a natural language question — Claude finds the pattern",
        columns: null,
    },
];

// ─── Global state ──────────────────────────────────────────────────────────────
let alumni     = [];
let activeView = VIEWS[0];
let activePath = null;   // currently selected SVG path element
let lastExploreResult = null;

// ─── Data loading ──────────────────────────────────────────────────────────────
async function loadData() {
    const res = await fetch("data/alumni_processed.json");
    if (!res.ok) throw new Error(`HTTP ${res.status} — could not load alumni_processed.json`);
    const raw = await res.json();

    const GENERIC = new Set(['stealth startup','stealth','freelance','freelancer',
        'self-employed','independent','self employed','various','multiple','n/a']);

    const STUDY_BG_MAP = {
        'Computer Science & AI':          'CS & AI',
        'Information Systems & HCI':      'CS & AI',
        'Engineering':                    'Engineering',
        'Natural Sciences & Mathematics': 'Engineering',
        'Business & Economics':           'Business',
        'Humanities & Social Sciences':   'Other Fields',
        'Design, Architecture & Media':   'Other Fields',
        'Medicine & Health Sciences':     'Other Fields',
        'Technology Management':          'Other Fields',
    };

    alumni = raw.map(p => {
        const summary = { ...p.summary, full_name: p.full_name, linkedin: p.linkedin_url, headline: p.headline };
        const founderRoles = (p.career || []).filter(c =>
            (c.career_type === 'Entrepreneurship / Founder' ||
             (c.title || '').toLowerCase().includes('founder')) &&
            !GENERIC.has((c.company || '').trim().toLowerCase())
        );
        const years = founderRoles.map(c => c.start_year).filter(Boolean);
        summary.is_founder    = founderRoles.length > 0;
        summary.founding_year = years.length ? Math.min(...years) : null;
        summary.location      = p.location || '';

        // ── Hero chart fields ──────────────────────────────────────────────
        summary.study_background = STUDY_BG_MAP[summary.primary_field] || 'Other Fields';
        summary.cdtm_node        = 'CDTM';
        const hl = (p.headline || '').toLowerCase();
        const ct = summary.current_career_type || '';

        // Column 3 — current career (no professor/serial distinction here)
        const currentlyFounding = ct === 'Entrepreneurship / Founder' ||
            (ct === 'Startup / Scale-up' && (hl.includes('founder') || hl.includes('co-founder') ||
                hl.startsWith('ceo') || hl.startsWith('cto')));
        if (currentlyFounding)              summary.career_outcome = 'Founded Company';
        else if (ct === 'Academic / Research') summary.career_outcome = 'Academia';
        else if (ct === 'Consulting')       summary.career_outcome = 'Consulting';
        else if (ct === 'Big Tech')         summary.career_outcome = 'Big Tech';
        else if (ct === 'Startup / Scale-up') summary.career_outcome = 'Startup';
        else if (ct === 'Finance & Banking') summary.career_outcome = 'Finance';
        else if (ct === 'Corporate / Industry') summary.career_outcome = 'Corporate';
        else                                summary.career_outcome = 'Other';

        // Column 4 — extraordinary achievement (most people get "—", which is not rendered)
        const uniqueFounderCos = new Set(
            founderRoles.map(r => (r.company || '').trim().toLowerCase()).filter(Boolean)
        ).size;
        const isSerialFounder = uniqueFounderCos >= 2;
        if (isSerialFounder)
            summary.career_achievement = 'Serial Founder';
        else if (ct === 'Academic / Research' && (hl.includes('professor') || hl.includes('faculty')))
            summary.career_achievement = 'Professor';
        else
            summary.career_achievement = '—';

        // ── Enriched fields for redesigned tabs ───────────────────────────
        summary.university_type = deriveUniversityType(p.summary?.primary_pre_cdtm_school);
        summary.research_stint  = deriveResearchStint(p.education);
        summary.cdtm_ecosystem  = deriveCdtmEcosystem(p.career);
        // Fill first_career_type gaps by re-deriving from raw career array
        if (!summary.first_career_type)
            summary.first_career_type = deriveFirstCareer(p.career);
        // Normalise stray "Non-profit" value
        if (summary.first_career_type === 'Non-profit')
            summary.first_career_type = 'Government / NGO / Non-profit';

        return summary;
    });
}

// ─── Layout engine ─────────────────────────────────────────────────────────────
function buildLayout(data, view, svgW) {
    const iW    = svgW - MARGIN.left - MARGIN.right;
    const iH    = CHART_H - MARGIN.top - MARGIN.bottom;
    const nCols = view.columns.length;
    const colX  = ci => (iW / (nCols - 1)) * ci;

    // 1. Resolve each person's value per column
    const rows = data.map(person => {
        const vals = view.columns.map(col => {
            const v = person[col.key];
            return (v != null && v !== "") ? String(v) : col.nullLabel;
        });
        if (vals.some(v => v == null)) return null;   // column required no nullLabel & value missing
        return { person, vals };
    }).filter(Boolean);

    // 2. Apply topN: collapse non-top schools/values into their nullLabel
    view.columns.forEach((col, ci) => {
        if (!col.topN) return;
        const counts = {};
        rows.forEach(r => { counts[r.vals[ci]] = (counts[r.vals[ci]] || 0) + 1; });
        const top = new Set(
            Object.entries(counts)
                .filter(([v]) => v !== col.nullLabel)
                .sort((a, b) => b[1] - a[1])
                .slice(0, col.topN)
                .map(([v]) => v)
        );
        rows.forEach(r => {
            if (!top.has(r.vals[ci])) r.vals[ci] = col.nullLabel || "Other";
        });
    });

    // 3. Build nodes per column (sorted by count desc, nullLabel at bottom)
    const columns = view.columns.map((col, ci) => {
        const counts = {};
        rows.forEach(r => { counts[r.vals[ci]] = (counts[r.vals[ci]] || 0) + 1; });

        // Detect if this column contains cohort/year values that should be sorted chronologically
        const vals = Object.keys(counts);
        const looksChronological = vals.length >= 2 && vals.every(v =>
            /^(spring|fall|winter|summer)?\s*\d{4}/i.test(v) || /^\d{4}\s*[-–]\s*\d{4}$/.test(v) || /^\d{4}$/.test(v)
        );
        const cohortOrder = v => {
            const m = v.match(/(\d{4})/);
            const year = m ? parseInt(m[1]) : 9999;
            const season = /^fall/i.test(v) ? 0.5 : 0;
            return year + season;
        };

        const nodes = Object.entries(counts)
            .sort((a, b) => {
                if (col.nullLabel && a[0] === col.nullLabel) return 1;
                if (col.nullLabel && b[0] === col.nullLabel) return -1;
                if (looksChronological) return cohortOrder(a[0]) - cohortOrder(b[0]);
                return b[1] - a[1];
            })
            .map(([value, count]) => ({ colIndex: ci, value, count, x: colX(ci), y: 0, height: 0 }));

        const totalPad  = Math.max(0, nodes.length - 1) * NODE_GAP;
        const available = iH - totalPad;
        const total     = nodes.reduce((s, n) => s + n.count, 0);
        let y = 0;
        nodes.forEach(n => { n.height = (n.count / total) * available; n.y = y; y += n.height + NODE_GAP; });

        return { col, index: ci, x: colX(ci), nodes };
    });

    // 4. Sort rows to minimise visual crossings between columns
    //    Primary sort key: node index per column (left to right)
    const nodeIndexMaps = columns.map(col =>
        Object.fromEntries(col.nodes.map((n, i) => [n.value, i]))
    );
    rows.sort((a, b) => {
        for (let ci = 0; ci < nCols; ci++) {
            const d = (nodeIndexMaps[ci][a.vals[ci]] ?? 99) - (nodeIndexMaps[ci][b.vals[ci]] ?? 99);
            if (d !== 0) return d;
        }
        return 0;
    });

    // 5. Assign each person a y position within their node in each column
    //    People are spread evenly across the node's height in their sorted order.
    const yPos = rows.map(() => new Array(nCols).fill(0));

    columns.forEach((col, ci) => {
        const nodeMap = Object.fromEntries(col.nodes.map(n => [n.value, n]));
        const groups  = {};
        rows.forEach((row, ri) => {
            const v = row.vals[ci];
            if (!groups[v]) groups[v] = [];
            groups[v].push(ri);
        });
        Object.entries(groups).forEach(([val, indices]) => {
            const node = nodeMap[val];
            if (!node) return;
            const n = indices.length;
            // Converge lines into the central 60% of the oval height,
            // mimicking the Endeavor-style bundling at each node.
            const spread = node.height * 0.60;
            const startY = node.y + (node.height - spread) / 2;
            indices.forEach((ri, k) => {
                const t = n === 1 ? 0.5 : k / (n - 1);
                yPos[ri][ci] = startY + t * spread;
            });
        });
    });

    // Centre x of each oval node
    const xs = columns.map(col => col.x + OVAL_RX);

    return { columns, rows, yPos, xs };
}

// ─── SVG path string for one person ────────────────────────────────────────────
function personPath(xs, ys) {
    let d = `M${xs[0]},${ys[0]}`;
    for (let i = 1; i < xs.length; i++) {
        const mx = (xs[i - 1] + xs[i]) / 2;
        d += ` C${mx},${ys[i - 1]} ${mx},${ys[i]} ${xs[i]},${ys[i]}`;
    }
    return d;
}

// ─── Tooltip ───────────────────────────────────────────────────────────────────
const tipEl = document.getElementById("tooltip");

function showTip(html, evt) {
    tipEl.innerHTML = html;
    tipEl.classList.add("visible");
    moveTip(evt);
}
function moveTip(evt) {
    tipEl.style.left = Math.min(evt.clientX + 16, window.innerWidth - 260) + "px";
    tipEl.style.top  = (evt.clientY - 12) + "px";
}
function hideTip() { tipEl.classList.remove("visible"); }

// ─── Selected-person bar ────────────────────────────────────────────────────────
function selectPerson(person, pathNode, allPaths) {
    // Deselect previous
    if (activePath) {
        d3.select(activePath).attr("stroke-width", 0.8).attr("opacity", 0.35);
        activePath = null;
    }
    if (!person) {
        document.getElementById("selected-bar").style.display = "none";
        allPaths.attr("opacity", 0.35).attr("stroke-width", 0.8);
        return;
    }
    activePath = pathNode;
    d3.select(pathNode).attr("stroke-width", 2.8).attr("opacity", 1.0).raise();

    document.getElementById("sel-name").textContent     = person.full_name || "—";
    document.getElementById("sel-headline").textContent = (person.headline || "").trim();
    const linkEl = document.getElementById("sel-link");
    if (person.linkedin) {
        linkEl.href = person.linkedin;
        linkEl.style.display = "inline";
    } else {
        linkEl.style.display = "none";
    }
    document.getElementById("selected-bar").style.display = "flex";
}

// render() replaced by canvas-based chart.js (renderView / switchView)

// ─── Query cache (localStorage) ──────────────────────────────────────────────
const CACHE_KEY = "cdtm_query_cache";
const CACHE_MAX = 15;

function getCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || []; }
    catch { return []; }
}

function saveToCache(cacheKey, displayQuery, data) {
    let cache = getCache().filter(e => e.cacheKey !== cacheKey && e.query.toLowerCase() !== displayQuery.toLowerCase());
    cache.unshift({ cacheKey, query: displayQuery, data });
    if (cache.length > CACHE_MAX) cache = cache.slice(0, CACHE_MAX);
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache.slice(0, Math.floor(CACHE_MAX / 2)))); }
        catch {}
    }
}

function getFromCache(cacheKey) {
    return getCache().find(e => e.cacheKey === cacheKey) || null;
}

function querySimilarity(cachedQuery, input) {
    if (!input) return 1;
    const words = s => new Set(s.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const a = words(cachedQuery), b = words(input);
    let score = 0;
    for (const w of b) if (a.has(w)) score++;
    if (cachedQuery.toLowerCase().includes(input.toLowerCase())) score += 2;
    return score;
}

let _popularQueries = [];
(async function loadPopularQueries() {
    try {
        const res = await fetch("/api/popular-queries");
        if (res.ok) _popularQueries = await res.json();
    } catch {}
})();

function renderSuggestions(currentInput) {
    const el = document.getElementById("suggestions");
    if (!el) return;

    // Merge local cache with server-side popular queries
    const local = getCache();
    const seen = new Set(local.map(e => e.query.toLowerCase()));
    const merged = [...local];
    for (const pq of _popularQueries) {
        if (!seen.has(pq.query.toLowerCase())) {
            merged.push({ query: pq.query, data: null });
            seen.add(pq.query.toLowerCase());
        }
    }
    if (merged.length === 0) { el.innerHTML = ""; return; }

    const scored = merged.map(e => ({ ...e, score: querySimilarity(e.query, currentInput) }));
    const filtered = currentInput.trim()
        ? scored.filter(e => e.score > 0).sort((a, b) => b.score - a.score)
        : scored;

    el.innerHTML = filtered.slice(0, 6).map(e =>
        `<button class="suggestion-chip" data-query="${e.query.replace(/"/g, "&quot;")}" title="${e.query.replace(/"/g, "&quot;")}">${e.query}</button>`
    ).join("");

    el.querySelectorAll(".suggestion-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            if (window.posthog) posthog.capture('suggestion_clicked', { query: chip.dataset.query });
            document.getElementById("query-input").value = chip.dataset.query;
            handleQuery();
        });
    });
}

// ─── Auto model selection ────────────────────────────────────────────────────
function pickModel(query) {
    const q = query.toLowerCase();
    // Complex queries → always Sonnet
    const complexSignals = [
        'compare', 'analyze', 'correlation', 'trend', 'pattern', 'most common',
        'breakdown', 'distribution', 'percentage', 'how many', 'what fraction',
        'vs', 'versus', 'between', 'relationship', 'over time', 'timeline',
        'career path', 'transition', ' and ', 'top 10', 'rank', 'cluster',
    ];
    if (q.length > 80 || complexSignals.some(s => q.includes(s))) {
        return "claude-sonnet-4-6";
    }
    // Simple queries → 50:50
    return Math.random() < 0.5 ? "claude-sonnet-4-6" : "gpt-5.2";
}

// ─── Activity steps ──────────────────────────────────────────────────────────
const ACTIVITY_STEPS = [
    "Searching alumni paths",
    "Scanning career data",
    "Analyzing patterns",
    "Building visualization",
];
let _activityInterval = null;
let _activityIdx = 0;

function startActivitySteps() {
    const container = document.getElementById("activity-steps");
    if (!container) return;
    container.innerHTML = ACTIVITY_STEPS.map((step, i) =>
        `<div class="activity-step ${i === 0 ? 'active' : 'pending'}">
            <span class="activity-dot"></span>
            <span>${step}</span>
        </div>`
    ).join("");
    _activityIdx = 0;

    _activityInterval = setInterval(() => {
        _activityIdx++;
        if (_activityIdx >= ACTIVITY_STEPS.length) {
            clearInterval(_activityInterval);
            return;
        }
        const steps = container.querySelectorAll(".activity-step");
        steps.forEach((el, i) => {
            el.className = "activity-step " + (i < _activityIdx ? "done" : i === _activityIdx ? "active" : "pending");
        });
    }, 2800);
}

function stopActivitySteps() {
    clearInterval(_activityInterval);
    _activityInterval = null;
}

// ─── Typewriter ─────────────────────────────────────────────────────────────
const TYPEWRITER_QUERIES = [
    "Who went on to found a unicorn?",
    "What did the class of Spring 2025 do?",
    "Who has a neuroscience background?",
    "Show me founders who studied engineering",
    "Who transitioned from consulting to startups?",
    "Which alumni ended up at Google or Apple?",
    "Who co-founded companies after McKinsey?",
    "Show career paths through Y Combinator",
];
let _twTimeout = null;
let _twRunning = false;

function startTypewriter() {
    const textEl = document.getElementById("typewriter-text");
    const cursorEl = document.getElementById("typewriter-cursor");
    if (!textEl) return;
    _twRunning = true;

    let qIdx = Math.floor(Math.random() * TYPEWRITER_QUERIES.length);

    function typeNext() {
        if (!_twRunning) return;
        const query = TYPEWRITER_QUERIES[qIdx % TYPEWRITER_QUERIES.length];
        qIdx++;
        let charIdx = 0;
        textEl.textContent = "";
        if (cursorEl) cursorEl.style.display = "";

        // Type in
        function typeChar() {
            if (!_twRunning) return;
            if (charIdx <= query.length) {
                textEl.textContent = query.slice(0, charIdx);
                charIdx++;
                _twTimeout = setTimeout(typeChar, 45 + Math.random() * 35);
            } else {
                // Pause, then erase
                _twTimeout = setTimeout(eraseChars, 2200);
            }
        }

        // Erase
        function eraseChars() {
            if (!_twRunning) return;
            const current = textEl.textContent;
            if (current.length > 0) {
                textEl.textContent = current.slice(0, -1);
                _twTimeout = setTimeout(eraseChars, 22);
            } else {
                _twTimeout = setTimeout(typeNext, 400);
            }
        }

        typeChar();
    }

    typeNext();
}

function stopTypewriter() {
    _twRunning = false;
    clearTimeout(_twTimeout);
    const el = document.getElementById("typewriter-text");
    const cursor = document.getElementById("typewriter-cursor");
    if (el) el.textContent = "";
    if (cursor) cursor.style.display = "none";
}

// ─── Explore tab ────────────────────────────────────────────────────────────────
function activateExplore() {
    document.getElementById("chart").innerHTML = "";
    document.getElementById("selected-bar").style.display = "none";
    document.getElementById("stats").innerHTML = "";
    activePath = null;
    renderSuggestions("");
    startTypewriter();
}

async function handleQuery() {
    const input   = document.getElementById("query-input");
    const btn     = document.getElementById("query-btn");
    const loading = document.getElementById("query-loading");
    const aBox    = document.getElementById("analysis-box");
    const aTitle  = document.getElementById("analysis-title");
    const aText   = document.getElementById("analysis-text");

    const query = input.value.trim();
    if (!query) return;

    stopTypewriter();

    const model = pickModel(query);
    const detailMode = document.getElementById("detail-mode-toggle")?.checked || false;
    const cacheKey = `${model}::${detailMode}::${query}`;
    const cached = getFromCache(cacheKey);
    if (cached) {
        if (window.posthog) posthog.capture('query_cache_hit', { query, model, source: 'local' });
        aTitle.textContent = cached.data.title || "Results";
        aText.textContent  = cached.data.analysis || "";
        aBox.classList.add("active");
        lastExploreResult = cached.data;
        renderDynamic(cached.data);
        renderSuggestions(query);
        showFeedbackBar(query, model, cached.data.trace_id || "");
        showShareBar(query, model);
        startTypewriter();
        if (cached.data.trace_id) {
            setTimeout(() => saveTraceScreenshot(cached.data.trace_id), 500);
        }
        return;
    }

    if (window.posthog) posthog.capture('query_submitted', { query, model });
    const queryStartTime = performance.now();

    btn.disabled = true;
    loading.classList.add("active");
    aBox.classList.remove("active");
    hideFeedbackBar();
    hideShareBar();
    startLoadingWords();
    startActivitySteps();
    document.getElementById("stats").innerHTML = "";
    document.getElementById("selected-bar").style.display = "none";
    activePath = null;

    try {
        const res = await fetch("/api/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query,
                model,
                detail_mode: detailMode,
            }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        const durationMs = Math.round(performance.now() - queryStartTime);
        if (window.posthog) posthog.capture('query_completed', {
            query, model, duration_ms: durationMs,
            num_paths: (data.paths || []).length,
            cached: !!data.cached,
            cost_usd: data.debug?.cost_usd || 0,
        });
        aTitle.textContent = data.title || "Results";
        aText.textContent  = data.analysis || "";
        aBox.classList.add("active");
        lastExploreResult = data;
        saveToCache(cacheKey, query, data);
        renderDynamic(data);
        renderSuggestions(query);
        showFeedbackBar(query, model, data.trace_id || "");
        showShareBar(query, model);
        startTypewriter();
        if (data.trace_id) {
            setTimeout(() => saveTraceScreenshot(data.trace_id), 500);
        }
    } catch (err) {
        if (window.posthog) posthog.capture('query_error', { query, model, error: err.message });
        document.getElementById("chart").innerHTML =
            `<div class="message error"><strong>Error:</strong> ${err.message}</div>`;
    } finally {
        btn.disabled = false;
        stopLoadingWords();
        stopActivitySteps();
        loading.classList.remove("active");
    }
}


async function saveTraceScreenshot(traceId) {
    const svg = document.querySelector("#chart svg");
    if (!svg) return;
    try {
        const svgData = new XMLSerializer().serializeToString(svg);
        const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();
        img.onload = async () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth * 2;
            canvas.height = img.naturalHeight * 2;
            const ctx = canvas.getContext("2d");
            ctx.scale(2, 2);
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            const dataUrl = canvas.toDataURL("image/png");
            await fetch("/api/trace-screenshot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ trace_id: traceId, image: dataUrl }),
            });
            console.log(`[Trace] Screenshot saved for ${traceId}`);
        };
        img.src = url;
    } catch (e) {
        console.warn("[Trace] Failed to capture screenshot:", e);
    }
}

// ─── Chart feedback ──────────────────────────────────────────────────────────
let _feedbackTimer = null;

function showFeedbackBar(query, model, traceId) {
    clearTimeout(_feedbackTimer);
    const bar = document.getElementById("feedback-bar");
    const prompt = document.getElementById("feedback-prompt");
    const commentSection = document.getElementById("feedback-comment");
    const thanks = document.getElementById("feedback-thanks");
    const upBtn = document.getElementById("feedback-up");
    const downBtn = document.getElementById("feedback-down");

    // Reset state
    bar.style.display = "none";
    prompt.style.display = "flex";
    commentSection.style.display = "none";
    thanks.style.display = "none";
    upBtn.classList.remove("selected");
    downBtn.classList.remove("selected");
    document.getElementById("feedback-input").value = "";

    // Show after delay
    _feedbackTimer = setTimeout(() => { bar.style.display = "block"; }, 2000);

    function submitFeedback(rating, comment) {
        fetch("/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rating, comment, query, model, trace_id: traceId }),
        }).catch(() => {});
        if (window.posthog) posthog.capture('chart_feedback', { rating, comment, query, model });
        prompt.style.display = "none";
        commentSection.style.display = "none";
        thanks.style.display = "block";
        setTimeout(() => { bar.style.display = "none"; }, 3000);
    }

    // Clone and replace to remove old listeners
    const newUp = upBtn.cloneNode(true);
    const newDown = downBtn.cloneNode(true);
    upBtn.replaceWith(newUp);
    downBtn.replaceWith(newDown);

    newUp.addEventListener("click", () => {
        newUp.classList.add("selected");
        submitFeedback("up", "");
    });
    newDown.addEventListener("click", () => {
        newDown.classList.add("selected");
        prompt.style.display = "none";
        commentSection.style.display = "flex";
        document.getElementById("feedback-input").focus();
    });

    // Comment submit / skip
    const submitBtn = document.getElementById("feedback-submit");
    const skipBtn = document.getElementById("feedback-skip");
    const newSubmit = submitBtn.cloneNode(true);
    const newSkip = skipBtn.cloneNode(true);
    submitBtn.replaceWith(newSubmit);
    skipBtn.replaceWith(newSkip);

    newSubmit.addEventListener("click", () => {
        submitFeedback("down", document.getElementById("feedback-input").value.trim());
    });
    newSkip.addEventListener("click", () => {
        submitFeedback("down", "");
    });

    // Enter key submits comment
    document.getElementById("feedback-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") newSubmit.click();
    });
}

function hideFeedbackBar() {
    clearTimeout(_feedbackTimer);
    const bar = document.getElementById("feedback-bar");
    if (bar) bar.style.display = "none";
}

// ─── Share bar ──────────────────────────────────────────────────────────────
let _currentShareQuery = null;
let _currentShareModel = null;

const ICON_SHARE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;
const ICON_CHECK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

function _shareWaveText(text) {
    return text.split("").map((ch, i) => {
        if (ch === " ") return `<span class="share-char" style="--d:${i * 0.1}s">&nbsp;</span>`;
        return `<span class="share-char" style="--d:${i * 0.1}s">${ch}</span>`;
    }).join("");
}

async function sha256Prefix(str) {
    const data = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const arr = Array.from(new Uint8Array(hash));
    return arr.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 10);
}

function showShareBar(query, model) {
    _currentShareQuery = query;
    _currentShareModel = model;
    const bar = document.getElementById("share-bar");
    const hint = document.getElementById("share-hint");
    if (bar) {
        bar.classList.add("active");
        hint.textContent = "";
    }
    const btn = document.getElementById("share-btn");
    btn.classList.remove("copied");
    btn.innerHTML = `${ICON_SHARE} ${_shareWaveText("Share this graph")}`;

    // Clone to remove old listeners
    const newBtn = btn.cloneNode(true);
    btn.replaceWith(newBtn);
    newBtn.addEventListener("click", handleShare);
}

function hideShareBar() {
    const bar = document.getElementById("share-bar");
    if (bar) bar.classList.remove("active");
}

async function handleShare() {
    const btn = document.getElementById("share-btn");
    const hint = document.getElementById("share-hint");
    if (!_currentShareQuery) return;

    try {
        const cacheKey = `${_currentShareModel}::${_currentShareQuery.toLowerCase()}`;
        const shareId = await sha256Prefix(cacheKey);

        const url = `${window.location.origin}${window.location.pathname}?q=${encodeURIComponent(_currentShareQuery)}`;
        await navigator.clipboard.writeText(url);

        btn.classList.add("copied");
        btn.innerHTML = `${ICON_CHECK} ${_shareWaveText("Copied")}`;
        hint.textContent = url;
        if (window.posthog) posthog.capture('graph_shared', { query: _currentShareQuery, share_id: shareId });

        setTimeout(() => {
            btn.classList.remove("copied");
            btn.innerHTML = `${ICON_SHARE} ${_shareWaveText("Share this graph")}`;
        }, 3000);
    } catch (err) {
        // Fallback: select text for manual copy
        const url = `${window.location.origin}${window.location.pathname}?q=${encodeURIComponent(_currentShareQuery)}`;
        hint.textContent = url;
        try {
            const ta = document.createElement("textarea");
            ta.value = url;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            btn.classList.add("copied");
            btn.innerHTML = `${ICON_CHECK} ${_shareWaveText("Copied")}`;
            setTimeout(() => {
                btn.classList.remove("copied");
                btn.innerHTML = `${ICON_SHARE} ${_shareWaveText("Share this graph")}`;
            }, 3000);
        } catch {
            hint.textContent = url;
        }
    }
}

// ─── Handle incoming share URLs ─────────────────────────────────────────────
function loadSharedQuery() {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("q");
    if (!query) return false;
    // Scroll straight to the explore section and auto-submit
    document.getElementById("app-section").scrollIntoView({ behavior: "instant" });
    document.getElementById("query-input").value = query;
    setTimeout(() => handleQuery(), 300);
    showBeginNudge();
    return true;
}

function showBeginNudge() {
    if (document.getElementById("begin-nudge")) return;
    const nudge = document.createElement("button");
    nudge.id = "begin-nudge";
    nudge.className = "begin-nudge";
    nudge.textContent = "Start the experience from the beginning";
    nudge.addEventListener("click", () => {
        nudge.remove();
        window.history.replaceState({}, "", window.location.pathname);
        document.getElementById("hero-section").scrollIntoView({ behavior: "smooth" });
    });
    document.body.appendChild(nudge);
    // Auto-dismiss after scrolling to top
    window.addEventListener("scroll", function dismiss() {
        if (window.scrollY < 200) {
            nudge.remove();
            window.removeEventListener("scroll", dismiss);
        }
    }, { passive: true });
}

function renderDynamic(data) {
    const container = document.getElementById("chart");
    activePath = null;
    document.getElementById("selected-bar").style.display = "none";

    const paths = data.paths || [];
    if (paths.length === 0) {
        container.innerHTML = `<div class="message">No matching alumni found.</div>`;
        document.getElementById("stats").innerHTML = "";
        return;
    }

    const columnLabels = data.column_labels;
    const nCols = columnLabels.length;
    const svgW = container.clientWidth || 1200;
    const iW = svgW - MARGIN.left - MARGIN.right;
    const iH = CHART_H - MARGIN.top - MARGIN.bottom;
    const colX = ci => (iW / (nCols - 1)) * ci;
    const xs = Array.from({length: nCols}, (_, ci) => colX(ci) + OVAL_RX);

    // Build rows with nullable values
    const rows = paths.map(p => ({
        person: { full_name: p.name, linkedin: p.linkedin || null, headline: p.headline || "" },
        vals: p.values.map(v => (v != null && v !== "") ? String(v) : null),
    }));

    // Build nodes per column (only counting non-null entries)
    const columns = columnLabels.map((label, ci) => {
        const counts = {};
        rows.forEach(r => {
            const v = r.vals[ci];
            if (v != null) counts[v] = (counts[v] || 0) + 1;
        });

        // Chronological detection
        const vals = Object.keys(counts);
        const looksChronological = vals.length >= 2 && vals.every(v =>
            /^(spring|fall|winter|summer)?\s*\d{4}/i.test(v) || /^\d{4}\s*[-–]\s*\d{4}$/.test(v) || /^\d{4}$/.test(v)
        );
        const cohortOrder = v => {
            const m = v.match(/(\d{4})/);
            const year = m ? parseInt(m[1]) : 9999;
            const season = /^fall/i.test(v) ? 0.5 : 0;
            return year + season;
        };

        const nodes = Object.entries(counts)
            .sort((a, b) => looksChronological ? cohortOrder(a[0]) - cohortOrder(b[0]) : b[1] - a[1])
            .map(([value, count]) => ({ colIndex: ci, value, count, y: 0, height: 0 }));

        const totalPad = Math.max(0, nodes.length - 1) * NODE_GAP;
        const available = iH - totalPad;
        const total = nodes.reduce((s, n) => s + n.count, 0) || 1;
        let y = 0;
        nodes.forEach(n => { n.height = (n.count / total) * available; n.y = y; y += n.height + NODE_GAP; });

        return { col: { label }, index: ci, nodes };
    });

    // Sort rows to minimise crossings
    const nodeIndexMaps = columns.map(col =>
        Object.fromEntries(col.nodes.map((n, i) => [n.value, i]))
    );
    rows.sort((a, b) => {
        for (let ci = 0; ci < nCols; ci++) {
            const av = a.vals[ci], bv = b.vals[ci];
            const ai = av != null ? (nodeIndexMaps[ci][av] ?? 99) : 100;
            const bi = bv != null ? (nodeIndexMaps[ci][bv] ?? 99) : 100;
            if (ai !== bi) return ai - bi;
        }
        return 0;
    });

    // Assign colors by first-column value
    const EXPLORE_COLORS = ["#1b3a6b","#e2b84a","#2e6ca4","#d4a83a","#4889d0","#93c5fd","#c49530","#7ab3e8","#3b7dc9","#bfdbfe","#1e4d8c","#a5c8ef"];
    const firstColVals = [...new Set(rows.map(r => r.vals[0]))];
    const valColorMap = {};
    firstColVals.forEach((v, i) => {
        valColorMap[v] = PALETTE[v] || EXPLORE_COLORS[i % EXPLORE_COLORS.length];
    });

    // Build SVG
    container.innerHTML = "";
    const svg = d3.select(container).append("svg")
        .attr("width", svgW).attr("height", CHART_H)
        .style("display", "block");

    // Background
    svg.append("rect").attr("width", svgW).attr("height", CHART_H).attr("fill", BG_COLOR);

    // Column headers
    columns.forEach((col, ci) => {
        const cx = MARGIN.left + xs[ci];
        svg.append("text")
            .attr("x", cx).attr("y", MARGIN.top - 38)
            .attr("text-anchor", "middle")
            .attr("fill", "#6b6960")
            .style("font", "bold 10.5px 'Inter', sans-serif")
            .style("letter-spacing", "0.10em")
            .text(col.col.label);
        svg.append("line")
            .attr("x1", cx).attr("y1", MARGIN.top - 24)
            .attr("x2", cx).attr("y2", MARGIN.top - 12)
            .attr("stroke", "rgba(26,25,22,0.20)").attr("stroke-width", 1);
    });

    // Dashed separators between columns
    for (let i = 0; i + 1 < xs.length; i++) {
        const sepX = MARGIN.left + (xs[i] + xs[i + 1]) / 2;
        svg.append("line")
            .attr("x1", sepX).attr("y1", MARGIN.top - 10)
            .attr("x2", sepX).attr("y2", CHART_H - MARGIN.bottom + 10)
            .attr("stroke", "rgba(26,25,22,0.10)")
            .attr("stroke-width", 0.8)
            .attr("stroke-dasharray", "4,7");
    }

    // Circle radius by count — proportional to sqrt(count)
    const maxCount = Math.max(...columns.flatMap(col => col.nodes.map(n => n.count)));
    const minR = 6, maxR = 42;
    const nodeRadius = (count) => Math.max(minR, Math.min(maxR, Math.sqrt(count / maxCount) * maxR));

    // Build node center + per-person y offsets within circle (null = skip)
    const nodeCenterY = columns.map(col => {
        const m = {};
        col.nodes.forEach(node => { m[node.value] = MARGIN.top + node.y + node.height / 2; });
        return m;
    });
    // personYAtNode[ri][ci] = y coordinate or null (skip)
    const personYAtNode = rows.map(() => new Array(nCols).fill(null));
    columns.forEach((col, ci) => {
        const groups = {};
        rows.forEach((row, ri) => {
            const v = row.vals[ci];
            if (v == null) return; // skip nulls
            if (!groups[v]) groups[v] = [];
            groups[v].push(ri);
        });
        for (const [val, indices] of Object.entries(groups)) {
            const cy = nodeCenterY[ci][val];
            const r = nodeRadius(indices.length <= 1 ? 1 : indices.length);
            const spread = r * 0.7;
            const n = indices.length;
            indices.forEach((ri, k) => {
                const t = n === 1 ? 0 : (k / (n - 1)) * 2 - 1;
                personYAtNode[ri][ci] = cy + t * spread;
            });
        }
    });

    // Node circles sized by count + annotation leader lines
    const nodesG = svg.append("g");
    const labelsG = svg.append("g");
    columns.forEach((col, ci) => {
        const cx = MARGIN.left + xs[ci];
        const isLeft = ci < nCols / 2;

        col.nodes.forEach(node => {
            const cy = nodeCenterY[ci][node.value];
            const r = nodeRadius(node.count);

            // Circle
            nodesG.append("circle")
                .attr("cx", cx).attr("cy", cy).attr("r", r)
                .attr("fill", "none")
                .attr("stroke", "rgba(26,25,22,0.22)")
                .attr("stroke-width", 1);

            // Leader line + label
            const anchor = isLeft ? "end" : "start";
            const dir = isLeft ? -1 : 1;
            const lx1 = cx + dir * r;
            const lx2 = cx + dir * (r + 10);
            const lx3 = cx + dir * (r + 28);
            const ly2 = cy - 6;

            labelsG.append("path")
                .attr("d", `M${lx1},${cy} L${lx2},${ly2} L${lx3},${ly2}`)
                .attr("fill", "none")
                .attr("stroke", "rgba(26,25,22,0.28)")
                .attr("stroke-width", 0.7);

            labelsG.append("text")
                .attr("x", lx3 + dir * 3).attr("y", ly2 - 4)
                .attr("text-anchor", anchor)
                .attr("fill", "#1a1916")
                .style("font", "italic 11px 'Inter', Georgia, serif")
                .text(node.value);
            labelsG.append("text")
                .attr("x", lx3 + dir * 3).attr("y", ly2 + 9)
                .attr("text-anchor", anchor)
                .attr("fill", "rgba(26,25,22,0.45)")
                .style("font", "9.5px 'Inter', sans-serif")
                .text(`${node.count} ${node.count === 1 ? "person" : "people"}`);
        });
    });

    // Flow paths — skip null columns, bridge beziers across gaps
    function skipPath(ri) {
        const ys = personYAtNode[ri];
        const xPts = xs.map(x => MARGIN.left + x);
        // Collect only non-null waypoints
        const pts = [];
        for (let ci = 0; ci < nCols; ci++) {
            if (ys[ci] != null) pts.push({ x: xPts[ci], y: ys[ci] });
        }
        if (pts.length < 2) return "";
        let d = `M${pts[0].x},${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            const mx = (pts[i - 1].x + pts[i].x) / 2;
            d += ` C${mx},${pts[i - 1].y} ${mx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
        }
        return d;
    }

    const pathsG = svg.append("g");
    const allPaths = pathsG.selectAll("path")
        .data(rows)
        .join("path")
        .attr("d", (row, ri) => skipPath(ri))
        .attr("fill", "none")
        .attr("stroke", row => valColorMap[row.vals[0]] || "#94a3b8")
        .attr("stroke-width", Math.max(1.2, Math.min(3, 80 / rows.length)))
        .attr("opacity", 0.55)
        .attr("stroke-linecap", "round")
        .on("mouseenter", function (evt, row) {
            allPaths.attr("opacity", 0.12).attr("stroke-width", Math.max(1, Math.min(2.5, 60 / rows.length)));
            d3.select(this).attr("opacity", 1).attr("stroke-width", Math.max(2.5, Math.min(4, 120 / rows.length))).raise();
            showTip(
                `<strong>${row.person.full_name || "—"}</strong><br>` +
                `<span style="opacity:0.8">${(row.person.headline || "").trim()}</span><br>` +
                `<span style="font-size:11px;opacity:0.55">Click to open LinkedIn</span>`,
                evt
            );
        })
        .on("mousemove", (evt) => moveTip(evt))
        .on("mouseleave", function () {
            const lw = Math.max(1.2, Math.min(3, 80 / rows.length));
            allPaths.attr("opacity", 0.55).attr("stroke-width", lw);
            hideTip();
        })
        .on("click", (evt, row) => {
            selectPerson(row.person, evt.currentTarget, allPaths);
            if (row.person.linkedin) window.open(row.person.linkedin, "_blank");
        });

    // Node hover hit areas — highlight all paths through a node
    // pointer-events: none so clicks pass through to paths underneath
    const hitG = svg.append("g").attr("class", "node-hits").style("pointer-events", "none");
    const defaultLw = Math.max(1.2, Math.min(3, 80 / rows.length));
    const hoverLw = Math.max(2.5, Math.min(4, 120 / rows.length));
    const dimLw = Math.max(1, Math.min(2.5, 60 / rows.length));

    // Track which node is hovered so path hover can show individual tooltip
    let _hoveredNode = null;

    columns.forEach((col, ci) => {
        const cx = MARGIN.left + xs[ci];
        col.nodes.forEach(node => {
            const cy = nodeCenterY[ci][node.value];
            const r = nodeRadius(node.count);
            hitG.append("circle")
                .attr("cx", cx).attr("cy", cy).attr("r", r + 4)
                .attr("fill", "transparent")
                .attr("stroke", "none");
        });
    });

    // Use SVG-level mousemove to detect node proximity for highlighting
    let _activeNodeKey = null;
    svg.on("mousemove", function (evt) {
        const [mx, my] = d3.pointer(evt);
        let bestNode = null, bestCi = -1, bestDist = Infinity;
        columns.forEach((col, ci) => {
            const cx = MARGIN.left + xs[ci];
            col.nodes.forEach(node => {
                const cy = nodeCenterY[ci][node.value];
                const r = nodeRadius(node.count);
                const dx = mx - cx, dy = my - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < r + 6 && dist < bestDist) {
                    bestDist = dist;
                    bestNode = node;
                    bestCi = ci;
                }
            });
        });

        const nodeKey = bestNode ? `${bestCi}::${bestNode.value}` : null;
        if (nodeKey === _activeNodeKey) return;
        _activeNodeKey = nodeKey;
        _hoveredNode = bestNode ? { node: bestNode, ci: bestCi } : null;

        if (bestNode) {
            allPaths
                .attr("opacity", d => d.vals[bestCi] === bestNode.value ? 1 : 0.08)
                .attr("stroke-width", d => d.vals[bestCi] === bestNode.value ? hoverLw : dimLw);
            allPaths.filter(d => d.vals[bestCi] === bestNode.value).raise();
        } else {
            allPaths.attr("opacity", 0.55).attr("stroke-width", defaultLw);
        }
    });
    svg.on("mouseleave", function () {
        _activeNodeKey = null;
        _hoveredNode = null;
        allPaths.attr("opacity", 0.55).attr("stroke-width", defaultLw);
        hideTip();
    });

    // Override path hover to show individual person tooltip even during node highlight
    allPaths
        .on("mouseenter", function (evt, row) {
            // Keep node highlight active but boost this path
            if (_hoveredNode) {
                d3.select(this).attr("opacity", 1).attr("stroke-width", Math.max(3, hoverLw + 1)).raise();
            } else {
                allPaths.attr("opacity", 0.12).attr("stroke-width", dimLw);
                d3.select(this).attr("opacity", 1).attr("stroke-width", hoverLw).raise();
            }
            showTip(
                `<strong>${row.person.full_name || "—"}</strong><br>` +
                `<span style="opacity:0.8">${(row.person.headline || "").trim()}</span><br>` +
                `<span style="font-size:11px;opacity:0.55">Click to open LinkedIn</span>`,
                evt
            );
        })
        .on("mouseleave", function (evt, row) {
            if (_hoveredNode) {
                const { node, ci } = _hoveredNode;
                d3.select(this)
                    .attr("opacity", row.vals[ci] === node.value ? 1 : 0.08)
                    .attr("stroke-width", row.vals[ci] === node.value ? hoverLw : dimLw);
            } else {
                allPaths.attr("opacity", 0.55).attr("stroke-width", defaultLw);
            }
            hideTip();
        });

    document.getElementById("stats").innerHTML =
        `<strong>${rows.length.toLocaleString()}</strong> alumni match · ` +
        `<span style="color:#a8a79f">hover a path or node to explore · click to open LinkedIn</span>`;
}

// ─── Scroll & section tracking (PostHog) ─────────────────────────────────────
function initScrollTracking() {
    if (!window.posthog) return;
    const sections = [
        { id: "hero-section",    name: "Hero" },
        { id: "founder-section", name: "Founder Timeline" },
        { id: "narrative-2",     name: "Narrative" },
        { id: "app-section",     name: "Explore" },
    ];
    const seen = new Set();
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting && !seen.has(e.target.id)) {
                seen.add(e.target.id);
                const name = sections.find(s => s.id === e.target.id)?.name || e.target.id;
                posthog.capture("section_viewed", { section: name });
            }
        });
    }, { threshold: 0.3 });
    sections.forEach(s => {
        const el = document.getElementById(s.id);
        if (el) observer.observe(el);
    });

    // Scroll depth milestones (25/50/75/100%)
    const depthSeen = new Set();
    window.addEventListener("scroll", () => {
        const pct = Math.round(100 * (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight);
        [25, 50, 75, 100].forEach(m => {
            if (pct >= m && !depthSeen.has(m)) {
                depthSeen.add(m);
                posthog.capture("scroll_depth", { percent: m });
            }
        });
    }, { passive: true });
}

// ─── Init ──────────────────────────────────────────────────────────────────────
async function init() {
    try {
        await loadData();

        const heroCount = document.getElementById("hero-count");
        if (heroCount) heroCount.textContent = alumni.length.toLocaleString();
        if (window.initHero) initHero(alumni);
        if (window.initFounderTimeline) initFounderTimeline(alumni);
        initPaletteToggle();
        initScrollTracking();

        initChartCanvas(document.getElementById("chart"));

        document.getElementById("subtitle").textContent =
            `Explore the career paths of ${alumni.length.toLocaleString()} Centerlings — ask anything`;

        // Go straight to Explore mode (no static tabs)
        activeView = VIEWS.find(v => v.id === "explore") || VIEWS[VIEWS.length - 1];
        document.getElementById("explore-ui").classList.add("active");
        activateExplore();

        // Check for shared graph URL (?q=...)
        loadSharedQuery();

        document.getElementById("query-btn").addEventListener("click", handleQuery);
        document.getElementById("query-input").addEventListener("focus", () => {
            stopTypewriter();
        });
        document.getElementById("query-input").addEventListener("keydown", e => {
            if (e.key === "Enter") handleQuery();
        });
        document.getElementById("query-input").addEventListener("input", e => {
            renderSuggestions(e.target.value.trim());
        });

        let resizeTimer;
        window.addEventListener("resize", () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (activeView.id === "explore" && lastExploreResult) renderDynamic(lastExploreResult);
            }, 150);
        });

    } catch (err) {
        console.error(err);
        document.getElementById("chart").innerHTML = `
            <div class="message error">
                <strong>Error loading data:</strong> ${err.message}<br><br>
                Make sure you are running a local server:<br>
                <code>python server.py</code>
            </div>`;
    }
}

init();
