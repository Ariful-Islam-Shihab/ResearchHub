package Backend;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@CrossOrigin("*")
@RequestMapping("/api/member-requests")
public class MemberRequestController {

    @Autowired
    private JdbcTemplate db;

    // Get all pending requests FOR a specific user (invitations they received)
    @GetMapping("/pending")
    public Map<String, Object> getPendingRequests(@RequestParam("userId") int userId) {
        Map<String, Object> response = new HashMap<>();
        try {
            String sql = "SELECT mr.id, mr.project_id, mr.sender_id, mr.receiver_id, mr.role, mr.status, mr.created_at, " +
                         "p.title AS project_title, p.description AS project_description, " +
                         "u.full_name AS sender_name, u.email AS sender_email " +
                         "FROM member_requests mr " +
                         "JOIN projects p ON mr.project_id = p.id " +
                         "JOIN users u ON mr.sender_id = u.id " +
                         "WHERE mr.receiver_id = ? AND mr.status = 'PENDING' " +
                         "ORDER BY mr.created_at DESC";
            List<Map<String, Object>> requests = db.queryForList(sql, userId);
            response.put("success", true);
            response.put("data", requests);
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Error fetching requests: " + e.getMessage());
        }
        return response;
    }


    //Cancel a pending invitation (sender/owner only)

    @DeleteMapping("/{requestId}")
    public Map<String, Object> cancelRequest(@PathVariable int requestId,
                                              @RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            int userId = Integer.parseInt(payload.get("userId").toString());

            // Only the sender can cancel
            List<Map<String, Object>> rows = db.queryForList(
                "SELECT * FROM member_requests WHERE id = ? AND sender_id = ? AND status = 'PENDING'",
                requestId, userId);

            if (rows.isEmpty()) {
                response.put("success", false);
                response.put("message", "Invitation not found or already processed.");
                return response;
            }

            db.update("DELETE FROM member_requests WHERE id = ?", requestId);
            response.put("success", true);
            response.put("message", "Invitation cancelled.");
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Error cancelling invitation: " + e.getMessage());
        }
        return response;
    }


    
    //  Get all requests SENT BY a specific user (invitations they sent)
    @GetMapping("/sent")
    public Map<String, Object> getSentRequests(@RequestParam("userId") int userId) {
        Map<String, Object> response = new HashMap<>();
        try {
            String sql = "SELECT mr.id, mr.project_id, mr.receiver_id, mr.role, mr.status, mr.created_at, " +
                         "p.title AS project_title, " +
                         "u.full_name AS receiver_name, u.email AS receiver_email " +
                         "FROM member_requests mr " +
                         "JOIN projects p ON mr.project_id = p.id " +
                         "JOIN users u ON mr.receiver_id = u.id " +
                         "WHERE mr.sender_id = ? " +
                         "ORDER BY mr.created_at DESC";
            List<Map<String, Object>> requests = db.queryForList(sql, userId);
            response.put("success", true);
            response.put("data", requests);
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Error fetching sent requests: " + e.getMessage());
        }
        return response;
    }

    
    // Accept a member request — adds the user to project_members and updates status
    @PostMapping("/{requestId}/accept")
    public Map<String, Object> acceptRequest(@PathVariable int requestId, @RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            int userId = Integer.parseInt(payload.get("userId").toString());

            // Verify the request belongs to this user and is still PENDING
            List<Map<String, Object>> rows = db.queryForList(
                "SELECT * FROM member_requests WHERE id = ? AND receiver_id = ? AND status = 'PENDING'",
                requestId, userId);

            if (rows.isEmpty()) {
                response.put("success", false);
                response.put("message", "Request not found or already processed.");
                return response;
            }

            Map<String, Object> request = rows.get(0);
            int projectId = (int) request.get("project_id");
            String role = (String) request.get("role");

            // Add to project_members and mark request as ACCEPTED
            this.updateIndividualEntry(projectId, userId, role, requestId, "ACCEPTED");

            response.put("success", true);
            response.put("message", "You have joined the project.");
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Error accepting request: " + e.getMessage());
        }
        return response;
    }

    
    // Decline a member request
    
    @PostMapping("/{requestId}/decline")
    public Map<String, Object> declineRequest(@PathVariable int requestId, @RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            int userId = Integer.parseInt(payload.get("userId").toString());

            // Verify the request belongs to this user before declining
            List<Map<String, Object>> rows = db.queryForList(
                "SELECT * FROM member_requests WHERE id = ? AND receiver_id = ? AND status = 'PENDING'",
                requestId, userId);

            if (rows.isEmpty()) {
                response.put("success", false);
                response.put("message", "Request not found or already processed.");
            } else {
                this.updateIndividualEntry(0, 0, null, requestId, "DECLINED");
                response.put("success", true);
                response.put("message", "Request declined.");
            }
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Error declining request: " + e.getMessage());
        }
        return response;
    }

    
    // checks for any ACCEPTED requests not yet in project_members
    
    private void updates() {
        String query = "SELECT * FROM member_requests WHERE status = 'ACCEPTED'";
        List<Map<String, Object>> req = db.queryForList(query);
        for (Map<String, Object> r : req) {
            List<Map<String, Object>> existing = db.queryForList(
                "SELECT * FROM project_members WHERE project_id = ? AND user_id = ?",
                r.get("project_id"), r.get("receiver_id"));
            if (existing.isEmpty()) {
                db.update("INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)",
                          r.get("project_id"), r.get("receiver_id"), r.get("role"));
            }
        }
    }


    //Updates a single member request entry.

    private void updateIndividualEntry(int projectId, int userId, String role, int requestId, String status) {
        if (status.equals("ACCEPTED")) {
            db.update("INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)",
                      projectId, userId, role);
        }
        db.update("UPDATE member_requests SET status = ?, updated_at = NOW() WHERE id = ?", status, requestId);
    }
}
