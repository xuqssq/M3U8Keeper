const baseUrl = 'https://testmusic.midpoint.lol';
let capturedUrls = [];
let isDownloading = false;

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
        tabTitle: sender.tab?.title || ''
      });
      
      // 更新badge显示数量
      updateBadge(capturedUrls.length);
      
      console.log('捕获到新URL:', request.url);
    }
    sendResponse({ success: true });
  } else if (request.type === 'GET_URLS') {
    // 返回所有捕获的URL
    sendResponse({ urls: capturedUrls });
  } else if (request.type === 'DELETE_URL') {
    // 删除指定的URL
    capturedUrls = capturedUrls.filter(u => u.id !== request.id);
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
    console.log('任务已创建:', taskId, '文件名:', fileName);
    
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
        // 可以通过消息通知popup进度
        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_PROGRESS',
          progress: taskStatus.progress || 0
        }).catch(() => {}); // 忽略错误（popup可能已关闭）
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
        console.error('下载失败:', chrome.runtime.lastError);
      } else {
        console.log('下载已开始，ID:', downloadId);
      }
    });
    
    // 步骤4: 延迟后删除任务
    setTimeout(async () => {
      try {
        await fetch(`${baseUrl}/api/task/${taskId}`, {
          method: 'DELETE'
        });
        console.log('任务已清理');
      } catch (err) {
        console.error('清理任务失败:', err);
      }
    }, 5000);
    
    return { success: true, message: `下载已开始：${downloadFileName}` };
    
  } catch (error) {
    console.error('下载失败:', error);
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
  console.log('ShowMeBug URL Catcher 扩展已安装/更新');
  // 初始化badge
  updateBadge(capturedUrls.length);
});

// 扩展启动时初始化badge
updateBadge(capturedUrls.length);