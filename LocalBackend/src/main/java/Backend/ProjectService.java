package Backend;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;

import java.util.HashMap;
import java.util.Map;

@RestController
@CrossOrigin("*")
@RequestMapping("/api/projects")
public class ProjectService {

    @Autowired
    private JdbcTemplate db;

    private final RestTemplate restTemplate = new RestTemplate();

    @org.springframework.beans.factory.annotation.Value("${central.api.url}")
    private String CENTRAL_URL;

    // ─── GET all projects for a user ───────────────────────────────────────────
    @GetMapping
    public Map<String, Object> getUserProjects(@RequestParam("userId") int userId) {
        Map<String, Object> response = new HashMap<>();
        try {
            ResponseEntity<Map> centralResponse = restTemplate.getForEntity(
                CENTRAL_URL + "/projects?userId=" + userId, Map.class);
            return centralResponse.getBody();
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Failed to reach Central Server: " + e.getMessage());
        }
        return response;
    }

    // ─── GET single project by ID ───────────────────────────────────────────────
    @GetMapping("/{id}")
    public Map<String, Object> getProject(@PathVariable int id) {
        Map<String, Object> response = new HashMap<>();
        try {
            ResponseEntity<Map> centralResponse = restTemplate.getForEntity(
                CENTRAL_URL + "/projects/" + id, Map.class);
            return centralResponse.getBody();
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Failed to reach Central Server: " + e.getMessage());
        }
        return response;
    }

    // ─── GET project members ────────────────────────────────────────────────────
    @GetMapping("/{id}/members")
    public Map<String, Object> getProjectMembers(@PathVariable int id) {
        Map<String, Object> response = new HashMap<>();
        try {
            ResponseEntity<Map> centralResponse = restTemplate.getForEntity(
                CENTRAL_URL + "/projects/" + id + "/members", Map.class);
            return centralResponse.getBody();
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Failed to reach Central Server: " + e.getMessage());
        }
        return response;
    }

    // ─── POST invite a user ─────────────────────────────────────────────────────
    @PostMapping("/{id}/invite")
    public Map<String, Object> inviteMember(@PathVariable int id,
                                             @RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            ResponseEntity<Map> centralResponse = restTemplate.postForEntity(
                CENTRAL_URL + "/projects/" + id + "/invite", payload, Map.class);
            return centralResponse.getBody();
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Failed to reach Central Server: " + e.getMessage());
        }
        return response;
    }

    // ─── DELETE remove a member ─────────────────────────────────────────────────
    @DeleteMapping("/{id}/members/{userId}")
    public Map<String, Object> removeMember(@PathVariable int id,
                                             @PathVariable int userId,
                                             @RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload);
            ResponseEntity<Map> centralResponse = restTemplate.exchange(
                CENTRAL_URL + "/projects/" + id + "/members/" + userId,
                HttpMethod.DELETE, entity, Map.class);
            return centralResponse.getBody();
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Failed to reach Central Server: " + e.getMessage());
        }
        return response;
    }

    // ─── POST create project ────────────────────────────────────────────────────
    @PostMapping
    public Map<String, Object> createProject(@RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            ResponseEntity<Map> centralResponse = restTemplate.postForEntity(
                CENTRAL_URL + "/projects", payload, Map.class);
            return centralResponse.getBody();
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Failed to create project on Central Server: " + e.getMessage());
        }
        return response;
    }
}
