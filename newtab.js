let urlList = [];
let isDownloading = false;

const urlListContainer = document.getElementById('urlList');
const urlCountElement = document.getElementById('urlCount');
const clearAllButton = document.getElementById('clearAll');
const downloadStatusElement = document.getElementById('downloadStatus');

document.addEventListener('DOMContentLoaded', () => {
  loadUrls();
  
  clearAllButton.addEventListener('click', clearAllUrls);
  
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'DOWNLOAD_PROGRESS') {
      updateDownloadProgress(request.progress);
    } else if (request.type === 'URL_UPDATED') {
      loadUrls();
    }
  });
});

function loadUrls() {
  chrome.runtime.sendMessage({ type: 'GET_URLS' }, (response) => {
    if (response && response.urls) {
      urlList = response.urls;
      renderUrlList();
      
      chrome.action.setBadgeText({ text: urlList.length > 0 ? urlList.length.toString() : '' });
      chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
      if (chrome.action.setBadgeTextColor) {
        chrome.action.setBadgeTextColor({ color: '#ffffff' });
      }
    }
  });
}

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
  
  urlListContainer.innerHTML = '';
  
  [...urlList].reverse().forEach((item) => {
    const urlItem = createUrlItem(item);
    urlListContainer.appendChild(urlItem);
  });
}

function createUrlItem(item) {
  const urlItem = document.createElement('div');
  urlItem.className = 'url-item';
  urlItem.dataset.itemId = item.id;
  
  const infoDiv = document.createElement('div');
  infoDiv.className = 'url-info';
  infoDiv.innerHTML = `
    <span class="url-time">${item.time}</span>
    ${item.tabTitle ? `<span class="url-tab" title="${item.tabTitle}">${truncateText(item.tabTitle, 30)}</span>` : ''}
  `;
  
  const urlText = document.createElement('div');
  urlText.className = 'url-text';
  urlText.textContent = item.url;
  urlText.title = item.url;
  
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'url-buttons';
  
  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn btn-small btn-success';
  copyBtn.textContent = '复制';
  copyBtn.onclick = () => copyUrl(item.url, copyBtn);
  
  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'btn btn-small btn-primary';
  downloadBtn.textContent = '服务器下载';
  downloadBtn.onclick = () => downloadVideo(item);
  
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn-small btn-secondary';
  deleteBtn.textContent = '删除';
  deleteBtn.onclick = () => deleteUrl(item.id);
  
  const localDownloadBtn = document.createElement('button');
  localDownloadBtn.className = 'btn btn-small btn-warning';
  localDownloadBtn.textContent = '本地下载';
  localDownloadBtn.onclick = () => localDownloadVideo(item);
  
  buttonContainer.appendChild(copyBtn);
  buttonContainer.appendChild(downloadBtn);
  buttonContainer.appendChild(localDownloadBtn);
  buttonContainer.appendChild(deleteBtn);
  
  // TS切片进度容器
  const tsProgressContainer = document.createElement('div');
  tsProgressContainer.className = 'ts-progress-container';
  tsProgressContainer.id = `ts-progress-${item.id}`;
  tsProgressContainer.style.display = 'none';
  
  // 下载状态容器（服务器下载或本地下载）
  const itemDownloadStatus = document.createElement('div');
  itemDownloadStatus.className = 'item-download-status';
  itemDownloadStatus.id = `download-status-${item.id}`;
  itemDownloadStatus.style.display = 'none';
  itemDownloadStatus.innerHTML = `
    <span class="status-text"></span>
    <div class="progress-bar" style="display: none">
      <div class="progress-fill"></div>
    </div>
  `;
  
  urlItem.appendChild(infoDiv);
  urlItem.appendChild(urlText);
  urlItem.appendChild(buttonContainer);
  urlItem.appendChild(itemDownloadStatus);
  urlItem.appendChild(tsProgressContainer);
  
  return urlItem;
}

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

function downloadVideo(item) {
  if (isDownloading) {
    alert('已有视频正在下载中，请等待当前下载完成后再试！');
    return;
  }
  
  isDownloading = true;
  updateItemDownloadStatus(item.id, '正在创建下载任务...', 'processing', 'server');
  
  const fileName = getSafeFileName(item.tabTitle);
  
  chrome.runtime.sendMessage({
    type: 'DOWNLOAD_VIDEO',
    url: item.url,
    fileName: fileName
  }, (response) => {
    if (response.success) {
      updateItemDownloadStatus(item.id, response.message, 'success', 'server');
    } else {
      updateItemDownloadStatus(item.id, `下载失败: ${response.error}`, 'error', 'server');
    }
    
    isDownloading = false;
    
    setTimeout(() => {
      const statusElement = document.getElementById(`download-status-${item.id}`);
      if (statusElement) {
        statusElement.style.display = 'none';
      }
    }, 3000);
  });
}

