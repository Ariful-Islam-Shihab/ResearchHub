package Backend;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.CrossOrigin;

import java.util.Map;
import java.util.HashMap;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class StatusController {
    
    private final RestTemplate restTemplate = new RestTemplate();
    
    @Value("${central.api.url}")
    private String CENTRAL_URL;

    @GetMapping("/status")
    public Map<String, Boolean> getStatus() {
        Map<String, Boolean> response = new HashMap<>();
        try {
            // Check central backend health
            restTemplate.getForEntity(CENTRAL_URL + "/health", String.class);
            response.put("centralOnline", true);
        } catch (Exception e) {
            response.put("centralOnline", false);
        }
        return response;
    }
}
