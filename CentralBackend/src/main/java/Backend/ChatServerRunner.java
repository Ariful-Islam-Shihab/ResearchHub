package Backend;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

@Component
public class ChatServerRunner implements CommandLineRunner {

    @Autowired
    private ChatServer chatServer;

    @Override
    public void run(String... args) throws Exception {
        // Start the server in a new thread so it doesn't block the Spring Boot app
        Thread serverThread = new Thread(() -> {
            chatServer.startServer();
        });
        serverThread.start();
    }
}
