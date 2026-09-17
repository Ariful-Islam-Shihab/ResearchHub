// Datasets Module
// Manages the Datasets tab: listing, adding, detail panel, sync status

let datasetsLoaded = false;
let allDatasets = [];
let selectedDatasetId = null;

// Load Datasets
async function loadDatasets() {
    let listEl = document.getElementById('datasetsTableBody');
    let emptyEl = document.getElementById('datasetsEmpty');
    let countEl = document.getElementById('datasetsCount');

    if (!listEl) return;
    listEl.innerHTML = '<div class="flex items-center justify-center py-xl"><span class="material-symbols-outlined animate-spin text-primary text-xl">progress_activity</span></div>';
    emptyEl.classList.add('hidden');

    try {
        let res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/datasets?userId=${currentUser.id}`);
        let result = await res.json();

        if (result.success) {
            allDatasets = result.data || [];
            countEl.textContent = allDatasets.length + ' dataset' + (allDatasets.length !== 1 ? 's' : '');
            renderDatasetsTable();
            datasetsLoaded = true;
        } else {
            listEl.innerHTML = '<div class="text-center py-xl text-on-surface-variant">' + result.message + '</div>';
        }
    } catch (err) {
        console.log('Error loading datasets:', err);
        listEl.innerHTML = '<div class="text-center py-xl text-error">Failed to load datasets</div>';
    }
}

// Render Datasets Table
function renderDatasetsTable() {
    let listEl = document.getElementById('datasetsTableBody');
    let emptyEl = document.getElementById('datasetsEmpty');

    if (allDatasets.length === 0) {
        listEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
    }

    emptyEl.classList.add('hidden');
    let html = '';
    for (let idx = 0; idx < allDatasets.length; idx++) {
        let ds = allDatasets[idx];
        let syncStatus = ds.my_sync_status || 'NOT_SYNCED';
        let statusBadge = getStatusBadge(syncStatus);
        let actionBtn = getActionButton(ds, syncStatus);
        let sizeStr = formatFileSize(ds.total_size || 0);
        let isSelected = ds.id === selectedDatasetId;
        let bgClass = isSelected ? 'bg-primary-container/5' : (idx % 2 === 0 ? 'bg-surface-dim' : '');

        html += '<div class="h-[44px] flex items-center px-lg border-b border-outline-variant hover:bg-surface-container transition-colors cursor-pointer ' + bgClass + '"'
             + ' onclick="selectDataset(' + ds.id + ')">'
             + '<div class="w-[30%] font-body-base text-body-base text-on-surface flex items-center gap-sm truncate">'
             + '<span class="material-symbols-outlined text-on-surface-variant text-[16px]">folder_zip</span>'
             + '<span class="truncate">' + escapeHtml(ds.name) + '</span>'
             + '</div>'
             + '<div class="w-[12%] font-code-base text-code-sm text-on-surface-variant">' + escapeHtml(ds.version || 'v1.0') + '</div>'
             + '<div class="w-[13%] font-code-base text-code-sm text-on-surface-variant">' + sizeStr + '</div>'
             + '<div class="w-[20%] flex items-center">' + statusBadge + '</div>'
             + '<div class="w-[25%] flex items-center justify-end gap-sm" onclick="event.stopPropagation()">' + actionBtn + '</div>'
             + '</div>';
    }
    listEl.innerHTML = html;
}

// Status Badge
function getStatusBadge(status) {
    let color = '#6b7280';
    let label = 'NOT SYNCED';
    let icon = '';

    if (status === 'SYNCHRONIZED') { color = '#10b981'; label = 'SYNCHRONIZED'; icon = 'verified'; }
    else if (status === 'UPDATE_AVAILABLE') { color = '#f59e0b'; label = 'UPDATE AVAIL'; icon = ''; }
    else if (status === 'SYNCING') { color = '#8b5cf6'; label = 'SYNCING'; icon = ''; }
    else if (status === 'ERROR') { color = '#ef4444'; label = 'ERROR'; icon = 'error'; }

    let iconHtml = '';
    if (icon !== '') {
        iconHtml = '<span class="material-symbols-outlined text-[12px] ml-xs" style="color: ' + color + '">' + icon + '</span>';
    }

    return '<div class="flex items-center gap-xs bg-surface-container-highest/50 border border-outline-variant px-sm py-[2px] rounded-full">'
         + '<div class="w-[6px] h-[6px] rounded-full" style="background: ' + color + '"></div>'
         + '<span class="font-label-caps text-label-caps text-on-surface" style="font-size: 10px">' + label + '</span>'
         + iconHtml
         + '</div>';
}

// Action Buttons
function getActionButton(ds, syncStatus) {
    if (syncStatus === 'SYNCHRONIZED') {
        return '<button onclick="openNativeFolder(\'' + (ds.my_local_path || ds.name) + '\')" class="bg-surface-container-lowest border border-outline-variant text-primary h-[24px] px-sm rounded flex items-center justify-center font-title-sm text-[12px] hover:bg-surface-container-high transition-colors">'
             + '<span class="material-symbols-outlined text-[14px] mr-xs">folder_open</span>Open Folder'
             + '</button>';
    }
    if (syncStatus === 'UPDATE_AVAILABLE') {
        return '<span class="font-code-sm text-code-sm text-on-surface-variant">' + (ds.my_synced_version || '?') + ' → ' + ds.version + '</span>'
             + '<button onclick="downloadFromServer(' + ds.id + ')" class="bg-surface-container-lowest border border-outline-variant text-primary h-[24px] px-sm rounded flex items-center justify-center font-title-sm text-[12px] hover:bg-surface-container-high transition-colors">'
             + '<span class="material-symbols-outlined text-[14px] mr-xs">sync</span>Sync'
             + '</button>';
    }
    if (syncStatus === 'SYNCING') {
        return '<div class="flex items-center gap-xs">'
             + '<div class="w-[80px] h-[4px] bg-surface-container-highest rounded-full overflow-hidden">'
             + '<div class="h-full bg-primary rounded-full transition-all" style="width: ' + (ds.my_progress || 0) + '%"></div>'
             + '</div>'
             + '<span class="font-code-sm text-code-sm text-on-surface-variant">' + (ds.my_progress || 0) + '%</span>'
             + '</div>';
    }
    // NOT_SYNCED
    return '<button onclick="downloadFromServer(' + ds.id + ')" class="bg-surface-container-lowest border border-outline-variant text-on-surface-variant h-[24px] px-sm rounded flex items-center justify-center font-title-sm text-[12px] hover:bg-surface-container-high hover:text-primary transition-colors">'
         + '<span class="material-symbols-outlined text-[14px] mr-xs">cloud_download</span>Download'
         + '</button>';
}

// Select a Dataset (show detail panel)
async function selectDataset(datasetId) {
    selectedDatasetId = datasetId;
    renderDatasetsTable();

    let panel = document.getElementById('datasetDetailPanel');
    panel.classList.remove('hidden');

    let contentEl = document.getElementById('datasetDetailContent');
    contentEl.innerHTML = '<div class="flex items-center justify-center py-xl"><span class="material-symbols-outlined animate-spin text-primary text-xl">progress_activity</span></div>';

    try {
        let res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/datasets/${datasetId}?userId=${currentUser.id}`);
        let result = await res.json();

        if (result.success) {
            renderDatasetDetail(result.data);
        } else {
            contentEl.innerHTML = '<p class="text-error p-md">' + result.message + '</p>';
        }
    } catch (err) {
        contentEl.innerHTML = '<p class="text-error p-md">Failed to load dataset details</p>';
    }
}

