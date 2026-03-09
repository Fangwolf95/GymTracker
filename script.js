var countdown;
var activeProg = null;
var currentRest = 90;
var sessionCounters = {};

// --- Chiave usata per salvare la sessione in corso ---
function sessionKey() {
    const p = document.getElementById("selectProg").value;
    const d = document.getElementById("selectDay").value;
    return `gymSession_${p}_${d}`;
}

// Salva lo stato completo della sessione in corso
function saveSessionState() {
    const key = sessionKey();
    const p = document.getElementById("selectProg").value;
    const d = document.getElementById("selectDay").value;
    if (!p || !d) return;

    const exercises = JSON.parse(localStorage.getItem("gymProgs"))[p][d];
    let state = { counters: {}, weights: {} };

    exercises.forEach((ex, idx) => {
        state.counters[idx] = sessionCounters[idx] || 0;
        const el = document.getElementById(`w_${idx}`);
        state.weights[idx] = el ? el.value : "";
    });

    localStorage.setItem(key, JSON.stringify(state));
}

// Carica lo stato salvato della sessione
function loadSessionState() {
    const key = sessionKey();
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
}

// Cancella lo stato della sessione dopo il salvataggio
function clearSessionState() {
    const key = sessionKey();
    localStorage.removeItem(key);
}

window.onload = function() {
    if(!localStorage.getItem("gymMaxes")) localStorage.setItem("gymMaxes", "{}");
    if(!localStorage.getItem("gymProgs")) localStorage.setItem("gymProgs", "{}");
    if(!localStorage.getItem("gymSessionLogs")) localStorage.setItem("gymSessionLogs", "[]");
    if(!localStorage.getItem("gymDrafts")) localStorage.setItem("gymDrafts", "{}");
    refreshDropdowns();
    renderStats();
};

function switchMode(m) {
    ['setup','training','stats'].forEach(s => document.getElementById(s+'-section').style.display = (m===s?'block':'none'));
    if(m === 'stats') renderStats();
    refreshDropdowns();
}

function refreshDropdowns() {
    const s = JSON.parse(localStorage.getItem("gymProgs"));
    const selTraining = document.getElementById("selectProg");
    const selEdit = document.getElementById("editProgSelect");
    let opts = '<option value="">-- Seleziona Programma --</option>';
    for(let p in s) opts += `<option value="${p}">${p}</option>`;
    selTraining.innerHTML = opts;
    selEdit.innerHTML = opts;
}

function syncEditorProg() {
    const selected = document.getElementById("editProgSelect").value;
    const controls = document.getElementById("editor-controls");
    const newArea = document.getElementById("new-prog-area");
    if(!selected) {
        activeProg = null; controls.style.display = "none"; newArea.style.display = "block";
        return;
    }
    const progs = JSON.parse(localStorage.getItem("gymProgs"));
    activeProg = selected;
    newArea.style.display = "none";
    controls.style.display = "block";
    document.getElementById("editing-title").innerText = "Editando: " + selected;
    const daySel = document.getElementById("editDaySelect");
    let dayOpts = '<option value="">-- Seleziona Giorno --</option>';
    for(let d in progs[selected]) if(d !== "_duration") dayOpts += `<option value="${d}">${d}</option>`;
    daySel.innerHTML = dayOpts;
    refreshEditorTable();
}

function refreshEditorTable() {
    const selDay = document.getElementById("editDaySelect").value;
    const inputDay = document.getElementById("dayName").value.trim();
    const day = selDay || inputDay;
    const container = document.getElementById("preview-table");
    let progs = JSON.parse(localStorage.getItem("gymProgs"));
    if(!day || !progs[activeProg] || !progs[activeProg][day]) {
        container.innerHTML = "<p style='color:#666; font-size:12px;'>Nessun esercizio salvato.</p>"; return;
    }
    let html = "<table style='width:100%; font-size:13px; border-collapse:collapse;'>";
    progs[activeProg][day].forEach((ex, idx) => {
        html += `<tr style='border-bottom:1px solid #222'>
            <td style='padding:10px;'>${ex.linked?'🔗':''} <b>${ex.name}</b><br><small>${ex.sets}x${ex.reps} - ${ex.rest}s</small></td>
            <td style='text-align:right;'><button onclick="removeEx('${day}', ${idx})" style='background:none; border:none; color:var(--danger); font-size:1.2rem;'>✖</button></td>
        </tr>`;
    });
    container.innerHTML = html + "</table>";
}

