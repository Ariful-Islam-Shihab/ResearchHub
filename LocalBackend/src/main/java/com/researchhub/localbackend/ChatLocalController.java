package com.researchhub.localbackend;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@CrossOrigin(origins = "*")
@RequestMapping("/local/chat")
public class ChatLocalController {

    @Autowired
    private ChatSocketClient chatSocketClient;

    @PostMapping("/send")
    public Map<String, Object> sendMessage(@RequestBody Map<String, String> payload) {
        Map<String, Object> response = new HashMap<>();
        String message = payload.get("message");
        
        if (message != null && !message.trim().isEmpty()) {
            chatSocketClient.sendMessage(message);
            response.put("success", true);
        } else {
            response.put("success", false);
            response.put("error", "Message cannot be empty");
        }
        
        return response;
    }

    @GetMapping("/poll")
    public Map<String, Object> pollMessages() {
        Map<String, Object> response = new HashMap<>();
        List<String> messages = chatSocketClient.pollMessages();
        
        response.put("success", true);
        response.put("messages", messages);
        
        return response;
    }
}
