// M3U8Keeper - Content Script
// Captures and analyzes network requests for M3U8 media files

(function () {
  "use strict";
  
  // Professional console banner
  console.log(
    
    '%c M3U8Keeper %c Content Script %c Loaded ',
    'background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); color: white; padding: 4px 8px; border-radius: 3px 0 0 3px; font-weight: bold;',
    'background: #764ba2; color: white; padding: 4px 8px;',
    'background: #4ECDC4; color: white; padding: 4px 8px; border-radius: 0 3px 3px 0; font-weight: bold;'
  );

  // 检查URL是否需要捕获
  function shouldCaptureUrl(url) {
    return (
      url.includes("1024paas.showmebug.com/rtc/api/agora/playback/media") ||
      url.includes(".m3u8")
    );
  }

  // 检查响应内容是否包含m3u8特征
  function isM3U8Content(responseText) {
    if (!responseText || typeof responseText !== "string") {
      return false;
    }

    // M3U8文件的特征标识
    const m3u8Signatures = [
      "#EXTM3U", // M3U8文件必须以此开头
      "#EXT-X-VERSION", // 版本标识
      "#EXT-X-TARGETDURATION", // 目标时长
      "#EXT-X-MEDIA-SEQUENCE", // 媒体序列
      "#EXTINF:", // 片段信息
      "#EXT-X-STREAM-INF", // 流信息
      "#EXT-X-PLAYLIST-TYPE", // 播放列表类型
      "#EXT-X-KEY", // 加密信息
      "#EXT-X-ENDLIST", // 结束标记
    ];

    // 检查是否包含M3U8特征
    return m3u8Signatures.some((signature) => responseText.includes(signature));
  }

  // 向background script发送捕获的URL
  function sendUrlToBackground(url, responseText, contentLength, contentType) {
    // 首先检查URL是否匹配
    if (shouldCaptureUrl(url)) {
      //匹配也要检测是否包含m3u8特征
      if (responseText && isM3U8Content(responseText)) {
        chrome.runtime.sendMessage(
          {
            type: "URL_CAPTURED",
            url: url,
            contentLength: contentLength,
            contentType: contentType,
          },
          (response) => {
            if (response && response.success) {
              console.log(
                '%c 🎯 CAPTURED %c ' + truncateUrl(url),
                'background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
                'color: #667eea; padding: 2px 4px;'
              );
            }
          }
        );
      }

      return;
    }

    // 如果URL不匹配，检查响应内容是否包含M3U8特征
    if (responseText && isM3U8Content(responseText)) {
      chrome.runtime.sendMessage(
        {
          type: "URL_CAPTURED",
          url: url,
          isM3U8Content: true,
          contentLength: contentLength,
          contentType: contentType,
        },
        (response) => {
          if (response && response.success) {
            console.log(
              '%c 🎯 M3U8 DETECTED %c ' + truncateUrl(url),
              'background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
              'color: #667eea; padding: 2px 4px;'
            );
          }
        }
      );
    }
  }

  // 防止重复注入 - 检查是否已经注入过
  if (!window.__m3u8KeeperInjected) {
    window.__m3u8KeeperInjected = true;
    
    // 创建一个独立的脚本文件来注入
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("src/content/injected.js");
    script.setAttribute('data-m3u8keeper', 'injected');
    script.onload = function () {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }

  // 监听来自注入脚本的消息
  window.addEventListener("message", (event) => {
    // 只处理来自当前页面的消息
    if (event.source !== window) return;

    if (event.data && event.data.type === "URL_INTERCEPTED") {
      // 传递URL、响应内容和头信息
      const url = event.data.responseURL || event.data.url;
      sendUrlToBackground(
        url, 
        event.data.responseText,
        event.data.contentLength,
        event.data.contentType
      );
    }
  });

  // 额外监听资源加载（用于捕获直接通过标签加载的资源）
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        // 检查video和audio标签
        if (node.nodeName === "VIDEO" || node.nodeName === "AUDIO") {
          const src = node.src || node.currentSrc;
          if (src) {
            sendUrlToBackground(src);
          }

          // 检查source子元素
          const sources = node.querySelectorAll("source");
          sources.forEach((source) => {
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
    subtree: true,
  });

  // Helper function to truncate URLs
  function truncateUrl(url, maxLength = 60) {
    if (url.length <= maxLength) return url;
    const start = url.substring(0, 30);
    const end = url.substring(url.length - 27);
    return `${start}...${end}`;
  }
  
  console.log(
    '%c 🏅 %c Content script monitoring started',
    'background: #34D399; color: #2D3436; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
    'color: #10B981; padding: 2px 4px;'
  );
})();
