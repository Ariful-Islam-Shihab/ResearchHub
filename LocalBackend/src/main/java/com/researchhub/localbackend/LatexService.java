package com.researchhub.localbackend;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

@RestController
@CrossOrigin(origins = "*", allowedHeaders = "*")
@RequestMapping("/local/latex")
public class LatexService {

    @Autowired
    private JdbcTemplate db;

    // Store compilation logs per project
    private final ConcurrentHashMap<Integer, String> compileLogs = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, String> compileStatus = new ConcurrentHashMap<>();

    // Thread pool for async compilation
    private final ExecutorService compileExecutor = Executors.newFixedThreadPool(2);

    // ─── Detect available LaTeX compilers ────────────────────────────────────
    @GetMapping("/compilers")
    public Map<String, Object> detectCompilers() {
        Map<String, Object> response = new HashMap<>();
        List<Map<String, Object>> compilers = new ArrayList<>();

        String[] candidates = {"pdflatex", "xelatex", "lualatex", "latexmk"};
        for (String compiler : candidates) {
            if (isCompilerAvailable(compiler)) {
                Map<String, Object> info = new HashMap<>();
                info.put("name", compiler);
                info.put("available", true);
                info.put("version", getCompilerVersion(compiler));
                compilers.add(info);
            }
        }

        response.put("success", true);
        response.put("data", compilers);
        if (compilers.isEmpty()) {
            response.put("message", "No LaTeX compilers found. Please install a TeX distribution (e.g., MiKTeX or TeX Live).");
        }
        return response;
    }

    // ─── Compile a project ───────────────────────────────────────────────────
    @PostMapping("/compile")
    public Map<String, Object> compile(@RequestBody Map<String, Object> body) {
        Map<String, Object> response = new HashMap<>();
        try {
            int projectId = ((Number) body.get("projectId")).intValue();
            String compiler = (String) body.getOrDefault("compiler", "pdflatex");
            String mainFile = (String) body.getOrDefault("mainFile", "main.tex");
            String content = (String) body.get("content");

            String basePath = (String) body.get("basePath");
            String projectName = (String) body.get("projectName");
            
            Path projectDir;
            if (basePath != null && projectName != null && !basePath.trim().isEmpty()) {
                String safeProjectName = projectName.replaceAll("[^a-zA-Z0-9.-]", "_");
                projectDir = Paths.get(basePath, "ResearchHub", safeProjectName, "Latex");
            } else {
                String userHome = System.getProperty("user.home");
                projectDir = Paths.get(userHome, "ResearchHub", "Projects", String.valueOf(projectId));
            }
            Files.createDirectories(projectDir);
            Path outputDir = projectDir.resolve("output");
            Files.createDirectories(outputDir);

            // Write the main file content
            if (content != null && !content.isEmpty()) {
                Files.writeString(projectDir.resolve(mainFile), content);
            }

            // Also write any additional files from the body
            @SuppressWarnings("unchecked")
            Map<String, String> additionalFiles = (Map<String, String>) body.get("additionalFiles");
            if (additionalFiles != null) {
                for (Map.Entry<String, String> entry : additionalFiles.entrySet()) {
                    Path filePath = projectDir.resolve(entry.getKey());
                    Files.createDirectories(filePath.getParent());
                    Files.writeString(filePath, entry.getValue());
                }
            }

            if (!isCompilerAvailable(compiler)) {
                response.put("success", false);
                response.put("message", "Compiler '" + compiler + "' not found. Install a TeX distribution.");
                return response;
            }

            // Mark as compiling
            compileStatus.put(projectId, "COMPILING");
            compileLogs.put(projectId, "");

            // Build command
            List<String> command = new ArrayList<>();
            if (compiler.equals("latexmk")) {
                command.addAll(List.of("latexmk", "-pdf",
                        "-output-directory=" + outputDir.toString(),
                        "-interaction=nonstopmode",
                        projectDir.resolve(mainFile).toString()));
            } else {
                command.addAll(List.of(compiler,
                        "-output-directory=" + outputDir.toString(),
                        "-interaction=nonstopmode",
                        projectDir.resolve(mainFile).toString()));
            }

            // Run compilation synchronously (but with timeout)
            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(projectDir.toFile());
            pb.redirectErrorStream(true);

            long startTime = System.currentTimeMillis();
            Process process = pb.start();

            StringBuilder logBuilder = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    logBuilder.append(line).append("\n");
                }
            }

            boolean finished = process.waitFor(120, TimeUnit.SECONDS);
            long duration = System.currentTimeMillis() - startTime;

            String log = logBuilder.toString();
            compileLogs.put(projectId, log);

            if (!finished) {
                process.destroyForcibly();
                compileStatus.put(projectId, "TIMEOUT");
                response.put("success", false);
                response.put("message", "Compilation timed out after 120 seconds.");
                response.put("log", log);
                return response;
            }

            int exitCode = process.exitValue();

            // Check if PDF was generated
            String pdfName = mainFile.replace(".tex", ".pdf");
            Path pdfPath = outputDir.resolve(pdfName);
            boolean pdfExists = Files.exists(pdfPath);

            // Parse errors and warnings from log
            List<String> errors = new ArrayList<>();
            List<String> warnings = new ArrayList<>();
            for (String line : log.split("\n")) {
                if (line.startsWith("!") || line.contains("Error")) {
                    errors.add(line.trim());
                } else if (line.contains("Warning")) {
                    warnings.add(line.trim());
                }
            }

