package Backend;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.ArrayList;
import java.util.List;

@Component
public class ChatServer {

    // Keep a list of all connected clients
    private final List<ClientHandler> clients = new ArrayList<>();

    @Value("${chat.server.port:9090}")
    private int port;

    public void startServer() {
        try {
            ServerSocket serverSocket = new ServerSocket(port);
            System.out.println("Central Chat Server started on port " + port);

            while (true) {
                // Wait for a new client to connect
                Socket clientSocket = serverSocket.accept();
                System.out.println("New client connected: " + clientSocket.getInetAddress());

                // Create a new thread for this client
                ClientHandler handler = new ClientHandler(clientSocket, this);
                synchronized(clients) {
                    clients.add(handler);
                }
                
                Thread thread = new Thread(handler);
                thread.start();
            }
        } catch (Exception e) {
            System.out.println("Error starting chat server: " + e.getMessage());
        }
    }

    // Send message to all connected clients that match the projectId
    public void broadcastMessage(String message, ClientHandler sender, String projectId) {
        synchronized(clients) {
            for (ClientHandler client : clients) {
                // Don't send the message back to the person who sent it
                if (client != sender) {
                    // If target is null, or matches the client's current project, broadcast it
                    if (projectId == null || projectId.equals(client.getProjectId())) {
                        client.sendMessage(message);
                    }
                }
            }
        }
    }

    // Remove client when they disconnect
    public void removeClient(ClientHandler client) {
        synchronized(clients) {
            clients.remove(client);
        }
    }
}

class ClientHandler implements Runnable {
    private Socket socket;
    private ChatServer server;
    private PrintWriter out;
    private BufferedReader in;
    private String projectId;

    public ClientHandler(Socket socket, ChatServer server) {
        this.socket = socket;
        this.server = server;
    }

    public String getProjectId() {
        return this.projectId;
    }

    private String extractProjectId(String json) {
        try {
            int index = json.indexOf("\"projectId\"");
            if (index != -1) {
                int colon = json.indexOf(":", index);
                if (colon != -1) {
                    int comma = json.indexOf(",", colon);
                    int brace = json.indexOf("}", colon);
                    int end = (comma != -1 && comma < brace) ? comma : (brace != -1 ? brace : json.length());
                    if (end != -1) {
                        String val = json.substring(colon + 1, end).replaceAll("[\"\\s]", "");
                        if (!val.equals("null") && !val.isEmpty()) {
                            return val;
                        }
                    }
                }
            }
        } catch (Exception e) {}
        return null;
    }

    @Override
    public void run() {
        try {
            in = new BufferedReader(new InputStreamReader(socket.getInputStream()));
            out = new PrintWriter(socket.getOutputStream(), true);

            String message;
            // Keep reading messages while connected
            while ((message = in.readLine()) != null) {
                System.out.println("Received message: " + message);
                
                String extractedId = extractProjectId(message);
                
                // Check if this is an AUTH message to update the projectId
                if (message.contains("\"type\":\"AUTH\"")) {
                    if (extractedId != null) {
                        this.projectId = extractedId;
                        System.out.println("Client set projectId to: " + this.projectId);
                    }
                }

                // Try to extract projectId from regular messages too
                String targetProject = this.projectId;
                if (!message.contains("\"type\":\"AUTH\"") && extractedId != null) {
                    targetProject = extractedId;
                }

                // Send it to everyone else sharing this project ID
                server.broadcastMessage(message, this, targetProject);
            }
        } catch (Exception e) {
            System.out.println("Client disconnected.");
        } finally {
            server.removeClient(this);
            try {
                if (socket != null && !socket.isClosed()) {
                    socket.close();
                }
            } catch (Exception e) {
                // Ignore
            }
        }
    }

    // Send a message to this specific client
    public void sendMessage(String message) {
        if (out != null) {
            out.println(message);
        }
    }
}
