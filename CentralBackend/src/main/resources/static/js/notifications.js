/* =========================================================
   notifications.js — Notifications Controller
   ========================================================= */

let currentUser = null;
let currentTab = 'received'; // 'received' | 'sent'

document.addEventListener('DOMContentLoaded', () => {
    const userJson = localStorage.getItem('user');
    if (!userJson) { window.location.href = 'login.html'; return; }
    currentUser = JSON.parse(userJson);

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('user');
            window.location.href = 'login.html';
        });
    }

    updateOnlineStatus();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Tab switching
    document.getElementById('tabReceived').addEventListener('click', () => setTab('received'));
    document.getElementById('tabSent').addEventListener('click', () => setTab('sent'));

    fetchAll();
});

function updateOnlineStatus() {
    const badge = document.getElementById('offlineBadge');
    if (!navigator.onLine) {
        badge.classList.remove('hidden'); badge.classList.add('flex');
    } else {
        badge.classList.add('hidden'); badge.classList.remove('flex');
    }
}

function setTab(tab) {
    currentTab = tab;
    const receivedBtn = document.getElementById('tabReceived');
    const sentBtn = document.getElementById('tabSent');
    const receivedPanel = document.getElementById('receivedPanel');
    const sentPanel = document.getElementById('sentPanel');

    if (tab === 'received') {
        receivedBtn.classList.add('border-b-2', 'border-primary', 'text-primary');
        receivedBtn.classList.remove('text-on-surface-variant', 'border-transparent');
        sentBtn.classList.remove('border-b-2', 'border-primary', 'text-primary');
        sentBtn.classList.add('text-on-surface-variant', 'border-transparent');
        receivedPanel.classList.remove('hidden');
        sentPanel.classList.add('hidden');
    } else {
        sentBtn.classList.add('border-b-2', 'border-primary', 'text-primary');
        sentBtn.classList.remove('text-on-surface-variant', 'border-transparent');
        receivedBtn.classList.remove('border-b-2', 'border-primary', 'text-primary');
        receivedBtn.classList.add('text-on-surface-variant', 'border-transparent');
        sentPanel.classList.remove('hidden');
        receivedPanel.classList.add('hidden');
    }
}

async function fetchAll() {
    await Promise.all([fetchReceived(), fetchSent()]);
}

