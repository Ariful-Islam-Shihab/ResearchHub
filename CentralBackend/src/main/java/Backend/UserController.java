package Backend;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@CrossOrigin("*")
@RequestMapping("/api/users")
public class UserController {

    @Autowired
    private JdbcTemplate db;

    @GetMapping("/search")
    public Map<String, Object> searchUsers(@RequestParam("q") String query) {
        Map<String, Object> response = new HashMap<>();

        try {
            String sql = "SELECT id, full_name as name, email FROM users WHERE full_name LIKE ? OR email LIKE ? LIMIT 10";
            String searchPattern = "%" + query + "%";
            List<Map<String, Object>> users = db.queryForList(sql, searchPattern, searchPattern);

            response.put("success", true);
            response.put("data", users);
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Error querying users from central database: " + e.getMessage());
        }

        return response;
    }

    @PutMapping("/{id}")
    public Map<String, Object> updateUser(@PathVariable int id, @RequestBody Map<String, String> body) {
        Map<String, Object> response = new HashMap<>();
        String name = body.get("name");
        String password = body.get("password");
        String currentPassword = body.get("currentPassword");

        if (currentPassword == null || currentPassword.trim().isEmpty()) {
            response.put("success", false);
            response.put("message", "Current password is required.");
            return response;
        }

        boolean updateName = (name != null && !name.trim().isEmpty());
        boolean updatePassword = (password != null && !password.trim().isEmpty());

        if (!updateName && !updatePassword) {
            response.put("success", false);
            response.put("message", "No valid data provided to update.");
            return response;
        }

        try {
            // Verify current password
            String checkSql = "SELECT password FROM users WHERE id = ?";
            List<String> passwords = db.queryForList(checkSql, String.class, id);
            
            if (passwords.isEmpty()) {
                response.put("success", false);
                response.put("message", "User not found.");
                return response;
            }

            BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
            if (!encoder.matches(currentPassword, passwords.get(0))) {
                response.put("success", false);
                response.put("message", "Incorrect current password.");
                return response;
            }

            if (updateName && updatePassword) {
                String hashedPassword = encoder.encode(password);
                String sql = "UPDATE users SET full_name = ?, password = ? WHERE id = ?";
                db.update(sql, name, hashedPassword, id);
            } else if (updateName) {
                String sql = "UPDATE users SET full_name = ? WHERE id = ?";
                db.update(sql, name, id);
            } else if (updatePassword) {
                String hashedPassword = encoder.encode(password);
                String sql = "UPDATE users SET password = ? WHERE id = ?";
                db.update(sql, hashedPassword, id);
            }

            response.put("success", true);
            response.put("message", "Profile updated successfully.");
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Error updating profile: " + e.getMessage());
        }

        return response;
    }
}
