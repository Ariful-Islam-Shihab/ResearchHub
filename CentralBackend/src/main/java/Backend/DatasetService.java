package Backend;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.*;

@RestController
@CrossOrigin(origins = "*", allowedHeaders = "*", methods = {RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT, RequestMethod.DELETE, RequestMethod.OPTIONS})
@RequestMapping("/api/projects/{projectId}/datasets")
public class DatasetService {

    @Autowired
    private JdbcTemplate db;

    // ─── LIST all datasets for a project (with current user's sync status) ───
    @GetMapping
    public Map<String, Object> listDatasets(@PathVariable int projectId,
                                            @RequestParam(required = false) Integer userId) {
        Map<String, Object> response = new HashMap<>();
        try {
            String sql = """
                SELECT d.id, d.project_id, d.name, d.description, d.version, d.total_size, d.file_count,
                       d.format, d.checksum, d.added_by, d.local_path, d.created_at, d.updated_at,
                       u.full_name AS added_by_name,
                       dss.status AS my_sync_status,
                       dss.synced_version AS my_synced_version,
                       dss.local_path AS my_local_path,
                       dss.last_synced_at AS my_last_synced_at,
                       dss.progress AS my_progress
                FROM datasets d
                JOIN users u ON d.added_by = u.id
                LEFT JOIN dataset_sync_status dss
                    ON dss.dataset_id = d.id AND dss.user_id = ?
                WHERE d.project_id = ?
                ORDER BY d.created_at DESC
                """;

            int uid = (userId != null) ? userId : 0;
            List<Map<String, Object>> datasets = db.queryForList(sql, uid, projectId);

            response.put("success", true);
            response.put("data", datasets);
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    // ─── GET single dataset detail ───────────────────────────────────────────
    @GetMapping("/{datasetId}")
    public Map<String, Object> getDataset(@PathVariable int projectId,
                                          @PathVariable int datasetId,
                                          @RequestParam(required = false) Integer userId) {
        Map<String, Object> response = new HashMap<>();
        try {
            String sql = """
                SELECT d.*,
                       u.full_name AS added_by_name
                FROM datasets d
                JOIN users u ON d.added_by = u.id
                WHERE d.id = ? AND d.project_id = ?
                """;
            List<Map<String, Object>> rows = db.queryForList(sql, datasetId, projectId);
            if (rows.isEmpty()) {
                response.put("success", false);
                response.put("message", "Dataset not found.");
                return response;
            }
            Map<String, Object> dataset = rows.get(0);

            // Get all sync statuses for this dataset
            String syncSql = """
                SELECT dss.*, u.full_name AS user_name
                FROM dataset_sync_status dss
                JOIN users u ON dss.user_id = u.id
                WHERE dss.dataset_id = ?
                ORDER BY dss.last_synced_at DESC
                """;
            List<Map<String, Object>> syncStatuses = db.queryForList(syncSql, datasetId);
            dataset.put("sync_statuses", syncStatuses);

            response.put("success", true);
            response.put("data", dataset);
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    // ─── CREATE (register) a new dataset ─────────────────────────────────────
    @PostMapping
    public Map<String, Object> createDataset(@PathVariable int projectId,
                                             @RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            String name = payload.get("name").toString().trim();
            String description = payload.containsKey("description") && payload.get("description") != null
                    ? payload.get("description").toString().trim() : "";
            String version = payload.containsKey("version") && payload.get("version") != null
                    ? payload.get("version").toString().trim() : "v1.0";
            long totalSize = payload.containsKey("totalSize")
                    ? Long.parseLong(payload.get("totalSize").toString()) : 0;
            int fileCount = payload.containsKey("fileCount")
                    ? Integer.parseInt(payload.get("fileCount").toString()) : 0;
            String format = payload.containsKey("format") && payload.get("format") != null
                    ? payload.get("format").toString().trim() : "";
            String checksum = payload.containsKey("checksum") && payload.get("checksum") != null
                    ? payload.get("checksum").toString().trim() : "";
            int addedBy = Integer.parseInt(payload.get("addedBy").toString());
            String localPath = payload.containsKey("localPath") && payload.get("localPath") != null
                    ? payload.get("localPath").toString().trim() : "";

            if (name.isEmpty()) {
                response.put("success", false);
                response.put("message", "Dataset name is required.");
                return response;
            }

            // Insert the dataset
            db.update("""
                INSERT INTO datasets (project_id, name, description, version, total_size, file_count, format, checksum, added_by, local_path)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, projectId, name, description, version, totalSize, fileCount, format, checksum, addedBy, localPath);

            int datasetId = db.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);

            // Auto-set the adder as SYNCHRONIZED
            db.update("""
                INSERT INTO dataset_sync_status (dataset_id, user_id, status, synced_version, local_path, last_synced_at)
                VALUES (?, ?, 'SYNCHRONIZED', ?, ?, NOW())
                """, datasetId, addedBy, version, localPath);

            // Auto-set all other project members as NOT_SYNCED
            List<Map<String, Object>> otherMembers = db.queryForList(
                    "SELECT user_id FROM project_members WHERE project_id = ? AND user_id != ?",
                    projectId, addedBy);
            for (Map<String, Object> member : otherMembers) {
                int memberId = ((Number) member.get("user_id")).intValue();
                db.update("""
                    INSERT INTO dataset_sync_status (dataset_id, user_id, status, synced_version)
                    VALUES (?, ?, 'NOT_SYNCED', NULL)
                    """, datasetId, memberId);
            }

            // Return the created dataset
            List<Map<String, Object>> created = db.queryForList(
                    "SELECT d.*, u.full_name AS added_by_name FROM datasets d JOIN users u ON d.added_by = u.id WHERE d.id = ?",
                    datasetId);
            response.put("success", true);
            response.put("data", created.isEmpty() ? null : created.get(0));
            response.put("message", "Dataset registered successfully.");
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    // ─── UPDATE dataset metadata ─────────────────────────────────────────────
    @PutMapping("/{datasetId}")
    public Map<String, Object> updateDataset(@PathVariable int projectId,
                                             @PathVariable int datasetId,
                                             @RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            List<String> setClauses = new ArrayList<>();
            List<Object> params = new ArrayList<>();

            if (payload.containsKey("name")) {
                setClauses.add("name = ?");
                params.add(payload.get("name").toString().trim());
            }
            if (payload.containsKey("description")) {
                setClauses.add("description = ?");
                params.add(payload.get("description") != null ? payload.get("description").toString().trim() : "");
            }
            if (payload.containsKey("version")) {
                setClauses.add("version = ?");
                params.add(payload.get("version").toString().trim());
            }
            if (payload.containsKey("format")) {
                setClauses.add("format = ?");
                params.add(payload.get("format") != null ? payload.get("format").toString().trim() : "");
            }
            if (payload.containsKey("totalSize")) {
                setClauses.add("total_size = ?");
                params.add(Long.parseLong(payload.get("totalSize").toString()));
            }
            if (payload.containsKey("fileCount")) {
                setClauses.add("file_count = ?");
                params.add(Integer.parseInt(payload.get("fileCount").toString()));
            }
            if (payload.containsKey("localPath")) {
                setClauses.add("local_path = ?");
                params.add(payload.get("localPath") != null ? payload.get("localPath").toString().trim() : "");
            }

            if (setClauses.isEmpty()) {
                response.put("success", false);
                response.put("message", "No fields to update.");
                return response;
            }

            params.add(datasetId);
            params.add(projectId);

            String sql = "UPDATE datasets SET " + String.join(", ", setClauses) + " WHERE id = ? AND project_id = ?";
            db.update(sql, params.toArray());

            // If version changed, mark other members as UPDATE_AVAILABLE
            if (payload.containsKey("version")) {
                String newVersion = payload.get("version").toString().trim();
                int updatedBy = payload.containsKey("userId") ? Integer.parseInt(payload.get("userId").toString()) : 0;

                if (updatedBy > 0) {
                    // Update the updater's sync status
                    db.update("""
                        UPDATE dataset_sync_status SET status = 'SYNCHRONIZED', synced_version = ?, last_synced_at = NOW()
                        WHERE dataset_id = ? AND user_id = ?
                        """, newVersion, datasetId, updatedBy);

                    // Mark others as UPDATE_AVAILABLE
                    db.update("""
                        UPDATE dataset_sync_status SET status = 'UPDATE_AVAILABLE'
                        WHERE dataset_id = ? AND user_id != ?
                        """, datasetId, updatedBy);
                }
            }

            List<Map<String, Object>> updated = db.queryForList(
                    "SELECT d.*, u.full_name AS added_by_name FROM datasets d JOIN users u ON d.added_by = u.id WHERE d.id = ?",
                    datasetId);
            response.put("success", true);
            response.put("data", updated.isEmpty() ? null : updated.get(0));
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    // ─── DELETE a dataset ────────────────────────────────────────────────────
    @DeleteMapping("/{datasetId}")
    public Map<String, Object> deleteDataset(@PathVariable int projectId,
                                             @PathVariable int datasetId) {
        Map<String, Object> response = new HashMap<>();
        try {
            // Cascade deletes will remove sync_status rows
            int rows = db.update("DELETE FROM datasets WHERE id = ? AND project_id = ?", datasetId, projectId);
            if (rows > 0) {
                response.put("success", true);
                response.put("message", "Dataset removed.");
            } else {
                response.put("success", false);
                response.put("message", "Dataset not found.");
            }
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    // ─── GET sync statuses for all users of a dataset ────────────────────────
    @GetMapping("/{datasetId}/sync-status")
    public Map<String, Object> getSyncStatuses(@PathVariable int projectId,
                                               @PathVariable int datasetId) {
        Map<String, Object> response = new HashMap<>();
        try {
            String sql = """
                SELECT dss.*, u.full_name AS user_name
                FROM dataset_sync_status dss
                JOIN users u ON dss.user_id = u.id
                WHERE dss.dataset_id = ?
                ORDER BY u.full_name
                """;
            List<Map<String, Object>> statuses = db.queryForList(sql, datasetId);
            response.put("success", true);
            response.put("data", statuses);
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    // ─── UPDATE a user's sync status ─────────────────────────────────────────
    @PutMapping("/{datasetId}/sync-status")
    public Map<String, Object> updateSyncStatus(@PathVariable int projectId,
                                                @PathVariable int datasetId,
                                                @RequestBody Map<String, Object> payload) {
        Map<String, Object> response = new HashMap<>();
        try {
            int userId = Integer.parseInt(payload.get("userId").toString());
            String status = payload.get("status").toString();

            List<String> setClauses = new ArrayList<>();
            List<Object> params = new ArrayList<>();

            setClauses.add("status = ?");
            params.add(status);

            if (payload.containsKey("syncedVersion")) {
                setClauses.add("synced_version = ?");
                params.add(payload.get("syncedVersion").toString());
            }
            if (payload.containsKey("localPath")) {
                setClauses.add("local_path = ?");
                params.add(payload.get("localPath").toString());
            }
            if (payload.containsKey("progress")) {
                setClauses.add("progress = ?");
                params.add(Integer.parseInt(payload.get("progress").toString()));
            }
            if ("SYNCHRONIZED".equals(status)) {
                setClauses.add("last_synced_at = NOW()");
                setClauses.add("progress = 100");
            }

            params.add(datasetId);
            params.add(userId);

            String sql = "UPDATE dataset_sync_status SET " + String.join(", ", setClauses)
                    + " WHERE dataset_id = ? AND user_id = ?";
            int rows = db.update(sql, params.toArray());

            if (rows == 0) {
                // Insert if not exists
                db.update("""
                    INSERT INTO dataset_sync_status (dataset_id, user_id, status) VALUES (?, ?, ?)
                    """, datasetId, userId, status);
            }

            response.put("success", true);
            response.put("message", "Sync status updated.");
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Database error: " + e.getMessage());
        }
        return response;
    }

    // UPLOAD an individual file to dataset_files table
    @PostMapping("/{datasetId}/files/upload")
    public Map<String, Object> uploadDatasetFile(@PathVariable int projectId,
                                                  @PathVariable int datasetId,
                                                  @RequestParam("userId") int userId,
                                                  @RequestParam("fileName") String fileName,
                                                  @RequestParam("fileSize") long fileSize,
                                                  @RequestParam("fileType") String fileType,
                                                  @RequestParam("file") MultipartFile file) {
        Map<String, Object> response = new HashMap<>();
        try {
            // First check if the dataset belongs to the project
            Integer id = db.queryForObject("SELECT id FROM datasets WHERE id = ? AND project_id = ?",
                    Integer.class, datasetId, projectId);
            if (id == null) {
                throw new Exception("Dataset not found in this project");
            }

            // Check if file with same name already exists in this dataset, if so delete it (overwrite)
            db.update("DELETE FROM dataset_files WHERE dataset_id = ? AND file_name = ?", datasetId, fileName);

            byte[] fileBytes = file.getBytes();
            db.update("INSERT INTO dataset_files (dataset_id, file_name, file_size, file_type, file_data, uploaded_by) " +
                      "VALUES (?, ?, ?, ?, ?, ?)",
                    datasetId, fileName, fileSize, fileType, fileBytes, userId);

            // Also update the dataset size if we want to, but skip for simplicity in this beginner version

            response.put("success", true);
            response.put("message", "File uploaded to database.");
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Upload error: " + e.getMessage());
        }
        return response;
    }

    // LIST files in the dataset_files table
    @GetMapping("/{datasetId}/files")
    public Map<String, Object> listDatasetFiles(@PathVariable int projectId,
                                                @PathVariable int datasetId) {
        Map<String, Object> response = new HashMap<>();
        try {
            List<Map<String, Object>> files = db.queryForList(
                    "SELECT id, file_name, file_size, file_type, uploaded_by, uploaded_at FROM dataset_files WHERE dataset_id = ?",
                    datasetId);
            response.put("success", true);
            response.put("files", files);
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Error listing files: " + e.getMessage());
        }
        return response;
    }

    // DOWNLOAD a specific file from the database
    @GetMapping("/{datasetId}/files/{fileId}/download")
    public ResponseEntity<byte[]> downloadDatasetFile(@PathVariable int projectId,
                                                      @PathVariable int datasetId,
                                                      @PathVariable int fileId) {
        try {
            Map<String, Object> fileInfo = db.queryForMap(
                    "SELECT file_name, file_data FROM dataset_files WHERE id = ? AND dataset_id = ?",
                    fileId, datasetId);

            if (fileInfo == null || fileInfo.get("file_data") == null) {
                return ResponseEntity.notFound().build();
            }

            byte[] fileBytes = (byte[]) fileInfo.get("file_data");
            String fileName = (String) fileInfo.get("file_name");

            HttpHeaders headers = new HttpHeaders();
            headers.add("Content-Disposition", "attachment; filename=\"" + fileName + "\"");

            return ResponseEntity.ok()
                    .headers(headers)
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .body(fileBytes);
        } catch (Exception e) {
            System.out.println("Error downloading file: " + e.getMessage());
            return ResponseEntity.notFound().build();
        }
    }
}
