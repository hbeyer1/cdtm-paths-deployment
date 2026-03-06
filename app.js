// ═══════════════════════════════════════════════════════════════════════════════
// CDTM Alumni Pathways — D3 v7
// Each alumni = one individual line flowing through categorical columns.
// Lines are coloured by field of study and bundle visually where paths overlap.
// ═══════════════════════════════════════════════════════════════════════════════

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
    // Warm earth tones — terracotta, ochre, olive, clay
    earth: {
        name: "Earth",
        preview: ["#c2703e","#8b6d45","#5e7a54","#a3574e","#6b8f91"],
        colors: {
            "Engineering":"#5e7a54","Business & Economics":"#c2703e","Computer Science & AI":"#6b5b8a",
            "Technology Management":"#8b6d45","Information Systems & HCI":"#6b8f91",
            "Natural Sciences & Mathematics":"#7a9e5e","Humanities & Social Sciences":"#a3574e",
            "Design, Architecture & Media":"#b5617a","Medicine & Health Sciences":"#849c3b",
            "Consulting":"#4a7c8f","Finance & Banking":"#5e8a5e","Big Tech":"#7a6494",
            "Startup / Scale-up":"#c2703e","Corporate / Industry":"#6b6b60",
            "Entrepreneurship / Founder":"#a3574e","Academic / Research":"#8a6fa0",
            "Government / NGO / Non-profit":"#5a8a7a",
            "Graduate":"#4a7c8f","Doctorate":"#7a6494",
            "TU Munich":"#3d6b5e","LMU Munich":"#a3574e","Elite International":"#7a6494",
            "Other German Univ.":"#6b6b60","Other Intl. Univ.":"#9a9688",
            "Berkeley / MIT":"#5e7a54","Elite Research":"#6b8f91",
            "Unicorn Founder":"#c2953e","CDTM Founder":"#8b6d45","CDTM Employee":"#6b8f91",
            "CS & AI":"#6b5b8a","Business":"#c2703e",
        },
    },
    // Cool ocean — deep navy, teal, seafoam, coral accent
    ocean: {
        name: "Ocean",
        preview: ["#1e6091","#2a9d8f","#e76f51","#264653","#e9c46a"],
        colors: {
            "Engineering":"#2a9d8f","Business & Economics":"#e76f51","Computer Science & AI":"#264653",
            "Technology Management":"#e9c46a","Information Systems & HCI":"#1e6091",
            "Natural Sciences & Mathematics":"#76b5a0","Humanities & Social Sciences":"#c96d4f",
            "Design, Architecture & Media":"#d4786e","Medicine & Health Sciences":"#8ab17d",
            "Consulting":"#1e6091","Finance & Banking":"#2a9d8f","Big Tech":"#264653",
            "Startup / Scale-up":"#e76f51","Corporate / Industry":"#5a7a7a",
            "Entrepreneurship / Founder":"#c94030","Academic / Research":"#3a7ca5",
            "Government / NGO / Non-profit":"#76b5a0",
            "Graduate":"#1e6091","Doctorate":"#264653",
            "TU Munich":"#264653","LMU Munich":"#e76f51","Elite International":"#1e6091",
            "Other German Univ.":"#5a7a7a","Other Intl. Univ.":"#9aada8",
            "Berkeley / MIT":"#2a9d8f","Elite Research":"#1e6091",
            "Unicorn Founder":"#e9c46a","CDTM Founder":"#e76f51","CDTM Employee":"#2a9d8f",
            "CS & AI":"#264653","Business":"#e76f51",
        },
    },
    // Berry & sage — muted plum, dusty rose, sage green, warm grey
    berry: {
        name: "Berry",
        preview: ["#7b4f7b","#c07878","#6a8e6a","#b8926a","#5b7b8a"],
        colors: {
            "Engineering":"#6a8e6a","Business & Economics":"#c07878","Computer Science & AI":"#7b4f7b",
            "Technology Management":"#b8926a","Information Systems & HCI":"#5b7b8a",
            "Natural Sciences & Mathematics":"#7da07d","Humanities & Social Sciences":"#c98a6a",
            "Design, Architecture & Media":"#b56a85","Medicine & Health Sciences":"#8aaa60",
            "Consulting":"#5b7b8a","Finance & Banking":"#6a8e6a","Big Tech":"#7b4f7b",
            "Startup / Scale-up":"#c07878","Corporate / Industry":"#7a7a72",
            "Entrepreneurship / Founder":"#a85555","Academic / Research":"#8a6aaa",
            "Government / NGO / Non-profit":"#5a8a7a",
            "Graduate":"#5b7b8a","Doctorate":"#7b4f7b",
            "TU Munich":"#4a6a7a","LMU Munich":"#a85555","Elite International":"#7b4f7b",
            "Other German Univ.":"#7a7a72","Other Intl. Univ.":"#a8a498",
            "Berkeley / MIT":"#6a8e6a","Elite Research":"#5b7b8a",
            "Unicorn Founder":"#b8926a","CDTM Founder":"#c07878","CDTM Employee":"#5b7b8a",
            "CS & AI":"#7b4f7b","Business":"#c07878",
        },
    },
    // Original (Tailwind-based)
    original: {
        name: "Vivid",
        preview: ["#3b82f6","#ef4444","#7c3aed","#d97706","#059669"],
        colors: {
            "Engineering":"#3b82f6","Business & Economics":"#ef4444","Computer Science & AI":"#7c3aed",
            "Technology Management":"#d97706","Information Systems & HCI":"#0891b2",
            "Natural Sciences & Mathematics":"#059669","Humanities & Social Sciences":"#ea580c",
            "Design, Architecture & Media":"#db2777","Medicine & Health Sciences":"#65a30d",
            "Consulting":"#0284c7","Finance & Banking":"#16a34a","Big Tech":"#6d28d9",
            "Startup / Scale-up":"#ea580c","Corporate / Industry":"#475569",
            "Entrepreneurship / Founder":"#dc2626","Academic / Research":"#9333ea",
            "Government / NGO / Non-profit":"#0d9488",
            "Graduate":"#2563eb","Doctorate":"#7c3aed",
            "TU Munich":"#1d4ed8","LMU Munich":"#b91c1c","Elite International":"#7c3aed",
            "Other German Univ.":"#475569","Other Intl. Univ.":"#94a3b8",
            "Berkeley / MIT":"#059669","Elite Research":"#0891b2",
            "Unicorn Founder":"#f59e0b","CDTM Founder":"#d97706","CDTM Employee":"#0891b2",
            "CS & AI":"#7c3aed","Business":"#ef4444",
        },
    },
};

