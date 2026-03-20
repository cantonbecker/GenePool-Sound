"use strict";

// ============================================================================
//  utteranceStats.js — Darwin's Chorus — Canton Becker
//
//  Real-time utterance statistics overlay for the living swimbot population.
//  Triggered from the "Utterance Statistics..." link in the Pool panel.
//
//  Shows canvas-based histograms and a scatter plot so you can quickly answer:
//    - Is utterRange diverse or has everything converged to the same value?
//    - Are there tribal clusters in period × duration space?
//    - Is there variety in song complexity (note count, mod count, pitch span)?
//    - How are the underlying genes distributed across the population?
//
//  Data source: genePool.getLivingSwimbotUtteranceData()  (GenePool.js)
// ============================================================================

const UtteranceStats = (function() {

    // ---- colour palette (dark theme) ----
    const C = {
        surface:   '#272b22',   // chart background
        border:    '#363a2e',   // borders
        text:      '#ced1c6',   // primary text
        subtext:   '#6a6e62',   // axis labels / secondary
        meanLine:  '#ffffff',
        sdShade:   'rgba(255,255,255,0.07)',
        // per-metric hues
        timing:    '#7ab87a',   // green — period / duration / duty
        range:     '#d4844a',   // orange — utterance range
        compose:   '#5a9ab8',   // blue — note count / mod count / span
        pref:      '#9a7ab8',   // purple — utterance preference
    };

    // ---- stats helpers ----

    function calcStats(arr) {
        if (!arr.length) return { mean: 0, sd: 0, min: 0, max: 0, n: 0, cv: 0 };
        const n    = arr.length;
        const min  = Math.min.apply(null, arr);
        const max  = Math.max.apply(null, arr);
        const mean = arr.reduce(function(s, v) { return s + v; }, 0) / n;
        const sd   = Math.sqrt(arr.reduce(function(s, v) { return s + (v - mean) * (v - mean); }, 0) / n);
        const cv   = mean !== 0 ? sd / mean : 0;  // coefficient of variation (σ/μ)
        return { mean: mean, sd: sd, min: min, max: max, n: n, cv: cv };
    }

    function makeBins(values, binCount, lo, hi) {
        const bins = new Array(binCount).fill(0);
        const span = (hi - lo) || 1;
        values.forEach(function(v) {
            const b = Math.min(binCount - 1, Math.max(0, Math.floor(((v - lo) / span) * binCount)));
            bins[b]++;
        });
        return bins;
    }

    function fmt(v, dp) {
        if (dp !== undefined) return (+v).toFixed(dp);
        const a = Math.abs(v);
        return a >= 100 ? (+v).toFixed(0) : a >= 10 ? (+v).toFixed(1) : (+v).toFixed(2);
    }

    // ---- auto-refresh state ----
    let _refreshInterval = 0;   // seconds; 0 = do not refresh
    let _refreshTimer    = null;

    function setRefresh(seconds) {
        _refreshInterval = seconds;
        if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
        if (seconds > 0) {
            _refreshTimer = setInterval(function() {
                buildAndRender(genePool.getLivingSwimbotUtteranceData());
            }, seconds * 1000);
        }
    }

    // ---- diversity label (colour-coded badge text based on coefficient of variation) ----

    function diversityLabel(cv) {
        if (cv < 0.04) return { text: 'nearly identical',    color: '#e05050' };
        if (cv < 0.10) return { text: 'low diversity',       color: '#d4844a' };
        if (cv < 0.20) return { text: 'moderate diversity',  color: '#c8c840' };
        return                 { text: 'good diversity',      color: '#7ab87a' };
    }

    // ---- canvas chart renderers ----

    // Draws a histogram with a shaded ±1σ band and a mean line.
    // label is drawn directly onto the canvas so it appears in saved PNGs.
    function drawHistogram(canvas, values, lo, hi, barColor, binCount, label) {
        binCount = binCount || 20;
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        const P = { t: 20, r: 8, b: 18, l: 28 };  // t=20 reserves room for the label
        const cW = W - P.l - P.r;
        const cH = H - P.t - P.b;

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = C.surface;
        ctx.fillRect(0, 0, W, H);

        // label drawn on canvas so it composites into saved PNGs
        if (label) {
            ctx.fillStyle = '#9a9e92';
            ctx.font      = 'bold 10px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(label, P.l, 13);
        }

        if (!values || !values.length) {
            ctx.fillStyle = C.subtext;
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('no data', W / 2, H / 2);
            return;
        }

        const bins  = makeBins(values, binCount, lo, hi);
        const maxBin = Math.max.apply(null, bins) || 1;
        const st    = calcStats(values);
        const bW    = cW / binCount;

        function toX(v) { return P.l + ((v - lo) / (hi - lo)) * cW; }

        // ±1σ shaded band
        const sx1 = Math.max(P.l,        toX(st.mean - st.sd));
        const sx2 = Math.min(P.l + cW,   toX(st.mean + st.sd));
        ctx.fillStyle = C.sdShade;
        ctx.fillRect(sx1, P.t, sx2 - sx1, cH);

        // bars
        ctx.fillStyle = barColor;
        bins.forEach(function(cnt, i) {
            const bh = (cnt / maxBin) * cH;
            ctx.fillRect(P.l + i * bW + 1, P.t + cH - bh, bW - 2, bh);
        });

        // mean line
        ctx.strokeStyle = C.meanLine;
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(toX(st.mean), P.t);
        ctx.lineTo(toX(st.mean), P.t + cH);
        ctx.stroke();
        ctx.setLineDash([]);

        // x-axis baseline
        ctx.strokeStyle = C.border;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(P.l, P.t + cH);
        ctx.lineTo(P.l + cW, P.t + cH);
        ctx.stroke();

        // x-axis tick labels (lo, mid, hi)
        ctx.fillStyle = C.subtext;
        ctx.font      = '9px Arial';
        ctx.textAlign = 'left';  ctx.fillText(fmt(lo),              P.l,            H - 2);
        ctx.textAlign = 'center'; ctx.fillText(fmt((lo + hi) / 2),  P.l + cW / 2,  H - 2);
        ctx.textAlign = 'right'; ctx.fillText(fmt(hi),               P.l + cW,      H - 2);

        // y-axis max count label
        ctx.textAlign = 'right';
        ctx.fillText(maxBin, P.l - 2, P.t + 8);
    }

    // Scatter plot: utterPeriod (x) vs utterDuration (y).
    // Each dot is coloured by utterRange: blue=small, orange-red=large.
    // Faint diagonal lines show equal-duty-cycle contours.
    function drawScatter(canvas, data, label) {
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        const P = { t: 24, r: 16, b: 34, l: 38 };  // t=24 reserves room for label
        const cW = W - P.l - P.r;
        const cH = H - P.t - P.b;

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = C.surface;
        ctx.fillRect(0, 0, W, H);

        // label drawn on canvas so it composites into saved PNGs
        if (label) {
            ctx.fillStyle = '#9a9e92';
            ctx.font      = 'bold 10px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(label, P.l, 15);
            ctx.fillStyle = '#5a6050';
            ctx.font      = '9px Arial';
            ctx.fillText('dot colour = utterRange: blue=small range, orange=large   \u2014   diagonals = equal duty cycle', P.l, 24);
        }

        const xLo = 160, xHi = 640, yLo = 60, yHi = 150;
        const rLo = 150, rHi = 600;

        function toX(p) { return P.l + ((p - xLo) / (xHi - xLo)) * cW; }
        function toY(d) { return P.t + cH - ((d - yLo) / (yHi - yLo)) * cH; }

        // duty-cycle iso-contour lines
        const dutyLines = [0.1, 0.2, 0.3, 0.5, 0.7];
        ctx.setLineDash([2, 4]);
        ctx.lineWidth = 1;
        dutyLines.forEach(function(dc) {
            ctx.strokeStyle = 'rgba(140, 150, 120, 0.25)';
            ctx.beginPath();
            // line: d = dc * p; we clip to the domain box
            // start: clamp d to [yLo, yHi]
            let p0 = yLo / dc;
            let p1 = yHi / dc;
            p0 = Math.max(xLo, Math.min(xHi, p0));
            p1 = Math.max(xLo, Math.min(xHi, p1));
            const d0 = dc * p0;
            const d1 = dc * p1;
            if (d0 >= yLo && d0 <= yHi) {
                ctx.moveTo(toX(p0), toY(d0));
                ctx.lineTo(toX(p1), toY(d1));
            }
            ctx.stroke();

            // label near right edge
            const dAtXHi = dc * xHi;
            if (dAtXHi >= yLo && dAtXHi <= yHi) {
                ctx.fillStyle = 'rgba(140,150,120,0.5)';
                ctx.font = '8px Arial';
                ctx.textAlign = 'left';
                ctx.fillText('dc=' + dc, toX(xHi) + 2, toY(dAtXHi) + 3);
            }
        });
        ctx.setLineDash([]);

        // dots
        if (data && data.length) {
            data.forEach(function(d) {
                const x  = toX(d.utterPeriod);
                const y  = toY(d.utterDuration);
                const rf = (d.utterRange - rLo) / (rHi - rLo);  // 0=small range (blue), 1=large (orange-red)
                const r  = Math.round(90  + rf * 165);
                const g  = Math.round(154 + rf * -80);
                const b  = Math.round(184 + rf * -160);
                ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.75)';
                ctx.beginPath();
                // Deterministic jitter: siblings with identical genes stack exactly.
                // We spread them using the golden angle (137.508°) keyed on each
                // swimbot's slot index, so the nudge is fixed across refreshes and
                // dots don't vibrate. Radius cycles 0–4 px over every 5 slots.
                const GOLDEN = 2.39996323;   // radians — golden angle
                const jAngle  = d.index * GOLDEN;
                const jRadius = (d.index % 5) * 1.2;   // 0, 1.2, 2.4, 3.6, 4.8 px
                const jx = x + Math.cos(jAngle) * jRadius;
                const jy = y + Math.sin(jAngle) * jRadius;
                ctx.arc(jx, jy, 3, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // axes
        ctx.strokeStyle = C.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(P.l, P.t);
        ctx.lineTo(P.l, P.t + cH);
        ctx.lineTo(P.l + cW, P.t + cH);
        ctx.stroke();

        // x-axis tick labels
        ctx.fillStyle = C.subtext;
        ctx.font = '9px Arial';
        ctx.textAlign = 'center';
        [160, 280, 400, 520, 640].forEach(function(v) {
            ctx.fillText(v, toX(v), P.t + cH + 10);
        });

        // y-axis tick labels
        ctx.textAlign = 'right';
        [60, 90, 120, 150].forEach(function(v) {
            ctx.fillText(v, P.l - 4, toY(v) + 3);
        });

        // axis titles
        ctx.fillStyle = C.subtext;
        ctx.font = '9px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('utterPeriod →', P.l + cW / 2, H - 2);

        ctx.save();
        ctx.translate(11, P.t + cH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText('utterDuration →', 0, 0);
        ctx.restore();
    }

    // ---- HTML builders ----

    function statsLine(st, unit, dp) {
        unit = unit || '';
        const mu  = fmt(st.mean, dp) + unit;
        const sig = fmt(st.sd,   dp) + unit;
        const mn  = fmt(st.min,  dp);
        const mx  = fmt(st.max,  dp);
        return '<span>\u03bc=' + mu + ' &nbsp; \u03c3=' + sig +
               ' &nbsp; min=' + mn + ' &nbsp; max=' + mx + '</span>';
    }

    function chartUnit(id, label, statsHtml, width, height) {
        width  = width  || 270;
        height = height || 140;   // label div removed — extra height recovered into canvas
        return '<div class="ust-chart-unit">' +
                   '<canvas id="' + id + '" width="' + width + '" height="' + height + '"></canvas>' +
                   '<div class="ust-chart-stats">' + statsHtml + '</div>' +
               '</div>';
    }

    function badge(label, div) {
        return '<span class="ust-badge" style="background:' + div.color + '18;' +
               'border-color:' + div.color + ';color:' + div.color + '">' +
               label + ': ' + div.text + '</span>';
    }

    // ---- main panel builder ----

    function buildAndRender(rawData) {
        const panel = document.getElementById('utteranceStatsPanel');
        if (!panel) return;

        const n = rawData.length;

        // extract per-metric arrays
        const periods    = rawData.map(function(d) { return d.utterPeriod;     });
        const durations  = rawData.map(function(d) { return d.utterDuration;   });
        const ranges     = rawData.map(function(d) { return d.utterRange;      });
        const duties     = rawData.map(function(d) { return d.utterDuty;       });
        const noteCounts = rawData.map(function(d) { return d.utterNoteCount;  });
        const modCounts  = rawData.map(function(d) { return d.utterModCount;   });
        const noteSpans  = rawData.map(function(d) { return d.utterHighNote - d.utterLowNote; });
        const prefs      = rawData.map(function(d) { return d.utterPreference; });

        const stPeriod   = calcStats(periods);
        const stDuration = calcStats(durations);
        const stRange    = calcStats(ranges);
        const stDuty     = calcStats(duties);
        const stNotes    = calcStats(noteCounts);
        const stMods     = calcStats(modCounts);
        const stSpan     = calcStats(noteSpans);
        const stPref     = calcStats(prefs);

        // dynamic domains for composition metrics (data-driven max)
        const notesHi = Math.max(Math.ceil(stNotes.max / 5)  * 5,  10);
        const modsHi  = Math.max(Math.ceil(stMods.max  / 5)  * 5,  10);
        const spanHi  = Math.max(Math.ceil(stSpan.max  / 12) * 12, 12);

        const rangeDiversity = diversityLabel(stRange.cv);
        const dutyDiversity  = diversityLabel(stDuty.cv);

        // timestamp
        const now  = new Date();
        const ts   = now.getHours() + ':' +
                     String(now.getMinutes()).padStart(2, '0') + ':' +
                     String(now.getSeconds()).padStart(2, '0');

        const html =
            '<div id="ustInner">' +

                // ---- header ----
                '<div id="ustHeader">' +
                    '<div id="ustTitle">Utterance Statistics' +
                        '&nbsp;<span id="ustCount">' + n + ' living swimbots</span>' +
                        '&nbsp;<span id="ustTimestamp">snapshot ' + ts + '</span>' +
                        '&nbsp;<select id="ustRefreshSelect" class="ust-refresh-select" onchange="UtteranceStats.setRefresh(+this.value)">' +
                            '<option value="0">do not refresh</option>' +
                            '<option value="5">refresh every 5 s</option>' +
                            '<option value="30">refresh every 30 s</option>' +
                            '<option value="60">refresh every 60 s</option>' +
                        '</select>' +
                    '</div>' +
                    '<div id="ustBadges">' +
                        badge('Range diversity',      rangeDiversity) +
                        badge('Duty-cycle diversity', dutyDiversity)  +
                    '</div>' +
                    '<div id="ustHeaderButtons">' +
                        '<button id="ustLogBtn" class="ust-header-btn ust-log-btn" onclick="UtteranceLogger.startLogging()">&#128247; Log PNGs\u2026</button>' +
                        '<button class="ust-header-btn" onclick="UtteranceStats.close()">&#10005; Close</button>' +
                    '</div>' +
                '</div>' +

                // ---- body ----
                '<div id="ustBody">' +

                    // SECTION 1: Timing genes
                    '<div class="ust-section-title">Timing Genes</div>' +
                    '<div class="ust-row">' +
                        chartUnit('ustCPeriod',   'Utterance Period (clocks 160\u2013640)',  statsLine(stPeriod,   '', 0)) +
                        chartUnit('ustCDuration', 'Utterance Duration (clocks 60\u2013150)', statsLine(stDuration, '', 0)) +
                        chartUnit('ustCDuty',     'Duty Cycle = duration \u00f7 period (0\u20131)',
                            statsLine(stDuty, '', 3) +
                            '<br>Busy utterer \u2192 duty near 1.0 &nbsp;|&nbsp; Quiet utterer \u2192 duty near 0') +
                    '</div>' +

                    // SECTION 2: Range + scatter
                    '<div class="ust-section-title">Hearing Range</div>' +
                    '<div class="ust-row">' +
                        chartUnit('ustCRange', 'Utterance Range (pool units 150\u2013600)',
                            statsLine(stRange, '', 0) +
                            '<br>CV=' + fmt(stRange.cv, 3) + ' &mdash; ' + rangeDiversity.text) +
                        '<div class="ust-chart-unit ust-scatter-unit">' +
                            '<canvas id="ustCScatter" width="460" height="224"></canvas>' +
                            '<div class="ust-chart-stats">Clusters here indicate distinct utterance \u2018tribes\u2019 in the population</div>' +
                        '</div>' +
                    '</div>' +

                    // SECTION 3: Song composition
                    '<div class="ust-section-title">Song Composition</div>' +
                    '<div class="ust-row">' +
                        chartUnit('ustCNoteCount', 'Note Count (total notes in song)',
                            statsLine(stNotes, '', 1) +
                            '<br>High = complex &nbsp;|&nbsp; Low = sparse / simple', 230) +
                        chartUnit('ustCModCount',  'Mod Count (modulation events in song)',
                            statsLine(stMods, '', 1), 220) +
                        chartUnit('ustCNoteSpan',  'Note Span (highest &minus; lowest, semitones)',
                            statsLine(stSpan, '', 1) +
                            '<br>⬅️ smaller range | larger range ➡️', 220) +
                        chartUnit('ustCPref',      'Utterance Preference gene (0\u20131)',
                            statsLine(stPref, '', 3) +
                            '<br>Utterance types swimbots attracted to', 220) +
                    '</div>' +

                '</div>' +  // #ustBody
            '</div>';       // #ustInner

        panel.innerHTML = html;
        panel.style.visibility = 'visible';

        // render all charts once DOM is ready; also restore the refresh dropdown's
        // selected value (buildAndRender rebuilds innerHTML so the selection resets)
        requestAnimationFrame(function() {
            const sel = document.getElementById('ustRefreshSelect');
            if (sel) sel.value = String(_refreshInterval);

            drawHistogram(document.getElementById('ustCPeriod'),   periods,    160, 640, C.timing,  16, 'Utterance Period (clocks)');
            drawHistogram(document.getElementById('ustCDuration'), durations,   60, 150, C.timing,  15, 'Utterance Duration (clocks)');
            drawHistogram(document.getElementById('ustCDuty'),     duties,       0,   1, C.timing,  20, 'Duty Cycle  (duration \u00f7 period)');
            drawHistogram(document.getElementById('ustCRange'),    ranges,      150, 600, C.range,   15, 'Utterance Range (pool units)');
            drawHistogram(document.getElementById('ustCNoteCount'),noteCounts,    0, notesHi, C.compose, 20, 'Note Count (notes in song)');
            drawHistogram(document.getElementById('ustCModCount'), modCounts,     0, modsHi,  C.compose, 20, 'Mod Count (modulation events)');
            drawHistogram(document.getElementById('ustCNoteSpan'), noteSpans,     0, spanHi,  C.compose, 16, 'Note Span (high \u2212 low, semitones)');
            drawHistogram(document.getElementById('ustCPref'),     prefs,         0,   1,     C.pref,    20, 'Utterance Preference gene');
            drawScatter(document.getElementById('ustCScatter'), rawData, 'Period \u00d7 Duration scatter');

            // restore log button state (innerHTML rebuild resets it each refresh)
            if (typeof UtteranceLogger !== 'undefined') {
                onLoggerStatusChange(UtteranceLogger.isLogging(), UtteranceLogger.getSaveCount());
                // save a snapshot if logging is active
                if (UtteranceLogger.isLogging()) {
                    UtteranceLogger.saveSnapshot();
                }
            }
        });
    }

    // ---- logger status callback (called by UtteranceLogger after state changes) ----
    //
    // Updates the log button's label and style to reflect whether logging is
    // active and how many files have been saved. Also wires the button's click
    // to start or stop logging depending on current state.

    function onLoggerStatusChange(isLogging, saveCount) {
        const btn = document.getElementById('ustLogBtn');
        if (!btn) return;
        if (isLogging) {
            btn.textContent = '\u25cf ' + saveCount + ' saved';
            btn.className   = 'ust-header-btn ust-log-btn ust-log-btn-active';
            btn.onclick     = function() { UtteranceLogger.stopLogging(); };
        } else {
            btn.textContent = '\uD83D\uDCF7 Log PNGs\u2026';
            btn.className   = 'ust-header-btn ust-log-btn';
            btn.onclick     = function() { UtteranceLogger.startLogging(); };
        }
    }

    // ---- public API ----

    function open() {
        const rawData = genePool.getLivingSwimbotUtteranceData();
        buildAndRender(rawData);
    }

    function close() {
        if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
        _refreshInterval = 0;
        const panel = document.getElementById('utteranceStatsPanel');
        if (panel) {
            panel.style.visibility = 'hidden';
            panel.innerHTML = '';   // free memory — charts can be large
        }
    }

    return { open: open, close: close, setRefresh: setRefresh, onLoggerStatusChange: onLoggerStatusChange };

})();
