package com.researchhub.localbackend;

import org.springframework.web.bind.annotation.*;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@RestController
@CrossOrigin("*")
@RequestMapping("/local")
public class LocalSyncController {

    // In-memory tracker of when we last wrote or synced a file to disk
    // Key: absolute file path, Value: lastModified timestamp
    private static final Map<String, Long> lastSyncedTimestamps = new ConcurrentHashMap<>();

    @PostMapping("/sync")
    public Map<String, Object> syncFiles(@RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        List<Map<String, Object>> localChanges = new ArrayList<>();

        String basePath = (String) payload.get("basePath");
        String projectName = (String) payload.get("projectName");

        if (basePath == null || projectName == null) {
            response.put("success", false);
            response.put("message", "basePath and projectName required.");
            return response;
        }

        String safeProjectName = projectName.replaceAll("[^a-zA-Z0-9.-]", "_");
        Path latexDir = Paths.get(basePath, "ResearchHub", safeProjectName, "Latex");

        try {
            Files.createDirectories(latexDir);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> centralFiles = (List<Map<String, Object>>) payload.get("files");
            if (centralFiles == null) centralFiles = new ArrayList<>();

            Set<String> centralFileNames = new HashSet<>();

            // 1. Process files from CentralBackend
            for (Map<String, Object> cFile : centralFiles) {
                String fileName = (String) cFile.get("name");
                String content = (String) cFile.get("content");
                Integer id = cFile.get("id") != null ? ((Number) cFile.get("id")).intValue() : null;

                if (fileName == null || content == null) continue;
                centralFileNames.add(fileName);

                Path filePath = latexDir.resolve(fileName);
                String absPath = filePath.toAbsolutePath().toString();
                File file = filePath.toFile();

                if (!file.exists()) {
                    // File doesn't exist locally, create it (download from cloud)
                    if (filePath.getParent() != null) {
                        Files.createDirectories(filePath.getParent());
                    }
                    Files.writeString(filePath, content);
                    lastSyncedTimestamps.put(absPath, file.lastModified());
                } else {
                    long currentDiskModified = file.lastModified();
                    Long lastKnownModified = lastSyncedTimestamps.get(absPath);

                    if (lastKnownModified == null) {
                        // First time seeing this file, assume disk is truth if content differs
                        String diskContent = Files.readString(filePath);
                        if (!diskContent.equals(content)) {
                            // Disk has different content, upload it
                            Map<String, Object> change = new HashMap<>();
                            change.put("id", id);
                            change.put("name", fileName);
                            change.put("content", diskContent);
                            localChanges.add(change);
                        }
                        lastSyncedTimestamps.put(absPath, currentDiskModified);
                    } else if (currentDiskModified > lastKnownModified) {
                        // File was modified locally! Upload to cloud
                        String diskContent = Files.readString(filePath);
                        Map<String, Object> change = new HashMap<>();
                        change.put("id", id);
                        change.put("name", fileName);
                        change.put("content", diskContent);
                        localChanges.add(change);
                        lastSyncedTimestamps.put(absPath, currentDiskModified);
                    } else {
                        // File was NOT modified locally. Check if cloud has new content
                        String diskContent = Files.readString(filePath);
                        if (!diskContent.equals(content)) {
                            // Cloud is newer, overwrite local
                            Files.writeString(filePath, content);
                            lastSyncedTimestamps.put(absPath, file.lastModified());
                        }
                    }
                }
            }

            // 2. Scan local directory for NEW files created locally (not in centralFiles)
            try (Stream<Path> stream = Files.walk(latexDir)) {
                List<Path> localPaths = stream.filter(Files::isRegularFile).collect(Collectors.toList());
                for (Path localPath : localPaths) {
                    String relName = latexDir.relativize(localPath).toString().replace("\\", "/");
                    
                    // Ignore output directory
                    if (relName.startsWith("output/")) continue;
                    
                    if (!centralFileNames.contains(relName)) {
                        // It's a new local file! Upload to cloud
                        String diskContent = Files.readString(localPath);
                        Map<String, Object> change = new HashMap<>();
                        change.put("id", null); // new file
                        change.put("name", relName);
                        change.put("content", diskContent);
                        localChanges.add(change);
                        
                        lastSyncedTimestamps.put(localPath.toAbsolutePath().toString(), localPath.toFile().lastModified());
                    }
                }
            }

            response.put("success", true);
            response.put("localChanges", localChanges);

        } catch (Exception e) {
            e.printStackTrace();
            response.put("success", false);
            response.put("message", e.getMessage());
        }

        return response;
    }

