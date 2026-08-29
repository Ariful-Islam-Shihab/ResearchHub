/* =========================================================
   project.js — Project Workspace Controller
   ========================================================= */

let currentUser = null;
let projectData = null;
let projectId = null;
let isOwner = false;
let selectedInviteUser = null;
let pendingInvites = [];
let activeMembers = [];
let memberToRemove = null;

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const userJson = localStorage.getItem('user');
    if (!userJson) { window.location.href = 'login.html'; return; }
    currentUser = JSON.parse(userJson);

    // Parse ?id= from URL
    const params = new URLSearchParams(window.location.search);
    projectId = parseInt(params.get('id'));
    if (!projectId) { window.location.href = 'dashboard.html'; return; }

    updateOnlineStatus();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    });

    // Invite panel controls
    document.getElementById('addMemberBtn').addEventListener('click', toggleAddMemberPanel);
    document.getElementById('closeAddMemberPanel').addEventListener('click', hideAddMemberPanel);
    document.getElementById('clearInviteSelection').addEventListener('click', clearInviteSelection);
    document.getElementById('sendInviteBtn').addEventListener('click', sendInvite);
    document.getElementById('memberFilterInput').addEventListener('input', filterMembers);
    document.getElementById('inviteSearchInput').addEventListener('input', debounce(searchUsers, 300));

    // Remove confirmation dialog
    document.getElementById('cancelRemoveBtn').addEventListener('click', () => {
        document.getElementById('confirmRemoveModal').classList.add('hidden');
        document.getElementById('confirmRemoveModal').classList.remove('flex');
        memberToRemove = null;
    });
    document.getElementById('confirmRemoveBtn').addEventListener('click', confirmRemoveMember);

    // Load data
    loadProject();
    checkPendingNotifications();
});

// ─── Online Status ──────────────────────────────────────────────────────────
function updateOnlineStatus() {
    const badge = document.getElementById('offlineBadge');
    if (!navigator.onLine) {
        badge.classList.remove('hidden'); badge.classList.add('flex');
    } else {
        badge.classList.add('hidden'); badge.classList.remove('flex');
    }
}

// ─── Load Project Details ───────────────────────────────────────────────────
async function loadProject() {
    try {
        const [projectRes, membersRes] = await Promise.all([
            fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}`),
            fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/members`)
        ]);
        const projectResult = await projectRes.json();
        const membersResult = await membersRes.json();

        if (!projectResult.success) {
            showError('Project not found or access denied.');
            return;
        }

        projectData = projectResult.data;
        isOwner = (projectData.owner_id == currentUser.id);
        activeMembers = membersResult.success ? (membersResult.data || []) : [];

        renderProjectInfo();
        renderMembersTab();

        if (isOwner) {
            loadPendingInvitations();
        }
    } catch (err) {
        console.error('Failed to load project:', err);
        showError('Failed to load project. Is the server running?');
    }
}

// ─── Render Project Info ─────────────────────────────────────────────────────
function renderProjectInfo() {
    const p = projectData;
    document.title = `${p.title} — ResearchHub`;

    // Sidebar
    document.getElementById('sidebarProjectName').textContent = p.title;
    document.getElementById('sidebarProjectStatus').textContent = p.status || 'ACTIVE';

    // Topbar
    document.getElementById('topbarBreadcrumb').textContent = p.title;

    // Owner badge
    if (isOwner) {
        const ownerBadge = document.getElementById('ownerBadge');
        ownerBadge.classList.remove('hidden');
        ownerBadge.classList.add('flex');
    }

    // Overview tab
    document.getElementById('overviewTitle').textContent = p.title;
    document.getElementById('overviewDesc').textContent = p.description || 'No description provided.';
    document.getElementById('overviewStatus').innerHTML = `
        <span class="w-[6px] h-[6px] rounded-full bg-primary animate-pulse"></span>${p.status || 'ACTIVE'}`;
    document.getElementById('statOwnerName').textContent = p.owner_name || 'Unknown';
    document.getElementById('statCreatedAt').textContent = formatDate(p.created_at);
    document.getElementById('statStatus').textContent = p.status || 'ACTIVE';
    document.getElementById('statMemberCount').textContent = activeMembers.length;

    // Overview member previews
    renderOverviewMembers();
}

