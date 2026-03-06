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
    let W = 0, H = 0;

    const MAX_AMB    = 4;
    const AMB_DUR    = 16000;
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
      const t_zoom  = easeInOut(clamp01((progress - 0.20) / 0.45));
      const t_graph = easeInOut(clamp01((progress - 0.65) / 0.35));
      const wiggleAmp = 3.2 * Math.max(0.25, 1 - t_graph * 0.6);
      const lineAlpha = clamp01((progress - 0.82) / 0.18);
      const now       = Date.now() * 0.001;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#ede8df";
      ctx.fillRect(0, 0, W, H);

      const zoomCX = W / 2;
      const zoomCY = H / 2 - 50;
      const zoomFactor = 1 + t_zoom * 4.5;

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
      const fillAlpha = clamp01(1 - t_graph * 3);
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
      if (progress > 0.10) { ambList = []; }
      ambList = ambList.filter(a => (nowMs - a.t0) < AMB_DUR + 400);

      if (progress < 0.08 && ambList.length < MAX_AMB && nowMs >= ambSpawnMs && weightedPool.length > 0) {
        const ri   = weightedPool[Math.floor(Math.random() * weightedPool.length)];
        const p    = particles[groups[ri][0]];

        if (p && !ambList.some(a => a.p === p)) {
          const sx = zoomCX + (p.logoX - zoomCX) * zoomFactor;
          const sy = zoomCY + (p.logoY - zoomCY) * zoomFactor;
          const baseAngle = Math.atan2(sy - zoomCY, sx - zoomCX);
          const angle     = baseAngle + (Math.random() - 0.5) * 1.0;
          const farDist   = Math.hypot(W, H) * 0.65 + 150;
          ambList.push({ p, sx, sy, tx: sx + Math.cos(angle) * farDist, ty: sy + Math.sin(angle) * farDist, t0: nowMs });
          ambSpawnMs = nowMs + AMB_SPAWN + Math.random() * 1200;

          // Kick off headshot load as soon as ambassador is spawned
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
          const baseOp = isHovered ? 0.9 : isNodeHovered ? 0.85 : dimmed ? 0.06 : 0.30;
          const lw = isHovered ? 2.2 : isNodeHovered ? 1.8 : 0.7;

          drawBezierPath(pts);
          ctx.strokeStyle = `rgba(${p0.fieldR},${p0.fieldG},${p0.fieldB},${(baseOp * lineAlpha).toFixed(3)})`;
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

      // ── Dots ─────────────────────────────────────────────────────────────
      for (const p of particles) {
        if (ambList.some(a => a.p === p)) continue;
        const { x, y } = ppos(p);

        const r = Math.round(lerp(p.logoR, p.fieldR, t_graph));
        const g = Math.round(lerp(p.logoG, p.fieldG, t_graph));
        const b = Math.round(lerp(p.logoB, p.fieldB, t_graph));

        const radius = BASE_R * p.radiusScale;
        if (x < -radius - 2 || x > W + radius + 2 || y < -radius - 2 || y > H + radius + 2) continue;

        const dotDimmed = hoveredNodeGroups && !hoveredNodeGroups.has(p.personIdx);
        const dotAlpha = dotDimmed ? p.alpha * 0.12 : p.alpha;

        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.5, radius), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${dotAlpha.toFixed(2)})`;
        ctx.fill();
      }

      // ── Ambassador draw ───────────────────────────────────────────────────
      lastAmbPositions = [];
      for (const amb of ambList) {
        const { p, sx, sy, tx, ty, t0 } = amb;
        const rawT  = Math.min(1, (nowMs - t0) / AMB_DUR);
        const f     = rawT < 0.5
                    ? 2 * rawT * rawT
                    : 1 - Math.pow(-2 * rawT + 2, 2) / 2;
        const ax    = lerp(sx, tx, f);
        const ay    = lerp(sy, ty, f);

        // Label alpha: ramp up t=0.08→0.22, hold, ramp down t=0.55→0.72
        const labelA = rawT < 0.08  ? 0
                     : rawT < 0.22  ? (rawT - 0.08) / 0.14
                     : rawT < 0.55  ? 1
                     : rawT < 0.72  ? 1 - (rawT - 0.55) / 0.17
                     : 0;
        const edgeFade = Math.min(1,
          (ax + 60)  / 60, (W - ax + 60) / 60,
          (ay + 60)  / 60, (H - ay + 60) / 60);
        const la = labelA * Math.max(0, edgeFade);

        // Store position for click hit-testing
        const hitR = PORTRAIT_R * 1.1;
        lastAmbPositions.push({ x: ax, y: ay, r: hitR, linkedin: p.linkedin, name: p.name });

        // Portrait shrinks as it nears the screen boundary
        const SHRINK_MARGIN   = 220; // px from edge where shrinking starts
        const edgeProximity   = clamp01(Math.min(
          ax / SHRINK_MARGIN, (W - ax) / SHRINK_MARGIN,
          ay / SHRINK_MARGIN, (H - ay) / SHRINK_MARGIN));
        const portraitEdgeScale = lerp(0.20, 1.0, easeInOut(edgeProximity));

        // WATER-DROP formation:
        //   The whole portrait emerges as one cohesive drop from the logo dot.
        //   The leading edge (travel direction) bulges out first.
        //   The trailing edge (back toward logo) follows last — creating the neck/teardrop.
        //   Once the drop fully releases, the portrait is complete and travels away.
        const FORM_DUR = 0.38; // fraction of AMB_DUR for the full drop to emerge

        // Global formation progress (0 → 1)
        const formT     = easeInOut(clamp01(rawT / FORM_DUR));
        const expandScale = formT; // used for label card edge radius below
        const fadeOut     = rawT > 0.80 ? clamp01(1 - (rawT - 0.80) / 0.20) : 1;

        // Travel direction: leading edge of the drop points this way
        const tCX = (tx - sx) / (Math.hypot(tx - sx, ty - sy) || 1);
        const tCY = (ty - sy) / (Math.hypot(tx - sx, ty - sy) || 1);

        // ── Source logo dot: the "faucet" — swells as the drop forms, then fades ──
        const srcFade = clamp01(1 - rawT * 3.2);
        if (srcFade > 0) {
          const { x: lx, y: ly } = ppos(p);
          const growR = BASE_R * p.radiusScale * lerp(1, 2.4, formT);
          ctx.beginPath();
          ctx.arc(lx, ly, growR, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${p.logoR},${p.logoG},${p.logoB},${(p.alpha * srcFade).toFixed(2)})`;
          ctx.fill();
        }

        const hs          = headshots[p.name];
        const hasPortrait = hs && hs.state === 'ready' && hs.dots.length > 0;

        if (hasPortrait) {
          // ── Water-drop dot portrait ───────────────────────────────────────────
          for (const dot of hs.dots) {
            // Project dot onto travel axis: +1 = leading (first out), -1 = trailing (last out)
            const normProj = (dot.ox * tCX + dot.oy * tCY) / PORTRAIT_R; // -1 … +1

            // Trailing dots are delayed — the neck of the teardrop forms last.
            // delay=0 for leading, delay=0.55 for max trailing.
            const delay    = Math.max(0, -normProj) * 0.55;
            const dotFormT = clamp01((formT - delay) / Math.max(0.01, 1 - delay));
            if (dotFormT <= 0) continue; // still inside the logo dot

            const dotScale = easeOutBack(dotFormT) * portraitEdgeScale;

            const wx  = Math.sin(now * dot.wiggleFreq       + dot.wigglePhaseX) * wiggleAmp;
            const wy  = Math.sin(now * dot.wiggleFreq * 1.3 + dot.wigglePhaseY) * wiggleAmp;
            const dpx = ax + dot.ox * dotScale + wx;
            const dpy = ay + dot.oy * dotScale + wy;

            // Fade each dot in as it emerges (quick ramp so it pops into view cleanly)
            const a = Math.min(1, dotFormT * 3) * fadeOut * edgeFade * 0.90;
            if (a < 0.004) continue;
            ctx.beginPath();
            ctx.arc(dpx, dpy, DOT_R_FACE * portraitEdgeScale, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${dot.r},${dot.g},${dot.b},${a.toFixed(2)})`;
            ctx.fill();
          }

        } else {
          // ── Fallback: soft glow + enlarged dot (no headshot / still loading) ──
          const fallbackA = formT * fadeOut * edgeFade;
          const glowA = fallbackA * 0.28;
          const gr    = ctx.createRadialGradient(ax, ay, BASE_R, ax, ay, BASE_R * 6);
          gr.addColorStop(0, `rgba(${p.fieldR},${p.fieldG},${p.fieldB},${glowA.toFixed(2)})`);
          gr.addColorStop(1, `rgba(${p.fieldR},${p.fieldG},${p.fieldB},0)`);
          ctx.beginPath(); ctx.arc(ax, ay, BASE_R * 6, 0, Math.PI * 2);
          ctx.fillStyle = gr; ctx.fill();

          ctx.beginPath(); ctx.arc(ax, ay, BASE_R * 2.4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${p.fieldR},${p.fieldG},${p.fieldB},${(fallbackA * 0.93).toFixed(2)})`;
          ctx.fill();
        }

        // ── Label card ────────────────────────────────────────────────────
        if (la > 0.02) {
          const side = (tx - sx) >= 0 ? 1 : -1;
          const edgeR = hasPortrait
            ? PORTRAIT_R * Math.min(1.05, Math.max(0.3, expandScale))
            : BASE_R * 2.4;
          const labX = ax + side * (edgeR + 13);

          ctx.globalAlpha = Math.min(1, la * 1.5);

          // Thin connector nub
          ctx.beginPath();
          ctx.moveTo(ax + side * edgeR, ay);
          ctx.lineTo(ax + side * (edgeR + 9), ay);
          ctx.strokeStyle = `rgba(${p.fieldR},${p.fieldG},${p.fieldB},0.38)`;
          ctx.lineWidth = 0.9; ctx.stroke();

          ctx.textAlign = side > 0 ? 'left' : 'right';

          ctx.font = 'bold 13px Inter, -apple-system, sans-serif';
          ctx.fillStyle = '#1a2f38';
          ctx.fillText(p.name, labX, ay - 6);

          if (p.headline) {
            ctx.font = '11px Inter, -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(45,104,117,0.85)';
            ctx.fillText(p.headline, labX, ay + 9);
          }

          const extras = [];
          if (p.recency >= 2024) extras.push(`Active ${p.recency}`);
          if (p.linkedin)        extras.push('→ LinkedIn');
          if (extras.length) {
            ctx.font = '10px Inter, -apple-system, sans-serif';
            ctx.fillStyle = 'rgba(45,104,117,0.50)';
            ctx.fillText(extras.join('  ·  '), labX, ay + 24);
          }

          ctx.globalAlpha = 1;
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

      requestAnimationFrame(draw);
    }

    // ── Hover / click interaction on lines & nodes ─────────────────────────
    let hoveredGroup = -1;
    let hoveredNode  = null;  // { ci, value } when hovering a cluster circle
    let hoveredNodeGroups = null; // Set of group indices passing through hovered node
    let lastLinePositions = []; // [{points: [{x,y},...], ri}] computed each frame
    let lastAmbPositions  = []; // [{x, y, r, linkedin}] computed each frame

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

      // Check ambassador click first
      for (const amb of lastAmbPositions) {
        if (Math.hypot(mx - amb.x, my - amb.y) <= amb.r) {
          if (amb.linkedin) window.open(amb.linkedin, "_blank");
          return;
        }
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
