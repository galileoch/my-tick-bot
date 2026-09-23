// ==UserScript==
// @name         Cityline Auto Click Buy & Continue
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  自動點擊 Cityline 購票按鈕；Presales 可預先輸入資料，任何文字輸入欄位出現後自動填寫及提交
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

  // ============================================
  // Presales 通用文字欄位預先輸入 / 自動提交
  // ============================================
  const IS_PRESALES = /^presales\.cityline\.com(?:\.hk)?$/i.test(window.location.hostname);
  const PRESALE_VALUE_STORAGE_KEY = 'tm_cityline_presale_prefill_24h';
  const LEGACY_PRESALE_VALUE_STORAGE_KEY = 'tm_cityline_presale_prefill_value';
  const LEGACY_PRESALE_MEMBER_STORAGE_KEY = 'tm_cityline_presale_member_number';
  const PRESALE_VALUE_TTL_MS = 24 * 60 * 60 * 1000;

  let presalePrefillValue = '';
  let presaleAutoSubmitted = false;
  // 呢個狀態只存在於今次 page load；F5 / refresh 後一定重設為 false。
  let presaleWaitingArmed = false;

  function loadPresalePrefillValue() {
    try {
      const raw = localStorage.getItem(PRESALE_VALUE_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (
          saved &&
          typeof saved.value === 'string' &&
          saved.value &&
          Number(saved.expiresAt) > Date.now()
        ) {
          return saved.value;
        }

        localStorage.removeItem(PRESALE_VALUE_STORAGE_KEY);
      }

      // 兼容舊版本：如果同一個 tab 仲有舊 sessionStorage 數值，就搬去 24 小時儲存。
      const legacyValue =
        sessionStorage.getItem(LEGACY_PRESALE_VALUE_STORAGE_KEY) ||
        sessionStorage.getItem(LEGACY_PRESALE_MEMBER_STORAGE_KEY) ||
        '';

      if (legacyValue) {
        const expiresAt = Date.now() + PRESALE_VALUE_TTL_MS;
        localStorage.setItem(
          PRESALE_VALUE_STORAGE_KEY,
          JSON.stringify({ value: legacyValue, expiresAt })
        );
        sessionStorage.removeItem(LEGACY_PRESALE_VALUE_STORAGE_KEY);
        sessionStorage.removeItem(LEGACY_PRESALE_MEMBER_STORAGE_KEY);
        return legacyValue;
      }
    } catch (error) {
      console.warn('[TM] 無法讀取 presales 24 小時預填資料。', error);
    }

    return '';
  }

  if (IS_PRESALES) {
    presalePrefillValue = loadPresalePrefillValue();

    // 每次新載入 / F5 都必須由使用者重新按「儲存並等待」。
    // 數字仍會保留並預填在對話框中。
    showPresaleMemberDialog();
  }

  function savePresalePrefillValue(value) {
    const prefillValue = String(value || '').trim();
    if (!prefillValue) return false;

    presalePrefillValue = prefillValue;

    try {
      const expiresAt = Date.now() + PRESALE_VALUE_TTL_MS;
      localStorage.setItem(
        PRESALE_VALUE_STORAGE_KEY,
        JSON.stringify({ value: prefillValue, expiresAt })
      );
      sessionStorage.removeItem(LEGACY_PRESALE_VALUE_STORAGE_KEY);
      sessionStorage.removeItem(LEGACY_PRESALE_MEMBER_STORAGE_KEY);
    } catch (error) {
      console.warn('[TM] 無法儲存 presales 24 小時預填資料。', error);
    }

    console.log('[TM] Presales 預填資料已儲存 24 小時。');
    return true;
  }

  function showPresaleMemberDialog() {
    if (!IS_PRESALES || document.getElementById('tmPresaleMemberDialog')) return;

    // 開啟設定面板即代表暫停等待；必須重新按「儲存並等待」先再啟動。
    presaleWaitingArmed = false;
    presaleAutoSubmitted = false;
    updatePresaleEditButton();

    // 小型非阻擋式浮動面板：不加 mask，頁面仍然可以正常操作。
    const panel = document.createElement('div');
    panel.id = 'tmPresaleMemberDialog';
    panel.style.cssText =
      'position:fixed;top:78px;right:16px;z-index:2147483647;' +
      'box-sizing:border-box;width:min(320px,calc(100vw - 32px));background:rgba(255,255,255,.98);' +
      'border:1px solid #cbd5e1;border-radius:12px;padding:14px;' +
      'box-shadow:0 10px 30px rgba(15,23,42,.22);' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0f172a;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;';

    const title = document.createElement('div');
    title.textContent = 'Cityline Presales 預填資料';
    title.style.cssText = 'font-size:14px;font-weight:700;';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.title = '收起';
    closeBtn.style.cssText =
      'border:0;background:transparent;color:#64748b;font-size:20px;line-height:1;padding:0 2px;cursor:pointer;';

    const hint = document.createElement('div');
    hint.textContent = '資料會保存 24 小時。每次刷新頁面後，請重新按「儲存並等待」先開始自動填寫及提交。';
    hint.style.cssText = 'font-size:12px;line-height:1.45;color:#64748b;margin-bottom:10px;';

    const input = document.createElement('input');
    input.id = 'tmPresaleMemberInput';
    input.type = 'text';
    input.autocomplete = 'off';
    input.placeholder = '會員號 / 信用卡頭 6 位 / 其他預售資料';
    input.value = presalePrefillValue;
    input.style.cssText =
      'box-sizing:border-box;width:100%;padding:9px 10px;border:1px solid #cbd5e1;border-radius:8px;' +
      'font-size:14px;outline:none;margin-bottom:6px;background:#fff;color:#0f172a;';

    const error = document.createElement('div');
    error.style.cssText = 'min-height:16px;font-size:11px;color:#dc2626;margin-bottom:6px;';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = '儲存並等待';
    saveBtn.style.cssText =
      'width:100%;padding:8px 10px;border:0;border-radius:8px;background:#2563eb;color:#fff;' +
      'font-size:12px;font-weight:700;cursor:pointer;';

    function saveAndClose() {
      if (!savePresalePrefillValue(input.value)) {
        error.textContent = '請先輸入預填資料。';
        input.focus();
        return;
      }

      presaleWaitingArmed = true;
      presaleAutoSubmitted = false;
      panel.remove();
      addPresaleMemberEditButton();
    }

    closeBtn.addEventListener('click', () => {
      presaleWaitingArmed = false;
      panel.remove();
      addPresaleMemberEditButton();
    });
    saveBtn.addEventListener('click', saveAndClose);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveAndClose();
      }
    });

    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);
    panel.appendChild(hint);
    panel.appendChild(input);
    panel.appendChild(error);
    panel.appendChild(saveBtn);
    document.body.appendChild(panel);

    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  function addPresaleMemberEditButton() {
    if (!IS_PRESALES) return;

    let button = document.getElementById('tmPresaleMemberEditBtn');
    if (!button) {
      button = document.createElement('button');
      button.id = 'tmPresaleMemberEditBtn';
      button.type = 'button';
      button.style.cssText =
        'position:fixed;right:16px;bottom:16px;z-index:2147483646;padding:8px 12px;border:0;border-radius:999px;' +
        'background:#0f172a;color:#fff;font-size:12px;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer;';
      button.addEventListener('click', showPresaleMemberDialog);
      document.body.appendChild(button);
    }

    updatePresaleEditButton();
  }

  function updatePresaleEditButton() {
    const button = document.getElementById('tmPresaleMemberEditBtn');
    if (!button) return;

    if (presaleWaitingArmed) {
      button.textContent = '預填資料：等待中';
      button.style.background = '#166534';
    } else if (presalePrefillValue) {
      button.textContent = '預填資料：已保存（未等待）';
      button.style.background = '#0f172a';
    } else {
      button.textContent = '設定預填資料';
      button.style.background = '#0f172a';
    }
  }

  function setNativeInputValue(input, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (valueSetter) {
      valueSetter.call(input, value);
    } else {
      input.value = value;
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity || 1) !== 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function getPresaleTextInput() {
    // 不再依賴 #memberNumber。
    // 只要 Presales 頁面出現可見、可編輯的文字類 input，就視為預售驗證欄位。
    const candidates = document.querySelectorAll(
      'input:not([type]), input[type="text"], input[type="tel"], input[type="number"]'
    );

    for (const input of candidates) {
      if (
        input.id === 'tmPresaleMemberInput' ||
        input.closest('#tmPresaleMemberDialog') ||
        input.disabled ||
        input.readOnly ||
        !isVisible(input)
      ) {
        continue;
      }

      return input;
    }

    return null;
  }

  function handlePresalePrefill() {
    if (!IS_PRESALES) return 'not-presales';

    // Refresh 後 presaleWaitingArmed 會重設；未重新按「儲存並等待」前唔做任何自動填入/提交。
    if (!presaleWaitingArmed) return 'not-armed';

    const targetInput = getPresaleTextInput();
    if (!targetInput) return 'not-ready';

    if (!presalePrefillValue) {
      showPresaleMemberDialog();
      return 'waiting-prefill-value';
    }

    if (targetInput.value !== presalePrefillValue) {
      setNativeInputValue(targetInput, presalePrefillValue);
      console.log('[TM] Presales 文字欄位已自動填入。', targetInput);
    }

    const submitBtn = document.querySelector('#buyTicketBtn');
    if (
      submitBtn &&
      isVisible(submitBtn) &&
      !submitBtn.disabled &&
      !presaleAutoSubmitted
    ) {
      presaleAutoSubmitted = true;
      submitBtn.click();
      console.log('[TM] Presales 預填資料已填入並自動提交。');
      return 'submitted';
    }

    return 'waiting-submit';
  }

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
    // Presales：任何文字類 input 一出現就填入預設資料，再按 #buyTicketBtn。
    const presaleResult = handlePresalePrefill();
    if (presaleResult === 'submitted') {
      clearInterval(timer);
      return;
    }

    // Presales 必須繼續等 input 出現，避免未到鐘時提早點擊 #buyTicketBtn 後停止監察。
    if (IS_PRESALES) {
      return;
    }

    // 非 Presales 頁面：保留原有信用卡頭 6 位自動輸入功能
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

  // ============================================
  // 自動重試及懸浮控制面板功能
  // ============================================

  // 只限於 performance 購票子頁面執行自動重試與懸浮控制面板
  if (window.location.pathname.includes('/performance') && window.location.search.includes('event=')) {

    // 插入控制面板樣式
    const style = document.createElement('style');
    style.textContent = `
    .tm-control-panel {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.4);
      border-radius: 12px;
      padding: 14px 18px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      width: 250px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      user-select: none;
      transition: box-shadow 0.3s ease;
    }
    .tm-control-panel:hover {
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
    }
    .tm-control-panel .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
      padding-bottom: 6px;
      cursor: move;
    }
    .tm-control-panel .panel-title {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
    }
    .tm-control-panel .status-container {
      display: flex;
      align-items: center;
      margin-bottom: 12px;
      font-size: 12px;
    }
    .tm-control-panel .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 6px;
      background-color: #ef4444;
      box-shadow: 0 0 6px #ef4444;
      transition: all 0.3s ease;
    }
    .tm-control-panel .status-dot.active {
      background-color: #22c55e;
      box-shadow: 0 0 8px #22c55e;
    }
    .tm-control-panel .status-text {
      font-weight: 600;
      color: #475569;
    }
    .tm-control-panel .btn-toggle {
      width: 100%;
      padding: 8px 12px;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      color: white;
      box-shadow: 0 4px 10px rgba(37, 99, 235, 0.2);
    }
    .tm-control-panel .btn-toggle:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 14px rgba(37, 99, 235, 0.3);
    }
    .tm-control-panel .btn-toggle:active {
      transform: translateY(0);
    }
    .tm-control-panel .btn-toggle.active {
      background: linear-gradient(135deg, #ef4444, #dc2626);
      box-shadow: 0 4px 10px rgba(220, 38, 38, 0.2);
    }
    .tm-control-panel .btn-toggle.active:hover {
      box-shadow: 0 6px 14px rgba(220, 38, 38, 0.3);
    }
  `;
    document.head.appendChild(style);

    // 初始化狀態 (預設為暫停，一開始不自動重試)
    let autoClickActive = false;

    // 創建控制面板 DOM
    const panel = document.createElement('div');
    panel.className = 'tm-control-panel';
    panel.innerHTML = `
    <div class="panel-header" id="tmPanelHeader">
      <span class="panel-title">Cityline 助手</span>
    </div>
    <div class="status-container">
      <span class="status-dot" id="tmStatusDot"></span>
      <span class="status-text" id="tmStatusText">已暫停</span>
    </div>
    <button class="btn-toggle" id="tmToggleBtn">開始自動重試</button>
  `;
    document.body.appendChild(panel);

    const toggleBtn = document.getElementById('tmToggleBtn');
    const statusDot = document.getElementById('tmStatusDot');
    const statusText = document.getElementById('tmStatusText');
    const panelHeader = document.getElementById('tmPanelHeader');

    // 更新 UI 狀態
    function updateUI() {
      if (autoClickActive) {
        statusDot.classList.add('active');
        statusText.textContent = '自動點擊已啟動';
        statusText.style.color = '#16a34a';
        toggleBtn.textContent = '暫停自動重試';
        toggleBtn.classList.add('active');
      } else {
        statusDot.classList.remove('active');
        statusText.textContent = '已暫停';
        statusText.style.color = '#475569';
        toggleBtn.textContent = '開始自動重試';
        toggleBtn.classList.remove('active');
      }
    }

    // 紀錄排定的 Timeout ID
    let retryTimeoutId = null;

    // 自動點擊重試函數
    function triggerAutoClick() {
      if (!autoClickActive) return;

      // 尋找確定按鈕 (必須是可見且未禁用的)
      let targetBtn = null;
      const buttons = document.querySelectorAll('button.btn-normal-purchase, button.btn-express-purchase');
      for (const btn of buttons) {
        if (btn.disabled) continue;
        const rect = btn.getBoundingClientRect();
        const style = window.getComputedStyle(btn);
        if (style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0) {
          targetBtn = btn;
          break;
        }
      }

      if (targetBtn) {
        console.log("[TM] 自動點擊確定按鈕。");
        targetBtn.click();
      } else {
        console.log("[TM] 未找到可點擊的確定按鈕，將在下一次循環中重新尋找。");
      }

      // 計算 1.0s 到 3.0s 之間的隨機延遲時間
      const delayMs = 1000 + Math.floor(Math.random() * 2000);
      const delaySec = (delayMs / 1000).toFixed(1);

      // 動態更新面板狀態提示用戶
      statusText.textContent = '重試中，下一次點擊於 ' + delaySec + 's 後...';
      statusText.style.color = '#d97706';

      // 排定下一次點擊
      retryTimeoutId = setTimeout(triggerAutoClick, delayMs);
    }

    // 初始化 UI
    updateUI();

    // 若載入時已是啟動狀態，則自動於 1.5 秒後開始重試
    if (autoClickActive) {
      statusText.textContent = '即將開始自動點擊...';
      statusText.style.color = '#d97706';
      retryTimeoutId = setTimeout(triggerAutoClick, 1500);
    }

    // 切換按鈕點擊事件
    toggleBtn.addEventListener('click', () => {
      autoClickActive = !autoClickActive;
      updateUI();

      if (autoClickActive) {
        triggerAutoClick();
      } else {
        if (retryTimeoutId) {
          clearTimeout(retryTimeoutId);
          retryTimeoutId = null;
        }
      }
      console.log('[TM] 自動重試功能已' + (autoClickActive ? '啟動' : '暫停'));
    });

    // 實作拖曳功能
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
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
        element.style.right = 'auto';
      }

      function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
      }
    }
  }
})();