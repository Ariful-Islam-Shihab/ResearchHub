package Backend;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import jakarta.annotation.PostConstruct;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;

@Service
public class FileStorageService {

    // Dynamically get the parent of the current working directory (which is ResearchHub) and append Workspace
    private final String WORKSPACE_DIR = Paths.get(System.getProperty("user.dir")).getParent().resolve("Workspace").toString();

    @PostConstruct
    public void init() {
        try {
            Files.createDirectories(Paths.get(WORKSPACE_DIR));
        } catch (IOException e) {
            throw new RuntimeException("Could not initialize local workspace folder at " + WORKSPACE_DIR);
        }
    }

    public String storeFile(int projectId, MultipartFile file) {
        try {
            // Create project-specific directory
            Path projectDir = Paths.get(WORKSPACE_DIR, "Project_" + projectId);
            if (!Files.exists(projectDir)) {
                Files.createDirectories(projectDir);
            }

            // Copy file to the local directory
            String fileName = file.getOriginalFilename();
            if(fileName == null || fileName.isEmpty()) {
                fileName = "unnamed_file_" + System.currentTimeMillis();
            }
            
            Path targetLocation = projectDir.resolve(fileName);
            Files.copy(file.getInputStream(), targetLocation, StandardCopyOption.REPLACE_EXISTING);

            return targetLocation.toString();
        } catch (IOException ex) {
            throw new RuntimeException("Could not store file. Please try again!", ex);
        }
    }

    public File loadFile(String filePath) {
        File file = new File(filePath);
        if(file.exists()) {
            return file;
        }
        return null;
    }
}
