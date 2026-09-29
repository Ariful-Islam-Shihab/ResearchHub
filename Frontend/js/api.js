// Global API Configuration
const API_CONFIG = {
    // In a dockerized/nginx environment, we use a relative path to leverage the proxy.
    // If run locally without a proxy via file:// or dev server, fallback to localhost:3000.
    BASE_URL: (window.location.protocol === 'file:' || window.location.port === '5500') 
        ? 'http://localhost:3000/api' 
        : '/api'
, getLocalBaseUrl: function() { let urlStr = this.BASE_URL; if (urlStr.startsWith('http')) { let url = new URL(urlStr); url.port = '3000'; url.pathname = '/local'; return url.toString().replace(/\/$/, ''); } else { return urlStr.replace('/api', '/local'); } } };
