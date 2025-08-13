// 国际化支持
(function() {
  'use strict';
  
  // 初始化页面的i18n
  function initializeI18n() {
    // 处理所有带有data-i18n属性的元素
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const messageKey = element.getAttribute('data-i18n');
      const message = chrome.i18n.getMessage(messageKey);
      if (message) {
        // 如果是input或textarea，设置placeholder
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
      const message = chrome.i18n.getMessage(messageKey);
      if (message) {
        element.title = message;
      }
    });
    
    // 处理所有带有data-i18n-placeholder属性的元素
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
      const messageKey = element.getAttribute('data-i18n-placeholder');
      const message = chrome.i18n.getMessage(messageKey);
      if (message) {
        element.placeholder = message;
      }
    });
  }
  
  // 格式化带参数的消息
  window.i18n = {
    getMessage: function(key, substitutions) {
      return chrome.i18n.getMessage(key, substitutions);
    },
    
    // 更新URL计数
    updateUrlCount: function(count) {
      const element = document.getElementById('urlCount');
      if (element) {
        element.textContent = chrome.i18n.getMessage('urlCount', [count.toString()]);
      }
    },
    
    // 获取当前语言
    getUILanguage: function() {
      return chrome.i18n.getUILanguage();
    }
  };
  
  // 初始化语言选择器
  function initializeLanguageSelector() {
    const languageSelect = document.getElementById('languageSelect');
    if (!languageSelect) return;
    
    // 获取保存的语言设置
    chrome.storage.local.get(['selectedLanguage'], (result) => {
      const savedLang = result.selectedLanguage || chrome.i18n.getUILanguage().replace('-', '_');
      
      // 设置下拉框的值
      if (savedLang === 'zh_CN' || savedLang.startsWith('zh')) {
        languageSelect.value = 'zh_CN';
      } else {
        languageSelect.value = 'en';
      }
    });
    
    // 监听语言切换
    languageSelect.addEventListener('change', (e) => {
      const newLang = e.target.value;
      
      // 保存语言设置
      chrome.storage.local.set({ selectedLanguage: newLang }, () => {
        // 重新加载页面以应用新语言
        window.location.reload();
      });
    });
  }
  
  // 覆盖chrome.i18n.getMessage以支持自定义语言
  const originalGetMessage = chrome.i18n.getMessage;
  chrome.i18n.getMessage = function(messageName, substitutions) {
    // 首先尝试获取保存的语言设置
    const savedLang = localStorage.getItem('selectedLanguage');
    
    if (savedLang && savedLang !== chrome.i18n.getUILanguage().replace('-', '_')) {
      // 如果有保存的语言且与浏览器语言不同，从对应的语言文件加载
      // 这里需要通过fetch加载对应的语言文件
      // 由于是同步操作的限制，这里仍使用原始方法
      // 实际切换通过重新加载页面实现
    }
    
    return originalGetMessage.call(chrome.i18n, messageName, substitutions);
  };
  
  // DOM加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initializeI18n();
      initializeLanguageSelector();
    });
  } else {
    initializeI18n();
    initializeLanguageSelector();
  }
})();