package com.researchhub.localbackend;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.FileInputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/local/datasets")
@CrossOrigin(origins = "*") // Allow frontend to call directly
public class DatasetTransferController {

    // LIST all files in a dataset directory
    @GetMapping("/list-files")
    public Map<String, Object> listFiles(@RequestParam("path") String pathStr) {
        Map<String, Object> response = new HashMap<>();
        try {
            File sourceFolder = new File(pathStr);
            if (sourceFolder.exists() == false || sourceFolder.isDirectory() == false) {
                response.put("success", false);
                response.put("message", "Invalid directory path");
                return response;
            }

            List<Map<String, Object>> fileList = new ArrayList<>();
            File[] files = sourceFolder.listFiles();
            if (files != null) {
                for (int i = 0; i < files.length; i++) {
                    File file = files[i];
                    if (file.isFile()) {
                        Map<String, Object> fileInfo = new HashMap<>();
                        fileInfo.put("name", file.getName());
                        fileInfo.put("size", file.length());
                        
                        String name = file.getName();
                        int dotIdx = name.lastIndexOf('.');
                        if (dotIdx > 0) {
                            fileInfo.put("type", name.substring(dotIdx));
                        } else {
                            fileInfo.put("type", "");
                        }
                        fileList.add(fileInfo);
                    }
                }
            }

            response.put("success", true);
            response.put("data", fileList);
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Error listing files: " + e.getMessage());
        }
        return response;
    }

    // READ an individual file's bytes
    @GetMapping("/read-file")
    public ResponseEntity<byte[]> readFile(@RequestParam("path") String pathStr, @RequestParam("fileName") String fileName) {
        try {
            File file = new File(pathStr, fileName);
            if (file.exists() == false || file.isFile() == false) {
                return ResponseEntity.badRequest().build();
            }

            byte[] fileBytes = Files.readAllBytes(file.toPath());
            
            HttpHeaders headers = new HttpHeaders();
            headers.add("Content-Disposition", "attachment; filename=\"" + fileName + "\"");
            
            return ResponseEntity.ok()
                    .headers(headers)
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .body(fileBytes);

        } catch (Exception e) {
            System.out.println("Error reading file: " + e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    // WRITE an individual file
    @PostMapping("/write-file")
    public Map<String, Object> writeFile(@RequestParam("path") String pathStr, 
                                         @RequestParam("fileName") String fileName,
                                         @RequestParam("file") MultipartFile file) {
        Map<String, Object> response = new HashMap<>();
        try {
            File targetFolder = new File(pathStr);
            if (targetFolder.exists() == false) {
                targetFolder.mkdirs();
            }

            File targetFile = new File(targetFolder, fileName);
            file.transferTo(targetFile);

            response.put("success", true);
            response.put("message", "File saved");
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Error saving file: " + e.getMessage());
        }
        return response;
    }
}
