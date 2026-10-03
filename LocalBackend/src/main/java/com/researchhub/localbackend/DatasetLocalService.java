package com.researchhub.localbackend;

import org.springframework.web.bind.annotation.*;

import java.io.File;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

@RestController
@CrossOrigin(origins = "*")
@RequestMapping("/local/datasets")
public class DatasetLocalService {

    // ─── SCAN a local directory to compute metadata ──────────────────────────
    @PostMapping("/scan")
    public Map<String, Object> scanDirectory(@RequestBody Map<String, String> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            String pathStr = payload.get("path");
            if (pathStr == null || pathStr.trim().isEmpty()) {
                response.put("success", false);
                response.put("message", "Path is required.");
                return response;
            }

            Path dirPath = Paths.get(pathStr.trim());
            File dir = dirPath.toFile();

            if (!dir.exists()) {
                response.put("success", false);
                response.put("message", "Path does not exist: " + pathStr);
                return response;
            }

            AtomicLong totalSize = new AtomicLong(0);
            AtomicInteger fileCount = new AtomicInteger(0);
            Set<String> extensions = new HashSet<>();

            if (dir.isFile()) {
                // Single file
                totalSize.set(dir.length());
                fileCount.set(1);
                String name = dir.getName();
                int dotIdx = name.lastIndexOf('.');
                if (dotIdx > 0) extensions.add(name.substring(dotIdx));
            } else {
                // Directory — walk recursively
                Files.walk(dirPath).forEach(p -> {
                    File f = p.toFile();
                    if (f.isFile()) {
                        totalSize.addAndGet(f.length());
                        fileCount.incrementAndGet();
                        String name = f.getName();
                        int dotIdx = name.lastIndexOf('.');
                        if (dotIdx > 0) extensions.add(name.substring(dotIdx));
                    }
                });
            }

            // Compute a simple checksum (hash of file list + sizes)
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            if (dir.isFile()) {
                digest.update((dir.getName() + ":" + dir.length()).getBytes());
            } else {
                Files.walk(dirPath)
                        .filter(Files::isRegularFile)
                        .sorted()
                        .forEach(p -> {
                            try {
                                String entry = dirPath.relativize(p).toString() + ":" + Files.size(p);
                                digest.update(entry.getBytes());
                            } catch (Exception ignored) {}
                        });
            }
            byte[] hashBytes = digest.digest();
            StringBuilder hexString = new StringBuilder();
            for (byte b : hashBytes) {
                hexString.append(String.format("%02x", b));
            }

            // Build format string from extensions
            List<String> extList = new ArrayList<>(extensions);
            Collections.sort(extList);
            String format = String.join(", ", extList);

            Map<String, Object> data = new HashMap<>();
            data.put("path", dirPath.toAbsolutePath().toString());
            data.put("name", dir.getName());
            data.put("totalSize", totalSize.get());
            data.put("fileCount", fileCount.get());
            data.put("format", format);
            data.put("checksum", hexString.toString());
            data.put("isDirectory", dir.isDirectory());

            response.put("success", true);
            response.put("data", data);
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Error scanning path: " + e.getMessage());
        }
        return response;
    }

    // ─── VERIFY a local path exists and return basic info ────────────────────
    @PostMapping("/verify")
    public Map<String, Object> verifyPath(@RequestBody Map<String, String> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            String pathStr = payload.get("path");
            if (pathStr == null || pathStr.trim().isEmpty()) {
                response.put("success", false);
                response.put("message", "Path is required.");
                return response;
            }

            File file = new File(pathStr.trim());
            response.put("success", true);
            response.put("exists", file.exists());
            response.put("isDirectory", file.isDirectory());
            response.put("isFile", file.isFile());
            if (file.exists()) {
                response.put("absolutePath", file.getAbsolutePath());
                response.put("name", file.getName());
            }
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Error verifying path: " + e.getMessage());
        }
        return response;
    }

    // Opens Native OS Folder Picker via JFileChooser
    @PostMapping("/browse-dialog")
    public Map<String, Object> openBrowseDialog() {
        Map<String, Object> response = new HashMap<>();
        try {
            // Must run on AWT Event Dispatch Thread for thread safety
            final String[] selectedPath = {null};
            final boolean[] completed = {false};

            javax.swing.SwingUtilities.invokeAndWait(new Runnable() {
                public void run() {
                    try {
                        // Set look and feel to system default (Windows)
                        javax.swing.UIManager.setLookAndFeel(javax.swing.UIManager.getSystemLookAndFeelClassName());
                    } catch (Exception ex) {
                        // Ignore L&F errors
                    }

                    javax.swing.JFileChooser chooser = new javax.swing.JFileChooser();
                    chooser.setDialogTitle("Select Dataset Folder");
                    chooser.setFileSelectionMode(javax.swing.JFileChooser.DIRECTORIES_ONLY);
                    chooser.setAcceptAllFileFilterUsed(false);
                    
                    // Always on top so it doesn't get buried behind the browser
                    javax.swing.JDialog dialog = new javax.swing.JDialog();
                    dialog.setAlwaysOnTop(true);
                    
                    int returnValue = chooser.showOpenDialog(dialog);
                    if (returnValue == javax.swing.JFileChooser.APPROVE_OPTION) {
                        if (chooser.getSelectedFile() != null) {
                            selectedPath[0] = chooser.getSelectedFile().getAbsolutePath();
                        }
                    }
                    completed[0] = true;
                }
            });

            if (selectedPath[0] != null) {
                response.put("success", true);
                response.put("path", selectedPath[0]);
            } else {
                response.put("success", false);
                response.put("message", "User canceled");
            }
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Error opening dialog: " + e.getMessage());
        }
        return response;
    }

    // UPLOAD a file from Web UI 
    @PostMapping("/upload-file")
    public Map<String, Object> uploadFile(
            @RequestParam("file") org.springframework.web.multipart.MultipartFile file,
            @RequestParam("datasetId") String datasetId,
            @RequestParam("relativePath") String relativePath,
            @RequestParam("basePath") String basePathStr,
            @RequestParam("projectName") String projectName,
            @RequestParam("datasetName") String datasetName) {
        Map<String, Object> response = new HashMap<>();
        try {
            // Save to basePath/ResearchHub/projectName/dataset/datasetName/relativePath
            Path basePath = Paths.get(basePathStr).toAbsolutePath();
            Path destPath = basePath.resolve("ResearchHub")
                                    .resolve(projectName)
                                    .resolve("dataset")
                                    .resolve(datasetName)
                                    .resolve(relativePath).normalize();
            
            // Ensure we don't escape the base directory (security)
            if (!destPath.startsWith(basePath)) {
                throw new RuntimeException("Invalid relative path");
            }
            
            Files.createDirectories(destPath.getParent());
            java.nio.file.Files.copy(file.getInputStream(), destPath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            
            response.put("success", true);
            response.put("message", "File saved successfully");
            response.put("savedPath", destPath.toString());
        } catch (Exception e) {
            e.printStackTrace(); // Also print to console to debug locally
            response.put("success", false);
            response.put("message", "Error saving file: " + e.getMessage());
        }
        return response;
    }
}
