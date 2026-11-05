package Backend;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

/**
 * Proxies all member-request operations to the CentralBackend.
 * Member requests are purely online operations (no local storage needed).
 */
@RestController
@CrossOrigin("*")
@RequestMapping("/api/member-requests")
public class MemberRequestController {

    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${central.api.url}")
    private String CENTRAL_URL;

    @GetMapping("/pending")
    public Map<String, Object> getPendingRequests(@RequestParam("userId") int userId) {
        try {
            ResponseEntity<Map> res = restTemplate.getForEntity(
                CENTRAL_URL + "/member-requests/pending?userId=" + userId, Map.class);
            return res.getBody();
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "Could not reach Central Server: " + e.getMessage());
            return error;
        }
    }

    @GetMapping("/sent")
    public Map<String, Object> getSentRequests(@RequestParam("userId") int userId) {
        try {
            ResponseEntity<Map> res = restTemplate.getForEntity(
                CENTRAL_URL + "/member-requests/sent?userId=" + userId, Map.class);
            return res.getBody();
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "Could not reach Central Server: " + e.getMessage());
            return error;
        }
    }

    @PostMapping("/{requestId}/accept")
    public Map<String, Object> acceptRequest(@PathVariable int requestId, @RequestBody Map<String, Object> payload) {
        try {
            ResponseEntity<Map> res = restTemplate.postForEntity(
                CENTRAL_URL + "/member-requests/" + requestId + "/accept", payload, Map.class);
            return res.getBody();
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "Could not reach Central Server: " + e.getMessage());
            return error;
        }
    }

    @PostMapping("/{requestId}/decline")
    public Map<String, Object> declineRequest(@PathVariable int requestId, @RequestBody Map<String, Object> payload) {
        try {
            ResponseEntity<Map> res = restTemplate.postForEntity(
                CENTRAL_URL + "/member-requests/" + requestId + "/decline", payload, Map.class);
            return res.getBody();
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "Could not reach Central Server: " + e.getMessage());
            return error;
        }
    }

    @DeleteMapping("/{requestId}")
    public Map<String, Object> cancelRequest(@PathVariable int requestId, @RequestBody Map<String, Object> payload) {
        try {
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload);
            ResponseEntity<Map> res = restTemplate.exchange(
                CENTRAL_URL + "/member-requests/" + requestId,
                HttpMethod.DELETE, entity, Map.class);
            return res.getBody();
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("message", "Could not reach Central Server: " + e.getMessage());
            return error;
        }
    }
}
