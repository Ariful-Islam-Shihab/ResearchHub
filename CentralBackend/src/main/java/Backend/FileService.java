package Backend;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.security.MessageDigest;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.*;

@RestController
@CrossOrigin(origins = "*", allowedHeaders = "*", methods = { RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT,
        RequestMethod.DELETE })
@RequestMapping("/api/projects/{projectId}/files")
public class FileService {

    @Autowired
    private JdbcTemplate db;

    @Autowired
    private ChatServer chatServer;

    // ─── List all files in the project ───────────────────────────────────────
    @GetMapping
    public Map<String, Object> listFiles(@PathVariable int projectId) {
        Map<String, Object> response = new HashMap<>();
        try {
            String sql = """
                    SELECT pf.*, u.full_name AS created_by_name,
                           u2.full_name AS modified_by_name
                    FROM project_files pf
                    LEFT JOIN users u ON pf.created_by = u.id
                    LEFT JOIN users u2 ON pf.last_modified_by = u2.id
                    WHERE pf.project_id = ?
                    ORDER BY pf.is_directory DESC, pf.name ASC
                    """;
            List<Map<String, Object>> files = db.queryForList(sql, projectId);
            response.put("success", true);
            response.put("data", files);
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Failed to list files: " + e.getMessage());
        }
        return response;
    }

    // ─── Get single file with content ────────────────────────────────────────
    @GetMapping("/{fileId}")
    public Map<String, Object> getFile(@PathVariable int projectId, @PathVariable int fileId) {
        Map<String, Object> response = new HashMap<>();
        try {
            String sql = """
                    SELECT pf.*, u.full_name AS created_by_name,
                           u2.full_name AS modified_by_name
                    FROM project_files pf
                    LEFT JOIN users u ON pf.created_by = u.id
                    LEFT JOIN users u2 ON pf.last_modified_by = u2.id
                    WHERE pf.id = ? AND pf.project_id = ?
                    """;
            List<Map<String, Object>> results = db.queryForList(sql, fileId, projectId);
            if (results.isEmpty()) {
                response.put("success", false);
                response.put("message", "File not found.");
                return response;
            }
            response.put("success", true);
            response.put("data", results.get(0));
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Failed to get file: " + e.getMessage());
        }
        return response;
    }

    // ─── Create a file or folder ─────────────────────────────────────────────
    @PostMapping
    @Transactional
    public Map<String, Object> createFile(@PathVariable int projectId,
            @RequestBody Map<String, Object> body) {
        Map<String, Object> response = new HashMap<>();
        try {
            String name = (String) body.get("name");
            boolean isDirectory = body.get("isDirectory") != null && (boolean) body.get("isDirectory");
            Integer parentId = body.get("parentId") != null ? ((Number) body.get("parentId")).intValue() : null;
            int userId = ((Number) body.get("userId")).intValue();
            String content = (String) body.getOrDefault("content", "");

            if (name == null || name.trim().isEmpty()) {
                response.put("success", false);
                response.put("message", "File name is required.");
                return response;
            }

            // Check for duplicate name in the same parent
            String dupeCheck;
            List<Map<String, Object>> existing;
            if (parentId == null) {
                dupeCheck = "SELECT id FROM project_files WHERE project_id = ? AND parent_id IS NULL AND name = ?";
                existing = db.queryForList(dupeCheck, projectId, name);
            } else {
                dupeCheck = "SELECT id FROM project_files WHERE project_id = ? AND parent_id = ? AND name = ?";
                existing = db.queryForList(dupeCheck, projectId, parentId, name);
            }
            if (!existing.isEmpty()) {
                response.put("success", false);
                response.put("message", "A file or folder with this name already exists here.");
                return response;
            }

            String contentHash = isDirectory ? null : sha256(content);
            long size = isDirectory ? 0 : (content != null ? content.length() : 0);
            String mimeType = isDirectory ? null : guessMimeType(name);

            String sql = """
                    INSERT INTO project_files (project_id, parent_id, name, is_directory, content,
                        content_hash, size, mime_type, version, created_by, last_modified_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                    """;

            KeyHolder keyHolder = new GeneratedKeyHolder();
            final Integer pid = parentId;
            db.update(connection -> {
                PreparedStatement ps = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
                ps.setInt(1, projectId);
                if (pid == null)
                    ps.setNull(2, java.sql.Types.INTEGER);
                else
                    ps.setInt(2, pid);
                ps.setString(3, name);
                ps.setBoolean(4, isDirectory);
                ps.setString(5, isDirectory ? null : content);
                ps.setString(6, contentHash);
                ps.setLong(7, size);
                ps.setString(8, mimeType);
                ps.setInt(9, userId);
                ps.setInt(10, userId);
                return ps;
            }, keyHolder);

            int newId = keyHolder.getKey().intValue();

            // Create initial version for non-directory files
            if (!isDirectory) {
                db.update("""
                        INSERT INTO file_versions (file_id, version_number, content, content_hash,
                            change_description, created_by)
                        VALUES (?, 1, ?, ?, 'Initial creation', ?)
                        """, newId, content, contentHash, userId);
            }

            // Broadcast event
            broadcastFileEvent("FILE_CREATED", projectId, newId, name, parentId, isDirectory, userId);

            response.put("success", true);
            response.put("message", "File created successfully.");
            response.put("data", Map.of("fileId", newId));
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Failed to create file: " + e.getMessage());
        }
        return response;
    }

