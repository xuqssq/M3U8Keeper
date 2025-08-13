// 注入到页面上下文的脚本，用于拦截XHR和fetch请求
(function() {
  'use strict';
  
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
        // 发送消息到content script，包含响应内容
        window.postMessage({
          type: 'URL_INTERCEPTED',
          url: url,
          method: 'xhr',
          responseText: responseText,
          responseURL: xhr.responseURL
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
        
        // 发送消息到content script，包含响应内容
        window.postMessage({
          type: 'URL_INTERCEPTED',
          url: urlString,
          method: 'fetch',
          responseText: responseText,
          responseURL: response.url
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
  
  console.log('M3U8Keeper: 网络请求拦截已启动');
})();