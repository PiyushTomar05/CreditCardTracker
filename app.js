/**
 * ==========================================================================
 * CREDIT CARD PETROL CASH-OUT TRACKER - LUXURY INTERACTIVE ENGINE
 * ==========================================================================
 * Author: Antigravity
 * Features: 3D Card Toggles, Fills, Offline Storage, CSV Import/Export
 * ==========================================================================
 */

// Application State
let state = {
    cards: {
        axis: { name: 'Axis Bank', limit: 245000, spent: 0 },
        icici: { name: 'ICICI Bank', limit: 380000, spent: 0 },
        hdfc: { name: 'HDFC Bank', limit: 175000, spent: 0 },
        sbi: { name: 'SBI Card', limit: 377000, spent: 0 }
    },
    debits: [],
    receipts: [],
    activeCardFilter: null, // Toggled by clicking 3D Cards
    syncMode: 'loading',
    securePin: ''
};

// LocalStorage Keys
const STORAGE_KEY = 'fuel_flow_independent_state';
const CUSTOM_SYNC_KEY = 'fuel_flow_custom_sync_url';

let API_URL = '';
function updateApiUrl() {
    const customSyncIp = localStorage.getItem(CUSTOM_SYNC_KEY);
    if (customSyncIp) {
        API_URL = `http://${customSyncIp.trim()}:3000/api/data`;
    } else {
        const isLocalOrigin = window.location.protocol === 'http:' || window.location.protocol === 'https:';
        API_URL = isLocalOrigin 
            ? '/api/data' 
            : 'http://localhost:3000/api/data';
    }
}
updateApiUrl();

let isLoaded = false;

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
    try {
        initSyncInfoModalBindings(); // Activate popup event bindings
        await initStorageAndState(); // Dynamic persistent handshake
        initDateDisplay();
        renderAll();
        isLoaded = true; // Securely lock state after first render completes!
        updateDiagnostics("DB Connected");
        initSecurityLock(); // Check and enforce security lock!
    } catch (err) {
        console.error("Bootup crash:", err);
        updateDiagnostics(`Error: ${err.message || err}`);
    }
});

// Format Currency Utility (Indian Rupee style)
function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0 // Compact view for card faces
    }).format(amount);
}

function formatINRFull(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2
    }).format(amount);
}

// Format Date Utility
function formatDateStr(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

// Display Date in Header & Footer
function initDateDisplay() {
    const today = new Date();
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStrEl = document.getElementById('current-date-str');
    if (dateStrEl) {
        dateStrEl.textContent = today.toLocaleDateString('en-IN', dateOptions);
    }
    const calendarDateEl = document.getElementById('current-calendar-date');
    if (calendarDateEl) {
        calendarDateEl.textContent = today.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }
}

// Asynchronous Handshake & Sync Engine
async function initStorageAndState() {
    try {
        updateSyncBadge('loading', 'Loading Sync...');
        
        // 1.2 second timeout abort controller
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);
        
        const response = await fetch(API_URL, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
            const serverData = await response.json();
            if (serverData && typeof serverData === 'object' && Object.keys(serverData).length > 0) {
                loadStateFromData(serverData);
                state.syncMode = 'server';
                updateSyncBadge('active', 'Server Sync Active');
                console.log("Connected to persistent local storage sync server.");
                return;
            } else {
                console.log("Sync server empty. Performing initial migration from LocalStorage...");
                loadStateFromLocalStorage();
                state.syncMode = 'server';
                updateSyncBadge('active', 'Server Sync Active');
                await saveStateToSyncServer();
                return;
            }
        } else {
            throw new Error(`Server responded with status ${response.status}`);
        }
    } catch (err) {
        console.warn("Sync server offline (normal in static deployment). Falling back to browser storage:", err);
        loadStateFromLocalStorage();
        state.syncMode = 'browser';
        updateSyncBadge('fallback', 'Browser Memory Only');
    }
}

async function saveStateToSyncServer() {
    if (state.syncMode !== 'server') return;
    try {
        const payload = {
            cards: state.cards,
            debits: state.debits,
            receipts: state.receipts,
            securePin: state.securePin || localStorage.getItem('fuel_flow_secure_pin') || ''
        };
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (response.ok) {
            console.log("Physically backed up state to sync server.");
            updateDiagnostics("Saved Database (Synced)");
        } else {
            console.error("Sync server write failed:", response.status);
            updateDiagnostics("Server Write Error");
        }
    } catch (err) {
        console.error("Failed to connect to sync server for saving:", err);
        updateSyncBadge('fallback', 'Sync Server Lost');
        state.syncMode = 'browser';
        updateDiagnostics("Sync Server Offline");
    }
}

