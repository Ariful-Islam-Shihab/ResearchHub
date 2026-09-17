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

// Check for new messages from the LocalBackend
async function pollForMessages() {
    try {
        let response = await fetch(`${API_CONFIG.BASE_URL}/local/chat/poll`);
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
        await fetch(`${API_CONFIG.BASE_URL}/local/chat/send`, {
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
}

document.addEventListener('DOMContentLoaded', function() {
    if (typeof API_CONFIG !== 'undefined') {
        connectWebSocket();
    }
});