    // ─── Update file content (with version conflict detection) ───────────────
    @PutMapping("/{fileId}")
    @Transactional
    public Map<String, Object> updateFile(@PathVariable int projectId,
            @PathVariable int fileId,
            @RequestBody Map<String, Object> body) {
        Map<String, Object> response = new HashMap<>();
        try {
            String content = (String) body.get("content");
            int userId = ((Number) body.get("userId")).intValue();
            int baseVersion = ((Number) body.get("baseVersion")).intValue();
            String changeDescription = (String) body.getOrDefault("changeDescription", "Content updated");

            // Get current server state
            List<Map<String, Object>> fileRows = db.queryForList(
                    "SELECT version, name, content_hash FROM project_files WHERE id = ? AND project_id = ?",
                    fileId, projectId);

            if (fileRows.isEmpty()) {
                response.put("success", false);
                response.put("message", "File not found.");
                return response;
            }

            int serverVersion = ((Number) fileRows.get(0).get("version")).intValue();
            String fileName = (String) fileRows.get(0).get("name");

            // Conflict detection
            if (baseVersion != serverVersion) {
                response.put("success", false);
                response.put("conflict", true);
                response.put("serverVersion", serverVersion);
                response.put("clientVersion", baseVersion);
                response.put("message", "Conflict: the file has been modified by another user.");
                return response;
            }

            String newHash = sha256(content);
            String oldHash = (String) fileRows.get(0).get("content_hash");

            // Skip update if content hasn't actually changed
            if (newHash.equals(oldHash)) {
                response.put("success", true);
                response.put("message", "No changes detected.");
                response.put("data", Map.of("version", serverVersion));
                return response;
            }

            int newVersion = serverVersion + 1;
            long size = content != null ? content.length() : 0;

            // Update the file
            db.update("""
                    UPDATE project_files
                    SET content = ?, content_hash = ?, size = ?, version = ?,
                        last_modified_by = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ? AND project_id = ?
                    """, content, newHash, size, newVersion, userId, fileId, projectId);

            // Create version record
            db.update("""
                    INSERT INTO file_versions (file_id, version_number, content, content_hash,
                        change_description, created_by)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """, fileId, newVersion, content, newHash, changeDescription, userId);

            // Broadcast event
            broadcastFileEvent("FILE_CHANGED", projectId, fileId, fileName, null, false, userId);

            response.put("success", true);
            response.put("message", "File updated successfully.");
            response.put("data", Map.of("version", newVersion, "contentHash", newHash));
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Failed to update file: " + e.getMessage());
        }
        return response;
    }

