package Backend;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.concurrent.ConcurrentHashMap;

@Component
public class DocumentSyncHandler extends TextWebSocketHandler {

    private final ConcurrentHashMap<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> sessionFiles = new ConcurrentHashMap<>();
    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        sessions.put(session.getId(), session);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        sessions.remove(session.getId());
        sessionFiles.remove(session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        try {
            JsonNode root = mapper.readTree(message.getPayload());
            String type = root.has("type") ? root.get("type").asText() : "";
            
            if ("JOIN".equals(type)) {
                String fileId = root.has("fileId") ? root.get("fileId").asText() : "";
                String clientId = root.has("clientId") ? root.get("clientId").asText() : "";
                sessionFiles.put(session.getId(), fileId);
                
                // Broadcast USER_JOINED to other users so they can send a full sync
                String joinMsg = "{\"type\":\"USER_JOINED\",\"fileId\":\"" + fileId + "\",\"clientId\":\"" + clientId + "\"}";
                for (WebSocketSession s : sessions.values()) {
                    if (s.isOpen() && !s.getId().equals(session.getId())) {
                        String sFileId = sessionFiles.get(s.getId());
                        if (fileId.equals(sFileId)) {
                            s.sendMessage(new TextMessage(joinMsg));
                        }
                    }
                }
            } else if ("CHANGE".equals(type) || "CURSOR".equals(type) || "SYNC_FULL".equals(type)) {
                String fileId = root.has("fileId") ? root.get("fileId").asText() : "";
                
                // Broadcast to all other sessions in the same file

                for (WebSocketSession s : sessions.values()) {
                    if (s.isOpen() && !s.getId().equals(session.getId())) {
                        String sFileId = sessionFiles.get(s.getId());
                        if (fileId.equals(sFileId)) {
                            s.sendMessage(message);
                        }
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("WS Error: " + e.getMessage());
        }
    }
}
