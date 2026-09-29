package com.researchhub.localbackend;

import org.springframework.web.bind.annotation.*;
import java.io.File;
import java.util.HashMap;
import java.util.Map;

@RestController
@CrossOrigin("*")
@RequestMapping("/local")
public class InitController {
    private final DatasetSyncService syncService;

    public InitController(DatasetSyncService syncService) {
        this.syncService = syncService;
    }

    @PostMapping("/init-project")
    public Map<String, Object> initProject(@RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        String basePath = (String) payload.get("basePath");
        String projectName = (String) payload.get("projectName");
        String projectIdStr = payload.get("projectId") != null ? String.valueOf(payload.get("projectId")) : null;
        String userIdStr = payload.get("userId") != null ? String.valueOf(payload.get("userId")) : null;

        if (basePath == null || basePath.trim().isEmpty() || projectName == null || projectName.trim().isEmpty()) {
            response.put("success", false);
            response.put("message", "basePath and projectName are required.");
            return response;
        }

        try {
            // Sanitize project name
            String safeProjectName = projectName.replaceAll("[^a-zA-Z0-9.-]", "_");
            File researchHubDir = new File(basePath, "ResearchHub");
            File projectDir = new File(researchHubDir, safeProjectName);
            
            File datasetDir = new File(projectDir, "dataset");
            File latexDir = new File(projectDir, "Latex");

            datasetDir.mkdirs();
            latexDir.mkdirs();
            
            if (projectIdStr != null && userIdStr != null) {
                int projectId = Integer.parseInt(projectIdStr);
                int userId = Integer.parseInt(userIdStr);
                syncService.registerProject(projectId, userId, datasetDir.getAbsolutePath());
            }

            response.put("success", true);
            response.put("message", "Folders created successfully.");
            response.put("datasetPath", datasetDir.getAbsolutePath());
            response.put("latexPath", latexDir.getAbsolutePath());

        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Error creating folders: " + e.getMessage());
        }
        return response;
    }
}