function deleteUrl(id) {
  console.log('Deleting URL with ID:', id);
  
  chrome.runtime.sendMessage({
    type: 'DELETE_URL',
    id: id
  }, (response) => {
    console.log('Delete response:', response);
    
    if (chrome.runtime.lastError) {
      console.error('Error deleting URL:', chrome.runtime.lastError);
      return;
    }
    
    if (response && response.success) {
      // 重新加载URL列表，确保获取最新数据
      loadUrls();
    }
  });
}

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

function updateDownloadStatus(message, type = 'info', downloadType = 'server') {
  const statusText = downloadStatusElement.querySelector('.status-text');
  const progressBar = downloadStatusElement.querySelector('.progress-bar');
  const progressFill = downloadStatusElement.querySelector('.progress-fill');
  
  downloadStatusElement.style.display = 'block';
  statusText.textContent = message;
  
  downloadStatusElement.className = 'download-status';
  progressFill.className = 'progress-fill';
  
  if (downloadType === 'local') {
    downloadStatusElement.classList.add('local-download');
    progressFill.classList.add('local-download');
  } else {
    progressFill.classList.add('server-download');
  }
  
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

function updateDownloadProgress(progress, downloadType = 'server') {
  const progressFill = document.querySelector('.progress-fill');
  if (progressFill) {
    progressFill.style.width = `${progress}%`;
  }
  updateDownloadStatus(`正在处理视频... ${progress}%`, 'processing', downloadType);
}

// 更新特定item的下载状态
function updateItemDownloadStatus(itemId, message, type = 'info', downloadType = 'server') {
  const statusElement = document.getElementById(`download-status-${itemId}`);
  if (!statusElement) return;
  
  const statusText = statusElement.querySelector('.status-text');
  const progressBar = statusElement.querySelector('.progress-bar');
  const progressFill = statusElement.querySelector('.progress-fill');
  
  statusElement.style.display = 'block';
  statusText.textContent = message;
  
  statusElement.className = 'item-download-status';
  progressFill.className = 'progress-fill';
  
  if (downloadType === 'local') {
    statusElement.classList.add('local-download');
    progressFill.classList.add('local-download');
  } else {
    progressFill.classList.add('server-download');
  }
  
  switch(type) {
    case 'success':
      statusElement.classList.add('status-success');
      progressBar.style.display = 'none';
      break;
    case 'error':
      statusElement.classList.add('status-error');
      progressBar.style.display = 'none';
      break;
    case 'processing':
      statusElement.classList.add('status-processing');
      progressBar.style.display = 'block';
      break;
    default:
      progressBar.style.display = 'none';
  }
}

// 更新特定item的下载进度
function updateItemDownloadProgress(itemId, progress, downloadType = 'server') {
  const statusElement = document.getElementById(`download-status-${itemId}`);
  if (!statusElement) return;
  
  const progressFill = statusElement.querySelector('.progress-fill');
  if (progressFill) {
    progressFill.style.width = `${progress}%`;
  }
  updateItemDownloadStatus(itemId, `正在处理视频... ${progress}%`, 'processing', downloadType);
}

function getSafeFileName(tabTitle) {
  let title = tabTitle || '';
  
  title = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '');
  title = title.trim();
  
  const timestamp = new Date().toISOString()
    .replace(/:/g, '-')
    .replace(/\./g, '-')
    .substring(0, 19);
  
  if (title) {
    if (title.length > 50) {
      title = title.substring(0, 50) + '...';
    }
    return `${title}_${timestamp}`;
  } else {
    return timestamp;
  }
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

async function localDownloadVideo(item) {
  if (isDownloading) {
    alert('已有视频正在下载中，请等待当前下载完成后再试！');
    return;
  }

  isDownloading = true;
  
  // 获取或创建ts进度容器
  const tsProgressContainer = document.getElementById(`ts-progress-${item.id}`);
  let totalSegments = 0;
  
  try {
    updateItemDownloadStatus(item.id, '正在初始化本地下载...', 'processing', 'local');
    
    const fileName = getSafeFileName(item.tabTitle);
    
    const ffmpegDownloader = new LocalM3U8Downloader();
    
    try {
      await ffmpegDownloader.download(item.url, fileName, (progress) => {
        if (progress.stage === 'downloading') {
          // 处理ts切片下载进度
          if (progress.current && progress.total) {
            // 初始化ts切片显示
            if (totalSegments === 0) {
              totalSegments = progress.total;
              initializeTsProgress(tsProgressContainer, totalSegments);
            }
            // 更新进度
            updateTsProgress(tsProgressContainer, progress.current, totalSegments);
          }
          
          if (progress.percent) {
            updateItemDownloadProgress(item.id, progress.percent, 'local');
          }
        } else if (progress.stage === 'completed') {
          // 下载完成，隐藏ts进度
          setTimeout(() => {
            if (tsProgressContainer) {
              tsProgressContainer.style.display = 'none';
            }
          }, 3000);
          updateItemDownloadStatus(item.id, progress.message, 'success', 'local');
        } else {
          updateItemDownloadStatus(item.id, progress.message, 'processing', 'local');
        }
      });
    } catch (ffmpegError) {
      console.log('FFmpeg下载失败，尝试使用简化版下载器:', ffmpegError);
      
      // 重置ts进度显示
      totalSegments = 0;
      
      const simpleDownloader = new LocalM3U8DownloaderSimple();
      await simpleDownloader.download(item.url, fileName, (progress) => {
        if (progress.stage === 'downloading') {
          // 处理ts切片下载进度
          if (progress.current && progress.total) {
            // 初始化ts切片显示
            if (totalSegments === 0) {
              totalSegments = progress.total;
              initializeTsProgress(tsProgressContainer, totalSegments);
            }
            // 更新进度
            updateTsProgress(tsProgressContainer, progress.current, totalSegments);
          }
          
          if (progress.percent) {
            updateItemDownloadProgress(item.id, progress.percent, 'local');
          }
        } else if (progress.stage === 'completed') {
          // 下载完成，隐藏ts进度
          setTimeout(() => {
            if (tsProgressContainer) {
              tsProgressContainer.style.display = 'none';
            }
          }, 3000);
          updateItemDownloadStatus(item.id, progress.message, 'success', 'local');
        } else {
          updateItemDownloadStatus(item.id, progress.message, 'processing', 'local');
        }
      });
    }
    
    setTimeout(() => {
      const statusElement = document.getElementById(`download-status-${item.id}`);
      if (statusElement) {
        statusElement.style.display = 'none';
      }
    }, 3000);
    
  } catch (error) {
    console.error('本地下载失败:', error);
    updateItemDownloadStatus(item.id, `下载失败: ${error.message}`, 'error', 'local');
    
    // 隐藏ts进度
    if (tsProgressContainer) {
      tsProgressContainer.style.display = 'none';
    }
    
    setTimeout(() => {
      const statusElement = document.getElementById(`download-status-${item.id}`);
      if (statusElement) {
        statusElement.style.display = 'none';
      }
    }, 5000);
  } finally {
    isDownloading = false;
  }
}

// 初始化ts切片进度显示
function initializeTsProgress(container, total) {
  if (!container) return;
  
  container.innerHTML = '';
  container.style.display = 'block';
  
  // 添加标题
  const title = document.createElement('div');
  title.className = 'ts-progress-title';
  title.textContent = `TS切片下载进度 (0/${total})`;
  container.appendChild(title);
  
  // 创建切片容器
  const segmentsContainer = document.createElement('div');
  segmentsContainer.className = 'ts-segments-container';
  
  // 创建每个切片的显示块
  for (let i = 0; i < total; i++) {
    const segment = document.createElement('div');
    segment.className = 'ts-segment';
    segment.dataset.index = i;
    segment.title = `切片 ${i + 1}`;
    segmentsContainer.appendChild(segment);
  }
  
  container.appendChild(segmentsContainer);
}

// 更新ts切片进度
function updateTsProgress(container, current, total) {
  if (!container) return;
  
  // 更新标题
  const title = container.querySelector('.ts-progress-title');
  if (title) {
    title.textContent = `TS切片下载进度 (${current}/${total})`;
  }
  
  // 更新切片状态
  const segments = container.querySelectorAll('.ts-segment');
  for (let i = 0; i < current && i < segments.length; i++) {
    segments[i].classList.add('downloaded');
  }
}