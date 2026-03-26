// ===== STATE =====
var exDatabase = [];
var countdown;
var activeProg = null;
var currentRest = 90;
var sessionCounters = {};
var currentCommentKey = null; // chiave esercizio per modale commento
var wakeLock = null;
var sessionStartTime = null;
var sessionClockInterval = null;


// ===== INIT =====
window.onload = function () {
    ['gymMaxes','gymProgs','gymSessionLogs','gymDrafts','gymComments','gymCustomExercises'].forEach(k => {
        if (!localStorage.getItem(k)) localStorage.setItem(k, k === 'gymSessionLogs' ? '[]' : '{}');
    });
    applyTheme();
    refreshDropdowns();
    renderStats();
    inizializzaLibreria(); // Carica il JSON degli esercizi
    switchMode('training');
};

// ===== THEME =====
function applyTheme() {
    const isDark = localStorage.getItem('gymTheme') !== 'light';
    document.body.classList.toggle('light-mode', !isDark);
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
}
function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem('gymTheme', isLight ? 'light' : 'dark');
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = isLight ? '🌙' : '☀️';
}

// ===== NAV =====
function switchMode(m) {
    ['setup', 'training', 'stats','libreria'].forEach(s => {
        document.getElementById(s + '-section').style.display = (m === s ? 'block' : 'none');
        const btn = document.getElementById('nav-' + s);
        if (btn) btn.classList.toggle('nav-active', m === s);
    });
    if (m === 'stats') { renderStats(); populateStatsExSelect(); }
    if (m === 'libreria') { renderLibrary(); } // Disegna la lista quando ci clicchi
    if (m === 'setup') { switchSetupSubTab('view'); }
    refreshDropdowns();
}

// ===== DROPDOWNS =====
function refreshDropdowns() {
    const progs = JSON.parse(localStorage.getItem('gymProgs')) || {};
    const pSel = document.getElementById('selectProg');
    const dSel = document.getElementById('selectDay');

    // 1. Aggiorna la tendina della scheda SOLO SE esiste nella pagina corrente
    if (pSel) {
        let pOpts = '<option value="">-- Scegli Scheda --</option>';
        for (let p in progs) {
            pOpts += `<option value="${p}">${p.toUpperCase()}</option>`;
        }
        pSel.innerHTML = pOpts;
    }

    // 2. Aggiorna la tendina del giorno SOLO SE esiste nella pagina corrente
    if (dSel) {
        const active = pSel ? pSel.value : null;
        let dOpts = '<option value="">-- Scegli Giorno --</option>';
        if (active && progs[active]) {
            for (let d in progs[active]) {
                if (d !== '_duration') dOpts += `<option value="${d}">${d}</option>`;
            }
        }
        dSel.innerHTML = dOpts;
    }

    // 3. Se esiste la lista dell'archivio visivo nel DOM, la aggiorna
    const savedList = document.getElementById('saved-programs-list');
    if (savedList) {
        // Chiamiamo la funzione solo se l'elemento visivo esiste a schermo
        if (typeof renderSavedProgramsList === "function") {
            renderSavedProgramsList();
        }
    }
}

// ===== SESSION PERSISTENCE =====
function sessionKey() {
    const p = document.getElementById('selectProg').value;
    const d = document.getElementById('selectDay').value;
    return `gymSession_${p}_${d}`;
}
function saveSessionState() {
    const p = document.getElementById('selectProg').value;
    const d = document.getElementById('selectDay').value;
    if (!p || !d) return;
    const exercises = JSON.parse(localStorage.getItem('gymProgs'))[p][d];
    let state = { counters: {}, weights: {}, reps: {} };
    exercises.forEach((ex, idx) => {
        state.counters[idx] = sessionCounters[idx] || 0;
        const elW = document.getElementById(`w_${idx}`);
        const elR = document.getElementById(`r_${idx}`);
        state.weights[idx] = elW ? elW.value : '';
        state.reps[idx] = elR ? elR.value : (ex.reps || '');
    });
    state.startTime = sessionStartTime ? sessionStartTime.toISOString() : new Date().toISOString();
    localStorage.setItem(sessionKey(), JSON.stringify(state));
}
function loadSessionState() {
    try { const r = localStorage.getItem(sessionKey()); return r ? JSON.parse(r) : null; } catch (e) { return null; }
}
function clearSessionState() { localStorage.removeItem(sessionKey()); }

// ===== SETUP EDITOR =====
function syncEditorProg() {
    const selected = document.getElementById('editProgSelect').value;
    const controls = document.getElementById('editor-controls');
    const newArea = document.getElementById('new-prog-area');
    if (!selected) {
        activeProg = null; controls.style.display = 'none'; newArea.style.display = 'block'; return;
    }
    const progs = JSON.parse(localStorage.getItem('gymProgs'));
    activeProg = selected;
    newArea.style.display = 'none';
    controls.style.display = 'block';
    document.getElementById('editing-title').innerText = 'Editando: ' + selected;
    const daySel = document.getElementById('editDaySelect');
    let dayOpts = '<option value="">-- Seleziona Giorno --</option>';
    for (let d in progs[selected]) if (d !== '_duration') dayOpts += `<option value="${d}">${d}</option>`;
    daySel.innerHTML = dayOpts;
    refreshEditorTable();
}

function refreshEditorTable() {
    const selDay = document.getElementById('editDaySelect').value;
    const container = document.getElementById('preview-table');
    let progs = JSON.parse(localStorage.getItem('gymProgs')) || {};

    if (!selDay || !progs[activeProg] || !progs[activeProg][selDay]) {
        container.innerHTML = "<p style='color:#666; font-size:12px;'>Nessun esercizio in questa giornata.</p>";
        return;
    }

    let html = "<table style='width:100%; font-size:13px; border-collapse:collapse;'>";
    progs[activeProg][selDay].forEach((ex, idx) => {
        html += `<tr style='border-bottom:1px solid #333'>
            <td style='padding:10px;'>${ex.linked ? '🔗' : ''} <b>${ex.name}</b><br><small>${ex.sets}x${ex.reps} - ${ex.rest}s${ex.note ? ' · ' + ex.note : ''}</small></td>
            <td style='text-align:right; white-space:nowrap;'>
                <button onclick="openEditModal('${selDay}', ${idx})" style='background:none; border:none; color:var(--main); font-size:1.1rem; cursor:pointer; padding:4px 6px; margin-right:5px;'>✏️</button>
                <button onclick="removeEx('${selDay}', ${idx})" style='background:none; border:none; color:var(--danger); font-size:1.2rem; cursor:pointer; padding:4px 6px;'>✖</button>
            </td>
        </tr>`;
    });
    container.innerHTML = html + '</table>';
    
    renderReorderList(selDay);
}

// ===== REORDER =====
var dragSrcIdx = null;
function renderReorderList(day) {
    const progs = JSON.parse(localStorage.getItem('gymProgs'));
    if (!progs[activeProg] || !progs[activeProg][day]) return;
    const exercises = progs[activeProg][day];
    const list = document.getElementById('reorder-list');
    list.innerHTML = '';
    exercises.forEach((ex, idx) => {
        const item = document.createElement('div');
        item.className = 'reorder-item';
        item.draggable = true;
        item.dataset.idx = idx;
        item.innerHTML = `<span class="drag-handle">☰</span> ${ex.linked ? '🔗' : ''} ${ex.name}`;
        item.addEventListener('dragstart', e => { dragSrcIdx = idx; e.dataTransfer.effectAllowed = 'move'; });
        item.addEventListener('dragover', e => { e.preventDefault(); item.classList.add('drag-over'); });
        item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
        item.addEventListener('drop', e => {
            e.preventDefault(); item.classList.remove('drag-over');
            if (dragSrcIdx === null || dragSrcIdx === idx) return;
            const progs2 = JSON.parse(localStorage.getItem('gymProgs'));
            const arr = progs2[activeProg][day];
            const moved = arr.splice(dragSrcIdx, 1)[0];
            arr.splice(idx, 0, moved);
            localStorage.setItem('gymProgs', JSON.stringify(progs2));
            renderReorderList(day);
            refreshEditorTable();
        });
        list.appendChild(item);
    });
}

function saveReorder() {
    alert('Ordine già salvato automaticamente durante il trascinamento!');
}

// ===== EDIT EXERCISE MODAL =====
var editDay = null;
var editIdx = null;

