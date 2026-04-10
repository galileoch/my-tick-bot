// ==UserScript==
// @name         HKTicketing Auto Select & Confirm
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  自動選擇 hkticketing 場次、票價、增加數量，並以輪詢及延遲等待確保點擊成功
// @author       You
// @match        *://*.hkticketing.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=hkticketing.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ==========================================
    // 配置設定 (請在此處填入你想要的目標)
    // ==========================================
    const CONFIG = {
        targetDate: "5月3日",             // 目標場次日期 (例如: "2026年5月3日" 或 "5月3日")
        targetPrice: "1680",             // 目標票價 (例如: "1680" 或 "1680.00")
        targetTicketKeywords: ["標準", "看台"],  // 票種額外文字條件 (全部符合才會點擊，留空陣列 [] 則不限制)
        targetQuantity: 2                // 目標購買數量 (腳本會自動點擊 '+' 掣直到達到此數量)
    };

    // 延遲執行函數
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // 尋找包含特定文字的元素 (支援多組可能文字)
    function findElementByText(selector, text) {
        const elements = document.querySelectorAll(selector);
        for (let el of elements) {
            if (Array.isArray(text)) {
                if (text.some(t => el.innerText.includes(t))) return el;
            } else {
                if (el.innerText.includes(text)) return el;
            }
        }
        return null;
    }

    // 不斷重試尋找元素 (用作等待異步加載)
    async function waitForElementByText(selector, text, maxWaitMs = 10000) {
        const interval = 250;
        const maxRetries = maxWaitMs / interval;
        for (let i = 0; i < maxRetries; i++) {
            const el = findElementByText(selector, text);
            if (el) return el;
            await sleep(interval);
        }
        return null;
    }

    async function waitForElement(selector, maxWaitMs = 10000) {
        const interval = 250;
        const maxRetries = maxWaitMs / interval;
        for (let i = 0; i < maxRetries; i++) {
            const el = document.querySelector(selector);
            if (el) return el;
            await sleep(interval);
        }
        return null;
    }

    // 尋找指定的票價元素
    async function waitForPriceElement(maxWaitMs = 10000) {
        const interval = 250;
        const maxRetries = maxWaitMs / interval;
        for (let i = 0; i < maxRetries; i++) {
            const priceElements = document.querySelectorAll('div[class*="levelItem___"]');
            for (let el of priceElements) {
                if (el.className.includes('disableClass')) continue;
                const text = el.innerText;
                const matchKeywords = CONFIG.targetTicketKeywords.every(kw => text.includes(kw));
                if (text.includes(CONFIG.targetPrice) && matchKeywords) {
                    return el;
                }
            }
            await sleep(interval);
        }
        return null;
    }

    // 模擬原生點擊事件 (適用於 React/Vue 等框架)
    function simulateClick(element) {
        if (!element) return;
        const options = { bubbles: true, cancelable: true, view: window };
        element.dispatchEvent(new MouseEvent('mousedown', options));
        element.dispatchEvent(new MouseEvent('mouseup', options));
        element.dispatchEvent(new MouseEvent('click', options));
    }

    async function autoSelect() {
        console.log("=== HKT Auto Script 開始執行 ===");

        // [等待] 網頁底層 React 綁定事件
        await sleep(800);

        // 1. 選擇場次
        const dateElement = await waitForElementByText('div[class*="sessionList___"]', CONFIG.targetDate);
        if (dateElement) {
            console.log(`[成功] 找到目標日期: ${CONFIG.targetDate}，準備點擊。`);
            simulateClick(dateElement);
            await sleep(800); // 點擊後等待 AJAX 及 UI 更新
        } else {
            console.log(`[失敗] 找不到目標日期: ${CONFIG.targetDate}`);
        }

        // 2. 選擇票價類別
        const priceElement = await waitForPriceElement();
        if (priceElement) {
            console.log(`[成功] 找到目標票價: ${CONFIG.targetPrice}，準備點擊。`);
            simulateClick(priceElement);
            await sleep(800); // 點擊後等待 AJAX 及 UI 更新
        } else {
            console.log(`[失敗] 找不到可售的目標票價: ${CONFIG.targetPrice} 及相關關鍵字`);
        }

        // 3. 點擊 + 掣以增加購買數量
        const buyNumContainer = await waitForElement('div[class*="buyNum___"]');
        if (buyNumContainer) {
            const spans = buyNumContainer.children;
            if (spans.length >= 3) {
                const plusBtn = spans[2];
                let currentQty = parseInt(spans[1].innerText) || 1;
                console.log(`當前購買數量: ${currentQty}，目標數量: ${CONFIG.targetQuantity}`);

                while (currentQty < CONFIG.targetQuantity) {
                    console.log(`點擊 '+' 掣...`);
                    simulateClick(plusBtn);
                    await sleep(400); // 防過快點擊
                    currentQty = parseInt(spans[1].innerText) || currentQty + 1;
                }
                console.log(`[成功] 數量已設定為目標數量: ${CONFIG.targetQuantity}`);
            }
        } else {
            console.log("[失敗] 找不到調整購買數量的區域");
        }

        // 等待「下一步」按鈕變為可點擊狀態
        await sleep(500);

        // 4. 點擊確認購買按鈕 (下一步 / 立即購買)
        const confirmBtn = await waitForElementByText('button', ['下一步', '立即購買']);
        if (confirmBtn) {
            console.log("[成功] 搵到「下一步」或「立即購買」按鈕，準備點擊。");
            simulateClick(confirmBtn);
        } else {
            console.log("[失敗] 找不到確認購買按鈕");
        }

        console.log("=== HKT Auto Script 執行完畢 ===");
    }

    // 透過 MutationObserver 監聽頁面載入與 SPA 路由跳轉
    let isExecutedSelectTicket = false;
    let isExecutedConfirmOrder = false;
    let currentPath = "";

    const observer = new MutationObserver((mutations, obs) => {
        const url = location.href;

        // 若發生跳頁，重設執行紀錄
        if (currentPath !== url) {
            currentPath = url;
            isExecutedSelectTicket = false;
            isExecutedConfirmOrder = false;
            console.log("進入頁面:", currentPath);
        }

        // 1. 處理 /selectTicket (選擇票價頁面)
        if (url.includes('/selectTicket')) {
            const targetContainer = document.querySelector('div[class*="sessionList___"]');
            if (targetContainer && !isExecutedSelectTicket) {
                isExecutedSelectTicket = true;
                // autoSelect 會自動 poll 元素，所以不再需要大幅 setTimeout
                autoSelect();
            }
        }

        // 2. 處理 /confirmOrder (確認訂單頁面)
        if (url.includes('/confirmOrder')) {
            const agreementIcon = document.querySelector('span[class*="agreementIcon___"]');
            if (agreementIcon && !isExecutedConfirmOrder) {
                isExecutedConfirmOrder = true;

                // 異步等待 React Hydration 完畢才點擊
                setTimeout(() => {
                    const latestIcon = document.querySelector('span[class*="agreementIcon___"]');
                    if (latestIcon && latestIcon.innerHTML.includes('#icon-weixuanzhong')) {
                        console.log("[成功] 搵到條款同意選項(未選中)，準備點擊。");
                        simulateClick(latestIcon);
                    }
                }, 800);
            }
        }
    });

    // 開始監聽 body
    observer.observe(document.body, { childList: true, subtree: true });

})();