// ─── Received Invitations ────────────────────────────────────────────────────
async function fetchReceived() {
    if (!currentUser) return;
    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/member-requests/pending?userId=${currentUser.id}`);
        const result = await res.json();

        const list = document.getElementById('notificationsList');
        const countDisplay = document.getElementById('notificationCountDisplay');
        const badge = document.getElementById('notificationBadge');

        if (result.success && result.data) {
            const requests = result.data;

            if (countDisplay) countDisplay.textContent = `${requests.length} pending`;
            if (badge) {
                badge.classList.toggle('hidden', requests.length === 0);
            }

            if (list) {
                list.innerHTML = '';
                if (!requests.length) {
                    list.innerHTML = `
                    <div class="flex flex-col items-center py-2xl gap-md text-center">
                        <span class="material-symbols-outlined text-[48px] text-outline">notifications_none</span>
                        <p class="font-body-base text-body-base text-on-surface-variant">No pending invitations.</p>
                    </div>`;
                } else {
                    requests.forEach(req => {
                        const item = document.createElement('div');
                        item.id = `invite-${req.id}`;
                        item.className = 'flex flex-col p-lg bg-surface border border-outline-variant rounded-lg gap-sm transition-all hover:border-primary/30';
                        item.innerHTML = `
                        <div class="flex items-start gap-md">
                            <div class="w-10 h-10 rounded-full bg-primary-container/20 border border-primary/20 flex items-center justify-center shrink-0">
                                <span class="material-symbols-outlined text-primary text-[20px]">person_add</span>
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="font-body-base text-body-base text-on-surface">
                                    <span class="font-semibold">${escapeHtml(req.sender_name)}</span> invited you to join
                                    <span class="font-semibold">${escapeHtml(req.project_title)}</span>
                                </p>
                                <div class="flex items-center gap-sm mt-xs flex-wrap">
                                    <span class="inline-flex items-center gap-xs px-sm py-[2px] rounded-full bg-surface-container-high border border-outline-variant font-label-caps text-label-caps text-on-surface-variant capitalize">
                                        <span class="material-symbols-outlined text-[12px]">badge</span>${req.role || 'member'}
                                    </span>
                                    <span class="font-body-dense text-body-dense text-outline">${formatDate(req.created_at)}</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex justify-end gap-sm">
                            <button id="decline-${req.id}" class="decline-btn px-md py-xs rounded border border-outline-variant text-on-surface hover:bg-surface-container-high transition-colors font-title-sm text-title-sm flex items-center gap-xs" data-id="${req.id}">
                                <span class="material-symbols-outlined text-[16px]">close</span>Decline
                            </button>
                            <button id="accept-${req.id}" class="accept-btn px-md py-xs rounded bg-primary-container text-on-primary-container hover:bg-inverse-primary transition-colors font-title-sm text-title-sm flex items-center gap-xs" data-id="${req.id}">
                                <span class="material-symbols-outlined text-[16px]">check</span>Accept
                            </button>
                        </div>`;
                        list.appendChild(item);
                    });

                    list.querySelectorAll('.accept-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            await handleInvite(e.currentTarget.dataset.id, 'accept');
                        });
                    });
                    list.querySelectorAll('.decline-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            await handleInvite(e.currentTarget.dataset.id, 'decline');
                        });
                    });
                }
            }
        }
    } catch (err) {
        console.error('Error fetching notifications:', err);
        const list = document.getElementById('notificationsList');
        if (list) list.innerHTML = `<div class="p-xl border border-error/30 bg-error/5 rounded-lg text-error font-body-base text-body-base text-center">Failed to load notifications. Is the server running?</div>`;
    }
}

async function handleInvite(requestId, action) {
    const acceptBtn = document.getElementById(`accept-${requestId}`);
    const declineBtn = document.getElementById(`decline-${requestId}`);

    // Disable both buttons to prevent double-submit
    if (acceptBtn) { acceptBtn.disabled = true; acceptBtn.classList.add('opacity-50', 'cursor-not-allowed'); }
    if (declineBtn) { declineBtn.disabled = true; declineBtn.classList.add('opacity-50', 'cursor-not-allowed'); }

    const actionBtn = action === 'accept' ? acceptBtn : declineBtn;
    const originalHtml = actionBtn ? actionBtn.innerHTML : '';
    if (actionBtn) actionBtn.innerHTML = `<span class="material-symbols-outlined text-[16px] animate-spin">progress_activity</span> ${action === 'accept' ? 'Accepting...' : 'Declining...'}`;

    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/member-requests/${requestId}/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
        const result = await res.json();

        if (result.success) {
            const card = document.getElementById(`invite-${requestId}`);
            if (card) {
                // Animate out
                card.style.transition = 'opacity 0.3s, transform 0.3s';
                card.style.opacity = '0';
                card.style.transform = 'translateX(20px)';
                setTimeout(() => {
                    card.remove();
                    // Recount
                    const remaining = document.querySelectorAll('[id^="invite-"]').length;
                    const countDisplay = document.getElementById('notificationCountDisplay');
                    if (countDisplay) countDisplay.textContent = `${remaining} pending`;
                    const badge = document.getElementById('notificationBadge');
                    if (badge) badge.classList.toggle('hidden', remaining === 0);
                    if (remaining === 0) {
                        document.getElementById('notificationsList').innerHTML = `
                        <div class="flex flex-col items-center py-2xl gap-md text-center">
                            <span class="material-symbols-outlined text-[48px] text-outline">notifications_none</span>
                            <p class="font-body-base text-body-base text-on-surface-variant">No pending invitations.</p>
                        </div>`;
                    }
                }, 300);
            }
            // Refresh sent tab since it may change
            fetchSent();
        } else {
            // Re-enable on failure
            if (acceptBtn) { acceptBtn.disabled = false; acceptBtn.classList.remove('opacity-50', 'cursor-not-allowed'); }
            if (declineBtn) { declineBtn.disabled = false; declineBtn.classList.remove('opacity-50', 'cursor-not-allowed'); }
            if (actionBtn) actionBtn.innerHTML = originalHtml;
            showError(result.message || `Failed to ${action} invitation.`);
        }
    } catch (err) {
        console.error(`Error ${action}ing invite:`, err);
        if (acceptBtn) { acceptBtn.disabled = false; acceptBtn.classList.remove('opacity-50', 'cursor-not-allowed'); }
        if (declineBtn) { declineBtn.disabled = false; declineBtn.classList.remove('opacity-50', 'cursor-not-allowed'); }
        if (actionBtn) actionBtn.innerHTML = originalHtml;
        showError(`Network error. Could not ${action} invitation.`);
    }
}

// ─── Sent Invitations ────────────────────────────────────────────────────────
async function fetchSent() {
    if (!currentUser) return;
    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/member-requests/sent?userId=${currentUser.id}`);
        const result = await res.json();
        const list = document.getElementById('sentList');
        const sentCount = document.getElementById('sentCountDisplay');

        if (!result.success || !result.data) {
            list.innerHTML = `<p class="text-on-surface-variant font-body-dense text-body-dense text-center py-lg">Failed to load sent invitations.</p>`;
            return;
        }

        const invites = result.data.filter(i => i.status === 'PENDING');
        if (sentCount) sentCount.textContent = `${invites.length} pending`;

        if (!invites.length) {
            list.innerHTML = `
            <div class="flex flex-col items-center py-2xl gap-md text-center">
                <span class="material-symbols-outlined text-[48px] text-outline">send</span>
                <p class="font-body-base text-body-base text-on-surface-variant">No pending sent invitations.</p>
            </div>`;
            return;
        }

        list.innerHTML = invites.map(inv => `
        <div id="sent-${inv.id}" class="flex items-center justify-between p-lg bg-surface border border-outline-variant rounded-lg hover:border-outline transition-all">
            <div class="flex items-center gap-md">
                <div class="w-10 h-10 rounded-full bg-surface-container-high border border-outline-variant flex items-center justify-center shrink-0">
                    <span class="material-symbols-outlined text-on-surface-variant text-[18px]">mail_outline</span>
                </div>
                <div>
                    <p class="font-body-base text-body-base text-on-surface">
                        You invited <span class="font-semibold">${escapeHtml(inv.receiver_name || 'a user')}</span> to
                        <a href="project.html?id=${inv.project_id}" class="font-semibold text-primary hover:underline">${escapeHtml(inv.project_title || 'a project')}</a>
                    </p>
                    <div class="flex items-center gap-sm mt-xs">
                        <span class="inline-flex items-center gap-xs px-sm py-[2px] rounded-full bg-surface-container-high border border-outline-variant font-label-caps text-label-caps text-on-surface-variant capitalize">
                            <span class="material-symbols-outlined text-[12px]">badge</span>${inv.role || 'member'}
                        </span>
                        <span class="font-body-dense text-body-dense text-outline">${formatDate(inv.created_at)}</span>
                    </div>
                </div>
            </div>
            <button id="cancel-sent-${inv.id}" onclick="cancelSentInvite(${inv.id})"
                class="text-error hover:bg-error/10 font-body-dense text-body-dense px-sm py-xs border border-error/30 rounded transition-colors flex items-center gap-xs">
                <span class="material-symbols-outlined text-[14px]">close</span>Cancel
            </button>
        </div>`).join('');
    } catch (err) {
        console.error('Error fetching sent invitations:', err);
    }
}