function renderOverviewMembers() {
    const container = document.getElementById('overviewMembersList');
    if (!activeMembers.length) {
        container.innerHTML = '<span class="text-on-surface-variant font-body-dense text-body-dense">No members yet.</span>';
        return;
    }
    container.innerHTML = activeMembers.map(m => {
        const initials = getInitials(m.full_name);
        return `
        <div class="flex items-center gap-sm bg-surface-container rounded-lg px-md py-sm border border-outline-variant">
            <div class="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-title-sm text-[11px] shrink-0">
                ${initials}
            </div>
            <div class="flex flex-col min-w-0">
                <span class="font-body-base text-body-base text-on-surface truncate">${escapeHtml(m.full_name)}</span>
                <span class="font-body-dense text-body-dense text-on-surface-variant capitalize">${m.role || 'member'}</span>
            </div>
        </div>`;
    }).join('');
}

// ─── Render Members Tab ──────────────────────────────────────────────────────
function renderMembersTab() {
    // Show add member button to owner only
    if (isOwner) {
        document.getElementById('addMemberBtn').classList.remove('hidden');
        document.getElementById('addMemberBtn').classList.add('flex');
    }

    document.getElementById('memberCount').textContent = activeMembers.length;
    document.getElementById('statMemberCount').textContent = activeMembers.length;
    renderMembersTable(activeMembers);
    renderRoleDistribution(activeMembers);
}

function renderMembersTable(members) {
    const tbody = document.getElementById('membersTableBody');
    if (!members.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-md py-lg text-center text-on-surface-variant font-body-dense text-body-dense">No members found.</td></tr>`;
        return;
    }

    tbody.innerHTML = members.map(m => {
        const isMe = (m.user_id == currentUser.id);
        const isProjectOwner = (m.user_id == projectData.owner_id);
        const initials = getInitials(m.full_name);
        const roleColor = m.role === 'owner' ? 'text-primary' : m.role === 'supervisor' ? 'text-tertiary' : 'text-on-surface-variant';
        const canRemove = isOwner && !isMe && !isProjectOwner;

        return `
        <tr class="h-[36px] table-row border-b border-outline-variant/30 border-l-2 ${isMe ? 'border-l-primary bg-primary/5' : 'border-l-transparent'}">
            <td class="px-md">
                <div class="flex items-center gap-sm">
                    <div class="w-6 h-6 rounded-full bg-${isMe ? 'primary-container text-on-primary-container' : 'surface-container-highest text-on-surface-variant'} flex items-center justify-center font-code-sm text-[10px] shrink-0">
                        ${initials}
                    </div>
                    <span class="font-body-base text-body-base text-on-surface">${escapeHtml(m.full_name)}</span>
                    ${isMe ? '<span class="px-xs py-[1px] rounded bg-surface-container-highest text-on-surface-variant font-code-sm text-[10px] ml-xs">You</span>' : ''}
                    ${isProjectOwner && !isMe ? '<span class="px-xs py-[1px] rounded bg-primary-container/20 text-primary font-label-caps text-[10px] ml-xs">OWNER</span>' : ''}
                </div>
            </td>
            <td class="px-md font-body-dense text-body-dense ${roleColor} capitalize">${m.role || 'member'}</td>
            <td class="px-md font-code-sm text-code-sm text-on-surface-variant">${formatDate(m.joined_at)}</td>
            <td class="px-md text-center">
                ${canRemove ? `
                <button onclick="promptRemoveMember(${m.user_id}, '${escapeHtml(m.full_name)}')"
                    class="text-on-surface-variant hover:text-error transition-colors" title="Remove member">
                    <span class="material-symbols-outlined text-[16px]">person_remove</span>
                </button>` : '<span class="text-outline text-[12px]">—</span>'}
            </td>
        </tr>`;
    }).join('');
}

