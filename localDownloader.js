// 本地下载器 - 处理m3u8下载和转换
const { createFFmpeg, fetchFile } = FFmpeg;

class LocalM3U8Downloader {
  constructor() {
    this.ffmpeg = null;
    this.tsSegments = [];
    this.key = null;
    this.iv = null;
    this.isDownloading = false;
  }

  // 初始化FFmpeg
  async initFFmpeg() {
    if (!this.ffmpeg) {
      this.ffmpeg = createFFmpeg({
        corePath: chrome.runtime.getURL("lib/ffmpeg-core.js"),
        log: false,
        mainName: 'main',
        workerPath: chrome.runtime.getURL("lib/ffmpeg-core.worker.js")
      });
    }

    if (this.ffmpeg.isLoaded()) {
      await this.ffmpeg.exit();
    }

    await this.ffmpeg.load();
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
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-CBC' },
      false,
      ['decrypt']
    );

    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-CBC', iv: actualIv },
        cryptoKey,
        encryptedData
      );
      return new Uint8Array(decrypted);
    } catch (error) {
      console.error('解密失败:', error);
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
  async downloadSegment(segment, onProgress) {
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
      throw error;
    }
  }

  // 下载所有ts片段
  async downloadAllSegments(onProgress) {
    const allSegments = [];
    const total = this.tsSegments.length;
    
    for (let i = 0; i < total; i++) {
      const segment = this.tsSegments[i];
      const data = await this.downloadSegment(segment, onProgress);
      allSegments.push(data);
      
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: total,
          percent: Math.round(((i + 1) / total) * 100)
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

  // 使用FFmpeg转换为MP4
  async convertToMp4(tsData, outputFileName) {
    await this.initFFmpeg();

    const inputFileName = 'input.ts';
    const outputFileNameMp4 = outputFileName.endsWith('.mp4') ? outputFileName : outputFileName + '.mp4';

    // 写入ts文件
    this.ffmpeg.FS('writeFile', inputFileName, tsData);

    // 执行转换
    await this.ffmpeg.run(
      '-i', inputFileName,
      '-c', 'copy',
      '-bsf:a', 'aac_adtstoasc',
      outputFileNameMp4
    );

    // 读取输出文件
    const data = this.ffmpeg.FS('readFile', outputFileNameMp4);
    
    // 清理文件
    this.ffmpeg.FS('unlink', inputFileName);
    this.ffmpeg.FS('unlink', outputFileNameMp4);

    return new Blob([data.buffer], { type: 'video/mp4' });
  }

  // 下载文件
  downloadFile(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
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

      // 3. 转换为MP4
      if (onProgress) onProgress({ stage: 'converting', message: '正在转换为MP4格式...' });
      const mp4Blob = await this.convertToMp4(tsData, fileName);

      // 4. 触发下载
      if (onProgress) onProgress({ stage: 'saving', message: '正在保存文件...' });
      this.downloadFile(mp4Blob, fileName.endsWith('.mp4') ? fileName : fileName + '.mp4');

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
window.LocalM3U8Downloader = LocalM3U8Downloader;