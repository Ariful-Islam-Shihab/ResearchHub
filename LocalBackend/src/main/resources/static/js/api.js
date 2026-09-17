// Global API Configuration
const API_CONFIG = {
    // In a dockerized/nginx environment, we use a relative path to leverage the proxy.
    // If run locally without a proxy via file:// or dev server, fallback to localhost:3000.
    BASE_URL: (window.location.protocol === 'file:' || window.location.port === '5500') 
        ? 'http://localhost:3000/api' 
        : '/api'
};