function openEditModal(day, idx) {
    const progs = JSON.parse(localStorage.getItem('gymProgs'));
    const ex = progs[activeProg][day][idx];
    editDay = day;
    editIdx = idx;
    document.getElementById('edit-ex-name').value = ex.name || '';
    document.getElementById('edit-ex-perc').value = ex.perc || 0;
    document.getElementById('edit-ex-sets').value = ex.sets || '';
    document.getElementById('edit-ex-reps').value = ex.reps || '';
    document.getElementById('edit-ex-rest').value = ex.rest || 90;
    document.getElementById('edit-ex-note').value = ex.note || '';
    document.getElementById('edit-ex-linked').checked = ex.linked || false;
    document.getElementById('edit-modal').style.display = 'flex';
}

function saveEditModal() {
    const name = document.getElementById('edit-ex-name').value.trim();
    if (!name) return alert('Il nome è obbligatorio');
    
    let progs = JSON.parse(localStorage.getItem('gymProgs'));
    progs[activeProg][editDay][editIdx] = {
        name,
        perc: parseInt(document.getElementById('edit-ex-perc').value) || 0,
        sets: document.getElementById('edit-ex-sets').value.trim(),
        reps: document.getElementById('edit-ex-reps').value.trim(),
        rest: parseInt(document.getElementById('edit-ex-rest').value) || 90,
        note: document.getElementById('edit-ex-note').value.trim(),
        linked: document.getElementById('edit-ex-linked').checked
    };
    localStorage.setItem('gymProgs', JSON.stringify(progs));
    closeEditModal();
    
    refreshDropdowns(); // ✅ Avvisa l'allenamento del cambio nome/peso
    refreshEditorTable(); // ✅ Ricarica la tabella dell'archivio visivo
}

function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
    editDay = null;
    editIdx = null;
}

function removeEx(day, idx) {
    if (!confirm('Eliminare?')) return;
    let progs = JSON.parse(localStorage.getItem('gymProgs'));
    progs[activeProg][day].splice(idx, 1);
    localStorage.setItem('gymProgs', JSON.stringify(progs));
    refreshEditorTable();
}

function clearExInputs() {
    ['exName', 'exPerc', 'exSets', 'exReps', 'exRest', 'exNote'].forEach(id => document.getElementById(id).value = '');
}

// ===== BULK IMPORT =====
function processBulkImport() {
    const text = document.getElementById('bulk-import-area').value.trim();
    const progName = document.getElementById('progName').value.trim() || activeProg;
    if (!progName || !text) return alert('Inserisci Nome Programma!');
    let progs = JSON.parse(localStorage.getItem('gymProgs'));
    if (!progs[progName]) progs[progName] = { _duration: parseInt(document.getElementById('progWeeks').value) || 8 };
    let currentDay = '';
    text.split('\n').forEach(line => {
        line = line.trim(); if (!line) return;
        if (line.startsWith('#')) {
            currentDay = line.replace('#', '').trim(); progs[progName][currentDay] = [];
        } else if (currentDay) {
            let linked = line.startsWith('*'); if (linked) line = line.replace('*', '').trim();
            const p = line.split(';');
            if (p.length >= 4) {
                progs[progName][currentDay].push({
                    name: p[0].trim(), perc: parseInt(p[1]) || 0,
                    sets: p[2].trim(), reps: p[3].trim(),
                    rest: parseInt(p[4]) || 90, note: p[5] ? p[5].trim() : '', linked: linked
                });
            }
        }
    });
    localStorage.setItem('gymProgs', JSON.stringify(progs));
    location.reload();
}

// ===== TRAINING =====
function updateDaySelect() {
    const p = document.getElementById('selectProg').value;
    const sel = document.getElementById('selectDay');
    sel.innerHTML = '<option value="">Giorno...</option>';
    if (!p) return;
    const progs = JSON.parse(localStorage.getItem('gymProgs'));
    for (let d in progs[p]) if (d !== '_duration') sel.innerHTML += `<option value="${d}">${d}</option>`;
}

// Chiamata quando si cambiano i select: mostra preview o ripristina sessione
function loadWorkoutDisplay() {
    const p = document.getElementById('selectProg').value, d = document.getElementById('selectDay').value;
    const area = document.getElementById('workout-display-area');
    if (!p || !d) { area.innerHTML = ''; return; }

    // Se c'è una sessione salvata, la ripristina direttamente
    const savedState = loadSessionState();
    if (savedState) {
        startWorkout(true);
        return;
    }

    // Altrimenti mostra la schermata di preview
    showWorkoutPreview(p, d);
}

function showWorkoutPreview(p, d) {
    const area = document.getElementById('workout-display-area');
    const exercises = JSON.parse(localStorage.getItem('gymProgs'))[p][d];
    const maxes = JSON.parse(localStorage.getItem('gymMaxes'));
    const logs = JSON.parse(localStorage.getItem('gymSessionLogs'));
    const comments = JSON.parse(localStorage.getItem('gymComments'));

    // Dati ultima sessione per questo giorno
    let lastSession = null;
    for (let i = logs.length - 1; i >= 0; i--) {
        if (logs[i].day === d) { lastSession = logs[i]; break; }
    }

    // Totali
    const totalSets = exercises.reduce((a, ex) => a + (parseInt(ex.sets) || 0), 0);
    const totalExercises = exercises.length;

    // Stima durata: media reale se disponibile, altrimenti formula
    const pastDurations = logs
        .filter(l => l.day === d && l.duration && l.duration > 0)
        .map(l => l.duration);
    let estMinutes;
    if (pastDurations.length >= 1) {
        estMinutes = Math.round(pastDurations.reduce((a, b) => a + b, 0) / pastDurations.length);
    } else {
        // Formula: per ogni serie, recupero dichiarato + 45s esecuzione
        // + 90s buffer per ogni cambio esercizio
        const execSec = exercises.reduce((a, ex) => {
            const sets = parseInt(ex.sets) || 0;
            const rest = parseInt(ex.rest) || 90;
            return a + sets * (rest + 45);
        }, 0);
        const changeSec = (totalExercises - 1) * 90;
        estMinutes = Math.round((execSec + changeSec) / 60);
    }
    const estLabel = pastDurations.length >= 1 ? `~${estMinutes}'` : `~${estMinutes}'`;
    const estSubLabel = pastDurations.length >= 1
        ? `media ${pastDurations.length} sess.`
        : 'stimati';

    // Lista esercizi preview
    let exListHtml = '';
    exercises.forEach(ex => {
        const target = ex.perc > 0 ? Math.round(((maxes[ex.name.toLowerCase().trim()] || 0) * ex.perc) / 100) : 0;
        const comment = comments[ex.name.toLowerCase().trim()] || '';
        exListHtml += `
        <div class="preview-ex-row ${ex.linked ? 'preview-linked' : ''}">
            <div class="preview-ex-left">
                <span class="preview-ex-name">${ex.linked ? '🔗 ' : ''}${ex.name}</span>
                <span class="preview-ex-meta">${ex.sets}×${ex.reps} · ${ex.rest}s rec${target > 0 ? ' · <b style="color:var(--main)">' + target + 'kg</b>' : ''}</span>
                ${comment ? `<span class="preview-ex-comment">💬 ${comment}</span>` : ''}
            </div>
        </div>`;
    });

    // Nota ultima sessione
    let lastNoteHtml = '';
    if (lastSession) {
        const d2 = lastSession.dateStr;
        const vol = lastSession.volume;
        const dur = lastSession.duration ? ` · ${lastSession.duration} min` : '';
        const note = lastSession.note ? `<div class="preview-last-note">📝 "${lastSession.note}"</div>` : '';
        lastNoteHtml = `
        <div class="preview-last-session">
            <div class="preview-last-header">Ultima volta: <b>${d2}</b> · ${vol}kg${dur}</div>
            ${note}
        </div>`;
    }

    area.innerHTML = `
    <div class="workout-preview">
        <div class="preview-header">
            <div class="preview-day-name">${d}</div>
            <div class="preview-stats-row">
                <div class="preview-stat"><span class="preview-stat-val">${totalExercises}</span><span class="preview-stat-label">esercizi</span></div>
                <div class="preview-stat"><span class="preview-stat-val">${totalSets}</span><span class="preview-stat-label">serie totali</span></div>
                <div class="preview-stat"><span class="preview-stat-val">${estLabel}</span><span class="preview-stat-label">${estSubLabel}</span></div>
            </div>
        </div>
        ${lastNoteHtml}
        <div class="preview-ex-list">${exListHtml}</div>
        ${isDeloadSession(logs, p, d) ? '<div class="deload-preview-banner">&#9888;&#65039; <strong>Prossima: Settimana di Deload</strong> &mdash; i pesi saranno ridotti del 15% automaticamente</div>' : ''}
        <button class="btn-start-workout" onclick="startWorkout(false)">
            <span class="btn-start-icon">▶</span> Inizia Allenamento
        </button>
    </div>`;

    // Nasconde timer e save btn finché non si inizia
    document.getElementById('timer-area').style.display = 'none';
    document.getElementById('save-session-btn').style.display = 'none';
}

