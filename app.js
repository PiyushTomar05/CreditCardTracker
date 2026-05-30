/**
 * ==========================================================================
 * CREDIT CARD PETROL CASH-OUT TRACKER - LUXURY CLOUD ENGINE (SUPABASE)
 * ==========================================================================
 * Author: Antigravity
 * Features: PostgreSQL Cloud DB Sync, Email/Password Auth, Sandbox RLS
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
    activeCardFilter: null // Toggled by clicking 3D Cards
};

// LocalStorage & Session Configuration Keys
const STORAGE_KEY = 'fuel_flow_independent_state';
const SUPABASE_URL_KEY = 'fuel_flow_supabase_url';
const SUPABASE_KEY_KEY = 'fuel_flow_supabase_key';

// Hardcoded Default Connection Credentials (from PiyushTomar05's Supabase project)
const DEFAULT_SUPABASE_URL = 'https://atqrapmbmnfeqfbfyrpq.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_bjDODimKrDwayREG9ohpHg_m5Vg7Mv7';

let supabaseClient = null;
let activeUser = null;
let isLoaded = false;
let isSignUpMode = false;

// 1. Initialize Supabase Client (uses local override or default hardcoded keys)
function initSupabaseClient() {
    const url = localStorage.getItem(SUPABASE_URL_KEY) || DEFAULT_SUPABASE_URL;
    const key = localStorage.getItem(SUPABASE_KEY_KEY) || DEFAULT_SUPABASE_KEY;
    
    if (url && key && window.supabase) {
        try {
            supabaseClient = window.supabase.createClient(url, key);
            console.log("Supabase client initialized successfully.");
            return true;
        } catch (e) {
            console.error("Failed to initialize Supabase client:", e);
        }
    }
    return false;
}

// 2. Collapsible Credentials Settings Drawer
function toggleConfigDrawer(event) {
    if (event) event.preventDefault();
    const drawer = document.getElementById('configDrawer');
    if (!drawer) return;
    
    if (drawer.style.display === 'none') {
        drawer.style.display = 'flex';
        document.getElementById('setupSupabaseUrl').value = localStorage.getItem(SUPABASE_URL_KEY) || DEFAULT_SUPABASE_URL;
        document.getElementById('setupSupabaseKey').value = localStorage.getItem(SUPABASE_KEY_KEY) || DEFAULT_SUPABASE_KEY;
    } else {
        drawer.style.display = 'none';
    }
}

function saveDatabaseConfig() {
    const url = document.getElementById('setupSupabaseUrl').value.trim();
    const key = document.getElementById('setupSupabaseKey').value.trim();
    
    if (!url || !key) {
        alert("Please enter both your Supabase URL and Anon Key.");
        return;
    }
    
    localStorage.setItem(SUPABASE_URL_KEY, url);
    localStorage.setItem(SUPABASE_KEY_KEY, key);
    
    if (initSupabaseClient()) {
        alert("🎉 Supabase Credentials saved successfully! You can now Sign In or Create an Account.");
        const drawer = document.getElementById('configDrawer');
        if (drawer) drawer.style.display = 'none';
        updateSyncBadge('loading', 'Ready to Log In');
        checkSession(); // Quick check to see if there is an active session
    } else {
        alert("❌ Failed to initialize Supabase. Please check your credentials.");
    }
}

// 3. User Authentication & Account Management
function toggleAuthMode(event) {
    if (event) event.preventDefault();
    isSignUpMode = !isSignUpMode;
    
    const titleEl = document.getElementById('lockTitle');
    const toggleTextEl = document.getElementById('authToggleText');
    const toggleLinkEl = document.getElementById('authToggleLink');
    const submitBtn = document.getElementById('authSubmitBtn');
    
    if (isSignUpMode) {
        if (titleEl) titleEl.textContent = "Create Cloud Ledger Account";
        if (toggleTextEl) toggleTextEl.textContent = "Already have a cloud database?";
        if (toggleLinkEl) toggleLinkEl.textContent = "Sign In here";
        if (submitBtn) submitBtn.textContent = "Create Account & Migrate";
    } else {
        if (titleEl) titleEl.textContent = "Cloud Ledger Secure Login";
        if (toggleTextEl) toggleTextEl.textContent = "Don't have a cloud database?";
        if (toggleLinkEl) toggleLinkEl.textContent = "Create Account";
        if (submitBtn) submitBtn.textContent = "Sign In";
    }
}

async function handleAuthSubmit(event) {
    if (event) event.preventDefault();
    
    if (!supabaseClient) {
        if (!initSupabaseClient()) {
            alert("⚠️ Supabase is not configured yet! Click '⚙️ Database Settings' below, paste your Supabase URL & Anon Key, and save them first.");
            toggleConfigDrawer();
            return;
        }
    }
    
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const submitBtn = document.getElementById('authSubmitBtn');
    const originalBtnText = submitBtn.textContent;
    
    submitBtn.disabled = true;
    submitBtn.textContent = "Processing... Please Wait...";
    
    try {
        if (isSignUpMode) {
            // Sign Up
            const { data, error } = await supabaseClient.auth.signUp({ email, password });
            if (error) throw error;
            
            if (data && data.user) {
                if (data.session) {
                    activeUser = data.user;
                    alert("🎉 Account created successfully!");
                    await handleLoginSuccess(data.session);
                } else {
                    alert("✉️ Account registration submitted! Please check your email inbox to verify your account, then log in.");
                    isSignUpMode = false;
                    toggleAuthMode();
                }
            }
        } else {
            // Sign In
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            
            if (data && data.session) {
                activeUser = data.user;
                await handleLoginSuccess(data.session);
            }
        }
    } catch (err) {
        console.error("Auth failed:", err);
        flashErrorFeedback();
        alert(`❌ Authentication Error: ${err.message || err}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
    }
}

async function handleLoginSuccess(session) {
    activeUser = session.user;
    updateSyncBadge('active', '🟢 Cloud Synced');
    
    // Fetch user rows from Supabase
    await loadStateFromCloud();
    
    // Hide the login screen overlay
    const lockScreen = document.getElementById('lockScreen');
    if (lockScreen) lockScreen.classList.add('hidden');
    
    // Clear credentials fields
    document.getElementById('authEmail').value = '';
    document.getElementById('authPassword').value = '';
    
    isLoaded = true;
    renderAll();
    updateDiagnostics("Cloud Database Synced");
}

async function checkSession() {
    if (!supabaseClient) return;
    
    try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        
        if (data && data.session) {
            await handleLoginSuccess(data.session);
        } else {
            // Show lock screen
            const lockScreen = document.getElementById('lockScreen');
            if (lockScreen) lockScreen.classList.remove('hidden');
            updateSyncBadge('loading', 'Ready to Log In');
        }
    } catch (e) {
        console.warn("Session retrieval failed:", e);
    }
}

async function handleSignOut() {
    if (!supabaseClient) return;
    
    if (confirm("Are you sure you want to log out of your cloud ledger? Your local browser session will be locked.")) {
        try {
            await supabaseClient.auth.signOut();
            activeUser = null;
            isLoaded = false;
            
            // Empty variable state to prevent visual leaks
            state.debits = [];
            state.receipts = [];
            state.cards = {
                axis: { name: 'Axis Bank', limit: 245000, spent: 0 },
                icici: { name: 'ICICI Bank', limit: 380000, spent: 0 },
                hdfc: { name: 'HDFC Bank', limit: 175000, spent: 0 },
                sbi: { name: 'SBI Card', limit: 377000, spent: 0 }
            };
            
            renderAll();
            
            // Re-show login screen
            const lockScreen = document.getElementById('lockScreen');
            if (lockScreen) lockScreen.classList.remove('hidden');
            
            updateSyncBadge('loading', 'Logged Out');
            alert("🚪 You have successfully logged out. Dashboard has been securely locked.");
        } catch (e) {
            console.error("Log out failed:", e);
        }
    }
}

// 4. Data Synchronization Routines
async function loadStateFromCloud() {
    if (!supabaseClient || !activeUser) return;
    
    try {
        const { data: row, error } = await supabaseClient
            .from('ledger_sync')
            .select('data')
            .eq('user_id', activeUser.id)
            .single();
            
        if (error) {
            if (error.code === 'PGRST116') {
                // Row doesn't exist yet! (First time cloud setup)
                console.log("Cloud database empty. Performing initial migration of local records...");
                loadStateFromLocalStorage(); // Load what's currently in their browser
                await saveStateToCloud(); // Save to cloud to establish row
            } else {
                throw error;
            }
        } else if (row && row.data) {
            loadStateFromData(row.data);
            console.log("State successfully fetched from cloud database.");
        }
    } catch (e) {
        console.error("Failed to load state from cloud, falling back to localStorage:", e);
        loadStateFromLocalStorage();
        updateSyncBadge('fallback', '⚠️ Sync Server Lost');
    }
}

async function saveStateToCloud() {
    if (!supabaseClient || !activeUser) return;
    
    try {
        const payload = {
            cards: state.cards,
            debits: state.debits,
            receipts: state.receipts
        };
        
        const { error } = await supabaseClient
            .from('ledger_sync')
            .upsert({
                user_id: activeUser.id,
                data: payload,
                updated_at: new Date().toISOString()
            });
            
        if (error) throw error;
        console.log("Physically backed up state to Supabase cloud database.");
        updateDiagnostics("Cloud Sync Complete");
        updateSyncBadge('active', '🟢 Cloud Synced');
    } catch (e) {
        console.error("Cloud save failed:", e);
        updateDiagnostics("Cloud Write Failed");
        updateSyncBadge('fallback', '⚠️ Cloud Sync Error');
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

function loadStateFromStorage() {
    loadStateFromLocalStorage();
}

function saveStateToStorage() {
    try {
        const payload = {
            cards: state.cards,
            debits: state.debits,
            receipts: state.receipts
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        console.log("Database successfully synced to local storage.");
        updateDiagnostics("Saved Database");
        
        if (supabaseClient && activeUser) {
            saveStateToCloud();
        }
    } catch (e) {
        console.error("Critical: Storage write failed!", e);
        updateDiagnostics("Write Failed!");
    }
}

function updateSyncBadge(status, text) {
    const badge = document.getElementById('syncStatusBadge');
    if (!badge) return;
    
    badge.className = `sync-status-badge ${status}`;
    const textEl = badge.querySelector('.sync-status-text');
    if (textEl) textEl.textContent = text;
}

// Collapsible storage sync info modal bindings
function openSyncInfoModal() {
    const modal = document.getElementById('syncInfoModal');
    if (!modal) return;
    
    const activeInfo = document.getElementById('syncServerActiveInfo');
    const browserInfo = document.getElementById('syncBrowserOnlyInfo');
    
    if (supabaseClient && activeUser) {
        if (activeInfo) activeInfo.style.display = 'block';
        if (browserInfo) browserInfo.style.display = 'none';
    } else {
        if (activeInfo) activeInfo.style.display = 'none';
        if (browserInfo) browserInfo.style.display = 'block';
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

// 5. Initialize Application Event Handlers
document.addEventListener('DOMContentLoaded', async () => {
    try {
        initSyncInfoModalBindings();
        initDateDisplay();
        
        const isConfigured = initSupabaseClient();
        
        if (isConfigured) {
            await checkSession();
        } else {
            const lockScreen = document.getElementById('lockScreen');
            if (lockScreen) lockScreen.classList.remove('hidden');
            updateSyncBadge('fallback', '⚠️ Configuration Needed');
            toggleConfigDrawer();
        }
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

// ==================== SECURITY LOCK LOGIC ====================

function flashErrorFeedback() {
    const lockBox = document.querySelector('.lock-box');
    
    // Play error haptic shake
    if (lockBox) {
        lockBox.classList.add('shake');
        setTimeout(() => {
            lockBox.classList.remove('shake');
        }, 400);
    }
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

function exportDataToCSV() {
    if (state.debits.length === 0 && state.receipts.length === 0) {
        alert("There is no ledger data to export!");
        return;
    }
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Type,Date,SourceOrCard,Amount,Notes\r\n";
    
    state.debits.forEach(d => {
        const row = ["Debit", d.date, d.card, d.debited, ""].join(",");
        csvContent += row + "\r\n";
    });

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

function populateMonthDropdown() {
    const select = document.getElementById('statement-month');
    if (!select) return;
    
    const monthsSet = new Set();
    
    if (Array.isArray(state.debits)) {
        state.debits.forEach(d => {
            if (d && d.date && typeof d.date === 'string') {
                const parts = d.date.split('-');
                if (parts.length >= 2) {
                    monthsSet.add(`${parts[0]}-${parts[1]}`);
                }
            }
        });
    }
    
    if (Array.isArray(state.receipts)) {
        state.receipts.forEach(r => {
            if (r && r.date && typeof r.date === 'string') {
                const parts = r.date.split('-');
                if (parts.length >= 2) {
                    monthsSet.add(`${parts[0]}-${parts[1]}`);
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

function clearAllData() {
    if (confirm("🚨 WARNING: Are you absolutely certain you want to erase ALL transaction history? This cannot be undone!")) {
        state.debits = [];
        state.receipts = [];
        saveStateToStorage();
        renderAll();
        alert("Ledger completely wiped.");
    }
}

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