function loadStateFromData(parsed) {
    if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.debits)) {
            state.debits = parsed.debits.filter(d => d && d.id && typeof d.id === 'string' && !d.id.includes('demo'));
        }
        if (Array.isArray(parsed.receipts)) {
            state.receipts = parsed.receipts.filter(r => r && r.id && typeof r.id === 'string' && !r.id.includes('demo'));
        }
        if (parsed.cards && typeof parsed.cards === 'object' && !Array.isArray(parsed.cards)) {
            state.cards = parsed.cards;
        }
        if (parsed.securePin) {
            state.securePin = parsed.securePin;
            localStorage.setItem('fuel_flow_secure_pin', parsed.securePin);
        }
    }
    
    // Force strict card limit settings safely
    const defaultCards = {
        axis: { name: 'Axis Bank', limit: 245000, spent: 0 },
        icici: { name: 'ICICI Bank', limit: 380000, spent: 0 },
        hdfc: { name: 'HDFC Bank', limit: 175000, spent: 0 },
        sbi: { name: 'SBI Card', limit: 377000, spent: 0 }
    };
    
    if (!state.cards || typeof state.cards !== 'object' || Array.isArray(state.cards)) {
        state.cards = defaultCards;
    } else {
        Object.keys(defaultCards).forEach(key => {
            if (!state.cards[key] || typeof state.cards[key] !== 'object') {
                state.cards[key] = defaultCards[key];
            } else {
                state.cards[key].limit = defaultCards[key].limit;
            }
        });
    }
}

// Load State from LocalStorage
function loadStateFromLocalStorage() {
    const localData = localStorage.getItem(STORAGE_KEY);
    if (localData) {
        try {
            const parsed = JSON.parse(localData);
            loadStateFromData(parsed);
        } catch (e) {
            console.error("Failed to parse storage, loading clean slate.", e);
        }
    } else {
        // Safe migration from older single-table ledger formats
        try {
            const oldState = localStorage.getItem('fuel_flow_simplified_state') || localStorage.getItem('fuel_flow_ledger_state');
            if (oldState) {
                const parsed = JSON.parse(oldState);
                if (parsed && typeof parsed === 'object') {
                    const oldTransactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];
                    
                    oldTransactions.forEach((t, i) => {
                        if (t && t.debited && t.received) {
                            const dateStr = t.date || new Date().toISOString().split('T')[0];
                            if (t.id && (typeof t.id !== 'string' || t.id.includes('demo') || t.id.includes('mig'))) return;

                            state.debits.push({
                                id: `mig_d_${i}_${t.id || Math.random()}`,
                                card: t.card || 'axis',
                                date: dateStr,
                                debited: parseFloat(t.debited) || 0
                            });
                            
                            state.receipts.push({
                                id: `mig_r_${i}_${t.id || Math.random()}`,
                                date: dateStr,
                                received: parseFloat(t.received) || 0,
                                method: t.method || 'cash',
                                notes: t.notes || 'Migrated from linked entry'
                            });
                        }
                    });
                    saveStateToStorage();
                }
            }
        } catch (err) {
            console.warn("Smart migration bypassed.", err);
        }
    }

    // Secondary backup sync for secure Pin variable
    const savedPin = localStorage.getItem('fuel_flow_secure_pin');
    if (savedPin) {
        state.securePin = savedPin;
    }

    // Force strict card limit settings safely
    const defaultCards = {
        axis: { name: 'Axis Bank', limit: 245000, spent: 0 },
        icici: { name: 'ICICI Bank', limit: 380000, spent: 0 },
        hdfc: { name: 'HDFC Bank', limit: 175000, spent: 0 },
        sbi: { name: 'SBI Card', limit: 377000, spent: 0 }
    };
    
    if (!state.cards || typeof state.cards !== 'object' || Array.isArray(state.cards)) {
        state.cards = defaultCards;
    } else {
        Object.keys(defaultCards).forEach(key => {
            if (!state.cards[key] || typeof state.cards[key] !== 'object') {
                state.cards[key] = defaultCards[key];
            } else {
                state.cards[key].limit = defaultCards[key].limit;
            }
        });
    }
}

// Backward-compatible alias
function loadStateFromStorage() {
    loadStateFromLocalStorage();
}

// Save State to LocalStorage
function saveStateToStorage() {
    try {
        const payload = {
            cards: state.cards,
            debits: state.debits,
            receipts: state.receipts,
            securePin: state.securePin || localStorage.getItem('fuel_flow_secure_pin') || ''
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        console.log("Database successfully synced to local storage.");
        updateDiagnostics("Saved Database");
        
        if (state.syncMode === 'server') {
            saveStateToSyncServer();
        }
    } catch (e) {
        console.error("Critical: Storage write failed!", e);
        updateDiagnostics("Write Failed!");
    }
}

// Sync UI Badge helper
function updateSyncBadge(status, text) {
    const badge = document.getElementById('syncStatusBadge');
    if (!badge) return;
    
    badge.className = `sync-status-badge ${status}`;
    const textEl = badge.querySelector('.sync-status-text');
    if (textEl) textEl.textContent = text;
}

// Sync System Information Popups
function openSyncInfoModal() {
    const modal = document.getElementById('syncInfoModal');
    if (!modal) return;
    
    const activeInfo = document.getElementById('syncServerActiveInfo');
    const browserInfo = document.getElementById('syncBrowserOnlyInfo');
    
    if (state.syncMode === 'server') {
        if (activeInfo) activeInfo.style.display = 'block';
        if (browserInfo) browserInfo.style.display = 'none';
    } else {
        if (activeInfo) activeInfo.style.display = 'none';
        if (browserInfo) browserInfo.style.display = 'block';
    }
    
    // Populate custom sync IP input
    const ipInput = document.getElementById('customSyncIp');
    if (ipInput) {
        ipInput.value = localStorage.getItem(CUSTOM_SYNC_KEY) || '';
    }
    
    modal.classList.add('active');
}

function closeSyncInfoModal() {
    const modal = document.getElementById('syncInfoModal');
    if (modal) modal.classList.remove('active');
}

function initSyncInfoModalBindings() {
    const modal = document.getElementById('syncInfoModal');
    if (!modal) return;
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeSyncInfoModal();
    });
}

