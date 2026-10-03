let currentPickerPath = null;
let currentPickerParent = null;

function initDirPicker(inputElementId) {
    const modal = document.getElementById('dirPickerModal');
    const closeBtn = document.getElementById('closeDirPickerBtn');
    const cancelBtn = document.getElementById('cancelDirPickerBtn');
    const selectBtn = document.getElementById('selectDirPickerBtn');
    const upBtn = document.getElementById('dirPickerUpBtn');
    const list = document.getElementById('dirPickerList');
    const pathDisplay = document.getElementById('dirPickerCurrentPath');

    if (!modal) return;

    function hideModal() {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    function showModal() {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        loadDirectory(null);
    }

    async function loadDirectory(path) {
        list.innerHTML = '<div class="p-4 text-center text-on-surface-variant">Loading...</div>';
        try {
            const response = await fetch('/local/datasets/list-directories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: path || '' })
            });
            const data = await response.json();
            
            if (data.success) {
                currentPickerPath = path;
                currentPickerParent = data.parentPath;
                pathDisplay.textContent = path || 'This PC';
                upBtn.disabled = !path;
                if (!path) {
                    upBtn.classList.add('opacity-50', 'cursor-not-allowed');
                } else {
                    upBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                }

                list.innerHTML = '';
                data.folders.forEach(folder => {
                    const btn = document.createElement('button');
                    btn.className = 'w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-surface-container-high rounded text-on-surface font-body-base transition-colors';
                    
                    const icon = document.createElement('span');
                    icon.className = 'material-symbols-outlined text-primary text-[20px]';
                    icon.textContent = !path ? 'hard_drive' : 'folder';
                    
                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'truncate';
                    nameSpan.textContent = folder.name;
                    
                    btn.appendChild(icon);
                    btn.appendChild(nameSpan);
                    
                    btn.onclick = () => loadDirectory(folder.path);
                    list.appendChild(btn);
                });
                
                if (data.folders.length === 0) {
                    list.innerHTML = '<div class="p-4 text-center text-on-surface-variant italic">No folders here</div>';
                }
            } else {
                list.innerHTML = `<div class="p-4 text-center text-error">Error: ${data.message}</div>`;
            }
        } catch (e) {
            list.innerHTML = '<div class="p-4 text-center text-error">Network error loading directory</div>';
        }
    }

    closeBtn.onclick = hideModal;
    cancelBtn.onclick = hideModal;
    
    upBtn.onclick = () => {
        if (currentPickerParent !== null) {
            loadDirectory(currentPickerParent);
        }
    };

    selectBtn.onclick = () => {
        if (currentPickerPath) {
            document.getElementById(inputElementId).value = currentPickerPath;
        }
        hideModal();
    };

    const browseBtn = document.getElementById('browseSyncPathBtn');
    if (browseBtn) {
        // Remove existing listeners by replacing element (or just overriding if we used onclick)
        // Since it was added via addEventListener, it's safer to clone it to strip old listeners
        const newBrowseBtn = browseBtn.cloneNode(true);
        browseBtn.parentNode.replaceChild(newBrowseBtn, browseBtn);
        newBrowseBtn.addEventListener('click', showModal);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // If the modal exists, initialize it
    initDirPicker('localSyncPathInput');
});
