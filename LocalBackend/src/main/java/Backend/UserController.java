package Backend;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@CrossOrigin("*")
@RequestMapping("/api/users")
public class UserController {

    @Autowired
    private JdbcTemplate db;

    private final RestTemplate restTemplate = new RestTemplate();
    
    @org.springframework.beans.factory.annotation.Value("${central.api.url}")
    private String CENTRAL_URL;

    @GetMapping("/search")
    public Map<String, Object> searchUsers(@RequestParam("q") String query) {
        Map<String, Object> response = new HashMap<>();

        // Forward the search directly to the central server
        try {
            ResponseEntity<Map> centralResponse = restTemplate.getForEntity(CENTRAL_URL + "/users/search?q=" + query, Map.class);
            return centralResponse.getBody();
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Could not reach Central Server. Project creation requires an active internet connection to search for members.");
            return response;
        }
    }

    @PutMapping("/{id}")
    public Map<String, Object> updateUser(@PathVariable int id, @RequestBody Map<String, String> body) {
        Map<String, Object> response = new HashMap<>();

        try {
            HttpEntity<Map<String, String>> requestEntity = new HttpEntity<>(body);
            ResponseEntity<Map> centralResponse = restTemplate.exchange(
                    CENTRAL_URL + "/users/" + id,
                    HttpMethod.PUT,
                    requestEntity,
                    Map.class
            );
            return centralResponse.getBody();
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Could not reach Central Server. Profile updates require an active internet connection.");
            return response;
        }
    }
}
