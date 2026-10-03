package com.researchhub.localbackend;

import org.springframework.core.io.FileSystemResource;
import org.springframework.http.*;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
@EnableScheduling
public class DatasetSyncService {

    private final String CENTRAL_BASE_URL = "http://localhost:8080/api";
    private final RestTemplate restTemplate = new RestTemplate();

    // Map of projectId -> ProjectSyncConfig
    private final Map<Integer, ProjectSyncConfig> activeProjects = new ConcurrentHashMap<>();
    private final Map<String, Long> lastSyncedTimestamps = new ConcurrentHashMap<>();

    public void registerProject(int projectId, int userId, String datasetPath) {
        activeProjects.put(projectId, new ProjectSyncConfig(projectId, userId, datasetPath));
        System.out.println("Registered project " + projectId + " for sync at " + datasetPath);
    }

    @Scheduled(fixedRate = 5000) // Run every 5 seconds
    public void syncDatasets() {
        for (ProjectSyncConfig config : activeProjects.values()) {
            try {
                performSync(config);
            } catch (Exception e) {
                System.err.println("Error syncing project " + config.projectId + ": " + e.getMessage());
            }
        }
    }

    private void performSync(ProjectSyncConfig config) throws Exception {
        // 1. Fetch datasets for this project from CentralBackend
        String datasetsUrl = CENTRAL_BASE_URL + "/projects/" + config.projectId + "/datasets?userId=" + config.userId;
        ResponseEntity<Map> datasetsResponse = restTemplate.getForEntity(datasetsUrl, Map.class);
        
        if (!datasetsResponse.getStatusCode().is2xxSuccessful() || datasetsResponse.getBody() == null) return;
        
        List<Map<String, Object>> datasets = (List<Map<String, Object>>) datasetsResponse.getBody().get("data");
        if (datasets == null) return;

        for (Map<String, Object> dataset : datasets) {
            int datasetId = (Integer) dataset.get("id");
            String datasetName = (String) dataset.get("name");
            
            // Central files
            String filesUrl = CENTRAL_BASE_URL + "/projects/" + config.projectId + "/datasets/" + datasetId + "/files";
            ResponseEntity<Map> filesResponse = restTemplate.getForEntity(filesUrl, Map.class);
            if (!filesResponse.getStatusCode().is2xxSuccessful() || filesResponse.getBody() == null) continue;
            
            List<Map<String, Object>> centralFiles = (List<Map<String, Object>>) filesResponse.getBody().get("files");
            if (centralFiles == null) centralFiles = new ArrayList<>();
            
            File localDatasetDir = new File(config.datasetPath, datasetName);
            if (!localDatasetDir.exists()) {
                localDatasetDir.mkdirs();
            }

            // Maps for comparison
            Map<String, Map<String, Object>> centralFilesMap = new HashMap<>();
            for (Map<String, Object> cf : centralFiles) {
                centralFilesMap.put((String) cf.get("file_name"), cf);
            }

            Map<String, File> localFilesMap = new HashMap<>();
            scanLocalFiles(localDatasetDir, localDatasetDir, localFilesMap);

            // Step 2: Download files from Central if missing locally or size is different
            for (Map.Entry<String, Map<String, Object>> entry : centralFilesMap.entrySet()) {
                String relativeName = entry.getKey();
                Map<String, Object> cf = entry.getValue();
                File localFile = localFilesMap.get(relativeName);
                
                long centralSize = cf.get("file_size") != null ? ((Number)cf.get("file_size")).longValue() : -1;

                if (localFile == null || localFile.length() != centralSize) {
                    // Check if we should download (Central has file that is missing locally, or size differs AND it's NOT a local modification)
                    String absPath = new File(localDatasetDir, relativeName).getAbsolutePath();
                    Long lastKnownModified = lastSyncedTimestamps.get(absPath);
                    boolean isLocalModification = (localFile != null && lastKnownModified != null && localFile.lastModified() > lastKnownModified);
                    
                    if (!isLocalModification) {
                        downloadFile(config.projectId, datasetId, (Integer) cf.get("id"), new File(localDatasetDir, relativeName));
                        // downloadFile already updates lastSyncedTimestamps
                    }
                } else if (localFile != null) {
                    // Size matches, record as synced if not known
                    String absPath = localFile.getAbsolutePath();
                    if (!lastSyncedTimestamps.containsKey(absPath)) {
                        lastSyncedTimestamps.put(absPath, localFile.lastModified());
                    }
                }
            }

            // Step 3: Upload files to Central if missing centrally or different size locally
            for (Map.Entry<String, File> entry : localFilesMap.entrySet()) {
                String relativeName = entry.getKey();
                File localFile = entry.getValue();

                Map<String, Object> cf = centralFilesMap.get(relativeName);
                if (cf == null) {
                    // Upload new local file
                    uploadFile(config.projectId, datasetId, config.userId, relativeName, localFile);
                    lastSyncedTimestamps.put(localFile.getAbsolutePath(), localFile.lastModified());
                } else {
                    long centralSize = cf.get("file_size") != null ? ((Number)cf.get("file_size")).longValue() : -1;
                    String absPath = localFile.getAbsolutePath();
                    Long lastKnownModified = lastSyncedTimestamps.get(absPath);
                    
                    if (lastKnownModified != null && localFile.lastModified() > lastKnownModified && localFile.length() != centralSize) {
                        // File was modified locally and size changed!
                        uploadFile(config.projectId, datasetId, config.userId, relativeName, localFile);
                        lastSyncedTimestamps.put(absPath, localFile.lastModified());
                    }
                }
            }

            // Step 4: Mark dataset as SYNCHRONIZED
            markDatasetSynced(config.projectId, datasetId, config.userId);
        }
    }