async function cancelSentInvite(requestId) {
    const btn = document.getElementById(`cancel-sent-${requestId}`);
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>'; }

    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/member-requests/${requestId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
        const result = await res.json();
        if (result.success) {
            const row = document.getElementById(`sent-${requestId}`);
            if (row) { row.style.opacity = '0'; setTimeout(() => { row.remove(); fetchSent(); }, 300); }
        } else {
            if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined text-[14px]">close</span>Cancel'; }
            showError(result.message || 'Failed to cancel invitation.');
        }
    } catch (err) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined text-[14px]">close</span>Cancel'; }
        showError('Network error cancelling invitation.');
    }
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function formatDate(str) {
    if (!str) return '';
    try {
        const d = new Date(str);
        const now = new Date();
        const diffMs = now - d;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHrs = Math.floor(diffMins / 60);
        if (diffHrs < 24) return `${diffHrs}h ago`;
        const diffDays = Math.floor(diffHrs / 24);
        if (diffDays < 7) return `${diffDays}d ago`;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch { return str; }
}

function escapeHtml(str = '') {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showError(msg) {
    const existing = document.getElementById('error-toast');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'error-toast';
    el.className = 'fixed bottom-xl right-xl z-[100] flex items-center gap-sm px-md py-sm rounded-lg border bg-error-container border-error/30 text-on-error-container shadow-lg';
    el.innerHTML = `<span class="material-symbols-outlined text-error text-[18px]">error</span><span class="font-body-base text-body-base">${escapeHtml(msg)}</span>`;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 4000);
}