// Remote Wi-Fi Sync Override Handlers
async function saveCustomSyncIp() {
    const ipInput = document.getElementById('customSyncIp');
    if (!ipInput) return;
    
    const val = ipInput.value.trim();
    if (!val) {
        alert("Please enter a valid IP address.");
        return;
    }
    
    // Quick regex validation for IPv4
    const ipPattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipPattern.test(val) && val !== 'localhost' && val !== '127.0.0.1') {
        alert("Please enter a valid IP address (e.g. 192.168.1.5).");
        return;
    }
    
    localStorage.setItem(CUSTOM_SYNC_KEY, val);
    updateApiUrl();
    closeSyncInfoModal();
    
    // Immediately trigger a sync attempt with the new endpoint!
    await initStorageAndState();
    renderAll();
    
    if (state.syncMode === 'server') {
        alert("🎉 Connected successfully! Phone is now synced to your PC's persistent ledger database.");
        // Restart secure lock to make sure PIN is updated
        initSecurityLock();
    } else {
        alert("⚠️ Connection failed. Could not reach sync server at http://" + val + ":3000. Please double check that the launcher batch window is open on your PC and you are on the same Wi-Fi network.");
    }
}

async function clearCustomSyncIp() {
    localStorage.removeItem(CUSTOM_SYNC_KEY);
    updateApiUrl();
    closeSyncInfoModal();
    
    await initStorageAndState();
    renderAll();
    initSecurityLock();
    alert("Connection override cleared. Restored standard auto-origin routing.");
}

// Live diagnostics updater
function updateDiagnostics(actionName = "Ready") {
    try {
        const localData = localStorage.getItem(STORAGE_KEY);
        const sizeKB = localData ? (localData.length / 1024).toFixed(2) : 0;
        
        const keysCountEl = document.getElementById('diag-keys-count');
        if (keysCountEl) keysCountEl.textContent = localData ? `${sizeKB} KB` : 'Empty';

        const debitsCountEl = document.getElementById('diag-debits-count');
        if (debitsCountEl) debitsCountEl.textContent = `${(state.debits || []).length} entries`;

        const receiptsCountEl = document.getElementById('diag-receipts-count');
        if (receiptsCountEl) receiptsCountEl.textContent = `${(state.receipts || []).length} entries`;

        const saveStatusEl = document.getElementById('diag-save-status');
        if (saveStatusEl) saveStatusEl.textContent = actionName;
    } catch (err) {
        console.warn("Diagnostics error:", err);
    }
}

// ==================== RENDERS & SUM CALCULATIONS ====================

function renderAll() {
    calculateSums();
    renderMetrics();
    renderDebitsTable();
    renderReceiptsTable();
    populateMonthDropdown();
    if (isLoaded) {
        saveStateToStorage();
    }
    updateDiagnostics("Rendered UI");
}

// Calculate sums dynamically
function calculateSums() {
    // Ensure data structures are clean
    if (!state.cards || typeof state.cards !== 'object' || Array.isArray(state.cards)) {
        state.cards = {
            axis: { name: 'Axis Bank', limit: 245000, spent: 0 },
            icici: { name: 'ICICI Bank', limit: 380000, spent: 0 },
            hdfc: { name: 'HDFC Bank', limit: 175000, spent: 0 },
            sbi: { name: 'SBI Card', limit: 377000, spent: 0 }
        };
    }
    if (!Array.isArray(state.debits)) state.debits = [];
    if (!Array.isArray(state.receipts)) state.receipts = [];

    // Reset cards spent
    Object.keys(state.cards).forEach(key => {
        if (state.cards[key]) {
            state.cards[key].spent = 0;
        }
    });

    state.totalDebited = 0;
    state.totalReceived = 0;
    state.cashReceived = 0;
    state.onlineReceived = 0;

    // Sum debits
    state.debits.forEach(d => {
        if (!d) return;
        const amt = parseFloat(d.debited) || 0;
        state.totalDebited += amt;
        
        if (d.card && state.cards[d.card]) {
            state.cards[d.card].spent += amt;
        }
    });

    // Sum receipts
    state.receipts.forEach(r => {
        if (!r) return;
        const amt = parseFloat(r.received) || 0;
        state.totalReceived += amt;

        if (r.method === 'online') {
            state.onlineReceived += amt;
        } else {
            state.cashReceived += amt;
        }
    });

    state.totalVariance = state.totalDebited - state.totalReceived;
}