// Muted structural values shared across all palettes
const MUTED = {
    "Other":"#94a3b8","Unknown":"#cbd5e1","No further degree":"#cbd5e1",
    "None":"#d4cfc6","Other Fields":"#94a3b8","Other University":"#94a3b8",
};

let activePaletteName = "earth";
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

function saveToCache(query, data) {
    let cache = getCache().filter(e => e.query.toLowerCase() !== query.toLowerCase());
    cache.unshift({ query, data });
    if (cache.length > CACHE_MAX) cache = cache.slice(0, CACHE_MAX);
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache.slice(0, Math.floor(CACHE_MAX / 2)))); }
        catch {}
    }
}

function getFromCache(query) {
    return getCache().find(e => e.query.toLowerCase() === query.toLowerCase()) || null;
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

function renderSuggestions(currentInput) {
    const el = document.getElementById("suggestions");
    if (!el) return;
    const cache = getCache();
    if (cache.length === 0) { el.innerHTML = ""; return; }

    const scored = cache.map(e => ({ ...e, score: querySimilarity(e.query, currentInput) }));
    const filtered = currentInput.trim()
        ? scored.filter(e => e.score > 0).sort((a, b) => b.score - a.score)
        : scored;

    el.innerHTML = filtered.slice(0, 6).map(e =>
        `<button class="suggestion-chip" data-query="${e.query.replace(/"/g, "&quot;")}" title="${e.query.replace(/"/g, "&quot;")}">${e.query}</button>`
    ).join("");

    el.querySelectorAll(".suggestion-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            document.getElementById("query-input").value = chip.dataset.query;
            handleQuery();
        });
    });
}

// ─── Model selection ────────────────────────────────────────────────────────────
let selectedModel = "claude-sonnet-4-6";

