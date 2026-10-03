package Backend;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@CrossOrigin("*")
@RequestMapping("/api/projects/{projectId}/discussions")
public class DiscussionService {

    @Autowired
    private JdbcTemplate db;

    @Autowired
    private ChatServer chatServer;

    // GET all messages for a project
    @GetMapping
    public Map<String, Object> getMessages(@PathVariable int projectId) {
        Map<String, Object> response = new HashMap<>();
        try {
            String query = "SELECT dm.id, dm.project_id, dm.user_id, dm.message, dm.created_at, "
                    + "u.full_name, u.email, COALESCE(pm.role, 'member') AS role "
                    + "FROM discussion_messages dm "
                    + "JOIN users u ON dm.user_id = u.id "
                    + "LEFT JOIN project_members pm ON pm.project_id = dm.project_id AND pm.user_id = dm.user_id "
                    + "WHERE dm.project_id = ? "
                    + "ORDER BY dm.created_at ASC";
            List<Map<String, Object>> messages = db.queryForList(query, projectId);
            response.put("success", true);
            response.put("data", messages);
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    // POST a new message
    @PostMapping
    public Map<String, Object> postMessage(@PathVariable int projectId,
            @RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            int userId = Integer.parseInt(payload.get("userId").toString());
            String message = payload.get("message").toString().trim();

            if (message.isEmpty()) {
                response.put("success", false);
                response.put("message", "Message cannot be empty.");
                return response;
            }

            // Verify user is a member of the project
            List<Map<String, Object>> memberCheck = db.queryForList(
                    "SELECT user_id FROM project_members WHERE project_id = ? AND user_id = ?",
                    projectId, userId);
            if (memberCheck.isEmpty()) {
                response.put("success", false);
                response.put("message", "You must be a member of this project to post messages.");
                return response;
            }

            // Insert the message
            db.update("INSERT INTO discussion_messages (project_id, user_id, message) VALUES (?, ?, ?)",
                    projectId, userId, message);

            // Fetch the inserted message with user details
            int messageId = db.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
            List<Map<String, Object>> inserted = db.queryForList(
                    "SELECT dm.id, dm.project_id, dm.user_id, dm.message, dm.created_at, "
                            + "u.full_name, u.email, COALESCE(pm.role, 'member') AS role "
                            + "FROM discussion_messages dm "
                            + "JOIN users u ON dm.user_id = u.id "
                            + "LEFT JOIN project_members pm ON pm.project_id = dm.project_id AND pm.user_id = dm.user_id "
                            + "WHERE dm.id = ?",
                    messageId);

            Map<String, Object> newMessage = inserted.get(0);

            // Broadcast via WebSocket using simple JSON
            try {
                String escapedMsg = message.replace("\\", "\\\\").replace("\"", "\\\"");
                String fullName = newMessage.get("full_name").toString().replace("\\", "\\\\").replace("\"", "\\\"");
                String email = newMessage.get("email").toString().replace("\\", "\\\\").replace("\"", "\\\"");
                String createdAt = newMessage.get("created_at").toString();
                String role = newMessage.get("role").toString();

                String json = "{\"type\":\"NEW_MESSAGE\",\"projectId\":" + projectId
                        + ",\"data\":{\"id\":" + messageId
                        + ",\"project_id\":" + projectId
                        + ",\"user_id\":" + userId
                        + ",\"message\":\"" + escapedMsg + "\""
                        + ",\"full_name\":\"" + fullName + "\""
                        + ",\"email\":\"" + email + "\""
                        + ",\"role\":\"" + role + "\""
                        + ",\"created_at\":\"" + createdAt + "\""
                        + "}}";
                chatServer.broadcastMessage(json, null, String.valueOf(projectId));
            } catch (Exception wsErr) {
                System.err.println("WebSocket broadcast error: " + wsErr.getMessage());
            }

            response.put("success", true);
            response.put("data", newMessage);
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }
}
