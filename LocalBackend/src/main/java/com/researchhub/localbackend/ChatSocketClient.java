package com.researchhub.localbackend;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.Socket;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;

@Service
public class ChatSocketClient {

    @Value("${central.chat.host:localhost}")
    private String centralChatHost;

    @Value("${central.chat.port:9090}")
    private int centralChatPort;

    private Socket socket;
    private PrintWriter out;
    private BufferedReader in;
    private Thread listenerThread;
    private final ConcurrentLinkedQueue<String> messageQueue = new ConcurrentLinkedQueue<>();
    private boolean isRunning = true;

    @PostConstruct
    public void init() {
        connectToServer();
    }

    private void connectToServer() {
        try {
            socket = new Socket(centralChatHost, centralChatPort);
            out = new PrintWriter(socket.getOutputStream(), true);
            in = new BufferedReader(new InputStreamReader(socket.getInputStream()));
            
            System.out.println("Connected to Central Chat Server at " + centralChatHost + ":" + centralChatPort);

            // Start a thread to listen for incoming messages
            listenerThread = new Thread(() -> {
                try {
                    String message;
                    while (isRunning && (message = in.readLine()) != null) {
                        messageQueue.add(message);
                    }
                } catch (Exception e) {
                    if (isRunning) {
                        System.out.println("Disconnected from Central Chat Server: " + e.getMessage());
                        // Optional: attempt reconnect
                    }
                }
            });
            listenerThread.start();
            
        } catch (Exception e) {
            System.out.println("Could not connect to Central Chat Server: " + e.getMessage());
        }
    }

    public void sendMessage(String message) {
        if (out != null) {
            out.println(message);
        } else {
            System.out.println("Cannot send message, not connected to server.");
        }
    }

    public List<String> pollMessages() {
        List<String> messages = new ArrayList<>();
        String msg;
        while ((msg = messageQueue.poll()) != null) {
            messages.add(msg);
        }
        return messages;
    }

    @PreDestroy
    public void cleanup() {
        isRunning = false;
        try {
            if (socket != null) {
                socket.close();
            }
        } catch (Exception e) {
            // Ignore
        }
    }
}
