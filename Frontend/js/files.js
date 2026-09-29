/* =========================================================
   files.js — File Tree Management & Operations
   ========================================================= */

let fileTree = [];
let openFiles = [];       // Array of { id, name, content, version, isDirty, parentId }
let activeFileId = null;
let fileContextMenu = null;

// ─── Local Synchronization ───────────────────────────────────────────────────
let localSyncTimer = null;

async function syncWithLocalBackend() {
    if (!currentUser || !currentUser.local_sync_path || !projectData) return;
    if (fileTree.length === 0) return;

    try {
        // Build flat list of files (excluding directories for content sync)
        const filesPayload = fileTree.filter(f => !f.is_directory).map(f => ({
            id: f.id,
            name: getFullFilePath(f),
            content: f.content,
            updated_at: f.updated_at
        }));

        const res = await fetch(`${getLocalUrl()}/local/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                basePath: currentUser.local_sync_path,
                projectName: projectData.title,
                files: filesPayload
            })
        });

        const result = await res.json();
        if (result.success && result.localChanges && result.localChanges.length > 0) {
            console.log('Local changes detected:', result.localChanges);
            for (const change of result.localChanges) {
                if (change.id) {
                    // Update existing file in CentralBackend
                    await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/files/${change.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId: currentUser.id,
                            content: change.content,
                            baseVersion: 999999 // force overwrite for now to avoid conflict errors
                        })
                    });
                } else {
                    // Create new file in CentralBackend
                    await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/files`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId: currentUser.id,
                            name: change.name,
                            content: change.content,
                            isDirectory: false,
                            parentId: null // Simplified: root level for newly discovered files
                        })
                    });
                }
            }
            // Reload file tree after syncing changes
            await loadFileTree();
        }
    } catch (err) {
        console.error('Failed to sync with local backend:', err);
    }
}

// Helper to get relative path of a file
function getFullFilePath(file) {
    if (!file.parent_id) return file.name;
    let path = file.name;
    let current = fileTree.find(f => f.id === file.parent_id);
    while (current) {
        path = current.name + '/' + path;
        current = fileTree.find(f => f.id === current.parent_id);
    }
    return path;
}

// ─── Load file tree from server ──────────────────────────────────────────────
async function loadFileTree() {
    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/files`);
        const result = await res.json();
        if (result.success) {
            fileTree = result.data || [];

            // Auto-initialize project with LaTeX template if empty or if it only contains the legacy 'latex' folder
            const isEffectivelyEmpty = fileTree.length === 0 || (fileTree.length === 1 && fileTree[0].name === 'latex');
            if (isEffectivelyEmpty) {
                initProjectFiles();
                return;
            }

            renderFileTree();

            // Trigger sync immediately and ensure polling
            if (currentUser && currentUser.local_sync_path && projectData) {
                syncWithLocalBackend();
                if (!localSyncTimer) {
                    localSyncTimer = setInterval(syncWithLocalBackend, 5000); // 5 sec interval
                }
            }
        }
    } catch (err) {
        console.error('Failed to load file tree:', err);
    }
}

// ─── Initialize project with default LaTeX structure ─────────────────────────
async function initProjectFiles() {
    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/files/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
        const result = await res.json();
        if (result.success) {
            showToast('Project initialized with LaTeX template!', 'success');
            await loadFileTree();
        } else {
            // Project already has files, just load them
            await loadFileTree();
        }
    } catch (err) {
        console.error('Failed to init project:', err);
        await loadFileTree();
    }
}

// ─── Render file tree ────────────────────────────────────────────────────────
function renderFileTree() {
    const container = document.getElementById('fileTreeContainer');
    if (!container) return;

    if (fileTree.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-xl gap-md text-center px-md">
                <div class="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center">
                    <span class="material-symbols-outlined text-outline text-2xl">folder_open</span>
                </div>
                <p class="font-body-dense text-body-dense text-on-surface-variant">
                    No files yet. Initialize with a LaTeX template?
                </p>
                <button onclick="initProjectFiles()" class="h-[28px] px-md bg-primary-container text-on-primary-container font-title-sm text-[12px] rounded hover:opacity-90 transition-opacity flex items-center gap-xs">
                    <span class="material-symbols-outlined text-[14px]">add</span>
                    Initialize Project
                </button>
            </div>`;
        return;
    }

    // Build tree structure
    const tree = buildTreeStructure(fileTree);
    container.innerHTML = renderTreeNodes(tree, 0);
}