function removeEx(day, idx) {
    if(!confirm("Eliminare?")) return;
    let progs = JSON.parse(localStorage.getItem("gymProgs"));
    progs[activeProg][day].splice(idx, 1);
    localStorage.setItem("gymProgs", JSON.stringify(progs));
    refreshEditorTable();
}

function clearExInputs() {
    ['exName','exPerc','exSets','exReps','exRest','exNote'].forEach(id => document.getElementById(id).value = "");
}

function processBulkImport() {
    const text = document.getElementById("bulk-import-area").value.trim();
    const progName = document.getElementById("progName").value.trim() || activeProg;
    if(!progName || !text) return alert("Inserisci Nome Programma!");
    let progs = JSON.parse(localStorage.getItem("gymProgs"));
    if(!progs[progName]) progs[progName] = { _duration: parseInt(document.getElementById("progWeeks").value) || 8 };
    let currentDay = "";
    text.split("\n").forEach(line => {
        line = line.trim(); if(!line) return;
        if(line.startsWith("#")) {
            currentDay = line.replace("#", "").trim(); progs[progName][currentDay] = [];
        } else if(currentDay) {
            let linked = line.startsWith("*"); if(linked) line = line.replace("*", "").trim();
            const p = line.split(";");
            if(p.length >= 4) {
                progs[progName][currentDay].push({
                    name: p[0].trim(), perc: parseInt(p[1]) || 0,
                    sets: p[2].trim(), reps: p[3].trim(),
                    rest: parseInt(p[4]) || 90, note: p[5] ? p[5].trim() : "", linked: linked
                });
            }
        }
    });
    localStorage.setItem("gymProgs", JSON.stringify(progs)); location.reload();
}

function updateDaySelect() {
    const p = document.getElementById("selectProg").value;
    const sel = document.getElementById("selectDay");
    sel.innerHTML = '<option value="">Giorno...</option>';
    if(!p) return;
    const progs = JSON.parse(localStorage.getItem("gymProgs"));
    for(let d in progs[p]) if(d !== "_duration") sel.innerHTML += `<option value="${d}">${d}</option>`;
}

function loadWorkoutDisplay() {
    const p = document.getElementById("selectProg").value, d = document.getElementById("selectDay").value;
    const area = document.getElementById("workout-display-area");
    if(!p || !d) return;
    const exercises = JSON.parse(localStorage.getItem("gymProgs"))[p][d];
    const maxes = JSON.parse(localStorage.getItem("gymMaxes"));
    const logs = JSON.parse(localStorage.getItem("gymSessionLogs"));

    // Carica stato sessione salvato (ha priorità sui drafts)
    const savedState = loadSessionState();

    area.innerHTML = "";
    sessionCounters = {};

    exercises.forEach((ex, idx) => {
        // Ripristina contatore serie dal salvataggio, altrimenti 0
        sessionCounters[idx] = savedState ? (savedState.counters[idx] || 0) : 0;

        const target = ex.perc > 0 ? Math.round(((maxes[ex.name.toLowerCase().trim()] || 0) * ex.perc) / 100) : 0;
        let last = "--";
        for (let i = logs.length - 1; i >= 0; i--) {
            const entry = logs[i].details.split(", ").find(s => s.startsWith(ex.name + ":"));
            if (entry) { last = entry.split(": ")[1]; break; }
        }

        // Ripristina peso: prima dal sessionState, poi dai drafts
        let restoredWeight = "";
        if (savedState && savedState.weights[idx] !== undefined) {
            restoredWeight = savedState.weights[idx];
        } else {
            const drafts = JSON.parse(localStorage.getItem("gymDrafts"))[`${p}_${d}`] || {};
            restoredWeight = drafts[idx] || "";
        }

        const serieFatte = sessionCounters[idx];
        const totalSets = parseInt(ex.sets) || 0;
        const isDone = serieFatte >= totalSets && totalSets > 0;

        const cardHtml = `<div class="exercise-card" id="card-${idx}" style="${isDone ? 'opacity:0.5; border-color:#555;' : ''}">
                <div class="ex-header">
                    <strong>${ex.name.toUpperCase()}</strong>
                    <span id="sets-count-${idx}" style="color:var(--main); font-weight:bold; font-size:0.9rem;">Serie: ${serieFatte} / ${totalSets}</span>
                </div>
                <div class="ex-header" style="margin-top:5px;">
                    <span class="ex-info">${ex.sets}x${ex.reps} @ ${ex.perc}% (⏱${ex.rest}s)</span>
                    <span class="ex-target">${target>0?target+'kg':'--'}</span>
                </div>
                <div class="ex-last">Ultima volta: ${last}</div>
                <div class="row" style="margin-top:10px;">
                    <input type="number" id="w_${idx}" placeholder="Kg" value="${restoredWeight}" oninput="saveDraft(${idx})">
                    <button class="btn-ok" onclick="confirmSet('${ex.name}', ${ex.perc}, ${idx}, ${ex.rest}, ${ex.sets})">OK</button>
                </div>
            </div>`;

        if (ex.linked && area.lastElementChild) {
            if (!area.lastElementChild.classList.contains("superset-container")) {
                const prev = area.lastElementChild;
                const wrap = document.createElement('div'); wrap.className = 'superset-container';
                wrap.innerHTML = `<span class="superset-label">SUPERSERIE 🔗</span>`;
                prev.parentNode.insertBefore(wrap, prev); wrap.appendChild(prev); wrap.innerHTML += cardHtml;
            } else area.lastElementChild.innerHTML += cardHtml;
        } else area.innerHTML += cardHtml;
    });

    // Se c'era una sessione salvata, mostra banner di ripristino
    if (savedState) {
        const banner = document.createElement('div');
        banner.style = "background:#1a3a1a; border:1px solid var(--accent); border-radius:10px; padding:10px; margin-bottom:15px; font-size:0.85rem; color:var(--accent); text-align:center;";
        banner.innerHTML = "✅ Sessione ripristinata automaticamente";
        area.insertBefore(banner, area.firstChild);
        setTimeout(() => banner.remove(), 3000);
    }

    document.getElementById("timer-area").style.display = "block";
    document.getElementById("save-session-btn").style.display = "block";
}

