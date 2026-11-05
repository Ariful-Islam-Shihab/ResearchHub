package Backend;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.ResponseEntity;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;

@RestController
@CrossOrigin("*")
@RequestMapping("/api/auth")
public class AuthService {

    @Autowired
    private JdbcTemplate db;

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final RestTemplate restTemplate = new RestTemplate();
    
    @org.springframework.beans.factory.annotation.Value("${central.api.url}")
    private String CENTRAL_URL;

    @PostMapping("/signup")
    public Map<String, Object> signup(@RequestBody Map<String, String> body) {
        try {
            // Forward signup directly to central server
            ResponseEntity<Map> response = restTemplate.postForEntity(CENTRAL_URL + "/auth/signup", body, Map.class);
            return response.getBody();
        } catch (Exception e) {
            return response(false, "Could not reach Central Server. Signup requires an active internet connection.", null);
        }
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        String password = body.get("password");

        if (email == null || email.trim().isEmpty() || password == null || password.isEmpty()) {
            return response(false, "Email and password are required.", null);
        }

        email = email.trim().toLowerCase();

        try {
            // Try Central Server first
            ResponseEntity<Map> centralResponse = restTemplate.postForEntity(CENTRAL_URL + "/auth/login", body, Map.class);
            Map<String, Object> result = centralResponse.getBody();

            if (result != null && (Boolean) result.get("success")) {
                Map<String, Object> userData = (Map<String, Object>) result.get("data");
                cacheUserLocally(userData, password);
                return result;
            } else {
                return result; // Forward failure message from Central
            }
        } catch (Exception e) {
            // Offline - Fallback to Local DB
            return offlineLogin(email, password);
        }
    }

    private void cacheUserLocally(Map<String, Object> user, String rawPassword) {
        String email = (String) user.get("email");
        Integer centralId = (Integer) user.get("id");
        String fullName = (String) user.get("full_name");
        String university = (String) user.get("university");
        String researchInterests = (String) user.get("research_interests");
        
        String hashedPassword = encoder.encode(rawPassword);
        String now = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        // Check if user exists
        String checkSql = "SELECT COUNT(*) FROM local_users WHERE email = ?";
        Integer count = db.queryForObject(checkSql, Integer.class, email);

        if (count != null && count > 0) {
            String updateSql = "UPDATE local_users SET central_id = ?, full_name = ?, university = ?, research_interests = ?, cached_password_hash = ?, last_login_at = ? WHERE email = ?";
            db.update(updateSql, centralId, fullName, university, researchInterests, hashedPassword, now, email);
        } else {
            String insertSql = "INSERT INTO local_users (central_id, full_name, email, university, research_interests, cached_password_hash, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)";
            db.update(insertSql, centralId, fullName, email, university, researchInterests, hashedPassword, now);
        }
    }

    private Map<String, Object> offlineLogin(String email, String password) {
        String sql = "SELECT * FROM local_users WHERE email = ?";
        List<Map<String, Object>> rows = db.queryForList(sql, email);

        if (rows.isEmpty()) {
            return response(false, "Offline mode: No cached account found for this email. Please connect to the internet to login.", null);
        }

        Map<String, Object> user = rows.get(0);
        String storedPassword = (String) user.get("cached_password_hash");
        
        if (!encoder.matches(password, storedPassword)) {
            return response(false, "Incorrect password.", null);
        }

        // Revalidation check (7 days)
        String lastLoginStr = (String) user.get("last_login_at");
        if (lastLoginStr != null) {
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
            LocalDateTime lastLogin = LocalDateTime.parse(lastLoginStr, formatter);
            long daysSinceLogin = ChronoUnit.DAYS.between(lastLogin, LocalDateTime.now());
            
            if (daysSinceLogin >= 7) {
                return response(false, "Offline mode: For security, your offline credentials expire after 7 days. Please connect to the internet to revalidate.", null);
            }
        }

        // Success - clean up object to match central structure
        user.remove("cached_password_hash");
        user.remove("last_login_at");
        user.put("id", user.get("central_id")); // Map local central_id back to id for the frontend
        user.put("offline_mode", true); // Flag for frontend if needed

        return response(true, "Logged in securely via local cache (Offline Mode).", user);
    }

    private Map<String, Object> response(boolean success, String message, Object data) {
        Map<String, Object> json = new HashMap<>();
        json.put("success", success);
        json.put("message", message);
        json.put("data", data);
        return json;
    }
}
