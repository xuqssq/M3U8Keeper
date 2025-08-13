# M3U8 Download Extension

Chrome扩展，用于捕获和下载M3U8视频流。

## 项目结构

```
m3u8_download/
├── manifest.json           # 扩展配置文件
├── lib/                    # 第三方库
│   ├── ffmpeg.min.js
│   ├── ffmpeg-core.js
│   ├── ffmpeg-core.wasm
│   └── ffmpeg-core.worker.js
└── src/                    # 源代码
    ├── assets/             # 资源文件
    │   └── icons/          # 图标文件
    ├── background/         # 后台脚本
    │   └── background.js
    ├── content/            # 内容脚本
    │   ├── content.js
    │   └── injected.js
    ├── newtab/             # 新标签页
    │   ├── newtab.html
    │   ├── newtab.js
    │   └── newtab-styles.css
    ├── popup/              # 弹出窗口
    │   ├── popup.html
    │   ├── popup.js
    │   └── styles.css
    └── utils/              # 工具函数
        └── localDownloader.js
```

## 功能特性

- 自动捕获M3U8视频流URL
- 支持服务器下载和本地下载
- 实时显示TS切片下载进度
- 支持加密视频流解密
- 自动转换为MP4格式

## 使用方法

1. 在Chrome浏览器中加载扩展
2. 访问包含M3U8视频的网页
3. 点击扩展图标查看捕获的URL
4. 点击"下载"按钮进入下载管理页面
5. 选择服务器下载或本地下载