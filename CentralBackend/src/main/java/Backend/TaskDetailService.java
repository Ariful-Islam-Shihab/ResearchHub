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
import org.springframework.web.bind.annotation.RestController;

@RestController
@CrossOrigin("*")
@RequestMapping("/api/projects/{projectId}/tasks/{taskId}")
public class TaskDetailService {

    @Autowired
    private JdbcTemplate db;

    // GET task details including subtasks and updates
    @GetMapping("/details")
    public Map<String, Object> getTaskDetails(@PathVariable int projectId, @PathVariable int taskId) {
        Map<String, Object> response = new HashMap<>();
        try {
            // Verify task belongs to project
            List<Map<String, Object>> task = db.queryForList(
                    "SELECT t.*, creator.full_name AS created_by_name, assignee.full_name AS assigned_to_name "
                            + "FROM tasks t "
                            + "JOIN users creator ON t.created_by = creator.id "
                            + "LEFT JOIN users assignee ON t.assigned_to = assignee.id "
                            + "WHERE t.id = ? AND t.project_id = ?", taskId, projectId);

            if (task.isEmpty()) {
                response.put("success", false);
                response.put("message", "Task not found.");
                return response;
            }

            // Get subtasks
            List<Map<String, Object>> subtasks = db.queryForList(
                    "SELECT * FROM task_subtasks WHERE task_id = ? ORDER BY id ASC", taskId);

            // Get updates
            List<Map<String, Object>> updates = db.queryForList(
                    "SELECT u.*, user.full_name AS user_name "
                            + "FROM task_updates u "
                            + "JOIN users user ON u.user_id = user.id "
                            + "WHERE u.task_id = ? ORDER BY u.created_at ASC", taskId);

            Map<String, Object> data = new HashMap<>(task.get(0));
            data.put("subtasks", subtasks);
            data.put("updates", updates);

            response.put("success", true);
            response.put("data", data);
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    // POST create a subtask
    @PostMapping("/subtasks")
    public Map<String, Object> createSubtask(@PathVariable int projectId, @PathVariable int taskId,
            @RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            String title = payload.get("title").toString().trim();
            if (title.isEmpty()) {
                response.put("success", false);
                response.put("message", "Subtask title is required.");
                return response;
            }

            db.update("INSERT INTO task_subtasks (task_id, title) VALUES (?, ?)", taskId, title);
            int subtaskId = db.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
            
            List<Map<String, Object>> subtask = db.queryForList("SELECT * FROM task_subtasks WHERE id = ?", subtaskId);
            
            response.put("success", true);
            response.put("data", subtask.get(0));
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    // PUT update a subtask
    @PutMapping("/subtasks/{subtaskId}")
    public Map<String, Object> updateSubtask(@PathVariable int projectId, @PathVariable int taskId,
            @PathVariable int subtaskId, @RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            if (payload.containsKey("is_completed")) {
                boolean isCompleted = Boolean.parseBoolean(payload.get("is_completed").toString());
                db.update("UPDATE task_subtasks SET is_completed = ? WHERE id = ? AND task_id = ?", 
                        isCompleted, subtaskId, taskId);
            }
            if (payload.containsKey("title")) {
                String title = payload.get("title").toString().trim();
                db.update("UPDATE task_subtasks SET title = ? WHERE id = ? AND task_id = ?", 
                        title, subtaskId, taskId);
            }
            response.put("success", true);
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    // DELETE a subtask
    @DeleteMapping("/subtasks/{subtaskId}")
    public Map<String, Object> deleteSubtask(@PathVariable int projectId, @PathVariable int taskId,
            @PathVariable int subtaskId) {
        Map<String, Object> response = new HashMap<>();
        try {
            db.update("DELETE FROM task_subtasks WHERE id = ? AND task_id = ?", subtaskId, taskId);
            response.put("success", true);
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    // POST create an update
    @PostMapping("/updates")
    public Map<String, Object> createUpdate(@PathVariable int projectId, @PathVariable int taskId,
            @RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            int userId = Integer.parseInt(payload.get("userId").toString());
            String message = payload.containsKey("message") ? payload.get("message").toString().trim() : null;
            String statusChange = payload.containsKey("statusChange") ? payload.get("statusChange").toString() : null;

            if ((message == null || message.isEmpty()) && (statusChange == null || statusChange.isEmpty())) {
                response.put("success", false);
                response.put("message", "Message or status change is required.");
                return response;
            }

            db.update("INSERT INTO task_updates (task_id, user_id, message, status_change) VALUES (?, ?, ?, ?)",
                    taskId, userId, message, statusChange);
            
            // If there's a status change, update the main task as well
            if (statusChange != null && !statusChange.isEmpty()) {
                db.update("UPDATE tasks SET status = ? WHERE id = ?", statusChange, taskId);
            }

            int updateId = db.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
            List<Map<String, Object>> update = db.queryForList(
                    "SELECT u.*, user.full_name AS user_name "
                            + "FROM task_updates u "
                            + "JOIN users user ON u.user_id = user.id "
                            + "WHERE u.id = ?", updateId);

            response.put("success", true);
            response.put("data", update.get(0));
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }
}
