let chatSocket = null;

function connectWebSocket() {
    console.log('Starting native WebSocket to LocalBackend...');
    
    // Use the raw socket server port (Spring port + 6000)
    let port = parseInt(window.location.port);
    if (!port || isNaN(port) || port === 5500) {
        port = 3000;
    }
    let wsPort = port + 6000;
    
    chatSocket = new WebSocket(`${wsProtocol}//localhost:${wsPort}/chat`);

    chatSocket.onopen = function() {
        console.log('WebSocket connected!');
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
    };

    chatSocket.onmessage = function(event) {
        try {
            let msgObj = JSON.parse(event.data);
            handleWebSocketMessage(msgObj);
        } catch (e) {
            console.log("Could not parse message: " + event.data);
        }
    };

    chatSocket.onclose = function() {
        console.log('WebSocket disconnected. Reconnecting in 5s...');
        setTimeout(connectWebSocket, 5000);
    };
}

// Send a message to the LocalBackend
async function sendWebSocketMessage(data) {
    if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
        chatSocket.send(JSON.stringify(data));
    } else {
        console.log("WebSocket is not open. Cannot send message.");
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
