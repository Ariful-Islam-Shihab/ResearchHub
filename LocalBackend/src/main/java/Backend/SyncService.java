package Backend;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.HashMap;

@Service
public class SyncService {

    @Autowired
    private JdbcTemplate db;

    private final RestTemplate restTemplate = new RestTemplate();

    @org.springframework.beans.factory.annotation.Value("${central.api.url}")
    private String CENTRAL_URL;

    // Run every 30 seconds
    @Scheduled(fixedDelay = 30000)
    public void syncQueueWithCentral() {
        System.out.println("[SyncService] Checking for pending offline actions...");
        
        String sql = "SELECT * FROM sync_queue WHERE status = 'PENDING' ORDER BY created_at ASC";
        List<Map<String, Object>> pendingItems = db.queryForList(sql);

        if (pendingItems.isEmpty()) {
            return; // Nothing to sync
        }

        System.out.println("[SyncService] Found " + pendingItems.size() + " items to sync.");

        for (Map<String, Object> item : pendingItems) {
            Integer id = (Integer) item.get("id");
            String operationType = (String) item.get("operation_type");
            String payloadStr = (String) item.get("payload");

            try {
                // Here we would parse the payload and send it to the central backend.
                // For now, we simulate a successful sync by just printing it.
                System.out.println("[SyncService] Syncing item " + id + " [" + operationType + "]...");
                
                // Example pseudo-code for a real sync:
                // if (operationType.equals("PROJECT_CREATE")) {
                //     Map payload = new ObjectMapper().readValue(payloadStr, Map.class);
                //     restTemplate.postForEntity(CENTRAL_URL + "/projects", payload, Map.class);
                // }
                
                // Mark as synced
                db.update("UPDATE sync_queue SET status = 'SYNCED' WHERE id = ?", id);
                System.out.println("[SyncService] Item " + id + " synced successfully.");
                
            } catch (Exception e) {
                System.err.println("[SyncService] Failed to sync item " + id + ": " + e.getMessage());
                db.update("UPDATE sync_queue SET status = 'FAILED' WHERE id = ?", id);
            }
        }
    }
}