function initModelToggle() {
    document.querySelectorAll(".model-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            document.querySelectorAll(".model-pill").forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            selectedModel = pill.dataset.model;
        });
    });
}

// ─── Explore tab ────────────────────────────────────────────────────────────────
function activateExplore() {
    document.getElementById("chart").innerHTML =
        `<div class="message" style="color:var(--ink-3);font-size:13px">Type a question above and press <strong style="font-weight:500;color:var(--ink-2)">Explore →</strong></div>`;
    document.getElementById("selected-bar").style.display = "none";
    document.getElementById("stats").innerHTML = "";
    activePath = null;
    renderSuggestions("");
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

    // Check cache first (keyed by query + model + detail_mode)
    const detailMode = document.getElementById("detail-mode-toggle")?.checked || false;
    const cacheKey = `${selectedModel}::${detailMode}::${query}`;
    const cached = getFromCache(cacheKey);
    if (cached) {
        aTitle.textContent = cached.data.title || "Results";
        aText.textContent  = cached.data.analysis || "";
        aBox.classList.add("active");
        lastExploreResult = cached.data;
        renderDynamic(cached.data);
        renderDebugPanel(cached.data.debug);
        renderSuggestions(query);
        if (cached.data.trace_id) {
            setTimeout(() => saveTraceScreenshot(cached.data.trace_id), 500);
        }
        return;
    }

    btn.disabled = true;
    const MODEL_LABELS = {"gpt-4.1":"GPT-4.1","gpt-5-mini":"GPT-5 mini","gpt-5.2":"GPT-5.2"};
    const modelLabel = MODEL_LABELS[selectedModel]
        || (selectedModel.includes("haiku") ? "Haiku" : "Sonnet");
    const providerName = selectedModel.startsWith("gpt") ? "OpenAI" : "Claude";
    document.getElementById("query-loading-text").textContent =
        `Asking ${providerName} ${modelLabel} to analyze the alumni…`;
    loading.classList.add("active");
    aBox.classList.remove("active");
    document.getElementById("chart").innerHTML =
        `<div class="message">Analyzing ${alumni.length.toLocaleString()} alumni…</div>`;
    document.getElementById("stats").innerHTML = "";
    document.getElementById("selected-bar").style.display = "none";
    document.getElementById("agent-debug").style.display = "none";
    activePath = null;

    try {
        const res = await fetch("/api/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query,
                model: selectedModel,
                detail_mode: document.getElementById("detail-mode-toggle")?.checked || false,
            }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        aTitle.textContent = data.title || "Results";
        aText.textContent  = data.analysis || "";
        aBox.classList.add("active");
        lastExploreResult = data;
        saveToCache(cacheKey, data);
        renderDynamic(data);
        renderDebugPanel(data.debug);
        renderSuggestions(query);
        // Capture chart screenshot for the trace
        if (data.trace_id) {
            setTimeout(() => saveTraceScreenshot(data.trace_id), 500);
        }
    } catch (err) {
        document.getElementById("chart").innerHTML =
            `<div class="message error"><strong>Error:</strong> ${err.message}</div>`;
    } finally {
        btn.disabled = false;
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
    const EXPLORE_COLORS = ["#3b82f6","#ef4444","#7c3aed","#d97706","#0891b2","#059669","#ea580c","#db2777","#65a30d","#0284c7","#9333ea","#dc2626"];
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
    const hitG = svg.append("g").attr("class", "node-hits");
    const defaultLw = Math.max(1.2, Math.min(3, 80 / rows.length));
    const hoverLw = Math.max(2.5, Math.min(4, 120 / rows.length));
    const dimLw = Math.max(1, Math.min(2.5, 60 / rows.length));
    columns.forEach((col, ci) => {
        const cx = MARGIN.left + xs[ci];
        col.nodes.forEach(node => {
            const cy = nodeCenterY[ci][node.value];
            const r = nodeRadius(node.count);
            hitG.append("circle")
                .attr("cx", cx).attr("cy", cy).attr("r", r + 4)
                .attr("fill", "transparent")
                .attr("stroke", "none")
                .style("cursor", "pointer")
                .on("mouseenter", function (evt) {
                    const matchVal = node.value;
                    const matchCi = ci;
                    allPaths
                        .attr("opacity", d => d.vals[matchCi] === matchVal ? 1 : 0.08)
                        .attr("stroke-width", d => d.vals[matchCi] === matchVal ? hoverLw : dimLw);
                    allPaths.filter(d => d.vals[matchCi] === matchVal).raise();
                    const names = rows.filter(r => r.vals[matchCi] === matchVal).map(r => r.person.full_name || "—");
                    const preview = names.length <= 5 ? names.join(", ") : names.slice(0, 5).join(", ") + ` + ${names.length - 5} more`;
                    showTip(
                        `<strong>${node.value}</strong> · ${node.count} ${node.count === 1 ? "person" : "people"}<br>` +
                        `<span style="opacity:0.7;font-size:11px">${preview}</span>`,
                        evt
                    );
                })
                .on("mousemove", (evt) => moveTip(evt))
                .on("mouseleave", function () {
                    allPaths.attr("opacity", 0.55).attr("stroke-width", defaultLw);
                    hideTip();
                });
        });
    });

    document.getElementById("stats").innerHTML =
        `<strong>${rows.length.toLocaleString()}</strong> alumni match · ` +
        `<span style="color:#a8a79f">hover a path or node to explore · click to open LinkedIn</span>`;
}

// ─── Agent debug panel ──────────────────────────────────────────────────────
function renderDebugPanel(debug) {
    const el = document.getElementById("agent-debug");
    if (!el || !debug || !debug.turns || debug.turns.length === 0) {
        if (el) el.style.display = "none";
        return;
    }
    el.style.display = "block";
    const totalTok = (debug.total_input_tokens + debug.total_output_tokens).toLocaleString();
    const costStr = debug.cost_usd < 0.01
        ? `$${(debug.cost_usd * 100).toFixed(2)}¢`
        : `$${debug.cost_usd.toFixed(3)}`;

    const totalToolCalls = debug.turns.reduce((s, t) => s + (t.tool_calls || []).length, 0);

    let turnsHtml = debug.turns.map(t => {
        const toolsHtml = (t.tool_calls || []).map(tc => {
            const argsStr = JSON.stringify(tc.input).slice(0, 80);
            const countStr = tc.result_count != null ? `${tc.result_count} results` : "";
            return `<div class="agent-tool-call">
                <span class="agent-tool-name">${tc.tool}</span>
                <span class="agent-tool-args">${argsStr}</span>
                <span class="agent-tool-count">${countStr}</span>
            </div>`;
        }).join("");
        return `<div class="agent-turn">
            <div class="agent-turn-head">
                <span>Turn ${t.turn}${t.tool_calls.length ? ` · ${t.tool_calls.length} tool call${t.tool_calls.length > 1 ? "s" : ""}` : " · final response"}</span>
                <span class="agent-turn-tokens">${t.input_tokens.toLocaleString()} in / ${t.output_tokens.toLocaleString()} out</span>
            </div>
            ${toolsHtml}
        </div>`;
    }).join("");

    el.innerHTML = `
        <div class="agent-debug-header">
            <span class="agent-debug-title">Agent Activity</span>
            <div class="agent-debug-summary">
                <span><strong>${debug.turns.length}</strong> turns</span>
                <span><strong>${totalToolCalls}</strong> tool calls</span>
                <span><strong>${totalTok}</strong> tokens</span>
                <span><strong>${costStr}</strong></span>
                <span>${debug.detail_mode ? "detail mode" : "lite mode"}</span>
            </div>
        </div>
        <div class="agent-debug-turns">${turnsHtml}</div>`;
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

        initChartCanvas(document.getElementById("chart"));

        document.getElementById("subtitle").textContent =
            `${alumni.length.toLocaleString()} CDTM alumni · hover to explore · click any path to open LinkedIn`;

        // Go straight to Explore mode (no static tabs)
        activeView = VIEWS.find(v => v.id === "explore") || VIEWS[VIEWS.length - 1];
        document.getElementById("explore-ui").classList.add("active");
        activateExplore();

        initModelToggle();
        document.getElementById("query-btn").addEventListener("click", handleQuery);
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