// Conta sessioni registrate per una giornata specifica
function countDaySessions(logs, prog, day) {
    return logs.filter(l => l.prog === prog && l.day === day).length;
}
// Deload ogni 4a sessione (dopo 3 normali): sessione 4, 8, 12...
function isDeloadSession(logs, prog, day) {
    const count = countDaySessions(logs, prog, day);
    return count > 0 && count % 4 === 3;
}

function startWorkout(isRestore) {
    const p = document.getElementById('selectProg').value, d = document.getElementById('selectDay').value;
    const area = document.getElementById('workout-display-area');
    const exercises = JSON.parse(localStorage.getItem('gymProgs'))[p][d];
    const maxes = JSON.parse(localStorage.getItem('gymMaxes'));
    const logs = JSON.parse(localStorage.getItem('gymSessionLogs'));
    const comments = JSON.parse(localStorage.getItem('gymComments'));
    const savedState = isRestore ? loadSessionState() : null;
    const deload = !isRestore && isDeloadSession(logs, p, d);

    area.innerHTML = '';
    sessionCounters = {};

    // Banner deload in cima
    if (deload) {
        const deloadBanner = document.createElement('div');
        deloadBanner.className = 'deload-banner';
        deloadBanner.innerHTML = '⚠️ <strong>Settimana di Deload</strong><br><small>Hai completato 3 sessioni — oggi il corpo recupera. I pesi sono ridotti del 15% automaticamente. Mantieni la tecnica, non forzare.</small>';
        area.appendChild(deloadBanner);
    }

    exercises.forEach((ex, idx) => {
        sessionCounters[idx] = savedState ? (savedState.counters[idx] || 0) : 0;

        const target = ex.perc > 0 ? Math.round(((maxes[ex.name.toLowerCase().trim()] || 0) * ex.perc) / 100) : 0;

        // Ultima volta: parsa "80kg × 10 reps" o "80kg"
        let lastDisplay = '--';
        let lastKgRaw = 0;
        for (let i = logs.length - 1; i >= 0; i--) {
            const entry = logs[i].details.split(', ').find(s => s.startsWith(ex.name + ':'));
            if (entry) {
                lastDisplay = entry.split(': ')[1];
                const m = lastDisplay.match(/^([\d.]+)kg/);
                if (m) lastKgRaw = parseFloat(m[1]);
                break;
            }
        }

        // Deload: -15% sull'ultimo peso usato (o target se non c'è storico)
        let deloadTarget = 0;
        if (deload) {
            const base = lastKgRaw > 0 ? lastKgRaw : target;
            if (base > 0) deloadTarget = Math.round((base * 0.85) * 2) / 2;
        }

        // Peso e reps ripristinati
        let restoredWeight = '';
        let restoredReps = ex.reps;
        if (savedState && savedState.weights[idx] !== undefined) {
            restoredWeight = savedState.weights[idx];
            restoredReps = savedState.reps ? (savedState.reps[idx] || ex.reps) : ex.reps;
        } else if (deload && deloadTarget > 0) {
            restoredWeight = deloadTarget;
        } else {
            const drafts = JSON.parse(localStorage.getItem('gymDrafts'))[`${p}_${d}`] || {};
            restoredWeight = drafts[idx] || '';
        }

        // Suggerimento progressione (solo in sessioni normali)
        let suggestion = '';
        if (!deload) {
            const exHistory = [];
            for (let i = 0; i < logs.length; i++) {
                const entry = logs[i].details.split(', ').find(s => s.startsWith(ex.name + ':'));
                if (entry) {
                    const m = entry.split(': ')[1].match(/^([\d.]+)kg/);
                    if (m) exHistory.push(parseFloat(m[1]));
                }
            }
            if (exHistory.length >= 2) {
                const lastKg = exHistory[exHistory.length - 1];
                const suggested = Math.round((lastKg * 1.025) * 2) / 2;
                const diff = (suggested - lastKg).toFixed(1);
                suggestion = `<div class="ex-suggestion">💡 Prova ${suggested}kg questa volta (+${diff}kg)</div>`;
            }
        }

        // Commento persistente
        const commentKey = ex.name.toLowerCase().trim();
        const savedComment = comments[commentKey] || '';
        const commentLabel = savedComment ? `💬 ${savedComment}` : '💬 Aggiungi commento...';
        const commentClass = savedComment ? 'btn-comment has-comment' : 'btn-comment';

        const serieFatte = sessionCounters[idx];
        const totalSets = parseInt(ex.sets) || 0;
        const isDone = serieFatte >= totalSets && totalSets > 0;

        const targetDisplay = deload && deloadTarget > 0
            ? `<span class="ex-target deload-target">${deloadTarget}kg <small>(-15%)</small></span>`
            : `<span class="ex-target">${target > 0 ? target + 'kg' : '--'}</span>`;

        // Modifichiamo solo la variabile cardHtml per aggiungere l'icona Info
        const cardHtml = `<div class="exercise-card${deload ? ' deload-card' : ''}" id="card-${idx}" style="${isDone ? 'opacity:0.5; border-color:#555;' : ''}">
            <div class="ex-header" style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <strong style="color: var(--main);">${ex.name.toUpperCase()}</strong>
                    <span onclick="openInfoModal('${ex.name.replace(/'/g, "\\'")}')" style="cursor: pointer; font-size: 1.1rem; color: var(--accent); user-select: none;">ℹ️</span>
                </div>
                <span id="sets-count-${idx}" class="sets-badge ${isDone ? 'sets-done' : ''}">Serie: ${serieFatte} / ${totalSets}</span>
            </div>
            <div class="ex-header" style="margin-top:5px;">
                <span class="ex-info">${ex.sets}×${ex.reps} @ ${ex.perc}% (⏱${ex.rest}s)</span>
                ${targetDisplay}
            </div>
            <div class="ex-last">Ultima: ${lastDisplay}</div>
            ${suggestion}
            <div class="row" style="margin-top:10px;">
                <input type="text" id="w_${idx}" placeholder="Kg" value="${restoredWeight}" oninput="saveDraft(${idx})" style="flex:2">
                <input type="text" id="r_${idx}" placeholder="Reps" value="${restoredReps}" oninput="saveDraft(${idx})" style="flex:1; min-width:60px;">
                <button class="btn-ok" onclick="confirmSet('${ex.name.replace(/'/g, "\\'")}', ${ex.perc}, ${idx}, ${ex.rest}, ${ex.sets})">OK</button>
            </div>
            <button class="${commentClass}" id="comment-btn-${idx}" onclick="openCommentModal('${commentKey}', ${idx})">${commentLabel}</button>
        </div>`;

        if (ex.linked && area.lastElementChild) {
            if (!area.lastElementChild.classList.contains('superset-container')) {
                const prev = area.lastElementChild;
                const wrap = document.createElement('div'); wrap.className = 'superset-container';
                wrap.innerHTML = `<span class="superset-label">SUPERSERIE 🔗</span>`;
                prev.parentNode.insertBefore(wrap, prev); wrap.appendChild(prev); wrap.innerHTML += cardHtml;
            } else area.lastElementChild.innerHTML += cardHtml;
        } else area.innerHTML += cardHtml;

        // Se la card è già completata (ripristino sessione), disabilita subito input e bottone
        if (isDone) {
            setTimeout(() => {
                const wInput = document.getElementById(`w_${idx}`);
                const rInput = document.getElementById(`r_${idx}`);
                const okBtn = document.querySelector(`#card-${idx} .btn-ok`);
                if (wInput) wInput.disabled = true;
                if (rInput) rInput.disabled = true;
                if (okBtn) { okBtn.disabled = true; okBtn.style.opacity = '0.3'; }
            }, 0);
        }
    });

    if (isRestore) {
        const banner = document.createElement('div');
        banner.className = 'restore-banner';
        banner.innerHTML = '✅ Sessione ripristinata automaticamente';
        area.insertBefore(banner, area.firstChild);
        setTimeout(() => banner.remove(), 3000);
    }

    document.getElementById('timer-area').style.display = 'block';
    document.getElementById('save-session-btn').style.display = 'block';
    document.getElementById('abandon-session-btn').style.display = 'block';

    requestWakeLock();
    const savedStart = savedState ? savedState.startTime : null;
    sessionStartTime = savedStart ? new Date(savedStart) : new Date();
    saveSessionState();
    startSessionClock();
}

