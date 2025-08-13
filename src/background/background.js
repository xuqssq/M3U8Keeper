// M3U8Keeper - Background Service Worker
// Manages captured URLs and download operations

const baseUrl = 'https://testmusic.midpoint.lol';
let capturedUrls = [];
let isDownloading = false;

// Professional console banner
console.log(
  '\n' +
  '%c M3U8Keeper %c Background Service %c Running \n',
  'background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); color: white; padding: 4px 8px; border-radius: 3px 0 0 3px; font-weight: bold;',
  'background: #764ba2; color: white; padding: 4px 8px;',
  'background: #95E77E; color: #2D3436; padding: 4px 8px; border-radius: 0 3px 3px 0; font-weight: bold;'
);

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'URL_CAPTURED') {
    // 添加新捕获的URL
    const exists = capturedUrls.some(item => item.url === request.url);
    if (!exists) {
      capturedUrls.push({
        url: request.url,
        time: new Date().toLocaleTimeString(),
        id: Date.now(),
        tabId: sender.tab?.id,
        tabTitle: sender.tab?.title || '',
        contentLength: request.contentLength || null,
        contentType: request.contentType || null
      });
      
      // 更新badge显示数量
      updateBadge(capturedUrls.length);
      
      const sizeStr = request.contentLength ? formatFileSize(request.contentLength) : 'Unknown';
      console.log(
        '%c 🎯 NEW CAPTURE %c ' + truncateUrl(request.url) + ' %c Size: ' + sizeStr,
        'background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
        'color: #667eea; padding: 2px 4px;',
        'color: #4ECDC4; font-weight: bold;'
      );
    }
    sendResponse({ success: true });
  } else if (request.type === 'GET_URLS') {
    // 返回所有捕获的URL
    sendResponse({ urls: capturedUrls });
  } else if (request.type === 'DELETE_URL') {
    // 删除指定的URL
    console.log(
      '%c 🗑 DELETE %c Removing URL with ID: ' + request.id,
      'background: #FFE66D; color: #2D3436; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
      'color: #FFE66D; padding: 2px 4px;'
    );
    
    capturedUrls = capturedUrls.filter(u => u.id !== request.id);
    
    console.log(
      '%c 🏅 %c ' + capturedUrls.length + ' URLs remaining',
      'background: #95E77E; color: #2D3436; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
      'color: #95E77E; padding: 2px 4px;'
    );
    updateBadge(capturedUrls.length);
    sendResponse({ success: true, urls: capturedUrls });
  } else if (request.type === 'CLEAR_ALL') {
    // 清空所有URL
    capturedUrls = [];
    updateBadge(0);
    sendResponse({ success: true });
  } else if (request.type === 'DOWNLOAD_VIDEO') {
    // 处理视频下载
    if (isDownloading) {
      sendResponse({ success: false, error: '已有视频正在下载中，请等待当前下载完成后再试！' });
    } else {
      downloadVideo(request.url, request.fileName)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // 保持消息通道开启
    }
  }
  return true;
});

// 获取安全的文件名
function getSafeFileName(tabTitle) {
  let title = tabTitle || '';
  
  // 移除文件名中的非法字符
  title = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '');
  title = title.trim();
  
  // 获取时间戳
  const timestamp = new Date().toISOString()
    .replace(/:/g, '-')
    .replace(/\./g, '-')
    .substring(0, 19);
  
  // 构建文件名
  if (title) {
    // 限制标题长度，避免文件名过长
    if (title.length > 50) {
      title = title.substring(0, 50) + '...';
    }
    return `${title}_${timestamp}`;
  } else {
    return timestamp;
  }
}

