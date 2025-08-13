// Popup脚本 - 显示捕获的URL并提供操作

let urlList = [];

// DOM元素
const urlListContainer = document.getElementById('urlList');
const urlCountElement = document.getElementById('urlCount');
const clearAllButton = document.getElementById('clearAll');
const downloadButton = document.getElementById('downloadBtn');

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 等待语言管理器初始化完成
  if (window.i18n && window.i18n.ready) {
    await window.i18n.ready();
  }
  
  loadUrls();
  
  // 绑定清空按钮事件
  clearAllButton.addEventListener('click', clearAllUrls);
  
  // 绑定下载按钮事件
  downloadButton.addEventListener('click', openNewtab);
  
  // 监听语言变化事件
  window.addEventListener('languageChanged', () => {
    renderUrlList();
  });
});

// 加载URL列表
function loadUrls() {
  chrome.runtime.sendMessage({ type: 'GET_URLS' }, (response) => {
    if (response && response.urls) {
      urlList = response.urls;
      renderUrlList();
      
      // 更新badge，确保与实际数量同步
      chrome.action.setBadgeText({ text: urlList.length > 0 ? urlList.length.toString() : '' });
      chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
      if (chrome.action.setBadgeTextColor) {
        chrome.action.setBadgeTextColor({ color: '#ffffff' });
      }
    }
  });
}

// 渲染URL列表
function renderUrlList() {
  // 使用i18n更新URL计数
  i18n.updateUrlCount(urlList.length);
  
  if (urlList.length === 0) {
    urlListContainer.innerHTML = `
      <div class="empty-state">
        <p>${i18n.getMessage('emptyState')}</p>
        <p class="hint">${i18n.getMessage('emptyStateHint')}</p>
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
  
  urlItem.appendChild(infoDiv);
  urlItem.appendChild(urlText);
  
  return urlItem;
}


// 清空所有URL
function clearAllUrls() {
  if (urlList.length === 0) return;
  
  if (confirm(i18n.getMessage('confirmClearAll'))) {
    chrome.runtime.sendMessage({ type: 'CLEAR_ALL' }, (response) => {
      if (response && response.success) {
        urlList = [];
        renderUrlList();
      }
    });
  }
}


// 截断文本
function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// 打开新标签页
function openNewtab() {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/newtab/newtab.html') });
}