function confirmSet(name, perc, idx, rest, totalSets) {
    // Blocca se le serie sono già completate
    if (sessionCounters[idx] >= totalSets) return;

    const val = document.getElementById(`w_${idx}`).value;
    const w = parseFloat(val);

    sessionCounters[idx]++;
    document.getElementById(`sets-count-${idx}`).innerText = `Serie: ${sessionCounters[idx]} / ${totalSets}`;

    const card = document.getElementById(`card-${idx}`);
    card.style.borderColor = 'var(--accent)';

    if (sessionCounters[idx] >= totalSets) {
        card.style.opacity = '0.5';
        card.style.borderColor = '#555';
        // Disabilita input e bottone OK
        const wInput = document.getElementById(`w_${idx}`);
        const rInput = document.getElementById(`r_${idx}`);
        const okBtn = card.querySelector('.btn-ok');
        if (wInput) wInput.disabled = true;
        if (rInput) rInput.disabled = true;
        if (okBtn) { okBtn.disabled = true; okBtn.style.opacity = '0.3'; }
        const nextCard = document.getElementById(`card-${idx + 1}`);
        if (nextCard) setTimeout(() => nextCard.scrollIntoView({ behavior: 'smooth', block: 'center' }), 600);
    } else {
        setTimeout(() => card.style.borderColor = 'var(--main)', 500);
    }

    saveSessionState();

    if (w && perc > 0) {
        let maxes = JSON.parse(localStorage.getItem('gymMaxes'));
        let calc = Math.round((w / perc) * 100);
        if (calc > (maxes[name.toLowerCase().trim()] || 0)) {
            if (confirm('Nuovo Record Stimato (' + calc + 'kg)! Aggiorno?')) {
                maxes[name.toLowerCase().trim()] = calc;
                localStorage.setItem('gymMaxes', JSON.stringify(maxes));
            }
        }
    }
    currentRest = rest;
    document.getElementById('btn-auto-timer').innerText = 'Recupero (' + rest + 's)';
    startTimer(rest);
}

// ===== FINISH WORKOUT =====
function finishWorkout() {
    stopSessionClock();
    releaseWakeLock();
    document.getElementById('abandon-session-btn').style.display = 'none';
    document.getElementById('session-note-modal').style.display = 'flex';
}

function confirmFinishWorkout(skip) {
    document.getElementById('session-note-modal').style.display = 'none';
    const note = skip ? '' : (document.getElementById('session-note-input').value.trim());
    document.getElementById('session-note-input').value = '';

    const p = document.getElementById('selectProg').value, d = document.getElementById('selectDay').value;
    const exercises = JSON.parse(localStorage.getItem('gymProgs'))[p][d];
    let res = [], vol = 0;
    exercises.forEach((ex, idx) => {
        const w = parseFloat(document.getElementById(`w_${idx}`).value) || 0;
        const rEl = document.getElementById(`r_${idx}`);
        const rDone = rEl ? (parseInt(rEl.value) || parseInt(ex.reps) || 0) : (parseInt(ex.reps) || 0);
        const rPlanned = parseInt(ex.reps) || 0;
        const repsLabel = rDone !== rPlanned ? `${w}kg × ${rDone} reps` : `${w}kg`;
        res.push(ex.name + ': ' + repsLabel);
        vol += (w * (parseInt(ex.sets) || 0) * rDone);
    });

    let logs = JSON.parse(localStorage.getItem('gymSessionLogs'));
    const durationMin = sessionStartTime ? Math.round((new Date() - sessionStartTime) / 60000) : 0;
    logs.push({
        date: new Date().toISOString(),
        dateStr: new Date().toLocaleDateString('it-IT'),
        prog: p, day: d, details: res.join(', '), volume: vol, note: note, duration: durationMin
    });
    localStorage.setItem('gymSessionLogs', JSON.stringify(logs));

    let drafts = JSON.parse(localStorage.getItem('gymDrafts'));
    delete drafts[`${p}_${d}`];
    localStorage.setItem('gymDrafts', JSON.stringify(drafts));
    clearSessionState();

    alert('Salvato! Vol: ' + vol + 'kg');
    switchMode('stats');
}

// ===== COMMENTI ESERCIZI =====
function openCommentModal(commentKey, idx) {
    currentCommentKey = commentKey;
    const comments = JSON.parse(localStorage.getItem('gymComments'));
    document.getElementById('comment-modal-title').innerText = '💬 ' + commentKey.toUpperCase();
    document.getElementById('comment-modal-input').value = comments[commentKey] || '';
    document.getElementById('comment-modal').style.display = 'flex';
}

function saveComment() {
    const val = document.getElementById('comment-modal-input').value.trim();
    let comments = JSON.parse(localStorage.getItem('gymComments'));
    comments[currentCommentKey] = val;
    localStorage.setItem('gymComments', JSON.stringify(comments));

    // Aggiorna pulsante nella card
    document.querySelectorAll('[id^="comment-btn-"]').forEach(btn => {
        const cardIdx = btn.id.replace('comment-btn-', '');
        const area = document.getElementById('workout-display-area');
        if (!area) return;
        // Cerca il pulsante corrispondente alla chiave
        const p = document.getElementById('selectProg').value;
        const d = document.getElementById('selectDay').value;
        const exercises = JSON.parse(localStorage.getItem('gymProgs'))[p][d];
        const ex = exercises[parseInt(cardIdx)];
        if (ex && ex.name.toLowerCase().trim() === currentCommentKey) {
            btn.textContent = val ? `💬 ${val}` : '💬 Aggiungi commento...';
            btn.className = val ? 'btn-comment has-comment' : 'btn-comment';
        }
    });

    closeCommentModal();
}

function closeCommentModal() {
    document.getElementById('comment-modal').style.display = 'none';
    currentCommentKey = null;
}

// Palette colori per programma
const PROG_COLORS = ['#00adb5','#ff6b6b','#ffd93d','#6bcb77','#a855f7','#f97316','#3b82f6','#ec4899'];
function getProgColor(progName) {
    const progs = JSON.parse(localStorage.getItem('gymProgs'));
    const keys = Object.keys(progs);
    const idx = keys.indexOf(progName);
    return idx >= 0 ? PROG_COLORS[idx % PROG_COLORS.length] : '#555';
}

// ===== STATS =====
function renderStats() {
    const maxes = JSON.parse(localStorage.getItem('gymMaxes'));
    const logs = JSON.parse(localStorage.getItem('gymSessionLogs'));
    const container = document.getElementById('stats-container');
    const oneWeekAgo = new Date(); oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const weeklyVol = logs.reduce((acc, l) => new Date(l.date) > oneWeekAgo ? acc + (l.volume || 0) : acc, 0);

    let html = `<div class="mini-list" style="border-left:5px solid var(--main); padding-left:15px;">
        <small style="color:#888">VOLUME ULTIMI 7gg</small>
        <div style="font-size:1.4rem; font-weight:bold; color:var(--accent)">${weeklyVol} kg</div>
    </div>
    <h4>Record:</h4><div class="mini-list">`;
    Object.entries(maxes).forEach(([ex, w]) => html += `<div>${ex.toUpperCase()}: <b>${w}kg</b></div>`);
    html += '</div><h4>Diario:</h4>';
    logs.slice().reverse().forEach((l, reversedIdx) => {
        const realIdx = logs.length - 1 - reversedIdx;
        const color = l.prog ? getProgColor(l.prog) : '#555';
        const progDot = l.prog ? `<span class="prog-dot" style="background:${color}" title="${l.prog}"></span>` : '';
        html += `<div class='stat-item' style="border-left-color:${color}">
            <div class="stat-item-header">
                <div>${progDot}<strong>${l.dateStr}</strong> <span class="stat-day-name">${l.day}</span> ${l.duration ? `<span class="stat-duration">⏱ ${l.duration} min</span>` : ''}</div>
                <button class="btn-delete-log" onclick="deleteLog(${realIdx})" title="Elimina sessione">🗑</button>
            </div>
            <small class="stat-details">Vol: ${l.volume}kg${l.prog ? ` · ${l.prog}` : ''} | ${l.details}</small>
            ${l.note ? `<div class="stat-note">📝 ${l.note}</div>` : ''}
        </div>`;
    });
    if (logs.length === 0) html += `<p style="color:#666; text-align:center; padding:20px 0;">Nessuna sessione registrata.</p>`;
    container.innerHTML = html;
}

