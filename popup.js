// Popup脚本 - 显示捕获的URL并提供操作

let urlList = [];
let isDownloading = false;

// DOM元素
const urlListContainer = document.getElementById('urlList');
const urlCountElement = document.getElementById('urlCount');
const clearAllButton = document.getElementById('clearAll');
const downloadStatusElement = document.getElementById('downloadStatus');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  loadUrls();
  
  // 绑定清空按钮事件
  clearAllButton.addEventListener('click', clearAllUrls);
  
  // 监听来自background的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'DOWNLOAD_PROGRESS') {
      updateDownloadProgress(request.progress);
    }
  });
});

// 加载URL列表
function loadUrls() {
  chrome.runtime.sendMessage({ type: 'GET_URLS' }, (response) => {
    if (response && response.urls) {
      urlList = response.urls;
      renderUrlList();
    }
  });
}

// 渲染URL列表
function renderUrlList() {
  urlCountElement.textContent = `${urlList.length} 个URL`;
  
  if (urlList.length === 0) {
    urlListContainer.innerHTML = `
      <div class="empty-state">
        <p>暂无捕获的URL</p>
        <p class="hint">访问包含目标URL的页面即可自动捕获</p>
      </div>
    `;
    return;
  }
  
  // 清空容器
  urlListContainer.innerHTML = '';
  
  // 反向显示，最新的在上面
  [...urlList].reverse().forEach((item) => {
    const urlItem = createUrlItem(item);
    urlListContainer.appendChild(urlItem);
  });
}

// 创建URL项目元素
function createUrlItem(item) {
  const urlItem = document.createElement('div');
  urlItem.className = 'url-item';
  
  // 时间和标签页信息
  const infoDiv = document.createElement('div');
  infoDiv.className = 'url-info';
  infoDiv.innerHTML = `
    <span class="url-time">${item.time}</span>
    ${item.tabTitle ? `<span class="url-tab" title="${item.tabTitle}">${truncateText(item.tabTitle, 30)}</span>` : ''}
  `;
  
  // URL文本
  const urlText = document.createElement('div');
  urlText.className = 'url-text';
  urlText.textContent = item.url;
  urlText.title = item.url;
  
  // 按钮容器
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'url-buttons';
  
  // 复制按钮
  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn btn-small btn-success';
  copyBtn.textContent = '复制';
  copyBtn.onclick = () => copyUrl(item.url, copyBtn);
  
  // 下载按钮
  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'btn btn-small btn-primary';
  downloadBtn.textContent = '下载';
  downloadBtn.onclick = () => downloadVideo(item);
  
  // 删除按钮
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn-small btn-secondary';
  deleteBtn.textContent = '删除';
  deleteBtn.onclick = () => deleteUrl(item.id);
  
  // 本地下载按钮
  const localDownloadBtn = document.createElement('button');
  localDownloadBtn.className = 'btn btn-small btn-warning';
  localDownloadBtn.textContent = '本地下载';
  localDownloadBtn.onclick = () => localDownloadVideo(item);
  
  buttonContainer.appendChild(copyBtn);
  buttonContainer.appendChild(downloadBtn);
  buttonContainer.appendChild(localDownloadBtn);
  buttonContainer.appendChild(deleteBtn);
  
  urlItem.appendChild(infoDiv);
  urlItem.appendChild(urlText);
  urlItem.appendChild(buttonContainer);
  
  return urlItem;
}

// 复制URL
async function copyUrl(url, button) {
  try {
    await navigator.clipboard.writeText(url);
    const originalText = button.textContent;
    button.textContent = '已复制！';
    button.classList.add('btn-copied');
    
    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('btn-copied');
    }, 2000);
  } catch (err) {
    console.error('复制失败:', err);
    // 降级方案
    const textArea = document.createElement('textarea');
    textArea.value = url;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    
    try {
      document.execCommand('copy');
      button.textContent = '已复制！';
      setTimeout(() => {
        button.textContent = '复制';
      }, 2000);
    } catch (err) {
      alert('复制失败，请手动复制');
    }
    
    document.body.removeChild(textArea);
  }
}

// 下载视频
function downloadVideo(item) {
  if (isDownloading) {
    alert('已有视频正在下载中，请等待当前下载完成后再试！');
    return;
  }
  
  isDownloading = true;
  updateDownloadStatus('正在创建下载任务...', 'processing', 'server');
  
  // 获取安全的文件名
  const fileName = getSafeFileName(item.tabTitle);
  
  chrome.runtime.sendMessage({
    type: 'DOWNLOAD_VIDEO',
    url: item.url,
    fileName: fileName
  }, (response) => {
    if (response.success) {
      updateDownloadStatus(response.message, 'success', 'server');
    } else {
      updateDownloadStatus(`下载失败: ${response.error}`, 'error', 'server');
    }
    
    isDownloading = false;
    
    // 3秒后隐藏状态
    setTimeout(() => {
      downloadStatusElement.style.display = 'none';
    }, 3000);
  });
}

