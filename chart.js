// ═══════════════════════════════════════════════════════════════════════════════
// chart.js — Canvas-based interactive chart
// Globals: MARGIN, CHART_H, BG_COLOR, OVAL_RX, PALETTE, alumni,
//          buildLayout, fieldColor, showTip, moveTip, hideTip
// ═══════════════════════════════════════════════════════════════════════════════

(function () {

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const clamp01   = t => Math.max(0, Math.min(1, t));
  const lerp      = (a, b, t) => a + (b - a) * t;
  const easeInOut = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;

  function rand(s) {
    const x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }
  function rgba(hex, a) {
    const n = parseInt(hex.replace('#', ''), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(2)})`;
  }
  function hexRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function getNodeRx(node) {
    if (!node) return OVAL_RX;
    return Math.min(42, Math.max(OVAL_RX, Math.sqrt(node.count || 1) * 3.5));
  }

  // Lens / almond shape: 4-arc bezier with side CPs pulled inward.
  // Works for any aspect ratio. Pointed at left/right, round at top/bottom.
  // pullFactor ≈ 0 for very elongated (ry >> rx) → maximally pointed sides.
  // pullFactor ≈ 1 for square/fat → standard ellipse (no pointing needed).
  function drawLens(cx, cy, rx, ry) {
    const K          = 0.5523;
    const pullFactor = Math.max(0, Math.min(1, 1.2 * rx / ry));
    // tipOffset = 0 → CP at same x as tip (standard, smooth).
    // tipOffset = rx → CP pulled to centre x (maximum pointing).
    const tipOffset  = rx * (1 - pullFactor);

    ctx.beginPath();
    ctx.moveTo(cx - rx, cy);
    ctx.bezierCurveTo(cx - rx + tipOffset, cy - K * ry,   cx - K * rx, cy - ry,   cx, cy - ry);
    ctx.bezierCurveTo(cx + K * rx,         cy - ry,        cx + rx - tipOffset, cy - K * ry,   cx + rx, cy);
    ctx.bezierCurveTo(cx + rx - tipOffset, cy + K * ry,   cx + K * rx, cy + ry,   cx, cy + ry);
    ctx.bezierCurveTo(cx - K * rx,         cy + ry,        cx - rx + tipOffset, cy + K * ry,   cx - rx, cy);
    ctx.closePath();
  }

  // ── Module state ──────────────────────────────────────────────────────────────
  let containerEl = null, canvas = null, ctx = null, W = 0;
  const H = () => CHART_H;

  let currentData    = null;
  let animState      = null;
  let dotHoverNode   = null; // { ci, nodeVal, color } — cluster+color hover
  let lineHoveredIdx = -1;   // individual line hover (tooltip + LinkedIn)
  let selectedIdx    = -1;
  let rafId          = null;


  // ── Data building ──────────────────────────────────────────────────────────────
  // Uses sorted yPos from buildLayout as y-base (preserves bundling order).
  // X-jitter follows ellipse profile → oval-shaped clusters.
  function buildData(view, scatterSeed) {
    const { columns, rows, yPos, xs } = buildLayout(alumni, view, W);

    const nodeMaps = columns.map(col => {
      const m = {};
      col.nodes.forEach(n => { m[n.value] = n; });
      return m;
    });

    // Per-node x-offset: scatter clusters within the same column stage
    const nodeXOffsets = columns.map((col, ci) => {
      const m = {}, n = col.nodes.length;
      const spread = Math.min(70, Math.max(22, n * 9));
      col.nodes.forEach(node => {
        const h = [...node.value].reduce((a, c) => a * 31 + c.charCodeAt(0), ci * 97 + 1) & 0x7fff;
        m[node.value] = (rand(h) - 0.5) * 2 * spread;
      });
      return m;
    });

    const personRows = rows.map((row, ri) => {
      const s0    = ri * 53 + 7;
      const color = fieldColor(row.person);

      const dots = xs.map((x, ci) => {
        const node     = nodeMaps[ci][row.vals[ci]];
        const baseY    = yPos[ri][ci];
        const nodeXOff = nodeXOffsets[ci][row.vals[ci]] || 0;
        let jx, dotY;

        if (node && node.height > 1) {
          const ry    = Math.max(1, node.height / 2);
          const rx    = getNodeRx(node);
          const t     = clamp01((baseY - node.y) / node.height);
          const dy    = t * 2 - 1;
          const maxJx = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
          jx   = (rand(s0 + ci * 17 + 1) * 2 - 1) * maxJx * 0.88;
          dotY = baseY + (rand(s0 + ci * 17 + 2) - 0.5) * 4;
        } else {
          jx   = (rand(s0 + ci * 17 + 1) - 0.5) * 7;
          dotY = baseY;
        }
        return { x: MARGIN.left + x + nodeXOff + jx, y: MARGIN.top + dotY };
      });

      const scatter = dots.map((_, di) => scatterPt(ri, di, scatterSeed));
      return { person: row.person, vals: row.vals, color, dots, scatter };
    });

    return { personRows, columns, xs, nodeXOffsets, view };
  }

  function scatterPt(ri, di, seed) {
    const s     = ri * 71 + di * 37 + seed * 113;
    const angle = rand(s) * Math.PI * 2;
    const dist  = Math.hypot(W, H()) * (0.55 + rand(s + 1) * 0.30);
    return { x: W / 2 + Math.cos(angle) * dist, y: H() / 2 + Math.sin(angle) * dist };
  }

  // ── Drawing helpers ────────────────────────────────────────────────────────────
  function drawLines(personRows, getDot, lineAlpha, lineW) {
    for (let ri = 0; ri < personRows.length; ri++) {
      const pd = personRows[ri];
      if (pd.dots.length < 2) continue;
      ctx.beginPath();
      const d0 = getDot(pd, ri, 0);
      ctx.moveTo(d0.x, d0.y);
      for (let ci = 1; ci < pd.dots.length; ci++) {
        const a = getDot(pd, ri, ci - 1), b = getDot(pd, ri, ci);
        const mx = (a.x + b.x) / 2;
        ctx.bezierCurveTo(mx, a.y, mx, b.y, b.x, b.y);
      }
      ctx.strokeStyle = rgba(pd.color, lineAlpha);
      ctx.lineWidth   = lineW;
      ctx.stroke();
    }
  }

  function drawDots(personRows, getDot, dotAlpha, radius) {
    for (let ri = 0; ri < personRows.length; ri++) {
      const pd = personRows[ri];
      for (let ci = 0; ci < pd.dots.length; ci++) {
        const d = getDot(pd, ri, ci);
        ctx.beginPath();
        ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = rgba(pd.color, dotAlpha);
        ctx.fill();
      }
    }
  }

  // Circle radius for a node — proportional to sqrt(count)
  function getNodeCircleR(node, maxCount) {
    const minR = 6, maxR = 42;
    return Math.max(minR, Math.min(maxR, Math.sqrt(node.count / maxCount) * maxR));
  }

  function drawNodeCircles(columns, xs, nodeXOffsets, alpha) {
    if (alpha <= 0) return;
    ctx.globalAlpha = alpha;
    const maxCount = Math.max(...columns.flatMap(col => col.nodes.map(n => n.count)));
    columns.forEach((col, ci) => {
      const xOff = nodeXOffsets ? nodeXOffsets[ci] : {};
      col.nodes.forEach(node => {
        const off = (xOff && xOff[node.value]) || 0;
        const cx  = MARGIN.left + xs[ci] + off;
        const cy  = MARGIN.top + node.y + node.height / 2;
        const r   = getNodeCircleR(node, maxCount);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(26,25,22,0.22)';
        ctx.lineWidth   = 1;
        ctx.stroke();
      });
    });
    ctx.globalAlpha = 1;
  }

  function drawLabels(columns, xs, nodeXOffsets, alpha) {
    if (alpha <= 0) return;
    ctx.globalAlpha = alpha;
    const nCols = columns.length;
    const maxCount = Math.max(...columns.flatMap(col => col.nodes.map(n => n.count)));

    columns.forEach((col, ci) => {
      const colCx = MARGIN.left + xs[ci];

      // Column header
      ctx.font          = "bold 10.5px 'Inter', -apple-system, sans-serif";
      ctx.letterSpacing = '0.10em';
      ctx.textAlign     = 'center';
      ctx.fillStyle     = '#6b6960';
      ctx.fillText(col.col.label, colCx, MARGIN.top - 38);
      ctx.letterSpacing = '0';
      ctx.beginPath();
      ctx.moveTo(colCx, MARGIN.top - 24);
      ctx.lineTo(colCx, MARGIN.top - 12);
      ctx.strokeStyle = 'rgba(26,25,22,0.20)';
      ctx.lineWidth   = 1;
      ctx.stroke();

      // Node labels with leader lines
      const xOffs = nodeXOffsets ? nodeXOffsets[ci] : {};
      const isLeft = ci < nCols / 2;
      col.nodes.forEach(node => {
        if (node.height < 8) return;
        const off = (xOffs && xOffs[node.value]) || 0;
        const ncx = MARGIN.left + xs[ci] + off;
        const ncy = MARGIN.top + node.y + node.height / 2;
        const r   = getNodeCircleR(node, maxCount);
        const dir = isLeft ? -1 : 1;

        // Leader line: circle edge → elbow → horizontal
        const lx1 = ncx + dir * r;
        const lx2 = ncx + dir * (r + 10);
        const lx3 = ncx + dir * (r + 28);
        const ly2 = ncy - 6;

        ctx.beginPath();
        ctx.moveTo(lx1, ncy);
        ctx.lineTo(lx2, ly2);
        ctx.lineTo(lx3, ly2);
        ctx.strokeStyle = 'rgba(26,25,22,0.28)';
        ctx.lineWidth   = 0.7;
        ctx.stroke();

        // Label text
        ctx.textAlign = isLeft ? 'right' : 'left';
        const tx = lx3 + dir * 3;

        ctx.font      = "italic 11px 'Inter', Georgia, serif";
        ctx.fillStyle = '#1a1916';
        ctx.fillText(node.value, tx, ly2 - 4);

        ctx.font      = "9.5px 'Inter', sans-serif";
        ctx.fillStyle = 'rgba(26,25,22,0.45)';
        ctx.fillText(`${node.count} ${node.count === 1 ? 'person' : 'people'}`, tx, ly2 + 9);
      });
    });
    ctx.globalAlpha = 1;
  }

  // Dashed vertical lines between columns to separate stages
  function drawStageSeparators(xs, alpha) {
    if (alpha <= 0 || xs.length < 2) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.setLineDash([4, 7]);
    ctx.strokeStyle = 'rgba(26,25,22,0.12)';
    ctx.lineWidth   = 0.8;
    for (let i = 0; i + 1 < xs.length; i++) {
      const sepX = MARGIN.left + (xs[i] + xs[i + 1]) / 2;
      ctx.beginPath();
      ctx.moveTo(sepX, MARGIN.top - 10);
      ctx.lineTo(sepX, CHART_H - MARGIN.bottom + 10);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── Animation frame ────────────────────────────────────────────────────────────
  // ── Tab-switch: 3-phase cluster transition ────────────────────────────────
  //   0          → GATHER_END : dots fly from chart into a loose center cluster
  //   GATHER_END → PULSE_END  : cluster breathes / pulses (feels alive)
  //   PULSE_END  → 1          : dots reform into new chart layout
  const GATHER_END = 0.35;
  const PULSE_END  = 0.65;
  const CLUSTER_R  = 68;   // cluster radius (px)
  const PULSE_HZ   = 4.0;  // breathing cycles per second during pulse phase

  // Deterministic cluster position for a given dot seed
  function clusterPos(seed, cx, cy) {
    const angle = rand(seed * 37 + 5) * Math.PI * 2;
    const r     = CLUSTER_R * Math.sqrt(rand(seed * 53 + 11));
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }

  function drawFrame() {
    ctx.clearRect(0, 0, W, H());
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, W, H());

    const now = performance.now();

    if (animState) {
      const t  = clamp01((now - animState.t0) / animState.dur);
      const cx = W / 2;
      const cy = MARGIN.top + (H() - MARGIN.top - MARGIN.bottom) / 2;

      if (t < GATHER_END) {
        // ── Phase 1: dots fly from chart positions into center cluster ─────
        const t1 = easeInOut(t / GATHER_END);
        for (let ri = 0; ri < animState.from.personRows.length; ri++) {
          const pd = animState.from.personRows[ri];
          for (let ci = 0; ci < pd.dots.length; ci++) {
            const src = pd.dots[ci];
            const dst = clusterPos(ri * 20 + ci, cx, cy);
            ctx.beginPath();
            ctx.arc(lerp(src.x, dst.x, t1), lerp(src.y, dst.y, t1), 2.5, 0, Math.PI * 2);
            ctx.fillStyle = rgba(pd.color, lerp(0.72, 0.92, t1));
            ctx.fill();
          }
        }

      } else if (t < PULSE_END) {
        // ── Phase 2: cluster breathes / pulses ─────────────────────────────
        const freq   = PULSE_HZ * Math.PI * 2 * 0.001; // rad/ms
        const breath = Math.sin(now * freq);            // -1 → +1, live per frame

        const personRows = animState.to.personRows;
        for (let ri = 0; ri < personRows.length; ri++) {
          const pd = personRows[ri];
          for (let ci = 0; ci < pd.dots.length; ci++) {
            const seed     = ri * 20 + ci;
            const cp       = clusterPos(seed, cx, cy);
            const phaseOff = rand(seed * 13 + 3) * Math.PI * 2; // unique phase per dot
            const dotB     = Math.sin(now * freq + phaseOff);    // per-dot breath offset

            // Radial pulse outward/inward + small tangential shimmer
            const angle   = Math.atan2(cp.y - cy, cp.x - cx);
            const baseR   = Math.hypot(cp.x - cx, cp.y - cy);
            const pulsedR = baseR * (1 + dotB * 0.26);
            const shimmer = dotB * 2.2;

            const x = cx + pulsedR * Math.cos(angle) + Math.cos(angle + Math.PI / 2) * shimmer;
            const y = cy + pulsedR * Math.sin(angle) + Math.sin(angle + Math.PI / 2) * shimmer;
            const r = 2.0 + (dotB * 0.5 + 0.5) * 1.8; // 2.0 → 3.8 px
            const a = 0.60 + (dotB * 0.5 + 0.5) * 0.35;

            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = rgba(pd.color, a);
            ctx.fill();
          }
        }

      } else {
        // ── Phase 3: dots fly from cluster to new chart positions ──────────
        const t3 = easeInOut((t - PULSE_END) / (1 - PULSE_END));
        const { personRows, columns, xs, nodeXOffsets } = animState.to;

        drawStageSeparators(xs, clamp01((t3 - 0.50) / 0.50));

        for (let ri = 0; ri < personRows.length; ri++) {
          const pd = personRows[ri];
          for (let ci = 0; ci < pd.dots.length; ci++) {
            const src = clusterPos(ri * 20 + ci, cx, cy);
            const dst = pd.dots[ci];
            ctx.beginPath();
            ctx.arc(lerp(src.x, dst.x, t3), lerp(src.y, dst.y, t3), 2.5, 0, Math.PI * 2);
            ctx.fillStyle = rgba(pd.color, lerp(0.92, 0.85, t3));
            ctx.fill();
          }
        }

        drawNodeCircles(columns, xs, nodeXOffsets, clamp01((t3 - 0.60) / 0.40));
        drawLabels(columns, xs, nodeXOffsets, clamp01((t3 - 0.70) / 0.30));

        if (t >= 1) { currentData = animState.to; animState = null; }
      }

    } else if (currentData) {
      // ── Stable state ─────────────────────────────────────────────────────
      const { personRows, columns, xs, nodeXOffsets } = currentData;
      const hasDotHL  = dotHoverNode !== null;
      const hasLineHL = lineHoveredIdx >= 0 || selectedIdx >= 0;
      const hasHL     = hasDotHL || hasLineHL;

      const isHL = (pd, ri) => {
        if (hasDotHL)
          return pd.color === dotHoverNode.color && pd.vals[dotHoverNode.ci] === dotHoverNode.nodeVal;
        return ri === lineHoveredIdx || ri === selectedIdx;
      };

      drawStageSeparators(xs, 1.0);

      // Lines
      for (let ri = 0; ri < personRows.length; ri++) {
        const pd      = personRows[ri];
        const hi      = isHL(pd, ri);
        const la      = hasHL && !hi ? 0.04 : hi ? (hasDotHL ? 0.55 : 0.88) : 0.20;
        const lw      = hi ? (hasDotHL ? 0.9 : 1.8) : 0.6;
        const n       = pd.dots.length;
        if (n < 2) continue;
        ctx.beginPath();
        ctx.moveTo(pd.dots[0].x, pd.dots[0].y);
        for (let ci = 1; ci < n; ci++) {
          const mx = (pd.dots[ci - 1].x + pd.dots[ci].x) / 2;
          ctx.bezierCurveTo(mx, pd.dots[ci-1].y, mx, pd.dots[ci].y, pd.dots[ci].x, pd.dots[ci].y);
        }
        ctx.strokeStyle = rgba(pd.color, la);
        ctx.lineWidth   = lw;
        ctx.stroke();
      }

      // Oval outlines (above lines, below dots)
      drawNodeCircles(columns, xs, nodeXOffsets, 1.0);

      // Dots
      for (let ri = 0; ri < personRows.length; ri++) {
        const pd = personRows[ri];
        const hi = isHL(pd, ri);
        const da = hasHL && !hi ? 0.07 : 0.85;
        const r  = hasLineHL && !hasDotHL && hi ? 5 : 3;
        for (const dot of pd.dots) {
          ctx.beginPath();
          ctx.arc(dot.x, dot.y, r, 0, Math.PI * 2);
          ctx.fillStyle = rgba(pd.color, da);
          ctx.fill();
        }
      }

      drawLabels(columns, xs, nodeXOffsets, 1);
    }

    rafId = requestAnimationFrame(drawFrame);
  }

  // ── Hit testing ────────────────────────────────────────────────────────────────
  function findPersonAt(mx, my) {
    if (!currentData || animState) return -1;
    let best = -1, bestD = 9; // tight radius: only dots, not lines
    for (let ri = 0; ri < currentData.personRows.length; ri++) {
      for (const d of currentData.personRows[ri].dots) {
        const dist = Math.hypot(d.x - mx, d.y - my);
        if (dist < bestD) { bestD = dist; best = ri; }
      }
    }
    return best;
  }

  // Sample each bezier at 12 points to find nearby lines
  function findLineAt(mx, my) {
    if (!currentData || animState) return -1;
    let best = -1, bestD = 5;
    for (let ri = 0; ri < currentData.personRows.length; ri++) {
      const pd = currentData.personRows[ri];
      for (let ci = 1; ci < pd.dots.length; ci++) {
        const a = pd.dots[ci - 1], b = pd.dots[ci];
        const mc = (a.x + b.x) / 2;
        for (let k = 0; k <= 12; k++) {
          const t = k / 12, mt = 1 - t;
          // Simplified bezier: P1.x=P2.x=mc, so x simplifies nicely
          const bx = mt*mt*mt*a.x + 3*mt*t*mc + t*t*t*b.x;
          const by = a.y*mt*mt*(1 + 2*t) + b.y*t*t*(3 - 2*t);
          const d = Math.hypot(bx - mx, by - my);
          if (d < bestD) { bestD = d; best = ri; }
        }
      }
    }
    return best;
  }

  // ── Stats / canvas management ──────────────────────────────────────────────────
  function updateStats(n) {
    document.getElementById('stats').innerHTML =
      `<strong>${n.toLocaleString()}</strong> of
       <strong>${alumni.length.toLocaleString()}</strong> alumni shown
       (${Math.round(n / alumni.length * 100)}% with complete data for this view) ·
       <span style="color:#a8a79f">hover dots to highlight group · hover lines to identify</span>`;
  }

  function ensureCanvas() {
    if (!containerEl.contains(canvas)) {
      containerEl.innerHTML = '';
      containerEl.appendChild(canvas);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────────
  window.initChartCanvas = function (el) {
    containerEl = el;
    W = el.clientWidth || 1400;

    canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = CHART_H;
    canvas.style.display = 'block';
    ctx = canvas.getContext('2d');

    // ── Mouse events ─────────────────────────────────────────────────────────
    canvas.addEventListener('mousemove', e => {
      if (animState) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;

      const dotIdx = findPersonAt(mx, my);
      if (dotIdx >= 0) {
        // Dot hover: find which of this person's column-dots is closest
        const pd = currentData.personRows[dotIdx];
        let closestCi = 0, closestD = Infinity;
        pd.dots.forEach((d, ci) => {
          const dist = Math.hypot(d.x - mx, d.y - my);
          if (dist < closestD) { closestD = dist; closestCi = ci; }
        });
        const next = { ci: closestCi, nodeVal: pd.vals[closestCi], color: pd.color };
        if (!dotHoverNode ||
            dotHoverNode.ci !== next.ci ||
            dotHoverNode.nodeVal !== next.nodeVal ||
            dotHoverNode.color !== next.color) {
          dotHoverNode = next;
        }
        if (lineHoveredIdx !== -1) { lineHoveredIdx = -1; hideTip(); }
        canvas.style.cursor = 'default';

      } else {
        dotHoverNode = null;
        const lineIdx = findLineAt(mx, my);
        if (lineIdx >= 0) {
          if (lineHoveredIdx !== lineIdx) {
            lineHoveredIdx = lineIdx;
            const pd = currentData.personRows[lineIdx];
            showTip(
              `<strong>${pd.person.full_name || '—'}</strong><br>
               <span style="opacity:0.8">${(pd.person.headline || '').trim()}</span><br>
               <span style="font-size:11px;opacity:0.55">Click to open LinkedIn</span>`,
              e
            );
            canvas.style.cursor = 'pointer';
          } else {
            moveTip(e);
          }
        } else {
          if (lineHoveredIdx !== -1) { lineHoveredIdx = -1; hideTip(); canvas.style.cursor = ''; }
        }
      }
    });

    canvas.addEventListener('mouseleave', () => {
      dotHoverNode = null; lineHoveredIdx = -1; hideTip();
    });

    canvas.addEventListener('click', e => {
      if (animState) return;
      // Only navigate on line hover, not dot hover
      if (lineHoveredIdx >= 0) {
        const pd = currentData.personRows[lineHoveredIdx];
        selectedIdx = lineHoveredIdx;
        document.getElementById('sel-name').textContent     = pd.person.full_name || '—';
        document.getElementById('sel-headline').textContent = (pd.person.headline || '').trim();
        const lk = document.getElementById('sel-link');
        if (pd.person.linkedin) { lk.href = pd.person.linkedin; lk.style.display = 'inline'; }
        else lk.style.display = 'none';
        document.getElementById('selected-bar').style.display = 'flex';
        if (pd.person.linkedin) window.open(pd.person.linkedin, '_blank');
      } else if (!dotHoverNode) {
        // Click on empty space: clear selection
        selectedIdx = -1;
        document.getElementById('selected-bar').style.display = 'none';
      }
    });

    document.getElementById('sel-close').addEventListener('click', () => {
      selectedIdx = -1;
      document.getElementById('selected-bar').style.display = 'none';
    });

    // ── Resize ───────────────────────────────────────────────────────────────
    let rt;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        W = containerEl.clientWidth || 1400;
        canvas.width = W;
        if (currentData?.view) {
          animState = null;
          currentData = buildData(currentData.view, 41);
        }
      }, 150);
    });

    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(drawFrame);
  };

  window.renderView = function (view) {
    if (!canvas) return;
    ensureCanvas();
    currentData    = buildData(view, 41);
    animState      = null;
    dotHoverNode   = null;
    lineHoveredIdx = -1;
    selectedIdx    = -1;
    document.getElementById('selected-bar').style.display = 'none';
    updateStats(currentData.personRows.length);
  };

  window.switchView = function (view) {
    if (!canvas) return;
    ensureCanvas();

    const from = currentData;
    const to   = buildData(view, 99);
    if (!from) { currentData = to; return; }

    animState      = { from, to, t0: performance.now(), dur: 1200 };
    dotHoverNode   = null;
    lineHoveredIdx = -1;
    selectedIdx    = -1;
    document.getElementById('selected-bar').style.display = 'none';
    updateStats(to.personRows.length);
  };

  // ── Explore view: render arbitrary alumni+view on the shared canvas ──────────
  window.renderExploreCanvas = function (syntheticAlumni, syntheticView) {
    if (!canvas) return;
    ensureCanvas();

    // Build layout from synthetic data
    const { columns, rows, yPos, xs } = buildLayout(syntheticAlumni, syntheticView, W);

    const nodeMaps = columns.map(col => {
      const m = {};
      col.nodes.forEach(n => { m[n.value] = n; });
      return m;
    });

    const nodeXOffsets = columns.map((col, ci) => {
      const m = {}, n = col.nodes.length;
      const spread = Math.min(70, Math.max(22, n * 9));
      col.nodes.forEach(node => {
        const h = [...node.value].reduce((a, c) => a * 31 + c.charCodeAt(0), ci * 97 + 1) & 0x7fff;
        m[node.value] = (rand(h) - 0.5) * 2 * spread;
      });
      return m;
    });

    // Color by first column value (matching main chart style)
    const personRows = rows.map((row, ri) => {
      const s0 = ri * 53 + 7;
      const color = fieldColor(row.person) || dynColor(row.vals[0]);

      const dots = xs.map((x, ci) => {
        const node     = nodeMaps[ci][row.vals[ci]];
        const baseY    = yPos[ri][ci];
        const nodeXOff = nodeXOffsets[ci][row.vals[ci]] || 0;
        let jx, dotY;

        if (node && node.height > 1) {
          const ry    = Math.max(1, node.height / 2);
          const rx    = getNodeRx(node);
          const t     = clamp01((baseY - node.y) / node.height);
          const dy    = t * 2 - 1;
          const maxJx = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
          jx   = (rand(s0 + ci * 17 + 1) * 2 - 1) * maxJx * 0.88;
          dotY = baseY + (rand(s0 + ci * 17 + 2) - 0.5) * 4;
        } else {
          jx   = (rand(s0 + ci * 17 + 1) - 0.5) * 7;
          dotY = baseY;
        }
        return { x: MARGIN.left + x + nodeXOff + jx, y: MARGIN.top + dotY };
      });

      return { person: row.person, vals: row.vals, color, dots };
    });

    currentData    = { personRows, columns, xs, nodeXOffsets, view: syntheticView };
    animState      = null;
    dotHoverNode   = null;
    lineHoveredIdx = -1;
    selectedIdx    = -1;
    document.getElementById('selected-bar').style.display = 'none';

    document.getElementById('stats').innerHTML =
      `<strong>${personRows.length.toLocaleString()}</strong> alumni match · ` +
      `<span style="color:#a8a79f">hover dots to highlight group · hover lines to identify</span>`;
  };

  // Fallback color for explore (same hash approach)
  const FALLBACKS = ["#3b82f6","#ef4444","#7c3aed","#d97706","#0891b2","#059669","#ea580c","#db2777","#65a30d","#0284c7"];
  function dynColor(v) {
    if (PALETTE[v]) return PALETTE[v];
    let h = 0; for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) | 0;
    return FALLBACKS[Math.abs(h) % FALLBACKS.length];
  }

})();