function deleteLog(idx) {
    if (!confirm('Eliminare questa sessione?')) return;
    let logs = JSON.parse(localStorage.getItem('gymSessionLogs'));
    logs.splice(idx, 1);
    localStorage.setItem('gymSessionLogs', JSON.stringify(logs));
    renderStats();
    populateStatsExSelect();
    renderProgressChart();
}

function populateStatsExSelect() {
    const logs = JSON.parse(localStorage.getItem('gymSessionLogs'));
    const exSet = new Set();
    logs.forEach(l => {
        l.details.split(', ').forEach(entry => {
            const name = entry.split(':')[0];
            if (name) exSet.add(name.trim());
        });
    });
    const sel = document.getElementById('statsExSelect');
    sel.innerHTML = '<option value="">-- Seleziona Esercizio --</option>';
    exSet.forEach(name => sel.innerHTML += `<option value="${name}">${name}</option>`);
}

function renderProgressChart() {
    const exName = document.getElementById('statsExSelect').value;
    const canvas = document.getElementById('progressChart');
    const empty = document.getElementById('progressChartEmpty');
    const legendEl = document.getElementById('chartLegend');
    canvas.style.display = 'none';
    empty.style.display = 'none';
    if (legendEl) legendEl.innerHTML = '';
    if (!exName) return;

    const logs = JSON.parse(localStorage.getItem('gymSessionLogs'));
    const points = [];
    logs.forEach(l => {
        const entry = l.details.split(', ').find(s => s.startsWith(exName + ':'));
        if (entry) {
            const kg = parseFloat(entry.split(': ')[1]);
            if (!isNaN(kg) && kg > 0) points.push({ date: l.dateStr, kg, prog: l.prog || null });
        }
    });

    if (points.length === 0) { empty.style.display = 'block'; return; }

    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || 460;
    const H = 210;
    canvas.width = W;
    canvas.height = H;

    const isDark = !document.body.classList.contains('light-mode');
    const gridColor = isDark ? '#2a2a2a' : '#e5e5e5';
    const textColor = isDark ? '#888' : '#666';

    ctx.clearRect(0, 0, W, H);

    const pad = { top: 20, right: 20, bottom: 40, left: 45 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;

    const kgs = points.map(p => p.kg);
    const minKg = Math.max(0, Math.floor(Math.min(...kgs) - 5));
    const maxKg = Math.ceil(Math.max(...kgs) + 5);

    // Grid
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (chartH / 4) * i;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + chartW, y); ctx.stroke();
        const val = maxKg - ((maxKg - minKg) / 4) * i;
        ctx.fillStyle = textColor;
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(val.toFixed(1), pad.left - 5, y + 4);
    }

    // X labels
    ctx.fillStyle = textColor;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(points.length / 5));
    points.forEach((p, i) => {
        if (i % step === 0 || i === points.length - 1) {
            const x = pad.left + (i / (points.length - 1 || 1)) * chartW;
            ctx.fillText(p.date, x, H - 5);
        }
    });

    // Linea grigia di connessione
    ctx.beginPath();
    ctx.strokeStyle = isDark ? '#333' : '#ccc';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.lineJoin = 'round';
    points.forEach((p, i) => {
        const x = pad.left + (i / (points.length - 1 || 1)) * chartW;
        const y = pad.top + chartH - ((p.kg - minKg) / (maxKg - minKg)) * chartH;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Dots colorati per programma + valori
    const seenProgs = new Set();
    points.forEach((p, i) => {
        const x = pad.left + (i / (points.length - 1 || 1)) * chartW;
        const y = pad.top + chartH - ((p.kg - minKg) / (maxKg - minKg)) * chartH;
        const color = p.prog ? getProgColor(p.prog) : '#555';
        if (p.prog) seenProgs.add(p.prog);

        // Alone esterno
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fillStyle = color + '33';
        ctx.fill();

        // Dot
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Valore kg
        ctx.fillStyle = textColor;
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.kg + 'kg', x, y - 12);
    });

    // Legenda programmi
    if (legendEl && seenProgs.size > 0) {
        legendEl.innerHTML = Array.from(seenProgs).map(prog => {
            const c = getProgColor(prog);
            return `<span class="chart-legend-item"><span class="chart-legend-dot" style="background:${c}"></span>${prog}</span>`;
        }).join('');
    }
}

// ===== EDITOR HELPERS =====
function initEditor() {
    const name = document.getElementById('progName').value.trim();
    if (!name) return alert('Nome!');
    let progs = JSON.parse(localStorage.getItem('gymProgs'));
    if (!progs[name]) progs[name] = { _duration: parseInt(document.getElementById('progWeeks').value) || 8 };
    localStorage.setItem('gymProgs', JSON.stringify(progs));
    refreshDropdowns();
    document.getElementById('editProgSelect').value = name;
    syncEditorProg();
}

function addEx(isLinked) {
    const selDay = document.getElementById('editDaySelect').value;
    const inputDay = document.getElementById('dayName').value.trim();
    const day = selDay || inputDay;
    const name = document.getElementById('exName').value.trim();
    if (!day || !name) return alert('Mancano dati!');
    let progs = JSON.parse(localStorage.getItem('gymProgs'));
    if (!progs[activeProg][day]) progs[activeProg][day] = [];
    progs[activeProg][day].push({
        name, sets: document.getElementById('exSets').value, reps: document.getElementById('exReps').value,
        perc: parseInt(document.getElementById('exPerc').value) || 0,
        rest: parseInt(document.getElementById('exRest').value) || 90,
        note: document.getElementById('exNote').value, linked: isLinked
    });
    localStorage.setItem('gymProgs', JSON.stringify(progs));
    clearExInputs();
    if (!selDay) syncEditorProg(); else refreshEditorTable();
}

// ===== TIMER =====
function startTimer(s) {
    clearInterval(countdown); let t = s;
    countdown = setInterval(() => {
        t--;
        document.getElementById('display-timer').innerText = Math.floor(t / 60) + ':' + (t % 60 < 10 ? '0' + t % 60 : t % 60);
        if (t <= 0) { clearInterval(countdown); document.getElementById('beep-sound').play(); stopTimer(); alert('Tempo scaduto!'); }
    }, 1000);
}
function stopTimer() { clearInterval(countdown); document.getElementById('display-timer').innerText = '00:00'; }

// ===== DRAFTS =====
function saveDraft(idx) {
    const p = document.getElementById('selectProg').value, d = document.getElementById('selectDay').value;
    let drafts = JSON.parse(localStorage.getItem('gymDrafts'));
    if (!drafts[`${p}_${d}`]) drafts[`${p}_${d}`] = {};
    drafts[`${p}_${d}`][idx] = document.getElementById(`w_${idx}`).value;
    localStorage.setItem('gymDrafts', JSON.stringify(drafts));
    saveSessionState();
}

// ===== WAKE LOCK =====
async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        // Riacquisisce il lock se la pagina torna in primo piano
        document.addEventListener('visibilitychange', async () => {
            if (document.visibilityState === 'visible' && wakeLock === null) {
                try { wakeLock = await navigator.wakeLock.request('screen'); } catch(e) {}
            }
        });
    } catch (e) { console.log('Wake Lock non disponibile:', e); }
}
function releaseWakeLock() {
    if (wakeLock) { wakeLock.release(); wakeLock = null; }
}

// ===== SESSION CLOCK =====
function startSessionClock() {
    clearInterval(sessionClockInterval);
    const el = document.getElementById('session-clock');
    if (!el) return;
    el.style.display = 'block';
    sessionClockInterval = setInterval(() => {
        if (!sessionStartTime) return;
        const diff = Math.floor((new Date() - sessionStartTime) / 1000);
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        const pad = n => n < 10 ? '0' + n : n;
        el.textContent = h > 0 ? `⏱ ${pad(h)}:${pad(m)}:${pad(s)}` : `⏱ ${pad(m)}:${pad(s)}`;
    }, 1000);
}
function stopSessionClock() {
    clearInterval(sessionClockInterval);
    sessionClockInterval = null;
}

