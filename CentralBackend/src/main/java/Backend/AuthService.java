package Backend;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

//  AuthService: handles signup and login.
@RestController
@CrossOrigin("*")
@RequestMapping("/api/auth")
public class AuthService {

    @Autowired
    private JdbcTemplate db;  
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    // SIGNUP
    @PostMapping("/signup")
    public Map<String, Object> signup(@RequestBody Map<String, String> body) {

        String fullName = body.get("fullName");
        String email    = body.get("email");
        String password = body.get("password");
        String university = body.get("university");
        String researchInterests = body.get("researchInterests");

        // Validate
        if (fullName == null || fullName.trim().isEmpty()) {
            return response(false, "Full name is required.", null);
        }
        if (email == null || email.trim().isEmpty()) {
            return response(false, "Email is required.", null);
        }
        if (password == null || password.length() < 6) {
            return response(false, "Password must be at least 6 characters.", null);
        }

        // Check if email already exists
        String checkSql = "SELECT COUNT(*) FROM users WHERE email = ?";
        int count = db.queryForObject(checkSql, Integer.class, email.trim().toLowerCase());

        if (count > 0) {
            return response(false, "An account with this email already exists.", null);
        }

        // Insert the new user
        String insertSql = "INSERT INTO users (full_name, email, password, university, research_interests) VALUES (?, ?, ?, ?, ?)";
        String hashedPassword = encoder.encode(password);
        db.update(insertSql, 
            fullName.trim(), 
            email.trim().toLowerCase(), 
            hashedPassword,
            university != null ? university.trim() : "",
            researchInterests != null ? researchInterests.trim() : ""
        );

        return response(true, "Account created successfully!", null);
    }

    //LOGIN

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody Map<String, String> body) {

        String email    = body.get("email");
        String password = body.get("password");

        // Validate
        if (email == null || email.trim().isEmpty()) {
            return response(false, "Email is required.", null);
        }
        if (password == null || password.isEmpty()) {
            return response(false, "Password is required.", null);
        }

        // Find user by email
        String sql = "SELECT * FROM users WHERE email = ?";
        List<Map<String, Object>> rows = db.queryForList(sql, email.trim().toLowerCase());

        if (rows.isEmpty()) {
            return response(false, "No account found with this email.", null);
        }

        Map<String, Object> user = rows.get(0);
        String storedPassword = (String) user.get("password");
        
        // Remove password before returning
        user.remove("password");

        // Verify password 
        if (!encoder.matches(password, storedPassword)) {
            return response(false, "Incorrect password.", null);
        }

        return response(true, "Login successful!", user);
    }

    // Build JSON response

    private Map<String, Object> response(boolean success, String message, Object data) {
        Map<String, Object> json = new HashMap<>();
        json.put("success", success);
        json.put("message", message);
        json.put("data", data);
        return json;
    }
}