function buildTreeStructure(files) {
    const map = {};
    const roots = [];

    files.forEach(f => {
        f.children = [];
        map[f.id] = f;
    });

    files.forEach(f => {
        if (f.parent_id && map[f.parent_id]) {
            map[f.parent_id].children.push(f);
        } else {
            roots.push(f);
        }
    });

    // Sort: directories first, then alphabetically
    const sortNodes = (nodes) => {
        nodes.sort((a, b) => {
            if (a.is_directory && !b.is_directory) return -1;
            if (!a.is_directory && b.is_directory) return 1;
            return a.name.localeCompare(b.name);
        });
        nodes.forEach(n => sortNodes(n.children));
    };
    sortNodes(roots);

    return roots;
}

function renderTreeNodes(nodes, depth) {
    let html = '';
    nodes.forEach(node => {
        const indent = depth * 16;
        const isOpen = activeFileId === node.id;
        const isDirty = openFiles.find(f => f.id === node.id && f.isDirty);
        const icon = node.is_directory
            ? 'folder'
            : getFileIcon(node.name);
        const iconFill = node.is_directory ? "font-variation-settings: 'FILL' 1;" : '';

        html += `<div class="file-tree-item ${isOpen ? 'active' : ''}"
                      style="padding-left: ${4 + indent}px"
                      onclick="${node.is_directory ? `toggleFolder(${node.id})` : `openFile(${node.id})`}"
                      oncontextmenu="showFileContextMenu(event, ${node.id}, ${node.is_directory}, '${escapeHtml(node.name)}')"
                      data-file-id="${node.id}">
            <span class="material-symbols-outlined text-[14px]">${icon}</span>
            <span class="flex-1 truncate">${escapeHtml(node.name)}${node.is_directory ? '/' : ''}</span>
            ${isDirty ? '<span class="w-[6px] h-[6px] rounded-full bg-warning shrink-0"></span>' : ''}
        </div>`;

        if (node.is_directory && node.children.length > 0) {
            html += `<div id="folder-children-${node.id}" class="${node._expanded ? '' : 'hidden'}">`;
            html += renderTreeNodes(node.children, depth + 1);
            html += '</div>';
        }
    });
    return html;
}

function getFileIcon(name) {
    if (!name) return 'description';
    const ext = name.split('.').pop().toLowerCase();
    const iconMap = {
        'tex': 'code', 'bib': 'menu_book', 'sty': 'settings',
        'cls': 'settings', 'pdf': 'picture_as_pdf', 'png': 'image',
        'jpg': 'image', 'jpeg': 'image', 'svg': 'image',
        'txt': 'description', 'md': 'description', 'csv': 'table_chart',
        'json': 'data_object', 'log': 'terminal'
    };
    return iconMap[ext] || 'description';
}

// ─── Folder toggle ───────────────────────────────────────────────────────────
function toggleFolder(folderId) {
    const node = findFileNode(folderId);
    if (!node) return;
    node._expanded = !node._expanded;
    renderFileTree();
}

function findFileNode(id, nodes) {
    if (!nodes) nodes = fileTree;
    for (let n of nodes) {
        if (n.id === id) return n;
        if (n.children) {
            const found = findFileNode(id, n.children);
            if (found) return found;
        }
    }
    return null;
}

