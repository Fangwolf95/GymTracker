// ===== STATE =====
let countdown;
let activeProg = null;
let currentRest = 90;
let currentDeload = false;   // true durante una sessione deload
let sessionCounters = {};
let currentCommentKey = null;
let wakeLock = null;
let sessionStartTime = null;
let sessionClockInterval = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', function () {
    ['gymMaxes','gymProgs','gymSessionLogs','gymDrafts','gymComments'].forEach(k => {
        if (!localStorage.getItem(k)) localStorage.setItem(k, k === 'gymSessionLogs' ? '[]' : '{}');
    });
    applyTheme();
    refreshDropdowns();
    switchMode('training');
    // renderStats() verrà chiamata automaticamente alla prima apertura della tab Stats
});

// ===== STORAGE HELPERS =====
function getStore(key) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null || raw === 'null' || raw === 'undefined') {
            return key === 'gymSessionLogs' ? [] : {};
        }
        const parsed = JSON.parse(raw);
        // Ulteriore guard: se il tipo atteso non corrisponde, ritorna il default
        if (key === 'gymSessionLogs') return Array.isArray(parsed) ? parsed : [];
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch(e) {
        return key === 'gymSessionLogs' ? [] : {};
    }
}
function setStore(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

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
    ['setup', 'training', 'stats', 'archive'].forEach(s => {
        const el = document.getElementById(s + '-section');
        el.classList.toggle('hidden', m !== s);
        const btn = document.getElementById('nav-' + s);
        if (btn) btn.classList.toggle('nav-active', m === s);
    });
    if (m === 'stats') { renderStats(); populateStatsExSelect(); }
    if (m === 'archive') initArchive();
    refreshDropdowns();
}

// ===== DROPDOWNS =====
function refreshDropdowns() {
    const s = getStore('gymProgs');
    const selTraining = document.getElementById('selectProg');
    const selEdit = document.getElementById('editProgSelect');
    const prevProg = selTraining ? selTraining.value : '';
    const prevDay  = document.getElementById('selectDay') ? document.getElementById('selectDay').value : '';
    let opts = '<option value="">-- Seleziona Programma --</option>';
    let editOpts = '<option value="">-- Seleziona --</option>';
    for (let p in s) {
        opts     += `<option value="${escAttr(p)}">${escHtml(p)}</option>`;
        editOpts += `<option value="${escAttr(p)}">${escHtml(p)}</option>`;
    }
    if (selTraining) selTraining.innerHTML = opts;
    if (selEdit) selEdit.innerHTML = editOpts;
    if (prevProg && s[prevProg]) {
        if (selTraining) selTraining.value = prevProg;
        updateDaySelect(s);
        const selDay = document.getElementById('selectDay');
        if (selDay && prevDay && s[prevProg][prevDay]) selDay.value = prevDay;
    }
}

// ===== SESSION PERSISTENCE =====
function sessionKey() {
    const p = document.getElementById('selectProg').value;
    const d = document.getElementById('selectDay').value;
    return `gymSession_${p}_${d}`;
}
function saveSessionState(deloadFlag) {
    const p = document.getElementById('selectProg').value;
    const d = document.getElementById('selectDay').value;
    if (!p || !d) return;
    const progsData = getStore('gymProgs');
    if (!progsData[p] || !Array.isArray(progsData[p][d])) return;
    const exercises = progsData[p][d];
    let state = { counters: {}, weights: {}, reps: {} };
    exercises.forEach((ex, idx) => {
        state.counters[idx] = sessionCounters[idx] || 0;
        const elW = document.getElementById(`w_${idx}`);
        const elR = document.getElementById(`r_${idx}`);
        state.weights[idx] = elW ? elW.value : '';
        state.reps[idx] = elR ? elR.value : (ex.reps || '');
    });
    state.startTime = sessionStartTime ? sessionStartTime.toISOString() : new Date().toISOString();
    state.deload = (deloadFlag !== undefined) ? deloadFlag : currentDeload;
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
    if (!selected) { activeProg = null; controls.classList.add('hidden'); return; }
    const progs = getStore('gymProgs');
    activeProg = selected;
    controls.classList.remove('hidden');
    document.getElementById('editing-title').innerText = selected;
    const daySel = document.getElementById('editDaySelect');
    let dayOpts = '<option value="">-- Seleziona Giorno --</option>';
    for (let d in progs[selected]) if (d !== '_duration') dayOpts += `<option value="${escAttr(d)}">${escHtml(d)}</option>`;
    daySel.innerHTML = dayOpts;
    refreshEditorTable();
}

function escAttr(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
}
// Escape per contenuto innerHTML (non per attributi)
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}


function refreshEditorTable() {
    const selDay = document.getElementById('editDaySelect').value;
    const inputDay = document.getElementById('dayName').value.trim();
    const day = selDay || inputDay;
    const container = document.getElementById('preview-table');
    let progs = getStore('gymProgs');
    if (!day || !progs[activeProg] || !progs[activeProg][day]) {
        container.innerHTML = "<p class='empty-message-sm'>Nessun esercizio salvato.</p>";
        document.getElementById('reorder-list').innerHTML = '';
        return;
    }
    const safeDay = escAttr(day);
    let html = "<table class='editor-table'>";
    progs[activeProg][day].forEach((ex, idx) => {
        html += `<tr class='editor-table-row'>
            <td class='editor-table-cell'>${ex.linked ? '🔗' : ''} <b>${escHtml(ex.name)}</b><br><small>${ex.sets}x${ex.reps} - ${ex.rest}s${ex.note ? ' · ' + escHtml(ex.note) : ''}</small></td>
            <td class='editor-table-actions'>
                <button onclick="openEditModal('${safeDay}', ${idx})" class='editor-btn-edit'>✏️</button>
                <button onclick="removeEx('${safeDay}', ${idx})" class='editor-btn-remove'>✖</button>
            </td>
        </tr>`;
    });
    container.innerHTML = html + '</table>';
    renderReorderList(day);
}