    @PostMapping("/datasets/sync")
    public Map<String, Object> syncDatasets(@RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        List<Map<String, Object>> localChanges = new ArrayList<>();
        List<Map<String, Object>> missingLocally = new ArrayList<>();

        String basePath = (String) payload.get("basePath");
        String projectName = (String) payload.get("projectName");
        String datasetName = (String) payload.get("datasetName");

        if (basePath == null || projectName == null || datasetName == null) {
            response.put("success", false);
            response.put("message", "basePath, projectName, datasetName required.");
            return response;
        }

        String safeProjectName = projectName.replaceAll("[^a-zA-Z0-9.-]", "_");
        String safeDatasetName = datasetName.replaceAll("[^a-zA-Z0-9.-]", "_");
        Path datasetDir = Paths.get(basePath, "ResearchHub", safeProjectName, "Dataset", safeDatasetName);

        try {
            Files.createDirectories(datasetDir);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> centralFiles = (List<Map<String, Object>>) payload.get("files");
            if (centralFiles == null) centralFiles = new ArrayList<>();

            Set<String> centralFileNames = new HashSet<>();

            // 1. Process files from CentralBackend
            for (Map<String, Object> cFile : centralFiles) {
                String fileName = (String) cFile.get("file_name");
                Number sizeNum = (Number) cFile.get("file_size");
                long size = sizeNum != null ? sizeNum.longValue() : 0L;
                Integer id = cFile.get("id") != null ? ((Number) cFile.get("id")).intValue() : null;

                if (fileName == null) continue;
                centralFileNames.add(fileName);

                Path filePath = datasetDir.resolve(fileName);
                String absPath = filePath.toAbsolutePath().toString();
                File file = filePath.toFile();

                if (!file.exists()) {
                    // File doesn't exist locally
                    Map<String, Object> missing = new HashMap<>();
                    missing.put("id", id);
                    missing.put("file_name", fileName);
                    missingLocally.add(missing);
                } else {
                    long currentDiskModified = file.lastModified();
                    long currentDiskSize = file.length();
                    Long lastKnownModified = lastSyncedTimestamps.get(absPath);

                    if (lastKnownModified == null) {
                        // First time seeing this file, check if size differs
                        if (currentDiskSize != size) {
                            Map<String, Object> change = new HashMap<>();
                            change.put("id", id);
                            change.put("name", fileName);
                            localChanges.add(change);
                        }
                        lastSyncedTimestamps.put(absPath, currentDiskModified);
                    } else if (currentDiskModified > lastKnownModified) {
                        // File was modified locally!
                        Map<String, Object> change = new HashMap<>();
                        change.put("id", id);
                        change.put("name", fileName);
                        localChanges.add(change);
                        lastSyncedTimestamps.put(absPath, currentDiskModified);
                    }
                }
            }

            // 2. Scan local directory for NEW files created locally (not in centralFiles)
            try (Stream<Path> stream = Files.walk(datasetDir)) {
                List<Path> localPaths = stream.filter(Files::isRegularFile).collect(Collectors.toList());
                for (Path localPath : localPaths) {
                    String relName = datasetDir.relativize(localPath).toString().replace("\\", "/");
                    
                    if (!centralFileNames.contains(relName)) {
                        // It's a new local file! Upload to cloud
                        Map<String, Object> change = new HashMap<>();
                        change.put("id", null); // new file
                        change.put("name", relName);
                        localChanges.add(change);
                        
                        lastSyncedTimestamps.put(localPath.toAbsolutePath().toString(), localPath.toFile().lastModified());
                    }
                }
            }

            response.put("success", true);
            response.put("localChanges", localChanges);
            response.put("missingLocally", missingLocally);

        } catch (Exception e) {
            e.printStackTrace();
            response.put("success", false);
            response.put("message", e.getMessage());
        }

        return response;
    }
}
