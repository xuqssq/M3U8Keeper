// ==UserScript==
// @name         ShowMeBug Playback URL Catcher
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  捕获 ShowMeBug playback 请求和 m3u8 文件并显示在右下角，支持下载功能
// @author       Qian
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // 配置
    const baseUrl = 'https://testmusic.midpoint.lol';
    let urlList = []; // 存储所有URL
    let isDownloading = false;

    // 检查URL是否需要捕获
    function shouldCaptureUrl(url) {
        return url.includes('1024paas.showmebug.com/rtc/api/agora/playback/media') ||
               url.includes('.m3u8');
    }

    // 获取安全的文件名
    function getSafeFileName() {
        // 获取页面标题
        let title = document.title || '';

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

    // 创建显示面板
    function createPanel() {
        const panel = document.createElement('div');
        panel.id = 'url-catcher-panel';
        panel.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #1a1a1a;
            color: #fff;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 9999;
            font-family: monospace;
            font-size: 12px;
            max-width: 600px;
            max-height: 400px;
            display: none;
            animation: slideIn 0.3s ease-out;
        `;

        // 标题栏
        const titleBar = document.createElement('div');
        titleBar.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid #444;
        `;

        const title = document.createElement('div');
        title.textContent = '捕获的URL列表';
        title.style.cssText = `
            font-size: 14px;
            font-weight: bold;
        `;

        const urlCount = document.createElement('div');
        urlCount.id = 'url-count';
        urlCount.style.cssText = `
            font-size: 11px;
            color: #888;
        `;

        // URL列表容器
        const urlListContainer = document.createElement('div');
        urlListContainer.id = 'url-list-container';
        urlListContainer.style.cssText = `
            max-height: 250px;
            overflow-y: auto;
            margin-bottom: 10px;
            background: #2a2a2a;
            border-radius: 4px;
            border: 1px solid #444;
        `;

        // 状态显示
        const statusDisplay = document.createElement('div');
        statusDisplay.id = 'download-status';
        statusDisplay.style.cssText = `
            margin-top: 10px;
            padding: 8px;
            background: #2a2a2a;
            border-radius: 4px;
            border: 1px solid #444;
            display: none;
            font-size: 11px;
        `;

        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.cssText = `
            position: absolute;
            top: 5px;
            right: 5px;
            background: transparent;
            color: #999;
            border: none;
            font-size: 20px;
            cursor: pointer;
            padding: 0;
            width: 25px;
            height: 25px;
            line-height: 20px;
        `;

        closeButton.addEventListener('click', () => {
            panel.style.display = 'none';
        });

        titleBar.appendChild(title);
        titleBar.appendChild(urlCount);

        panel.appendChild(closeButton);
        panel.appendChild(titleBar);
        panel.appendChild(urlListContainer);
        panel.appendChild(statusDisplay);

        // 添加动画和滚动条样式
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }

            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.5; }
                100% { opacity: 1; }
            }

            #url-list-container::-webkit-scrollbar {
                width: 8px;
            }

            #url-list-container::-webkit-scrollbar-track {
                background: #1a1a1a;
                border-radius: 4px;
            }

            #url-list-container::-webkit-scrollbar-thumb {
                background: #444;
                border-radius: 4px;
            }

            #url-list-container::-webkit-scrollbar-thumb:hover {
                background: #555;
            }

            .url-item {
                padding: 10px;
                border-bottom: 1px solid #333;
                transition: background 0.2s;
            }

            .url-item:hover {
                background: #333;
            }

            .url-item:last-child {
                border-bottom: none;
            }

            .url-item-text {
                word-break: break-all;
                margin-bottom: 5px;
                font-size: 11px;
            }

            .url-item-buttons {
                display: flex;
                gap: 5px;
                margin-top: 5px;
            }

            .url-item-button {
                padding: 4px 8px;
                font-size: 11px;
                border: none;
                border-radius: 3px;
                cursor: pointer;
                transition: opacity 0.2s;
            }

            .url-item-button:hover {
                opacity: 0.8;
            }

            .url-item-button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .url-item-time {
                font-size: 10px;
                color: #888;
                margin-bottom: 5px;
            }
        `;
        document.head.appendChild(style);

        return { panel, urlListContainer, statusDisplay, urlCount };
    }

    // 监听 XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        if (shouldCaptureUrl(url)) {
            addUrl(url);
        }
        return originalXHROpen.apply(this, [method, url, ...args]);
    };

    // 监听 fetch
    const originalFetch = window.fetch;
    window.fetch = function(url, ...args) {
        const urlString = typeof url === 'string' ? url : url.url || url.href || '';
        if (shouldCaptureUrl(urlString)) {
            addUrl(urlString);
        }
        return originalFetch.apply(this, [url, ...args]);
    };

    let panel, urlListContainer, statusDisplay, urlCount;

    // 添加URL到列表
    function addUrl(url) {
        // 检查是否已存在
        const exists = urlList.some(item => item.url === url);
        if (!exists) {
            urlList.push({
                url: url,
                time: new Date().toLocaleTimeString(),
                id: Date.now()
            });
            console.log(`捕获到新URL: ${url}`);
        }

        // 确保 DOM 已加载
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => showPanel());
            return;
        }

        showPanel();
    }

    // 显示面板
    function showPanel() {
        // 如果还没有创建面板，先创建
        if (!panel) {
            ({ panel, urlListContainer, statusDisplay, urlCount } = createPanel());
            document.body.appendChild(panel);
        }

        panel.style.display = 'block';
        updateUrlList();
    }

    // 更新URL列表显示
    function updateUrlList() {
        if (!urlListContainer) return;

        // 更新计数
        if (urlCount) {
            urlCount.textContent = `共 ${urlList.length} 个`;
        }

        // 清空现有列表
        urlListContainer.innerHTML = '';

        // 反向显示，最新的在上面
        [...urlList].reverse().forEach((item, index) => {
            const urlItem = document.createElement('div');
            urlItem.className = 'url-item';

            const urlTime = document.createElement('div');
            urlTime.className = 'url-item-time';
            urlTime.textContent = item.time;

            const urlText = document.createElement('div');
            urlText.className = 'url-item-text';
            urlText.textContent = item.url;

            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'url-item-buttons';

            // 复制按钮
            const copyBtn = document.createElement('button');
            copyBtn.textContent = '复制';
            copyBtn.className = 'url-item-button';
            copyBtn.style.background = '#4CAF50';
            copyBtn.style.color = 'white';
            copyBtn.onclick = (e) => {
                e.stopPropagation();
                copyUrl(item.url, copyBtn);
            };

            // 下载按钮
            const downloadBtn = document.createElement('button');
            downloadBtn.textContent = '下载';
            downloadBtn.className = 'url-item-button';
            downloadBtn.style.background = '#2196F3';
            downloadBtn.style.color = 'white';
            downloadBtn.onclick = (e) => {
                e.stopPropagation();
                if (isDownloading) {
                    alert('已有视频正在下载中，请等待当前下载完成后再试！');
                } else {
                    downloadVideo(item.url);
                }
            };

            // 删除按钮
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '删除';
            deleteBtn.className = 'url-item-button';
            deleteBtn.style.background = '#666';
            deleteBtn.style.color = 'white';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                urlList = urlList.filter(u => u.id !== item.id);
                updateUrlList();
            };

            buttonContainer.appendChild(copyBtn);
            buttonContainer.appendChild(downloadBtn);
            buttonContainer.appendChild(deleteBtn);

            urlItem.appendChild(urlTime);
            urlItem.appendChild(urlText);
            urlItem.appendChild(buttonContainer);

            urlListContainer.appendChild(urlItem);
        });
    }

    // 复制URL
    function copyUrl(url, button) {
        navigator.clipboard.writeText(url).then(() => {
            const originalText = button.textContent;
            button.textContent = '已复制！';
            button.style.background = '#2196F3';
            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = '#4CAF50';
            }, 2000);
        }).catch(err => {
            // 兼容旧版浏览器
            const textArea = document.createElement('textarea');
            textArea.value = url;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                button.textContent = '已复制！';
                button.style.background = '#2196F3';
                setTimeout(() => {
                    button.textContent = '复制';
                    button.style.background = '#4CAF50';
                }, 2000);
            } catch (err) {
                console.error('复制失败:', err);
            }
            document.body.removeChild(textArea);
        });
    }

    // 更新状态显示
    function updateStatus(message, type = 'info') {
        if (!statusDisplay) return;

        statusDisplay.style.display = 'block';
        statusDisplay.textContent = message;

        switch(type) {
            case 'success':
                statusDisplay.style.borderColor = '#4CAF50';
                statusDisplay.style.color = '#4CAF50';
                break;
            case 'error':
                statusDisplay.style.borderColor = '#f44336';
                statusDisplay.style.color = '#f44336';
                break;
            case 'processing':
                statusDisplay.style.borderColor = '#ff9800';
                statusDisplay.style.color = '#ff9800';
                statusDisplay.style.animation = 'pulse 1.5s infinite';
                break;
            default:
                statusDisplay.style.borderColor = '#444';
                statusDisplay.style.color = '#fff';
                statusDisplay.style.animation = 'none';
        }
    }

    // 下载视频功能
    async function downloadVideo(m3u8Url) {
        if (isDownloading) {
            alert('已有视频正在下载中，请等待当前下载完成后再试！');
            return;
        }

        isDownloading = true;

        try {
            // 获取文件名
            const fileName = getSafeFileName();

            // 步骤1: 创建下载任务
            updateStatus('正在创建下载任务...', 'processing');

            const createResponse = await makeRequest({
                method: 'POST',
                url: `${baseUrl}/api/process-url`,
                headers: {
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({
                    m3u8Url: m3u8Url,
                    outputFileName: fileName,
                    options: {
                        maxConcurrent: 10,
                        retryCount: 3
                    }
                })
            });

            const createResult = JSON.parse(createResponse.responseText);

            if (!createResult.success || !createResult.taskId) {
                throw new Error(createResult.error || '创建任务失败');
            }

            const taskId = createResult.taskId;
            console.log('任务已创建:', taskId, '文件名:', fileName);

            // 步骤2: 轮询任务状态
            updateStatus('正在处理视频，请稍候...', 'processing');

            let taskStatus;
            let attempts = 0;
            const maxAttempts = 600; // 最多等待10分钟（600秒）

            while (attempts < maxAttempts) {
                await sleep(1000); // 每秒查询一次

                const statusResponse = await makeRequest({
                    method: 'GET',
                    url: `${baseUrl}/api/task/${taskId}`
                });

                taskStatus = JSON.parse(statusResponse.responseText);

                if (taskStatus.status === 'completed') {
                    break;
                } else if (taskStatus.status === 'failed') {
                    throw new Error(taskStatus.error || '处理失败');
                } else if (taskStatus.status === 'processing') {
                    const progress = taskStatus.progress || 0;
                    updateStatus(`正在处理视频... ${progress}%`, 'processing');
                }

                attempts++;
            }

            if (attempts >= maxAttempts) {
                throw new Error('处理超时');
            }

            // 步骤3: 下载文件
            updateStatus('正在下载文件...', 'processing');

            const downloadUrl = `${baseUrl}/api/download/${taskId}`;
            const downloadFileName = `${fileName}.mp4`;

            // 创建隐藏的链接元素来触发下载
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = downloadFileName;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            updateStatus(`下载已开始：${downloadFileName}`, 'success');

            // 步骤4: 延迟后删除任务
            setTimeout(async () => {
                try {
                    await makeRequest({
                        method: 'DELETE',
                        url: `${baseUrl}/api/task/${taskId}`
                    });
                    console.log('任务已清理');
                } catch (err) {
                    console.error('清理任务失败:', err);
                }
            }, 5000);

        } catch (error) {
            console.error('下载失败:', error);
            updateStatus(`下载失败: ${error.message}`, 'error');
        } finally {
            isDownloading = false;
        }
    }

    // 辅助函数：发送请求
    function makeRequest(options) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                ...options,
                onload: resolve,
                onerror: reject,
                ontimeout: () => reject(new Error('请求超时'))
            });
        });
    }

    // 辅助函数：延迟
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

})();
