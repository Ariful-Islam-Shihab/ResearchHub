package com.researchhub.localbackend;

import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;

@RestController
@CrossOrigin("*")
@RequestMapping("/local")
public class SaveFileController {

    @PostMapping("/save-downloaded-file")
    public Map<String, Object> saveDownloadedFile(
            @RequestParam("basePath") String basePath,
            @RequestParam("projectName") String projectName,
            @RequestParam("datasetName") String datasetName,
            @RequestParam("relativePath") String relativePath,
            @RequestParam("file") MultipartFile file) {
        
        Map<String, Object> response = new HashMap<>();
        try {
            String safeProjectName = projectName.replaceAll("[^a-zA-Z0-9.-]", "_");
            String safeDatasetName = datasetName.replaceAll("[^a-zA-Z0-9.-]", "_");
            
            Path projectPath = Paths.get(basePath, "ResearchHub", safeProjectName);
            Path datasetPath = projectPath.resolve("dataset").resolve(safeDatasetName);
            
            Path destPath = datasetPath.resolve(relativePath).normalize();
            
            // Ensure we don't escape the dataset directory
            if (!destPath.startsWith(datasetPath)) {
                throw new RuntimeException("Invalid relative path");
            }
            
            Files.createDirectories(destPath.getParent());
            java.nio.file.Files.copy(file.getInputStream(), destPath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            
            response.put("success", true);
            response.put("savedPath", destPath.toString());
        } catch (Exception e) {
            e.printStackTrace(); // Also print to console to debug locally
            response.put("success", false);
            response.put("message", e.getMessage());
        }
        return response;
    }
}
