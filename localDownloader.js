const { createFFmpeg } = FFmpeg;

const ffmpeg = createFFmpeg({
  corePath: chrome.runtime.getURL("lib/ffmpeg-core.js"),
  log: true,
  mainName: "main",
});

async function ensureFFmpegLoaded() {
  if (!ffmpeg.isLoaded()) {
    await ffmpeg.load();
  }
}

// Shared helpers
function resolveUrlShared(url, baseUrl) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  if (url.startsWith("/")) {
    const urlObj = new URL(baseUrl);
    return urlObj.protocol + "//" + urlObj.host + url;
  }
  return baseUrl + url;
}

function hexToBytesShared(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function generateIVShared(segmentIndex) {
  const iv = new Uint8Array(16);
  const indexBytes = new DataView(new ArrayBuffer(4));
  indexBytes.setUint32(0, segmentIndex, false);
  iv.set(new Uint8Array(indexBytes.buffer), 12);
  return iv;
}

async function decryptSegmentData(encryptedData, key, iv, segmentIndex) {
  if (!key) return encryptedData;

  const actualIv = iv || generateIVShared(segmentIndex);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "AES-CBC" },
    false,
    ["decrypt"]
  );

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: actualIv },
      cryptoKey,
      encryptedData
    );
    return new Uint8Array(decrypted);
  } catch (error) {
    console.error("解密失败:", error);
    return encryptedData;
  }
}

async function parseM3U8Manifest(m3u8Url) {
  const response = await fetch(m3u8Url);
  const text = await response.text();
  const lines = text.split("\n");

  const segments = [];
  let key = null;
  let iv = null;
  const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf("/") + 1);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith("#EXT-X-KEY")) {
      const keyMatch = line.match(/URI="([^"]+)"/);
      const ivMatch = line.match(/IV=0x([0-9A-Fa-f]+)/);

      if (keyMatch) {
        const keyUrl = resolveUrlShared(keyMatch[1], baseUrl);
        const keyResponse = await fetch(keyUrl);
        key = await keyResponse.arrayBuffer();
      }

      if (ivMatch) {
        iv = hexToBytesShared(ivMatch[1]);
      }
    }

    if (line && !line.startsWith("#")) {
      segments.push({
        url: resolveUrlShared(line, baseUrl),
        index: segments.length,
      });
    }
  }

  return { segments, key, iv };
}

async function fetchSegmentData(segment, key, iv, retryOnce = false) {
  try {
    const response = await fetch(segment.url);
    const arrayBuffer = await response.arrayBuffer();
    let data = new Uint8Array(arrayBuffer);

    if (key) {
      data = await decryptSegmentData(data, key, iv, segment.index);
    }
    return data;
  } catch (error) {
    console.error(`下载片段 ${segment.index} 失败:`, error);
    if (!retryOnce) throw error;
    await new Promise((r) => setTimeout(r, 1000));
    const response = await fetch(segment.url);
    const arrayBuffer = await response.arrayBuffer();
    let data = new Uint8Array(arrayBuffer);
    if (key) {
      data = await decryptSegmentData(data, key, iv, segment.index);
    }
    return data;
  }
}

function concatUint8Arrays(chunks) {
  const totalLength = chunks.reduce((sum, seg) => sum + seg.length, 0);
  const mergedData = new Uint8Array(totalLength);
  let offset = 0;
  for (const segment of chunks) {
    mergedData.set(segment, offset);
    offset += segment.length;
  }
  return mergedData;
}

// 本地下载器 - 使用全局 ffmpeg，将 TS 合并并转换为 MP4
class LocalM3U8Downloader {
  constructor() {
    this.ffmpeg = ffmpeg; // 复用已创建的全局实例
    this.tsSegments = [];
    this.key = null;
    this.iv = null;
    this.isDownloading = false;
  }

  // 解析m3u8文件
  async parseM3U8(m3u8Url) {
    const { segments, key, iv } = await parseM3U8Manifest(m3u8Url);
    this.tsSegments = segments;
    this.key = key;
    this.iv = iv;
    return segments;
  }

  // 解析URL
  resolveUrl(url, baseUrl) {
    return resolveUrlShared(url, baseUrl);
  }

  // 十六进制转字节数组
  hexToBytes(hex) {
    return hexToBytesShared(hex);
  }

  // 生成IV
  generateIV(segmentIndex) {
    return generateIVShared(segmentIndex);
  }

  // 解密ts片段
  async decryptSegment(encryptedData, key, iv, segmentIndex) {
    return decryptSegmentData(encryptedData, key, iv, segmentIndex);
  }

  // 下载单个ts片段
  async downloadSegment(segment) {
    return fetchSegmentData(segment, this.key, this.iv, false);
  }

  // 下载所有ts片段（顺序下载，便于展示准确进度）
  async downloadAllSegments(onProgress) {
    const allSegments = [];
    const total = this.tsSegments.length;

    for (let i = 0; i < total; i++) {
      const segment = this.tsSegments[i];
      const data = await this.downloadSegment(segment);
      allSegments.push(data);

      if (onProgress) {
        onProgress({
          stage: 'downloading',
          current: i + 1,
          total,
          percent: Math.round(((i + 1) / total) * 100),
          message: `正在下载视频片段... (${i + 1}/${total})`
        });
      }
    }

    return concatUint8Arrays(allSegments);
  }