// Render dynamic total text to screen widgets
function renderMetrics() {
    const totalDebitedEl = document.getElementById('total-debited-sum');
    if (totalDebitedEl) totalDebitedEl.textContent = formatINRFull(state.totalDebited || 0);

    const totalReceivedEl = document.getElementById('total-received-sum');
    if (totalReceivedEl) totalReceivedEl.textContent = formatINRFull(state.totalReceived || 0);
    
    const cashEl = document.getElementById('method-sum-cash');
    if (cashEl) cashEl.textContent = formatINRFull(state.cashReceived || 0);

    const onlineEl = document.getElementById('method-sum-online');
    if (onlineEl) onlineEl.textContent = formatINRFull(state.onlineReceived || 0);
    
    // Variance label with color trigger
    const varianceEl = document.getElementById('total-charges-sum');
    if (varianceEl) {
        varianceEl.textContent = formatINRFull(state.totalVariance || 0);
        if (state.totalVariance > 0) {
            varianceEl.className = 'stat-item-value text-danger';
        } else if (state.totalVariance < 0) {
            varianceEl.className = 'stat-item-value text-success';
        } else {
            varianceEl.className = 'stat-item-value';
        }
    }

    // Update embedded card faces
    if (state.cards && typeof state.cards === 'object') {
        Object.keys(state.cards).forEach(key => {
            const card = state.cards[key];
            if (!card) return;
            const spent = card.spent || 0;
            const limit = card.limit || 0;
            const available = Math.max(limit - spent, 0);
            
            // Progress fill percent
            const fillPercent = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
            
            const spentEl = document.getElementById(`cc-spent-${key}`);
            if (spentEl) spentEl.textContent = `Spent: ${formatINR(spent)}`;

            const availEl = document.getElementById(`cc-avail-${key}`);
            if (availEl) availEl.textContent = `Avail: ${formatINR(available)}`;
            
            // Update bar fill width and color dynamically
            const fillEl = document.getElementById(`cc-fill-${key}`);
            if (fillEl) {
                fillEl.style.width = `${fillPercent}%`;
                if (fillPercent > 90) {
                    fillEl.style.background = 'var(--accent-danger)';
                } else if (fillPercent > 75) {
                    fillEl.style.background = 'var(--accent-gold)';
                } else {
                    fillEl.style.background = 'var(--accent-success)';
                }
            }
        });
    }
}

// ==================== INTERACTIVE CREDIT CARD TOGGLE FILTER ====================