// ─── Open file in editor ─────────────────────────────────────────────────────
async function openFile(fileId) {
    // Check if already open
    const existing = openFiles.find(f => f.id === fileId);
    if (existing) {
        setActiveFile(fileId);
        return;
    }

    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/files/${fileId}`);
        const result = await res.json();
        if (result.success) {
            const file = result.data;
            openFiles.push({
                id: file.id,
                name: file.name,
                content: file.content || '',
                version: file.version,
                isDirty: false,
                parentId: file.parent_id
            });
            setActiveFile(fileId);
            renderFileTabs();
            renderFileTree();
        }
    } catch (err) {
        console.error('Failed to open file:', err);
    }
}

function setActiveFile(fileId) {
    activeFileId = fileId;
    const file = openFiles.find(f => f.id === fileId);
    if (file && typeof setEditorContent === 'function') {
        setEditorContent(file.content, file.name);
    }
    renderFileTabs();
    renderFileTree();

    // Join real-time sync for this file
    if (typeof joinDocSync === 'function') {
        joinDocSync();
    }
}

// ─── File tabs ───────────────────────────────────────────────────────────────
function renderFileTabs() {
    const container = document.getElementById('fileTabsContainer');
    if (!container) return;

    if (openFiles.length === 0) {
        container.innerHTML = '';
        return;
    }

    let html = '';
    openFiles.forEach(file => {
        const isActive = file.id === activeFileId;
        html += `<div class="editor-tab ${isActive ? 'active' : ''} ${file.isDirty ? 'dirty' : ''}"
                      onclick="setActiveFile(${file.id})">
            <span>${escapeHtml(file.name)}</span>
            <span class="w-[6px] h-[6px] rounded-full bg-warning shrink-0 tab-dot"></span>
            <span class="material-symbols-outlined text-[14px] tab-close hover:text-on-surface" onclick="event.stopPropagation(); closeFileTab(${file.id})">close</span>
        </div>`;
    });
    container.innerHTML = html;
}

function closeFileTab(fileId) {
    const file = openFiles.find(f => f.id === fileId);
    if (file && file.isDirty) {
        if (!confirm(`"${file.name}" has unsaved changes. Close anyway?`)) {
            return;
        }
    }
    openFiles = openFiles.filter(f => f.id !== fileId);
    if (activeFileId === fileId) {
        activeFileId = openFiles.length > 0 ? openFiles[openFiles.length - 1].id : null;
        if (activeFileId) {
            setActiveFile(activeFileId);
        } else if (typeof clearEditor === 'function') {
            clearEditor();
        }
    }
    renderFileTabs();
    renderFileTree();
}

// ─── Save file ───────────────────────────────────────────────────────────────
async function saveCurrentFile() {
    if (!activeFileId) return;
    const file = openFiles.find(f => f.id === activeFileId);
    if (!file) return;

    // Get latest content from editor
    if (typeof getEditorContent === 'function') {
        file.content = getEditorContent();
    }

    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/files/${file.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: file.content,
                userId: currentUser.id,
                baseVersion: file.version,
                changeDescription: 'Content updated'
            })
        });
        const result = await res.json();

        if (result.success) {
            file.version = result.data.version;
            file.isDirty = false;
            renderFileTabs();
            renderFileTree();
            showToast('File saved', 'success');
        } else if (result.conflict) {
            // Show conflict resolution dialog
            showConflictDialog(file, result);
        } else {
            showToast(result.message || 'Save failed', 'error');
        }
    } catch (err) {
        console.error('Failed to save file:', err);
        showToast('Failed to save file', 'error');
    }
}

// ─── Conflict resolution ─────────────────────────────────────────────────────
function showConflictDialog(file, conflictResult) {
    // Conflict dialog removed for real-time collaboration.
    // Instead of blocking the user, we just force overwrite or let real-time sync handle it.
    file.version = conflictResult.serverVersion;
    saveCurrentFile(); // Force save if we had local changes
}

async function resolveConflict(action) {
    const modal = document.getElementById('conflictModal');
    const file = modal._conflictFile;
    if (!file) return;

    if (action === 'server') {
        // Reload from server
        try {
            const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/files/${file.id}`);
            const result = await res.json();
            if (result.success) {
                file.content = result.data.content || '';
                file.version = result.data.version;
                file.isDirty = false;
                if (file.id === activeFileId && typeof setEditorContent === 'function') {
                    setEditorContent(file.content, file.name);
                }
                renderFileTabs();
                showToast('Server version loaded', 'success');
            }
        } catch (err) {
            showToast('Failed to load server version', 'error');
        }
    } else if (action === 'client') {
        // Force save client version (update baseVersion to server's)
        file.version = modal._serverVersion;
        await saveCurrentFile();
    }

    modal.style.display = 'none';
}

// ─── Create file/folder ──────────────────────────────────────────────────────
async function createNewFile(isDirectory) {
    const name = prompt(isDirectory ? 'Enter folder name:' : 'Enter file name:');
    if (!name || !name.trim()) return;

    // Determine parent — if a folder is selected, create inside it
    let parentId = null;
    if (fileContextMenu && fileContextMenu._targetId) {
        const targetNode = findFileNode(fileContextMenu._targetId);
        if (targetNode && targetNode.is_directory) {
            parentId = fileContextMenu._targetId;
        }
    }

    try {
        const payload = {
            name: name.trim(),
            isDirectory: isDirectory,
            parentId: parentId,
            userId: currentUser.id,
            content: isDirectory ? null : ''
        };

        const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            showToast(`${isDirectory ? 'Folder' : 'File'} created`, 'success');
            await loadFileTree();
            if (!isDirectory) {
                openFile(result.data.fileId);
            }
        } else {
            showToast(result.message || 'Creation failed', 'error');
        }
    } catch (err) {
        showToast('Failed to create ' + (isDirectory ? 'folder' : 'file'), 'error');
    }
}

