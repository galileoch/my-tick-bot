// ==UserScript==
// @name         Cityline Auto Click Buy & Continue
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  快速自動點擊 buyTicketBtn，並在第二頁自動點擊「繼續」按鈕
// @match        https://shows.cityline.com.hk/*
// @match        https://shows.cityline.com/*
// @match        https://presales.cityline.com.hk/*
// @match        https://presales.cityline.com/*
// @match        https://cultural.cityline.com.hk/*
// @match        https://cultural.cityline.com/*
// @match        https://venue.cityline.com.hk/*
// @match        https://venue.cityline.com/*
// @grant        none
// @icon         https://www.google.com/s2/favicons?sz=64&domain=cityline.com.hk
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // ============================================
  // 設定區域
  // ============================================
  const CONFIG = {
    // 請在此處填寫您的 HSBC Mastercard 頭 6 位數字
    hsbcFirst6Digits: '',
  };

  const CLICK_INTERVAL_MS = 50;

  const selectors = [
    {
      name: 'buyTicketBtn',
      query: '#buyTicketBtn',
    },
    {
      name: 'continuePurchaseBtn',
      query: 'button.purchase-btn',
    },
  ];

  const timer = setInterval(() => {
    // 檢查並自動輸入信用卡頭 6 位數字
    const cardInput = document.querySelector('input[data-input-type="CREDIT_CARD"][maxlength="6"]');
    if (cardInput && !cardInput.dataset.filled && CONFIG.hsbcFirst6Digits) {
      cardInput.value = CONFIG.hsbcFirst6Digits;
      cardInput.dispatchEvent(new Event('input', { bubbles: true }));
      cardInput.dispatchEvent(new Event('change', { bubbles: true }));
      cardInput.dataset.filled = 'true';
      console.log('[TM] Auto-filled credit card first 6 digits.');
    }

    // 檢查並點擊按鈕
    for (const selector of selectors) {
      const btn = document.querySelector(selector.query);
      if (!btn) continue;

      if (selector.text && btn.textContent?.trim() !== selector.text) {
        continue;
      }

      btn.click();
      console.log(`[TM] ${selector.name} found and clicked.`);
      clearInterval(timer);
      return;
    }
  }, CLICK_INTERVAL_MS);
})();