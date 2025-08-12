// 注入到页面上下文的脚本，用于拦截XHR和fetch请求
(function() {
  'use strict';
  
  // 拦截XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    // 发送消息到content script
    window.postMessage({
      type: 'URL_INTERCEPTED',
      url: url,
      method: 'xhr'
    }, '*');
    
    return originalXHROpen.apply(this, [method, url, ...args]);
  };
  
  // 拦截fetch
  const originalFetch = window.fetch;
  window.fetch = function(url, ...args) {
    const urlString = typeof url === 'string' ? url : url.url || url.href || '';
    
    // 发送消息到content script
    window.postMessage({
      type: 'URL_INTERCEPTED',
      url: urlString,
      method: 'fetch'
    }, '*');
    
    return originalFetch.apply(this, [url, ...args]);
  };
  
  console.log('ShowMeBug URL Catcher: 网络请求拦截已启动');
})();