// ─── Rename file ─────────────────────────────────────────────────────────────
async function renameFile(fileId, currentName) {
    const newName = prompt('Enter new name:', currentName);
    if (!newName || newName.trim() === currentName) return;

    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/files/${fileId}/rename`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newName: newName.trim(), userId: currentUser.id })
        });
        const result = await res.json();
        if (result.success) {
            showToast('File renamed', 'success');
            // Update open file tab if necessary
            const openFile = openFiles.find(f => f.id === fileId);
            if (openFile) openFile.name = newName.trim();
            await loadFileTree();
            renderFileTabs();
        } else {
            showToast(result.message || 'Rename failed', 'error');
        }
    } catch (err) {
        showToast('Failed to rename', 'error');
    }
}

// ─── Delete file ─────────────────────────────────────────────────────────────
async function deleteFile(fileId, fileName) {
    if (!confirm(`Delete "${fileName}"? This cannot be undone.`)) return;

    try {
        const res = await fetch(
            `${API_CONFIG.BASE_URL}/projects/${projectId}/files/${fileId}?userId=${currentUser.id}`,
            { method: 'DELETE' }
        );
        const result = await res.json();
        if (result.success) {
            showToast('File deleted', 'success');
            // Close if open
            openFiles = openFiles.filter(f => f.id !== fileId);
            if (activeFileId === fileId) {
                activeFileId = openFiles.length > 0 ? openFiles[openFiles.length - 1].id : null;
                if (activeFileId) setActiveFile(activeFileId);
                else if (typeof clearEditor === 'function') clearEditor();
            }
            await loadFileTree();
            renderFileTabs();
        } else {
            showToast(result.message || 'Delete failed', 'error');
        }
    } catch (err) {
        showToast('Failed to delete', 'error');
    }
}

// ─── Context menu ────────────────────────────────────────────────────────────
function showFileContextMenu(event, fileId, isDirectory, fileName) {
    event.preventDefault();
    event.stopPropagation();
    hideFileContextMenu();

    const menu = document.createElement('div');
    menu.id = 'fileContextMenuEl';
    menu.className = 'fixed bg-surface border border-outline-variant rounded-lg shadow-xl z-[100] py-xs min-w-[160px]';
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    menu._targetId = fileId;

    let items = '';
    if (isDirectory) {
        items += contextMenuItem('New File Here', 'note_add', `createNewFileInFolder(${fileId})`);
        items += contextMenuItem('New Folder Here', 'create_new_folder', `createNewFolderInFolder(${fileId})`);
        items += '<div class="my-xs border-t border-outline-variant"></div>';
    }
    items += contextMenuItem('Rename', 'edit', `renameFile(${fileId}, '${escapeHtml(fileName)}')`);
    items += contextMenuItem('Delete', 'delete', `deleteFile(${fileId}, '${escapeHtml(fileName)}')`, true);

    menu.innerHTML = items;
    document.body.appendChild(menu);

    fileContextMenu = menu;
    setTimeout(() => document.addEventListener('click', hideFileContextMenu, { once: true }), 0);
}

function contextMenuItem(label, icon, action, isDanger) {
    return `<button onclick="hideFileContextMenu(); ${action}" class="w-full flex items-center gap-sm px-md py-xs font-body-dense text-[12px] ${isDanger ? 'text-error hover:bg-error/10' : 'text-on-surface hover:bg-surface-container-high'} transition-colors text-left">
        <span class="material-symbols-outlined text-[16px]">${icon}</span>${label}
    </button>`;
}

function hideFileContextMenu() {
    const el = document.getElementById('fileContextMenuEl');
    if (el) el.remove();
    fileContextMenu = null;
}

async function createNewFileInFolder(folderId) {
    const name = prompt('Enter file name:');
    if (!name || !name.trim()) return;
    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim(), isDirectory: false, parentId: folderId, userId: currentUser.id, content: '' })
        });
        const result = await res.json();
        if (result.success) {
            showToast('File created', 'success');
            // Expand parent folder
            const parentNode = findFileNode(folderId);
            if (parentNode) parentNode._expanded = true;
            await loadFileTree();
            openFile(result.data.fileId);
        } else showToast(result.message, 'error');
    } catch (err) { showToast('Failed to create file', 'error'); }
}

async function createNewFolderInFolder(folderId) {
    const name = prompt('Enter folder name:');
    if (!name || !name.trim()) return;
    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim(), isDirectory: true, parentId: folderId, userId: currentUser.id })
        });
        const result = await res.json();
        if (result.success) {
            showToast('Folder created', 'success');
            const parentNode = findFileNode(folderId);
            if (parentNode) parentNode._expanded = true;
            await loadFileTree();
        } else showToast(result.message, 'error');
    } catch (err) { showToast('Failed to create folder', 'error'); }
}

// ─── Version history ─────────────────────────────────────────────────────────
async function showVersionHistory(fileId) {
    if (!fileId && activeFileId) fileId = activeFileId;
    if (!fileId) return;

    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/files/${fileId}/versions`);
        const result = await res.json();
        if (!result.success) return;

        const modal = document.getElementById('versionHistoryModal');
        const list = document.getElementById('versionHistoryList');
        if (!modal || !list) return;

        const versions = result.data || [];
        const file = openFiles.find(f => f.id === fileId);
        document.getElementById('versionHistoryFileName').textContent = file ? file.name : 'File';

        if (versions.length === 0) {
            list.innerHTML = '<p class="text-on-surface-variant text-center py-lg">No version history.</p>';
        } else {
            list.innerHTML = versions.map(v => `
                <div class="flex items-center justify-between p-sm border-b border-outline-variant hover:bg-surface-container-high transition-colors">
                    <div class="flex-1">
                        <div class="flex items-center gap-sm">
                            <span class="font-title-sm text-[12px] text-on-surface">v${v.version_number}</span>
                            <span class="font-body-dense text-[11px] text-on-surface-variant">${v.created_by_name || 'Unknown'}</span>
                        </div>
                        <div class="font-body-dense text-[11px] text-on-surface-variant">${v.change_description || ''}</div>
                        <div class="font-code-sm text-[10px] text-outline">${formatTimestamp(v.created_at)}</div>
                    </div>
                    <button onclick="restoreVersion(${fileId}, ${v.id})" class="h-[24px] px-sm bg-surface-container text-on-surface font-body-dense text-[11px] rounded border border-outline-variant hover:bg-primary-container hover:text-on-primary-container transition-colors">
                        Restore
                    </button>
                </div>
            `).join('');
        }

        modal.style.display = 'flex';
    } catch (err) {
        console.error('Failed to load version history:', err);
    }
}