function renderRoleDistribution(members) {
    const counts = { supervisor: 0, teammate: 0, owner: 0 };
    members.forEach(m => {
        const r = (m.role || 'teammate').toLowerCase();
        counts[r] = (counts[r] || 0) + 1;
    });
    const total = members.length || 1;
    const roles = [
        { key: 'owner', label: 'Owner', color: 'bg-primary' },
        { key: 'supervisor', label: 'Supervisor', color: 'bg-tertiary-container' },
        { key: 'teammate', label: 'Teammate', color: 'bg-secondary-container' }
    ];
    document.getElementById('roleDistribution').innerHTML = roles.map(r => `
        <div class="flex justify-between items-center">
            <span class="font-body-dense text-body-dense text-on-surface-variant">${r.label}s</span>
            <span class="font-code-sm text-code-sm text-on-surface">${counts[r.key] || 0}</span>
        </div>
        <div class="w-full bg-surface-container-highest h-unit rounded-full overflow-hidden mb-sm">
            <div class="${r.color} h-full transition-all" style="width: ${Math.round(((counts[r.key] || 0) / total) * 100)}%"></div>
        </div>`).join('');
}

function filterMembers() {
    const q = document.getElementById('memberFilterInput').value.toLowerCase();
    const filtered = activeMembers.filter(m =>
        m.full_name.toLowerCase().includes(q) || (m.role || '').toLowerCase().includes(q)
    );
    renderMembersTable(filtered);
}