function confirmSet(name, perc, idx, rest, totalSets) {
    const val = document.getElementById(`w_${idx}`).value;
    const w = parseFloat(val);

    sessionCounters[idx]++;
    document.getElementById(`sets-count-${idx}`).innerText = `Serie: ${sessionCounters[idx]} / ${totalSets}`;

    const card = document.getElementById(`card-${idx}`);
    card.style.borderColor = "var(--accent)";

    if (sessionCounters[idx] >= totalSets) {
        card.style.opacity = "0.5";
        card.style.borderColor = "#555";
        const nextCard = document.getElementById(`card-${idx + 1}`);
        if (nextCard) {
            setTimeout(() => {
                nextCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 600);
        }
    } else {
        setTimeout(() => card.style.borderColor = "var(--main)", 500);
    }

    // Salva subito lo stato dopo ogni serie confermata
    saveSessionState();

    if(w && perc > 0) {
        let maxes = JSON.parse(localStorage.getItem("gymMaxes"));
        let calc = Math.round((w / perc) * 100);
        if(calc > (maxes[name.toLowerCase().trim()] || 0)) {
            if(confirm("Nuovo Record Stimato ("+calc+"kg)! Aggiorno?")) {
                maxes[name.toLowerCase().trim()] = calc;
                localStorage.setItem("gymMaxes", JSON.stringify(maxes));
            }
        }
    }
    currentRest = rest;
    document.getElementById("btn-auto-timer").innerText = "Recupero ("+rest+"s)";
    startTimer(rest);
}

function finishWorkout() {
    const p = document.getElementById("selectProg").value, d = document.getElementById("selectDay").value;
    const exercises = JSON.parse(localStorage.getItem("gymProgs"))[p][d];
    let res = [], vol = 0;
    exercises.forEach((ex, idx) => {
        const w = parseFloat(document.getElementById(`w_${idx}`).value) || 0;
        res.push(ex.name + ": " + w + "kg");
        vol += (w * (parseInt(ex.sets) || 0) * (parseInt(ex.reps) || 0));
    });
    let logs = JSON.parse(localStorage.getItem("gymSessionLogs"));
    logs.push({ date: new Date().toISOString(), dateStr: new Date().toLocaleDateString('it-IT'), day: d, details: res.join(", "), volume: vol });
    localStorage.setItem("gymSessionLogs", JSON.stringify(logs));

    // Pulisce sia i drafts che lo stato sessione
    let drafts = JSON.parse(localStorage.getItem("gymDrafts")); delete drafts[`${p}_${d}`];
    localStorage.setItem("gymDrafts", JSON.stringify(drafts));
    clearSessionState();

    alert("Salvato! Vol: " + vol + "kg"); switchMode('stats');
}

function renderStats() {
    const maxes = JSON.parse(localStorage.getItem("gymMaxes")), logs = JSON.parse(localStorage.getItem("gymSessionLogs"));
    const container = document.getElementById("stats-container");
    const oneWeekAgo = new Date(); oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const weeklyVol = logs.reduce((acc, l) => new Date(l.date) > oneWeekAgo ? acc + (l.volume || 0) : acc, 0);
    let html = `<div class="mini-list" style="border-left:5px solid var(--main); padding-left:15px;">
                <small style="color:#888">VOLUME ULTIMI 7gg</small><div style="font-size:1.4rem; font-weight:bold; color:var(--accent)">${weeklyVol} kg</div></div>
                <h4>Record:</h4><div class="mini-list">`;
    Object.entries(maxes).forEach(([ex, w]) => html += `<div>${ex.toUpperCase()}: <b>${w}kg</b></div>`);
    html += "</div><h4>Diario:</h4>";
    logs.slice(-8).reverse().forEach(l => html += `<div class='stat-item'><strong>${l.dateStr}</strong> - ${l.day}<br><small>Vol: ${l.volume}kg | ${l.details}</small></div>`);
    container.innerHTML = html;
}

function initEditor() {
    const name = document.getElementById("progName").value.trim();
    if(!name) return alert("Nome!");
    let progs = JSON.parse(localStorage.getItem("gymProgs"));
    if(!progs[name]) progs[name] = { _duration: parseInt(document.getElementById("progWeeks").value) || 8 };
    localStorage.setItem("gymProgs", JSON.stringify(progs));
    refreshDropdowns(); document.getElementById("editProgSelect").value = name; syncEditorProg();
}

function addEx(isLinked) {
    const selDay = document.getElementById("editDaySelect").value;
    const inputDay = document.getElementById("dayName").value.trim();
    const day = selDay || inputDay;
    const name = document.getElementById("exName").value.trim();
    if(!day || !name) return alert("Mancano dati!");
    let progs = JSON.parse(localStorage.getItem("gymProgs"));
    if(!progs[activeProg][day]) progs[activeProg][day] = [];
    progs[activeProg][day].push({
        name, sets: document.getElementById("exSets").value, reps: document.getElementById("exReps").value,
        perc: parseInt(document.getElementById("exPerc").value) || 0,
        rest: parseInt(document.getElementById("exRest").value) || 90,
        note: document.getElementById("exNote").value, linked: isLinked
    });
    localStorage.setItem("gymProgs", JSON.stringify(progs)); clearExInputs();
    if(!selDay) syncEditorProg(); else refreshEditorTable();
}

function startTimer(s) {
    clearInterval(countdown); let t = s;
    countdown = setInterval(() => {
        t--; document.getElementById("display-timer").innerText = Math.floor(t/60)+":"+(t%60<10?"0"+t%60:t%60);
        if(t<=0) { clearInterval(countdown); document.getElementById("beep-sound").play(); stopTimer(); alert("Tempo scaduto!"); }
    }, 1000);
}
function stopTimer() { clearInterval(countdown); document.getElementById("display-timer").innerText = "00:00"; }

function saveDraft(idx) {
    const p = document.getElementById("selectProg").value, d = document.getElementById("selectDay").value;
    let drafts = JSON.parse(localStorage.getItem("gymDrafts"));
    if (!drafts[`${p}_${d}`]) drafts[`${p}_${d}`] = {};
    drafts[`${p}_${d}`][idx] = document.getElementById(`w_${idx}`).value;
    localStorage.setItem("gymDrafts", JSON.stringify(drafts));
    // Salva anche nello stato sessione
    saveSessionState();
}

function clearLogs() { if(confirm("Svuotare?")) { localStorage.removeItem("gymMaxes"); localStorage.removeItem("gymSessionLogs"); location.reload(); } }
function clearAll() { if(confirm("Cancellare tutto?")) { localStorage.clear(); location.reload(); } }
