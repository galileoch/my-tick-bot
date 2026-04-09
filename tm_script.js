// ==UserScript==
// @name         Cityline Auto Click Buy Ticket
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  每100ms檢查 buyTicketBtn，出現即自動點擊
// @match        https://shows.cityline.com.hk/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const timer = setInterval(() => {
    const btn = document.querySelector('#buyTicketBtn');
    if (btn) {
      btn.click();
      clearInterval(timer);
      console.log('[TM] buyTicketBtn found and clicked.');
    }
  }, 100);
})();