    private void markDatasetSynced(int projectId, int datasetId, int userId) {
        try {
            String url = CENTRAL_BASE_URL + "/projects/" + projectId + "/datasets/" + datasetId + "/sync-status";
            Map<String, Object> payload = new HashMap<>();
            payload.put("userId", userId);
            payload.put("status", "SYNCHRONIZED");
            
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);
            
            restTemplate.exchange(url, HttpMethod.PUT, entity, Map.class);
        } catch (Exception e) {
            System.err.println("Failed to mark dataset synced: " + e.getMessage());
        }
    }

    private void scanLocalFiles(File baseDir, File currentDir, Map<String, File> localFilesMap) {
        if (!currentDir.exists() || !currentDir.isDirectory()) return;
        
        File[] files = currentDir.listFiles();
        if (files == null) return;

        for (File f : files) {
            if (f.isDirectory()) {
                scanLocalFiles(baseDir, f, localFilesMap);
            } else {
                String relativePath = baseDir.toURI().relativize(f.toURI()).getPath();
                localFilesMap.put(relativePath, f);
            }
        }
    }

    private void downloadFile(int projectId, int datasetId, int fileId, File targetFile) {
        try {
            System.out.println("Downloading file to " + targetFile.getAbsolutePath());
            String downloadUrl = CENTRAL_BASE_URL + "/projects/" + projectId + "/datasets/" + datasetId + "/files/" + fileId + "/download";
            byte[] fileBytes = restTemplate.getForObject(downloadUrl, byte[].class);
            
            if (fileBytes != null) {
                targetFile.getParentFile().mkdirs();
                try (FileOutputStream fos = new FileOutputStream(targetFile)) {
                    fos.write(fileBytes);
                }
                lastSyncedTimestamps.put(targetFile.getAbsolutePath(), targetFile.lastModified());
            }
        } catch (Exception e) {
            System.err.println("Failed to download file " + targetFile.getName() + ": " + e.getMessage());
        }
    }

    private void uploadFile(int projectId, int datasetId, int userId, String relativeName, File localFile) {
        try {
            System.out.println("Uploading file " + localFile.getAbsolutePath());
            String uploadUrl = CENTRAL_BASE_URL + "/projects/" + projectId + "/datasets/" + datasetId + "/files/upload";
            
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);
            
            MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
            body.add("file", new FileSystemResource(localFile));
            body.add("userId", userId);
            body.add("fileName", relativeName);
            body.add("fileSize", localFile.length());
            
            String contentType = Files.probeContentType(localFile.toPath());
            if (contentType == null) contentType = "application/octet-stream";
            body.add("fileType", contentType);
            
            HttpEntity<MultiValueMap<String, Object>> requestEntity = new HttpEntity<>(body, headers);
            restTemplate.postForEntity(uploadUrl, requestEntity, String.class);
            
        } catch (Exception e) {
            System.err.println("Failed to upload file " + localFile.getName() + ": " + e.getMessage());
        }
    }

    private static class ProjectSyncConfig {
        int projectId;
        int userId;
        String datasetPath;

        public ProjectSyncConfig(int projectId, int userId, String datasetPath) {
            this.projectId = projectId;
            this.userId = userId;
            this.datasetPath = datasetPath;
        }
    }
}
