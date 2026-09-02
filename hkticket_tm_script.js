// ==UserScript==
// @name         HKTicketing Auto Select & Confirm
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  自動選擇 hkticketing 場次、票價、增加數量，並以輪詢及延遲等待確保點擊成功 (新增Log與Control Panel)
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
        targetDate: "7月10日",             // 目標場次日期 (例如: "2026年5月3日" 或 "5月3日")
        priorityPrices: [],              // 優先選票清單 (動態抓取並由用家選擇)
        targetQuantity: 2,               // 目標購買數量 (腳本會自動點擊 '+' 掣直到達到此數量)
        privilegeCode: localStorage.getItem('tm_privilege_code') || "123456", // 專屬購票密碼或信用卡頭6位數字 (若不需要請留空 "")
        refreshInterval: 1000            // 點擊日期/重試的延遲時間 (ms)
    };

    // 延遲執行函數
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    function tmlog(msg) {
        console.log(msg);
        const l = document.getElementById('tm-log-content');
        if (l) {
            const time = new Date().toLocaleTimeString('en-GB');
            const div = document.createElement('div');
            div.textContent = `[${time}] ${msg}`;
            l.appendChild(div);
            // 自動捲動到底部
            l.scrollTop = l.scrollHeight;
        }
    }

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

    // 模擬原生點擊事件 (適用於 React/Vue 等框架)
    function simulateClick(element) {
        if (!element) return;
        const options = { bubbles: true, cancelable: true, view: window };
        element.dispatchEvent(new MouseEvent('mousedown', options));
        element.dispatchEvent(new MouseEvent('mouseup', options));
        element.dispatchEvent(new MouseEvent('click', options));
    }

    function makeDraggable(el) {
        const header = el.querySelector('.tm-header');
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        header.onmousedown = function (e) {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        };

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            el.style.top = (el.offsetTop - pos2) + "px";
            el.style.left = (el.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    function initPanels() {
        if (!document.getElementById('tm-style')) {
            const style = document.createElement('style');
            style.id = 'tm-style';
            style.textContent = `
                .tm-panel { position: fixed; z-index: 999999; background: #222; color: #fff; border: 1px solid #555; border-radius: 5px; opacity: 0.4; transition: opacity 0.3s; font-family: sans-serif; resize: both; overflow: hidden; display: flex; flex-direction: column; }
                .tm-panel:hover { opacity: 1.0 !important; }
                .tm-header { padding: 5px 10px; background: #333; cursor: move; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #555; border-radius: 5px 5px 0 0; flex-shrink: 0; }
                .tm-header-btns span { cursor: pointer; margin-left: 8px; color: #aaa; }
                .tm-header-btns span:hover { color: #fff; }
                .tm-content { padding: 10px; font-size: 13px; flex: 1; overflow-y: auto; box-sizing: border-box; width: 100%; }
                #tm-log-content { color: #0f0; line-height: 1.4; word-wrap: break-word;}
                #tm-log-content div { margin-bottom: 4px; border-bottom: 1px solid #333; padding-bottom: 2px;}
                .tm-hidden { display: none !important; }
                #tm-start-btn { width: 100%; padding: 8px; background: #007bff; border: none; border-radius: 4px; cursor: pointer; color: white; font-weight: bold;}
                #tm-start-btn:hover { background: #0056b3; }
            `;
            document.head.appendChild(style);
        }

        if (!document.getElementById('tm-log-panel')) {
            const logPanel = document.createElement('div');
            logPanel.id = 'tm-log-panel';
            logPanel.className = 'tm-panel';
            logPanel.style.top = '20px';
            logPanel.style.right = '20px';
            logPanel.style.width = '300px';
            logPanel.style.height = '240px';
            logPanel.innerHTML = `
                <div class="tm-header">
                    <span>Log Panel</span>
                    <div class="tm-header-btns">
                        <span class="tm-min-btn">──</span>
                    </div>
                </div>
                <div id="tm-log-content" class="tm-content"></div>
            `;
            document.body.appendChild(logPanel);
            makeDraggable(logPanel);
            logPanel.querySelector('.tm-min-btn').onclick = () => {
                document.getElementById('tm-log-content').classList.toggle('tm-hidden');
            };
        }

        if (!document.getElementById('tm-control-panel')) {
            const ctrlPanel = document.createElement('div');
            ctrlPanel.id = 'tm-control-panel';
            ctrlPanel.className = 'tm-panel';
            ctrlPanel.style.top = '280px';
            ctrlPanel.style.right = '20px';
            ctrlPanel.style.width = '240px';
            ctrlPanel.innerHTML = `
                <div class="tm-header">
                    <span>Control Panel</span>
                    <div class="tm-header-btns">
                        <span class="tm-min-btn">──</span>
                    </div>
                </div>
                <div id="tm-control-content" class="tm-content">
                    <div id="tm-date-list-container" style="background:#333; padding:4px; margin-bottom:6px; border:1px solid #555; border-radius:4px;">
                        <label style="display:block; font-size:12px; color:#ccc;">目標日期 (單選):</label>
                        <div style="color:#aaa; font-size:12px;">等待加載日期...</div>
                    </div>
                    <div id="tm-priority-list-container" style="max-height:160px; overflow-y:auto; background:#33; padding:4px; margin-bottom:8px; border:1px solid #555; border-radius:4px;">
                        <label style="display:block; font-size:12px; color:#ccc;">優先票價次序 (點擊加入/取消):</label>
                        <div style="color:#aaa; font-size:12px;">等待加載票價... 揀選日期後會出現</div>
                    </div>
                    <div style="margin-bottom:6px;">
                        <label style="display:block; font-size:12px; color:#ccc;">購買數量:</label>
                        <input type="number" id="tm-conf-qty" value="${CONFIG.targetQuantity}" style="width:100%; box-sizing:border-box; background:#333; color:#fff; border:1px solid #555; padding:4px; font-size:13px;">
                    </div>
                    <div style="margin-bottom:6px;">
                        <label style="display:block; font-size:12px; color:#ccc;">專屬密碼/首6位卡號:</label>
                        <input type="text" id="tm-conf-code" value="${CONFIG.privilegeCode}" style="width:100%; box-sizing:border-box; background:#333; color:#fff; border:1px solid #555; padding:4px; font-size:13px;">
                    </div>
                    <div style="margin-bottom:10px;">
                        <label style="display:block; font-size:12px; color:#ccc;">點擊延遲 (毫秒):</label>
                        <input type="number" id="tm-conf-interval" value="${CONFIG.refreshInterval}" step="100" style="width:100%; box-sizing:border-box; background:#333; color:#fff; border:1px solid #555; padding:4px; font-size:13px;">
                    </div>
                    <label style="display:block; margin-bottom:10px; cursor:pointer; font-size:13px; color:#fff;">
                        <input type="checkbox" id="tm-auto-code-chk" checked> 自動入卡號/密碼
                    </label>
                    <button id="tm-start-btn" style="width:100%; border:none; padding:8px; border-radius:4px; font-weight:bold; cursor:pointer;">開始</button>
                </div>
            `;
            document.body.appendChild(ctrlPanel);
            makeDraggable(ctrlPanel);
            ctrlPanel.querySelector('.tm-min-btn').onclick = () => {
                document.getElementById('tm-control-content').classList.toggle('tm-hidden');
            };

            // 綁定輸入事件，即時更新 CONFIG 物件
            document.getElementById('tm-conf-qty').addEventListener('input', (e) => CONFIG.targetQuantity = parseInt(e.target.value) || 1);
            document.getElementById('tm-conf-code').addEventListener('input', (e) => {
                CONFIG.privilegeCode = e.target.value;
                localStorage.setItem('tm_privilege_code', e.target.value);
            });
            document.getElementById('tm-conf-interval').addEventListener('input', (e) => CONFIG.refreshInterval = parseInt(e.target.value) || 1000);

            document.getElementById('tm-start-btn').onclick = function () {
                if (isRunning) {
                    isRunning = false;
                    this.innerText = "開始";
                    this.style.background = "#007bff";
                    tmlog("已暫停自動點擊！");
                } else {
                    isRunning = true;
                    this.innerText = "停止";
                    this.style.background = "#dc3545";
                    tmlog("啟動自動點擊循環！");
                    runAutoRefresh();
                }
            };
        }
    }

    let isRunning = false;
    let lastExtractedPrices = [];
    let lastExtractedDates = [];

    function updateDateUI(availableOptions) {
        const container = document.getElementById('tm-date-list-container');
        if (!container) return;

        let html = '<label style="display:block; font-size:12px; color:#ccc;">目標日期 (單選):</label>';
        if (availableOptions.length === 0) {
            html += '<div style="color:#aaa; font-size:12px;">等待加載日期...</div>';
        } else {
            if (availableOptions.length === 1) {
                CONFIG.targetDate = availableOptions[0];
            }
            availableOptions.forEach((opt, i) => {
                if (CONFIG.targetDate === "7月10日" && i === 0) {
                    CONFIG.targetDate = opt;
                }
                const isChecked = CONFIG.targetDate === opt ? 'checked' : '';
                html += `<label style="display:block; font-size:12px; margin-bottom:2px; cursor:pointer; color:#fff;">
                            <input type="radio" name="tm-date-radio" value="${opt}" ${isChecked} style="margin-right:6px;">
                            ${opt}
                         </label>`;
            });
        }

        container.innerHTML = html;

        container.querySelectorAll('input[name="tm-date-radio"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                CONFIG.targetDate = e.target.value;
                tmlog(`已更新目標日期為: ${CONFIG.targetDate}`);
            });
        });
    }

    function updatePriorityUI(availableOptions) {
        const container = document.getElementById('tm-priority-list-container');
        if (!container) return;

        let html = '<label style="display:block; font-size:12px; color:#ccc;">優先票價次序 (點擊加入/刪除):</label>';
        if (availableOptions.length === 0) {
            html += '<div style="color:#aaa; font-size:12px;">等待加載票價... 揀選日期後會出現</div>';
        } else {
            availableOptions.forEach((opt) => {
                const idx = CONFIG.priorityPrices.indexOf(opt);
                const isChecked = idx > -1 ? 'checked' : '';
                const priorityBadge = idx > -1 ? `<span style="color:#0f0; margin-right:4px;">[${idx + 1}]</span>` : `<span style="color:#666; margin-right:4px;">[ - ]</span>`;
                html += `<div style="margin-top:4px; margin-bottom:4px; padding:2px; border-bottom:1px solid #444;">
                            <label style="cursor:pointer; display:flex; align-items:center; font-size:12px; color:#fff;">
                                <input type="checkbox" class="tm-priority-chk" value="${opt}" ${isChecked} style="margin-right:6px;">
                                ${priorityBadge} ${opt}
                            </label>
                         </div>`;
            });
        }

        container.innerHTML = html;

        container.querySelectorAll('.tm-priority-chk').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const val = e.target.value;
                if (e.target.checked) {
                    if (!CONFIG.priorityPrices.includes(val)) CONFIG.priorityPrices.push(val);
                } else {
                    CONFIG.priorityPrices = CONFIG.priorityPrices.filter(v => v !== val);
                }
                updatePriorityUI(lastExtractedPrices);
            });
        });
    }

    // 獨立運行的背景監控迴圈 (處理突發彈窗)
    setInterval(() => {
        // 1. 遇到繁忙視窗時記錄日誌 (暫停1秒繼續邏輯已移至 runAutoRefresh)
        const busyModalBtn = document.querySelector('.baxia-dialog-close');
        if (busyModalBtn && busyModalBtn.style.display !== 'none') {
            if (isRunning) {
                if (document.getElementById('tm-log-panel')) tmlog("檢測到繁忙視窗，排隊等待解除...");
            }
        }

        // 2. 自動填入專屬密碼 / 信用卡號
        const autoCodeChk = document.getElementById('tm-auto-code-chk');
        if (CONFIG.privilegeCode && autoCodeChk && autoCodeChk.checked) {
            const privilegeInput = document.querySelector('input[name="privilegeCode"]');
            if (privilegeInput && privilegeInput.value !== CONFIG.privilegeCode) {
                if (document.getElementById('tm-log-panel')) tmlog("出現專屬購票密碼視窗，自動輸入密碼...");
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                nativeInputValueSetter.call(privilegeInput, CONFIG.privilegeCode);
                privilegeInput.dispatchEvent(new Event('input', { bubbles: true }));
                privilegeInput.dispatchEvent(new Event('change', { bubbles: true }));

                setTimeout(() => {
                    const modalButtons = document.querySelectorAll('.mz-modal-footer button');
                    for (let btn of modalButtons) {
                        if (btn.innerText.includes('確定')) {
                            simulateClick(btn);
                            if (document.getElementById('tm-log-panel')) tmlog("[成功] 點擊專屬購票「確定」按鈕");
                            break;
                        }
                    }
                }, 300);
            }
        }

        // 3. 自動更新場次與票價選項 (僅在未運行時更新，避免影響效能)
        if (!isRunning && location.href.includes('/selectTicket')) {
            // 更新日期
            const sessionElements = document.querySelectorAll('div[class*="session"]');
            if (sessionElements.length > 0) {
                const dates = new Set();
                const dRegex = /20\d{2}年(\d{1,2}月\d{1,2}日)/g;

                sessionElements.forEach(el => {
                    let dMatch;
                    while ((dMatch = dRegex.exec(el.innerText)) !== null) {
                        dates.add(dMatch[1]);
                    }
                });

                const dArray = Array.from(dates);
                if (JSON.stringify(dArray) !== JSON.stringify(lastExtractedDates) && dArray.length > 0) {
                    lastExtractedDates = dArray;
                    updateDateUI(dArray);
                }
            }

            // 更新票價
            const priceElements = document.querySelectorAll('div[class*="levelItem___"]');
            if (priceElements.length > 0) {
                const opts = new Set();
                priceElements.forEach(el => {
                    let rawText = el.innerText.replace(/\n/g, '').replace(/暫無可售/g, '').replace(/售罄/g, '').trim();
                    if (rawText) opts.add(rawText);
                });
                const optsArray = Array.from(opts);
                if (JSON.stringify(optsArray) !== JSON.stringify(lastExtractedPrices) && optsArray.length > 0) {
                    lastExtractedPrices = optsArray;
                    CONFIG.priorityPrices = []; // 重置之前的選擇
                    updatePriorityUI(optsArray);
                    if (document.getElementById('tm-log-panel')) {
                        console.log("優先票價已根據最新場次重置。");
                    }
                }
            }
        }
    }, 400);

    async function runAutoRefresh() {
        while (isRunning) {
            // 檢查是否有繁忙視窗 (如 Baxia 滑塊)
            const busyModalBtn = document.querySelector('.baxia-dialog-close');
            if (busyModalBtn && busyModalBtn.style.display !== 'none') {
                tmlog("檢測到繁忙視窗，暫停1秒後繼續...");
                await sleep(1000);
                continue;
            }

            // 嘗試尋找並點擊目標日期
            let targetEl = null;
            let altEl = null;
            const sessions = document.querySelectorAll('div[class*="session"]');
            const dateButtons = [];

            for (let el of sessions) {
                // 只取最內層的 session 元素 (按鈕層級)
                if (el.querySelector('div[class*="session"]')) continue;

                if (el.innerText.includes('年') && el.innerText.includes('月')) {
                    dateButtons.push(el);
                    if (el.innerText.includes(CONFIG.targetDate)) {
                        targetEl = el;
                    } else {
                        altEl = el;
                    }
                }
            }

            // 只有一個場次時，直接以該日期為目標（無需人手揀日期／票價）
            if (dateButtons.length === 1) {
                targetEl = dateButtons[0];
                altEl = null;
            }

            if (targetEl) {
                // 如果目標日期已經是被點擊選中狀態，則先隨便點擊另一個日期迫使頁面刷新 (若有其他日期的話)
                if (targetEl.className.includes('fouceStyle') || targetEl.className.includes('focusStyle')) {
                    if (altEl) {
                        tmlog(`該日期正處於選中狀態，先點擊其他日子作強制刷新...`);
                        simulateClick(altEl);
                        await sleep(400); // 稍候讓前端框架載入狀態
                    }
                }

                simulateClick(targetEl);
                tmlog(`點擊目標日期: ${CONFIG.targetDate}`);
                await sleep(CONFIG.refreshInterval); // 動態延遲等待 DOM 更新
            } else {
                tmlog(`未找到目標日期: ${CONFIG.targetDate}`);
                await sleep(CONFIG.refreshInterval);
                continue;
            }

            // 檢查目標票價是否可用
            let foundPrice = null;
            const isSingleDate = dateButtons.length === 1;

            if (CONFIG.priorityPrices.length === 0 && !isSingleDate) {
                tmlog(`[警告] 您尚未在 Control Panel 選擇任何優先票價！請先停用並選擇。`);
                isRunning = false;
                const btn = document.getElementById('tm-start-btn');
                if (btn) {
                    btn.innerText = "開始";
                    btn.style.background = "#007bff";
                }
                return;
            }

            const priceElements = document.querySelectorAll('div[class*="levelItem___"]');
            const isPriceAvailable = (el) => {
                const text = el.innerText;
                return !el.className.includes('disableClass') && !text.includes('暫無可售') && !text.includes('售罄');
            };
            const getPriceLabel = (el) => el.innerText.replace(/\n/g, '').replace(/暫無可售/g, '').replace(/售罄/g, '').trim();

            if (CONFIG.priorityPrices.length > 0) {
                // 按照 Priority List 次序尋找
                for (let targetOpt of CONFIG.priorityPrices) {
                    for (let el of priceElements) {
                        if (getPriceLabel(el) === targetOpt && isPriceAvailable(el)) {
                            foundPrice = el;
                            break;
                        }
                    }
                    if (foundPrice) break;
                }
            } else if (isSingleDate) {
                for (let el of priceElements) {
                    if (getPriceLabel(el) && isPriceAvailable(el)) {
                        foundPrice = el;
                        break;
                    }
                }
            }

            if (foundPrice) {
                const priceName = getPriceLabel(foundPrice);
                tmlog(CONFIG.priorityPrices.length > 0
                    ? `[成功] 按照 Priority List 找到可用票種: ${priceName}`
                    : `[成功] 單日場次，自動選擇可提供票價: ${priceName}`);
                isRunning = false;
                const btn = document.getElementById('tm-start-btn');
                if (btn) {
                    btn.innerText = "開始";
                    btn.style.background = "#007bff";
                }

                // 進入購買流程
                continueBuyFlow(foundPrice);
                return;
            } else {
                tmlog(`[等待] 未出現可選目標票價，暫停1秒後繼續...`);
                await sleep(1000);
            }
        }
    }

    async function continueBuyFlow(priceElement) {
        tmlog(`準備點擊票價...`);
        simulateClick(priceElement);
        await sleep(800); // 點擊後等待 AJAX 及 UI 更新

        // 3. 點擊 + 掣以增加購買數量
        const buyNumContainer = await waitForElement('div[class*="buyNum___"]');
        if (buyNumContainer) {
            const spans = buyNumContainer.children;
            if (spans.length >= 3) {
                const plusBtn = spans[2];
                let currentQty = parseInt(spans[1].innerText) || 1;
                tmlog(`當前數量: ${currentQty}，目標: ${CONFIG.targetQuantity}`);

                while (currentQty < CONFIG.targetQuantity) {
                    simulateClick(plusBtn);
                    await sleep(400); // 防過快點擊
                    currentQty = parseInt(spans[1].innerText) || currentQty + 1;
                }
                tmlog(`[成功] 數量已到達: ${CONFIG.targetQuantity}`);
            }
        } else {
            tmlog("[失敗] 找不到調整購買數量的區域");
        }

        // 等待「下一步」按鈕變為可點擊狀態
        await sleep(500);

        // 4. 點擊確認購買按鈕 (下一步 / 立即購買)
        const confirmBtn = await waitForElementByText('button', ['下一步', '立即購買']);
        if (confirmBtn) {
            tmlog("[成功] 點擊「下一步」或「立即購買」");
            simulateClick(confirmBtn);
        } else {
            tmlog("[失敗] 找不到確認購買按鈕");
        }

        tmlog("=== 選擇流程完畢 ===");
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

            const isTargetRoute = url.includes('/selectTicket') || url.includes('/confirmOrder');
            const logPanel = document.getElementById('tm-log-panel');
            const ctrlPanel = document.getElementById('tm-control-panel');

            if (logPanel) logPanel.style.display = isTargetRoute ? 'flex' : 'none';
            if (ctrlPanel) ctrlPanel.style.display = isTargetRoute ? 'flex' : 'none';

            if (!isTargetRoute && typeof isRunning !== 'undefined' && isRunning) {
                isRunning = false;
                const startBtn = document.getElementById('tm-start-btn');
                if (startBtn) {
                    startBtn.innerText = "開始";
                    startBtn.style.background = "#007bff";
                }
            }

            if (logPanel) {
                tmlog("進入頁面: " + currentPath);
                if (!isTargetRoute) tmlog("已離開自動操作頁面，隱藏面板。");
            } else {
                console.log("進入頁面:", currentPath);
            }
        }

        // 1. 處理 /selectTicket (選擇票價頁面)
        if (url.includes('/selectTicket')) {
            const targetContainer = document.querySelector('div[class*="sessionList___"]');
            if (targetContainer && !isExecutedSelectTicket) {
                isExecutedSelectTicket = true;
                initPanels();
                tmlog("進入選擇票價頁面，準備就緒。點擊「開始」自動循環檢查。");
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
                        if (document.getElementById('tm-log-panel')) {
                            tmlog("[成功] 搵到條款同意選項(未選中)，準備點擊。");
                        } else {
                            console.log("[成功] 搵到條款同意選項(未選中)，準備點擊。");
                        }
                        simulateClick(latestIcon);
                    }
                }, 800);
            }
        }
    });

    // 開始監聽 body
    observer.observe(document.body, { childList: true, subtree: true });

})();