// ─── Load Pending Invitations ────────────────────────────────────────────────
async function loadPendingInvitations() {
    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/member-requests/sent?userId=${currentUser.id}`);
        const result = await res.json();
        if (result.success) {
            // Only show invitations for THIS project
            pendingInvites = (result.data || []).filter(r => r.project_id == projectId && r.status === 'PENDING');
            renderPendingInvitations();
        }
    } catch (err) {
        console.error('Failed to load pending invitations:', err);
    }
}

function renderPendingInvitations() {
    const section = document.getElementById('pendingInvitesSection');
    const list = document.getElementById('pendingInvitesList');
    const countSpan = document.getElementById('pendingCount');

    if (!pendingInvites.length) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    countSpan.textContent = `${pendingInvites.length} pending`;

    list.innerHTML = pendingInvites.map(inv => `
        <div class="flex items-center justify-between p-md border-b border-outline-variant/50 last:border-0" id="invite-row-${inv.id}">
            <div class="flex items-center gap-md">
                <div class="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant border border-outline-variant border-dashed">
                    <span class="material-symbols-outlined text-[16px]">mail</span>
                </div>
                <div>
                    <span class="font-title-sm text-title-sm text-on-surface">${escapeHtml(inv.receiver_name || 'User')}</span>
                    <div class="font-body-dense text-body-dense text-on-surface-variant">
                        Role: <span class="capitalize">${inv.role || 'teammate'}</span> · Sent ${formatDate(inv.created_at)}
                    </div>
                </div>
            </div>
            <button onclick="cancelInvitation(${inv.id})"
                class="text-error hover:bg-error/10 font-body-dense text-body-dense px-sm py-xs border border-error/30 rounded transition-colors flex items-center gap-xs">
                <span class="material-symbols-outlined text-[14px]">close</span>
                Cancel
            </button>
        </div>`).join('');
}

// ─── Cancel Invitation ───────────────────────────────────────────────────────
async function cancelInvitation(requestId) {
    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/member-requests/${requestId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
        const result = await res.json();
        if (result.success) {
            const row = document.getElementById(`invite-row-${requestId}`);
            if (row) { row.style.opacity = '0'; setTimeout(() => row.remove(), 300); }
            pendingInvites = pendingInvites.filter(i => i.id !== requestId);
            renderPendingInvitations();
            showToast('Invitation cancelled.');
        } else {
            showToast(result.message || 'Failed to cancel invitation.', 'error');
        }
    } catch (err) {
        showToast('Network error cancelling invitation.', 'error');
    }
}

// ─── Add Member Panel ────────────────────────────────────────────────────────
function toggleAddMemberPanel() {
    const panel = document.getElementById('addMemberPanel');
    const isHidden = panel.classList.contains('hidden');
    isHidden ? (panel.classList.remove('hidden'), panel.classList.add('flex', 'flex-col'))
             : hideAddMemberPanel();
}

function hideAddMemberPanel() {
    const panel = document.getElementById('addMemberPanel');
    panel.classList.add('hidden');
    panel.classList.remove('flex', 'flex-col');
    clearInviteSelection();
    document.getElementById('inviteSearchInput').value = '';
    document.getElementById('inviteSearchResults').classList.add('hidden');
}

// ─── User Search ─────────────────────────────────────────────────────────────
async function searchUsers() {
    const query = document.getElementById('inviteSearchInput').value.trim();
    const resultsList = document.getElementById('inviteSearchResults');
    if (query.length < 2) { resultsList.classList.add('hidden'); return; }

    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/users/search?q=${encodeURIComponent(query)}`);
        const result = await res.json();
        if (!result.success || !result.data.length) {
            resultsList.innerHTML = '<li class="px-md py-sm text-on-surface-variant font-body-dense text-body-dense">No users found.</li>';
            resultsList.classList.remove('hidden');
            return;
        }

        const currentMemberIds = new Set([
            projectData.owner_id,
            ...activeMembers.map(m => m.user_id),
            ...pendingInvites.map(i => i.receiver_id)
        ]);

        const filtered = result.data.filter(u => !currentMemberIds.has(u.id));
        if (!filtered.length) {
            resultsList.innerHTML = '<li class="px-md py-sm text-on-surface-variant font-body-dense text-body-dense">All matching users are already members or invited.</li>';
            resultsList.classList.remove('hidden');
            return;
        }

        resultsList.innerHTML = filtered.map(u => {
            const name = u.full_name || u.name || 'Unknown';
            return `
            <li onclick="selectInviteUser(${JSON.stringify(u).replace(/"/g, '&quot;')})"
                class="flex items-center gap-sm px-md py-sm hover:bg-surface-container-high cursor-pointer transition-colors">
                <div class="w-7 h-7 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-code-sm text-[10px] shrink-0">
                    ${getInitials(name)}
                </div>
                <div>
                    <div class="font-body-base text-body-base text-on-surface">${escapeHtml(name)}</div>
                    <div class="font-body-dense text-body-dense text-on-surface-variant">${escapeHtml(u.email)}</div>
                </div>
            </li>`;
        }).join('');
        resultsList.classList.remove('hidden');
    } catch (err) {
        console.error('User search error:', err);
    }
}

function selectInviteUser(user) {
    selectedInviteUser = user;
    const name = user.full_name || user.name || 'Unknown';
    document.getElementById('inviteSearchInput').value = name;
    document.getElementById('inviteSearchResults').classList.add('hidden');
    document.getElementById('inviteSelectedName').textContent = name;
    document.getElementById('inviteSelectedEmail').textContent = user.email;
    document.getElementById('inviteSelectedUser').classList.remove('hidden');
    document.getElementById('inviteSelectedUser').classList.add('flex');
    document.getElementById('sendInviteBtn').disabled = false;
}

function clearInviteSelection() {
    selectedInviteUser = null;
    document.getElementById('inviteSelectedUser').classList.add('hidden');
    document.getElementById('inviteSelectedUser').classList.remove('flex');
    document.getElementById('sendInviteBtn').disabled = true;
}

