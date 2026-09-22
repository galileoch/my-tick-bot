// ==UserScript==
// @name         Cityline Auto Click Buy & Continue
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  自動點擊 Cityline 購票按鈕；Presales 可預先輸入會員號並於表單出現時自動填寫及提交
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
  // Presales 會員號預先輸入 / 自動提交
  // ============================================
  const IS_PRESALES = /^presales\.cityline\.com(?:\.hk)?$/i.test(window.location.hostname);
  const PRESALE_MEMBER_STORAGE_KEY = 'tm_cityline_presale_member_number';

  let presaleMemberNumber = '';
  let presaleAutoSubmitted = false;

  if (IS_PRESALES) {
    try {
      presaleMemberNumber = sessionStorage.getItem(PRESALE_MEMBER_STORAGE_KEY) || '';
    } catch (error) {
      console.warn('[TM] 無法讀取 presales 會員號暫存。', error);
    }

    if (presaleMemberNumber) {
      addPresaleMemberEditButton();
    } else {
      showPresaleMemberDialog();
    }
  }

  function savePresaleMemberNumber(value) {
    const memberNumber = String(value || '').trim();
    if (!memberNumber) return false;

    presaleMemberNumber = memberNumber;

    try {
      sessionStorage.setItem(PRESALE_MEMBER_STORAGE_KEY, memberNumber);
    } catch (error) {
      console.warn('[TM] 無法儲存 presales 會員號暫存。', error);
    }

    console.log('[TM] Presales 會員號已預先設定。');
    return true;
  }

  function showPresaleMemberDialog() {
    if (!IS_PRESALES || document.getElementById('tmPresaleMemberDialog')) return;

    const overlay = document.createElement('div');
    overlay.id = 'tmPresaleMemberDialog';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.68);' +
      'display:flex;align-items:center;justify-content:center;padding:20px;';

    const box = document.createElement('div');
    box.style.cssText =
      'width:min(420px,92vw);background:#fff;border-radius:14px;padding:20px;' +
      'box-shadow:0 20px 60px rgba(0,0,0,.35);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0f172a;';

    const title = document.createElement('div');
    title.textContent = 'Cityline Presales 會員號';
    title.style.cssText = 'font-size:18px;font-weight:700;margin-bottom:8px;';

    const hint = document.createElement('div');
    hint.textContent = '先輸入會員號。當 Cityline 會員欄位出現後，會自動填入並按「前往購票」。';
    hint.style.cssText = 'font-size:13px;line-height:1.5;color:#475569;margin-bottom:14px;';

    const input = document.createElement('input');
    input.id = 'tmPresaleMemberInput';
    input.type = 'text';
    input.autocomplete = 'off';
    input.placeholder = '例如：BZ995661422';
    input.value = presaleMemberNumber;
    input.style.cssText =
      'box-sizing:border-box;width:100%;padding:11px 12px;border:1px solid #cbd5e1;border-radius:9px;' +
      'font-size:16px;outline:none;margin-bottom:8px;';

    const error = document.createElement('div');
    error.style.cssText = 'min-height:18px;font-size:12px;color:#dc2626;margin-bottom:8px;';

    const buttons = document.createElement('div');
    buttons.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

    const laterBtn = document.createElement('button');
    laterBtn.type = 'button';
    laterBtn.textContent = '稍後';
    laterBtn.style.cssText =
      'padding:9px 14px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#334155;cursor:pointer;';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = '儲存並等待';
    saveBtn.style.cssText =
      'padding:9px 14px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer;';

    function saveAndClose() {
      if (!savePresaleMemberNumber(input.value)) {
        error.textContent = '請先輸入會員號。';
        input.focus();
        return;
      }

      overlay.remove();
      addPresaleMemberEditButton();
    }

    saveBtn.addEventListener('click', saveAndClose);
    laterBtn.addEventListener('click', () => overlay.remove());
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveAndClose();
      }
    });

    buttons.appendChild(laterBtn);
    buttons.appendChild(saveBtn);
    box.appendChild(title);
    box.appendChild(hint);
    box.appendChild(input);
    box.appendChild(error);
    box.appendChild(buttons);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  function addPresaleMemberEditButton() {
    if (!IS_PRESALES || document.getElementById('tmPresaleMemberEditBtn')) return;

    const button = document.createElement('button');
    button.id = 'tmPresaleMemberEditBtn';
    button.type = 'button';
    button.textContent = '會員號：已設定';
    button.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:2147483646;padding:8px 12px;border:0;border-radius:999px;' +
      'background:#0f172a;color:#fff;font-size:12px;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer;';
    button.addEventListener('click', showPresaleMemberDialog);
    document.body.appendChild(button);
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

  function handlePresaleMembership() {
    if (!IS_PRESALES) return 'not-presales';

    const memberInput = document.querySelector('#memberNumber');
    if (!memberInput || !isVisible(memberInput)) return 'not-ready';

    if (!presaleMemberNumber) {
      showPresaleMemberDialog();
      return 'waiting-member-number';
    }

    if (memberInput.value !== presaleMemberNumber) {
      setNativeInputValue(memberInput, presaleMemberNumber);
      console.log('[TM] Presales 會員號已自動填入。');
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
      console.log('[TM] Presales 會員號已填入並自動提交。');
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
    // Presales：會員欄位一出現就先填會員號，再按提交。
    const presaleResult = handlePresaleMembership();
    if (presaleResult === 'submitted') {
      clearInterval(timer);
      return;
    }
    if (presaleResult === 'waiting-member-number' || presaleResult === 'waiting-submit') {
      return;
    }

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