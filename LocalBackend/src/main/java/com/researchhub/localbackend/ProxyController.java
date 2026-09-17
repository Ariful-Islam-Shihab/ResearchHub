package com.researchhub.localbackend;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Autowired;

import java.net.URI;
import java.util.Enumeration;
import java.util.List;

@RestController
@CrossOrigin(origins = "*", allowedHeaders = "*", methods = {RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT, RequestMethod.DELETE, RequestMethod.OPTIONS})
public class ProxyController {

    @Value("${central.backend.url}")
    private String centralBackendUrl;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @RequestMapping(value = "/api/**")
    public ResponseEntity<byte[]> proxyRequest(HttpServletRequest request, @RequestBody(required = false) byte[] body) {
        try {
            RestTemplate restTemplate = new RestTemplate();
            
            // Build the URL to send the request to
            String targetUrl = centralBackendUrl + request.getRequestURI();
            if (request.getQueryString() != null) {
                targetUrl = targetUrl + "?" + request.getQueryString();
            }

            // Copy all the headers
            HttpHeaders headers = new HttpHeaders();
            Enumeration<String> headerNames = request.getHeaderNames();
            while (headerNames.hasMoreElements()) {
                String headerName = headerNames.nextElement();
                // Skip the "host" header
                if (headerName.equalsIgnoreCase("host") == false && headerName.equalsIgnoreCase("content-length") == false) {
                    String headerValue = request.getHeader(headerName);
                    headers.add(headerName, headerValue);
                }
            }

            // Create the request
            HttpEntity<byte[]> httpEntity = new HttpEntity<>(body, headers);
            
            // Check which method to use (GET, POST, PUT, etc)
            String reqMethod = request.getMethod();
            HttpMethod method = HttpMethod.GET; // default
            
            if (reqMethod.equals("POST")) {
                method = HttpMethod.POST;
            } else if (reqMethod.equals("PUT")) {
                method = HttpMethod.PUT;
            } else if (reqMethod.equals("DELETE")) {
                method = HttpMethod.DELETE;
            } else if (reqMethod.equals("OPTIONS")) {
                method = HttpMethod.OPTIONS;
            }

            // Send the request and return the result
            URI uri = new URI(targetUrl);
            return restTemplate.exchange(uri, method, httpEntity, byte[].class);

        } catch (Exception e) {
            System.out.println("Error running proxy: " + e.getMessage());
            
            // Create a simple error response
            byte[] errorBytes = "Proxy Error".getBytes();
            return ResponseEntity.status(500).body(errorBytes);
        }
    }

    @PostMapping(value = "/api/projects/{projectId}/datasets/{datasetId}/files/upload", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<byte[]> proxyUpload(
            @PathVariable String projectId,
            @PathVariable String datasetId,
            @RequestParam("userId") String userId,
            @RequestParam("fileName") String fileName,
            @RequestParam("fileSize") String fileSize,
            @RequestParam("fileType") String fileType,
            @RequestParam("file") org.springframework.web.multipart.MultipartFile file,
            HttpServletRequest request) {
        try {
            RestTemplate restTemplate = new RestTemplate();
            String targetUrl = centralBackendUrl + "/api/projects/" + projectId + "/datasets/" + datasetId + "/files/upload";
            
            org.springframework.util.LinkedMultiValueMap<String, Object> body = new org.springframework.util.LinkedMultiValueMap<>();
            body.add("userId", userId);
            body.add("fileName", fileName);
            body.add("fileSize", fileSize);
            body.add("fileType", fileType);
            
            // Convert MultipartFile to Resource
            org.springframework.core.io.Resource fileResource = new org.springframework.core.io.ByteArrayResource(file.getBytes()) {
                @Override
                public String getFilename() {
                    return file.getOriginalFilename() != null ? file.getOriginalFilename() : "file";
                }
            };
            body.add("file", fileResource);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(org.springframework.http.MediaType.MULTIPART_FORM_DATA);
            
            // Pass authorization if any
            String auth = request.getHeader("Authorization");
            if (auth != null) headers.set("Authorization", auth);

            HttpEntity<org.springframework.util.MultiValueMap<String, Object>> httpEntity = new HttpEntity<>(body, headers);
            
            return restTemplate.postForEntity(targetUrl, httpEntity, byte[].class);
        } catch (Exception e) {
            System.out.println("Error running upload proxy: " + e.getMessage());
            return ResponseEntity.status(500).body(("Upload proxy error: " + e.getMessage()).getBytes());
        }
    }

    @GetMapping("/api/local/open-folder")
    public ResponseEntity<String> openFolder(@RequestParam String folderName) {
        String os = System.getProperty("os.name").toLowerCase();
        if (!os.contains("win")) {
            return ResponseEntity.status(501).body("Folder opening is only supported when LocalBackend is running natively on Windows. It will not work inside a Linux Docker container.");
        }

        try {
            // Check cache first
            List<String> cachedPaths = jdbcTemplate.query(
                "SELECT absolute_path FROM local_paths WHERE folder_name = ?",
                (rs, rowNum) -> rs.getString("absolute_path"),
                folderName
            );
            
            if (!cachedPaths.isEmpty()) {
                String cachedPath = cachedPaths.get(0);
                new ProcessBuilder("explorer.exe", cachedPath).start();
                return ResponseEntity.ok("Opened from cache: " + cachedPath);
            }

            // Clean the folderName to prevent command injection
            folderName = folderName.replace("'", "''");

            // Run a quick powershell search in user profile's Downloads, Desktop, Documents
            String psCommand = "Get-ChildItem -Path $env:USERPROFILE\\Downloads, $env:USERPROFILE\\Desktop, $env:USERPROFILE\\Documents -Recurse -Depth 3 -Filter '" + folderName + "' -Directory -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName";
            
            ProcessBuilder pb = new ProcessBuilder("powershell.exe", "-Command", psCommand);
            Process process = pb.start();
            process.waitFor();
            
            java.util.Scanner s = new java.util.Scanner(process.getInputStream()).useDelimiter("\\A");
            String result = s.hasNext() ? s.next().trim() : "";
            
            if (!result.isEmpty()) {
                // Save to cache
                jdbcTemplate.update("INSERT OR REPLACE INTO local_paths (folder_name, absolute_path) VALUES (?, ?)", folderName, result);
                new ProcessBuilder("explorer.exe", result).start();
                return ResponseEntity.ok("Opened: " + result);
            } else {
                // fallback to try files instead of directories
                String psFileCommand = "Get-ChildItem -Path $env:USERPROFILE\\Downloads, $env:USERPROFILE\\Desktop, $env:USERPROFILE\\Documents -Recurse -Depth 3 -Filter '" + folderName + "' -File -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty DirectoryName";
                ProcessBuilder pbFile = new ProcessBuilder("powershell.exe", "-Command", psFileCommand);
                Process processFile = pbFile.start();
                processFile.waitFor();
                
                java.util.Scanner sf = new java.util.Scanner(processFile.getInputStream()).useDelimiter("\\A");
                String resultFile = sf.hasNext() ? sf.next().trim() : "";
                
                if (!resultFile.isEmpty()) {
                    // Save to cache
                    jdbcTemplate.update("INSERT OR REPLACE INTO local_paths (folder_name, absolute_path) VALUES (?, ?)", folderName, resultFile);
                    new ProcessBuilder("explorer.exe", resultFile).start();
                    return ResponseEntity.ok("Opened: " + resultFile);
                }
                
                return ResponseEntity.status(404).body("Not found in standard directories");
            }
        } catch (Exception e) {
            return ResponseEntity.status(500).body("Error: " + e.getMessage());
        }
    }
}
