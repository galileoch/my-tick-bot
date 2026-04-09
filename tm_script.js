// ==UserScript==
// @name         Cityline Auto Click Buy & Continue
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  快速自動點擊 buyTicketBtn，並在第二頁自動點擊「繼續」按鈕
// @match        https://shows.cityline.com.hk/*
// @match        https://cultural.cityline.com.hk/*
// @match        https://venue.cityline.com.hk/*
// @grant        none
// @icon         https://www.google.com/s2/favicons?sz=64&domain=cityline.com.hk
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const CLICK_INTERVAL_MS = 50;

  const selectors = [
    {
      name: 'buyTicketBtn',
      query: '#buyTicketBtn',
    },
    {
      name: 'continuePurchaseBtn',
      query: 'button.purchase-btn.required[data-label-group="button.purchase.title"][data-i18n="button.purchase.title"]',
    },
  ];

  const timer = setInterval(() => {
    for (const selector of selectors) {
      const btn = document.querySelector(selector.query);
      if (!btn) continue;

      if (selector.text && btn.textContent?.trim() !== selector.text) {
        continue;
      }

      btn.click();
      clearInterval(timer);
      console.log(`[TM] ${selector.name} found and clicked.`);
      return;
    }
  }, CLICK_INTERVAL_MS);
})();