  // 使用 FFmpeg 转换为 MP4（复用全局 ffmpeg）
  async convertToMp4(tsData, outputFileName) {
    await ensureFFmpegLoaded();

    const inputFileName = "input.ts";
    const outputFileNameMp4 = outputFileName.endsWith(".mp4")
      ? outputFileName
      : outputFileName + ".mp4";

    // 写入ts文件
    this.ffmpeg.FS("writeFile", inputFileName, tsData);

    // 执行转换（直接 copy）
    await this.ffmpeg.run(
      "-i",
      inputFileName,
      "-c",
      "copy",
      "-bsf:a",
      "aac_adtstoasc",
      outputFileNameMp4
    );

    // 读取输出文件
    const data = this.ffmpeg.FS("readFile", outputFileNameMp4);

    // 清理文件
    this.ffmpeg.FS("unlink", inputFileName);
    this.ffmpeg.FS("unlink", outputFileNameMp4);

    return new Blob([data.buffer], { type: "video/mp4" });
  }

  // 下载文件
  downloadFile(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();

    // 清理
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  // 主下载函数
  async download(m3u8Url, fileName, onProgress) {
    if (this.isDownloading) {
      throw new Error("已有下载任务正在进行");
    }

    this.isDownloading = true;

    try {
      // 1. 解析m3u8
      if (onProgress)
        onProgress({ stage: "parsing", message: "正在解析m3u8文件..." });
      await this.parseM3U8(m3u8Url);

      // 2. 下载所有ts片段
      if (onProgress)
        onProgress({ stage: "downloading", message: "正在下载视频片段..." });
      const tsData = await this.downloadAllSegments((progress) => {
        if (onProgress) {
          onProgress({
            stage: "downloading",
            message: `正在下载视频片段... (${progress.current}/${progress.total})`,
            percent: progress.percent,
            current: progress.current,
            total: progress.total
          });
        }
      });

      // 3. 转换为MP4
      if (onProgress)
        onProgress({ stage: "converting", message: "正在转换为MP4格式..." });
      const mp4Blob = await this.convertToMp4(tsData, fileName);

      // 4. 触发下载
      if (onProgress)
        onProgress({ stage: "saving", message: "正在保存文件..." });
      this.downloadFile(
        mp4Blob,
        fileName.endsWith(".mp4") ? fileName : fileName + ".mp4"
      );

      if (onProgress) onProgress({ stage: "completed", message: "下载完成！" });

      return { success: true, message: "下载完成" };
    } catch (error) {
      console.error("下载失败:", error);
      throw error;
    } finally {
      this.isDownloading = false;
    }
  }
}

// 直接合并并保存 .ts
class LocalM3U8DownloaderSimple {
  constructor() {
    this.tsSegments = [];
    this.key = null;
    this.iv = null;
    this.isDownloading = false;
  }

  async parseM3U8(m3u8Url) {
    const { segments, key, iv } = await parseM3U8Manifest(m3u8Url);
    this.tsSegments = segments;
    this.key = key;
    this.iv = iv;
    return segments;
  }

  resolveUrl(url, baseUrl) {
    return resolveUrlShared(url, baseUrl);
  }

  hexToBytes(hex) {
    return hexToBytesShared(hex);
  }

  generateIV(segmentIndex) {
    return generateIVShared(segmentIndex);
  }

  async decryptSegment(encryptedData, key, iv, segmentIndex) {
    return decryptSegmentData(encryptedData, key, iv, segmentIndex);
  }

  async downloadSegment(segment) {
    return fetchSegmentData(segment, this.key, this.iv, true);
  }

  async downloadAllSegments(onProgress) {
    const allSegments = [];
    const total = this.tsSegments.length;

    // 简单并发（5个一组）
    const concurrency = 5;
    const chunks = [];
    for (let i = 0; i < total; i += concurrency) {
      chunks.push(this.tsSegments.slice(i, i + concurrency));
    }

    let downloaded = 0;
    for (const chunk of chunks) {
      const results = await Promise.all(
        chunk.map((s) => this.downloadSegment(s))
      );
      allSegments.push(...results);

      downloaded += chunk.length;
      if (onProgress) {
        onProgress({
          stage: 'downloading',
          current: downloaded,
          total,
          percent: Math.round((downloaded / total) * 100),
          message: `正在下载视频片段... (${downloaded}/${total})`
        });
      }
    }

    return concatUint8Arrays(allSegments);
  }

  downloadFile(data, fileName) {
    const blob = new Blob([data], { type: "video/mp2t" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName.endsWith(".ts") ? fileName : fileName + ".ts";
    a.click();

    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  async download(m3u8Url, fileName, onProgress) {
    if (this.isDownloading) {
      throw new Error("已有下载任务正在进行");
    }

    this.isDownloading = true;

    try {
      if (onProgress)
        onProgress({ stage: "parsing", message: "正在解析m3u8文件..." });
      await this.parseM3U8(m3u8Url);

      if (onProgress)
        onProgress({ stage: "downloading", message: "正在下载视频片段..." });
      const tsData = await this.downloadAllSegments((progress) => {
        if (onProgress) {
          onProgress({
            stage: "downloading",
            message: `正在下载视频片段... (${progress.current}/${progress.total})`,
            percent: progress.percent,
            current: progress.current,
            total: progress.total
          });
        }
      });

      if (onProgress)
        onProgress({ stage: "saving", message: "正在保存文件..." });
      this.downloadFile(tsData, fileName);

      if (onProgress) onProgress({ stage: "completed", message: "下载完成！" });

      return { success: true, message: "下载完成" };
    } catch (error) {
      console.error("下载失败:", error);
      throw error;
    } finally {
      this.isDownloading = false;
    }
  }
}

// 导出给 popup.js 使用
window.LocalM3U8Downloader = LocalM3U8Downloader;
window.LocalM3U8DownloaderSimple = LocalM3U8DownloaderSimple;