function toggleCardFilter(cardKey) {
    const indicator = document.getElementById('active-card-filter-indicator');
    const cardEl = document.getElementById(`card-3d-${cardKey}`);
    
    if (state.activeCardFilter === cardKey) {
        // Reset card filter
        state.activeCardFilter = null;
        if (cardEl) cardEl.classList.remove('active-card');
        if (indicator) indicator.style.display = 'none';
    } else {
        // Remove active class from all card faces first
        ['axis', 'icici', 'hdfc', 'sbi'].forEach(k => {
            const el = document.getElementById(`card-3d-${k}`);
            if (el) el.classList.remove('active-card');
        });
        
        // Activate selected card
        state.activeCardFilter = cardKey;
        if (cardEl) cardEl.classList.add('active-card');
        if (indicator) {
            indicator.style.display = 'inline';
            const cardName = state.cards && state.cards[cardKey] ? state.cards[cardKey].name : cardKey;
            indicator.textContent = `Filtered to ${cardName} \u2022 Click card again to reset`;
        }
    }
    
    renderDebitsTable();

    // Smooth scroll to the filtered debits ledger on mobile for clear interactive feedback!
    if (window.innerWidth <= 768 && state.activeCardFilter) {
        const targetEl = document.querySelector('.columns-grid');
        if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

// Render Debits Table (Left Panel) with active filters
function renderDebitsTable() {
    const tbody = document.getElementById('debits-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    let filtered = Array.isArray(state.debits) ? [...state.debits].filter(d => d && d.date && d.id) : [];
    
    // Apply interactive card filter if active
    if (state.activeCardFilter) {
        filtered = filtered.filter(d => d.card === state.activeCardFilter);
    }

    const sorted = filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (sorted.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-state">
                    <div class="empty-icon">💳</div>
                    <p>No card debits recorded.</p>
                </td>
            </tr>
        `;
        return;
    }

    sorted.forEach(d => {
        const tr = document.createElement('tr');
        const cardName = state.cards?.[d.card]?.name || d.card || '';
        tr.innerHTML = `
            <td>${formatDateStr(d.date)}</td>
            <td><span class="badge ${d.card || ''}">${cardName}</span></td>
            <td class="font-bold text-danger">${formatINRFull(d.debited || 0)}</td>
            <td>
                <div style="display:flex; justify-content:center; gap: 0.5rem;">
                    <button class="action-btn edit-btn" onclick="editDebit('${d.id}')" title="Edit Debit">
                        <svg style="width:15px; height:15px; fill:none; stroke:currentColor; stroke-width:2" viewBox="0 0 24 24">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/>
                        </svg>
                    </button>
                    <button class="action-btn" onclick="deleteDebit('${d.id}')" title="Delete Debit">
                        <svg style="width:15px; height:15px; fill:none; stroke:currentColor; stroke-width:2" viewBox="0 0 24 24">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Render Receipts Table (Right Panel)
function renderReceiptsTable() {
    const tbody = document.getElementById('receipts-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const sorted = Array.isArray(state.receipts) 
        ? [...state.receipts].filter(r => r && r.date && r.id).sort((a, b) => new Date(b.date) - new Date(a.date))
        : [];

    if (sorted.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    <div class="empty-icon">⛽</div>
                    <p>No pump receipts recorded.</p>
                </td>
            </tr>
        `;
        return;
    }

    sorted.forEach(r => {
        const methodDisplay = r.method === 'online' ? 'Online' : 'Cash';
        const methodClass = r.method === 'online' ? 'online' : 'cash';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDateStr(r.date)}</td>
            <td class="font-bold text-success">${formatINRFull(r.received || 0)}</td>
            <td><span class="badge ${methodClass}">${methodDisplay}</span></td>
            <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${r.notes || ''}">
                ${r.notes || '<span class="text-muted">-</span>'}
            </td>
            <td>
                <div style="display:flex; justify-content:center; gap: 0.5rem;">
                    <button class="action-btn edit-btn" onclick="editReceipt('${r.id}')" title="Edit Receipt">
                        <svg style="width:15px; height:15px; fill:none; stroke:currentColor; stroke-width:2" viewBox="0 0 24 24">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/>
                        </svg>
                    </button>
                    <button class="action-btn" onclick="deleteReceipt('${r.id}')" title="Delete Receipt">
                        <svg style="width:15px; height:15px; fill:none; stroke:currentColor; stroke-width:2" viewBox="0 0 24 24">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ==================== MODAL 1: CARD DEBITS ACTIONS ====================

function openDebitModal() {
    document.getElementById('debitModalTitle').textContent = "Log Credit Card Debit";
    document.getElementById('debitForm').reset();
    document.getElementById('debit-id').value = '';
    document.getElementById('debit-date').value = new Date().toISOString().split('T')[0];
    
    document.getElementById('debitModal').classList.add('active');
}

function closeDebitModal() {
    document.getElementById('debitModal').classList.remove('active');
}

function handleDebitSubmit(event) {
    event.preventDefault();
    
    const id = document.getElementById('debit-id').value;
    const date = document.getElementById('debit-date').value;
    const card = document.getElementById('debit-card').value;
    const amount = parseFloat(document.getElementById('debit-amount').value);
    
    if (id) {
        const index = state.debits.findIndex(d => d.id === id);
        if (index !== -1) {
            state.debits[index] = { id, card, date, debited: amount };
        }
    } else {
        const newId = 'd_' + Math.random().toString(36).substr(2, 9);
        state.debits.push({ id: newId, card, date, debited: amount });
    }
    
    closeDebitModal();
    saveStateToStorage();
    renderAll();
}

function editDebit(id) {
    const debit = state.debits.find(d => d.id === id);
    if (debit) {
        document.getElementById('debitModalTitle').textContent = "Edit Credit Card Debit";
        document.getElementById('debit-id').value = debit.id;
        document.getElementById('debit-date').value = debit.date;
        document.getElementById('debit-card').value = debit.card;
        document.getElementById('debit-amount').value = debit.debited;
        
        document.getElementById('debitModal').classList.add('active');
    }
}

function deleteDebit(id) {
    if (confirm("Are you sure you want to delete this debit entry?")) {
        state.debits = state.debits.filter(d => d.id !== id);
        saveStateToStorage();
        renderAll();
    }
}

// ==================== MODAL 2: PUMP PAYOUT RECEIPTS ACTIONS ====================

function openReceiptModal() {
    document.getElementById('receiptModalTitle').textContent = "Log Pump Payout Receipt";
    document.getElementById('receiptForm').reset();
    document.getElementById('receipt-id').value = '';
    document.getElementById('receipt-date').value = new Date().toISOString().split('T')[0];
    
    document.getElementById('receiptModal').classList.add('active');
}

function closeReceiptModal() {
    document.getElementById('receiptModal').classList.remove('active');
}

function handleReceiptSubmit(event) {
    event.preventDefault();
    
    const id = document.getElementById('receipt-id').value;
    const date = document.getElementById('receipt-date').value;
    const amount = parseFloat(document.getElementById('receipt-amount').value);
    const method = document.getElementById('receipt-method').value;
    const notes = document.getElementById('receipt-notes').value;
    
    if (id) {
        const index = state.receipts.findIndex(r => r.id === id);
        if (index !== -1) {
            state.receipts[index] = { id, date, received: amount, method, notes };
        }
    } else {
        const newId = 'r_' + Math.random().toString(36).substr(2, 9);
        state.receipts.push({ id: newId, date, received: amount, method, notes });
    }
    
    closeReceiptModal();
    saveStateToStorage();
    renderAll();
}

function editReceipt(id) {
    const receipt = state.receipts.find(r => r.id === id);
    if (receipt) {
        document.getElementById('receiptModalTitle').textContent = "Edit Pump Payout Receipt";
        document.getElementById('receipt-id').value = receipt.id;
        document.getElementById('receipt-date').value = receipt.date;
        document.getElementById('receipt-amount').value = receipt.received;
        document.getElementById('receipt-method').value = receipt.method || 'cash';
        document.getElementById('receipt-notes').value = receipt.notes || '';
        
        document.getElementById('receiptModal').classList.add('active');
    }
}

function deleteReceipt(id) {
    if (confirm("Are you sure you want to delete this receipt entry?")) {
        state.receipts = state.receipts.filter(r => r.id !== id);
        saveStateToStorage();
        renderAll();
    }
}

// ==================== DATA CENTER BACKUP PORTABILITY ====================

// Export dual ledger tables into a unified clean CSV with a "Type" column
function exportDataToCSV() {
    if (state.debits.length === 0 && state.receipts.length === 0) {
        alert("There is no ledger data to export!");
        return;
    }
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Type,Date,SourceOrCard,Amount,Notes\r\n";
    
    // 1. Export Debits
    state.debits.forEach(d => {
        const row = ["Debit", d.date, d.card, d.debited, ""].join(",");
        csvContent += row + "\r\n";
    });

    // 2. Export Receipts
    state.receipts.forEach(r => {
        const notesEscaped = r.notes ? `"${r.notes.replace(/"/g, '""')}"` : "";
        const row = ["Receipt", r.date, r.method, r.received, notesEscaped].join(",");
        csvContent += row + "\r\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `karan_filling_independent_ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function triggerCSVImport() {
    document.getElementById('csvFileInput').click();
}

// Parse imported CSV and restore arrays safely
function importDataFromCSV(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split(/\r\n|\n/);
        
        if (lines.length < 2) {
            alert("The uploaded file appears to be empty or malformed.");
            return;
        }
        
        const headers = lines[0].toLowerCase().split(',');
        if (!headers.includes('type') || !headers.includes('sourceorcard') || !headers.includes('amount')) {
            alert("Error: Incorrect CSV format! Ensure you are importing a Karan Filling independent ledger CSV.");
            return;
        }
        
        const importedDebits = [];
        const importedReceipts = [];
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const cols = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
            if (cols.length < 4) continue;
            
            const clean = str => str ? str.replace(/^"|"$/g, '').trim() : '';
            
            const type = clean(cols[0]).toLowerCase();
            const date = clean(cols[1]);
            const source = clean(cols[2]).toLowerCase();
            const amount = parseFloat(clean(cols[3])) || 0;
            const notes = clean(cols[4]);
            
            if (type === 'debit' && ['axis', 'icici', 'hdfc', 'sbi'].includes(source) && amount > 0) {
                importedDebits.push({
                    id: 'd_' + Math.random().toString(36).substr(2, 9),
                    card: source,
                    date,
                    debited: amount
                });
            } else if (type === 'receipt' && ['cash', 'online'].includes(source) && amount > 0) {
                importedReceipts.push({
                    id: 'r_' + Math.random().toString(36).substr(2, 9),
                    date,
                    received: amount,
                    method: source,
                    notes: notes
                });
            }
        }
        
        const totalImported = importedDebits.length + importedReceipts.length;
        if (totalImported > 0) {
            if (confirm(`Successfully read ${importedDebits.length} debits and ${importedReceipts.length} receipts from CSV. Merge with current data? (Cancel will overwrite current records completely)`)) {
                state.debits = [...state.debits, ...importedDebits];
                state.receipts = [...state.receipts, ...importedReceipts];
            } else {
                state.debits = importedDebits;
                state.receipts = importedReceipts;
            }
            
            saveStateToStorage();
            renderAll();
            alert("Ledger restore complete!");
        } else {
            alert("No valid transaction rows found in the CSV file.");
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// Populate Statement Month Dropdown
function populateMonthDropdown() {
    const select = document.getElementById('statement-month');
    if (!select) return;
    
    const monthsSet = new Set();
    
    if (Array.isArray(state.debits)) {
        state.debits.forEach(d => {
            if (d && d.date && typeof d.date === 'string') {
                const parts = d.date.split('-');
                if (parts.length >= 2) {
                    monthsSet.add(`${parts[0]}-${parts[1]}`); // "YYYY-MM"
                }
            }
        });
    }
    
    if (Array.isArray(state.receipts)) {
        state.receipts.forEach(r => {
            if (r && r.date && typeof r.date === 'string') {
                const parts = r.date.split('-');
                if (parts.length >= 2) {
                    monthsSet.add(`${parts[0]}-${parts[1]}`); // "YYYY-MM"
                }
            }
        });
    }
    
    const uniqueMonths = Array.from(monthsSet).sort().reverse();
    const currentVal = select.value || 'all';
    
    select.innerHTML = '<option value="all">All Months</option>';
    
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    uniqueMonths.forEach(ym => {
        const parts = ym.split('-');
        if (parts.length >= 2) {
            const [year, month] = parts;
            const monthIdx = parseInt(month) - 1;
            if (monthIdx >= 0 && monthIdx < 12) {
                const display = `${monthNames[monthIdx]} ${year}`;
                select.innerHTML += `<option value="${ym}">${display}</option>`;
            }
        }
    });
    
    if (Array.from(select.options).some(opt => opt.value === currentVal)) {
        select.value = currentVal;
    }
}

// Export Month Statement
function exportMonthStatement() {
    const selectedMonth = document.getElementById('statement-month').value;
    
    let filteredDebits = [...state.debits];
    let filteredReceipts = [...state.receipts];
    
    if (selectedMonth !== 'all') {
        filteredDebits = filteredDebits.filter(d => d.date && d.date.startsWith(selectedMonth));
        filteredReceipts = filteredReceipts.filter(r => r.date && r.date.startsWith(selectedMonth));
    }
    
    if (filteredDebits.length === 0 && filteredReceipts.length === 0) {
        alert("No transaction entries found for the selected period.");
        return;
    }
     
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Type,Date,SourceOrCard,Amount,Notes\r\n";
     
    filteredDebits.forEach(d => {
        const row = ["Debit", d.date, d.card, d.debited, ""].join(",");
        csvContent += row + "\r\n";
    });

    filteredReceipts.forEach(r => {
        const notesEscaped = r.notes ? `"${r.notes.replace(/"/g, '""')}"` : "";
        const row = ["Receipt", r.date, r.method, r.received, notesEscaped].join(",");
        csvContent += row + "\r\n";
    });
     
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
     
    const fileSuffix = selectedMonth === 'all' ? 'full_statement' : `statement_${selectedMonth}`;
    link.setAttribute("download", `karan_filling_${fileSuffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Clear all databases
function clearAllData() {
    if (confirm("🚨 WARNING: Are you absolutely certain you want to erase ALL transaction history? This cannot be undone!")) {
        state.debits = [];
        state.receipts = [];
        saveStateToStorage();
        renderAll();
        alert("Ledger completely wiped.");
    }
}

// Seed Demo Transactions for Testing
function loadDemoData() {
    if ((state.debits.length > 0 || state.receipts.length > 0) && !confirm("Loading demo data will clear your existing records. Proceed?")) {
        return;
    }
    
    const today = new Date();
    const subDays = (d) => {
        const copy = new Date(today);
        copy.setDate(today.getDate() - d);
        return copy.toISOString().split('T')[0];
    };
    
    state.debits = [
        { id: 'd_demo1', card: 'axis', date: subDays(1), debited: 15000 },
        { id: 'd_demo2', card: 'icici', date: subDays(3), debited: 20000 },
        { id: 'd_demo3', card: 'hdfc', date: subDays(5), debited: 45000 },
        { id: 'd_demo4', card: 'sbi', date: subDays(8), debited: 8000 },
        { id: 'd_demo5', card: 'axis', date: subDays(10), debited: 12000 },
        { id: 'd_demo6', card: 'icici', date: subDays(12), debited: 30000 },
        { id: 'd_demo7', card: 'hdfc', date: subDays(15), debited: 50000 }
    ];

    state.receipts = [
        { id: 'r_demo1', date: subDays(1), received: 14700, method: 'cash', notes: 'Raju Bhai cash withdrawal' },
        { id: 'r_demo2', date: subDays(3), received: 20000, method: 'online', notes: 'No charge special transaction GPay' },
        { id: 'r_demo3', date: subDays(5), received: 44100, method: 'cash', notes: 'Bikram S. cash delivery' },
        { id: 'r_demo4', date: subDays(8), received: 8000, method: 'online', notes: 'UPI Transfer direct to bank' },
        { id: 'r_demo5', date: subDays(10), received: 11760, method: 'cash', notes: 'Cash flow rebate' },
        { id: 'r_demo6', date: subDays(12), received: 29400, method: 'online', notes: 'Online transfer via pump account' },
        { id: 'r_demo7', date: subDays(15), received: 49000, method: 'cash', notes: 'Bikram S. cash handover' }
    ];
    
    saveStateToStorage();
    renderAll();
    alert("Demo independent records loaded successfully!");
}

// ==================== SECURITY LOCK LOGIC ====================

let enteredPin = '';
let isSettingPin = false;
let tempPin = '';

function initSecurityLock() {
    const savedPin = localStorage.getItem('fuel_flow_secure_pin') || state.securePin;
    const isUnlocked = sessionStorage.getItem('fuel_flow_unlocked') === 'true';
    const lockScreen = document.getElementById('lockScreen');

    if (!lockScreen) return;

    // Set up keyboard bindings for physical keys
    document.addEventListener('keydown', handlePhysicalKeyPress);

    if (isUnlocked) {
        lockScreen.classList.add('hidden');
    } else {
        lockScreen.classList.remove('hidden');
        resetPinState();
    }
}

function resetPinState() {
    enteredPin = '';
    tempPin = '';
    const savedPin = localStorage.getItem('fuel_flow_secure_pin') || state.securePin;
    const titleEl = document.getElementById('lockTitle');
    const subtitleEl = document.getElementById('lockSubtitle');

    if (!savedPin) {
        isSettingPin = true;
        if (titleEl) titleEl.textContent = "Set Secure PIN";
        if (subtitleEl) subtitleEl.textContent = "Initialize your secure 4-digit PIN for personal ledger access.";
    } else {
        isSettingPin = false;
        if (titleEl) titleEl.textContent = "Enter PIN";
        if (subtitleEl) subtitleEl.textContent = "Karan Filling Station Ledger is secure. Enter your 4-digit PIN.";
    }
    updatePinDots();
}

function pressPinNum(num) {
    if (enteredPin.length >= 4) return;
    enteredPin += num;
    updatePinDots();

    if (enteredPin.length === 4) {
        // Trigger automatic verification after a short, premium delay for UI breathing room
        setTimeout(verifyEnteredPin, 250);
    }
}

function clearPin() {
    enteredPin = '';
    updatePinDots();
}

function backspacePin() {
    if (enteredPin.length > 0) {
        enteredPin = enteredPin.slice(0, -1);
        updatePinDots();
    }
}

function updatePinDots() {
    for (let i = 1; i <= 4; i++) {
        const dot = document.getElementById(`pin-dot-${i}`);
        if (dot) {
            if (i <= enteredPin.length) {
                dot.classList.add('filled');
            } else {
                dot.classList.remove('filled');
            }
            dot.classList.remove('error');
        }
    }
}

function verifyEnteredPin() {
    const savedPin = localStorage.getItem('fuel_flow_secure_pin') || state.securePin;
    const titleEl = document.getElementById('lockTitle');
    const subtitleEl = document.getElementById('lockSubtitle');

    if (isSettingPin) {
        if (tempPin === '') {
            // First pass of setting PIN
            tempPin = enteredPin;
            enteredPin = '';
            updatePinDots();
            if (titleEl) titleEl.textContent = "Confirm Secure PIN";
            if (subtitleEl) subtitleEl.textContent = "Please enter your 4-digit PIN again to confirm.";
        } else {
            // Confirming PIN
            if (enteredPin === tempPin) {
                // Pin matched successfully!
                localStorage.setItem('fuel_flow_secure_pin', enteredPin);
                state.securePin = enteredPin;
                saveStateToStorage(); // Force immediate backup of PIN settings to the sync server!
                sessionStorage.setItem('fuel_flow_unlocked', 'true');
                flashSuccessAndUnlock();
            } else {
                // Mismatch
                flashErrorFeedback();
                tempPin = '';
                enteredPin = '';
                setTimeout(() => {
                    if (titleEl) titleEl.textContent = "PIN Mismatch";
                    if (subtitleEl) subtitleEl.textContent = "PINs did not match. Please choose your 4-digit PIN again.";
                    updatePinDots();
                }, 600);
            }
        }
    } else {
        // Unlock verification
        if (enteredPin === savedPin) {
            sessionStorage.setItem('fuel_flow_unlocked', 'true');
            flashSuccessAndUnlock();
        } else {
            flashErrorFeedback();
            enteredPin = '';
            setTimeout(() => {
                if (subtitleEl) subtitleEl.textContent = "Incorrect PIN! Please try again.";
                updatePinDots();
            }, 600);
        }
    }
}

function flashSuccessAndUnlock() {
    // Elegant green visual feedback
    for (let i = 1; i <= 4; i++) {
        const dot = document.getElementById(`pin-dot-${i}`);
        if (dot) {
            dot.style.boxShadow = '0 0 15px var(--accent-success)';
            dot.style.backgroundColor = 'var(--accent-success)';
            dot.style.borderColor = 'var(--accent-success)';
        }
    }

    setTimeout(() => {
        const lockScreen = document.getElementById('lockScreen');
        if (lockScreen) {
            lockScreen.classList.add('hidden');
        }
        // Clean up visual styling overrides
        for (let i = 1; i <= 4; i++) {
            const dot = document.getElementById(`pin-dot-${i}`);
            if (dot) {
                dot.style.boxShadow = '';
                dot.style.backgroundColor = '';
                dot.style.borderColor = '';
            }
        }
    }, 400);
}

function flashErrorFeedback() {
    const lockBox = document.querySelector('.lock-box');
    
    // Play error haptic shake
    if (lockBox) {
        lockBox.classList.add('shake');
        setTimeout(() => {
            lockBox.classList.remove('shake');
        }, 400);
    }

    // Flash dots in red
    for (let i = 1; i <= 4; i++) {
        const dot = document.getElementById(`pin-dot-${i}`);
        if (dot) {
            dot.classList.add('error');
        }
    }
}

function lockLedger() {
    sessionStorage.removeItem('fuel_flow_unlocked');
    const lockScreen = document.getElementById('lockScreen');
    if (lockScreen) {
        lockScreen.classList.remove('hidden');
        resetPinState();
    }
}

// Physical keyboard listeners for desktop convenience
function handlePhysicalKeyPress(event) {
    const lockScreen = document.getElementById('lockScreen');
    if (!lockScreen || lockScreen.classList.contains('hidden')) return;

    const key = event.key;
    if (/[0-9]/.test(key)) {
        pressPinNum(parseInt(key));
    } else if (key === 'Backspace') {
        backspacePin();
    } else if (key === 'Escape' || key === 'c' || key === 'C') {
        clearPin();
    }
}
