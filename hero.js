// ═══════════════════════════════════════════════════════════════════════════════
// hero.js — Scroll-driven particle hero section
// Exposes window.initHero(alumni). Called from app.js after loadData().
// Reads globals from app.js: MARGIN, CHART_H, PALETTE, VIEWS, buildLayout, OVAL_RX
//
// Each person gets ONE DOT PER COLUMN (3 for Education view, N≈900 total).
// Scroll animation: logo → zoom in → education chart.
// In the chart phase, bezier lines connect each person's column dots.
// Ambassadors: a person "flies out" from the logo, their headshot rendered
//   as a mosaic of colored dots that bloom from the logo dot.
// ═══════════════════════════════════════════════════════════════════════════════

(function () {

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const clamp01    = t => Math.max(0, Math.min(1, t));
  const lerp       = (a, b, t) => a + (b - a) * t;
  const easeInOut  = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
  const easeOutBack = t => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };

  function rand(s) {
    const x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function hexToRgb(hex) {
    const n = parseInt((hex || "#94a3b8").replace("#", ""), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  // ── Headshot dot-portrait system ──────────────────────────────────────────────
  // headshotMap: stem → filename  (e.g. "Henri_Beyer" → "Henri_Beyer.jpg")
  // headshots:   fullName → { dots: [], state: 'loading'|'ready'|'failed' }
  const headshotMap = {};
  const headshots   = {};

  // Fetch manifest immediately (tiny JSON, loads fast)
  fetch('assets/people-headshots/no-background/manifest.json')
    .then(r => r.json())
    .then(list => {
      list.forEach(f => {
        const stem = f.replace(/\.[^.]+$/, '');
        headshotMap[stem] = f;
      });
    })
    .catch(() => {});

  // Portrait constants
  const PORTRAIT_R   = 50;  // canvas px radius of final portrait
  const SAMPLE_SIZE  = 120; // offscreen canvas size for sampling
  const SAMPLE_PITCH = 0.32; // ~75 000 dots before bg filtering (≈3× previous density)
  const DOT_R_FACE   = 0.34; // rendered dot radius

  // Sample a loaded Image into an array of dot descriptors.
  // ox, oy: offsets from portrait center (canvas px).
  // Each dot gets organic jitter + per-dot wiggle params so they move like logo dots.
  function sampleHeadshot(img) {
    const off  = document.createElement('canvas');
    off.width  = off.height = SAMPLE_SIZE;
    const o2   = off.getContext('2d');
    o2.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

    const { data } = o2.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const half  = SAMPLE_SIZE / 2;
    const dots  = [];

    for (let py = SAMPLE_PITCH / 2; py < SAMPLE_SIZE; py += SAMPLE_PITCH) {
      for (let px = SAMPLE_PITCH / 2; px < SAMPLE_SIZE; px += SAMPLE_PITCH) {
        // Organic jitter: shift each sample point randomly within its cell
        const jx = (Math.random() - 0.5) * SAMPLE_PITCH * 0.85;
        const jy = (Math.random() - 0.5) * SAMPLE_PITCH * 0.85;
        const sx = px + jx;
        const sy = py + jy;

        const dx = sx - half;
        const dy = sy - half;
        // No hard circular clip — the person's alpha channel defines the silhouette.
        // We still compute dx/dy for the canvas-space offset mapping below.

        const ix = Math.min(SAMPLE_SIZE - 1, Math.max(0, Math.round(sx)));
        const iy = Math.min(SAMPLE_SIZE - 1, Math.max(0, Math.round(sy)));
        const i  = (iy * SAMPLE_SIZE + ix) * 4;
        // Images have transparent backgrounds — skip low-alpha pixels (including
        // fringe artefacts left by background-removal tools).
        if (data[i + 3] < 40) continue;

        dots.push({
          ox: (dx / half) * PORTRAIT_R,
          oy: (dy / half) * PORTRAIT_R,
          r: data[i], g: data[i + 1], b: data[i + 2],
          wigglePhaseX: Math.random() * Math.PI * 2,
          wigglePhaseY: Math.random() * Math.PI * 2,
          wiggleFreq:   0.45 + Math.random() * 1.05,
        });
      }
    }

    return dots;
  }

  // Request async load of a headshot by person's full name.
  // No-ops if already requested.
  function requestHeadshot(fullName) {
    if (headshots[fullName] !== undefined) return;

    const stem     = fullName.replace(/ /g, '_');
    const filename = headshotMap[stem];
    if (!filename) {
      headshots[fullName] = { dots: [], state: 'failed' };
      return;
    }

    headshots[fullName] = { dots: [], state: 'loading' };
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => { headshots[fullName] = { dots: sampleHeadshot(img), state: 'ready' }; };
    img.onerror = () => { headshots[fullName] = { dots: [], state: 'failed' };  };
    img.src = `assets/people-headshots/no-background/${filename}`;
  }

  // ── Logo sampling ─────────────────────────────────────────────────────────────
  async function sampleLogo(N, canvasW, canvasH) {
    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        const LOGO_PX = 560;
        const LOGO_H  = Math.round(LOGO_PX * img.height / img.width);

        const off = document.createElement("canvas");
        off.width  = LOGO_PX; off.height = LOGO_H;
        const c2  = off.getContext("2d");
        c2.fillStyle = "#ffffff";
        c2.fillRect(0, 0, LOGO_PX, LOGO_H);
        c2.drawImage(img, 0, 0, LOGO_PX, LOGO_H);

        const { data } = c2.getImageData(0, 0, LOGO_PX, LOGO_H);
        const dark = [];
        for (let py = 0; py < LOGO_H; py++) {
          for (let px = 0; px < LOGO_PX; px++) {
            const i = (py * LOGO_PX + px) * 4;
            if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) {
              dark.push({ sx: px, sy: py, r: data[i], g: data[i + 1], b: data[i + 2] });
            }
          }
        }

        const DISP_W = Math.min(1040, canvasW * 0.90);
        const DISP_H = DISP_W * LOGO_H / LOGO_PX;
        const ox = (canvasW - DISP_W) / 2;
        const oy = (canvasH - DISP_H) / 2 - 50;

        function toCanvas(p) {
          return {
            x: ox + (p.sx / LOGO_PX) * DISP_W,
            y: oy + (p.sy / LOGO_H)  * DISP_H,
            r: p.r, g: p.g, b: p.b,
          };
        }

        const mainPts = subsampleTo(dark, N).map(toCanvas);

        const pixW    = DISP_W / LOGO_PX;
        const pixH    = DISP_H / LOGO_H;
        const N_FILL  = Math.min(dark.length, N * 3);
        const fStride = dark.length / N_FILL;
        const fillPts = Array.from({ length: N_FILL }, (_, i) => {
          const src = dark[Math.floor((i * fStride + fStride * 0.5) % dark.length)];
          const s   = i * 41 + 7;
          return {
            x: ox + (src.sx / LOGO_PX) * DISP_W + (rand(s + 3) - 0.5) * pixW * 1.4,
            y: oy + (src.sy / LOGO_H)  * DISP_H + (rand(s + 4) - 0.5) * pixH * 1.4,
            r: src.r, g: src.g, b: src.b,
            wigglePhaseX: rand(s)     * Math.PI * 2,
            wigglePhaseY: rand(s + 1) * Math.PI * 2,
            wiggleFreq:   0.45 + rand(s + 2) * 1.05,
          };
        });

        resolve({ mainPts, fillPts });
      };

      img.onerror = () => {
        const cols = Math.ceil(Math.sqrt(N)), rows = Math.ceil(N / cols);
        const mainPts = Array.from({ length: N }, (_, i) => ({
          x: canvasW / 2 - 130 + (i % cols) / Math.max(1, cols - 1) * 260,
          y: canvasH / 2 -  40 + Math.floor(i / cols) / Math.max(1, rows - 1) * 80,
          r: 30, g: 60, b: 150,
        }));
        resolve({ mainPts, fillPts: [] });
      };

      img.src = "assets/cdtm-logo.png";
    });
  }

  function subsampleTo(arr, N) {
    if (arr.length <= N) return arr;
    const stride = arr.length / N;
    return Array.from({ length: N }, (_, i) => arr[Math.floor(i * stride)]);
  }

  const HERO_DOT = { r: 123, g: 167, b: 204 };
  let heroPathsData = null; // loaded from hero_paths.json
  let alumniPathsLookup = {}; // name → [step1, step2, ...] from alumni_paths.json
  let alumniPathsFull = {};   // name → full path string for spotlight matching

  // Load alumni_paths.json for compact path labels
  fetch('data/alumni_paths.json')
    .then(r => r.json())
    .then(data => {
      data.forEach(d => {
        alumniPathsFull[d.name] = d.path;
        const parts = d.path.split(' | ');
        const pathStr = parts.length >= 3 ? parts.slice(2).join(' | ') : parts[parts.length - 1];
        const steps = pathStr.split(' -> ').map(s => s.trim()).filter(s => s.length > 0);
        alumniPathsLookup[d.name] = steps;
      });
    })
    .catch(() => {});

  // ── Spotlight system ────────────────────────────────────────────────────────
  // Each spotlight highlights a cohort during the scroll zoom phase.
  // Matched by keyword in the full path string.
  // Verified unicorn founders (9 unicorns, 17 CDTM alumni founders)
  const UNICORN_FOUNDERS = new Set([
    'Hanno Renner', 'Roman Schumacher', 'Ignaz Forstmeier', 'Arseniy Vershinin', // Personio
    'Thomas Pischke',          // Trade Republic
    'Jonas Templestein',       // Monzo
    'Michael Wax', 'Erik Muttersbach',  // Forto
    'Julian Blessin',          // TIER Mobility
    'Konstantin Mehl', 'Manuel Thurner', 'Stefan Rothlehner', 'Sergei Krauze', // Foodora
    'Jonas Diezun',            // Razor Group
    'Fabian Gerlinghaus',      // Cellares
    'Philipp Roesch-Schlanderer', 'Florian Sauter', // EGYM
  ]);

  // Spotlights match against hero_paths.json values (same data the graph nodes use)
  // except Unicorn Founders which uses verified list
  // Stages: 0=STUDIED, 1=RESEARCH ABROAD, 2=STARTED IN, 3=MOVED TO, 4=ACHIEVEMENT
  const SPOTLIGHTS = [
    {
      label: "Unicorn Founders",
      matchValues: (_vals, name) => UNICORN_FOUNDERS.has(name),
      color: { r: 0, g: 101, b: 189 }, // CDTM blue
    },
    {
      label: "Founders",
      matchValues: vals => ['Founder', 'Serial Founder'].some(f =>
        vals[2] === f || vals[3] === f || vals[4] === f
      ),
      color: { r: 30, g: 77, b: 140 },
    },
    {
      label: "PhDs",
      matchValues: vals => vals[2] === 'PhD / Research' || vals[3] === 'PhD / Research',
      color: { r: 75, g: 130, b: 60 },
    },
    {
      label: "Professors",
      matchValues: vals => vals[4] === 'Professor',
      color: { r: 140, g: 80, b: 30 },
    },
  ];

  // Built once after particles are created — maps spotlight index → Set of group indices
  let spotlightGroups = []; // [Set, Set, Set, Set]
  let spotlightCounts = []; // [number, number, ...]

  function buildSpotlightSets(rows) {
    spotlightGroups = SPOTLIGHTS.map(() => new Set());
    spotlightCounts = SPOTLIGHTS.map(() => 0);
    for (let gi = 0; gi < rows.length; gi++) {
      const vals = rows[gi].vals;
      const name = rows[gi].person.full_name || '';
      for (let si = 0; si < SPOTLIGHTS.length; si++) {
        if (SPOTLIGHTS[si].matchValues(vals, name)) {
          spotlightGroups[si].add(gi);
          spotlightCounts[si]++;
        }
      }
    }
  }

  // ── Career path waypoint generation ─────────────────────────────────────────
  function buildCareerWaypoints(name, sx, sy, canvasW, canvasH) {
    const steps = alumniPathsLookup[name];
    if (!steps || steps.length === 0) return null;

    const centerX = canvasW / 2, centerY = canvasH / 2 - 50;
    let angle = Math.atan2(sy - centerY, sx - centerX) + (Math.random() - 0.5) * 0.8;

    const stepLen = Math.min(canvasW, canvasH) * 0.11;
    const waypoints = [{ x: sx, y: sy, label: null }];

    let cx = sx, cy = sy;
    for (let i = 0; i < steps.length; i++) {
      // Turn with alternating direction
      const turnSign = (i % 2 === 0 ? 1 : -1) * (0.7 + Math.random() * 0.6);
      angle += turnSign * (0.44 + Math.random() * 0.7);

      const len = stepLen * (0.8 + Math.random() * 0.5);
      cx += Math.cos(angle) * len;
      cy += Math.sin(angle) * len;

      // Keep on screen
      cx = Math.max(80, Math.min(canvasW - 80, cx));
      cy = Math.max(50, Math.min(canvasH - 50, cy));

      // Truncate label for display
      const label = steps[i].slice(0, 32) + (steps[i].length > 32 ? '…' : '');
      waypoints.push({ x: cx, y: cy, label });
    }

    return waypoints;
  }

  // ── Build hero chart from pre-computed hero_paths.json ──────────────────────
  function buildHeroChart(alumniData, canvasW, canvasH) {
    if (!heroPathsData) return null;

    const stages = heroPathsData.stages;  // ["BACKGROUND", "ABROAD", ...]
    const heroPaths = heroPathsData.paths; // [{name, values: [v|null, ...]}, ...]
    const nCols = stages.length;

    // Build name→alumni lookup for enrichment
    const byName = {};
    alumniData.forEach(p => { byName[p.full_name] = p; });

    // Build rows with nullable values
    const rows = heroPaths.map(hp => {
      const person = byName[hp.name] || { full_name: hp.name };
      return {
        person,
        vals: hp.values.map(v => v != null && v !== "" ? String(v) : null),
      };
    });

    const iW = canvasW - MARGIN.left - MARGIN.right;
    const iH = canvasH - MARGIN.top - MARGIN.bottom;
    const stageX = heroPathsData.stage_x || null;
    const colX = ci => stageX ? stageX[ci] * iW : (iW / (nCols - 1)) * ci;
    const xs = Array.from({ length: nCols }, (_, ci) => colX(ci) + OVAL_RX);

    // Use pre-computed node orders from barycenter heuristic (minimizes crossings)
    const nodeOrders = heroPathsData.node_orders || null;

    // Build nodes per column (skip nulls), respecting optimal order
    const columns = stages.map((label, ci) => {
      const counts = {};
      rows.forEach(r => {
        const v = r.vals[ci];
        if (v != null) counts[v] = (counts[v] || 0) + 1;
      });

      // Use pre-computed order if available, otherwise sort by count
      let orderedKeys;
      if (nodeOrders && nodeOrders[ci]) {
        const orderMap = {};
        nodeOrders[ci].forEach((v, i) => { orderMap[v] = i; });
        orderedKeys = Object.keys(counts).sort((a, b) => (orderMap[a] ?? 99) - (orderMap[b] ?? 99));
      } else {
        orderedKeys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
      }

      const nodes = orderedKeys
        .map(value => ({ colIndex: ci, value, count: counts[value], y: 0, height: 0 }));

      const totalPad = Math.max(0, nodes.length - 1) * NODE_GAP;
      const available = iH - totalPad;
      const total = nodes.reduce((s, n) => s + n.count, 0) || 1;
      let y = 0;
      nodes.forEach(n => { n.height = (n.count / total) * available; n.y = y; y += n.height + NODE_GAP; });

      return { col: { label, key: label }, index: ci, nodes };
    });

    // Sort rows to minimise crossings — use optimal node order
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

    // Node center Y + per-person Y within node
    const nodeCenterY = columns.map(col => {
      const m = {};
      col.nodes.forEach(n => { m[n.value] = n.y + n.height / 2; });
      return m;
    });

    const nodeMaps = columns.map(col => {
      const m = {};
      col.nodes.forEach(n => { m[n.value] = n; });
      return m;
    });

    return { rows, xs, columns, nodeCenterY, nodeMaps, nCols };
  }

  // ── Build particle list (skip-aware: one dot per non-null column) ─────────
  function buildParticles(logoPoints, chart, canvasW, canvasH) {
    const { rows, xs, columns, nodeCenterY, nodeMaps, nCols } = chart;
    const particles = [];
    const groups    = [];  // groups[ri] = [particleIdx, ...] for each person

    // Circle radius
    const maxCount = Math.max(...columns.flatMap(c => c.nodes.map(n => n.count)));
    const minR = 8, maxR = 68;
    const circleR = count => Math.max(minR, Math.min(maxR, Math.sqrt(count / maxCount) * maxR));

    // Color palette by first-column value — pastel blues matching CDTM logo
    const BUCKET_COLORS = ["#1b3a6b","#93c5fd","#2e6ca4","#bfdbfe","#1e4d8c","#a5c8ef","#3b7dc9","#d0e4f7","#14305a","#7ab3e8","#4889d0","#c4ddf5"];
    const firstColVals = [...new Set(rows.map(r => r.vals[0]))];
    const valColorHex = {};
    firstColVals.forEach((v, i) => {
      valColorHex[v] = BUCKET_COLORS[i % BUCKET_COLORS.length];
    });
    const valColorRgb = {};
    for (const [v, hex] of Object.entries(valColorHex)) {
      valColorRgb[v] = hexToRgb(hex);
    }

    let logoIdx = 0;

    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      const fc = valColorRgb[row.vals[0]] || HERO_DOT;
      const groupParticles = [];

      for (let ci = 0; ci < nCols; ci++) {
        const v = row.vals[ci];
        if (v == null) continue; // skip null columns

        const logo = logoPoints[Math.min(logoIdx++, logoPoints.length - 1)];
        let s = (ri * 53 + ci * 17) * 23 + 2;

        const node = nodeMaps[ci][v];
        const cy = nodeCenterY[ci][v] || 0;
        const r = node ? circleR(node.count) : 10;

        // Distribute inside circle
        const angle = rand(s++) * Math.PI * 2;
        const dist = Math.sqrt(rand(s++)) * r * 0.85;
        const jx = Math.cos(angle) * dist;
        const jy = Math.sin(angle) * dist;

        const graphX = MARGIN.left + xs[ci] + jx;
        const graphY = MARGIN.top + cy + jy;

        const radiusScale  = 0.78 + rand(s++) * 0.44;
        const alpha        = 0.70 + rand(s++) * 0.24;
        const wigglePhaseX = rand(s++) * Math.PI * 2;
        const wigglePhaseY = rand(s++) * Math.PI * 2;
        const wiggleFreq   = 0.45 + rand(s++) * 1.05;

        const pIdx = particles.length;
        particles.push({
          logoX: logo.x, logoY: logo.y,
          logoR: logo.r, logoG: logo.g, logoB: logo.b,
          graphX, graphY,
          fieldR: fc.r, fieldG: fc.g, fieldB: fc.b,
          radiusScale, alpha,
          wigglePhaseX, wigglePhaseY, wiggleFreq,
          personIdx: ri, colIdx: ci,
          name:     row.person.full_name || '',
          headline: (row.person.headline || '').slice(0, 60),
          linkedin: row.person.linkedin_url || row.person.linkedin || '',
          recency:  (row.person.career || []).reduce((m, c) => Math.max(m, c.start_year || 0), 0),
        });
        groupParticles.push(pIdx);
      }

      groups.push(groupParticles);
    }

    // Weighted pool for ambassador selection
    const weightedPool = [];
    for (let ri = 0; ri < rows.length; ri++) {
      if (groups[ri].length === 0) continue;
      const yr = particles[groups[ri][0]].recency;
      const w = yr >= 2025 ? 6 : yr >= 2024 ? 4 : yr >= 2023 ? 2 : 1;
      for (let i = 0; i < w; i++) weightedPool.push(ri);
    }

    return { particles, groups, weightedPool };
  }

  // ── Main entry point ──────────────────────────────────────────────────────────
  window.initHero = async function (alumniData) {
    const heroSection = document.getElementById("hero-section");
    const canvas      = document.getElementById("particle-canvas");
    if (!heroSection || !canvas) return;

    const ctx = canvas.getContext("2d");
    let particles = [], groups = [], logoFill = [], weightedPool = [], headshotPool = [];
    let heroChart = null;
    let storyHeroIdx = -1;
    let storyPathIdxs = [];
    let storyAdjacentIdxs = [];
    let storyBreakoutPts = [];
    let W = 0, H = 0;

    const MAX_AMB    = 4;
    const AMB_DUR    = 22000;
    const AMB_SPAWN  = 2800;
    let   ambList    = [];
    let   ambSpawnMs = Date.now() + 2800;

    // Build headshotPool: a filtered subset of weightedPool for people who have headshots
    function rebuildHeadshotPool() {
      headshotPool = weightedPool.filter(ri => {
        const pIdxs = groups[ri];
        if (!pIdxs || pIdxs.length === 0) return false;
        const name = (particles[pIdxs[0]] || {}).name || '';
        return !!headshotMap[name.replace(/ /g, '_')];
      });
    }

    async function setup() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width  = W;
      canvas.height = H;

      // Load hero_paths.json if not yet loaded
      if (!heroPathsData) {
        try {
          const res = await fetch("data/hero_paths.json");
          heroPathsData = await res.json();
        } catch (e) {
          console.warn("Failed to load hero_paths.json:", e);
          return;
        }
      }

      const chart = buildHeroChart(alumniData, W, H);
      if (!chart) return;
      heroChart    = chart;
      // Total dots = sum of non-null values across all people
      const N     = chart.rows.reduce((s, r) => s + r.vals.filter(v => v != null).length, 0);

      const { mainPts, fillPts } = await sampleLogo(N, W, H);
      const built = buildParticles(mainPts, chart, W, H);
      particles    = built.particles;
      groups       = built.groups;
      weightedPool = built.weightedPool;
      logoFill     = fillPts;
      ambList      = [];

      buildSpotlightSets(chart.rows);

      // Select storytelling hero dot and build a path chain through nearby dots
      if (particles.length > 0) {
        const cx = W / 2, cy = H / 2 - 50;
        let bestD = Infinity;
        for (let i = 0; i < particles.length; i++) {
          const d = Math.hypot(particles[i].logoX - cx, particles[i].logoY - cy);
          if (d < bestD) { bestD = d; storyHeroIdx = i; }
        }

        // Build a chain of ~10 dots forming a smooth path
        storyPathIdxs = [storyHeroIdx];
        const pathUsed = new Set([storyHeroIdx]);
        let curr = storyHeroIdx;
        let angle = -Math.PI / 5; // start going upper-right
        for (let step = 0; step < 9; step++) {
          const cp = particles[curr];
          let bestI = -1, bestScore = Infinity;
          for (let i = 0; i < particles.length; i++) {
            if (pathUsed.has(i)) continue;
            const dx = particles[i].logoX - cp.logoX;
            const dy = particles[i].logoY - cp.logoY;
            const dist = Math.hypot(dx, dy);
            const dotAngle = Math.atan2(dy, dx);
            let angleDiff = dotAngle - angle;
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
            if (Math.abs(angleDiff) > Math.PI * 0.6) continue;
            const score = dist * (1 + Math.abs(angleDiff) * 0.5);
            if (score < bestScore) { bestScore = score; bestI = i; }
          }
          if (bestI < 0) break;
          storyPathIdxs.push(bestI);
          pathUsed.add(bestI);
          const np = particles[bestI];
          angle = Math.atan2(np.logoY - cp.logoY, np.logoX - cp.logoX) + 0.25;
          curr = bestI;
        }

        // Find adjacent dots: close to any path dot but not on the path
        const adjCandidates = [];
        for (let i = 0; i < particles.length; i++) {
          if (pathUsed.has(i)) continue;
          let minD = Infinity;
          for (const pi of storyPathIdxs) {
            const d = Math.hypot(particles[i].logoX - particles[pi].logoX, particles[i].logoY - particles[pi].logoY);
            if (d < minD) minD = d;
          }
          adjCandidates.push({ i, d: minD });
        }
        adjCandidates.sort((a, b) => a.d - b.d);
        storyAdjacentIdxs = adjCandidates.slice(0, 12).map(c => c.i);

        // Compute breakout waypoints: dramatic sweep away from the logo
        if (storyPathIdxs.length >= 2) {
          const lastP = particles[storyPathIdxs[storyPathIdxs.length - 1]];
          const prevP = particles[storyPathIdxs[storyPathIdxs.length - 2]];
          let breakAngle = Math.atan2(lastP.logoY - prevP.logoY, lastP.logoX - prevP.logoX);
          let bx = lastP.logoX, by = lastP.logoY;
          storyBreakoutPts = [];
          // Sharp initial turn then straighten out
          breakAngle += 1.2 + rand(storyHeroIdx * 7) * 0.4; // big initial kink
          for (let i = 0; i < 6; i++) {
            breakAngle += 0.08 + rand(storyHeroIdx * 7 + i + 1) * 0.1;
            const stepLen = 18 + i * 12;
            bx += Math.cos(breakAngle) * stepLen;
            by += Math.sin(breakAngle) * stepLen;
            storyBreakoutPts.push({ x: bx, y: by });
          }
        }
      }

      rebuildHeadshotPool();

      // Preload headshots for the top ~15 most-weighted people
      const seen = new Set();
      for (const ri of weightedPool) {
        if (seen.size >= 15) break;
        const pIdxs = groups[ri];
        if (!pIdxs || pIdxs.length === 0) continue;
        const name = (particles[pIdxs[0]] || {}).name || '';
        if (name && !seen.has(name)) { seen.add(name); requestHeadshot(name); }
      }
    }

    function getProgress() {
      const heroTop     = heroSection.getBoundingClientRect().top + window.scrollY;
      const totalScroll = heroSection.offsetHeight - H;
      return clamp01((window.scrollY - heroTop) / totalScroll);
    }

    function draw() {
      const progress  = getProgress();
      // Adjusted phases for 750vh hero:
      // 0–8%: logo, 8–25%: zoom, 25–50%: storytelling, 50–65%: chart, 67–90%: spotlights
      const t_zoom  = easeInOut(clamp01((progress - 0.08) / 0.17));
      const t_graph = easeInOut(clamp01((progress - 0.50) / 0.15));
      const wiggleAmp = 3.2 * Math.max(0.25, 1 - t_graph * 0.6);
      const lineAlpha = clamp01((progress - 0.57) / 0.08);
      const now       = Date.now() * 0.001;

      // ── Storytelling state ─────────────────────────────────────────────
      const STORY_START = 0.25, STORY_END = 0.50;
      const STORY_TEXTS = [
        "Your life is a series of decisions",
        "The people around you can completely change\nthe trajectory of your life",
        "every once in a while something comes along\nthat changes your trajectory completely",
        "CDTM does this for 25 people every semester",
        "This is what the result of this looks like",
      ];
      const N_BEATS = STORY_TEXTS.length;
      const BEAT_DUR = (STORY_END - STORY_START) / N_BEATS;
      const BEAT_FADE = 0.01;
      let storyBeat = -1, storyBeatAlpha = 0;
      let storyActive = false;
      let storyPathMap = null;   // particle ref → path index
      let storyAdjMap = null;    // particle ref → adj index
      let pathDrawProgress = 0;  // 0–1: how much of the curve is drawn
      let adjHighlightCount = 0; // how many adjacent dots are lit

      if (progress >= STORY_START && progress < STORY_END && storyHeroIdx >= 0) {
        storyActive = true;
        const local = progress - STORY_START;
        storyBeat = Math.min(N_BEATS - 1, Math.floor(local / BEAT_DUR));
        const beatLocal = local - storyBeat * BEAT_DUR;
        if (beatLocal < BEAT_FADE) storyBeatAlpha = beatLocal / BEAT_FADE;
        else if (beatLocal > BEAT_DUR - BEAT_FADE) storyBeatAlpha = (BEAT_DUR - beatLocal) / BEAT_FADE;
        else storyBeatAlpha = 1;
        storyBeatAlpha = clamp01(storyBeatAlpha);

        storyPathMap = new Map();
        storyPathIdxs.forEach((pi, i) => storyPathMap.set(particles[pi], i));
        storyAdjMap = new Map();
        storyAdjacentIdxs.forEach((ai, i) => storyAdjMap.set(particles[ai], i));

        // Path draws progressively during beat 0
        pathDrawProgress = storyBeat === 0
          ? clamp01((progress - STORY_START) / (BEAT_DUR * 0.75))
          : 1;

        // Adjacent dots light up sequentially during beat 1
        const adjT = storyBeat >= 1
          ? clamp01((progress - (STORY_START + BEAT_DUR)) / (BEAT_DUR * 0.7))
          : 0;
        adjHighlightCount = Math.floor(adjT * storyAdjacentIdxs.length);
      }

      // ── Spotlight state ────────────────────────────────────────────────
      // 4 spotlights after graph is formed, spread across scroll 62%–90%
      const SPOT_START = 0.70, SPOT_EACH = 0.05;
      const SPOT_FADE_IN = 0.015, SPOT_HOLD = 0.04, SPOT_FADE_OUT = 0.015;
      let activeSpotlight = -1;
      let spotlightAlpha = 0;
      for (let si = 0; si < SPOTLIGHTS.length; si++) {
        const start = SPOT_START + si * SPOT_EACH;
        const end = start + SPOT_FADE_IN + SPOT_HOLD + SPOT_FADE_OUT;
        if (progress >= start && progress <= end) {
          activeSpotlight = si;
          const local = progress - start;
          if (local < SPOT_FADE_IN) {
            spotlightAlpha = local / SPOT_FADE_IN;
          } else if (local < SPOT_FADE_IN + SPOT_HOLD) {
            spotlightAlpha = 1;
          } else {
            spotlightAlpha = 1 - (local - SPOT_FADE_IN - SPOT_HOLD) / SPOT_FADE_OUT;
          }
          spotlightAlpha = clamp01(spotlightAlpha);
          break;
        }
      }

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#ede8df";
      ctx.fillRect(0, 0, W, H);

      const zoomCX = W / 2;
      const zoomCY = H / 2 - 50;
      const zoomFactor = 1 + t_zoom * 9;

      function ppos(p) {
        const zoomedX = zoomCX + (p.logoX - zoomCX) * zoomFactor;
        const zoomedY = zoomCY + (p.logoY - zoomCY) * zoomFactor;
        const wx = Math.sin(now * p.wiggleFreq       + p.wigglePhaseX) * wiggleAmp;
        const wy = Math.sin(now * p.wiggleFreq * 1.3 + p.wigglePhaseY) * wiggleAmp;
        return {
          x: lerp(zoomedX, p.graphX, t_graph) + wx,
          y: lerp(zoomedY, p.graphY, t_graph) + wy,
        };
      }

      const BASE_R = 2.1;

      // ── Logo fill dots (fade out as graph forms) ─────────────────────────
      const storyFillDim = storyActive ? lerp(1, 0.18, clamp01((progress - STORY_START) / 0.025)) : 1;
      const fillAlpha = clamp01(1 - t_graph * 3) * storyFillDim;
      if (fillAlpha > 0) {
        for (const p of logoFill) {
          const wx = Math.sin(now * p.wiggleFreq       + p.wigglePhaseX) * wiggleAmp;
          const wy = Math.sin(now * p.wiggleFreq * 1.3 + p.wigglePhaseY) * wiggleAmp;
          const x  = zoomCX + (p.x - zoomCX) * zoomFactor + wx;
          const y  = zoomCY + (p.y - zoomCY) * zoomFactor + wy;
          if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
          ctx.beginPath();
          ctx.arc(x, y, BASE_R, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${(0.72 * fillAlpha).toFixed(2)})`;
          ctx.fill();
        }
      }

      // ── Ambassadors: spawn + cull ─────────────────────────────────────────
      const nowMs = Date.now();
      if (progress > 0.07) { ambList = []; }
      ambList = ambList.filter(a => (nowMs - a.t0) < AMB_DUR + 2000);

      if (progress < 0.06 && ambList.length < MAX_AMB && nowMs >= ambSpawnMs && weightedPool.length > 0) {
        const ri   = weightedPool[Math.floor(Math.random() * weightedPool.length)];
        const p    = particles[groups[ri][0]];

        if (p && !ambList.some(a => a.p === p)) {
          const sx = zoomCX + (p.logoX - zoomCX) * zoomFactor;
          const sy = zoomCY + (p.logoY - zoomCY) * zoomFactor;

          // Build career waypoints for path tracing
          const waypoints = buildCareerWaypoints(p.name, sx, sy, W, H);
          if (waypoints && waypoints.length >= 2) {
            // Compute total path length for even timing
            let totalLen = 0;
            for (let i = 1; i < waypoints.length; i++) {
              totalLen += Math.hypot(waypoints[i].x - waypoints[i-1].x, waypoints[i].y - waypoints[i-1].y);
            }
            ambList.push({ p, sx, sy, waypoints, totalLen, trail: [], t0: nowMs });
          } else {
            // Fallback: straight line (no career data)
            const baseAngle = Math.atan2(sy - zoomCY, sx - zoomCX);
            const angle     = baseAngle + (Math.random() - 0.5) * 1.0;
            const farDist   = Math.hypot(W, H) * 0.65 + 150;
            const wp = [
              { x: sx, y: sy, label: null },
              { x: sx + Math.cos(angle) * farDist, y: sy + Math.sin(angle) * farDist, label: null },
            ];
            ambList.push({ p, sx, sy, waypoints: wp, totalLen: farDist, trail: [], t0: nowMs });
          }
          ambSpawnMs = nowMs + AMB_SPAWN + Math.random() * 1200;
          requestHeadshot(p.name);
        }
      }

      // ── Bezier lines connecting each person's column dots ─────────────────
      lastLinePositions = [];
      if (lineAlpha > 0) {
        function drawBezierPath(pts) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            const mx = (pts[i - 1].x + pts[i].x) / 2;
            ctx.bezierCurveTo(mx, pts[i - 1].y, mx, pts[i].y, pts[i].x, pts[i].y);
          }
        }

        for (let gi = 0; gi < groups.length; gi++) {
          const pIdxs = groups[gi];
          if (pIdxs.length < 2) continue;
          const p0 = particles[pIdxs[0]];
          const pts = pIdxs.map(idx => ppos(particles[idx]));

          // Store sampled points for hit testing
          const sampled = [pts[0]];
          for (let i = 1; i < pts.length; i++) {
            const mx = (pts[i - 1].x + pts[i].x) / 2;
            for (let t = 0.25; t <= 1; t += 0.25) {
              const tt = t, u = 1 - tt;
              const x = u*u*u*pts[i-1].x + 3*u*u*tt*mx + 3*u*tt*tt*mx + tt*tt*tt*pts[i].x;
              const cy1 = pts[i-1].y, cy2 = pts[i].y;
              const y = u*u*u*cy1 + 3*u*u*tt*cy1 + 3*u*tt*tt*cy2 + tt*tt*tt*cy2;
              sampled.push({x, y});
            }
          }
          lastLinePositions.push({ points: sampled, ri: gi });

          const isHovered = hoveredGroup === gi;
          const isNodeHovered = hoveredNodeGroups && hoveredNodeGroups.has(gi);
          const anyNodeHover = hoveredNodeGroups !== null;
          const dimmed = anyNodeHover && !isNodeHovered;
          let baseOp = isHovered ? 0.9 : isNodeHovered ? 0.85 : dimmed ? 0.06 : 0.30;
          let lw = isHovered ? 2.2 : isNodeHovered ? 1.8 : 0.7;

          // Spotlight: highlight matching paths, dim others
          if (activeSpotlight >= 0 && spotlightAlpha > 0) {
            const isLit = spotlightGroups[activeSpotlight].has(gi);
            if (isLit) {
              baseOp = lerp(baseOp, 0.85, spotlightAlpha);
              lw = lerp(lw, 2.2, spotlightAlpha);
            } else {
              baseOp = lerp(baseOp, 0.03, spotlightAlpha);
            }
          }

          drawBezierPath(pts);
          const lr = activeSpotlight >= 0 && spotlightAlpha > 0 && spotlightGroups[activeSpotlight].has(gi)
            ? Math.round(lerp(p0.fieldR, SPOTLIGHTS[activeSpotlight].color.r, spotlightAlpha * 0.5))
            : p0.fieldR;
          const lg = activeSpotlight >= 0 && spotlightAlpha > 0 && spotlightGroups[activeSpotlight].has(gi)
            ? Math.round(lerp(p0.fieldG, SPOTLIGHTS[activeSpotlight].color.g, spotlightAlpha * 0.5))
            : p0.fieldG;
          const lb = activeSpotlight >= 0 && spotlightAlpha > 0 && spotlightGroups[activeSpotlight].has(gi)
            ? Math.round(lerp(p0.fieldB, SPOTLIGHTS[activeSpotlight].color.b, spotlightAlpha * 0.5))
            : p0.fieldB;
          ctx.strokeStyle = `rgba(${lr},${lg},${lb},${(baseOp * lineAlpha).toFixed(3)})`;
          ctx.lineWidth = lw;
          ctx.stroke();
        }

        // Re-draw hovered line on top
        if (hoveredGroup >= 0) {
          const pIdxs = groups[hoveredGroup];
          if (pIdxs && pIdxs.length >= 2) {
            const p0 = particles[pIdxs[0]];
            const pts = pIdxs.map(idx => ppos(particles[idx]));
            drawBezierPath(pts);
            ctx.strokeStyle = `rgba(${p0.fieldR},${p0.fieldG},${p0.fieldB},${(0.95 * lineAlpha).toFixed(3)})`;
            ctx.lineWidth = 2.5;
            ctx.stroke();
          }
        }
      }

      // ── Story path curve (Catmull-Rom spline + breakout) ────────────────
      if (storyActive && storyPathIdxs.length >= 2) {
        const pathPts = storyPathIdxs.map(i => ppos(particles[i]));

        // Append breakout points (zoomed to screen space) during beat 2+
        let allPts = pathPts;
        if (storyBeat >= 2 && storyBreakoutPts.length > 0) {
          const breakZoomed = storyBreakoutPts.map(bp => ({
            x: zoomCX + (bp.x - zoomCX) * zoomFactor + Math.sin(now * 0.7) * wiggleAmp,
            y: zoomCY + (bp.y - zoomCY) * zoomFactor + Math.sin(now * 0.9) * wiggleAmp,
          }));
          allPts = [...pathPts, ...breakZoomed];
        }

        // Generate smooth Catmull-Rom points
        const SEGS = 8;
        const curvePts = [allPts[0]];
        for (let i = 0; i < allPts.length - 1; i++) {
          const p0 = allPts[Math.max(0, i - 1)];
          const p1 = allPts[i];
          const p2 = allPts[i + 1];
          const p3 = allPts[Math.min(allPts.length - 1, i + 2)];
          for (let s = 1; s <= SEGS; s++) {
            const t = s / SEGS, t2 = t * t, t3 = t2 * t;
            curvePts.push({
              x: 0.5 * ((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
              y: 0.5 * ((2*p1.y) + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
            });
          }
        }

        // Determine how much to draw
        const pathCurveLen = (pathPts.length - 1) * SEGS + 1;
        let drawCount;
        if (storyBeat === 0) {
          drawCount = Math.max(2, Math.floor(pathDrawProgress * pathCurveLen));
        } else if (storyBeat >= 2 && storyBreakoutPts.length > 0) {
          const breakT = clamp01((progress - (STORY_START + BEAT_DUR * 2)) / (BEAT_DUR * 0.65));
          const breakCurveLen = curvePts.length - pathCurveLen;
          drawCount = pathCurveLen + Math.floor(breakT * breakCurveLen);
        } else {
          drawCount = pathCurveLen;
        }
        drawCount = Math.min(drawCount, curvePts.length);

        if (drawCount >= 2) {
          ctx.beginPath();
          ctx.moveTo(curvePts[0].x, curvePts[0].y);
          for (let i = 1; i < drawCount; i++) {
            ctx.lineTo(curvePts[i].x, curvePts[i].y);
          }
          ctx.strokeStyle = 'rgba(255,195,35,0.40)';
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();
        }
      }

      // ── Dots ─────────────────────────────────────────────────────────────
      for (const p of particles) {
        if (ambList.some(a => a.p === p)) continue;
        const { x, y } = ppos(p);

        let r = Math.round(lerp(p.logoR, p.fieldR, t_graph));
        let g = Math.round(lerp(p.logoG, p.fieldG, t_graph));
        let b = Math.round(lerp(p.logoB, p.fieldB, t_graph));

        let radius = BASE_R * p.radiusScale;
        if (x < -radius - 2 || x > W + radius + 2 || y < -radius - 2 || y > H + radius + 2) continue;

        const dotDimmed = hoveredNodeGroups && !hoveredNodeGroups.has(p.personIdx);
        let dotAlpha = dotDimmed ? p.alpha * 0.12 : p.alpha;

        // Spotlight: highlight matching dots, dim others
        if (activeSpotlight >= 0 && spotlightAlpha > 0) {
          const isLit = spotlightGroups[activeSpotlight].has(p.personIdx);
          if (isLit) {
            const sc = SPOTLIGHTS[activeSpotlight].color;
            r = Math.round(lerp(r, sc.r, spotlightAlpha * 0.7));
            g = Math.round(lerp(g, sc.g, spotlightAlpha * 0.7));
            b = Math.round(lerp(b, sc.b, spotlightAlpha * 0.7));
            dotAlpha = lerp(dotAlpha, Math.min(1, dotAlpha + 0.4), spotlightAlpha);
            radius = lerp(radius, radius * 1.8, spotlightAlpha);
          } else {
            dotAlpha = lerp(dotAlpha, dotAlpha * 0.08, spotlightAlpha);
          }
        }

        // Storytelling: highlight path dots, adjacent dots, dim rest
        if (storyActive && storyPathMap) {
          const pathPos = storyPathMap.get(p);
          const adjPos = storyAdjMap ? storyAdjMap.get(p) : undefined;

          if (pathPos !== undefined) {
            // Path dot: highlight when the curve has reached it
            const dotT = pathPos / Math.max(1, storyPathIdxs.length - 1);
            if (dotT <= pathDrawProgress) {
              r = 255; g = 195; b = 35;
              radius *= 2;
              dotAlpha = 1;
            } else {
              dotAlpha *= 0.18;
            }
          } else if (adjPos !== undefined && adjPos < adjHighlightCount) {
            // Adjacent dot: bright blue, highlighted sequentially
            r = 59; g = 130; b = 246;
            radius *= 1.6;
            dotAlpha = 0.90;
          } else {
            dotAlpha *= 0.18;
          }
        }

        // Glow around highlighted path dots
        if (storyActive && storyPathMap) {
          const pathPos = storyPathMap.get(p);
          if (pathPos !== undefined) {
            const dotT = pathPos / Math.max(1, storyPathIdxs.length - 1);
            if (dotT <= pathDrawProgress) {
              const ga = 0.25;
              const gr = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius * 4);
              gr.addColorStop(0, `rgba(255,195,35,${ga})`);
              gr.addColorStop(1, 'rgba(255,195,35,0)');
              ctx.beginPath();
              ctx.arc(x, y, radius * 4, 0, Math.PI * 2);
              ctx.fillStyle = gr;
              ctx.fill();
            }
          }
        }

        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.5, radius), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${dotAlpha.toFixed(2)})`;
        ctx.fill();
      }

      // ── Storytelling text overlay (large, slides left→right) ──────────
      if (storyBeat >= 0 && storyBeatAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = storyBeatAlpha * 0.92;

        // Compute slide offset: enter from left, exit to right
        const beatLocal = (progress - STORY_START) - storyBeat * BEAT_DUR;
        const slideRange = W * 0.06;
        const fadeInT = clamp01(beatLocal / BEAT_FADE);
        const fadeOutT = clamp01((beatLocal - (BEAT_DUR - BEAT_FADE)) / BEAT_FADE);
        const slideX = beatLocal < BEAT_DUR / 2
          ? lerp(-slideRange, 0, easeInOut(fadeInT))
          : lerp(0, slideRange, easeInOut(fadeOutT));

        const storyText = STORY_TEXTS[storyBeat];
        const fontSize = Math.min(W * 0.055, 44);
        ctx.font = `600 ${fontSize}px 'Bricolage Grotesque', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(26, 25, 22, 0.85)';

        const lines = storyText.split('\n');
        const lineH = fontSize * 1.4;
        const baseY = H * 0.82;
        lines.forEach((line, li) => {
          ctx.fillText(line, W / 2 + slideX, baseY + (li - (lines.length - 1) / 2) * lineH);
        });

        ctx.restore();
      }

      // ── Spotlight text overlay ─────────────────────────────────────────
      if (activeSpotlight >= 0 && spotlightAlpha > 0.01) {
        const si = activeSpotlight;
        const count = spotlightCounts[si];
        const label = SPOTLIGHTS[si].label;
        const sc = SPOTLIGHTS[si].color;

        ctx.save();
        ctx.globalAlpha = spotlightAlpha * 0.92;

        // Large count number
        const fontSize = Math.min(W * 0.22, 180);
        ctx.font = `800 ${fontSize}px 'Bricolage Grotesque', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Slight horizontal drift based on scroll
        const driftX = (progress - (SPOT_START + si * SPOT_EACH + SPOT_EACH / 2)) * W * 0.5;

        // Number
        ctx.fillStyle = `rgba(${sc.r},${sc.g},${sc.b},0.12)`;
        ctx.fillText(count, W / 2 + driftX, H / 2 - 20);

        // Label below
        const labelSize = Math.min(W * 0.04, 36);
        ctx.font = `600 ${labelSize}px 'Bricolage Grotesque', sans-serif`;
        ctx.fillStyle = `rgba(${sc.r},${sc.g},${sc.b},0.55)`;
        ctx.fillText(label, W / 2 + driftX * 0.6, H / 2 + fontSize * 0.38);

        ctx.restore();
      }

      // ── Ambassador draw (path-tracing) ──────────────────────────────────
      lastAmbPositions = [];
      for (const amb of ambList) {
        const { p, waypoints, totalLen, t0 } = amb;
        const rawT = Math.min(1, (nowMs - t0) / AMB_DUR);

        // Position along waypoint path
        const travelT = rawT < 0.5 ? 2 * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 2) / 2;
        const targetDist = travelT * totalLen;

        // Walk along segments to find current position
        let walked = 0, ax = waypoints[0].x, ay = waypoints[0].y;
        let currentSeg = 0;
        for (let i = 1; i < waypoints.length; i++) {
          const segLen = Math.hypot(waypoints[i].x - waypoints[i-1].x, waypoints[i].y - waypoints[i-1].y);
          if (walked + segLen >= targetDist) {
            const segT = segLen > 0 ? (targetDist - walked) / segLen : 0;
            ax = lerp(waypoints[i-1].x, waypoints[i].x, segT);
            ay = lerp(waypoints[i-1].y, waypoints[i].y, segT);
            currentSeg = i;
            break;
          }
          walked += segLen;
          ax = waypoints[i].x;
          ay = waypoints[i].y;
          currentSeg = i;
        }

        // Record trail point
        amb.trail.push({ x: ax, y: ay, t: nowMs });

        // Fade: global fade out near end
        const fadeOut = rawT > 0.90 ? clamp01(1 - (rawT - 0.90) / 0.10) : 1;

        // ── Draw fading trail ──────────────────────────────────────────────
        if (amb.trail.length >= 2) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          for (let i = 1; i < amb.trail.length; i++) {
            const age = (nowMs - amb.trail[i].t) / 1000;
            const trailA = Math.max(0, (1 - age / 14)) * 0.55 * fadeOut;
            if (trailA < 0.005) continue;
            ctx.beginPath();
            ctx.moveTo(amb.trail[i-1].x, amb.trail[i-1].y);
            ctx.lineTo(amb.trail[i].x, amb.trail[i].y);
            ctx.strokeStyle = `rgba(${p.fieldR},${p.fieldG},${p.fieldB},${trailA.toFixed(3)})`;
            ctx.lineWidth = 1.8;
            ctx.stroke();
          }
        }

        // Trim old trail points (faded out)
        while (amb.trail.length > 2 && (nowMs - amb.trail[0].t) > 16000) {
          amb.trail.shift();
        }

        // ── Draw waypoint dots and labels at turns already reached ────────
        let walkedCheck = 0;
        for (let i = 1; i < waypoints.length; i++) {
          const wp = waypoints[i];
          const prevWp = waypoints[i-1];
          const segLen = Math.hypot(wp.x - prevWp.x, wp.y - prevWp.y);
          walkedCheck += segLen;

          // Only show waypoints already passed
          if (walkedCheck > targetDist + 5) break;

          const wpAge = clamp01((targetDist - walkedCheck + segLen) / (totalLen * 0.15));
          const wpFade = Math.min(wpAge * 2, 1) * fadeOut;
          if (wpFade < 0.02) continue;

          // Small dot at turn point
          ctx.beginPath();
          ctx.arc(wp.x, wp.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${p.fieldR},${p.fieldG},${p.fieldB},${(wpFade * 0.7).toFixed(2)})`;
          ctx.fill();

          // Label
          if (wp.label && wpFade > 0.1) {
            ctx.save();
            ctx.globalAlpha = wpFade * 0.85;
            ctx.font = '500 10px Inter, -apple-system, sans-serif';
            // Position label to the side of the path direction
            const dx = wp.x - prevWp.x, dy = wp.y - prevWp.y;
            const perpX = -dy, perpY = dx;
            const perpLen = Math.hypot(perpX, perpY) || 1;
            const offX = (perpX / perpLen) * 12;
            const offY = (perpY / perpLen) * 12;
            ctx.textAlign = offX >= 0 ? 'left' : 'right';
            ctx.fillStyle = 'rgba(26,25,22,0.55)';
            ctx.fillText(wp.label, wp.x + offX, wp.y + offY);
            ctx.restore();
          }
        }

        // ── Source logo dot: swells then fades ────────────────────────────
        const srcFade = clamp01(1 - rawT * 3.2);
        if (srcFade > 0) {
          const { x: lx, y: ly } = ppos(p);
          ctx.beginPath();
          ctx.arc(lx, ly, BASE_R * p.radiusScale * lerp(1, 2.2, clamp01(rawT * 3)), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${p.logoR},${p.logoG},${p.logoB},${(p.alpha * srcFade).toFixed(2)})`;
          ctx.fill();
        }

        // ── Leading dot (the "person" moving along the path) ─────────────
        const hs = headshots[p.name];
        const hasPortrait = hs && hs.state === 'ready' && hs.dots.length > 0;
        const dotR = hasPortrait ? PORTRAIT_R * 0.35 : BASE_R * 2.8;

        // Store position for click hit-testing
        lastAmbPositions.push({ x: ax, y: ay, r: dotR + 10, linkedin: p.linkedin, name: p.name });

        if (hasPortrait) {
          // Mini portrait at the leading dot
          const scale = 0.35 * fadeOut;
          for (const dot of hs.dots) {
            const dpx = ax + dot.ox * scale;
            const dpy = ay + dot.oy * scale;
            const a = fadeOut * 0.92;
            if (a < 0.01) continue;
            ctx.beginPath();
            ctx.arc(dpx, dpy, DOT_R_FACE * 0.9, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${dot.r},${dot.g},${dot.b},${a.toFixed(2)})`;
            ctx.fill();
          }
        } else {
          // Glow + dot
          const ga = fadeOut * 0.25;
          const gr = ctx.createRadialGradient(ax, ay, BASE_R, ax, ay, BASE_R * 5);
          gr.addColorStop(0, `rgba(${p.fieldR},${p.fieldG},${p.fieldB},${ga.toFixed(2)})`);
          gr.addColorStop(1, `rgba(${p.fieldR},${p.fieldG},${p.fieldB},0)`);
          ctx.beginPath(); ctx.arc(ax, ay, BASE_R * 5, 0, Math.PI * 2);
          ctx.fillStyle = gr; ctx.fill();

          ctx.beginPath(); ctx.arc(ax, ay, BASE_R * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${p.fieldR},${p.fieldG},${p.fieldB},${(fadeOut * 0.9).toFixed(2)})`;
          ctx.fill();
        }

        // ── Name label next to leading dot ───────────────────────────────
        const labelA = rawT < 0.06 ? 0 : rawT < 0.18 ? (rawT - 0.06) / 0.12 : rawT < 0.75 ? 1 : rawT < 0.88 ? 1 - (rawT - 0.75) / 0.13 : 0;
        if (labelA > 0.02) {
          ctx.save();
          ctx.globalAlpha = labelA * fadeOut;
          ctx.font = 'bold 12px Inter, -apple-system, sans-serif';
          ctx.fillStyle = '#1a2f38';
          ctx.textAlign = 'left';
          ctx.fillText(p.name, ax + dotR + 8, ay - 3);
          if (p.headline) {
            ctx.font = '10px Inter, -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(45,104,117,0.75)';
            ctx.fillText(p.headline, ax + dotR + 8, ay + 10);
          }
          ctx.restore();
        }
      }

      // ── Chart labels with circles + leader lines ─────────────────────────
      if (t_graph > 0.45 && heroChart) {
        const la = clamp01((t_graph - 0.45) / 0.40);
        const { columns, xs, nodeCenterY: ncY, nCols: nc } = heroChart;
        const maxCount = Math.max(...columns.flatMap(c => c.nodes.map(n => n.count)));
        const minR = 8, maxR = 68;
        const circleR = count => Math.max(minR, Math.min(maxR, Math.sqrt(count / maxCount) * maxR));

        ctx.save();
        ctx.globalAlpha = la;

        // Column headers
        ctx.font = '600 9px Inter, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        for (let ci = 0; ci < nc; ci++) {
          const cx = MARGIN.left + xs[ci];
          const label = columns[ci].col.label;
          ctx.fillStyle = 'rgba(107,105,96,0.60)';
          const spaced = label.toUpperCase().split('').join('\u2009');
          ctx.fillText(spaced, cx, MARGIN.top - 22);
        }

        // Node circles + leader-line annotations
        for (let ci = 0; ci < nc; ci++) {
          const col = columns[ci];
          const cx  = MARGIN.left + xs[ci];
          // Use actual x-position to decide label side (handles custom spacing)
          const isLeft = xs[ci] < (xs[0] + xs[nc - 1]) / 2;

          for (const node of col.nodes) {
            const cy = MARGIN.top + ncY[ci][node.value];
            const r  = circleR(node.count);

            // Circle outline
            const isThisNodeHovered = hoveredNode && hoveredNode.ci === ci && hoveredNode.value === node.value;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            if (isThisNodeHovered) {
              ctx.strokeStyle = 'rgba(26,25,22,0.60)';
              ctx.lineWidth = 2.8;
            } else {
              ctx.strokeStyle = 'rgba(26,25,22,0.30)';
              ctx.lineWidth = 1.6;
            }
            ctx.stroke();

            // Leader line: elbow from circle edge to label
            const dir = isLeft ? -1 : 1;
            const lx1 = cx + dir * r;
            const lx2 = cx + dir * (r + 10);
            const lx3 = cx + dir * (r + 28);
            const ly2 = cy - 6;

            ctx.beginPath();
            ctx.moveTo(lx1, cy);
            ctx.lineTo(lx2, ly2);
            ctx.lineTo(lx3, ly2);
            ctx.strokeStyle = 'rgba(26,25,22,0.30)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Label text
            const labX = lx3 + dir * 4;
            ctx.textAlign = isLeft ? 'end' : 'start';

            ctx.font = '600 13px Inter, -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(26,25,22,0.82)';
            ctx.fillText(node.value, labX, ly2 - 3);
            ctx.font = '500 10px Inter, -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(26,25,22,0.45)';
            ctx.fillText(`${node.count} ${node.count === 1 ? 'person' : 'people'}`, labX, ly2 + 10);
          }
        }

        ctx.restore();
      }

      // ── Hide DOM scroll-hint during middle phases ──────────────────────
      const scrollHintEl = document.getElementById('scroll-hint');
      if (scrollHintEl) {
        scrollHintEl.style.opacity = progress < 0.06 ? String(1 - progress / 0.06) : '0';
      }

      requestAnimationFrame(draw);
    }

    // ── Hover / click interaction on lines & nodes ─────────────────────────
    let hoveredGroup = -1;
    let hoveredNode  = null;  // { ci, value } when hovering a cluster circle
    let hoveredNodeGroups = null; // Set of group indices passing through hovered node
    let lastLinePositions = []; // [{points: [{x,y},...], ri}] computed each frame
    let lastAmbPositions  = []; // [{x, y, r, linkedin}] computed each frame

    function hitTestAmbTrail(mx, my, threshold) {
      for (const amb of ambList) {
        const wp = amb.waypoints;
        if (!wp || wp.length < 2) continue;
        const rawT = Math.min(1, (Date.now() - amb.t0) / AMB_DUR);
        if (rawT > 0.9) continue; // mostly faded
        for (let i = 1; i < wp.length; i++) {
          const a = wp[i - 1], b = wp[i];
          const dx = b.x - a.x, dy = b.y - a.y;
          const len2 = dx * dx + dy * dy;
          if (len2 === 0) continue;
          const t = clamp01(((mx - a.x) * dx + (my - a.y) * dy) / len2);
          const px = a.x + t * dx, py = a.y + t * dy;
          if (Math.hypot(mx - px, my - py) < threshold) {
            return amb.p;
          }
        }
      }
      return null;
    }

    function hitTestLine(mx, my, threshold) {
      // Test mouse point against each polyline (sampled from bezier)
      for (let li = lastLinePositions.length - 1; li >= 0; li--) {
        const { points, ri } = lastLinePositions[li];
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1], b = points[i];
          // Point-to-segment distance
          const dx = b.x - a.x, dy = b.y - a.y;
          const len2 = dx * dx + dy * dy;
          if (len2 === 0) continue;
          const t = clamp01(((mx - a.x) * dx + (my - a.y) * dy) / len2);
          const px = a.x + t * dx, py = a.y + t * dy;
          const dist = Math.hypot(mx - px, my - py);
          if (dist < threshold) return ri;
        }
      }
      return -1;
    }

    function hitTestNode(mx, my) {
      if (!heroChart) return null;
      const { columns, xs, nodeCenterY: ncY, nCols: nc } = heroChart;
      const maxCount = Math.max(...columns.flatMap(c => c.nodes.map(n => n.count)));
      const minR = 8, maxR = 68;
      const cR = count => Math.max(minR, Math.min(maxR, Math.sqrt(count / maxCount) * maxR));

      for (let ci = 0; ci < nc; ci++) {
        const cx = MARGIN.left + xs[ci];
        for (const node of columns[ci].nodes) {
          const cy = MARGIN.top + ncY[ci][node.value];
          const r  = cR(node.count);
          if (Math.hypot(mx - cx, my - cy) <= r + 2) {
            return { ci, value: node.value };
          }
        }
      }
      return null;
    }

    function getNodeGroups(ci, value) {
      if (!heroChart) return new Set();
      const set = new Set();
      heroChart.rows.forEach((r, gi) => {
        if (r.vals[ci] === value) set.add(gi);
      });
      return set;
    }

    const tooltip = document.getElementById("tooltip");

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;

      // Check ambassador hover first
      for (const amb of lastAmbPositions) {
        if (Math.hypot(mx - amb.x, my - amb.y) <= amb.r) {
          hoveredGroup = -1;
          hoveredNode = null;
          hoveredNodeGroups = null;
          canvas.style.cursor = "pointer";
          if (tooltip) {
            tooltip.innerHTML = `<strong>${amb.name}</strong><br><span style="font-size:11px;opacity:0.55">Click to open LinkedIn</span>`;
            tooltip.classList.add("visible");
            tooltip.style.left = (e.clientX + 14) + "px";
            tooltip.style.top = (e.clientY - 10) + "px";
          }
          return;
        }
      }

      // Check ambassador trail hover
      const trailP = hitTestAmbTrail(mx, my, 8);
      if (trailP) {
        hoveredGroup = -1;
        hoveredNode = null;
        hoveredNodeGroups = null;
        canvas.style.cursor = "pointer";
        if (tooltip) {
          tooltip.innerHTML = `<strong>${trailP.name}</strong><br><span style="opacity:0.8">${trailP.headline || ''}</span><br><span style="font-size:11px;opacity:0.55">Click to open LinkedIn</span>`;
          tooltip.classList.add("visible");
          tooltip.style.left = (e.clientX + 14) + "px";
          tooltip.style.top = (e.clientY - 10) + "px";
        }
        return;
      }

      // Check node (cluster) hover first
      const node = hitTestNode(mx, my);
      if (node) {
        const changed = !hoveredNode || hoveredNode.ci !== node.ci || hoveredNode.value !== node.value;
        hoveredNode = node;
        hoveredNodeGroups = getNodeGroups(node.ci, node.value);
        hoveredGroup = -1;
        if (changed && tooltip) {
          const count = hoveredNodeGroups.size;
          tooltip.innerHTML = `<strong>${node.value}</strong><br><span style="opacity:0.7">${count} ${count === 1 ? 'person' : 'people'}</span>`;
          tooltip.classList.add("visible");
        }
        canvas.style.cursor = "pointer";
        if (tooltip) {
          tooltip.style.left = (e.clientX + 14) + "px";
          tooltip.style.top = (e.clientY - 10) + "px";
        }
        return;
      }

      // Clear node hover, check line hover
      if (hoveredNode) {
        hoveredNode = null;
        hoveredNodeGroups = null;
      }

      const ri = hitTestLine(mx, my, 6);
      if (ri !== hoveredGroup) {
        hoveredGroup = ri;
        if (ri >= 0 && tooltip) {
          const p = particles[groups[ri][0]];
          tooltip.innerHTML = `<strong>${p.name}</strong><br><span style="opacity:0.8">${p.headline || ''}</span><br><span style="font-size:11px;opacity:0.55">Click to open LinkedIn</span>`;
          tooltip.classList.add("visible");
        } else if (tooltip) {
          tooltip.classList.remove("visible");
        }
        canvas.style.cursor = ri >= 0 ? "pointer" : "";
      }
      if (ri >= 0 && tooltip) {
        tooltip.style.left = (e.clientX + 14) + "px";
        tooltip.style.top = (e.clientY - 10) + "px";
      }
    });

    canvas.addEventListener("mouseleave", () => {
      hoveredGroup = -1;
      hoveredNode = null;
      hoveredNodeGroups = null;
      if (tooltip) tooltip.classList.remove("visible");
      canvas.style.cursor = "";
    });

    canvas.addEventListener("click", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;

      // Check ambassador click first (dot + trail)
      for (const amb of lastAmbPositions) {
        if (Math.hypot(mx - amb.x, my - amb.y) <= amb.r) {
          if (amb.linkedin) window.open(amb.linkedin, "_blank");
          return;
        }
      }
      const trailHit = hitTestAmbTrail(mx, my, 8);
      if (trailHit) {
        if (trailHit.linkedin) window.open(trailHit.linkedin, "_blank");
        return;
      }

      const ri = hitTestLine(mx, my, 6);
      if (ri >= 0) {
        const p = particles[groups[ri][0]];
        if (p.linkedin) window.open(p.linkedin, "_blank");
      }
    });

    let rt;
    window.addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(setup, 200);
    });

    await setup();
    draw();
  };

})();