// 下载视频功能
async function downloadVideo(m3u8Url, customFileName) {
  isDownloading = true;
  
  try {
    const fileName = customFileName || getSafeFileName();
    
    // 步骤1: 创建下载任务
    const createResponse = await fetch(`${baseUrl}/api/process-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        m3u8Url: m3u8Url,
        outputFileName: fileName,
        options: {
          maxConcurrent: 10,
          retryCount: 3
        }
      })
    });
    
    const createResult = await createResponse.json();
    
    if (!createResult.success || !createResult.taskId) {
      throw new Error(createResult.error || '创建任务失败');
    }
    
    const taskId = createResult.taskId;
    console.log(
      '%c 📦 DOWNLOAD %c Task created: ' + taskId + ' %c File: ' + fileName + '.mp4',
      'background: #4ECDC4; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
      'color: #4ECDC4; padding: 2px 4px;',
      'color: #667eea; font-weight: bold;'
    );
    
    // 步骤2: 轮询任务状态
    let taskStatus;
    let attempts = 0;
    const maxAttempts = 600; // 最多等待10分钟
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 每秒查询一次
      
      const statusResponse = await fetch(`${baseUrl}/api/task/${taskId}`);
      taskStatus = await statusResponse.json();
      
      if (taskStatus.status === 'completed') {
        break;
      } else if (taskStatus.status === 'failed') {
        throw new Error(taskStatus.error || '处理失败');
      } else if (taskStatus.status === 'processing') {
        // 发送进度给所有打开的标签页
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
              type: 'DOWNLOAD_PROGRESS',
              progress: taskStatus.progress || 0
            }).catch(() => {}); // 忽略错误
          });
        });
        
        // 也尝试发送给runtime（用于newtab页面）
        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_PROGRESS',
          progress: taskStatus.progress || 0
        }).catch(() => {}); // 忽略错误
      }
      
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      throw new Error('处理超时');
    }
    
    // 步骤3: 下载文件
    const downloadUrl = `${baseUrl}/api/download/${taskId}`;
    const downloadFileName = `${fileName}.mp4`;
    
    // 使用Chrome下载API
    chrome.downloads.download({
      url: downloadUrl,
      filename: downloadFileName,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.log(
          '%c ☹️ ERROR %c Download failed: ' + chrome.runtime.lastError.message,
          'background: #FF6B6B; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
          'color: #FF6B6B; padding: 2px 4px; font-weight: bold;'
        );
      } else {
        console.log(
          '%c 🏅 SUCCESS %c Download started - ID: ' + downloadId,
          'background: #95E77E; color: #2D3436; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
          'color: #95E77E; padding: 2px 4px;'
        );
      }
    });
    
    // 步骤4: 延迟后删除任务
    setTimeout(async () => {
      try {
        await fetch(`${baseUrl}/api/task/${taskId}`, {
          method: 'DELETE'
        });
        console.log(
          '%c 🧼 CLEANUP %c Task cleaned successfully',
          'background: #A8E6CF; color: #2D3436; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
          'color: #A8E6CF; padding: 2px 4px;'
        );
      } catch (err) {
        console.log(
          '%c ⚠️ WARNING %c Cleanup failed: ' + err.message,
          'background: #FFE66D; color: #2D3436; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
          'color: #FFE66D; padding: 2px 4px;'
        );
      }
    }, 5000);
    
    return { success: true, message: `下载已开始：${downloadFileName}` };
    
  } catch (error) {
    console.log(
      '%c ☹️ ERROR %c Download failed: ' + error.message,
      'background: #FF6B6B; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
      'color: #FF6B6B; padding: 2px 4px; font-weight: bold;'
    );
    return { success: false, error: error.message };
  } finally {
    isDownloading = false;
  }
}

// 更新badge显示
function updateBadge(count) {
  chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
  // setBadgeTextColor may not be available in all Chrome versions
  if (chrome.action.setBadgeTextColor) {
    chrome.action.setBadgeTextColor({ color: '#ffffff' });
  }
}

// 监听扩展安装或更新
chrome.runtime.onInstalled.addListener(() => {
  console.log(
    '%c 🎆 INSTALLED %c M3U8Keeper extension ready',
    'background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
    'color: #667eea; padding: 2px 4px; font-weight: bold;'
  );
  // 初始化badge
  updateBadge(capturedUrls.length);
});

// Helper functions
function truncateUrl(url, maxLength = 60) {
  if (url.length <= maxLength) return url;
  const start = url.substring(0, 30);
  const end = url.substring(url.length - 27);
  return `${start}...${end}`;
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 'null' || bytes === null) return 'Unknown';
  
  const size = parseInt(bytes);
  if (isNaN(size)) return 'Unknown';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let fileSize = size;
  
  while (fileSize >= 1024 && unitIndex < units.length - 1) {
    fileSize /= 1024;
    unitIndex++;
  }
  
  return `${fileSize.toFixed(unitIndex > 0 ? 2 : 0)} ${units[unitIndex]}`;
}

// Initialize badge on extension startup
updateBadge(capturedUrls.length);

console.log(
  '%c 🏅 %c Background service initialized',
  'background: #95E77E; color: #2D3436; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
  'color: #95E77E; padding: 2px 4px;'
);