// ===== REORDER =====
let dragSrcIdx = null;
function renderReorderList(day) {
    const progs = getStore('gymProgs');
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
        item.addEventListener('dragend', () => { dragSrcIdx = null; });
        item.addEventListener('dragover', e => { e.preventDefault(); item.classList.add('drag-over'); });
        item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
        item.addEventListener('drop', e => {
            e.preventDefault(); item.classList.remove('drag-over');
            if (dragSrcIdx === null || dragSrcIdx === idx) return;
            const progs2 = getStore('gymProgs');
            const arr = progs2[activeProg][day];
            const moved = arr.splice(dragSrcIdx, 1)[0];
            arr.splice(idx, 0, moved);
            setStore('gymProgs', progs2);
            renderReorderList(day);
            refreshEditorTable();
        });
        list.appendChild(item);
    });
}

function saveReorder() {
    // L'ordine viene già salvato automaticamente durante il drag & drop.
    // Questo pulsante mostra solo un feedback visivo temporaneo.
    const btn = document.querySelector('[onclick="saveReorder()"]');
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent = '✅ Ordine salvato';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1500);
}

// ===== EDIT EXERCISE MODAL =====
let editDay = null;
let editIdx = null;

function openEditModal(day, idx) {
    const progs = getStore('gymProgs');
    if (!activeProg || !progs[activeProg] || !Array.isArray(progs[activeProg][day])) return;
    const ex = progs[activeProg][day][idx];
    if (!ex) return;
    editDay = day;
    editIdx = idx;
    document.getElementById('edit-ex-name').value = ex.name || '';
    document.getElementById('edit-ex-perc').value = ex.perc || 0;
    document.getElementById('edit-ex-sets').value = ex.sets || '';
    document.getElementById('edit-ex-reps').value = ex.reps || '';
    document.getElementById('edit-ex-rest').value = ex.rest || 90;
    document.getElementById('edit-ex-note').value = ex.note || '';
    document.getElementById('edit-ex-linked').checked = ex.linked || false;
    document.getElementById('edit-modal').classList.remove('hidden');
}

function saveEditModal() {
    const name = document.getElementById('edit-ex-name').value.trim();
    if (!name) return alert('Il nome è obbligatorio');
    let progs = getStore('gymProgs');
    progs[activeProg][editDay][editIdx] = {
        name,
        perc: parseInt(document.getElementById('edit-ex-perc').value) || 0,
        sets: document.getElementById('edit-ex-sets').value.trim(),
        reps: document.getElementById('edit-ex-reps').value.trim(),
        rest: parseInt(document.getElementById('edit-ex-rest').value) || 90,
        note: document.getElementById('edit-ex-note').value.trim(),
        linked: document.getElementById('edit-ex-linked').checked
    };
    setStore('gymProgs', progs);
    closeEditModal();
    refreshEditorTable();
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
    editDay = null;
    editIdx = null;
}

function removeEx(day, idx) {
    if (!confirm('Eliminare?')) return;
    let progs = getStore('gymProgs');
    progs[activeProg][day].splice(idx, 1);
    setStore('gymProgs', progs);
    refreshEditorTable();
}

function clearExInputs() {
    ['exName', 'exPerc', 'exSets', 'exReps', 'exRest', 'exNote'].forEach(id => document.getElementById(id).value = '');
}