// Render Dataset Detail Panel
function renderDatasetDetail(ds) {
    let contentEl = document.getElementById('datasetDetailContent');
    let syncStatuses = ds.sync_statuses || [];
    let sizeStr = formatFileSize(ds.total_size || 0);

    let syncStatusesHtml = '';
    for (let i = 0; i < syncStatuses.length; i++) {
        let ss = syncStatuses[i];
        let color = '#6b7280';
        let icon = 'cloud_off';
        let label = 'Not Synced';

        if (ss.status === 'SYNCHRONIZED') { color = '#10b981'; icon = 'cloud_done'; label = 'Synced'; }
        else if (ss.status === 'UPDATE_AVAILABLE') { color = '#f59e0b'; icon = 'update'; label = 'Update Available'; }
        else if (ss.status === 'SYNCING') { color = '#8b5cf6'; icon = 'sync'; label = 'Syncing'; }
        else if (ss.status === 'ERROR') { color = '#ef4444'; icon = 'error'; label = 'Error'; }

        syncStatusesHtml += '<div class="flex items-center justify-between py-xs">'
            + '<div class="flex items-center gap-xs">'
            + '<div class="w-5 h-5 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center text-[9px] font-bold">' + getInitials(ss.user_name) + '</div>'
            + '<span class="font-body-dense text-body-dense text-on-surface">' + escapeHtml(ss.user_name) + '</span>'
            + '</div>'
            + '<div class="flex items-center gap-xs">'
            + '<span class="material-symbols-outlined text-[14px]" style="color: ' + color + '">' + icon + '</span>'
            + '<span class="font-code-sm text-code-sm" style="color: ' + color + '">' + label + '</span>'
            + '</div>'
            + '</div>';
    }

    if (syncStatusesHtml === '') {
        syncStatusesHtml = '<span class="font-body-dense text-body-dense text-on-surface-variant">No sync data</span>';
    }

    let hasBlob = ds.file_count > 0;

    contentEl.innerHTML = ''
        + '<div class="font-headline-md text-headline-md font-bold text-on-surface mb-md">' + escapeHtml(ds.name) + '</div>'
        + '<div class="flex flex-col gap-xs font-body-dense text-body-dense mb-md">'
        + '<div class="flex justify-between"><span class="text-on-surface-variant">Version</span><span class="font-code-base text-code-sm">' + escapeHtml(ds.version || 'v1.0') + '</span></div>'
        + '<div class="flex justify-between"><span class="text-on-surface-variant">Size</span><span class="font-code-base text-code-sm">' + sizeStr + '</span></div>'
        + '<div class="flex justify-between"><span class="text-on-surface-variant">Files</span><span class="font-code-base text-code-sm">' + (ds.file_count || 0) + '</span></div>'
        + '<div class="flex justify-between"><span class="text-on-surface-variant">Format</span><span class="font-code-base text-code-sm">' + escapeHtml(ds.format || 'N/A') + '</span></div>'
        + '<div class="flex justify-between"><span class="text-on-surface-variant">Added by</span><span class="font-code-base text-code-sm">' + escapeHtml(ds.added_by_name || 'Unknown') + '</span></div>'
        + '<div class="flex justify-between"><span class="text-on-surface-variant">Server Copy</span><span class="font-code-base text-code-sm" style="color: ' + (hasBlob ? '#10b981' : '#ef4444') + '">' + (hasBlob ? 'Uploaded' : 'Not uploaded') + '</span></div>'
        + '</div>'
        + '<div class="border-t border-outline-variant pt-md mb-md">'
        + '<div class="font-title-sm text-title-sm text-on-surface mb-sm">Sync Status</div>'
        + '<div class="bg-surface-container-lowest p-sm rounded border border-outline-variant flex flex-col gap-[2px]">'
        + syncStatusesHtml
        + '</div></div>'
        + '<div class="border-t border-outline-variant pt-md mb-md">'
        + '<div class="font-title-sm text-title-sm text-on-surface mb-sm">Description</div>'
        + '<textarea id="datasetDescriptionEdit" rows="3"'
        + ' class="w-full bg-surface-container-lowest border border-outline-variant rounded px-sm py-xs font-body-dense text-body-dense text-on-surface-variant focus:outline-none focus:border-primary resize-none"'
        + ' onblur="updateDatasetField(' + ds.id + ', \'description\', this.value)"'
        + ' placeholder="Add a description...">' + escapeHtml(ds.description || '') + '</textarea>'
        + '</div>'
        + '<div class="border-t border-outline-variant pt-md mb-md">'
        + '<div class="font-title-sm text-title-sm text-on-surface mb-sm">Local Path</div>'
        + '<div class="bg-surface-container-lowest p-sm rounded border border-outline-variant">'
        + '<code class="font-code-sm text-code-sm text-on-surface-variant break-all">' + escapeHtml(ds.local_path || 'Not set') + '</code>'
        + '</div></div>'
        + '<div class="border-t border-outline-variant pt-md flex flex-col gap-sm">'
        + '<button onclick="openEditDatasetModal(' + ds.id + ')" class="w-full h-[32px] bg-surface-container border border-outline-variant text-on-surface font-title-sm text-[12px] rounded hover:bg-surface-container-high transition-colors flex items-center justify-center gap-xs">'
        + '<span class="material-symbols-outlined text-[14px]">edit</span>Edit Metadata'
        + '</button>'
        + '<button onclick="confirmDeleteDataset(' + ds.id + ', \'' + escapeHtml(ds.name) + '\')" class="w-full h-[32px] bg-error/10 border border-error/20 text-error font-title-sm text-[12px] rounded hover:bg-error/20 transition-colors flex items-center justify-center gap-xs">'
        + '<span class="material-symbols-outlined text-[14px]">delete</span>Remove Dataset'
        + '</button>'
        + '</div>';
}

