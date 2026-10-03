let chatPollTimer = null;

function connectWebSocket() {
    // We are no longer using WebSockets!
    // Instead we will "poll" the local backend every 2 seconds.
    console.log('Starting chat polling to LocalBackend...');
    
    // Send an AUTH message right away so the server knows who we are
    if (currentUser != null) {
        let myId = currentUser.id;
        let myProjectId = null;
        if (typeof projectId !== 'undefined') {
            myProjectId = projectId;
        }
        
        sendWebSocketMessage({
            type: 'AUTH',
            userId: myId,
            projectId: myProjectId
        });
    }

    // Start polling every 2 seconds
    if (chatPollTimer != null) {
        clearInterval(chatPollTimer);
    }
    chatPollTimer = setInterval(pollForMessages, 2000);
}

// Update the current project ID for the chat session
function updateChatProject(id) {
    if (currentUser != null) {
        sendWebSocketMessage({
            type: 'AUTH',
            userId: currentUser.id,
            projectId: id
        });
    }
}

// Check for new messages from the LocalBackend
async function pollForMessages() {
    try {
        let localBaseUrl = API_CONFIG.getLocalBaseUrl();
        let response = await fetch(`${localBaseUrl}/chat/poll`);
        let data = await response.json();
        
        if (data.success && data.messages.length > 0) {
            for (let i = 0; i < data.messages.length; i++) {
                try {
                    let msgObj = JSON.parse(data.messages[i]);
                    handleWebSocketMessage(msgObj);
                } catch (e) {
                    console.log("Could not parse message: " + data.messages[i]);
                }
            }
        }
    } catch (e) {
        // LocalBackend might be offline
    }
}

// Send a message to the LocalBackend
async function sendWebSocketMessage(data) {
    try {
        let jsonString = JSON.stringify(data);
        let localBaseUrl = API_CONFIG.getLocalBaseUrl();
        await fetch(`${localBaseUrl}/chat/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: jsonString })
        });
    } catch (e) {
        console.log("Could not send message to local backend");
    }
}

// Handle all messages globally here instead of CustomEvents
function handleWebSocketMessage(data) {
    console.log('Event received: ' + data.type);
    
    if (data.type === 'PROJECT_UPDATED') {
        if (typeof loadProject === 'function' && typeof projectId !== 'undefined') {
            if (data.projectId == projectId) {
                loadProject();
            }
        }
        if (typeof renderProjects === 'function' && typeof loadProjects === 'function') {
            loadProjects();
        }
    }

    if (data.type === 'NEW_MESSAGE') {
        if (typeof handleNewMessage === 'function') {
            handleNewMessage(data);
        }
    }

    // ─── File Events (LaTeX Workspace) ───────────────────────────────────
    if (data.type === 'FILE_CREATED') {
        if (typeof loadFileTree === 'function' && typeof projectId !== 'undefined' && data.projectId == projectId) {
            loadFileTree();
            if (typeof showToast === 'function' && data.userId != currentUser?.id) {
                showToast('New file created: ' + data.fileName, 'info');
            }
        }
    }

    if (data.type === 'FILE_CHANGED') {
        if (typeof projectId !== 'undefined' && data.projectId == projectId) {
            // Skip if we are the one who made the change
            if (data.userId != currentUser?.id) {
                // Check if the file is open in our editor
                if (typeof openFiles !== 'undefined') {
                    const openFile = openFiles.find(f => f.id === data.fileId);
                    if (openFile) {
                        // Skip if it's the currently active file being real-time synced
                        if (typeof activeFileId !== 'undefined' && data.fileId == activeFileId) {
                            // Already syncing via docSyncWs
                        } else if (openFile.isDirty) {
                            // User has unsaved changes — mark as conflicted
                            openFile._hasConflict = true;
                            if (typeof renderFileTabs === 'function') renderFileTabs();
                            if (typeof showToast === 'function') {
                                showToast(data.fileName + ' was modified by another user.', 'warning');
                            }
                        } else {
                            // No local changes — reload content silently
                            reloadFileFromServer(data.fileId);
                        }
                    }
                }
                if (typeof loadFileTree === 'function') loadFileTree();
            }
        }
    }

    if (data.type === 'FILE_DELETED') {
        if (typeof projectId !== 'undefined' && data.projectId == projectId) {
            if (typeof openFiles !== 'undefined') {
                // Close the tab if the file was open
                const idx = openFiles.findIndex(f => f.id === data.fileId);
                if (idx >= 0) {
                    openFiles.splice(idx, 1);
                    if (typeof activeFileId !== 'undefined' && activeFileId === data.fileId) {
                        activeFileId = openFiles.length > 0 ? openFiles[openFiles.length - 1].id : null;
                        if (activeFileId && typeof setActiveFile === 'function') setActiveFile(activeFileId);
                        else if (typeof clearEditor === 'function') clearEditor();
                    }
                    if (typeof renderFileTabs === 'function') renderFileTabs();
                }
            }
            if (typeof loadFileTree === 'function') loadFileTree();
            if (data.userId != currentUser?.id && typeof showToast === 'function') {
                showToast(data.fileName + ' was deleted', 'info');
            }
        }
    }

    if (data.type === 'FILE_RENAMED') {
        if (typeof projectId !== 'undefined' && data.projectId == projectId) {
            if (typeof openFiles !== 'undefined') {
                const openFile = openFiles.find(f => f.id === data.fileId);
                if (openFile) {
                    openFile.name = data.newName;
                    if (typeof renderFileTabs === 'function') renderFileTabs();
                }
            }
            if (typeof loadFileTree === 'function') loadFileTree();
            if (data.userId != currentUser?.id && typeof showToast === 'function') {
                showToast(data.oldName + ' renamed to ' + data.newName, 'info');
            }
        }
    }
}

// Helper: reload a file from the server (for real-time updates)
async function reloadFileFromServer(fileId) {
    try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/projects/${projectId}/files/${fileId}`);
        const result = await res.json();
        if (result.success && typeof openFiles !== 'undefined') {
            const file = openFiles.find(f => f.id === fileId);
            if (file) {
                file.content = result.data.content || '';
                file.version = result.data.version;
                file.isDirty = false;
                if (typeof activeFileId !== 'undefined' && activeFileId === fileId && typeof setEditorContent === 'function') {
                    setEditorContent(file.content, file.name);
                }
                if (typeof renderFileTabs === 'function') renderFileTabs();
            }
        }
    } catch (err) {
        console.error('Failed to reload file from server:', err);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    if (typeof API_CONFIG !== 'undefined') {
        connectWebSocket();
    }
});
