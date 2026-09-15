// ==UserScript==
// @name         HKTicketing Auto Select & Confirm
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  自動處理購票須知及立即購買、選擇 hkticketing 場次、票價、增加數量；票價選項按 activityId 保存 48 小時，並記住 Log/Control Panel 位置及尺寸
// @author       You
// @match        *://*.hkticketing.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=hkticketing.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const PRIORITY_PRICE_STORAGE_PREFIX = 'tm_priority_prices_v2_';
    const PRIORITY_PRICE_TTL_MS = 48 * 60 * 60 * 1000;
    const LEGACY_PRIORITY_PRICE_KEY = 'tm_priority_prices';

    function loadStoredJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            const parsed = JSON.parse(raw);
            return parsed ?? fallback;
        } catch (e) {
            return fallback;
        }
    }

    function findActivityIdInObject(value, depth = 0, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || depth > 3) return null;
        if (seen.has(value)) return null;
        seen.add(value);

        for (const [key, child] of Object.entries(value)) {
            const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normalizedKey === 'activityid' && child !== null && child !== undefined && String(child).trim()) {
                return String(child).trim();
            }
        }

        for (const child of Object.values(value)) {
            if (child && typeof child === 'object') {
                const found = findActivityIdInObject(child, depth + 1, seen);
                if (found) return found;
            }
        }
        return null;
    }

    function detectActivityId() {
        const paramNames = ['activityId', 'activityid', 'activityID', 'activity_id'];

        try {
            const url = new URL(location.href);
            for (const name of paramNames) {
                const value = url.searchParams.get(name);
                if (value && value.trim()) return value.trim();
            }

            const hashQueryIndex = url.hash.indexOf('?');
            if (hashQueryIndex >= 0) {
                const hashParams = new URLSearchParams(url.hash.slice(hashQueryIndex + 1));
                for (const name of paramNames) {
                    const value = hashParams.get(name);
                    if (value && value.trim()) return value.trim();
                }
            }
        } catch (e) {
            // fallback below
        }

        const hrefMatch = location.href.match(/[?&#](?:activityId|activityid|activityID|activity_id)=([^&#]+)/i);
        if (hrefMatch && hrefMatch[1]) {
            try {
                return decodeURIComponent(hrefMatch[1]).trim();
            } catch (e) {
                return hrefMatch[1].trim();
            }
        }

        const pathMatch = location.pathname.match(/\/(?:activity|activityid)\/([^/?#]+)/i);
        if (pathMatch && pathMatch[1]) return pathMatch[1].trim();

        const activityNode = document.querySelector('[data-activity-id], [data-activityid]');
        if (activityNode) {
            const value = activityNode.getAttribute('data-activity-id') || activityNode.getAttribute('data-activityid');
            if (value && value.trim()) return value.trim();
        }

        try {
            const stateActivityId = findActivityIdInObject(history.state);
            if (stateActivityId) return stateActivityId;
        } catch (e) {
            // ignore unexpected history state
        }

        return null;
    }

    function getPriorityPriceStorageKey(activityId) {
        if (!activityId) return null;
        return `${PRIORITY_PRICE_STORAGE_PREFIX}${encodeURIComponent(activityId)}`;
    }

    function cleanupExpiredPriorityPriceStorage() {
        const now = Date.now();
        const keysToDelete = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith(PRIORITY_PRICE_STORAGE_PREFIX)) continue;
            const stored = loadStoredJson(key, null);
            const savedAt = stored && Number(stored.savedAt);
            const prices = stored && stored.priorityPrices;
            if (!savedAt || !Array.isArray(prices) || now - savedAt >= PRIORITY_PRICE_TTL_MS) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => localStorage.removeItem(key));
    }

    function loadPriorityPricesForActivity(activityId) {
        cleanupExpiredPriorityPriceStorage();
        const key = getPriorityPriceStorageKey(activityId);
        if (!key) return [];
        const stored = loadStoredJson(key, null);
        if (!stored || !Array.isArray(stored.priorityPrices) || !Number(stored.savedAt)) return [];
        if (Date.now() - Number(stored.savedAt) >= PRIORITY_PRICE_TTL_MS) {
            localStorage.removeItem(key);
            return [];
        }
        return stored.priorityPrices;
    }

    function getPriorityPriceExpiryAt(activityId) {
        const key = getPriorityPriceStorageKey(activityId);
        if (!key) return Infinity;
        const stored = loadStoredJson(key, null);
        const savedAt = stored && Number(stored.savedAt);
        return savedAt ? savedAt + PRIORITY_PRICE_TTL_MS : Infinity;
    }

    // 舊版全站共用同一個 key，無法判斷屬於邊個 show；升級後清走避免污染其他 activity。
    localStorage.removeItem(LEGACY_PRIORITY_PRICE_KEY);
    cleanupExpiredPriorityPriceStorage();

    let activePriorityActivityId = detectActivityId();
    const storedPriorityPrices = loadPriorityPricesForActivity(activePriorityActivityId);
    let activePriorityExpiryAt = getPriorityPriceExpiryAt(activePriorityActivityId);

    const CONFIG = {
        targetDate: localStorage.getItem('tm_target_date') || '7月10日',
        priorityPrices: Array.isArray(storedPriorityPrices) ? storedPriorityPrices : [],
        targetQuantity: 2,
        privilegeCode: localStorage.getItem('tm_privilege_code') || '123456',
        refreshInterval: 1000
    };

    function resolveCurrentActivityId() {
        const detected = detectActivityId();
        if (detected) return detected;
        const inPurchaseFlow = location.href.includes('/selectTicket') || location.href.includes('/confirmOrder');
        return inPurchaseFlow ? activePriorityActivityId : null;
    }

    function savePriorityPrices() {
        const activityId = resolveCurrentActivityId();
        const key = getPriorityPriceStorageKey(activityId);
        if (!key) {
            console.warn('[TM] 找不到 activityId，本次票價選項不會寫入持久化記憶。');
            return;
        }

        const now = Date.now();
        localStorage.setItem(key, JSON.stringify({
            activityId,
            priorityPrices: CONFIG.priorityPrices,
            savedAt: now,
            expiresAt: now + PRIORITY_PRICE_TTL_MS
        }));
        activePriorityActivityId = activityId;
        activePriorityExpiryAt = now + PRIORITY_PRICE_TTL_MS;
    }

    function syncPriorityPricesForCurrentActivity(force = false) {
        const detected = detectActivityId();
        const inPurchaseFlow = location.href.includes('/selectTicket') || location.href.includes('/confirmOrder');
        const nextActivityId = detected || (inPurchaseFlow ? activePriorityActivityId : null);
        const activeMemoryStillFresh = Date.now() < activePriorityExpiryAt;
        if (!force && nextActivityId === activePriorityActivityId && activeMemoryStillFresh) return false;

        activePriorityActivityId = nextActivityId;
        CONFIG.priorityPrices = loadPriorityPricesForActivity(nextActivityId);
        activePriorityExpiryAt = getPriorityPriceExpiryAt(nextActivityId);

        if (document.getElementById('tm-priority-list-container')) {
            updatePriorityUI(lastExtractedPrices);
        }
        if (document.getElementById('tm-log-panel')) {
            tmlog(nextActivityId
                ? `已切換 activityId: ${nextActivityId}，載入該活動 48 小時內的票價選項。`
                : '目前找不到 activityId，票價選項將不會跨頁保存。');
        }
        return true;
    }

    function saveTargetDate() {
        localStorage.setItem('tm_target_date', CONFIG.targetDate);
    }

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    function tmlog(msg) {
        console.log(msg);
        const l = document.getElementById('tm-log-content');
        if (l) {
            const time = new Date().toLocaleTimeString('en-GB');
            const div = document.createElement('div');
            div.textContent = `[${time}] ${msg}`;
            l.appendChild(div);
            l.scrollTop = l.scrollHeight;
        }
    }

    function findElementByText(selector, text) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
            if (Array.isArray(text)) {
                if (text.some(t => el.innerText.includes(t))) return el;
            } else if (el.innerText.includes(text)) {
                return el;
            }
        }
        return null;
    }

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

    function simulateClick(element) {
        if (!element) return;
        const options = { bubbles: true, cancelable: true, view: window };
        element.dispatchEvent(new MouseEvent('mousedown', options));
        element.dispatchEvent(new MouseEvent('mouseup', options));
        element.dispatchEvent(new MouseEvent('click', options));
    }

    function isElementVisible(element) {
        if (!element || !document.documentElement.contains(element)) return false;
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function isButtonEnabled(button) {
        if (!button) return false;
        const ariaDisabled = button.getAttribute('aria-disabled');
        const className = typeof button.className === 'string' ? button.className.toLowerCase() : '';
        return !button.disabled &&
            ariaDisabled !== 'true' &&
            !className.includes('disabled') &&
            !className.includes('disable') &&
            isElementVisible(button);
    }

    async function clickEnabledBuyNow(maxWaitMs = 4000) {
        const interval = 100;
        const maxRetries = Math.ceil(maxWaitMs / interval);
        for (let i = 0; i < maxRetries; i++) {
            const buyNowButtons = Array.from(document.querySelectorAll('button[class*="buyNowBtn___"], button'));
            const buyNowBtn = buyNowButtons.find(btn => btn.innerText.trim() === '立即購買' && isButtonEnabled(btn));
            if (buyNowBtn) {
                simulateClick(buyNowBtn);
                tmlog('[成功] 「立即購買」已 enable，自動點擊。');
                return true;
            }
            await sleep(interval);
        }
        tmlog('[等待] 按完「知悉並同意」後未見到可點擊的「立即購買」。');
        return false;
    }

    let isHandlingTicketDisclaimer = false;

    async function handleTicketDisclaimer() {
        if (isHandlingTicketDisclaimer) return false;

        let modal = null;
        for (const candidate of document.querySelectorAll('.bui-modal')) {
            const title = candidate.querySelector('.modalAndDrawerTitle, [class*="title___"]');
            if (title && title.innerText.includes('購票須知')) {
                modal = candidate;
                break;
            }
        }
        if (!modal || modal.dataset.tmDisclaimerHandled === '1') return false;

        const scrollContainer = modal.querySelector('.bui-scroll.bui-scroll-view-scroll-y, .bui-scroll-view-scroll-y');
        const getAgreeButton = () => Array.from(modal.querySelectorAll('.modalAndDrawerFooter button, button'))
            .find(btn => btn.innerText.trim().includes('知悉並同意'));
        if (!scrollContainer || !getAgreeButton()) return false;

        isHandlingTicketDisclaimer = true;
        try {
            tmlog('檢測到「購票須知」，自動捲動到最底閱讀...');
            const scrollToEnd = () => {
                const bottom = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
                if (typeof scrollContainer.scrollTo === 'function') {
                    scrollContainer.scrollTo({ top: bottom, behavior: 'auto' });
                } else {
                    scrollContainer.scrollTop = bottom;
                }
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
                scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
            };

            scrollToEnd();
            await sleep(300);
            for (let i = 0; i < 10; i++) {
                scrollToEnd();
                const agreeBtn = getAgreeButton();
                if (agreeBtn && !agreeBtn.disabled && agreeBtn.getAttribute('aria-disabled') !== 'true') {
                    modal.dataset.tmDisclaimerHandled = '1';
                    simulateClick(agreeBtn);
                    tmlog('[成功] 已捲到購票須知底部並點擊「知悉並同意」');

                    for (let j = 0; j < 15; j++) {
                        const modalStillVisible = document.documentElement.contains(modal) && isElementVisible(modal);
                        if (!modalStillVisible) break;
                        await sleep(100);
                    }
                    await clickEnabledBuyNow(4000);
                    return true;
                }
                await sleep(200);
            }
            tmlog('[等待] 「知悉並同意」仍未可點擊，稍後再試。');
            return false;
        } finally {
            isHandlingTicketDisclaimer = false;
        }
    }

    const PANEL_LAYOUT_KEY_PREFIX = 'tm_panel_layout_v1_';
    const PANEL_MARGIN = 8;

    function getPanelLayoutKey(el) {
        return PANEL_LAYOUT_KEY_PREFIX + el.id;
    }

    function clampPanelLayout(layout) {
        const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
        const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
        const maxWidth = Math.max(200, viewportWidth - PANEL_MARGIN * 2);
        const maxHeight = Math.max(140, viewportHeight - PANEL_MARGIN * 2);
        const width = Math.min(Math.max(Number(layout.width) || 200, 200), maxWidth);
        const height = Math.min(Math.max(Number(layout.height) || 140, 140), maxHeight);
        const maxLeft = Math.max(PANEL_MARGIN, viewportWidth - width - PANEL_MARGIN);
        const maxTop = Math.max(PANEL_MARGIN, viewportHeight - height - PANEL_MARGIN);
        const left = Math.min(Math.max(Number(layout.left) || PANEL_MARGIN, PANEL_MARGIN), maxLeft);
        const top = Math.min(Math.max(Number(layout.top) || PANEL_MARGIN, PANEL_MARGIN), maxTop);
        return { left, top, width, height };
    }

    function savePanelLayout(el) {
        if (!el || !el.id) return;
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const layout = clampPanelLayout({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
        localStorage.setItem(getPanelLayoutKey(el), JSON.stringify(layout));
    }

    function restorePanelLayout(el, defaults) {
        const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
        const defaultLayout = {
            left: defaults.left ?? Math.max(PANEL_MARGIN, viewportWidth - defaults.width - (defaults.right ?? 20)),
            top: defaults.top,
            width: defaults.width,
            height: defaults.height
        };
        let stored = null;
        try {
            stored = JSON.parse(localStorage.getItem(getPanelLayoutKey(el)) || 'null');
        } catch (e) {
            stored = null;
        }
        const layout = clampPanelLayout(stored && typeof stored === 'object' ? stored : defaultLayout);
        el.style.right = 'auto';
        el.style.left = `${layout.left}px`;
        el.style.top = `${layout.top}px`;
        el.style.width = `${layout.width}px`;
        el.style.height = `${layout.height}px`;
    }

    function makeDraggable(el) {
        const header = el.querySelector('.tm-header');
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        header.onmousedown = function (e) {
            if (e.target.closest('.tm-header-btns')) return;
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
            const next = clampPanelLayout({
                left: el.offsetLeft - pos1,
                top: el.offsetTop - pos2,
                width: el.offsetWidth,
                height: el.offsetHeight
            });
            el.style.left = `${next.left}px`;
            el.style.top = `${next.top}px`;
        }
        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
            savePanelLayout(el);
        }
    }

    function setupPersistentPanel(el, defaults) {
        restorePanelLayout(el, defaults);
        makeDraggable(el);
        if (typeof ResizeObserver !== 'undefined') {
            let resizeTimer = null;
            const resizeObserver = new ResizeObserver(() => {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => savePanelLayout(el), 150);
            });
            resizeObserver.observe(el);
        }
        window.addEventListener('resize', () => {
            const rect = el.getBoundingClientRect();
            const layout = clampPanelLayout({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
            el.style.left = `${layout.left}px`;
            el.style.top = `${layout.top}px`;
            el.style.width = `${layout.width}px`;
            el.style.height = `${layout.height}px`;
            savePanelLayout(el);
        });
    }

    function initPanels() {
        if (!document.getElementById('tm-style')) {
            const style = document.createElement('style');
            style.id = 'tm-style';
            style.textContent = `
                .tm-panel { position: fixed; z-index: 999999; background: #222; color: #fff; border: 1px solid #555; border-radius: 5px; opacity: 0.4; transition: opacity 0.3s; font-family: sans-serif; resize: both; overflow: hidden; display: flex; flex-direction: column; min-width: 200px; min-height: 140px; box-sizing: border-box; }
                .tm-panel:hover { opacity: 1.0 !important; }
                .tm-header { padding: 5px 10px; background: #333; cursor: move; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #555; border-radius: 5px 5px 0 0; flex-shrink: 0; user-select: none; }
                .tm-header-btns span { cursor: pointer; margin-left: 8px; color: #aaa; }
                .tm-header-btns span:hover { color: #fff; }
                .tm-content { padding: 10px; font-size: 13px; flex: 1; min-height: 0; overflow: auto; box-sizing: border-box; width: 100%; }
                #tm-log-content { color: #0f0; line-height: 1.4; word-wrap: break-word; }
                #tm-log-content div { margin-bottom: 4px; border-bottom: 1px solid #333; padding-bottom: 2px; }
                #tm-control-content { display: flex; flex-direction: column; overflow: hidden; gap: 6px; }
                #tm-date-list-container { flex: 0 1 auto; max-height: 28%; overflow-y: auto; background: #333; padding: 4px; border: 1px solid #555; border-radius: 4px; }
                #tm-priority-list-container { flex: 1 1 auto; min-height: 80px; overflow-y: auto; background: #333; padding: 4px; border: 1px solid #555; border-radius: 4px; }
                .tm-control-fields { flex-shrink: 0; }
                .tm-hidden { display: none !important; }
                #tm-start-btn { width: 100%; padding: 8px; background: #007bff; border: none; border-radius: 4px; cursor: pointer; color: white; font-weight: bold; }
                #tm-start-btn:hover { background: #0056b3; }
            `;
            document.head.appendChild(style);
        }

        if (!document.getElementById('tm-log-panel')) {
            const logPanel = document.createElement('div');
            logPanel.id = 'tm-log-panel';
            logPanel.className = 'tm-panel';
            logPanel.innerHTML = `
                <div class="tm-header"><span>Log Panel</span><div class="tm-header-btns"><span class="tm-min-btn">──</span></div></div>
                <div id="tm-log-content" class="tm-content"></div>
            `;
            document.body.appendChild(logPanel);
            setupPersistentPanel(logPanel, { top: 20, right: 20, width: 300, height: 240 });
            logPanel.querySelector('.tm-min-btn').onclick = () => {
                document.getElementById('tm-log-content').classList.toggle('tm-hidden');
            };
        }

        if (!document.getElementById('tm-control-panel')) {
            const ctrlPanel = document.createElement('div');
            ctrlPanel.id = 'tm-control-panel';
            ctrlPanel.className = 'tm-panel';
            ctrlPanel.innerHTML = `
                <div class="tm-header"><span>Control Panel</span><div class="tm-header-btns"><span class="tm-min-btn">──</span></div></div>
                <div id="tm-control-content" class="tm-content">
                    <div id="tm-date-list-container">
                        <label style="display:block; font-size:12px; color:#ccc;">目標日期 (單選):</label>
                        <div style="color:#aaa; font-size:12px;">等待加載日期...</div>
                    </div>
                    <div id="tm-priority-list-container">
                        <label style="display:block; font-size:12px; color:#ccc;">優先票價次序 (點擊加入/取消):</label>
                        <div style="color:#aaa; font-size:12px;">等待加載票價... 揀選日期後會出現</div>
                    </div>
                    <div class="tm-control-fields">
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
                        <button id="tm-start-btn">開始</button>
                    </div>
                </div>
            `;
            document.body.appendChild(ctrlPanel);
            setupPersistentPanel(ctrlPanel, { top: 280, right: 20, width: 240, height: 420 });
            ctrlPanel.querySelector('.tm-min-btn').onclick = () => {
                document.getElementById('tm-control-content').classList.toggle('tm-hidden');
            };

            document.getElementById('tm-conf-qty').addEventListener('input', (e) => {
                CONFIG.targetQuantity = parseInt(e.target.value) || 1;
            });
            document.getElementById('tm-conf-code').addEventListener('input', (e) => {
                CONFIG.privilegeCode = e.target.value;
                localStorage.setItem('tm_privilege_code', e.target.value);
            });
            document.getElementById('tm-conf-interval').addEventListener('input', (e) => {
                CONFIG.refreshInterval = parseInt(e.target.value) || 1000;
            });

            document.getElementById('tm-start-btn').onclick = function () {
                if (isRunning) {
                    isRunning = false;
                    this.innerText = '開始';
                    this.style.background = '#007bff';
                    tmlog('已暫停自動點擊！');
                } else {
                    isRunning = true;
                    this.innerText = '停止';
                    this.style.background = '#dc3545';
                    tmlog('啟動自動點擊循環！');
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
                saveTargetDate();
            }
            availableOptions.forEach((opt, i) => {
                if (CONFIG.targetDate === '7月10日' && i === 0) {
                    CONFIG.targetDate = opt;
                    saveTargetDate();
                }
                const isChecked = CONFIG.targetDate === opt ? 'checked' : '';
                html += `<label style="display:block; font-size:12px; margin-bottom:2px; cursor:pointer; color:#fff;">
                            <input type="radio" name="tm-date-radio" value="${opt}" ${isChecked} style="margin-right:6px;">${opt}
                         </label>`;
            });
        }
        container.innerHTML = html;
        container.querySelectorAll('input[name="tm-date-radio"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                CONFIG.targetDate = e.target.value;
                saveTargetDate();
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
                const priorityBadge = idx > -1
                    ? `<span style="color:#0f0; margin-right:4px;">[${idx + 1}]</span>`
                    : '<span style="color:#666; margin-right:4px;">[ - ]</span>';
                html += `<div style="margin-top:4px; margin-bottom:4px; padding:2px; border-bottom:1px solid #444;">
                            <label style="cursor:pointer; display:flex; align-items:center; font-size:12px; color:#fff;">
                                <input type="checkbox" class="tm-priority-chk" value="${opt}" ${isChecked} style="margin-right:6px;">${priorityBadge} ${opt}
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
                savePriorityPrices();
                updatePriorityUI(lastExtractedPrices);
            });
        });
    }

    setInterval(() => {
        syncPriorityPricesForCurrentActivity();
        handleTicketDisclaimer();

        const busyModalBtn = document.querySelector('.baxia-dialog-close');
        if (busyModalBtn && busyModalBtn.style.display !== 'none' && isRunning) {
            if (document.getElementById('tm-log-panel')) tmlog('檢測到繁忙視窗，排隊等待解除...');
        }

        const autoCodeChk = document.getElementById('tm-auto-code-chk');
        if (CONFIG.privilegeCode && autoCodeChk && autoCodeChk.checked) {
            const privilegeInput = document.querySelector('input[name="privilegeCode"]');
            if (privilegeInput && privilegeInput.value !== CONFIG.privilegeCode) {
                if (document.getElementById('tm-log-panel')) tmlog('出現專屬購票密碼視窗，自動輸入密碼...');
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeInputValueSetter.call(privilegeInput, CONFIG.privilegeCode);
                privilegeInput.dispatchEvent(new Event('input', { bubbles: true }));
                privilegeInput.dispatchEvent(new Event('change', { bubbles: true }));
                setTimeout(() => {
                    for (const btn of document.querySelectorAll('.mz-modal-footer button')) {
                        if (btn.innerText.includes('確定')) {
                            simulateClick(btn);
                            if (document.getElementById('tm-log-panel')) tmlog('[成功] 點擊專屬購票「確定」按鈕');
                            break;
                        }
                    }
                }, 300);
            }
        }

        if (!isRunning && location.href.includes('/selectTicket')) {
            const sessionElements = document.querySelectorAll('div[class*="session"]');
            if (sessionElements.length > 0) {
                const dates = new Set();
                const dRegex = /20\d{2}年(\d{1,2}月\d{1,2}日)/g;
                sessionElements.forEach(el => {
                    let dMatch;
                    while ((dMatch = dRegex.exec(el.innerText)) !== null) dates.add(dMatch[1]);
                });
                const dArray = Array.from(dates);
                if (JSON.stringify(dArray) !== JSON.stringify(lastExtractedDates) && dArray.length > 0) {
                    lastExtractedDates = dArray;
                    updateDateUI(dArray);
                }
            }

            const priceElements = document.querySelectorAll('div[class*="levelItem___"]');
            if (priceElements.length > 0) {
                const opts = new Set();
                priceElements.forEach(el => {
                    const rawText = el.innerText.replace(/\n/g, '').replace(/暫無可售/g, '').replace(/售罄/g, '').trim();
                    if (rawText) opts.add(rawText);
                });
                const optsArray = Array.from(opts);
                if (JSON.stringify(optsArray) !== JSON.stringify(lastExtractedPrices) && optsArray.length > 0) {
                    lastExtractedPrices = optsArray;
                    updatePriorityUI(optsArray);
                }
            }
        }
    }, 400);

    async function runAutoRefresh() {
        while (isRunning) {
            syncPriorityPricesForCurrentActivity();

            const busyModalBtn = document.querySelector('.baxia-dialog-close');
            if (busyModalBtn && busyModalBtn.style.display !== 'none') {
                tmlog('檢測到繁忙視窗，暫停1秒後繼續...');
                await sleep(1000);
                continue;
            }

            let targetEl = null;
            let altEl = null;
            const sessions = document.querySelectorAll('div[class*="session"]');
            const dateButtons = [];
            for (const el of sessions) {
                if (el.querySelector('div[class*="session"]')) continue;
                if (el.innerText.includes('年') && el.innerText.includes('月')) {
                    dateButtons.push(el);
                    if (el.innerText.includes(CONFIG.targetDate)) targetEl = el;
                    else altEl = el;
                }
            }

            if (dateButtons.length === 1) {
                targetEl = dateButtons[0];
                altEl = null;
            }

            if (targetEl) {
                if ((targetEl.className.includes('fouceStyle') || targetEl.className.includes('focusStyle')) && altEl) {
                    tmlog('該日期正處於選中狀態，先點擊其他日子作強制刷新...');
                    simulateClick(altEl);
                    await sleep(400);
                }
                simulateClick(targetEl);
                tmlog(`點擊目標日期: ${CONFIG.targetDate}`);
                await sleep(CONFIG.refreshInterval);
            } else {
                tmlog(`未找到目標日期: ${CONFIG.targetDate}`);
                await sleep(CONFIG.refreshInterval);
                continue;
            }

            let foundPrice = null;
            const isSingleDate = dateButtons.length === 1;
            if (CONFIG.priorityPrices.length === 0 && !isSingleDate) {
                tmlog('[警告] 您尚未在 Control Panel 選擇任何優先票價！請先停用並選擇。');
                isRunning = false;
                const btn = document.getElementById('tm-start-btn');
                if (btn) {
                    btn.innerText = '開始';
                    btn.style.background = '#007bff';
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
                for (const targetOpt of CONFIG.priorityPrices) {
                    for (const el of priceElements) {
                        if (getPriceLabel(el) === targetOpt && isPriceAvailable(el)) {
                            foundPrice = el;
                            break;
                        }
                    }
                    if (foundPrice) break;
                }
            } else if (isSingleDate) {
                for (const el of priceElements) {
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
                    btn.innerText = '開始';
                    btn.style.background = '#007bff';
                }
                continueBuyFlow(foundPrice);
                return;
            }

            tmlog('[等待] 未出現可選目標票價，暫停1秒後繼續...');
            await sleep(1000);
        }
    }

    async function continueBuyFlow(priceElement) {
        tmlog('準備點擊票價...');
        simulateClick(priceElement);
        await sleep(800);

        const buyNumContainer = await waitForElement('div[class*="buyNum___"]');
        if (buyNumContainer) {
            const spans = buyNumContainer.children;
            if (spans.length >= 3) {
                const plusBtn = spans[2];
                let currentQty = parseInt(spans[1].innerText) || 1;
                tmlog(`當前數量: ${currentQty}，目標: ${CONFIG.targetQuantity}`);
                while (currentQty < CONFIG.targetQuantity) {
                    simulateClick(plusBtn);
                    await sleep(400);
                    currentQty = parseInt(spans[1].innerText) || currentQty + 1;
                }
                tmlog(`[成功] 數量已到達: ${CONFIG.targetQuantity}`);
            }
        } else {
            tmlog('[失敗] 找不到調整購買數量的區域');
        }

        await sleep(500);
        const confirmBtn = await waitForElementByText('button', ['下一步', '立即購買']);
        if (confirmBtn) {
            tmlog('[成功] 點擊「下一步」或「立即購買」');
            simulateClick(confirmBtn);
        } else {
            tmlog('[失敗] 找不到確認購買按鈕');
        }
        tmlog('=== 選擇流程完畢 ===');
    }

    let isExecutedSelectTicket = false;
    let isExecutedConfirmOrder = false;
    let currentPath = '';

    const observer = new MutationObserver(() => {
        const url = location.href;
        if (currentPath !== url) {
            currentPath = url;
            isExecutedSelectTicket = false;
            isExecutedConfirmOrder = false;
            syncPriorityPricesForCurrentActivity();

            const isTargetRoute = url.includes('/selectTicket') || url.includes('/confirmOrder');
            const logPanel = document.getElementById('tm-log-panel');
            const ctrlPanel = document.getElementById('tm-control-panel');
            if (logPanel) logPanel.style.display = isTargetRoute ? 'flex' : 'none';
            if (ctrlPanel) ctrlPanel.style.display = isTargetRoute ? 'flex' : 'none';

            if (!isTargetRoute && isRunning) {
                isRunning = false;
                const startBtn = document.getElementById('tm-start-btn');
                if (startBtn) {
                    startBtn.innerText = '開始';
                    startBtn.style.background = '#007bff';
                }
            }

            if (logPanel) {
                tmlog('進入頁面: ' + currentPath);
                if (!isTargetRoute) tmlog('已離開自動操作頁面，隱藏面板。');
            } else {
                console.log('進入頁面:', currentPath);
            }
        }

        if (url.includes('/selectTicket')) {
            const targetContainer = document.querySelector('div[class*="sessionList___"]');
            if (targetContainer && !isExecutedSelectTicket) {
                isExecutedSelectTicket = true;
                initPanels();
                syncPriorityPricesForCurrentActivity(true);
                tmlog('進入選擇票價頁面，準備就緒。點擊「開始」自動循環檢查。');
            }
        }

        if (url.includes('/confirmOrder')) {
            const agreementIcon = document.querySelector('span[class*="agreementIcon___"]');
            if (agreementIcon && !isExecutedConfirmOrder) {
                isExecutedConfirmOrder = true;
                setTimeout(() => {
                    const latestIcon = document.querySelector('span[class*="agreementIcon___"]');
                    if (latestIcon && latestIcon.innerHTML.includes('#icon-weixuanzhong')) {
                        if (document.getElementById('tm-log-panel')) {
                            tmlog('[成功] 搵到條款同意選項(未選中)，準備點擊。');
                        } else {
                            console.log('[成功] 搵到條款同意選項(未選中)，準備點擊。');
                        }
                        simulateClick(latestIcon);
                    }
                }, 800);
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
