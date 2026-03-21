"use strict";

// ============================================================================
//  utteranceLogger.js — Darwin's Chorus — Canton Becker
//
//  Automatic PNG snapshot logger for the Utterance Statistics panel.
//  Uses the File System Access API (Chrome/Edge on macOS) to write files
//  directly to a user-chosen folder — no download dialogs after the initial
//  folder picker.
//
//  Usage flow:
//    1. User clicks "📷 Log PNGs…" in the stats panel header.
//    2. Browser shows a one-time folder picker (showDirectoryPicker).
//    3. On every stats refresh, saveSnapshot() composites all chart canvases
//       into a single offscreen canvas and writes statslog-YYYY-MM-DD-HH-MM-SS.png
//       into the chosen folder silently.
//    4. Click the active button again (or close the stats panel) to stop.
//
//  The logger notifies SwimbotStats of state changes so the button UI
//  stays in sync after each panel rebuild.
//
//  Browser support: Chrome 86+, Edge 86+.
//  Safari and Firefox do not support showDirectoryPicker — the button will
//  show an alert and do nothing.
// ============================================================================

const UtteranceLogger = (function() {

    let _dirHandle  = null;   // FileSystemDirectoryHandle from showDirectoryPicker
    let _isLogging  = false;
    let _saveCount  = 0;

    // ---- public: start / stop ----

    async function startLogging() {
        if (_isLogging) {
            stopLogging();
            return;
        }

        if (!window.showDirectoryPicker) {
            alert(
                'PNG logging requires the File System Access API,\n' +
                'which is only available in Chrome.\n\n' +
                'Make sure you are using Chrome and opening index.html\n' +
                'by double-clicking it directly (not via a local server).'
            );
            return;
        }

        let handle;
        try {
            handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.error('UtteranceLogger: folder picker error', e);
            }
            return;  // user cancelled or permission denied — stay silent
        }

        _dirHandle  = handle;
        _isLogging  = true;
        _saveCount  = 0;
        _notifyStatusChange();
    }

    function stopLogging() {
        _isLogging  = false;
        _dirHandle  = null;
        _saveCount  = 0;
        _notifyStatusChange();
    }

    // ---- public: called by SwimbotStats after every panel render ----

    async function saveSnapshot() {
        if (!_isLogging || !_dirHandle) return;

        const inner = document.getElementById('ustInner');
        if (!inner) return;

        // Composite all chart canvases into one offscreen canvas.
        //
        // We use getBoundingClientRect() diffs to find each canvas's position
        // relative to #ustInner. This is scroll-independent: even if the
        // stats panel is scrolled, the relative offset between two elements'
        // bounding rects is always correct.
        //
        // A header strip is drawn at the top of the PNG with the key sim
        // identifiers (living swimbots, wall-clock time, simulation time step)
        // so saved images are self-describing without needing the filename.
        const HEADER_H  = 28;
        const innerRect = inner.getBoundingClientRect();
        const W         = Math.round(innerRect.width);
        const H         = Math.round(innerRect.height) + HEADER_H;

        const offCanvas    = document.createElement('canvas');
        offCanvas.width    = W;
        offCanvas.height   = H;
        const ctx          = offCanvas.getContext('2d');

        // panel background
        ctx.fillStyle = '#1e211a';
        ctx.fillRect(0, 0, W, H);

        // header strip (slightly lighter than panel bg)
        ctx.fillStyle = '#161914';
        ctx.fillRect(0, 0, W, HEADER_H);

        // header text: title | swimbots | food | wall time | sim time step
        const now         = new Date();
        const wallTime    = now.getHours() + ':' +
                            String(now.getMinutes()).padStart(2, '0') + ':' +
                            String(now.getSeconds()).padStart(2, '0');
        const numBots     = (typeof genePool !== 'undefined') ? genePool.getNumSwimbots() : '?';
        const numFood     = (typeof genePool !== 'undefined') ? genePool.getNumFoodBits()  : '?';
        const simClock    = (typeof genePool !== 'undefined') ? genePool.getClock().toLocaleString() : '?';
        const headerText  = 'Utterance Statistics \u2014 ' +
                            numBots + ' Living Swimbots / ' + numFood + ' Food Available \u2014 ' +
                            'snapshot ' + wallTime + ' \u2014 ' +
                            'sim step ' + simClock;

        ctx.fillStyle   = '#9a9e92';
        ctx.font        = 'bold 12px Arial';
        ctx.textAlign   = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(headerText, 14, HEADER_H / 2);

        // draw each chart canvas offset below the header strip
        const canvases = inner.querySelectorAll('canvas');
        canvases.forEach(function(c) {
            const cr = c.getBoundingClientRect();
            const x  = Math.round(cr.left - innerRect.left);
            const y  = Math.round(cr.top  - innerRect.top) + HEADER_H;
            ctx.drawImage(c, x, y);
        });

        // write PNG to the chosen folder
        try {
            const filename = 'statslog-' + _isoTimestamp() + '.png';
            const fh       = await _dirHandle.getFileHandle(filename, { create: true });
            const writable = await fh.createWritable();
            const blob     = await _canvasToBlob(offCanvas);
            await writable.write(blob);
            await writable.close();
            _saveCount++;
            _notifyStatusChange();
        } catch (e) {
            console.error('UtteranceLogger: write error — stopping logging.', e);
            stopLogging();
        }
    }

    // ---- public: getters ----

    function isLogging()    { return _isLogging;  }
    function getSaveCount() { return _saveCount;  }

    // ---- private helpers ----

    // Tell SwimbotStats to update its log button UI.
    // Called after every state change so the button stays in sync
    // across panel rebuilds (buildAndRender replaces all innerHTML).
    function _notifyStatusChange() {
        if (typeof SwimbotStats !== 'undefined' &&
            typeof SwimbotStats.onLoggerStatusChange === 'function') {
            SwimbotStats.onLoggerStatusChange(_isLogging, _saveCount);
        }
    }

    function _isoTimestamp() {
        const d = new Date();
        return d.getFullYear()             + '-' +
               _pad(d.getMonth() + 1)     + '-' +
               _pad(d.getDate())          + '-' +
               _pad(d.getHours())         + '-' +
               _pad(d.getMinutes())       + '-' +
               _pad(d.getSeconds());
    }

    function _pad(n) { return String(n).padStart(2, '0'); }

    function _canvasToBlob(canvas) {
        return new Promise(function(resolve) {
            canvas.toBlob(resolve, 'image/png');
        });
    }

    // ---- public API ----
    return {
        startLogging:  startLogging,
        stopLogging:   stopLogging,
        saveSnapshot:  saveSnapshot,
        isLogging:     isLogging,
        getSaveCount:  getSaveCount,
    };

})();
