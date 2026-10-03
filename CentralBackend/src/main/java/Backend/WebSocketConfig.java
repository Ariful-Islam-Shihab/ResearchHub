package Backend;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final DocumentSyncHandler documentSyncHandler;

    public WebSocketConfig(DocumentSyncHandler documentSyncHandler) {
        this.documentSyncHandler = documentSyncHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(documentSyncHandler, "/ws/latex").setAllowedOrigins("*");
    }
}
