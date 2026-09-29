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
@RequestMapping("/api/projects/{projectId}/tasks")
public class TaskService {

    @Autowired
    private JdbcTemplate db;

    // GET all tasks for a project
    @GetMapping
    public Map<String, Object> getTasks(@PathVariable int projectId) {
        Map<String, Object> response = new HashMap<>();
        try {
            String query = "SELECT t.*, "
                    + "creator.full_name AS created_by_name, "
                    + "assignee.full_name AS assigned_to_name "
                    + "FROM tasks t "
                    + "JOIN users creator ON t.created_by = creator.id "
                    + "LEFT JOIN users assignee ON t.assigned_to = assignee.id "
                    + "WHERE t.project_id = ? "
                    + "ORDER BY FIELD(t.priority, 'urgent','high','medium','low'), t.created_at DESC";
            List<Map<String, Object>> tasks = db.queryForList(query, projectId);
            response.put("success", true);
            response.put("data", tasks);
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    // POST create a new task
    @PostMapping
    public Map<String, Object> createTask(@PathVariable int projectId,
            @RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            String title = payload.get("title").toString().trim();
            String description = payload.containsKey("description") && payload.get("description") != null
                    ? payload.get("description").toString().trim() : "";
            String priority = payload.containsKey("priority") && payload.get("priority") != null
                    ? payload.get("priority").toString() : "medium";
            String status = payload.containsKey("status") && payload.get("status") != null
                    ? payload.get("status").toString() : "todo";
            int createdBy = Integer.parseInt(payload.get("createdBy").toString());

            Integer assignedTo = null;
            if (payload.containsKey("assignedTo") && payload.get("assignedTo") != null
                    && !payload.get("assignedTo").toString().isEmpty()) {
                assignedTo = Integer.parseInt(payload.get("assignedTo").toString());
            }

            if (assignedTo == null) {
                response.put("success", false);
                response.put("message", "Task must be assigned upon creation.");
                return response;
            }

            String dueDate = null;
            if (payload.containsKey("dueDate") && payload.get("dueDate") != null
                    && !payload.get("dueDate").toString().isEmpty()) {
                dueDate = payload.get("dueDate").toString();
            }

            if (title.isEmpty()) {
                response.put("success", false);
                response.put("message", "Task title is required.");
                return response;
            }

            if (dueDate != null) {
                db.update("INSERT INTO tasks (project_id, title, description, status, priority, assigned_to, created_by, due_date) VALUES (?,?,?,?,?,?,?,?)",
                        projectId, title, description, status, priority, assignedTo, createdBy, dueDate);
            } else {
                db.update("INSERT INTO tasks (project_id, title, description, status, priority, assigned_to, created_by) VALUES (?,?,?,?,?,?,?)",
                        projectId, title, description, status, priority, assignedTo, createdBy);
            }

            int taskId = db.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
            List<Map<String, Object>> inserted = db.queryForList(
                    "SELECT t.*, creator.full_name AS created_by_name, assignee.full_name AS assigned_to_name "
                            + "FROM tasks t "
                            + "JOIN users creator ON t.created_by = creator.id "
                            + "LEFT JOIN users assignee ON t.assigned_to = assignee.id "
                            + "WHERE t.id = ?", taskId);

            response.put("success", true);
            response.put("data", inserted.get(0));
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    // PUT update a task (status, priority, assignee, etc.)
    @PutMapping("/{taskId}")
    public Map<String, Object> updateTask(@PathVariable int projectId, @PathVariable int taskId,
            @RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            // Build dynamic SET clause
            StringBuilder setClauses = new StringBuilder();
            java.util.ArrayList<Object> params = new java.util.ArrayList<>();

            if (payload.containsKey("title")) {
                setClauses.append("title = ?, ");
                params.add(payload.get("title").toString().trim());
            }
            if (payload.containsKey("description")) {
                setClauses.append("description = ?, ");
                params.add(payload.get("description") != null ? payload.get("description").toString().trim() : "");
            }
            if (payload.containsKey("status")) {
                List<Map<String, Object>> existingTask = db.queryForList("SELECT assigned_to FROM tasks WHERE id = ?", taskId);
                if (existingTask.isEmpty()) {
                    response.put("success", false);
                    response.put("message", "Task not found.");
                    return response;
                }
                
                Object assignedToObj = existingTask.get(0).get("assigned_to");
                Integer assignedTo = assignedToObj != null ? ((Number) assignedToObj).intValue() : null;
                
                Object updaterIdObj = payload.get("updaterId");
                Integer updaterId = updaterIdObj != null ? Integer.parseInt(updaterIdObj.toString()) : null;

                if (assignedTo == null || !assignedTo.equals(updaterId)) {
                    response.put("success", false);
                    response.put("message", "Only the assigned individual can change the task status.");
                    return response;
                }

                setClauses.append("status = ?, ");
                params.add(payload.get("status").toString());
            }
            if (payload.containsKey("priority")) {
                setClauses.append("priority = ?, ");
                params.add(payload.get("priority").toString());
            }
            if (payload.containsKey("assignedTo")) {
                setClauses.append("assigned_to = ?, ");
                Object val = payload.get("assignedTo");
                params.add(val != null && !val.toString().isEmpty() ? Integer.parseInt(val.toString()) : null);
            }
            if (payload.containsKey("dueDate")) {
                setClauses.append("due_date = ?, ");
                Object val = payload.get("dueDate");
                params.add(val != null && !val.toString().isEmpty() ? val.toString() : null);
            }

            if (setClauses.length() == 0) {
                response.put("success", false);
                response.put("message", "No fields to update.");
                return response;
            }

            // Remove trailing comma+space
            String setStr = setClauses.substring(0, setClauses.length() - 2);
            params.add(taskId);
            params.add(projectId);

            db.update("UPDATE tasks SET " + setStr + " WHERE id = ? AND project_id = ?", params.toArray());

            List<Map<String, Object>> updated = db.queryForList(
                    "SELECT t.*, creator.full_name AS created_by_name, assignee.full_name AS assigned_to_name "
                            + "FROM tasks t "
                            + "JOIN users creator ON t.created_by = creator.id "
                            + "LEFT JOIN users assignee ON t.assigned_to = assignee.id "
                            + "WHERE t.id = ?", taskId);

            response.put("success", true);
            response.put("data", updated.isEmpty() ? null : updated.get(0));
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    // DELETE a task
    @DeleteMapping("/{taskId}")
    public Map<String, Object> deleteTask(@PathVariable int projectId, @PathVariable int taskId) {
        Map<String, Object> response = new HashMap<>();
        try {
            int rows = db.update("DELETE FROM tasks WHERE id = ? AND project_id = ?", taskId, projectId);
            response.put("success", rows > 0);
            if (rows == 0) response.put("message", "Task not found.");
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }
}