    // ─── Rename file ─────────────────────────────────────────────────────────
    @PutMapping("/{fileId}/rename")
    @Transactional
    public Map<String, Object> renameFile(@PathVariable int projectId,
            @PathVariable int fileId,
            @RequestBody Map<String, Object> body) {
        Map<String, Object> response = new HashMap<>();
        try {
            String newName = (String) body.get("newName");
            int userId = ((Number) body.get("userId")).intValue();

            if (newName == null || newName.trim().isEmpty()) {
                response.put("success", false);
                response.put("message", "New name is required.");
                return response;
            }

            // Get current file info
            List<Map<String, Object>> fileRows = db.queryForList(
                    "SELECT name, parent_id FROM project_files WHERE id = ? AND project_id = ?",
                    fileId, projectId);
            if (fileRows.isEmpty()) {
                response.put("success", false);
                response.put("message", "File not found.");
                return response;
            }

            String oldName = (String) fileRows.get(0).get("name");
            Integer parentId = fileRows.get(0).get("parent_id") != null
                    ? ((Number) fileRows.get(0).get("parent_id")).intValue()
                    : null;

            // Check for duplicate name
            List<Map<String, Object>> dupes;
            if (parentId == null) {
                dupes = db.queryForList(
                        "SELECT id FROM project_files WHERE project_id = ? AND parent_id IS NULL AND name = ? AND id != ?",
                        projectId, newName, fileId);
            } else {
                dupes = db.queryForList(
                        "SELECT id FROM project_files WHERE project_id = ? AND parent_id = ? AND name = ? AND id != ?",
                        projectId, parentId, newName, fileId);
            }
            if (!dupes.isEmpty()) {
                response.put("success", false);
                response.put("message", "A file or folder with this name already exists.");
                return response;
            }

            db.update("UPDATE project_files SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    newName, fileId);

            // Broadcast
            String event = String.format(
                    "{\"type\":\"FILE_RENAMED\",\"projectId\":%d,\"fileId\":%d,\"oldName\":\"%s\",\"newName\":\"%s\",\"userId\":%d}",
                    projectId, fileId, escapeJson(oldName), escapeJson(newName), userId);
            chatServer.broadcastMessage(event, null, String.valueOf(projectId));

            response.put("success", true);
            response.put("message", "File renamed successfully.");
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Failed to rename file: " + e.getMessage());
        }
        return response;
    }

    // ─── Delete file or folder ───────────────────────────────────────────────
    @DeleteMapping("/{fileId}")
    @Transactional
    public Map<String, Object> deleteFile(@PathVariable int projectId,
            @PathVariable int fileId,
            @RequestParam int userId) {
        Map<String, Object> response = new HashMap<>();
        try {
            List<Map<String, Object>> fileRows = db.queryForList(
                    "SELECT name FROM project_files WHERE id = ? AND project_id = ?",
                    fileId, projectId);
            if (fileRows.isEmpty()) {
                response.put("success", false);
                response.put("message", "File not found.");
                return response;
            }

            String fileName = (String) fileRows.get(0).get("name");

            // CASCADE will handle child files in directories
            db.update("DELETE FROM project_files WHERE id = ? AND project_id = ?", fileId, projectId);

            // Broadcast
            broadcastFileEvent("FILE_DELETED", projectId, fileId, fileName, null, false, userId);

            response.put("success", true);
            response.put("message", "File deleted successfully.");
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Failed to delete file: " + e.getMessage());
        }
        return response;
    }

    // ─── Get version history ─────────────────────────────────────────────────
    @GetMapping("/{fileId}/versions")
    public Map<String, Object> getVersions(@PathVariable int projectId,
            @PathVariable int fileId) {
        Map<String, Object> response = new HashMap<>();
        try {
            String sql = """
                    SELECT fv.*, u.full_name AS created_by_name
                    FROM file_versions fv
                    LEFT JOIN users u ON fv.created_by = u.id
                    WHERE fv.file_id = ?
                    ORDER BY fv.version_number DESC
                    """;
            List<Map<String, Object>> versions = db.queryForList(sql, fileId);
            response.put("success", true);
            response.put("data", versions);
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Failed to get versions: " + e.getMessage());
        }
        return response;
    }

    // ─── Restore a version ───────────────────────────────────────────────────
    @PostMapping("/{fileId}/restore/{versionId}")
    @Transactional
    public Map<String, Object> restoreVersion(@PathVariable int projectId,
            @PathVariable int fileId,
            @PathVariable int versionId,
            @RequestBody Map<String, Object> body) {
        Map<String, Object> response = new HashMap<>();
        try {
            int userId = ((Number) body.get("userId")).intValue();

            // Get the version content
            List<Map<String, Object>> versionRows = db.queryForList(
                    "SELECT content, content_hash, version_number FROM file_versions WHERE id = ? AND file_id = ?",
                    versionId, fileId);
            if (versionRows.isEmpty()) {
                response.put("success", false);
                response.put("message", "Version not found.");
                return response;
            }

            String restoredContent = (String) versionRows.get(0).get("content");
            String restoredHash = (String) versionRows.get(0).get("content_hash");
            int restoredVersionNum = ((Number) versionRows.get(0).get("version_number")).intValue();

            // Get current version
            List<Map<String, Object>> fileRows = db.queryForList(
                    "SELECT version, name FROM project_files WHERE id = ? AND project_id = ?",
                    fileId, projectId);
            if (fileRows.isEmpty()) {
                response.put("success", false);
                response.put("message", "File not found.");
                return response;
            }

            int currentVersion = ((Number) fileRows.get(0).get("version")).intValue();
            String fileName = (String) fileRows.get(0).get("name");
            int newVersion = currentVersion + 1;
            long size = restoredContent != null ? restoredContent.length() : 0;

            // Update file with restored content (creates a NEW version, doesn't destroy
            // history)
            db.update("""
                    UPDATE project_files
                    SET content = ?, content_hash = ?, size = ?, version = ?,
                        last_modified_by = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ? AND project_id = ?
                    """, restoredContent, restoredHash, size, newVersion, userId, fileId, projectId);

            // Create version record for the restore action
            db.update("""
                    INSERT INTO file_versions (file_id, version_number, content, content_hash,
                        change_description, created_by)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """, fileId, newVersion, restoredContent, restoredHash,
                    "Restored from version " + restoredVersionNum, userId);

            // Broadcast
            broadcastFileEvent("FILE_CHANGED", projectId, fileId, fileName, null, false, userId);

            response.put("success", true);
            response.put("message", "Version restored successfully.");
            response.put("data", Map.of("version", newVersion));
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Failed to restore version: " + e.getMessage());
        }
        return response;
    }

    // ─── Initialize default LaTeX project structure ──────────────────────────
    @PostMapping("/init")
    @Transactional
    public Map<String, Object> initProject(@PathVariable int projectId,
            @RequestBody Map<String, Object> body) {
        Map<String, Object> response = new HashMap<>();
        try {
            int userId = ((Number) body.get("userId")).intValue();

            // Check if already initialized
            List<Map<String, Object>> existing = db.queryForList(
                    "SELECT id, name FROM project_files WHERE project_id = ?", projectId);

            boolean hasRealFiles = false;
            for (Map<String, Object> f : existing) {
                if (!"latex".equals(f.get("name"))) {
                    hasRealFiles = true;
                    break;
                }
            }

            if (hasRealFiles) {
                response.put("success", false);
                response.put("message", "Project already has files.");
                return response;
            }

            // Delete the legacy dummy 'latex' directory if it exists to clean up
            db.update("DELETE FROM project_files WHERE project_id = ? AND name = 'latex' AND parent_id IS NULL",
                    projectId);

            // Create default structure
            String mainTex = """
                    \\documentclass[12pt,a4paper]{article}
                    \\usepackage[utf8]{inputenc}
                    \\usepackage{amsmath}
                    \\usepackage{graphicx}
                    \\usepackage{hyperref}
                    \\usepackage[margin=1in]{geometry}

                    \\title{Research Paper Title}
                    \\author{Author Name}
                    \\date{\\today}

                    \\begin{document}

                    \\maketitle

                    \\begin{abstract}
                    Your abstract goes here. Summarize the key findings and contributions of your research.
                    \\end{abstract}

                    \\section{Introduction}
                    Introduction text goes here.

                    \\section{Methodology}
                    Describe your research methodology.

                    \\section{Results}
                    Present your findings.

                    \\section{Conclusion}
                    Summarize and conclude your research.

                    \\bibliographystyle{plain}
                    \\bibliography{references}

                    \\end{document}
                    """;

            String referencesBib = """
                    @article{example2024,
                      title={Example Research Paper},
                      author={Smith, John and Doe, Jane},
                      journal={Journal of Examples},
                      year={2024},
                      volume={1},
                      pages={1--10}
                    }
                    """;

            // Create root files
            createFileInternal(projectId, null, "main.tex", false, mainTex, userId);
            createFileInternal(projectId, null, "references.bib", false, referencesBib, userId);

            // Create folders
            int sectionsId = createFileInternal(projectId, null, "sections", true, null, userId);
            int figuresId = createFileInternal(projectId, null, "figures", true, null, userId);
            createFileInternal(projectId, null, "output", true, null, userId);

            // Create section files
            createFileInternal(projectId, sectionsId, "introduction.tex", false,
                    "\\section{Introduction}\nYour introduction text here.\n", userId);
            createFileInternal(projectId, sectionsId, "methodology.tex", false,
                    "\\section{Methodology}\nYour methodology text here.\n", userId);
            createFileInternal(projectId, sectionsId, "results.tex", false,
                    "\\section{Results}\nYour results text here.\n", userId);

            response.put("success", true);
            response.put("message", "Project initialized with default LaTeX structure.");
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Failed to initialize project: " + e.getMessage());
        }
        return response;
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private int createFileInternal(int projectId, Integer parentId, String name,
            boolean isDirectory, String content, int userId) {
        String contentHash = isDirectory ? null : sha256(content);
        long size = isDirectory ? 0 : (content != null ? content.length() : 0);
        String mimeType = isDirectory ? null : guessMimeType(name);

        String sql = """
                INSERT INTO project_files (project_id, parent_id, name, is_directory, content,
                    content_hash, size, mime_type, version, created_by, last_modified_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """;

        KeyHolder keyHolder = new GeneratedKeyHolder();
        db.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, projectId);
            if (parentId == null)
                ps.setNull(2, java.sql.Types.INTEGER);
            else
                ps.setInt(2, parentId);
            ps.setString(3, name);
            ps.setBoolean(4, isDirectory);
            ps.setString(5, isDirectory ? null : content);
            ps.setString(6, contentHash);
            ps.setLong(7, size);
            ps.setString(8, mimeType);
            ps.setInt(9, userId);
            ps.setInt(10, userId);
            return ps;
        }, keyHolder);

