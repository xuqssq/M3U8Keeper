// M3U8Keeper - Injected Script
// Network request interceptor for XHR and Fetch APIs
(function() {
  'use strict';
  
  // Professional console banner
  console.log(
    '\n' +
    '%c M3U8Keeper %c Network Interceptor %c Active \n',
    'background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); color: white; padding: 4px 8px; border-radius: 3px 0 0 3px; font-weight: bold;',
    'background: #764ba2; color: white; padding: 4px 8px;',
    'background: #95E77E; color: #2D3436; padding: 4px 8px; border-radius: 0 3px 3px 0; font-weight: bold;'
  );
  
  // 拦截XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._interceptedUrl = url;
    return originalXHROpen.apply(this, [method, url, ...args]);
  };
  
  XMLHttpRequest.prototype.send = function(...args) {
    const xhr = this;
    const url = xhr._interceptedUrl;
    
    // 监听响应
    xhr.addEventListener('load', function() {
      try {
        // 获取响应内容
        const responseText = xhr.responseText;
        // 获取响应头信息
        const contentLength = xhr.getResponseHeader('content-length');
        const contentType = xhr.getResponseHeader('content-type');
        
        // 发送消息到content script，包含响应内容和头信息
        window.postMessage({
          type: 'URL_INTERCEPTED',
          url: url,
          method: 'xhr',
          responseText: responseText,
          responseURL: xhr.responseURL,
          contentLength: contentLength,
          contentType: contentType
        }, '*');
      } catch (e) {
        // 如果无法获取响应内容，仍然发送URL
        window.postMessage({
          type: 'URL_INTERCEPTED',
          url: url,
          method: 'xhr',
          responseURL: xhr.responseURL
        }, '*');
      }
    });
    
    return originalXHRSend.apply(this, args);
  };
  
  // 拦截fetch
  const originalFetch = window.fetch;
  window.fetch = function(url, ...args) {
    const urlString = typeof url === 'string' ? url : url.url || url.href || '';
    
    // 包装原始fetch以获取响应内容
    return originalFetch.apply(this, [url, ...args]).then(async response => {
      try {
        // 克隆响应以便读取内容
        const clonedResponse = response.clone();
        const responseText = await clonedResponse.text();
        
        // 获取响应头信息
        const contentLength = response.headers.get('content-length');
        const contentType = response.headers.get('content-type');
        
        // 发送消息到content script，包含响应内容和头信息
        window.postMessage({
          type: 'URL_INTERCEPTED',
          url: urlString,
          method: 'fetch',
          responseText: responseText,
          responseURL: response.url,
          contentLength: contentLength,
          contentType: contentType
        }, '*');
      } catch (e) {
        // 如果无法获取响应内容，仍然发送URL
        window.postMessage({
          type: 'URL_INTERCEPTED',
          url: urlString,
          method: 'fetch',
          responseURL: response.url
        }, '*');
      }
      
      return response;
    });
  };
  
  console.log(
    '%c 🏅 %c Network interception initialized successfully',
    'background: #95E77E; color: #2D3436; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
    'color: #95E77E; padding: 2px 4px;'
  );
})();