// ===== BULK IMPORT =====
function processBulkImport() {
    const text = document.getElementById('bulk-import-area').value.trim();
    const progName = (document.getElementById('bulkProgName') || {value:''}).value.trim() || activeProg;
    if (!progName || !text) return alert('Inserisci il nome della scheda e il testo!');
    let progs = getStore('gymProgs');
    if (!progs[progName]) progs[progName] = { _duration: 8 };
    let currentDay = '';
    text.split('\n').forEach(line => {
        line = line.trim(); if (!line) return;
        if (line.startsWith('#')) {
            currentDay = line.replace(/^#+/, '').trim();
            if (!currentDay) return; // riga solo con # senza nome
            progs[progName][currentDay] = [];
        } else if (currentDay) {
            let linked = line.startsWith('*'); if (linked) line = line.replace(/^\*+/, '').trim();
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
    setStore('gymProgs', progs);
    refreshDropdowns();
    showToast(`✅ Scheda "${progName}" importata`);
    switchSetupTab('edit');
    const bsel = document.getElementById('editProgSelect');
    if (bsel) { bsel.value = progName; syncEditorProg(); }
}

// ===== TRAINING =====
function updateDaySelect(progsData) {
    const p = document.getElementById('selectProg').value;
    const sel = document.getElementById('selectDay');
    sel.innerHTML = '<option value="">Giorno...</option>';
    if (!p) return;
    const progs = progsData || getStore('gymProgs');
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
    const progsData = getStore('gymProgs');
    const exercises = progsData[p] && progsData[p][d];
    if (!Array.isArray(exercises) || exercises.length === 0) {
        area.innerHTML = `<p class="empty-message">Nessun esercizio in questo giorno.</p>`;
        return;
    }
    const maxes = getStore('gymMaxes');
    const logs = getStore('gymSessionLogs');
    const comments = getStore('gymComments');

    // Dati ultima sessione per questo programma+giorno
    let lastSession = null;
    for (let i = logs.length - 1; i >= 0; i--) {
        if (logs[i].day === d && logs[i].prog === p) { lastSession = logs[i]; break; }
    }

    // Totali
    const totalSets = exercises.reduce((a, ex) => a + (parseInt(ex.sets) || 0), 0);
    const totalExercises = exercises.length;

    // Stima durata: media reale se disponibile, altrimenti formula
    const pastDurations = logs
        .filter(l => l.prog === p && l.day === d && l.duration && l.duration > 0)
        .map(l => l.duration);
    let estMinutes;
    if (pastDurations.length >= 1) {
        estMinutes = Math.round(pastDurations.reduce((a, b) => a + b, 0) / pastDurations.length);
    } else {
        const execSec = exercises.reduce((a, ex) => {
            const sets = parseInt(ex.sets) || 0;
            const rest = parseInt(ex.rest) || 90;
            return a + sets * (rest + 45);
        }, 0);
        const changeSec = Math.max(0, (totalExercises - 1)) * 90;
        estMinutes = Math.round((execSec + changeSec) / 60);
    }
    const estLabel = `~${estMinutes}'`;
    const estSubLabel = pastDurations.length >= 1 ? `media ${pastDurations.length} sess.` : 'stimati';

    // Lista esercizi preview
    let exListHtml = '';
    exercises.forEach(ex => {
        const target = ex.perc > 0 ? Math.round(((maxes[ex.name.toLowerCase().trim()] || 0) * ex.perc) / 100) : 0;
        const commentKey = `${p}__${ex.name.toLowerCase().trim()}`;
        const comment = comments[commentKey] || '';
        exListHtml += `
        <div class="preview-ex-row ${ex.linked ? 'preview-linked' : ''}">
            <div class="preview-ex-left">
                <span class="preview-ex-name">${ex.linked ? '🔗 ' : ''}${ex.name}</span>
                <span class="preview-ex-meta">${ex.sets}×${ex.reps} · ${ex.rest}s rec${target > 0 ? ` · <span class="preview-ex-target">${target}kg</span>` : ''}</span>
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
    document.getElementById('timer-area').classList.add('hidden');
    document.getElementById('save-session-btn').classList.add('hidden');
}

// Deload ogni 4a sessione (dopo 3 normali): sessione 4, 8, 12...
function isDeloadSession(logs, prog, day) {
    const count = logs.filter(l => l.prog === prog && l.day === day).length;
    return count > 0 && count % 4 === 3;
}

function startWorkout(isRestore) {
    const p = document.getElementById('selectProg').value, d = document.getElementById('selectDay').value;
    const area = document.getElementById('workout-display-area');
    const progsData = getStore('gymProgs');
    const exercises = progsData[p] && progsData[p][d];
    if (!Array.isArray(exercises) || exercises.length === 0) {
        showToast('Nessun esercizio in questo giorno.', 'error');
        return;
    }
    const maxes = getStore('gymMaxes');
    const logs = getStore('gymSessionLogs');
    const comments = getStore('gymComments');
    const savedState = isRestore ? loadSessionState() : null;
    // Se è un restore, rispetta il flag deload salvato nella sessione originale
    const deload = isRestore
        ? (savedState && savedState.deload === true)
        : isDeloadSession(logs, p, d);

    area.innerHTML = '';
    sessionCounters = {};
    currentDeload = deload;

    // Pre-carica i draft una volta sola per tutti gli esercizi
    const sessionDrafts = (getStore('gymDrafts')[`${p}_${d}`]) || {};

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
            restoredWeight = sessionDrafts[idx] || '';
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

        // Commento persistente (scoped per programma + esercizio)
        const commentKey = `${p}__${ex.name.toLowerCase().trim()}`;
        const savedComment = comments[commentKey] || '';
        const commentLabel = savedComment ? `💬 ${savedComment}` : '💬 Aggiungi commento...';
        const commentClass = savedComment ? 'btn-comment has-comment' : 'btn-comment';

        const serieFatte = sessionCounters[idx];
        const totalSets = parseInt(ex.sets) || 0;
        const isDone = serieFatte >= totalSets && totalSets > 0;

        const targetDisplay = deload && deloadTarget > 0
            ? `<span class="ex-target deload-target">${deloadTarget}kg <small>(-15%)</small></span>`
            : `<span class="ex-target">${target > 0 ? target + 'kg' : '--'}</span>`;

        const safeExName = escAttr(ex.name);
        const safeCommentKey = escAttr(commentKey);
        const cardHtml = `<div class="exercise-card${deload ? ' deload-card' : ''}${isDone ? ' card-done' : ''}" id="card-${idx}">
            <div class="ex-header">
                <strong>${ex.name.toUpperCase()}</strong>
                <div class="ex-header-actions">
                    <button class="btn-info-ex" onclick="openInfoModalByName('${safeExName}')" title="Scheda esercizio" aria-label="Info su ${ex.name}">ℹ️</button>
                    <span id="sets-count-${idx}" class="sets-badge ${isDone ? 'sets-done' : ''}">Serie: ${serieFatte} / ${totalSets}</span>
                </div>
            </div>
            <div class="ex-header ex-header--meta">
                <span class="ex-info">${ex.sets}×${ex.reps} @ ${ex.perc}% (⏱${ex.rest}s)</span>
                ${targetDisplay}
            </div>
            <div class="ex-last">Ultima: ${lastDisplay}</div>
            ${suggestion}
            <div class="row card-input-row">
                <input type="number" id="w_${idx}" placeholder="Kg" value="${restoredWeight}" oninput="saveDraft(${idx})" class="flex-2">
                <input type="number" id="r_${idx}" placeholder="Reps" value="${restoredReps}" oninput="saveDraft(${idx})" class="flex-1 input-min">
                <button class="btn-ok" onclick="confirmSet('${safeExName}', ${ex.perc}, ${idx}, ${ex.rest}, ${ex.sets})">OK</button>
            </div>
            <button class="${commentClass}" id="comment-btn-${idx}" onclick="openCommentModal('${safeCommentKey}', ${idx})">${commentLabel}</button>
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

    document.getElementById('timer-area').classList.remove('hidden');
    document.getElementById('save-session-btn').classList.remove('hidden');
    document.getElementById('abandon-session-btn').classList.remove('hidden');

    requestWakeLock();
    const savedStart = savedState ? savedState.startTime : null;
    sessionStartTime = savedStart ? new Date(savedStart) : new Date();
    saveSessionState(deload);
    startSessionClock();
}

function confirmSet(name, perc, idx, rest, totalSets) {
    totalSets = parseInt(totalSets) || 0;
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
        let maxes = getStore('gymMaxes');
        const calc = Math.round((w / perc) * 100);
        if (calc > (maxes[name.toLowerCase().trim()] || 0)) {
            maxes[name.toLowerCase().trim()] = calc;
            setStore('gymMaxes', maxes);
            showToast(`🏆 Nuovo record stimato: ${calc}kg (${name})`, 'success');
        }
    }
    currentRest = rest;
    document.getElementById('btn-auto-timer').innerText = 'Recupero (' + rest + 's)';
    startTimer(rest);
}

// ===== FINISH WORKOUT =====
function finishWorkout() {
    stopTimer();
    stopSessionClock();
    releaseWakeLock();
    document.getElementById('abandon-session-btn').classList.add('hidden');
    document.getElementById('session-note-modal').classList.remove('hidden');
}

function confirmFinishWorkout(skip) {
    document.getElementById('session-note-modal').classList.add('hidden');
    const note = skip ? '' : (document.getElementById('session-note-input').value.trim());
    document.getElementById('session-note-input').value = '';

    const p = document.getElementById('selectProg').value, d = document.getElementById('selectDay').value;
    const progsData = getStore('gymProgs');
    const exercises = progsData[p] && progsData[p][d];
    if (!Array.isArray(exercises)) { switchMode('stats'); return; }
    let res = [], vol = 0;
    exercises.forEach((ex, idx) => {
        const w = parseFloat(document.getElementById(`w_${idx}`).value) || 0;
        const rEl = document.getElementById(`r_${idx}`);
        const rDone = rEl ? (parseInt(rEl.value) || parseInt(ex.reps) || 0) : (parseInt(ex.reps) || 0);
        const rPlanned = parseInt(ex.reps) || 0;
        const serieEffettive = sessionCounters[idx] || 0;
        const repsLabel = rDone !== rPlanned ? `${w}kg × ${rDone} reps` : `${w}kg`;
        res.push(ex.name + ': ' + repsLabel);
        vol += (w * serieEffettive * rDone);
    });
    vol = Math.round(vol);

    let logs = getStore('gymSessionLogs');
    const durationMin = sessionStartTime ? Math.round((new Date() - sessionStartTime) / 60000) : 0;
    logs.push({
        date: new Date().toISOString(),
        dateStr: new Date().toLocaleDateString('it-IT'),
        prog: p, day: d, details: res.join(', '), volume: vol, note: note, duration: durationMin
    });
    setStore('gymSessionLogs', logs);

    let drafts = getStore('gymDrafts');
    delete drafts[`${p}_${d}`];
    setStore('gymDrafts', drafts);
    clearSessionState();
    currentDeload = false;
    sessionCounters = {};
    sessionStartTime = null;

    switchMode('stats');
    showToast(`✅ Sessione salvata! Volume: ${vol}kg`);
}

// ===== COMMENTI ESERCIZI =====
function openCommentModal(commentKey, idx) {
    currentCommentKey = commentKey;
    const comments = getStore('gymComments');
    // Mostra solo il nome dell'esercizio (dopo il separatore __) nel titolo
    const displayName = commentKey.includes('__') ? commentKey.split('__')[1] : commentKey;
    document.getElementById('comment-modal-title').innerText = '💬 ' + displayName.toUpperCase();
    document.getElementById('comment-modal-input').value = comments[commentKey] || '';
    document.getElementById('comment-modal').classList.remove('hidden');
}

function saveComment() {
    const val = document.getElementById('comment-modal-input').value.trim();
    let comments = getStore('gymComments');
    if (val) {
        comments[currentCommentKey] = val;
    } else {
        delete comments[currentCommentKey];
    }
    setStore('gymComments', comments);

    // Aggiorna pulsante nella card corrispondente
    const p = document.getElementById('selectProg').value;
    const d = document.getElementById('selectDay').value;
    const progsData = getStore('gymProgs');
    document.querySelectorAll('[id^="comment-btn-"]').forEach(btn => {
        const cardIdx = parseInt(btn.id.replace('comment-btn-', ''));
        if (!progsData[p] || !progsData[p][d]) return;
        const exercises = progsData[p][d];
        const ex = exercises[cardIdx];
        if (!ex) return;
        const key = `${p}__${ex.name.toLowerCase().trim()}`;
        if (key === currentCommentKey) {
            btn.textContent = val ? `💬 ${val}` : '💬 Aggiungi commento...';
            btn.className = val ? 'btn-comment has-comment' : 'btn-comment';
        }
    });

    closeCommentModal();
}

function closeCommentModal() {
    document.getElementById('comment-modal').classList.add('hidden');
    currentCommentKey = null;
}

// Palette colori per programma
const PROG_COLORS = ['#00adb5','#ff6b6b','#ffd93d','#6bcb77','#a855f7','#f97316','#3b82f6','#ec4899'];
function getProgColor(progName, progsCache) {
    const progs = progsCache || getStore('gymProgs');
    const keys = Object.keys(progs);
    const idx = keys.indexOf(progName);
    return idx >= 0 ? PROG_COLORS[idx % PROG_COLORS.length] : '#555';
}

// ===== STATS =====
function renderStats() {
    const maxes = getStore('gymMaxes');
    const logs = getStore('gymSessionLogs');
    const progsCache = getStore('gymProgs');
    const container = document.getElementById('stats-container');
    const oneWeekAgo = new Date(); oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const weeklyVol = Math.round(logs.reduce((acc, l) => new Date(l.date) > oneWeekAgo ? acc + (l.volume || 0) : acc, 0));

    let html = `<div class="mini-list weekly-vol-box">
        <small class="weekly-vol-label">VOLUME ULTIMI 7gg</small>
        <div class="weekly-vol-value">${weeklyVol} kg</div>
    </div>
    <h4>Record:</h4><div class="mini-list">`;
    Object.entries(maxes).forEach(([ex, w]) => html += `<div>${ex.toUpperCase()}: <b>${w}kg</b></div>`);
    html += '</div><h4>Diario:</h4>';
    logs.slice().reverse().forEach((l, reversedIdx) => {
        const realIdx = logs.length - 1 - reversedIdx;
        const color = l.prog ? getProgColor(l.prog, progsCache) : '#555';
        const progDot = l.prog ? `<span class="prog-dot" style="background:${color}" title="${escHtml(l.prog)}"></span>` : '';
        html += `<div class='stat-item' style="border-left-color:${color}">
            <div class="stat-item-header">
                <div>${progDot}<strong>${l.dateStr}</strong> <span class="stat-day-name">${l.day}</span> ${l.duration ? `<span class="stat-duration">⏱ ${l.duration} min</span>` : ''}</div>
                <button class="btn-delete-log" onclick="deleteLog(${realIdx})" title="Elimina sessione">🗑</button>
            </div>
            <small class="stat-details">Vol: ${l.volume}kg${l.prog ? ` · ${l.prog}` : ''} | ${l.details}</small>
            ${l.note ? `<div class="stat-note">📝 ${l.note}</div>` : ''}
        </div>`;
    });
    if (logs.length === 0) html += `<p class="empty-message">Nessuna sessione registrata.</p>`;
    container.innerHTML = html;
}

function deleteLog(idx) {
    if (!confirm('Eliminare questa sessione?')) return;
    let logs = getStore('gymSessionLogs');
    logs.splice(idx, 1);
    setStore('gymSessionLogs', logs);
    renderStats();
    populateStatsExSelect();
    renderProgressChart();
}

function populateStatsExSelect() {
    const logs = getStore('gymSessionLogs');
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
    const sel = document.getElementById('statsExSelect');
    const exName = sel ? sel.value : '';
    const canvas = document.getElementById('progressChart');
    const empty = document.getElementById('progressChartEmpty');
    const legendEl = document.getElementById('chartLegend');
    if (!canvas || !empty) return;
    canvas.classList.add('hidden');
    empty.classList.add('hidden');
    if (legendEl) legendEl.innerHTML = '';
    if (!exName) return;

    const logs = getStore('gymSessionLogs');
    const progsCache = getStore('gymProgs');
    const points = [];
    logs.forEach(l => {
        const entry = l.details.split(', ').find(s => s.startsWith(exName + ':'));
        if (entry) {
            const kg = parseFloat(entry.split(': ')[1]);
            if (!isNaN(kg) && kg > 0) points.push({ date: l.dateStr, kg, prog: l.prog || null });
        }
    });

    if (points.length === 0) { empty.classList.remove('hidden'); return; }

    canvas.classList.remove('hidden');
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
        const color = p.prog ? getProgColor(p.prog, progsCache) : '#555';
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
            const c = getProgColor(prog, progsCache);
            return `<span class="chart-legend-item"><span class="chart-legend-dot" style="background:${c}"></span>${escHtml(prog)}</span>`;
        }).join('');
    }
}

// ===== EDITOR HELPERS =====
function initEditor() {
    const name = document.getElementById('progName').value.trim();
    if (!name) return alert('Nome!');
    let progs = getStore('gymProgs');
    if (!progs[name]) progs[name] = { _duration: parseInt(document.getElementById('progWeeks').value) || 8 };
    setStore('gymProgs', progs);
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
    if (!activeProg) return alert('Seleziona un programma prima!');
    let progs = getStore('gymProgs');
    if (!progs[activeProg][day]) progs[activeProg][day] = [];
    progs[activeProg][day].push({
        name,
        sets: document.getElementById('exSets').value.trim(),
        reps: document.getElementById('exReps').value.trim(),
        perc: parseInt(document.getElementById('exPerc').value) || 0,
        rest: parseInt(document.getElementById('exRest').value) || 90,
        note: document.getElementById('exNote').value.trim(),
        linked: isLinked
    });
    setStore('gymProgs', progs);
    clearExInputs();
    if (!selDay) syncEditorProg(); else refreshEditorTable();
}

// ===== TOAST NOTIFICATION =====
function showToast(message, type = 'success') {
    const existing = document.getElementById('gym-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'gym-toast';
    toast.className = `gym-toast gym-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('gym-toast-visible'));
    setTimeout(() => {
        toast.classList.remove('gym-toast-visible');
        setTimeout(() => toast.remove(), 300);
    }, 2800);
}

// ===== AUDIO (Web Audio API — funziona offline)) =====
function playBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.8, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.6);
    } catch (e) { console.log('Audio non disponibile:', e); }
}

// ===== TIMER =====
function showTimerDoneMessage() {
    const timerArea = document.getElementById('timer-area');
    const existing = document.getElementById('timer-done-banner');
    if (existing) existing.remove();
    const banner = document.createElement('div');
    banner.id = 'timer-done-banner';
    banner.className = 'timer-done-banner';
    banner.textContent = '✅ Recupero terminato!';
    timerArea.insertBefore(banner, timerArea.firstChild);
    setTimeout(() => banner && banner.remove(), 2500);
}

function startTimer(s) {
    s = Math.max(1, parseInt(s) || 1);
    clearInterval(countdown);
    const existing = document.getElementById('timer-done-banner');
    if (existing) existing.remove();
    let t = s;
    const display = document.getElementById('display-timer');
    display.style.color = 'var(--main)';
    countdown = setInterval(() => {
        t--;
        const mm = Math.floor(t / 60);
        const ss = t % 60;
        display.innerText = (mm < 10 ? '0' + mm : mm) + ':' + (ss < 10 ? '0' + ss : ss);
        if (t <= 10 && t > 0) display.style.color = 'var(--danger)';
        if (t <= 0) {
            clearInterval(countdown);
            display.innerText = '00:00';
            display.style.color = 'var(--main)';
            playBeep();
            showTimerDoneMessage();
        }
    }, 1000);
}
function stopTimer() {
    clearInterval(countdown);
    document.getElementById('display-timer').innerText = '00:00';
    document.getElementById('display-timer').style.color = 'var(--main)';
    const banner = document.getElementById('timer-done-banner');
    if (banner) banner.remove();
}

// ===== DRAFTS =====
function saveDraft(idx) {
    const p = document.getElementById('selectProg').value, d = document.getElementById('selectDay').value;
    let drafts = getStore('gymDrafts');
    if (!drafts[`${p}_${d}`]) drafts[`${p}_${d}`] = {};
    drafts[`${p}_${d}`][idx] = document.getElementById(`w_${idx}`).value;
    setStore('gymDrafts', drafts);
    saveSessionState(); // qui il DOM è già aggiornato, il fallback è corretto
}

// ===== WAKE LOCK =====
let _wakeLockListenerAdded = false;
async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        // Aggiunge il listener una sola volta per evitare accumuli
        if (!_wakeLockListenerAdded) {
            _wakeLockListenerAdded = true;
            document.addEventListener('visibilitychange', async () => {
                if (document.visibilityState === 'visible' && wakeLock === null) {
                    try { wakeLock = await navigator.wakeLock.request('screen'); } catch(e) {}
                }
            });
        }
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
    el.classList.remove('hidden');
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
        gymProgs: getStore('gymProgs'),
        gymMaxes: getStore('gymMaxes'),
        gymSessionLogs: getStore('gymSessionLogs'),
        gymComments: getStore('gymComments'),
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
            if (!data.gymProgs || typeof data.gymProgs !== 'object') {
                return alert('File non valido o corrotto!');
            }
            if (!confirm('Sovrascrivere tutti i dati con il backup? L\'operazione è irreversibile.')) return;
            const keys = ['gymProgs', 'gymMaxes', 'gymSessionLogs', 'gymComments', 'gymDrafts'];
            keys.forEach(k => {
                if (data[k] !== undefined) localStorage.setItem(k, JSON.stringify(data[k]));
            });
            showToast('✅ Importazione completata!');
            setTimeout(() => location.reload(), 800);
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
    currentDeload = false;
    sessionCounters = {};
    sessionStartTime = null;
    // Pulisce anche i drafts per questa scheda
    const p = document.getElementById('selectProg').value;
    const d = document.getElementById('selectDay').value;
    if (p && d) {
        let drafts = getStore('gymDrafts');
        delete drafts[`${p}_${d}`];
        setStore('gymDrafts', drafts);
    }
    document.getElementById('save-session-btn').classList.add('hidden');
    document.getElementById('abandon-session-btn').classList.add('hidden');
    document.getElementById('timer-area').classList.add('hidden');
    stopTimer();
    // Torna alla preview solo se prog e giorno sono ancora validi
    if (p && d) showWorkoutPreview(p, d);
    else document.getElementById('workout-display-area').innerHTML = '';
}

// ===== CLEAR =====
function clearLogs() {
    if (confirm('Svuotare tutto il diario? I record NON verranno cancellati. Usa il tasto 🗑 sulle singole sessioni per eliminarle una alla volta.')) {
        setStore('gymSessionLogs', []);
        renderStats();
        populateStatsExSelect();
        renderProgressChart();
        showToast('🗑 Diario svuotato');
    }
}
function clearAll() {
    if (confirm('Cancellare tutto? Questa operazione è irreversibile.')) {
        localStorage.clear(); location.reload();
    }
}
// ===== ARCHIVIO ESERCIZI =====
let _archiveData = null; // cache caricata una volta sola

async function loadArchive() {
    if (_archiveData) return _archiveData;
    try {
        const res = await fetch('esercizi.json');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        _archiveData = await res.json();
    } catch (e) {
        console.warn('esercizi.json non disponibile:', e.message);
        _archiveData = null; // null = non riuscito, riprova al prossimo accesso
        return [];
    }
    return _archiveData;
}

async function initArchive() {
    const container = document.getElementById('archiveGroups');
    if (!container) return;

    // Mostra loading solo se il container è vuoto (primo accesso)
    if (container.children.length === 0) {
        container.innerHTML = '<p class="archive-loading">Caricamento...</p>';
    }

    const data = await loadArchive();

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="archive-empty">Nessun esercizio nell\'archivio.</p>';
        return;
    }

    // Reset campo di ricerca ad ogni apertura della tab
    const searchInput = document.getElementById('archiveSearch');
    if (searchInput) searchInput.value = '';

    renderArchive(data, '');
}

function renderArchive(data, query) {
    const container = document.getElementById('archiveGroups');
    if (!container) return;

    const q = query.trim().toLowerCase();
    const filtered = q
        ? data.filter(e =>
            e.name.toLowerCase().includes(q) ||
            (e.group && e.group.toLowerCase().includes(q))
          )
        : data;

    if (filtered.length === 0) {
        container.innerHTML = '<p class="archive-empty">Nessun esercizio trovato.</p>';
        return;
    }

    // Raggruppa per gruppo muscolare
    const groups = {};
    filtered.forEach(ex => {
        const g = ex.group || 'Altro';
        if (!groups[g]) groups[g] = [];
        groups[g].push(ex);
    });

    let html = '';
    Object.keys(groups).sort().forEach(group => {
        html += `<div class="archive-group">
            <h4 class="archive-group-title">${group}</h4>
            <div class="archive-list">`;
        groups[group].forEach(ex => {
            // Uso data-name per evitare problemi di quoting nell'onclick inline
            html += `<button class="archive-item" data-exname="${escAttr(ex.name)}">
                <span class="archive-item-name">${ex.name}</span>
                <span class="archive-item-arrow">›</span>
            </button>`;
        });
        html += `</div></div>`;
    });

    container.innerHTML = html;

    // Event delegation: un solo listener sul container invece di uno per ogni bottone
    container.querySelectorAll('.archive-item').forEach(btn => {
        btn.addEventListener('click', () => openInfoModal(btn.dataset.exname));
    });
}

async function filterArchive() {
    const q = document.getElementById('archiveSearch').value;
    const data = await loadArchive();
    renderArchive(data, q);
}

// ===== MODAL INFO ESERCIZIO =====
async function openInfoModal(exName) {
    const data = await loadArchive();
    if (!data || data.length === 0) return;
    const nameLower = exName.toLowerCase().trim();
    const ex = data.find(e => e.name === exName)
             || data.find(e => e.name.toLowerCase() === nameLower);
    if (!ex) {
        showToast('Esercizio non presente nell\'archivio', 'info');
        return;
    }

    document.getElementById('info-modal-title').textContent = ex.name;
    document.getElementById('info-modal-group').textContent = ex.group || '';
    document.getElementById('info-modal-desc').textContent = ex.description || '';
    document.getElementById('info-modal-bio').textContent = ex.biomechanics || '';
    document.getElementById('info-modal-tips').textContent = ex.tips || '';

    // GIF: mostra il wrap, poi assegna src
    // onerror nel tag img nasconderà il wrap se la gif non carica
    const gifWrap = document.getElementById('info-modal-gif-wrap');
    const gifImg  = document.getElementById('info-modal-gif');
    if (ex.gif) {
        gifWrap.classList.remove('hidden');
        gifImg.src = ex.gif;
    } else {
        gifWrap.classList.add('hidden');
        gifImg.src = '';
    }

    document.getElementById('info-modal').classList.remove('hidden');
}

function closeInfoModal() {
    document.getElementById('info-modal').classList.add('hidden');
    // Reset gif per evitare flickering alla prossima apertura
    const gifImg = document.getElementById('info-modal-gif');
    const gifWrap = document.getElementById('info-modal-gif-wrap');
    gifImg.src = '';
    gifWrap.classList.remove('hidden');
}

// Cerca nell'archivio un esercizio per nome (match parziale, case-insensitive)
// Usata dalla card allenamento per il bottone ℹ️
async function openInfoModalByName(rawName) {
    const data = await loadArchive();
    if (!data || data.length === 0) return;
    const name = rawName.toLowerCase().trim();
    const ex = data.find(e => e.name.toLowerCase() === name)
             || data.find(e => e.name.toLowerCase().includes(name))
             || data.find(e => name.includes(e.name.toLowerCase()));
    if (!ex) {
        showToast('Esercizio non presente nell\'archivio', 'info');
        return;
    }
    openInfoModal(ex.name);
}

// ===== SETUP: SOTTO-NAVIGAZIONE =====
function switchSetupTab(tab) {
    ['edit','create','io'].forEach(t => {
        document.getElementById(`setup-tab-${t}`).classList.toggle('hidden', t !== tab);
        document.getElementById(`subtab-${t}`).classList.toggle('active', t === tab);
    });
    if (tab === 'io') refreshIOSelects();
}

function refreshIOSelects() {
    const progs = getStore('gymProgs');
    const names = Object.keys(progs);
    ['exportSingleSelect','deleteProgSelect'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const placeholder = id === 'exportSingleSelect' ? '-- Seleziona scheda --' : '-- Seleziona scheda --';
        el.innerHTML = `<option value="">${placeholder}</option>` +
            names.map(n => `<option value="${escAttr(n)}">${escHtml(n)}</option>`).join('');
    });
}

// ===== EXPORT / IMPORT SINGOLA SCHEDA =====
function exportSingleProg() {
    const name = (document.getElementById('exportSingleSelect') || {}).value;
    if (!name) return showToast('Seleziona una scheda da esportare', 'error');
    const progs = getStore('gymProgs');
    if (!progs[name]) return showToast('Scheda non trovata', 'error');
    const payload = { gymSingleProg: { [name]: progs[name] }, exportDate: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `scheda_${name.replace(/\s+/g,'_')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast(`✅ Scheda "${name}" esportata`);
}

function importSingleProg(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            const incoming = data.gymSingleProg || data.gymProgs;
            if (!incoming || typeof incoming !== 'object') return alert('File non valido!');
            const progs = getStore('gymProgs');
            let imported = 0, skipped = 0;
            Object.entries(incoming).forEach(([name, days]) => {
                if (progs[name] && !confirm(`La scheda "${name}" esiste già. Sovrascrivere?`)) { skipped++; return; }
                progs[name] = days; imported++;
            });
            setStore('gymProgs', progs);
            refreshDropdowns(); refreshIOSelects();
            showToast(`✅ ${imported} scheda/e importata/e${skipped ? `, ${skipped} saltata/e` : ''}`);
        } catch (err) { alert('Errore nel file: ' + err.message); }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ===== ELIMINA SCHEDA =====
function deleteProg() {
    const name = (document.getElementById('deleteProgSelect') || {}).value;
    if (!name) return showToast('Seleziona una scheda da eliminare', 'error');
    if (!confirm(`Eliminare la scheda "${name}"? Operazione irreversibile.`)) return;
    const progs = getStore('gymProgs');
    delete progs[name];
    setStore('gymProgs', progs);
    refreshDropdowns(); refreshIOSelects();
    showToast(`🗑 Scheda "${name}" eliminata`);
}

// ===== AUTOCOMPLETE NOME ESERCIZIO =====
function onExNameInput(input, suggestionsId) {
    const q = input.value.trim().toLowerCase();
    const list = document.getElementById(suggestionsId);
    if (!list) return;
    if (!q || q.length < 2) { list.classList.add('hidden'); return; }
    if (!_archiveData) { loadArchive().then(() => onExNameInput(input, suggestionsId)); return; }
    const matches = _archiveData.filter(e => e.name.toLowerCase().includes(q)).slice(0, 8);
    if (!matches.length) { list.classList.add('hidden'); return; }
    list.innerHTML = matches.map(e =>
        `<div class="autocomplete-item" data-name="${escAttr(e.name)}">${escHtml(e.name)}<small class="autocomplete-group">${escHtml(e.group||'')}</small></div>`
    ).join('');
    list.classList.remove('hidden');
    list.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('mousedown', ev => {
            ev.preventDefault();
            input.value = item.dataset.name;
            list.classList.add('hidden');
        });
    });
    input.onblur = () => setTimeout(() => list.classList.add('hidden'), 150);
}

// ===== CREAZIONE NUOVA SCHEDA =====
let _createData = null;

function startCreateProg() {
    const name   = document.getElementById('createProgName').value.trim();
    const nDays  = parseInt(document.getElementById('createProgDays').value) || 0;
    const nWeeks = parseInt(document.getElementById('createProgWeeks').value) || 8;
    if (!name) return showToast('Inserisci il nome della scheda', 'error');
    if (nDays < 1 || nDays > 7) return showToast('Inserisci un numero di giornate tra 1 e 7', 'error');
    if (getStore('gymProgs')[name]) return showToast(`La scheda "${name}" esiste già`, 'error');
    _createData = { name, weeks: nWeeks, days: {} };
    for (let i = 1; i <= nDays; i++) _createData.days[`Giorno ${i}`] = [];
    document.getElementById('create-step-1').classList.add('hidden');
    document.getElementById('create-step-2').classList.remove('hidden');
    document.getElementById('create-prog-title').textContent = `📋 ${name}`;
    renderCreateDays();
}

function cancelCreateProg() {
    _createData = null;
    document.getElementById('create-step-2').classList.add('hidden');
    document.getElementById('create-step-1').classList.remove('hidden');
    document.getElementById('createProgName').value = '';
    document.getElementById('createProgDays').value = '';
    document.getElementById('createProgWeeks').value = '';
}

function renderCreateDays() {
    const container = document.getElementById('create-days-container');
    if (!container || !_createData) return;
    container.innerHTML = '';
    Object.keys(_createData.days).forEach((dayName, di) => {
        const safeName = escAttr(dayName);
        const dayEl = document.createElement('div');
        dayEl.className = 'create-day-block';
        // Primo giorno aperto, gli altri chiusi
        const bodyClass = di === 0 ? '' : 'hidden';
        const arrowChar = di === 0 ? '▼' : '▶';
        dayEl.innerHTML = `
            <div class="create-day-header" onclick="toggleCreateDay('${safeName}')">
                <span class="create-day-name">${escHtml(dayName)}</span>
                <span class="create-day-count" id="create-count-${safeName}">0 esercizi</span>
                <span class="create-day-arrow" id="create-arrow-${safeName}">${arrowChar}</span>
            </div>
            <div class="create-day-body ${bodyClass}" id="create-body-${safeName}">
                <div class="create-ex-list" id="create-list-${safeName}"></div>
                <div class="card-editor card-editor--dark mt-10">
                    <div class="ex-autocomplete-wrap">
                        <input type="text" id="cexName-${safeName}" placeholder="Nome esercizio..."
                            autocomplete="off" oninput="onExNameInput(this,'cexSug-${safeName}')">
                        <div id="cexSug-${safeName}" class="autocomplete-list hidden"></div>
                    </div>
                    <div class="input-grid input-grid--3 mt-10">
                        <input type="number" id="cexSets-${safeName}" placeholder="Serie">
                        <input type="text"   id="cexReps-${safeName}" placeholder="Reps">
                        <input type="number" id="cexRest-${safeName}" placeholder="Rec.(s)">
                    </div>
                    <div class="row mt-10">
                        <input type="number" id="cexPerc-${safeName}" placeholder="% 1RM" class="flex-1">
                        <input type="text"   id="cexNote-${safeName}" placeholder="Note"   class="flex-2">
                    </div>
                    <div class="row mt-10">
                        <button class="btn-add flex-1"     onclick="createAddEx('${safeName}',false)">+ Singolo</button>
                        <button class="btn-special flex-1" onclick="createAddEx('${safeName}',true)">🔗 Superserie</button>
                    </div>
                </div>
            </div>`;
        container.appendChild(dayEl);
        renderCreateExList(dayName);
    });
}

function toggleCreateDay(dayName) {
    const body  = document.getElementById(`create-body-${dayName}`);
    const arrow = document.getElementById(`create-arrow-${dayName}`);
    if (!body) return;
    const open = !body.classList.contains('hidden');
    body.classList.toggle('hidden', open);
    if (arrow) arrow.textContent = open ? '▶' : '▼';
}

function renderCreateExList(dayName) {
    const safeName = escAttr(dayName);
    const list  = document.getElementById(`create-list-${safeName}`);
    const count = document.getElementById(`create-count-${safeName}`);
    if (!list || !_createData) return;
    const exercises = _createData.days[dayName] || [];
    if (count) count.textContent = `${exercises.length} esercizi`;
    if (!exercises.length) { list.innerHTML = '<p class="empty-message-sm">Nessun esercizio.</p>'; return; }
    list.innerHTML = exercises.map((ex, idx) => `
        <div class="create-ex-row${ex.linked ? ' create-ex-linked' : ''}">
            <div class="create-ex-info">
                ${ex.linked ? '<span class="create-linked-badge">🔗</span>' : ''}
                <span class="create-ex-name">${escHtml(ex.name)}</span>
                <span class="create-ex-meta">${ex.sets}×${ex.reps} · ${ex.rest}s${ex.perc>0?` · ${ex.perc}%`:''}${ex.note?' · '+escHtml(ex.note):''}</span>
            </div>
            <button class="editor-btn-remove" onclick="createRemoveEx('${escAttr(dayName)}',${idx})">✖</button>
        </div>`).join('');
}

function createAddEx(dayName, isLinked) {
    const s = n => (document.getElementById(`${n}-${dayName}`) || {}).value || '';
    const name = s('cexName').trim();
    const sets = s('cexSets').trim();
    const reps = s('cexReps').trim();
    const rest = parseInt(s('cexRest')) || 90;
    const perc = parseInt(s('cexPerc')) || 0;
    const note = s('cexNote').trim();
    if (!name) return showToast('Inserisci il nome dell\'esercizio', 'error');
    if (!sets || !reps) return showToast('Inserisci serie e ripetizioni', 'error');
    _createData.days[dayName].push({ name, sets, reps, rest, perc, note, linked: isLinked });
    ['cexName','cexSets','cexReps','cexRest','cexPerc','cexNote'].forEach(f => {
        const el = document.getElementById(`${f}-${dayName}`); if (el) el.value = '';
    });
    renderCreateExList(dayName);
}

function createRemoveEx(dayName, idx) {
    if (!_createData) return;
    _createData.days[dayName].splice(idx, 1);
    renderCreateExList(dayName);
}

function saveCreatedProg() {
    if (!_createData) return;
    const name = _createData.name;
    const progs = getStore('gymProgs');
    if (progs[name] && !confirm(`La scheda "${name}" esiste già. Sovrascrivere?`)) return;
    const newProg = { _duration: _createData.weeks };
    Object.entries(_createData.days).forEach(([day, exercises]) => { newProg[day] = exercises; });
    progs[name] = newProg;
    setStore('gymProgs', progs);
    refreshDropdowns();
    cancelCreateProg();
    showToast(`✅ Scheda "${name}" salvata!`);
    switchSetupTab('edit');
    const sel = document.getElementById('editProgSelect');
    if (sel) { sel.value = name; syncEditorProg(); }
}
