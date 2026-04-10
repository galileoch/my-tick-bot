// ==UserScript==
// @name         HKTicketing Auto Auto Selector
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  自動選擇 hkticketing 場次、票價及增加數量
// @author       You
// @match        *://*.hkticketing.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ==========================================
    // 配置設定 (請在此處填入你想要的目標)
    // ==========================================
    const CONFIG = {
        targetDate: "5月3日",      // 目標場次日期 (例如: "2026年5月3日" 或 "5月3日")
        targetPrice: "1680",      // 目標票價 (例如: "1680" 或 "1680.00")
        targetQuantity: 2         // 目標購買數量 (腳本會自動點擊 '+' 掣直到達到此數量)
    };

    // 延遲執行函數
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // 尋找包含特定文字的元素
    function findElementByText(selector, text) {
        const elements = document.querySelectorAll(selector);
        for (let el of elements) {
            if (el.innerText.includes(text)) {
                return el;
            }
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

        // 1. 選擇場次
        // 利用 CSS module 特性，尋找包含 sessionList___ 的 className
        const dateElement = findElementByText('div[class*="sessionList___"]', CONFIG.targetDate);
        if (dateElement) {
            console.log(`[成功] 找到目標日期: ${CONFIG.targetDate}，準備點擊。`);
            simulateClick(dateElement);
            await sleep(500); // 點擊後稍微等待 UI 更新
        } else {
            console.log(`[失敗] 找不到目標日期: ${CONFIG.targetDate}`);
        }

        // 2. 選擇票價類別
        const priceElements = document.querySelectorAll('div[class*="levelItem___"]');
        let foundPrice = false;
        for (let el of priceElements) {
            // 排除含有 disableClass 的元素 (即暫無可售或已滿)
            if (el.className.includes('disableClass')) continue;

            if (el.innerText.includes(CONFIG.targetPrice)) {
                console.log(`[成功] 找到目標票價: ${CONFIG.targetPrice}，準備點擊。`);
                simulateClick(el);
                foundPrice = true;
                await sleep(500); // 點擊後稍微等待 UI 更新
                break;
            }
        }
        if (!foundPrice) {
            console.log(`[失敗] 找不到可售的目標票價: ${CONFIG.targetPrice}`);
        }

        // 3. 點擊 + 掣以增加購買數量
        const buyNumContainer = document.querySelector('div[class*="buyNum___"]');
        if (buyNumContainer) {
            const spans = buyNumContainer.children;
            // 預期結構: <span>-</span> <span>1</span> <span>+</span>
            if (spans.length >= 3) {
                const plusBtn = spans[2]; // 第三個 span 通常是 '+'

                // 讀取這三個元素中間那個的文字作為當前數量
                let currentQtyStr = spans[1].innerText;
                let currentQty = parseInt(currentQtyStr) || 1;

                console.log(`當前購買數量: ${currentQty}，目標數量: ${CONFIG.targetQuantity}`);
                // 如果當前數量小於目標，則持續點擊 + 掣
                while (currentQty < CONFIG.targetQuantity) {
                    console.log(`點擊 '+' 掣...`);
                    simulateClick(plusBtn);
                    await sleep(300); // 防過快點擊

                    // 重新檢查數量，防止死迴圈
                    currentQtyStr = spans[1].innerText;
                    currentQty = parseInt(currentQtyStr) || currentQty + 1;
                }
                console.log(`[成功] 數量已設定為目標數量: ${CONFIG.targetQuantity}`);
            }
        } else {
            console.log("[失敗] 找不到調整購買數量的區域");
        }

        console.log("=== HKT Auto Script 執行完畢 ===");
    }

    // 透過 MutationObserver 監聽頁面載入，確保元素出現才執行
    let isExecuted = false;
    const observer = new MutationObserver((mutations, obs) => {
        // 設定監聽條件: 看到場次元素出現表示頁面算是初次載入完了
        const targetContainer = document.querySelector('div[class*="sessionList___"]');
        if (targetContainer && !isExecuted) {
            isExecuted = true;
            obs.disconnect(); // 停止監聽
            setTimeout(autoSelect, 1500); // 給 SPA 一點時間完成完全渲染再執行
        }
    });

    // 開始監聽 body
    observer.observe(document.body, { childList: true, subtree: true });

})();
