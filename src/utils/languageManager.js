// 语言管理器 - 支持动态语言切换
const LanguageManager = {
  // 语言包
  messages: {
    en: null,
    zh_CN: null
  },
  
  // 当前语言
  currentLang: 'en',
  
  // 初始化
  async init() {
    // 获取保存的语言设置
    const result = await chrome.storage.local.get(['selectedLanguage']);
    const savedLang = result.selectedLanguage;
    
    if (savedLang) {
      this.currentLang = savedLang;
    } else {
      // 根据浏览器语言自动选择
      const uiLang = chrome.i18n.getUILanguage();
      this.currentLang = uiLang.startsWith('zh') ? 'zh_CN' : 'en';
    }
    
    // 加载语言包
    await this.loadLanguages();
    
    // 应用语言
    this.applyLanguage();
    
    // 初始化语言选择器
    this.initLanguageSelector();
  },
  
  // 加载语言包
  async loadLanguages() {
    try {
      // 加载英文语言包
      const enResponse = await fetch(chrome.runtime.getURL('_locales/en/messages.json'));
      this.messages.en = await enResponse.json();
      
      // 加载中文语言包
      const zhResponse = await fetch(chrome.runtime.getURL('_locales/zh_CN/messages.json'));
      this.messages.zh_CN = await zhResponse.json();
    } catch (error) {
      console.error('Failed to load language files:', error);
    }
  },
  
  // 获取消息
  getMessage(key, substitutions) {
    const messages = this.messages[this.currentLang] || this.messages.en;
    
    if (!messages || !messages[key]) {
      return key; // 如果找不到翻译，返回key本身
    }
    
    const messageObj = messages[key];
    let message = messageObj.message;
    
    // 处理替换参数
    if (substitutions) {
      const subs = Array.isArray(substitutions) ? substitutions : [substitutions];
      // 简单替换 $1, $2 等占位符
      subs.forEach((sub, index) => {
        const regex = new RegExp(`\\$${index + 1}`, 'g');
        message = message.replace(regex, sub);
      });
    }
    
    return message;
  },
  
  // 应用语言到页面
  applyLanguage() {
    // 处理所有带有data-i18n属性的元素
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const messageKey = element.getAttribute('data-i18n');
      const message = this.getMessage(messageKey);
      if (message) {
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
          element.placeholder = message;
        } else {
          element.textContent = message;
        }
      }
    });
    
    // 处理所有带有data-i18n-title属性的元素
    document.querySelectorAll('[data-i18n-title]').forEach(element => {
      const messageKey = element.getAttribute('data-i18n-title');
      const message = this.getMessage(messageKey);
      if (message) {
        element.title = message;
      }
    });
    
    // 处理所有带有data-i18n-placeholder属性的元素
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
      const messageKey = element.getAttribute('data-i18n-placeholder');
      const message = this.getMessage(messageKey);
      if (message) {
        element.placeholder = message;
      }
    });
    
    // 更新URL计数
    const urlCount = document.getElementById('urlCount');
    if (urlCount) {
      const count = urlCount.dataset.count || '0';
      urlCount.textContent = this.getMessage('urlCount', [count]);
    }
  },
  
  // 初始化语言选择器
  initLanguageSelector() {
    const languageSelect = document.getElementById('languageSelect');
    if (!languageSelect) return;
    
    // 设置当前语言
    languageSelect.value = this.currentLang;
    
    // 监听语言切换
    languageSelect.addEventListener('change', async (e) => {
      const newLang = e.target.value;
      this.currentLang = newLang;
      
      // 保存语言设置
      await chrome.storage.local.set({ selectedLanguage: newLang });
      
      // 重新应用语言
      this.applyLanguage();
      
      // 触发自定义事件，通知其他组件语言已更改
      window.dispatchEvent(new CustomEvent('languageChanged', { detail: newLang }));
    });
  },
  
  // 更新URL计数
  updateUrlCount(count) {
    const element = document.getElementById('urlCount');
    if (element) {
      element.dataset.count = count.toString();
      element.textContent = this.getMessage('urlCount', [count.toString()]);
    }
  }
};

// 创建全局i18n对象
window.i18n = {
  getMessage: (key, substitutions) => LanguageManager.getMessage(key, substitutions),
  updateUrlCount: (count) => LanguageManager.updateUrlCount(count),
  getUILanguage: () => LanguageManager.currentLang,
  init: () => LanguageManager.initAsync(),
  ready: () => LanguageManager.initPromise || LanguageManager.initAsync()
};

// 创建一个Promise来跟踪初始化状态
LanguageManager.initPromise = null;

// 包装init方法以返回Promise
LanguageManager.initAsync = function() {
  if (!this.initPromise) {
    this.initPromise = this.init();
  }
  return this.initPromise;
};

// 初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    LanguageManager.initAsync();
  });
} else {
  LanguageManager.initAsync();
}