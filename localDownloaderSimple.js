// 简化版本地下载器 - 不依赖FFmpeg
class LocalM3U8DownloaderSimple {
  constructor() {
    this.tsSegments = [];
    this.key = null;
    this.iv = null;
    this.isDownloading = false;
  }

  // 解析m3u8文件
  async parseM3U8(m3u8Url) {
    const response = await fetch(m3u8Url);
    const text = await response.text();
    const lines = text.split('\n');
    
    const segments = [];
    let key = null;
    let iv = null;
    let baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // 解析加密信息
      if (line.startsWith('#EXT-X-KEY')) {
        const keyMatch = line.match(/URI="([^"]+)"/);
        const ivMatch = line.match(/IV=0x([0-9A-Fa-f]+)/);
        
        if (keyMatch) {
          const keyUrl = this.resolveUrl(keyMatch[1], baseUrl);
          const keyResponse = await fetch(keyUrl);
          key = await keyResponse.arrayBuffer();
        }
        
        if (ivMatch) {
          iv = this.hexToBytes(ivMatch[1]);
        }
      }
      
      // 解析ts片段
      if (line && !line.startsWith('#')) {
        segments.push({
          url: this.resolveUrl(line, baseUrl),
          index: segments.length
        });
      }
    }

    this.tsSegments = segments;
    this.key = key;
    this.iv = iv;

    return segments;
  }

  // 解析URL
  resolveUrl(url, baseUrl) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    if (url.startsWith('/')) {
      const urlObj = new URL(baseUrl);
      return urlObj.protocol + '//' + urlObj.host + url;
    }
    return baseUrl + url;
  }

  // 十六进制转字节数组
  hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  // 解密ts片段
  async decryptSegment(encryptedData, key, iv, segmentIndex) {
    if (!key) return encryptedData;

    const actualIv = iv || this.generateIV(segmentIndex);
    
    try {
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'AES-CBC' },
        false,
        ['decrypt']
      );

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-CBC', iv: actualIv },
        cryptoKey,
        encryptedData
      );
      return new Uint8Array(decrypted);
    } catch (error) {
      console.error('解密失败，尝试不解密:', error);
      return encryptedData;
    }
  }

  // 生成IV
  generateIV(segmentIndex) {
    const iv = new Uint8Array(16);
    const indexBytes = new DataView(new ArrayBuffer(4));
    indexBytes.setUint32(0, segmentIndex, false);
    iv.set(new Uint8Array(indexBytes.buffer), 12);
    return iv;
  }

  // 下载单个ts片段
  async downloadSegment(segment) {
    try {
      const response = await fetch(segment.url);
      const arrayBuffer = await response.arrayBuffer();
      let data = new Uint8Array(arrayBuffer);

      // 如果有加密，进行解密
      if (this.key) {
        data = await this.decryptSegment(data, this.key, this.iv, segment.index);
      }

      return data;
    } catch (error) {
      console.error(`下载片段 ${segment.index} 失败:`, error);
      // 重试一次
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        const response = await fetch(segment.url);
        const arrayBuffer = await response.arrayBuffer();
        let data = new Uint8Array(arrayBuffer);
        if (this.key) {
          data = await this.decryptSegment(data, this.key, this.iv, segment.index);
        }
        return data;
      } catch (retryError) {
        throw retryError;
      }
    }
  }

  // 下载所有ts片段
  async downloadAllSegments(onProgress) {
    const allSegments = [];
    const total = this.tsSegments.length;
    
    // 并发下载，但限制并发数
    const concurrency = 5;
    const chunks = [];
    
    for (let i = 0; i < total; i += concurrency) {
      chunks.push(this.tsSegments.slice(i, i + concurrency));
    }

    let downloaded = 0;
    for (const chunk of chunks) {
      const promises = chunk.map(segment => this.downloadSegment(segment));
      const results = await Promise.all(promises);
      allSegments.push(...results);
      
      downloaded += chunk.length;
      if (onProgress) {
        onProgress({
          current: downloaded,
          total: total,
          percent: Math.round((downloaded / total) * 100)
        });
      }
    }

    // 合并所有片段
    const totalLength = allSegments.reduce((sum, seg) => sum + seg.length, 0);
    const mergedData = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const segment of allSegments) {
      mergedData.set(segment, offset);
      offset += segment.length;
    }

    return mergedData;
  }

  // 下载文件
  downloadFile(data, fileName) {
    const blob = new Blob([data], { type: 'video/mp2t' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.endsWith('.ts') ? fileName : fileName + '.ts';
    a.click();
    
    // 清理
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  // 主下载函数
  async download(m3u8Url, fileName, onProgress) {
    if (this.isDownloading) {
      throw new Error('已有下载任务正在进行');
    }

    this.isDownloading = true;

    try {
      // 1. 解析m3u8
      if (onProgress) onProgress({ stage: 'parsing', message: '正在解析m3u8文件...' });
      await this.parseM3U8(m3u8Url);

      // 2. 下载所有ts片段
      if (onProgress) onProgress({ stage: 'downloading', message: '正在下载视频片段...' });
      const tsData = await this.downloadAllSegments((progress) => {
        if (onProgress) {
          onProgress({
            stage: 'downloading',
            message: `正在下载视频片段... (${progress.current}/${progress.total})`,
            percent: progress.percent
          });
        }
      });

      // 3. 保存文件
      if (onProgress) onProgress({ stage: 'saving', message: '正在保存文件...' });
      this.downloadFile(tsData, fileName);

      if (onProgress) onProgress({ stage: 'completed', message: '下载完成！' });
      
      return { success: true, message: '下载完成' };
    } catch (error) {
      console.error('下载失败:', error);
      throw error;
    } finally {
      this.isDownloading = false;
    }
  }
}

// 导出给popup.js使用
window.LocalM3U8DownloaderSimple = LocalM3U8DownloaderSimple;