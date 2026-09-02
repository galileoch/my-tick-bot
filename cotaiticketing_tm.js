// ==UserScript==
// @name         Cotai Ticketing Auto Refresh
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  金光票務自動刷新工具 - 當沒有立即購票按鈕時自動隨機刷新，並在購票頁面自動關閉特定錯誤彈窗
// @author       Antigravity
// @match        https://hk.cotaiticketing.com/shows/*.html
// @match        https://booking.cotaiticketing.com/*
// @match        https://booking2.cotaiticketing.com/*
// @match        https://reserve.cotaiticketing.com/*
// @grant        none
// @icon         https://www.google.com/s2/favicons?sz=64&domain=cotaiticketing.com
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // 判斷當前頁面類型
    const isShowsPage = window.location.pathname.includes('/shows/');

    // =========================================================================
    // 1. 購票頁面錯誤彈窗自動點擊 (在所有匹配頁面中運作，特別是購票階段)
    // =========================================================================
    let handlingPopup = false;
    setInterval(() => {
        if (handlingPopup) return;

        // 尋找錯誤彈窗
        const errorPopup = document.getElementById('error_popup');
        if (errorPopup && window.getComputedStyle(errorPopup).display !== 'none') {
            const bodyText = errorPopup.textContent || '';
            // 檢查是否包含「超出每張訂單中可購買的門票」等相關字眼
            if (bodyText.includes('超出每張訂單中可購買的門票') || bodyText.includes('超出每張訂單')) {
                handlingPopup = true;

                // 隨機於 1.00 至 2.00 秒之間點擊該 modal 的確認按鈕
                const clickDelay = 1000 + Math.floor(Math.random() * 1000);
                const delaySec = (clickDelay / 1000).toFixed(2);
                console.log(`[TM] 偵測到「超出門票限制」彈窗，將在 ${delaySec} 秒後自動點擊確認。`);

                setTimeout(() => {
                    // 尋找「確認」按鈕
                    const confirmBtn = errorPopup.querySelector('.error_close') ||
                        Array.from(errorPopup.querySelectorAll('a, button')).find(el => el.textContent.trim() === '確認');

                    if (confirmBtn) {
                        try {
                            confirmBtn.click();
                            console.log('[TM] 已成功點擊確認按鈕。');
                        } catch (err) {
                            console.error('[TM] 自動點擊確認按鈕失敗：', err);
                        }
                    } else {
                        console.warn('[TM] 未找到確認按鈕。');
                    }

                    // 延遲重置，避免在同一彈窗連續重複點擊
                    setTimeout(() => {
                        handlingPopup = false;
                    }, 2000);
                }, clickDelay);
            }
        }
    }, 100);

    // =========================================================================
    // 2. 僅在「演出介紹頁」執行的自動刷新及自動點擊「立即購票」功能
    // =========================================================================
    if (isShowsPage) {
        // 獲取頁面上的「立即購票」按鈕元素
        function getBuyButton() {
            // 1. 檢查 class 為 buy-ticket-button 的元素
            const btn1 = document.querySelector('.buy-ticket-button');
            if (btn1) return btn1;

            // 2. 檢查包含「立即購票」文字的 a 或 button 標籤
            const elements = document.querySelectorAll('a, button, input[type="button"], input[type="submit"]');
            for (const el of elements) {
                const text = (el.textContent || el.value || '').trim();
                if (text.includes('立即購票')) {
                    return el;
                }
            }

            // 3. 檢查頁面中是否有 js-replace-button 或是 buy_ticket-button-wrapper 容器下的 a 元素
            const wrapper = document.querySelector('.buy_ticket-button-wrapper a');
            if (wrapper) return wrapper;

            const wrapper2 = document.querySelector('.buy_ticket-button-wrapper');
            if (wrapper2) return wrapper2;

            return null;
        }

        // 插入 CSS 樣式
        const style = document.createElement('style');
        style.textContent = `
            .cotai-tm-panel {
                position: fixed;
                top: 30px;
                right: 30px;
                z-index: 999999;
                background: rgba(22, 33, 106, 0.9); /* 採用金光票務深藍色主題 */
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                border: 2px solid #C09E44; /* 金光票務金色邊框 */
                border-radius: 16px;
                padding: 18px 22px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
                width: 280px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                color: #ffffff;
                user-select: none;
                transition: box-shadow 0.3s ease;
            }
            .cotai-tm-panel:hover {
                box-shadow: 0 15px 50px rgba(192, 158, 68, 0.3);
            }
            .cotai-tm-panel .panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
                border-bottom: 1px solid rgba(192, 158, 68, 0.4);
                padding-bottom: 8px;
                cursor: move;
            }
            .cotai-tm-panel .panel-title {
                font-size: 15px;
                font-weight: 700;
                color: #C09E44;
                letter-spacing: 0.5px;
            }
            .cotai-tm-panel .status-container {
                display: flex;
                align-items: center;
                margin-bottom: 16px;
                font-size: 13px;
            }
            .cotai-tm-panel .status-dot {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                margin-right: 8px;
                background-color: #ff4d4f;
                box-shadow: 0 0 8px #ff4d4f;
                transition: all 0.3s ease;
            }
            .cotai-tm-panel .status-dot.active {
                background-color: #52c41a;
                box-shadow: 0 0 10px #52c41a;
            }
            .cotai-tm-panel .status-dot.waiting {
                background-color: #faad14;
                box-shadow: 0 0 10px #faad14;
            }
            .cotai-tm-panel .status-text {
                font-weight: 500;
                color: #e2e8f0;
            }
            .cotai-tm-panel .btn-toggle {
                width: 100%;
                padding: 10px 14px;
                border: 1px solid #C09E44;
                border-radius: 10px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                background: linear-gradient(135deg, #C09E44, #a48233);
                color: #121945;
                box-shadow: 0 4px 12px rgba(192, 158, 68, 0.2);
                text-align: center;
            }
            .cotai-tm-panel .btn-toggle:hover {
                transform: translateY(-1px);
                box-shadow: 0 6px 16px rgba(192, 158, 68, 0.4);
                background: linear-gradient(135deg, #d3b157, #b89540);
            }
            .cotai-tm-panel .btn-toggle:active {
                transform: translateY(0);
            }
            .cotai-tm-panel .btn-toggle.active {
                background: linear-gradient(135deg, #ff4d4f, #d9363e);
                color: #ffffff;
                border-color: #ff4d4f;
                box-shadow: 0 4px 12px rgba(255, 77, 79, 0.2);
            }
            .cotai-tm-panel .btn-toggle.active:hover {
                background: linear-gradient(135deg, #ff7875, #ff4d4f);
                box-shadow: 0 6px 16px rgba(255, 77, 79, 0.4);
            }
        `;
        document.head.appendChild(style);

        // 依據當前 URL 路徑建立唯一的 localStorage key，隔離不同演出頁面的啟用狀態
        const storageKey = 'cotai_auto_refresh_' + window.location.pathname;
        let autoRefreshActive = localStorage.getItem(storageKey) === 'true';

        // 建立控制面板 DOM
        const panel = document.createElement('div');
        panel.className = 'cotai-tm-panel';
        panel.innerHTML = `
            <div class="panel-header" id="cotaiPanelHeader">
                <span class="panel-title">金光票務自動刷新助手</span>
            </div>
            <div class="status-container">
                <span class="status-dot" id="cotaiStatusDot"></span>
                <span class="status-text" id="cotaiStatusText">已暫停</span>
            </div>
            <button class="btn-toggle" id="cotaiToggleBtn">啟動自動刷新</button>
        `;
        document.body.appendChild(panel);

        const toggleBtn = document.getElementById('cotaiToggleBtn');
        const statusDot = document.getElementById('cotaiStatusDot');
        const statusText = document.getElementById('cotaiStatusText');
        const panelHeader = document.getElementById('cotaiPanelHeader');

        let refreshTimeoutId = null;
        let hasClicked = false;

        // 更新 UI 顯示
        function updateUI() {
            if (autoRefreshActive) {
                statusDot.className = 'status-dot waiting';
                statusText.textContent = '自動刷新中...';
                toggleBtn.textContent = '暫停自動刷新';
                toggleBtn.classList.add('active');
            } else {
                statusDot.className = 'status-dot';
                statusText.textContent = '已暫停';
                toggleBtn.textContent = '啟動自動刷新';
                toggleBtn.classList.remove('active');
            }
        }

        // 隨機重新整理排程
        function scheduleRefresh() {
            if (!autoRefreshActive || hasClicked) return;

            // 隨機計算 1 至 3 秒的延遲時間
            const delayMs = 1000 + Math.floor(Math.random() * 2000);
            const delaySec = (delayMs / 1000).toFixed(2);

            statusText.textContent = `無購票按鈕，將在 ${delaySec} 秒後刷新...`;

            refreshTimeoutId = setTimeout(() => {
                if (autoRefreshActive && !hasClicked) {
                    console.log(`[TM] 執行自動隨機刷新，延遲為 ${delaySec} 秒。`);
                    window.location.reload();
                }
            }, delayMs);
        }

        // 高頻監控按鈕並點擊 (50ms 間隔)
        const clickTimer = setInterval(() => {
            if (hasClicked || !autoRefreshActive) return;
            const buyBtn = getBuyButton();
            if (buyBtn) {
                hasClicked = true;
                console.log('[TM] 偵測到「立即購票」按鈕已出現，自動點擊並停止重新整理。');

                // 點擊按鈕
                try {
                    buyBtn.click();
                } catch (clickErr) {
                    console.error('[TM] 自動點擊按鈕失敗：', clickErr);
                    hasClicked = false; // 失敗了就允許下次重試
                    return;
                }

                // 更新 UI 狀態與停止自動刷新
                autoRefreshActive = false;
                localStorage.setItem(storageKey, 'false');
                updateUI();
                statusDot.className = 'status-dot active';
                statusText.textContent = '已自動點擊購票按鈕！';
                statusText.style.color = '#52c41a';

                // 清除重新整理排程
                if (refreshTimeoutId) {
                    clearTimeout(refreshTimeoutId);
                    refreshTimeoutId = null;
                }

                // 播放提示音
                try {
                    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    const oscillator = audioCtx.createOscillator();
                    oscillator.type = 'sine';
                    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 頻率
                    oscillator.connect(audioCtx.destination);
                    oscillator.start();
                    setTimeout(() => oscillator.stop(), 500);
                } catch (e) {
                    console.error('[TM] 播放提示音失敗：', e);
                }
            }
        }, 50);

        // 初始化狀態
        updateUI();

        if (autoRefreshActive) {
            // 如果已開啟自動刷新，開始排程重新整理
            scheduleRefresh();
        }

        // 按鈕切換事件
        toggleBtn.addEventListener('click', () => {
            autoRefreshActive = !autoRefreshActive;
            localStorage.setItem(storageKey, autoRefreshActive ? 'true' : 'false');
            updateUI();

            if (autoRefreshActive) {
                scheduleRefresh();
            } else {
                if (refreshTimeoutId) {
                    clearTimeout(refreshTimeoutId);
                    refreshTimeoutId = null;
                }
            }
            console.log(`[TM] 自動刷新功能已${autoRefreshActive ? '啟動' : '暫停'}`);
        });

        // 拖曳功能實作
        makeDraggable(panel, panelHeader);

        function makeDraggable(element, handle) {
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            handle.onmousedown = dragMouseDown;

            function dragMouseDown(e) {
                e = e || window.event;
                e.preventDefault();
                pos3 = e.clientX;
                pos4 = e.clientY;
                document.onmouseup = closeDragElement;
                document.onmousemove = elementDrag;
            }

            function elementDrag(e) {
                e = e || window.event;
                e.preventDefault();
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;

                // 限制拖曳位置不要超出視窗
                let newTop = element.offsetTop - pos2;
                let newLeft = element.offsetLeft - pos1;

                const maxTop = window.innerHeight - element.offsetHeight;
                const maxLeft = window.innerWidth - element.offsetWidth;

                if (newTop < 0) newTop = 0;
                if (newTop > maxTop) newTop = maxTop;
                if (newLeft < 0) newLeft = 0;
                if (newLeft > maxLeft) newLeft = maxLeft;

                element.style.top = newTop + "px";
                element.style.left = newLeft + "px";
                element.style.right = 'auto';
            }

            function closeDragElement() {
                document.onmouseup = null;
                document.onmousemove = null;
            }
        }
    }
})();
