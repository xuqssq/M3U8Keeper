// M3U8Keeper Logger Utility
// Professional console logging with styled output

const Logger = {
  version: '1.0.0',
  
  // Color palette
  colors: {
    primary: '#FF6B6B',     // Coral red
    secondary: '#4ECDC4',   // Teal
    success: '#95E77E',     // Light green
    warning: '#FFE66D',     // Yellow
    error: '#FF6B6B',       // Red
    info: '#A8E6CF',        // Mint green
    dark: '#2D3436',        // Dark gray
    light: '#DFE6E9'        // Light gray
  },
  
  // Initialize logger with banner
  init(context = 'M3U8Keeper') {
    console.log(
      '\n' +
      '%c M3U8Keeper %c v' + this.version + ' %c\n' +
      '%c The Ultimate M3U8 Media Capture Tool \n\n',
      'color: #fff; background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); padding: 5px 10px; border-radius: 3px 0 0 3px; font-weight: bold;',
      'color: #fff; background: #764ba2; padding: 5px 10px; border-radius: 0 3px 3px 0;',
      '',
      'color: #999; font-style: italic; padding: 2px 0;'
    );
    
    this.info(`[${context}] Initialized successfully`);
  },
  
  // Log with custom styling
  log(message, style = '') {
    console.log(`%c${message}`, style);
  },
  
  // Info message
  info(message, data = null) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(
      `%c ℹ INFO %c ${message} %c[${timestamp}]`,
      'background: #4ECDC4; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
      'color: #4ECDC4; padding: 2px 4px;',
      'color: #999; font-size: 11px;'
    );
    if (data) {
      console.log('%c └─ Data:', 'color: #999; font-size: 11px;', data);
    }
  },
  
  // Success message
  success(message, data = null) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(
      `%c 🏅 SUCCESS %c ${message} %c[${timestamp}]`,
      'background: #95E77E; color: #2D3436; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
      'color: #95E77E; padding: 2px 4px;',
      'color: #999; font-size: 11px;'
    );
    if (data) {
      console.log('%c └─ Data:', 'color: #999; font-size: 11px;', data);
    }
  },
  
  // Warning message
  warn(message, data = null) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(
      `%c ⚠️ WARNING %c ${message} %c[${timestamp}]`,
      'background: #FFE66D; color: #2D3436; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
      'color: #FFE66D; padding: 2px 4px;',
      'color: #999; font-size: 11px;'
    );
    if (data) {
      console.log('%c └─ Data:', 'color: #999; font-size: 11px;', data);
    }
  },
  
  // Error message
  error(message, error = null) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(
      `%c ☹️ ERROR %c ${message} %c[${timestamp}]`,
      'background: #FF6B6B; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
      'color: #FF6B6B; padding: 2px 4px; font-weight: bold;',
      'color: #999; font-size: 11px;'
    );
    if (error) {
      console.error('%c └─ Error Details:', 'color: #FF6B6B; font-size: 11px;', error);
    }
  },
  
  // Debug message (only shows if debug mode is enabled)
  debug(message, data = null) {
    if (this.debugMode) {
      const timestamp = new Date().toLocaleTimeString();
      console.log(
        `%c 🔍 DEBUG %c ${message} %c[${timestamp}]`,
        'background: #A8E6CF; color: #2D3436; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
        'color: #A8E6CF; padding: 2px 4px;',
        'color: #999; font-size: 11px;'
      );
      if (data) {
        console.log('%c └─ Debug Data:', 'color: #999; font-size: 11px;', data);
      }
    }
  },
  
  // Network request captured
  capture(url, details = {}) {
    const timestamp = new Date().toLocaleTimeString();
    const { contentLength, contentType, method = 'unknown' } = details;
    
    console.log(
      `%c 🎯 CAPTURED %c ${method.toUpperCase()} %c ${this.truncateUrl(url)} %c[${timestamp}]`,
      'background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
      'color: #667eea; font-weight: bold; padding: 2px 4px;',
      'color: #667eea; padding: 2px 4px;',
      'color: #999; font-size: 11px;'
    );
    
    if (contentLength || contentType) {
      const sizeStr = contentLength ? this.formatFileSize(contentLength) : 'Unknown';
      const typeStr = contentType || 'Unknown';
      console.log(
        '%c └─ Size: %c' + sizeStr + ' %c Type: %c' + typeStr,
        'color: #999; font-size: 11px;',
        'color: #4ECDC4; font-weight: bold;',
        'color: #999; font-size: 11px;',
        'color: #4ECDC4; font-weight: bold;'
      );
    }
  },
  
  // Group start
  group(title) {
    console.group(
      `%c▼ ${title}`,
      'color: #667eea; font-weight: bold; padding: 2px 0;'
    );
  },
  
  // Group end
  groupEnd() {
    console.groupEnd();
  },
  
  // Table display
  table(data, columns) {
    console.table(data, columns);
  },
  
  // Separator line
  separator() {
    console.log(
      '%c' + '─'.repeat(50),
      'color: #999; font-size: 10px;'
    );
  },
  
  // Helper: Truncate long URLs
  truncateUrl(url, maxLength = 60) {
    if (url.length <= maxLength) return url;
    const start = url.substring(0, 30);
    const end = url.substring(url.length - 27);
    return `${start}...${end}`;
  },
  
  // Helper: Format file size
  formatFileSize(bytes) {
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
  },
  
  // Enable/disable debug mode
  debugMode: false,
  
  enableDebug() {
    this.debugMode = true;
    this.info('Debug mode enabled');
  },
  
  disableDebug() {
    this.debugMode = false;
    this.info('Debug mode disabled');
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Logger;
}