// ─── Send Invite ─────────────────────────────────────────────────────────────
async function sendInvite() {
    if (!selectedInviteUser) return;
    const role = document.getElementById('inviteRoleSelect').value;
    const btn = document.getElementById('sendInviteBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined text-[16px] animate-spin">progress_activity</span> Sending...';

    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/invite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                senderId: currentUser.id,
                receiverId: selectedInviteUser.id,
                role
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast(`Invitation sent to ${selectedInviteUser.full_name}!`);
            hideAddMemberPanel();
            loadPendingInvitations();
        } else {
            showToast(result.message || 'Failed to send invitation.', 'error');
        }
    } catch (err) {
        showToast('Network error sending invitation.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">send</span> Send Invite';
    }
}

// ─── Remove Member ───────────────────────────────────────────────────────────
function promptRemoveMember(userId, name) {
    memberToRemove = userId;
    document.getElementById('confirmRemoveText').textContent =
        `Are you sure you want to remove ${name} from this project? They can be re-invited later.`;
    const modal = document.getElementById('confirmRemoveModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

async function confirmRemoveMember() {
    if (!memberToRemove) return;
    const modal = document.getElementById('confirmRemoveModal');
    const btn = document.getElementById('confirmRemoveBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined text-[16px] animate-spin">progress_activity</span> Removing...';

    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/members/${memberToRemove}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requesterId: currentUser.id })
        });
        const result = await res.json();
        if (result.success) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            activeMembers = activeMembers.filter(m => m.user_id != memberToRemove);
            memberToRemove = null;
            renderMembersTab();
            renderOverviewMembers();
            showToast('Member removed successfully.');
        } else {
            showToast(result.message || 'Failed to remove member.', 'error');
        }
    } catch (err) {
        showToast('Network error removing member.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">person_remove</span> Remove';
    }
}

// ─── Tab Switching ────────────────────────────────────────────────────────────
const TAB_LABELS = {
    overview: 'Overview', members: 'Members',
    files: 'Files', tasks: 'Tasks', discussion: 'Discussion'
};

function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-tab-btn').forEach(el => {
        el.classList.remove('bg-primary-container/10', 'border-primary', 'text-primary');
        el.classList.add('border-transparent', 'text-on-surface-variant');
    });

    document.getElementById(`tab-${tab}`).classList.add('active');
    const activeBtn = document.getElementById(`tab-btn-${tab}`);
    activeBtn.classList.add('bg-primary-container/10', 'border-primary', 'text-primary');
    activeBtn.classList.remove('border-transparent', 'text-on-surface-variant');

    document.getElementById('topbarTabName').textContent = TAB_LABELS[tab] || tab;
}

// ─── Notification Badge ──────────────────────────────────────────────────────
async function checkPendingNotifications() {
    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/member-requests/pending?userId=${currentUser.id}`);
        const result = await res.json();
        if (result.success && result.data && result.data.length > 0) {
            document.getElementById('notificationBadge').classList.remove('hidden');
        }
    } catch (err) { /* silent */ }
}

// ─── Toast Notification ──────────────────────────────────────────────────────
function showToast(message, type = 'success') {
    const existing = document.getElementById('toast-container');
    if (existing) existing.remove();

    const isError = type === 'error';
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = `fixed bottom-xl right-xl z-[100] flex items-center gap-sm px-md py-sm rounded-lg border shadow-lg transition-all duration-300
        ${isError ? 'bg-error-container border-error/30 text-on-error-container' : 'bg-surface-container-high border-primary/30 text-on-surface'}`;
    container.innerHTML = `
        <span class="material-symbols-outlined text-[18px] ${isError ? 'text-error' : 'text-primary'}">${isError ? 'error' : 'check_circle'}</span>
        <span class="font-body-base text-body-base">${escapeHtml(message)}</span>`;
    document.body.appendChild(container);
    setTimeout(() => { container.style.opacity = '0'; setTimeout(() => container.remove(), 300); }, 3000);
}

function showError(message) {
    document.getElementById('overviewTitle').textContent = 'Error';
    document.getElementById('overviewDesc').textContent = message;
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function getInitials(name) {
    if (!name) return '';
    return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function escapeHtml(str = '') {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
        return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch { return dateStr; }
}

function debounce(fn, ms) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