async function restoreVersion(fileId, versionId) {
    if (!confirm('Restore this version? A new version will be created.')) return;

    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/files/${fileId}/restore/${versionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
        const result = await res.json();
        if (result.success) {
            showToast('Version restored', 'success');
            // Reload the file
            const openFileIdx = openFiles.findIndex(f => f.id === fileId);
            if (openFileIdx >= 0) {
                openFiles.splice(openFileIdx, 1);
            }
            closeVersionHistory();
            await openFile(fileId);
        } else {
            showToast(result.message || 'Restore failed', 'error');
        }
    } catch (err) {
        showToast('Failed to restore version', 'error');
    }
}

function closeVersionHistory() {
    const modal = document.getElementById('versionHistoryModal');
    if (modal) modal.style.display = 'none';
}

// ─── Utility ─────────────────────────────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatTimestamp(ts) {
    if (!ts) return '';
    try {
        const d = new Date(ts);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ts; }
}

function showToast(message, type) {
    // Remove existing toasts
    document.querySelectorAll('.toast-notification').forEach(el => el.remove());

    const toast = document.createElement('div');
    toast.className = `toast-notification fixed bottom-lg right-lg z-[200] px-lg py-sm rounded-lg shadow-xl font-body-dense text-body-dense flex items-center gap-sm transition-all duration-300 ${type === 'success' ? 'bg-primary-container text-on-primary-container' :
            type === 'error' ? 'bg-error-container text-on-error-container' :
                'bg-surface-container text-on-surface'
        }`;

    const icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info';
    toast.innerHTML = `<span class="material-symbols-outlined text-[18px]">${icon}</span>${escapeHtml(message)}`;

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