        int newId = keyHolder.getKey().intValue();

        if (!isDirectory && content != null) {
            db.update("""
                    INSERT INTO file_versions (file_id, version_number, content, content_hash,
                        change_description, created_by)
                    VALUES (?, 1, ?, ?, 'Initial creation', ?)
                    """, newId, content, contentHash, userId);
        }

        return newId;
    }

    private void broadcastFileEvent(String type, int projectId, int fileId,
            String fileName, Integer parentId, boolean isDirectory, int userId) {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"type\":\"").append(type).append("\"");
        sb.append(",\"projectId\":").append(projectId);
        sb.append(",\"fileId\":").append(fileId);
        sb.append(",\"fileName\":\"").append(escapeJson(fileName)).append("\"");
        if (parentId != null)
            sb.append(",\"parentId\":").append(parentId);
        sb.append(",\"isDirectory\":").append(isDirectory);
        sb.append(",\"userId\":").append(userId);
        sb.append("}");
        chatServer.broadcastMessage(sb.toString(), null, String.valueOf(projectId));
    }

    private String sha256(String content) {
        if (content == null)
            return null;
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(content.getBytes("UTF-8"));
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (Exception e) {
            return "";
        }
    }

    private String guessMimeType(String name) {
        if (name == null)
            return "application/octet-stream";
        String lower = name.toLowerCase();
        if (lower.endsWith(".tex"))
            return "text/x-tex";
        if (lower.endsWith(".bib"))
            return "text/x-bibtex";
        if (lower.endsWith(".sty"))
            return "text/x-tex";
        if (lower.endsWith(".cls"))
            return "text/x-tex";
        if (lower.endsWith(".txt"))
            return "text/plain";
        if (lower.endsWith(".md"))
            return "text/markdown";
        if (lower.endsWith(".png"))
            return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg"))
            return "image/jpeg";
        if (lower.endsWith(".pdf"))
            return "application/pdf";
        if (lower.endsWith(".csv"))
            return "text/csv";
        if (lower.endsWith(".json"))
            return "application/json";
        return "application/octet-stream";
    }

    private String escapeJson(String s) {
        if (s == null)
            return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r");
    }
}