            if (exitCode == 0 && pdfExists) {
                compileStatus.put(projectId, "SUCCESS");
                response.put("success", true);
                response.put("message", "Compilation successful.");
            } else if (pdfExists) {
                compileStatus.put(projectId, "WARNING");
                response.put("success", true);
                response.put("message", "Compilation completed with warnings.");
            } else {
                compileStatus.put(projectId, "ERROR");
                response.put("success", false);
                response.put("message", "Compilation failed.");
            }

            Map<String, Object> data = new HashMap<>();
            data.put("exitCode", exitCode);
            data.put("pdfExists", pdfExists);
            data.put("duration", duration);
            data.put("errors", errors);
            data.put("warnings", warnings);
            data.put("log", log);
            response.put("data", data);

        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Compilation error: " + e.getMessage());
        }
        return response;
    }

    // ─── Serve compiled PDF ──────────────────────────────────────────────────
    @GetMapping("/pdf/{projectId}")
    public ResponseEntity<Resource> getPdf(@PathVariable int projectId,
                                           @RequestParam(defaultValue = "main") String mainFile,
                                           @RequestParam(required = false) String basePath,
                                           @RequestParam(required = false) String projectName) {
        try {
            String pdfName = mainFile.replace(".tex", "") + ".pdf";
            Path pdfPath;
            if (basePath != null && projectName != null && !basePath.trim().isEmpty()) {
                String safeProjectName = projectName.replaceAll("[^a-zA-Z0-9.-]", "_");
                pdfPath = Paths.get(basePath, "ResearchHub", safeProjectName, "Latex", "output", pdfName);
            } else {
                String userHome = System.getProperty("user.home");
                pdfPath = Paths.get(userHome, "ResearchHub", "Projects", String.valueOf(projectId), "output", pdfName);
            }

            if (!Files.exists(pdfPath)) {
                return ResponseEntity.notFound().build();
            }

            FileSystemResource resource = new FileSystemResource(pdfPath.toFile());
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_PDF)
                    .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + pdfName + "\"")
                    .header(HttpHeaders.CACHE_CONTROL, "no-cache, no-store, must-revalidate")
                    .body(resource);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    // ─── Get compilation log ─────────────────────────────────────────────────
    @GetMapping("/log/{projectId}")
    public Map<String, Object> getLog(@PathVariable int projectId) {
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("data", Map.of(
                "log", compileLogs.getOrDefault(projectId, ""),
                "status", compileStatus.getOrDefault(projectId, "IDLE")
        ));
        return response;
    }

    // ─── Get/Update LaTeX settings ───────────────────────────────────────────
    @GetMapping("/settings/{projectId}")
    public Map<String, Object> getSettings(@PathVariable int projectId) {
        Map<String, Object> response = new HashMap<>();
        try {
            List<Map<String, Object>> rows = db.queryForList(
                    "SELECT * FROM latex_settings WHERE project_id = ?", projectId);
            if (rows.isEmpty()) {
                // Return defaults
                response.put("success", true);
                response.put("data", Map.of(
                        "compiler", "pdflatex",
                        "mainFile", "main.tex",
                        "outputDir", "output"
                ));
            } else {
                response.put("success", true);
                response.put("data", rows.get(0));
            }
        } catch (Exception e) {
            response.put("success", true);
            response.put("data", Map.of(
                    "compiler", "pdflatex",
                    "mainFile", "main.tex",
                    "outputDir", "output"
            ));
        }
        return response;
    }

    @PutMapping("/settings")
    public Map<String, Object> updateSettings(@RequestBody Map<String, Object> body) {
        Map<String, Object> response = new HashMap<>();
        try {
            int projectId = ((Number) body.get("projectId")).intValue();
            String compiler = (String) body.getOrDefault("compiler", "pdflatex");
            String mainFile = (String) body.getOrDefault("mainFile", "main.tex");
            String outputDir = (String) body.getOrDefault("outputDir", "output");

            db.update("INSERT OR REPLACE INTO latex_settings (project_id, compiler, main_file, output_dir) VALUES (?, ?, ?, ?)",
                    projectId, compiler, mainFile, outputDir);

            response.put("success", true);
            response.put("message", "Settings saved.");
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Failed to save settings: " + e.getMessage());
        }
        return response;
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private boolean isCompilerAvailable(String compiler) {
        try {
            String os = System.getProperty("os.name").toLowerCase();
            ProcessBuilder pb;
            if (os.contains("win")) {
                pb = new ProcessBuilder("where", compiler);
            } else {
                pb = new ProcessBuilder("which", compiler);
            }
            Process p = pb.start();
            boolean done = p.waitFor(5, TimeUnit.SECONDS);
            return done && p.exitValue() == 0;
        } catch (Exception e) {
            return false;
        }
    }

    private String getCompilerVersion(String compiler) {
        try {
            ProcessBuilder pb = new ProcessBuilder(compiler, "--version");
            pb.redirectErrorStream(true);
            Process p = pb.start();
            BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream()));
            String firstLine = reader.readLine();
            p.waitFor(5, TimeUnit.SECONDS);
            return firstLine != null ? firstLine : "Unknown";
        } catch (Exception e) {
            return "Unknown";
        }
    }
}