// ===== EXPORT / IMPORT =====
function exportData() {
    const data = {
        gymProgs: JSON.parse(localStorage.getItem('gymProgs')),
        gymMaxes: JSON.parse(localStorage.getItem('gymMaxes')),
        gymSessionLogs: JSON.parse(localStorage.getItem('gymSessionLogs')),
        gymComments: JSON.parse(localStorage.getItem('gymComments')),
        exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gymcoachpro_backup_${new Date().toLocaleDateString('it-IT').replace(/\//g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.gymProgs) return alert('File non valido!');
            if (!confirm('Sovrascrivere tutti i dati con il backup? L\'operazione è irreversibile.')) return;
            if (data.gymProgs) localStorage.setItem('gymProgs', JSON.stringify(data.gymProgs));
            if (data.gymMaxes) localStorage.setItem('gymMaxes', JSON.stringify(data.gymMaxes));
            if (data.gymSessionLogs) localStorage.setItem('gymSessionLogs', JSON.stringify(data.gymSessionLogs));
            if (data.gymComments) localStorage.setItem('gymComments', JSON.stringify(data.gymComments));
            alert('Importazione completata!');
            location.reload();
        } catch (err) { alert('Errore nel file: ' + err.message); }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ===== ABANDON SESSION =====
function abandonSession() {
    if (!confirm('Abbandonare la sessione corrente? I dati non salvati andranno persi.')) return;
    stopSessionClock();
    releaseWakeLock();
    clearSessionState();
    // Pulisce anche i drafts per questa scheda
    const p = document.getElementById('selectProg').value;
    const d = document.getElementById('selectDay').value;
    if (p && d) {
        let drafts = JSON.parse(localStorage.getItem('gymDrafts'));
        delete drafts[`${p}_${d}`];
        localStorage.setItem('gymDrafts', JSON.stringify(drafts));
    }
    document.getElementById('save-session-btn').style.display = 'none';
    document.getElementById('abandon-session-btn').style.display = 'none';
    document.getElementById('timer-area').style.display = 'none';
    stopTimer();
    // Torna alla preview
    showWorkoutPreview(p, d);
}

// ===== CLEAR =====
function clearLogs() {
    if (confirm('Svuotare tutto il diario? I record NON verranno cancellati. Usa il tasto 🗑 sulle singole sessioni per eliminarle una alla volta.')) {
        localStorage.removeItem('gymSessionLogs');
        location.reload();
    }
}
function clearAll() {
    if (confirm('Cancellare tutto? Questa operazione è irreversibile.')) {
        localStorage.clear(); location.reload();
    }
}

async function inizializzaLibreria() {
    try {
        const response = await fetch('./esercizi.json');
        
        if (!response.ok) {
            throw new Error(`Errore HTTP! Stato: ${response.status}`);
        }

        // ✅ MODIFICA QUI: Se il JSON fallisce o è vuoto, usa un array vuoto []
        exDatabase = (await response.json()) || []; 

        const customEx = JSON.parse(localStorage.getItem('gymCustomExercises')) || []; 
        
        const fullDb = [...exDatabase, ...customEx];

        console.log(`Libreria inizializzata. Esercizi base: ${exDatabase.length}, Custom: ${customEx.length}`);

        if (typeof renderLibrary === 'function') {
            renderLibrary(fullDb); 
        }

    } catch (error) {
        console.error("Impossibile caricare esercizi.json da GitHub:", error);
        
        // ✅ Se il fetch fallisce del tutto, forziamo exDatabase a essere un array vuoto per evitare crash futuri
        const customEx = JSON.parse(localStorage.getItem('gymCustomExercises')) || [];
        
        if (typeof renderLibrary === 'function') {
            renderLibrary(customEx);
        }
    }
}

function renderLibrary(filteredList = null) {
    const listContainer = document.getElementById('library-list');
    if (!listContainer) return; 

    listContainer.innerHTML = '';

    if (!filteredList) {
        const customEx = JSON.parse(localStorage.getItem('gymCustomExercises')) || [];
        const baseDb = Array.isArray(exDatabase) ? exDatabase : [];
        filteredList = [...exDatabase, ...customEx];
    }

    // Ordina alfabeticamente
    filteredList.sort((a, b) => a.name.localeCompare(b.name));

    if (filteredList.length === 0) {
        listContainer.innerHTML = `<p style="color: var(--text-secondary); text-align:center; padding: 20px;">Nessun esercizio trovato.</p>`;
        return;
    }

    filteredList.forEach(ex => {
        // ✅ CORRETTO: Sostituito style="color:#fff;" con style="color:var(--text);"
        listContainer.innerHTML += `
            <div class="stat-item" style="border-left-color: var(--main); display:flex; justify-content: space-between; align-items:center; padding: 12px; cursor:pointer;" onclick="openInfoModal('${ex.name.replace(/'/g, "\\'")}')">
                <div>
                    <strong style="color: var(--text);">${ex.name}</strong><br>
                    <small style="color: var(--text-secondary);">${ex.group}</small>
                </div>
                <span style="color: var(--main); font-size: 1.2rem;">ℹ️</span>
            </div>
        `;
    });
}

function filterLibrary() {
    const query = document.getElementById('search-library').value.toLowerCase().trim();
    const customEx = JSON.parse(localStorage.getItem('gymCustomExercises')) || [];
    const listaCompleta = [...exDatabase, ...customEx];

    const filtered = listaCompleta.filter(ex => 
        ex.name.toLowerCase().includes(query) || 
        ex.group.toLowerCase().includes(query)
    );
    renderLibrary(filtered);
}

function openInfoModal(exName) {
    const customEx = JSON.parse(localStorage.getItem('gymCustomExercises')) || [];
    const fullDb = [...exDatabase, ...customEx]; 
    
    const ex = fullDb.find(e => e.name.toLowerCase() === exName.toLowerCase());

    const modal = document.getElementById('info-modal');
    const content = document.getElementById('info-modal-content');

    if (!modal || !content) return;

    if (!ex) {
        content.innerHTML = `<p style="color:var(--text);">Esercizio personalizzato o non trovato nel database.</p>`;
        modal.style.display = 'flex';
        return;
    }

    let htmlContent = `
        <h3 style="color:var(--main); margin-top:0; margin-bottom:5px;">${ex.name.toUpperCase()}</h3>
        <span style="font-size:0.8rem; color:var(--text-secondary); background:var(--input-bg); padding:4px 8px; border-radius:5px; border:1px solid var(--border); display:inline-block; margin-bottom:15px;">
            🏷️ ${ex.group}
        </span>
    `;

    // 🎥 Mostra la GIF SOLO se l'esercizio ce l'ha nel JSON
    if (ex.gif) {
        htmlContent += `
            <div id="gif-container" style="width:100%; text-align:center; margin-bottom:15px; background:#fff; border-radius:10px; padding:5px; border:1px solid var(--border);">
                <img src="${ex.gif}" alt="${ex.name}" style="width:100%; max-height:220px; object-fit:contain; border-radius:8px;" 
                onerror="this.parentElement.style.display='none';">
            </div>
        `;
    }

    htmlContent += `
        <div style="display:flex; flex-direction:column; gap:12px; font-size:0.9rem; line-height:1.5; color:var(--text);">
            <div>
                <strong style="color:var(--main);">📝 Esecuzione:</strong>
                <p style="margin:4px 0 0 0; color:var(--text-secondary);">${ex.description || 'Non disponibile.'}</p>
            </div>
            
            <div>
                <strong style="color:var(--accent);">🧠 Note Ipertrofia & Biomeccanica:</strong>
                <p style="margin:4px 0 0 0; color:var(--text-secondary);">${ex.biomechanics || ex.hypertrophy_notes || 'Spingi forte e controlla il carico!'}</p>
            </div>

            <div>
                <strong style="color:#ff9800;">💡 Consigli del Coach (Tips):</strong>
                <p style="margin:4px 0 0 0; color:var(--text-secondary);">${ex.tips || 'Usa la tecnica corretta!'}</p>
            </div>
        </div>
    `;

    content.innerHTML = htmlContent;
    modal.style.display = 'flex';
}

function closeInfoModal() {
    document.getElementById('info-modal').style.display = 'none';
}

function openAddExerciseModal() { document.getElementById('add-exercise-modal').style.display = 'flex'; }
function closeAddExerciseModal() { document.getElementById('add-exercise-modal').style.display = 'none'; }

function salvaNuovoEsercizio() {
    const nome = document.getElementById('new-ex-name').value.trim();
    if (!nome) return alert("Il nome è obbligatorio!");

    const nuovoEsercizio = {
        name: nome,
        group: document.getElementById('new-ex-group').value,
        description: document.getElementById('new-ex-desc').value.trim(),
        biomechanics: document.getElementById('new-ex-biomech').value.trim(),
        tips: document.getElementById('new-ex-tips').value.trim()
    };

    let customEx = JSON.parse(localStorage.getItem('gymCustomExercises')) || [];
    customEx.push(nuovoEsercizio);
    localStorage.setItem('gymCustomExercises', JSON.stringify(customEx));

    inizializzaLibreria(); // Aggiorna il database
    renderLibrary();       // Ridisegna la lista
    closeAddExerciseModal();
}

// ===== 📁 GESTIONE PROGRAMMA (ARCHIVIO & EDITOR) =====

// Funzione per navigare tra Archivio, Crea e Bulk senza ricaricare la pagina
function switchSetupSubTab(tab) {
    document.getElementById('setup-view-area').style.display = (tab === 'view' ? 'block' : 'none');
    document.getElementById('setup-create-area').style.display = (tab === 'create' ? 'block' : 'none');
    document.getElementById('setup-bulk-area').style.display = (tab === 'bulk' ? 'block' : 'none');
    
    document.getElementById('subnav-view').style.background = (tab === 'view' ? 'var(--main)' : 'transparent');
    document.getElementById('subnav-view').style.color = (tab === 'view' ? '#000' : '#fff');
    
    document.getElementById('subnav-create').style.background = (tab === 'create' ? 'var(--main)' : 'transparent');
    document.getElementById('subnav-create').style.color = (tab === 'create' ? '#000' : '#fff');
    
    document.getElementById('subnav-bulk').style.background = (tab === 'bulk' ? 'var(--main)' : 'transparent');
    document.getElementById('subnav-bulk').style.color = (tab === 'bulk' ? '#000' : '#fff');

    if (tab === 'view') {
        renderSavedProgramsList();
        costruisciDatalistAutocomplete();
    }

    if (tab === 'bulk') {
        aggiornaSelectExport(); // 👈 AGGIUNGIAMO QUESTA RIGA PER POPOLARE I MENU DELL'EXPORT
    }
}

// Crea la lista delle schede nell'Archivio
function renderSavedProgramsList(filterQuery = "") {
    const container = document.getElementById('saved-programs-list');
    const progs = JSON.parse(localStorage.getItem('gymProgs')) || {};
    if (!container) return;
    container.innerHTML = '';

    const sortedProgs = Object.keys(progs).filter(p => p.toLowerCase().includes(filterQuery.toLowerCase()));

    if (sortedProgs.length === 0) {
        container.innerHTML = `<p style="color: var(--text-secondary); font-size: 0.85rem;">Nessuna scheda trovata.</p>`;
        return;
    }

    sortedProgs.forEach(p => {
        const weeks = progs[p]._duration || "?";
        container.innerHTML += `
            <div class="stat-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; margin-bottom: 8px;">
                <div onclick="selezionaSchedaArchivio('${p.replace(/'/g, "\\'")}')" style="flex: 1; cursor: pointer;">
                    <strong style="color: var(--text);">${p.toUpperCase()}</strong><br>
                    <small style="color: var(--text-secondary);">Durata: ${weeks} sett.</small>
                </div>
                <button onclick="eliminaProgramma('${p.replace(/'/g, "\\'")}')" style="background: none; border: none; color: var(--danger); font-size: 1.2rem; cursor: pointer; padding: 5px;">🗑️</button>
            </div>
        `;
    });
}

function filterSavedPrograms() {
    const q = document.getElementById('search-saved-programs').value;
    renderSavedProgramsList(q);
}

// Quando clicchi su una scheda dell'archivio, si apre l'editor sotto
function selezionaSchedaArchivio(nomeScheda) {
    activeProg = nomeScheda;
    document.getElementById('editing-title').innerText = "Editando: " + nomeScheda;
    
    const progs = JSON.parse(localStorage.getItem('gymProgs'));
    const daySel = document.getElementById('editDaySelect');
    
    let dayOpts = '';
    for (let d in progs[nomeScheda]) {
        if (d !== '_duration') dayOpts += `<option value="${d}">${d}</option>`;
    }
    daySel.innerHTML = dayOpts;

    document.getElementById('editor-controls').style.display = 'block';
    refreshEditorTable();
}

function chiudiSchedaAttiva() {
    let activeProg = null;
    document.getElementById('editor-controls').style.display = 'none';
}

function eliminaProgramma(nomeProgramma) {
    if (!confirm(`Sei sicuro di voler eliminare definitivamente la scheda "${nomeProgramma}"?`)) return;
    let progs = JSON.parse(localStorage.getItem('gymProgs')) || {};
    delete progs[nomeProgramma];
    localStorage.setItem('gymProgs', JSON.stringify(progs));
    
    if (activeProg === nomeProgramma) chiudiSchedaAttiva();
    renderSavedProgramsList();
    refreshDropdowns(); // Aggiorna anche il menu dell'allenamento
}

// Aggiorna la tabella degli esercizi della giornata nell'editor
function refreshEditorTable() {
    const selDay = document.getElementById('editDaySelect').value;
    const container = document.getElementById('preview-table');
    let progs = JSON.parse(localStorage.getItem('gymProgs')) || {};

    if (!selDay || !progs[activeProg] || !progs[activeProg][selDay]) {
        container.innerHTML = "<p style='color:#666; font-size:12px;'>Nessun esercizio in questa giornata.</p>";
        return;
    }

    let html = "<table style='width:100%; font-size:13px; border-collapse:collapse;'>";
    progs[activeProg][selDay].forEach((ex, idx) => {
        html += `<tr style='border-bottom:1px solid #333'>
            <td style='padding:10px;'>${ex.linked ? '🔗' : ''} <b>${ex.name}</b><br><small>${ex.sets}x${ex.reps} - ${ex.rest}s${ex.note ? ' · ' + ex.note : ''}</small></td>
            <td style='text-align:right; white-space:nowrap;'>
                <button onclick="openEditModal('${selDay}', ${idx})" style='background:none; border:none; color:var(--main); font-size:1.1rem; cursor:pointer; padding:4px 6px; margin-right:5px;'>✏️</button>
                <button onclick="removeEx('${selDay}', ${idx})" style='background:none; border:none; color:var(--danger); font-size:1.2rem; cursor:pointer; padding:4px 6px;'>✖</button>
            </td>
        </tr>`;
    });
    container.innerHTML = html + '</table>';
    
    renderReorderList(selDay);
}

function removeEx(day, idx) {
    if (!confirm('Eliminare questo esercizio dalla giornata?')) return;
    let progs = JSON.parse(localStorage.getItem('gymProgs'));
    progs[activeProg][day].splice(idx, 1);
    localStorage.setItem('gymProgs', JSON.stringify(progs));
    refreshEditorTable();
}

function addEx(isLinked) {
    const selDay = document.getElementById('editDaySelect').value;
    const name = document.getElementById('exName').value.trim();
    
    if (!selDay) return alert('Seleziona prima una giornata!');
    if (!name) return alert('Scegli il nome dell\'esercizio!');

    let progs = JSON.parse(localStorage.getItem('gymProgs')) || {};

    progs[activeProg][selDay].push({
        name: name,
        sets: document.getElementById('exSets').value.trim() || "0",
        reps: document.getElementById('exReps').value.trim() || "0",
        perc: parseInt(document.getElementById('exPerc').value) || 0,
        rest: parseInt(document.getElementById('exRest').value) || 90,
        note: document.getElementById('exNote').value.trim(),
        linked: isLinked
    });

    localStorage.setItem('gymProgs', JSON.stringify(progs));
    
    // Pulisce i campi di input
    document.getElementById('exName').value = '';
    document.getElementById('exSets').value = '';
    document.getElementById('exReps').value = '';
    document.getElementById('exPerc').value = '';
    document.getElementById('exNote').value = '';
    document.getElementById('exRest').value = '90';

    refreshEditorTable();
}

// Prepara la barra dei suggerimenti autocompilanti pescando dal database JSON
function costruisciDatalistAutocomplete() {
    const datalist = document.getElementById('library-suggestions');
    if (!datalist) return;
    datalist.innerHTML = '';
    
    const customEx = JSON.parse(localStorage.getItem('gymCustomExercises')) || [];
    const listaCompleta = [...exDatabase, ...customEx];

    listaCompleta.sort((a,b) => a.name.localeCompare(b.name)).forEach(ex => {
        datalist.innerHTML += `<option value="${ex.name}"></option>`;
    });
}

// ↕️ FUNZIONE DRAG & DROP PER RIORDINARE
var dragSrcIdx = null;
function renderReorderList(day) {
    const progs = JSON.parse(localStorage.getItem('gymProgs')) || {};
    const exercises = progs[activeProg][day];
    const list = document.getElementById('reorder-list');
    if (!list) return;
    list.innerHTML = '';

    exercises.forEach((ex, idx) => {
        const item = document.createElement('div');
        item.style = "background:#1e1e1e; padding:10px; border-radius:8px; margin-bottom:5px; border:1px solid #333; display:flex; align-items:center; cursor:move;";
        item.draggable = true;
        item.innerHTML = `<span style="margin-right:15px; color:#666;">☰</span> ${ex.linked ? '🔗' : ''} ${ex.name}`;
        
        item.addEventListener('dragstart', (e) => { dragSrcIdx = idx; });
        item.addEventListener('dragover', (e) => { e.preventDefault(); });
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            if (dragSrcIdx === null || dragSrcIdx === idx) return;
            const progs2 = JSON.parse(localStorage.getItem('gymProgs'));
            const arr = progs2[activeProg][day];
            const moved = arr.splice(dragSrcIdx, 1)[0];
            arr.splice(idx, 0, moved);
            localStorage.setItem('gymProgs', JSON.stringify(progs2));
            refreshEditorTable();
        });
        list.appendChild(item);
    });
}

// ===== CREAZIONE GUIDATA SCHEDA =====
function generaSchedaGuidata() {
    const nome = document.getElementById('create-nome-scheda').value.trim();
    const settimane = document.getElementById('create-durata-scheda').value || "6";
    const numeroGiorni = parseInt(document.getElementById('create-giorni-count').value) || 3;

    if (!nome) {
        return alert("Devi inserire un nome per la nuova scheda!");
    }

    let progs = JSON.parse(localStorage.getItem('gymProgs')) || {};

    // Controlla se esiste già una scheda con lo stesso nome per non sovrascriverla per sbaglio
    if (progs[nome]) {
        if (!confirm(`Esiste già una scheda chiamata "${nome}". Vuoi sovrascriverla del tutto?`)) {
            return;
        }
    }

    // Creiamo la struttura base della scheda
    progs[nome] = {
        "_duration": settimane
    };

    // Creiamo i giorni vuoti (Giorno 1, Giorno 2, ecc.)
    for (let i = 1; i <= numeroGiorni; i++) {
        const nomeGiorno = `Giorno ${i}`;
        progs[nome][nomeGiorno] = []; // Inizializza l'array degli esercizi vuoto per quel giorno
    }

    // Salviamo nel localStorage
    localStorage.setItem('gymProgs', JSON.stringify(progs));

    // Puliamo i campi dell'interfaccia
    document.getElementById('create-nome-scheda').value = "";
    document.getElementById('create-durata-scheda').value = "6";
    document.getElementById('create-giorni-count').value = "3";

    alert(`Scheda "${nome}" creata con successo con ${numeroGiorni} giorni vuoti!`);

    // ✅ Azione finale automatica: portiamo l'utente direttamente all'Archivio per vederla e riempirla!
    switchSetupSubTab('view');
    refreshDropdowns(); 
}

// ===== ⚡ IMPORT / EXPORT TESTUALE =====

// Popola la tendina dell'export quando entri nella sotto-scheda bulk
function aggiornaSelectExport() {
    const progs = JSON.parse(localStorage.getItem('gymProgs')) || {};
    const select = document.getElementById('export-select-scheda');
    if (!select) return;

    let opts = '<option value="">-- Scegli Scheda --</option>';
    for (let p in progs) {
        opts += `<option value="${p}">${p.toUpperCase()}</option>`;
    }
    select.innerHTML = opts;
}

// 📤 Esporta una scheda esistente nel formato testo leggibile
function esportaSchedaTesto() {
    const nomeScheda = document.getElementById('export-select-scheda').value;
    if (!nomeScheda) return alert("Seleziona una scheda da esportare!");

    const progs = JSON.parse(localStorage.getItem('gymProgs')) || {};
    const scheda = progs[nomeScheda];

    let output = `${nomeScheda}; ${scheda._duration || "6"}\n`;

    for (let giorno in scheda) {
        if (giorno === '_duration') continue;
        output += `\n${giorno}\n`;
        
        scheda[giorno].forEach(ex => {
            // Formato: Nome; Set; Reps; Rest; %; Note; Linked
            output += `${ex.name}; ${ex.sets}; ${ex.reps}; ${ex.rest}; ${ex.perc || 0}; ${ex.note || ""}; ${ex.linked ? "linked" : ""}\n`;
        });
    }

    document.getElementById('bulk-text-area').value = output.trim();
    alert("Testo generato! Copialo dall'area di testo sottostante.");
}

// 📥 Importa un testo scritto e lo trasforma in una scheda vera
function importaSchedaTesto() {
    const text = document.getElementById('bulk-text-area').value.trim();
    if (!text) return alert("L'area di testo è vuota!");

    const lines = text.split('\n');
    let progs = JSON.parse(localStorage.getItem('gymProgs')) || {};

    let currentSchedaName = "";
    let currentGiorno = "";

    lines.forEach((line, index) => {
        line = line.trim();
        if (!line) return; // Salta le righe vuote

        // Riga 1: Nome Scheda; Durata
        if (index === 0 && line.includes(';')) {
            const parts = line.split(';');
            currentSchedaName = parts[0].trim();
            const durata = parts[1] ? parts[1].trim() : "6";

            progs[currentSchedaName] = { "_duration": durata };
            return;
        }

        // Rilevamento del Giorno (es. "Giorno 1" o "Giorno 2")
        if (line.toLowerCase().startsWith('giorno')) {
            currentGiorno = line;
            if (currentSchedaName) {
                progs[currentSchedaName][currentGiorno] = [];
            }
            return;
        }

        // Rilevamento Esercizio (se contiene un punto e virgola)
        if (line.includes(';') && currentSchedaName && currentGiorno) {
            const p = line.split(';');
            
            progs[currentSchedaName][currentGiorno].push({
                name: p[0] ? p[0].trim() : "Esercizio",
                sets: p[1] ? p[1].trim() : "0",
                reps: p[2] ? p[2].trim() : "0",
                rest: p[3] ? parseInt(p[3].trim()) : 90,
                perc: p[4] ? parseInt(p[4].trim()) : 0,
                note: p[5] ? p[5].trim() : "",
                linked: p[6] ? p[6].trim().toLowerCase() === "linked" : false
            });
        }
    });

    if (!currentSchedaName) {
        return alert("Errore nel formato del testo. Assicurati che la prima riga contenga 'NomeScheda; Durata'!");
    }

    localStorage.setItem('gymProgs', JSON.stringify(progs));
    alert(`Scheda "${currentSchedaName}" importata con successo!`);
    
    document.getElementById('bulk-text-area').value = ""; // Svuota
    
    // Torna all'archivio visivo
    switchSetupSubTab('view');
    refreshDropdowns();
}

function switchSetupSubTab(tab) {
    // 1. Nascondi le tre aree
    document.getElementById('setup-view-area').style.display = 'none';
    document.getElementById('setup-create-area').style.display = 'none';
    document.getElementById('setup-bulk-area').style.display = 'none';

    // 2. Spegni tutti i bottoni (usando i TUOI ID originali)
    document.getElementById('subnav-view').classList.remove('active');
    document.getElementById('subnav-create').classList.remove('active');
    document.getElementById('subnav-bulk').classList.remove('active');

    // 3. Mostra l'area scelta e accendi il bottone cliccato
    document.getElementById(`setup-${tab}-area`).style.display = 'block';
    document.getElementById(`subnav-${tab}`).classList.add('active');

    // Se entriamo in Import/Export aggiorniamo la tendina
    if (tab === 'bulk') {
        aggiornaSelectExport();
    }
}