// Close Detail Panel
function closeDatasetDetail() {
    let panel = document.getElementById('datasetDetailPanel');
    panel.classList.add('hidden');
    selectedDatasetId = null;
    renderDatasetsTable();
}

// Open Native Folder
async function openNativeFolder(folderName) {
    try {
        let res = await fetch(`http://localhost:3000/api/local/open-folder?folderName=${encodeURIComponent(folderName)}`);
        if (res.ok) {
            let msg = await res.text();
            showToast(msg, 'success');
        } else {
            let msg = await res.text();
            showToast(msg, 'error');
        }
    } catch (err) {
        showToast('Local Backend is not running or unreachable.', 'error');
    }
}

// Update Dataset Field
async function updateDatasetField(datasetId, field, value) {
    try {
        let payload = {};
        payload[field] = value;
        payload.userId = currentUser.id;

        await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/datasets/${datasetId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.log('Error updating dataset field:', err);
    }
}

// Add Dataset Modal
function openAddDatasetModal() {
    document.getElementById('addDatasetModal').style.display = 'flex';
    document.getElementById('addDatasetName').value = '';
    document.getElementById('addDatasetPath').value = '';
    document.getElementById('addDatasetDescription').value = '';
    document.getElementById('addDatasetVersion').value = 'v1.0';
    document.getElementById('scanResults').classList.add('hidden');
    document.getElementById('addDatasetSubmitBtn').disabled = true;
}

function closeAddDatasetModal() {
    document.getElementById('addDatasetModal').style.display = 'none';
}


let lastScanData = null;
let selectedFiles = [];

async function handleDirectorySelection(event) {
    let files = event.target.files;
    if (!files || files.length === 0) return;
    
    selectedFiles = Array.from(files);
    
    let displayPath = "";
    if (selectedFiles[0].webkitRelativePath) {
        displayPath = selectedFiles[0].webkitRelativePath.split('/')[0];
    } else {
        if (selectedFiles.length === 1) {
            displayPath = selectedFiles[0].name;
        } else {
            displayPath = `${selectedFiles.length} files selected`;
        }
    }
    
    document.getElementById('addDatasetPath').value = displayPath;
    
    // Calculate size and count
    let totalSize = 0;
    let extensions = new Set();
    
    for (let f of selectedFiles) {
        totalSize += f.size;
        let name = f.name;
        let dotIdx = name.lastIndexOf('.');
        if (dotIdx > 0) {
            extensions.add(name.substring(dotIdx));
        }
    }
    
    lastScanData = {
        name: displayPath,
        totalSize: totalSize,
        fileCount: selectedFiles.length,
        format: extensions.size > 0 ? Array.from(extensions).join(', ') : 'Unknown',
        checksum: "sha256-web-upload-" + Date.now() // Mock checksum for web upload
    };
    
    // Update UI
    let nameInput = document.getElementById('addDatasetName');
    if (nameInput.value.trim() === '') {
        nameInput.value = lastScanData.name;
    }
    
    let scanResults = document.getElementById('scanResults');
    scanResults.classList.remove('hidden');
    document.getElementById('scanSize').textContent = formatFileSize(lastScanData.totalSize);
    document.getElementById('scanFiles').textContent = lastScanData.fileCount;
    document.getElementById('scanFormat').textContent = lastScanData.format;
    document.getElementById('scanChecksum').textContent = 'Web Upload';
    
    document.getElementById('addDatasetSubmitBtn').disabled = false;
}

// Submit Add Dataset
// Step 1: Register metadata in the central database
// Step 2: Get list of files from local path via LocalBackend
// Step 3: Loop through each file, read it, and upload to CentralBackend
async function submitAddDataset() {
    let name = document.getElementById('addDatasetName').value.trim();
    let path = document.getElementById('addDatasetPath').value.trim();
    let description = document.getElementById('addDatasetDescription').value.trim();
    let version = document.getElementById('addDatasetVersion').value.trim() || 'v1.0';

    if (name === '') {
        showToast('Dataset name is required', 'error');
        return;
    }
    if (path === '') {
        showToast('Local path is required', 'error');
        return;
    }

    let submitBtn = document.getElementById('addDatasetSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering...';

    try {
        // Step 1: Register metadata
        let payload = {
            name: name,
            description: description,
            version: version,
            localPath: path,
            addedBy: currentUser.id,
            totalSize: lastScanData ? lastScanData.totalSize : 0,
            fileCount: lastScanData ? lastScanData.fileCount : 0,
            format: lastScanData ? lastScanData.format : '',
            checksum: lastScanData ? lastScanData.checksum : ''
        };

        let res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/datasets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        let result = await res.json();

            if (result.success) {
                let newDatasetId = result.data.id;
                let localBaseUrl = API_CONFIG.BASE_URL.replace('/api', '/local');
                let uploadCount = 0;
                
                // Upload each selected file
                for (let i = 0; i < selectedFiles.length; i++) {
                    let file = selectedFiles[i];
                    submitBtn.textContent = 'Uploading ' + (i+1) + '/' + selectedFiles.length;
                    
                    let relativePath = file.webkitRelativePath || file.name;
                    
                    // 1. Upload to LocalBackend to save locally
                    let localFormData = new FormData();
                    localFormData.append('file', file);
                    localFormData.append('datasetId', newDatasetId);
                    localFormData.append('relativePath', relativePath);
                    
                    let localRes = await fetch(localBaseUrl + '/datasets/upload-file', {
                        method: 'POST',
                        body: localFormData
                    });
                    
                    if (localRes.ok) {
                        // 2. Upload to CentralBackend to register file metadata
                        let centralFormData = new FormData();
                        centralFormData.append('file', file);
                        centralFormData.append('userId', currentUser.id);
                        centralFormData.append('fileName', relativePath);
                        centralFormData.append('fileSize', file.size);
                        centralFormData.append('fileType', file.type || 'application/octet-stream');
                        
                        let uploadRes = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/datasets/${newDatasetId}/files/upload`, {
                            method: 'POST',
                            body: centralFormData
                        });
                        
                        if (uploadRes.ok) {
                            uploadCount++;
                        }
                    }
                }

                if (uploadCount === selectedFiles.length) {
                    showToast('Dataset registered and all files uploaded!', 'success');
                } else {
                    showToast('Dataset registered but some files failed to upload.', 'error');
                }

                closeAddDatasetModal();
                loadDatasets();
        } else {
            showToast(result.message || 'Failed to register dataset', 'error');
        }
    } catch (err) {
        console.log('Error:', err);
        showToast('Error registering dataset', 'error');
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Register Dataset';
}

// Delete Dataset
let datasetToDelete = null;

function confirmDeleteDataset(datasetId, name) {
    datasetToDelete = datasetId;
    document.getElementById('deleteDatasetName').textContent = name;
    document.getElementById('deleteDatasetModal').style.display = 'flex';
}

function closeDeleteDatasetModal() {
    document.getElementById('deleteDatasetModal').style.display = 'none';
    datasetToDelete = null;
}

async function executeDeleteDataset() {
    if (datasetToDelete == null) return;

    try {
        let res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/datasets/${datasetToDelete}`, {
            method: 'DELETE'
        });
        let result = await res.json();

        if (result.success) {
            showToast('Dataset removed', 'success');
            closeDeleteDatasetModal();
            closeDatasetDetail();
            loadDatasets();
        } else {
            showToast(result.message || 'Failed to delete dataset', 'error');
        }
    } catch (err) {
        showToast('Error deleting dataset', 'error');
    }
}

// Edit Dataset Modal
let editingDatasetId = null;

function openEditDatasetModal(datasetId) {
    let ds = null;
    for (let i = 0; i < allDatasets.length; i++) {
        if (allDatasets[i].id === datasetId) {
            ds = allDatasets[i];
        }
    }
    if (ds == null) return;

    editingDatasetId = datasetId;
    document.getElementById('editDatasetName').value = ds.name || '';
    document.getElementById('editDatasetVersion').value = ds.version || 'v1.0';
    document.getElementById('editDatasetFormat').value = ds.format || '';
    document.getElementById('editDatasetDescription').value = ds.description || '';
    document.getElementById('editDatasetModal').style.display = 'flex';
}

function closeEditDatasetModal() {
    document.getElementById('editDatasetModal').style.display = 'none';
    editingDatasetId = null;
}

async function submitEditDataset() {
    if (editingDatasetId == null) return;

    let name = document.getElementById('editDatasetName').value.trim();
    let version = document.getElementById('editDatasetVersion').value.trim();
    let format = document.getElementById('editDatasetFormat').value.trim();
    let description = document.getElementById('editDatasetDescription').value.trim();

    if (name === '') {
        showToast('Name is required', 'error');
        return;
    }

    try {
        let res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/datasets/${editingDatasetId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, version: version, format: format, description: description, userId: currentUser.id })
        });
        let result = await res.json();

        if (result.success) {
            showToast('Dataset updated', 'success');
            closeEditDatasetModal();
            loadDatasets();
            if (selectedDatasetId === editingDatasetId) {
                selectDataset(editingDatasetId);
            }
        } else {
            showToast(result.message || 'Failed to update', 'error');
        }
    } catch (err) {
        showToast('Error updating dataset', 'error');
    }
}

// ==============================================
// Download dataset files from central server DB
// ==============================================
async function downloadFromServer(datasetId) {
    let ds = null;
    for (let i = 0; i < allDatasets.length; i++) {
        if (allDatasets[i].id === datasetId) {
            ds = allDatasets[i];
        }
    }
    if (ds == null) return;

    // Use Web-Based Directory Picker
    let dirHandle;
    try {
        if (window.showDirectoryPicker) {
            dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        } else {
            showToast('Your browser does not support the native folder picker.', 'error');
            return;
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            showToast('Failed to select directory.', 'error');
        }
        return;
    }

    // Show sync progress modal
    let modal = document.getElementById('syncProgressModal');
    modal.style.display = 'flex';
    document.getElementById('syncDatasetName').textContent = ds.name;
    document.getElementById('syncSourceName').textContent = 'Server';
    document.getElementById('syncDestName').textContent = currentUser.full_name || 'Local';
    document.getElementById('syncTotalSize').textContent = formatFileSize(ds.total_size || 0);

    let progressBar = document.getElementById('syncProgressBar');
    let progressPct = document.getElementById('syncProgressPct');
    progressBar.style.width = '10%';
    progressPct.textContent = '10%';

    // Mark status as SYNCING
    await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/datasets/${datasetId}/sync-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, status: 'SYNCING', progress: 10 })
    });

    try {
        // Step 1: Get list of files from CentralBackend
        let listRes = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/datasets/${datasetId}/files`);
        let listResult = await listRes.json();
        
        if (listResult.success === false || !listResult.files) {
            showToast('Failed to get file list from server.', 'error');
            closeSyncProgressModal();
            return;
        }
        
        let files = listResult.files;
        if (files.length === 0) {
            showToast('No files found in this dataset on the server.', 'error');
            closeSyncProgressModal();
            return;
        }

        let downloadCount = 0;

        // Helper to recursively get file handle
        async function getFileHandleFromPath(baseHandle, path) {
            let parts = path.split('/');
            let currentHandle = baseHandle;
            // Create subdirectories if needed
            for (let i = 0; i < parts.length - 1; i++) {
                if (parts[i].trim() !== '') {
                    currentHandle = await currentHandle.getDirectoryHandle(parts[i], { create: true });
                }
            }
            // Create file handle
            return await currentHandle.getFileHandle(parts[parts.length - 1], { create: true });
        }

        // Step 2: Download each file and save it via File System Access API
        for (let i = 0; i < files.length; i++) {
            let fileInfo = files[i];
            
            // Update progress
            let pct = Math.floor(10 + (80 * i / files.length));
            progressBar.style.width = pct + '%';
            progressPct.textContent = pct + '% (Downloading ' + (i+1) + '/' + files.length + ')';

            // Download from CentralBackend
            let downloadRes = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/datasets/${datasetId}/files/${fileInfo.id}/download`);
            if (downloadRes.ok) {
                let fileBytes = await downloadRes.arrayBuffer();
                
                try {
                    // Save directly via Browser API
                    let fileHandle = await getFileHandleFromPath(dirHandle, fileInfo.file_name);
                    let writable = await fileHandle.createWritable();
                    await writable.write(fileBytes);
                    await writable.close();
                    
                    downloadCount++;
                } catch (writeErr) {
                    console.error("Error writing file", fileInfo.file_name, writeErr);
                }
            }
        }

        progressBar.style.width = '100%';
        progressPct.textContent = '100%';

        if (downloadCount === files.length) {
            // Mark as SYNCHRONIZED
            await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/datasets/${datasetId}/sync-status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: currentUser.id,
                    status: 'SYNCHRONIZED',
                    syncedVersion: ds.version || 'v1.0',
                    progress: 100,
                    localPath: dirHandle.name // Just store the directory name as we can't get absolute path in browser
                })
            });

            let btn = document.getElementById('syncPauseBtn');
            if (btn != null) {
                btn.textContent = 'Done';
                btn.classList.remove('bg-primary-container');
                btn.classList.add('bg-[#10b981]');
            }

            loadDatasets();
            showToast('Dataset downloaded and saved locally!', 'success');
        } else {
            showToast('Downloaded ' + downloadCount + ' out of ' + files.length + ' files.', 'error');
            closeSyncProgressModal();
        }
    } catch (err) {
        console.log('Download error:', err);
        showToast('Error downloading dataset', 'error');
        closeSyncProgressModal();
    }
}

function closeSyncProgressModal() {
    let modal = document.getElementById('syncProgressModal');
    if (modal != null) {
        modal.style.display = 'none';
    }
    let btn = document.getElementById('syncPauseBtn');
    if (btn != null) {
        btn.innerHTML = '<span class="material-symbols-outlined text-[14px]">pause</span> Pause';
        btn.classList.remove('bg-[#10b981]');
        btn.classList.add('bg-primary-container');
    }
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    let units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let k = 1024;
    let i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)) + ' ' + units[i];
}

// Dataset Search
function filterDatasets(query) {
    if (!query) {
        loadDatasets();
        return;
    }
    let q = query.toLowerCase();
    let filtered = [];
    for (let i = 0; i < allDatasets.length; i++) {
        let d = allDatasets[i];
        let nameMatch = d.name.toLowerCase().indexOf(q) >= 0;
        let descMatch = d.description && d.description.toLowerCase().indexOf(q) >= 0;
        let formatMatch = d.format && d.format.toLowerCase().indexOf(q) >= 0;
        if (nameMatch || descMatch || formatMatch) {
            filtered.push(d);
        }
    }
    let original = allDatasets;
    allDatasets = filtered;
    renderDatasetsTable();
    allDatasets = original;
}
