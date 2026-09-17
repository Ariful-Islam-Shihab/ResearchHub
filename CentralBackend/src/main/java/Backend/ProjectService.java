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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@CrossOrigin("*")
@RequestMapping("/api/projects")
public class ProjectService {

    @Autowired
    private JdbcTemplate db;

    // GET all projects for a user
    @GetMapping
    public Map<String, Object> getUserProjects(@RequestParam("userId") int userId) {
        Map<String, Object> response = new HashMap<>();
        try {
            String query = "SELECT DISTINCT p.id, p.title, p.description, p.domain, p.owner_id, p.created_at, p.updated_at, "
                    + "CASE WHEN uap.project_id IS NOT NULL THEN 'ARCHIVED' ELSE p.status END AS status "
                    + "FROM projects p "
                    + "LEFT JOIN project_members pm ON p.id = pm.project_id "
                    + "LEFT JOIN user_archived_projects uap ON p.id = uap.project_id AND uap.user_id = ? "
                    + "WHERE p.owner_id = ? OR pm.user_id = ? "
                    + "ORDER BY p.updated_at DESC";
            List<Map<String, Object>> projects = db.queryForList(query, userId, userId, userId);
            response.put("success", true);
            response.put("data", projects);
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    // GET single project by ID
    @GetMapping("/{id}")
    public Map<String, Object> getProject(@PathVariable int id) {
        Map<String, Object> response = new HashMap<>();
        try {
            String query = "SELECT p.*, u.full_name AS owner_name, u.email AS owner_email "
                    + "FROM projects p JOIN users u ON p.owner_id = u.id "
                    + "WHERE p.id = ?";
            List<Map<String, Object>> rows = db.queryForList(query, id);
            if (rows.isEmpty()) {
                response.put("success", false);
                response.put("message", "Project not found");
            } else {
                response.put("success", true);
                response.put("data", rows.get(0));
            }
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    // GET project members
    @GetMapping("/{id}/members")
    public Map<String, Object> getProjectMembers(@PathVariable int id) {
        Map<String, Object> response = new HashMap<>();
        try {
            String query = "SELECT pm.project_id, pm.user_id, pm.role, pm.joined_at, "
                    + "u.full_name, u.email "
                    + "FROM project_members pm "
                    + "JOIN users u ON pm.user_id = u.id "
                    + "WHERE pm.project_id = ? "
                    + "ORDER BY pm.joined_at ASC";
            List<Map<String, Object>> members = db.queryForList(query, id);
            response.put("success", true);
            response.put("data", members);
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    // 
    @PostMapping("/{id}/invite")
    public Map<String, Object> inviteMember(@PathVariable int id,
            @RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            int senderId = Integer.parseInt(payload.get("senderId").toString());
            int receiverId = Integer.parseInt(payload.get("receiverId").toString());
            String role = payload.getOrDefault("role", "teammate").toString();

            // Verify sender is the owner
            List<Map<String, Object>> ownerCheck = db.queryForList(
                    "SELECT id FROM projects WHERE id = ? AND owner_id = ?", id, senderId);
            if (ownerCheck.isEmpty()) {
                response.put("success", false);
                response.put("message", "Only the project owner can invite members.");
                return response;
            }

            // Check the user is not already a member
            List<Map<String, Object>> memberCheck = db.queryForList(
                    "SELECT * FROM project_members WHERE project_id = ? AND user_id = ?", id, receiverId);
            if (!memberCheck.isEmpty()) {
                response.put("success", false);
                response.put("message", "User is already a member of this project.");
                return response;
            }

            // Check no pending invite already exists
            List<Map<String, Object>> pendingCheck = db.queryForList(
                    "SELECT * FROM member_requests WHERE project_id = ? AND receiver_id = ? AND status = 'PENDING'",
                    id, receiverId);
            if (!pendingCheck.isEmpty()) {
                response.put("success", false);
                response.put("message", "An invitation is already pending for this user.");
                return response;
            }

            db.update("INSERT INTO member_requests (project_id, sender_id, receiver_id, role, status) "
                    + "VALUES (?, ?, ?, ?, 'PENDING')", id, senderId, receiverId, role);

            response.put("success", true);
            response.put("message", "Invitation sent successfully.");
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    //DELETE remove a member from the project 
    @DeleteMapping("/{id}/members/{userId}")
    public Map<String, Object> removeMember(@PathVariable int id,
            @PathVariable int userId,
            @RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            int requesterId = Integer.parseInt(payload.get("requesterId").toString());

            // Only owner can remove members
            List<Map<String, Object>> ownerCheck = db.queryForList(
                    "SELECT id FROM projects WHERE id = ? AND owner_id = ?", id, requesterId);
            if (ownerCheck.isEmpty()) {
                response.put("success", false);
                response.put("message", "Only the project owner can remove members.");
                return response;
            }

            // Cannot remove yourself (owner)
            if (userId == requesterId) {
                response.put("success", false);
                response.put("message", "You cannot remove yourself from the project.");
                return response;
            }

            db.update("DELETE FROM project_members WHERE project_id = ? AND user_id = ?", id, userId);
            response.put("success", true);
            response.put("message", "Member removed successfully.");
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    // create project
    @PostMapping
    @SuppressWarnings("unchecked")
    public Map<String, Object> createProject(@RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            int userId = Integer.parseInt(payload.get("userId").toString());
            String title = (String) payload.get("title");
            String description = (String) payload.get("description");
            String domain = (String) payload.getOrDefault("domain", "General");

            // 1. Create the project
            db.update("INSERT INTO projects (owner_id, title, description, domain, status, created_at, updated_at) "
                    + "VALUES (?, ?, ?, ?, 'ACTIVE', NOW(), NOW())", userId, title, description, domain);

            // Get the auto-generated project ID
            int projectId = db.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);

            // 2. Add the owner as a member with role 'owner'
            db.update("INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'owner')",
                    projectId, userId);

            // 3. Send member requests to invited team members
            List<Map<String, Object>> team = (List<Map<String, Object>>) payload.get("team");
            if (team != null && !team.isEmpty()) {
                sendRequests(team, projectId, userId);
            }

            response.put("success", true);
            response.put("message", "Project created successfully");
            response.put("projectId", projectId);
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    private void sendRequests(List<Map<String, Object>> team, int projectId, int senderId) {
        for (Map<String, Object> member : team) {
            int memberId = Integer.parseInt(member.get("id").toString());
            String role = (String) member.getOrDefault("role", "teammate");
            db.update("INSERT INTO member_requests (project_id, sender_id, receiver_id, role, status) "
                    + "VALUES (?, ?, ?, ?, 'PENDING')", projectId, senderId, memberId, role);
        }
    }

    // DELETE project
    @DeleteMapping("/{id}")
    public Map<String, Object> deleteProject(@PathVariable int id, @RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            int requesterId = Integer.parseInt(payload.get("requesterId").toString());

            // Check if user is the owner
            List<Map<String, Object>> ownerCheck = db.queryForList(
                    "SELECT id FROM projects WHERE id = ? AND owner_id = ?", id, requesterId);
            if (ownerCheck.isEmpty()) {
                response.put("success", false);
                response.put("message", "Only the project owner can delete this project.");
                return response;
            }

            // Delete associated records first
            db.update("DELETE FROM tasks WHERE project_id = ?", id);
            db.update("DELETE FROM discussion_messages WHERE project_id = ?", id);
            db.update("DELETE FROM member_requests WHERE project_id = ?", id);
            db.update("DELETE FROM project_members WHERE project_id = ?", id);

            // Delete the project
            db.update("DELETE FROM projects WHERE id = ?", id);

            response.put("success", true);
            response.put("message", "Project deleted successfully.");
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    // UPDATE project
    @PutMapping("/{id}")
    public Map<String, Object> updateProject(@PathVariable int id, @RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            if (!payload.containsKey("userId")) {
                response.put("success", false);
                response.put("message", "User ID is required to verify ownership");
                return response;
            }
            int userId = Integer.parseInt(payload.get("userId").toString());
            String title = payload.getOrDefault("title", "").toString();
            String description = payload.getOrDefault("description", "").toString();
            String domain = payload.getOrDefault("domain", "").toString();

            // Verify owner
            List<Map<String, Object>> ownerCheck = db.queryForList("SELECT id FROM projects WHERE id = ? AND owner_id = ?", id, userId);
            if (ownerCheck.isEmpty()) {
                response.put("success", false);
                response.put("message", "Only the project owner can edit the project details.");
                return response;
            }

            int rowsUpdated = db.update("UPDATE projects SET title = ?, description = ?, domain = ? WHERE id = ?", title, description, domain, id);
            
            if (rowsUpdated > 0) {
                response.put("success", true);
                response.put("message", "Project updated successfully.");
            } else {
                response.put("success", false);
                response.put("message", "Failed to update project.");
            }
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    // ARCHIVE project
    @PutMapping("/{id}/archive")
    public Map<String, Object> archiveProject(@PathVariable int id, @RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            if (!payload.containsKey("userId")) {
                response.put("success", false);
                response.put("message", "User ID is required to archive project");
                return response;
            }
            int userId = Integer.parseInt(payload.get("userId").toString());
            
            // Insert ignore equivalent using a check first, or try to insert and catch duplicate
            List<Map<String, Object>> check = db.queryForList(
                "SELECT * FROM user_archived_projects WHERE user_id = ? AND project_id = ?", userId, id);
            
            int rowsUpdated = 0;
            if (check.isEmpty()) {
                rowsUpdated = db.update("INSERT INTO user_archived_projects (user_id, project_id) VALUES (?, ?)", userId, id);
            } else {
                rowsUpdated = 1; // Already archived
            }
            
            if (rowsUpdated > 0) {
                response.put("success", true);
                response.put("message", "Project archived successfully.");
            } else {
                response.put("success", false);
                response.put("message", "Project not found.");
            }
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    // UNARCHIVE project
    @PutMapping("/{id}/unarchive")
    public Map<String, Object> unarchiveProject(@PathVariable int id, @RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            if (!payload.containsKey("userId")) {
                response.put("success", false);
                response.put("message", "User ID is required to unarchive project");
                return response;
            }
            int userId = Integer.parseInt(payload.get("userId").toString());
            
            int rowsUpdated = db.update("DELETE FROM user_archived_projects WHERE user_id = ? AND project_id = ?", userId, id);
            
            if (rowsUpdated > 0) {
                response.put("success", true);
                response.put("message", "Project unarchived successfully.");
            } else {
                response.put("success", false);
                response.put("message", "Project was not archived.");
            }
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

}
