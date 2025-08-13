// Content script - 注入到页面中捕获URL请求

(function() {
  'use strict';
  
  // 检查URL是否需要捕获
  function shouldCaptureUrl(url) {
    return url.includes('1024paas.showmebug.com/rtc/api/agora/playback/media') ||
           url.includes('.m3u8');
  }
  
  // 向background script发送捕获的URL
  function sendUrlToBackground(url) {
    if (shouldCaptureUrl(url)) {
      chrome.runtime.sendMessage({
        type: 'URL_CAPTURED',
        url: url
      }, response => {
        if (response && response.success) {
          console.log('URL已发送到后台:', url);
        }
      });
    }
  }
  
  // 创建一个独立的脚本文件来注入
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('src/content/injected.js');
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
  
  // 监听来自注入脚本的消息
  window.addEventListener('message', (event) => {
    // 只处理来自当前页面的消息
    if (event.source !== window) return;
    
    if (event.data && event.data.type === 'URL_INTERCEPTED') {
      sendUrlToBackground(event.data.url);
    }
  });
  
  // 额外监听资源加载（用于捕获直接通过标签加载的资源）
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        // 检查video和audio标签
        if (node.nodeName === 'VIDEO' || node.nodeName === 'AUDIO') {
          const src = node.src || node.currentSrc;
          if (src) {
            sendUrlToBackground(src);
          }
          
          // 检查source子元素
          const sources = node.querySelectorAll('source');
          sources.forEach(source => {
            if (source.src) {
              sendUrlToBackground(source.src);
            }
          });
        }
        
        // 检查所有带src属性的元素
        if (node.src && shouldCaptureUrl(node.src)) {
          sendUrlToBackground(node.src);
        }
      });
    });
  });
  
  // 开始观察DOM变化
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  
  console.log('ShowMeBug URL Catcher: Content script已加载');
})();