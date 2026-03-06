// ═══════════════════════════════════════════════════════════════════════════════
// founder-timeline.js — Scroll-driven cumulative founder dot chart + world map
//
// LEFT HALF  → Cumulative year-column dot chart (2008–2024)
// RIGHT HALF → Minimalistic world map with founder location dots
//
// Dots in both halves share the same t_trigger so they appear simultaneously.
// ═══════════════════════════════════════════════════════════════════════════════

(function () {

  const clamp01    = t => Math.max(0, Math.min(1, t));
  const lerp       = (a, b, t) => a + (b - a) * t;
  const easeInOut  = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3) / 2;
  const easeOut3   = t => 1 - Math.pow(1 - t, 3);
  const easeOutBack = t => { const c = 1.70158 + 1; return 1 + c * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2); };

  function rand(s) {
    const x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }
  function hexToRgb(hex) {
    const n = parseInt((hex || '#94a3b8').replace('#', ''), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  // ── Country → [lon, lat] lookup ────────────────────────────────────────────
  const COUNTRY_COORDS = {
    'Germany':                    [10.45,  51.17],
    'United States of America':   [-98.58, 39.83],
    'United States':              [-98.58, 39.83],
    'USA':                        [-98.58, 39.83],
    'Switzerland':                [ 8.23,  46.82],
    'United Kingdom':             [-3.44,  55.38],
    'Austria':                    [14.55,  47.52],
    'France':                     [ 2.21,  46.23],
    'Spain':                      [-3.75,  40.46],
    'Sweden':                     [18.64,  60.13],
    'United Arab Emirates':       [53.85,  23.42],
    'UAE':                        [53.85,  23.42],
    'Chile':                      [-71.54, -35.68],
    'India':                      [78.96,  20.59],
    'Netherlands':                [ 5.29,  52.13],
    'Canada':                     [-96.80,  56.13],
    'Australia':                  [133.78, -25.27],
    'Singapore':                  [103.82,   1.36],
    'Norway':                     [  8.47,  60.47],
    'Denmark':                    [  9.50,  56.26],
    'Finland':                    [ 25.75,  61.92],
    'Israel':                     [ 34.85,  31.05],
    'China':                      [104.20,  35.86],
    'Japan':                      [138.25,  36.20],
    'South Korea':                [127.77,  35.91],
    'Brazil':                     [-51.93, -14.24],
    'Argentina':                  [-63.62, -38.42],
    'Mexico':                     [-102.55, 23.63],
    'South Africa':               [ 22.94, -30.56],
    'Nigeria':                    [  8.68,   9.08],
    'Kenya':                      [ 37.91,  -0.02],
    'Ghana':                      [ -1.02,   7.95],
    'Portugal':                   [ -8.22,  39.40],
    'Italy':                      [ 12.57,  41.87],
    'Belgium':                    [  4.47,  50.50],
    'Poland':                     [ 19.15,  51.92],
    'Czech Republic':             [ 15.47,  49.82],
    'Romania':                    [ 24.97,  45.94],
    'Hungary':                    [ 19.50,  47.16],
    'Greece':                     [ 21.82,  39.07],
    'Turkey':                     [ 35.24,  38.96],
    'Russia':                     [ 99.00,  61.52],
  };

  // Attempt to resolve a location string to [lon, lat].
  // Strategy: try exact match, then scan each token for a known country name.
  function resolveLocation(loc) {
    if (!loc) return null;
    // Exact match
    const exact = COUNTRY_COORDS[loc.trim()];
    if (exact) return exact;
    // Try last comma-separated part (e.g. "Munich, Germany" → "Germany")
    const parts = loc.split(',').map(s => s.trim()).reverse();
    for (const p of parts) {
      if (COUNTRY_COORDS[p]) return COUNTRY_COORDS[p];
    }
    // Scan tokens
    const tokens = loc.split(/[\s,]+/);
    for (const t of tokens) {
      if (COUNTRY_COORDS[t]) return COUNTRY_COORDS[t];
    }
    return null;
  }

  const YEAR_MIN = 2008;
  const YEAR_MAX = 2024;
  const N_YEARS  = YEAR_MAX - YEAR_MIN + 1; // 17

  // Scroll timing
  const T_DONE         = 0.76;
  const T_SLOT         = T_DONE / N_YEARS;
  const T_FADEIN_NEW   = T_SLOT * 2.0;
  const T_FADEIN_CARRY = T_SLOT * 0.55;
  const T_FADEIN_MAP   = T_SLOT * 2.5;  // map dots take slightly longer for plop

  // Chart geometry
  const PAD_L = 52;
  const PAD_T = 96;
  const PAD_B = 68;

  // World map geometry (within right half)
  const MAP_PAD_T = 80;
  const MAP_PAD_B = 80;
  const MAP_PAD_L = 40;
  const MAP_PAD_R = 40;

  window.initFounderTimeline = function (alumniData) {
    const section = document.getElementById('founder-section');
    const canvas  = document.getElementById('founder-canvas');
    if (!section || !canvas) return;

    const ctx = canvas.getContext('2d');
    let W = 0, H = 0;

    // Tooltip state
    const tip     = document.getElementById('founder-tip');
    const tipName = document.getElementById('ftip-name');
    const tipMeta = document.getElementById('ftip-meta');
    const tipHl   = document.getElementById('ftip-hl');
    const tipLink = document.getElementById('ftip-link');
    let hovered = null;  // { particle, inMap }

    // Bar chart layout
    let colSpacing = 0;
    let dotR       = 2;
    let dotPitch   = 5;
    let rowHeight  = 5;
    let dotsPerRow = 4;
    let chartRight = 0;

    // Map layout
    let mapLeft    = 0;
    let projection = null;
    let mapPath    = null;
    let mapCache   = null; // offscreen canvas with world outlines

    // Pre-computed dot arrays
    let colDots      = [];
    let newParticles = [];  // bar chart drops
    let mapParticles = [];  // world map plops

    let yearCounts  = {};
    let cumulCounts = {};

    // World atlas topology (loaded once)
    let worldTopo = null;

    // ── Fetch world atlas ─────────────────────────────────────────────────────
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then(r => r.json())
      .then(topo => {
        worldTopo = topo;
        if (W > 0) buildMap(); // rebuild if dimensions already known
      })
      .catch(() => {}); // map just won't draw if fetch fails

    // ── Build bar chart layout ────────────────────────────────────────────────
    function build() {
      const view = VIEWS[0];
      const { rows } = buildLayout(alumniData, view, W);

      chartRight  = Math.round(W * 0.50) - 20;
      const innerW = chartRight - PAD_L;
      const innerH = H - PAD_T - PAD_B;
      colSpacing   = innerW / (N_YEARS - 1);

      yearCounts = {};
      const founders = [];

      rows.forEach(row => {
        const fy = row.person.founding_year;
        if (row.person.is_founder && fy != null && fy >= YEAR_MIN && fy <= YEAR_MAX) {
          yearCounts[fy] = (yearCounts[fy] || 0) + 1;
          const fc = hexToRgb(PALETTE[row.person.primary_field || 'Other'] || PALETTE['Other']);
          founders.push({
            foundingYear: fy,
            r: fc.r, g: fc.g, b: fc.b,
            location: row.person.location || '',
            name:     row.person.full_name  || '',
            headline: row.person.headline   || '',
            linkedin: row.person.linkedin   || '',
          });
        }
      });

      founders.sort((a, b) => a.foundingYear - b.foundingYear);

      let cum = 0;
      cumulCounts = {};
      for (let y = YEAR_MIN; y <= YEAR_MAX; y++) {
        cum += yearCounts[y] || 0;
        cumulCounts[y] = cum;
      }
      const maxCumul = cum;

      const colW = colSpacing * 0.80;
      dotsPerRow = 4;
      rowHeight  = innerH / Math.ceil(maxCumul / 4);
      dotPitch   = colW / 4;
      dotR       = Math.min(rowHeight, dotPitch) * 0.44;

      let bestR = 0;
      for (let dpr = 1; dpr <= 12; dpr++) {
        const nRows = Math.ceil(maxCumul / dpr);
        const rh    = innerH / nRows;
        const pitch = colW / dpr;
        const r     = Math.min(rh, pitch) * 0.44;
        if (r > bestR) {
          bestR      = r;
          dotsPerRow = dpr;
          rowHeight  = rh;
          dotPitch   = pitch;
          dotR       = Math.max(1.2, r);
        }
      }

      colDots      = [];
      newParticles = [];
      mapParticles = [];

      for (let ci = 0; ci < N_YEARS; ci++) {
        const year      = YEAR_MIN + ci;
        const cumCount  = cumulCounts[year]           || 0;
        const prevCount = ci > 0 ? (cumulCounts[year - 1] || 0) : 0;
        const xCenter   = PAD_L + ci * colSpacing;
        const colArr    = [];

        let localNewIdx = 0;

        for (let di = 0; di < cumCount; di++) {
          const f       = founders[di];
          const row_i   = Math.floor(di / dotsPerRow);
          const col_i   = di % dotsPerRow;
          const xOff    = (col_i - (dotsPerRow - 1) / 2) * dotPitch;
          const targetX = xCenter + xOff;
          const targetY = H - PAD_B - dotR - row_i * rowHeight;

          colArr.push({ x: targetX, y: targetY, r: f.r, g: f.g, b: f.b });

          if (f.foundingYear === year) {
            const newCount  = yearCounts[year] || 1;
            const t_trigger = ci * T_SLOT +
                              (localNewIdx / Math.max(1, newCount - 1)) * T_SLOT * 0.45;
            localNewIdx++;

            newParticles.push({
              targetX, targetY,
              startY:  PAD_T - 16 - rand(di * 37 + ci * 13) * 36,
              r: f.r, g: f.g, b: f.b,
              alpha:   0.80 + rand(di * 13 + ci) * 0.16,
              dotRval: dotR * (0.88 + rand(di * 97 + ci) * 0.22),
              t_trigger,
              colIndex: ci,
              location: f.location,
              name:     f.name,
              headline: f.headline,
              linkedin: f.linkedin,
              foundingYear: f.foundingYear,
            });
          }
        }

        colDots.push(colArr);
      }

      // Build map particles from newParticles (they share t_trigger)
      buildMapParticles();
    }

    // ── Build world map ───────────────────────────────────────────────────────
    function buildMap() {
      if (!worldTopo || W === 0) return;

      mapLeft = chartRight + MAP_PAD_L;
      const mapRight  = W - MAP_PAD_R;
      const mapTop    = MAP_PAD_T;
      const mapBottom = H - MAP_PAD_B;
      const mW        = mapRight - mapLeft;
      const mH        = mapBottom - mapTop;

      projection = d3.geoNaturalEarth1()
        .fitExtent([[mapLeft, mapTop], [mapLeft + mW, mapTop + mH]], { type: 'Sphere' });
      mapPath = d3.geoPath(projection);

      // Draw map outlines to an offscreen canvas
      const oc  = document.createElement('canvas');
      oc.width  = W;
      oc.height = H;
      const oc2 = oc.getContext('2d');

      const countries = topojson.feature(worldTopo, worldTopo.objects.countries);
      const mesh      = topojson.mesh(worldTopo, worldTopo.objects.countries, (a, b) => a !== b);

      // Fill land very lightly
      oc2.beginPath();
      mapPath.context(oc2)(countries);
      oc2.fillStyle = 'rgba(180,172,155,0.18)';
      oc2.fill();

      // Draw borders
      oc2.beginPath();
      mapPath.context(oc2)(mesh);
      oc2.strokeStyle = 'rgba(180,172,155,0.45)';
      oc2.lineWidth   = 0.5;
      oc2.stroke();

      // Draw sphere outline
      oc2.beginPath();
      mapPath.context(oc2)({ type: 'Sphere' });
      oc2.strokeStyle = 'rgba(180,172,155,0.30)';
      oc2.lineWidth   = 0.8;
      oc2.stroke();

      mapCache = oc;

      buildMapParticles();
    }

    // ── Build map particles array ─────────────────────────────────────────────
    function buildMapParticles() {
      mapParticles = [];
      if (!projection) return;

      newParticles.forEach((p, i) => {
        const coords = resolveLocation(p.location);
        if (!coords) return;

        const [px, py] = projection(coords);
        if (px == null || py == null || isNaN(px) || isNaN(py)) return;

        // Jitter slightly so stacked dots (same country) are visible
        const jx = (rand(i * 53 + 7)  - 0.5) * 5;
        const jy = (rand(i * 31 + 17) - 0.5) * 5;

        mapParticles.push({
          x: px + jx,
          y: py + jy,
          r: p.r, g: p.g, b: p.b,
          alpha:     0.75 + rand(i * 19) * 0.20,
          t_trigger: p.t_trigger,
          name:     p.name,
          headline: p.headline,
          linkedin: p.linkedin,
          foundingYear: p.foundingYear,
        });
      });
    }

    // ── Scroll progress ───────────────────────────────────────────────────────
    function getProgress() {
      const top   = section.getBoundingClientRect().top + window.scrollY;
      const total = section.offsetHeight - H;
      if (total <= 0) return 0;
      return clamp01((window.scrollY - top) / total);
    }

    // ── Draw loop ─────────────────────────────────────────────────────────────
    function draw() {
      const progress = getProgress();

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#ede8df';
      ctx.fillRect(0, 0, W, H);

      // ── Carry-over dots ───────────────────────────────────────────────────
      for (let ci = 0; ci < N_YEARS; ci++) {
        const colStart = ci * T_SLOT;
        if (progress < colStart) break;

        const year      = YEAR_MIN + ci;
        const prevCount = ci > 0 ? (cumulCounts[year - 1] || 0) : 0;
        if (prevCount === 0) continue;

        const carryFrac = easeOut3(clamp01((progress - colStart) / T_FADEIN_CARRY));
        if (carryFrac < 0.005) continue;

        const dots = colDots[ci];
        for (let di = 0; di < prevCount; di++) {
          const d = dots[di];
          ctx.beginPath();
          ctx.arc(d.x, d.y, Math.max(0.5, dotR * 0.88), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${d.r},${d.g},${d.b},${(carryFrac * 0.30).toFixed(2)})`;
          ctx.fill();
        }
      }

      // ── Animated new (bar chart) dots ─────────────────────────────────────
      let arrivedCount = 0;

      for (const p of newParticles) {
        const t_eff = easeInOut(clamp01((progress - p.t_trigger) / T_FADEIN_NEW));
        if (t_eff < 0.005) continue;

        const y = lerp(p.startY, p.targetY, t_eff);
        const a = p.alpha * t_eff;

        ctx.beginPath();
        ctx.arc(p.targetX, y, Math.max(0.5, p.dotRval), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${a.toFixed(2)})`;
        ctx.fill();

        if (t_eff > 0.68) arrivedCount++;
      }

      // ── World map ─────────────────────────────────────────────────────────
      const mapFadeIn = easeOut3(clamp01((progress - 0.02) / 0.12));
      if (mapFadeIn > 0.01 && mapCache) {
        ctx.save();
        ctx.globalAlpha = mapFadeIn * 0.92;
        ctx.drawImage(mapCache, 0, 0);
        ctx.restore();
      }

      // ── Map dots (plop animation) ─────────────────────────────────────────
      for (const mp of mapParticles) {
        const t_raw = clamp01((progress - mp.t_trigger) / T_FADEIN_MAP);
        if (t_raw < 0.005) continue;
        const t_eff = easeOutBack(t_raw);
        const scale = t_eff;
        const alpha = Math.min(1, t_raw * 3) * mp.alpha;
        const r     = Math.max(0.5, 3.5 * scale);

        ctx.beginPath();
        ctx.arc(mp.x, mp.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${mp.r},${mp.g},${mp.b},${(alpha * mapFadeIn).toFixed(2)})`;
        ctx.fill();
      }

      // ── Hover highlight ───────────────────────────────────────────────────
      if (hovered) {
        const p  = hovered.particle;
        const hr = hovered.inMap ? 5.5 : Math.max(0.5, p.dotRval) * 1.8;
        ctx.save();
        ctx.beginPath();
        ctx.arc(hovered.inMap ? p.x : p.targetX, hovered.inMap ? p.y : p.targetY, hr + 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(245,158,11,0.22)`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(hovered.inMap ? p.x : p.targetX, hovered.inMap ? p.y : p.targetY, hr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},0.95)`;
        ctx.fill();
        ctx.strokeStyle = 'rgba(245,158,11,0.85)';
        ctx.lineWidth   = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      // ── X-axis ────────────────────────────────────────────────────────────
      const t_axis = easeOut3(clamp01((progress - 0.03) / 0.16));
      if (t_axis > 0.01) {
        const axisY = H - PAD_B + 12;
        ctx.save();

        ctx.globalAlpha = t_axis * 0.15;
        ctx.beginPath();
        ctx.moveTo(PAD_L - 8, axisY);
        ctx.lineTo(chartRight + 8, axisY);
        ctx.strokeStyle = '#1a1916';
        ctx.lineWidth   = 1;
        ctx.stroke();

        ctx.font = '10px Inter, sans-serif';
        for (let i = 0; i < N_YEARS; i++) {
          const year = YEAR_MIN + i;
          const x    = PAD_L + i * colSpacing;

          ctx.globalAlpha = t_axis * 0.15;
          ctx.beginPath();
          ctx.moveTo(x, axisY);
          ctx.lineTo(x, axisY + 5);
          ctx.strokeStyle = '#1a1916';
          ctx.lineWidth   = 1;
          ctx.stroke();

          if (year % 2 === 0) {
            ctx.globalAlpha = t_axis * 0.50;
            ctx.fillStyle   = '#6b6960';
            ctx.textAlign   = 'center';
            ctx.fillText(String(year), x, axisY + 13);
          }
        }
        ctx.restore();
      }

      // ── Title ─────────────────────────────────────────────────────────────
      const t_title = easeOut3(clamp01(progress / 0.12));
      if (t_title > 0.01) {
        ctx.save();
        ctx.globalAlpha = t_title;
        ctx.textAlign   = 'left';

        ctx.font      = '600 10px Inter, sans-serif';
        ctx.fillStyle = 'rgba(168,167,159,0.95)';
        ctx.fillText('CDTM ALUMNI · COMPANIES FOUNDED', PAD_L, 34);

        const sz = Math.round(Math.min(36, Math.max(22, W / 44)));
        ctx.font      = `800 ${sz}px 'Bricolage Grotesque', sans-serif`;
        ctx.fillStyle = 'rgba(26,25,22,0.82)';
        ctx.fillText('Each dot, a company built.', PAD_L, 34 + sz * 1.18);

        ctx.restore();
      }

      // ── Counter (overlaid on map, top-right area) ─────────────────────────
      if (arrivedCount > 0 && mapFadeIn > 0.01) {
        const fade = Math.min(1, arrivedCount / 8) * mapFadeIn;

        // position: top-right corner of the map area
        const counterX = W - MAP_PAD_R - 16;
        const counterY = MAP_PAD_T + 16;

        ctx.save();
        ctx.globalAlpha = fade;
        ctx.textAlign   = 'right';

        const numSize = Math.round(Math.min(80, Math.max(48, (W - chartRight) / 5)));
        ctx.font      = `800 ${numSize}px 'Bricolage Grotesque', sans-serif`;
        ctx.fillStyle = 'rgba(245,158,11,0.94)';
        ctx.fillText(String(arrivedCount), counterX, counterY + numSize);

        ctx.font      = '500 11px Inter, sans-serif';
        ctx.fillStyle = 'rgba(107,105,96,0.75)';
        ctx.fillText('companies founded', counterX, counterY + numSize + 16);

        ctx.restore();
      }

      requestAnimationFrame(draw);
    }

    // ── Setup & resize ────────────────────────────────────────────────────────
    function setup() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width  = W;
      canvas.height = H;
      chartRight = Math.round(W * 0.50) - 20;
      build();
      buildMap();
    }

    let rt;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(setup, 200);
    });

    setup();
    draw();

    // ── Tooltip helpers ───────────────────────────────────────────────────────
    const HIT_BAR = 6;   // px hit radius for bar chart dots
    const HIT_MAP = 7;   // px hit radius for map dots

    function showTip(p, clientX, clientY) {
      tipName.textContent = p.name || '—';
      tipMeta.textContent = p.foundingYear ? `Founded ${p.foundingYear}` : '';
      tipHl.textContent   = p.headline || '';
      tipLink.style.display = p.linkedin ? 'block' : 'none';

      tip.style.display = 'block';
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      let tx = clientX + 14;
      let ty = clientY - th / 2;
      if (tx + tw > window.innerWidth  - 8) tx = clientX - tw - 14;
      if (ty < 8)                           ty = 8;
      if (ty + th > window.innerHeight - 8) ty = window.innerHeight - th - 8;
      tip.style.left = tx + 'px';
      tip.style.top  = ty + 'px';
    }

    function hideTip() {
      tip.style.display = 'none';
      hovered = null;
    }

    function hitTest(cx, cy) {
      const progress = getProgress();

      // Test map dots first (drawn on top)
      for (const mp of mapParticles) {
        const t_raw = (progress - mp.t_trigger) / T_FADEIN_MAP;
        if (t_raw < 0.1) continue;
        const dx = cx - mp.x;
        const dy = cy - mp.y;
        if (Math.sqrt(dx * dx + dy * dy) < HIT_MAP) {
          return { particle: mp, inMap: true };
        }
      }

      // Test bar chart dots
      for (const p of newParticles) {
        const t_eff = (progress - p.t_trigger) / T_FADEIN_NEW;
        if (t_eff < 0.5) continue;
        const dx = cx - p.targetX;
        const dy = cy - p.targetY;
        if (Math.sqrt(dx * dx + dy * dy) < HIT_BAR) {
          return { particle: p, inMap: false };
        }
      }
      return null;
    }

    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      const cx   = (e.clientX - rect.left) * (W / rect.width);
      const cy   = (e.clientY - rect.top)  * (H / rect.height);
      const hit  = hitTest(cx, cy);
      if (hit) {
        hovered = hit;
        canvas.style.cursor = hit.particle.linkedin ? 'pointer' : 'default';
        showTip(hit.particle, e.clientX, e.clientY);
      } else {
        hovered = null;
        canvas.style.cursor = 'default';
        hideTip();
      }
    });

    canvas.addEventListener('mouseleave', () => {
      hovered = null;
      canvas.style.cursor = 'default';
      hideTip();
    });

    canvas.addEventListener('click', e => {
      const rect = canvas.getBoundingClientRect();
      const cx   = (e.clientX - rect.left) * (W / rect.width);
      const cy   = (e.clientY - rect.top)  * (H / rect.height);
      const hit  = hitTest(cx, cy);
      if (hit && hit.particle.linkedin) {
        window.open(hit.particle.linkedin, '_blank', 'noopener,noreferrer');
      }
    });
  };

})();