// 删除URL
function deleteUrl(id) {
  chrome.runtime.sendMessage({
    type: 'DELETE_URL',
    id: id
  }, (response) => {
    if (response && response.success) {
      urlList = response.urls;
      renderUrlList();
    }
  });
}

// 清空所有URL
function clearAllUrls() {
  if (urlList.length === 0) return;
  
  if (confirm('确定要清空所有捕获的URL吗？')) {
    chrome.runtime.sendMessage({ type: 'CLEAR_ALL' }, (response) => {
      if (response && response.success) {
        urlList = [];
        renderUrlList();
      }
    });
  }
}

// 更新下载状态
function updateDownloadStatus(message, type = 'info', downloadType = 'server') {
  const statusText = downloadStatusElement.querySelector('.status-text');
  const progressBar = downloadStatusElement.querySelector('.progress-bar');
  const progressFill = downloadStatusElement.querySelector('.progress-fill');
  
  downloadStatusElement.style.display = 'block';
  statusText.textContent = message;
  
  // 移除所有状态类
  downloadStatusElement.className = 'download-status';
  progressFill.className = 'progress-fill';
  
  // 添加下载类型类
  if (downloadType === 'local') {
    downloadStatusElement.classList.add('local-download');
    progressFill.classList.add('local-download');
  } else {
    progressFill.classList.add('server-download');
  }
  
  // 添加对应的状态类
  switch(type) {
    case 'success':
      downloadStatusElement.classList.add('status-success');
      progressBar.style.display = 'none';
      break;
    case 'error':
      downloadStatusElement.classList.add('status-error');
      progressBar.style.display = 'none';
      break;
    case 'processing':
      downloadStatusElement.classList.add('status-processing');
      progressBar.style.display = 'block';
      break;
    default:
      progressBar.style.display = 'none';
  }
}

// 更新下载进度
function updateDownloadProgress(progress, downloadType = 'server') {
  const progressFill = document.querySelector('.progress-fill');
  if (progressFill) {
    progressFill.style.width = `${progress}%`;
  }
  updateDownloadStatus(`正在处理视频... ${progress}%`, 'processing', downloadType);
}

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
    // 限制标题长度
    if (title.length > 50) {
      title = title.substring(0, 50) + '...';
    }
    return `${title}_${timestamp}`;
  } else {
    return timestamp;
  }
}

// 截断文本
function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// 本地下载视频
async function localDownloadVideo(item) {
  if (isDownloading) {
    alert('已有视频正在下载中，请等待当前下载完成后再试！');
    return;
  }

  isDownloading = true;
  
  try {
    updateDownloadStatus('正在初始化本地下载...', 'processing', 'local');
    
    // 获取安全的文件名
    const fileName = getSafeFileName(item.tabTitle);
    
    // 尝试使用带FFmpeg的下载器（可转换为MP4）
    const ffmpegDownloader = new LocalM3U8Downloader();
    
    try {
      await ffmpegDownloader.download(item.url, fileName, (progress) => {
        if (progress.stage === 'downloading' && progress.percent) {
          updateDownloadProgress(progress.percent, 'local');
        } else {
          updateDownloadStatus(progress.message, progress.stage === 'completed' ? 'success' : 'processing', 'local');
        }
      });
    } catch (ffmpegError) {
      console.log('FFmpeg下载失败，尝试使用简化版下载器:', ffmpegError);
      
      // 如果FFmpeg失败，回退到只下载 完整 ts
      const simpleDownloader = new LocalM3U8DownloaderSimple();
      await simpleDownloader.download(item.url, fileName, (progress) => {
        if (progress.stage === 'downloading' && progress.percent) {
          updateDownloadProgress(progress.percent, 'local');
        } else {
          updateDownloadStatus(progress.message, progress.stage === 'completed' ? 'success' : 'processing', 'local');
        }
      });
    }
    
    // 下载完成
    setTimeout(() => {
      downloadStatusElement.style.display = 'none';
    }, 3000);
    
  } catch (error) {
    console.error('本地下载失败:', error);
    updateDownloadStatus(`下载失败: ${error.message}`, 'error', 'local');
    
    setTimeout(() => {
      downloadStatusElement.style.display = 'none';
    }, 5000);
  } finally {
    isDownloading = false;
  }
}