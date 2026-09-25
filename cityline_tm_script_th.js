// ==UserScript==
// @name         Cityline TM + Tickets Hunter Hybrid
// @namespace    http://tampermonkey.net/
// @version      0.1.0
// @description  Cityline Tampermonkey helper: existing prefill UI + Tickets Hunter style page-state flow, date/area/ticket selection and single-clock retry.
// @match        https://shows.cityline.com.hk/*
// @match        https://shows.cityline.com/*
// @match        https://presales.cityline.com.hk/*
// @match        https://presales.cityline.com/*
// @match        https://cultural.cityline.com.hk/*
// @match        https://cultural.cityline.com/*
// @match        https://venue.cityline.com.hk/*
// @match        https://venue.cityline.com/*
// @match        https://www.cityline.com.hk/*
// @match        https://www.cityline.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @icon         https://www.google.com/s2/favicons?sz=64&domain=cityline.com.hk
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // Hybrid design:
  // - Keep the lightweight Tampermonkey / floating-panel approach from cityline_tm_script.js.
  // - Reimplement useful page-state ideas and selectors from tickets_hunter/src/platforms/cityline.py.
  // - Deliberately do NOT automate CAPTCHA / Cloudflare / Turnstile solving.
  // - Use one controller loop and one retry clock only, so click/retry timers do not overlap.

  const CONFIG_KEY = 'tm_cityline_th_config_v1';
  const LEGACY_KEY = 'tm_cityline_presale_prefill_24h';
  const CONFIG_TTL_MS = 24 * 60 * 60 * 1000;
  const TICK_MS = 120;

  const DEFAULT_CONFIG = {
    loginEmail: '',
    presaleValue: '',
    claimPassword: '',
    fullName: '',
    phoneNumber: '',
    dateKeyword: '',
    areaKeyword: '',
    excludeKeyword: '',
    ticketNumber: 1,
    dateFallback: false,
    areaFallback: false,
    autoRetry: true,
    retryMinMs: 1000,
    retryMaxMs: 3000
  };

  let config = loadConfig();

  const state = {
    armed: false,
    busy: false,
    blockUntil: 0,
    presaleSubmitted: false,
    loginSubmitted: false,
    loginModalSubmitted: false,
    buyTicketSubmitted: false,
    continueSubmitted: false,
    dateAssigned: false,
    areaAssigned: false,
    ticketAssigned: false,
    performanceSubmitted: false,
    retryDueAt: 0,
    retryCount: 0,
    lastStatus: '',
    basketDetected: false
  };

  function loadConfig() {
    const now = Date.now();

    try {
      const raw = GM_getValue(CONFIG_KEY, '');
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.expiresAt > now && saved.config) {
          return Object.assign({}, DEFAULT_CONFIG, saved.config);
        }
        GM_deleteValue(CONFIG_KEY);
      }
    } catch (error) {
      console.warn('[TM-TH] Failed to load hybrid config:', error);
    }

    // One-time compatibility import from the existing script's 24h storage.
    try {
      const legacyRaw = GM_getValue(LEGACY_KEY, '');
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw);
        if (legacy.expiresAt > now) {
          return Object.assign({}, DEFAULT_CONFIG, {
            presaleValue: legacy.value || '',
            claimPassword: legacy.claimPassword || '',
            fullName: legacy.fullName || '',
            phoneNumber: legacy.phoneNumber || ''
          });
        }
      }
    } catch (error) {
      console.warn('[TM-TH] Failed to import legacy config:', error);
    }

    return Object.assign({}, DEFAULT_CONFIG);
  }

  function saveConfig(nextConfig) {
    config = Object.assign({}, DEFAULT_CONFIG, nextConfig);
    GM_setValue(CONFIG_KEY, JSON.stringify({
      config: config,
      expiresAt: Date.now() + CONFIG_TTL_MS
    }));
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity || 1) !== 0 &&
      rect.width > 0 &&
      rect.height > 0;
  }

  function isClickable(element) {
    return !!element && isVisible(element) && !element.disabled;
  }

  function setNativeInputValue(input, value) {
    if (!input) return;

    const prototype = input instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;

    const setter = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (setter && setter.set) {
      setter.set.call(input, value);
    } else {
      input.value = value;
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  // Tickets Hunter style matcher:
  // comma = OR groups, spaces inside a group = AND tokens.
  // Example: "VIP 1299, VVIP" means (VIP AND 1299) OR VVIP.
  function matchesKeyword(text, rule) {
    const cleanText = normalizeText(text);
    const cleanRule = normalizeText(rule);
    if (!cleanRule) return true;

    return cleanRule.split(',')
      .map(function (group) { return group.trim(); })
      .filter(Boolean)
      .some(function (group) {
        const tokens = group.split(/\s+/).filter(Boolean);
        return tokens.every(function (token) {
          return cleanText.includes(token);
        });
      });
  }

  function randomBetween(min, max) {
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    return low + Math.floor(Math.random() * (high - low + 1));
  }

  function setStatus(message, kind) {
    if (state.lastStatus === message) return;
    state.lastStatus = message;

    const el = document.getElementById('tmThStatusText');
    const dot = document.getElementById('tmThStatusDot');

    if (el) {
      el.textContent = message;
      if (kind === 'ok') el.style.color = '#15803d';
      else if (kind === 'warn') el.style.color = '#b45309';
      else if (kind === 'error') el.style.color = '#b91c1c';
      else el.style.color = '#475569';
    }

    if (dot) {
      if (state.armed) dot.classList.add('active');
      else dot.classList.remove('active');
    }

    console.log('[TM-TH]', message);
  }

  function pause(ms) {
    state.blockUntil = Date.now() + ms;
  }

  function clickElement(element, label) {
    if (!isClickable(element)) return false;
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    element.click();
    if (label) setStatus(label, 'warn');
    return true;
  }

  function fillSavedFields() {
    if (config.presaleValue) {
      const cardInput = document.querySelector('input[data-input-type="CREDIT_CARD"][maxlength="6"]');
      if (cardInput && !cardInput.disabled && !cardInput.readOnly && cardInput.dataset.tmThFilled !== '1') {
        setNativeInputValue(cardInput, config.presaleValue);
        cardInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        cardInput.dataset.tmThFilled = '1';
      }
    }

    if (config.claimPassword) {
      ['#claimPassword', '#ReTypePwd'].forEach(function (selector) {
        const input = document.querySelector(selector);
        if (input && input.dataset.tmThFilled !== '1') {
          setNativeInputValue(input, config.claimPassword);
          input.dataset.tmThFilled = '1';
        }
      });
    }

    [
      ['#fullname', config.fullName],
      ['#phone', config.phoneNumber]
    ].forEach(function (item) {
      const input = document.querySelector(item[0]);
      const value = item[1];
      if (input && value && input.dataset.tmThFilled !== '1') {
        setNativeInputValue(input, value);
        input.dataset.tmThFilled = '1';
      }
    });
  }

  function acceptCookieIfPresent() {
    const selectors = [
      'button.cookie-accept',
      '.cookie-consent button',
      '#cookie-consent button'
    ];

    for (const selector of selectors) {
      const btn = document.querySelector(selector);
      if (isClickable(btn) && btn.dataset.tmThClicked !== '1') {
        btn.dataset.tmThClicked = '1';
        btn.click();
        return true;
      }
    }

    return false;
  }

  function getPageType() {
    const host = window.location.hostname;
    const path = window.location.pathname;
    const search = window.location.search;

    if (/presales\.cityline\.com(?:\.hk)?$/i.test(host)) return 'presales';
    if (/shows\.cityline\.com(?:\.hk)?$/i.test(host)) return 'shows';
    if (/cityline\.com(?:\.hk)?$/i.test(host) && /\/Login\.html$/i.test(path)) return 'login';
    if (/venue\.cityline\.com(?:\.hk)?$/i.test(host) && path.includes('/eventDetail')) return 'eventDetail';
    if (/venue\.cityline\.com(?:\.hk)?$/i.test(host) && path.includes('/performance') && search.includes('event=')) return 'performance';
    if (/venue\.cityline\.com(?:\.hk)?$/i.test(host) && path.includes('/shoppingBasket')) return 'basket';
    return 'other';
  }

  function handlePresales() {
    if (!state.armed || state.presaleSubmitted) return;

    const candidates = document.querySelectorAll(
      'input:not([type]), input[type="text"], input[type="tel"], input[type="number"]'
    );

    let targetInput = null;
    for (const input of candidates) {
      if (input.closest('#tmThPanel')) continue;
      if (input.disabled || input.readOnly || !isVisible(input)) continue;
      targetInput = input;
      break;
    }

    const submitBtn = document.querySelector('#buyTicketBtn');
    if (!isClickable(submitBtn)) {
      setStatus('Presales：等待 #buyTicketBtn', 'info');
      return;
    }

    if (targetInput) {
      if (!config.presaleValue) {
        setStatus('Presales：請先輸入驗證值', 'error');
        return;
      }

      if (targetInput.value !== config.presaleValue) {
        setNativeInputValue(targetInput, config.presaleValue);
      }
    }

    state.presaleSubmitted = true;
    clickElement(submitBtn, targetInput ? 'Presales：已填入並提交' : 'Presales：已直接提交');
  }

  function handleShows() {
    if (!state.armed || state.buyTicketSubmitted) return;

    const btn = document.querySelector('#buyTicketBtn, button.purchase-btn');
    if (!isClickable(btn)) {
      setStatus('Shows：等待 Buy Ticket', 'info');
      return;
    }

    state.buyTicketSubmitted = true;
    clickElement(btn, 'Shows：已按 Buy Ticket');
  }

  function handleLogin() {
    if (!state.armed || state.loginSubmitted) return;

    const accountInput = document.querySelector('input[type="text"].ant-input, input[type="email"].ant-input');
    if (accountInput && config.loginEmail && accountInput.dataset.tmThFilled !== '1') {
      setNativeInputValue(accountInput, config.loginEmail);
      accountInput.dataset.tmThFilled = '1';
      setStatus('Login：已填入 email，等待驗證完成', 'warn');
      pause(350);
      return;
    }

    const loginBtn = document.querySelector('button.login-btn.submit-btn');
    if (!isClickable(loginBtn)) {
      setStatus('Login：等待登入按鈕啟用 / OTP 驗證', 'info');
      return;
    }

    state.loginSubmitted = true;
    clickElement(loginBtn, 'Login：已提交 email，請完成 OTP');
  }

  function handleLoginModal() {
    if (state.loginModalSubmitted) return false;

    const modal = document.querySelector('div.modal-content');
    const btn = document.querySelector('button.btn-login');
    if (!modal || !isVisible(modal) || !btn) return false;

    const opacity = Number(window.getComputedStyle(btn).opacity || 1);
    if (!isClickable(btn) || opacity < 0.99) {
      setStatus('Event Detail：等待 login modal 驗證完成', 'info');
      return true;
    }

    state.loginModalSubmitted = true;
    clickElement(btn, 'Event Detail：login modal 已提交');
    pause(800);
    return true;
  }

  function handleEventDetail() {
    if (!state.armed) return;

    if (handleLoginModal()) return;
    if (state.continueSubmitted) return;

    const btn = document.querySelector('button.btn-outline-primary.purchase-btn, button.purchase-btn');
    if (!isClickable(btn)) {
      setStatus('Event Detail：等待 Continue', 'info');
      return;
    }

    state.continueSubmitted = true;
    clickElement(btn, 'Event Detail：已按 Continue');
  }

  function getDateCandidates() {
    return Array.from(document.querySelectorAll('button.date-time-position'))
      .filter(function (btn) {
        return isClickable(btn);
      });
  }

  function chooseDate() {
    if (state.dateAssigned) return true;

    const buttons = getDateCandidates();

    // Some performance pages may not expose a date choice at this stage.
    if (buttons.length === 0) {
      state.dateAssigned = true;
      setStatus('Performance：沒有日期選項，直接處理票區', 'info');
      return true;
    }

    let matches = buttons.filter(function (btn) {
      return matchesKeyword(btn.innerText || btn.textContent, config.dateKeyword);
    });

    if (matches.length === 0) {
      if (!config.dateFallback) {
        setStatus('Performance：日期 keyword 無匹配，等待人手處理', 'error');
        return false;
      }
      matches = buttons;
    }

    const target = matches[0];
    if (!target) return false;

    state.dateAssigned = true;
    clickElement(target, 'Performance：已選日期 ' + normalizeText(target.innerText || target.textContent));
    pause(450);
    return false;
  }

  function getAreaCleanText(row) {
    const degree = row.querySelector('.price-degree');
    const price = row.querySelector('.price-num');
    const clean = normalizeText(
      (degree ? degree.innerText : '') + ' ' +
      (price ? price.innerText : '')
    );

    return clean || normalizeText(row.innerText || row.textContent);
  }

  function isSoldOutArea(row) {
    if (row.querySelector('span.price-limited > span[data-i18n*="soldout"]')) return true;

    const text = normalizeText(row.innerText || row.textContent);
    return text.includes('sold out') ||
      text.includes('售罄') ||
      text.includes('售完');
  }

  function getAvailableAreas() {
    return Array.from(document.querySelectorAll('div.form-check'))
      .map(function (row) {
        return { row: row, text: getAreaCleanText(row) };
      })
      .filter(function (item) {
        if (!item.text) return false;
        if (isSoldOutArea(item.row)) return false;
        if (config.excludeKeyword && matchesKeyword(item.text, config.excludeKeyword)) return false;
        const radio = item.row.querySelector('input[type="radio"]');
        return !!radio && !radio.disabled;
      });
  }

  function findLiveAreaByText(targetText) {
    const rows = Array.from(document.querySelectorAll('div.form-check'));
    return rows.find(function (row) {
      return getAreaCleanText(row) === targetText;
    }) || null;
  }

  function chooseArea() {
    if (state.areaAssigned) return true;

    const checked = document.querySelector('div.form-check input[type="radio"]:checked');
    if (checked) {
      state.areaAssigned = true;
      setStatus('Performance：沿用已選票區', 'ok');
      return true;
    }

    const available = getAvailableAreas();
    if (available.length === 0) {
      setStatus('Performance：暫時沒有可用票區', 'warn');
      return false;
    }

    let matches = available.filter(function (item) {
      return matchesKeyword(item.text, config.areaKeyword);
    });

    if (matches.length === 0) {
      if (!config.areaFallback) {
        setStatus('Performance：票區 keyword 無匹配，等待人手處理', 'error');
        return false;
      }
      matches = available;
    }

    const targetInfo = matches[0];
    if (!targetInfo) return false;

    // Re-query against the live DOM before clicking. This mirrors the useful
    // anti-stale-element idea from Tickets Hunter without using Nodriver handles.
    const liveRow = findLiveAreaByText(targetInfo.text);
    const radio = liveRow ? liveRow.querySelector('input[type="radio"]') : null;

    if (!radio || radio.disabled) {
      setStatus('Performance：票區 DOM 剛剛重繪，下一輪再試', 'warn');
      pause(250);
      return false;
    }

    radio.click();
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    state.areaAssigned = true;
    setStatus('Performance：已選票區 ' + targetInfo.text, 'ok');
    pause(350);
    return false;
  }

  function assignTicketNumber() {
    if (state.ticketAssigned) return true;

    const select = document.querySelector('select.select-num');
    if (!select) {
      setStatus('Performance：等待票數選單', 'info');
      return false;
    }

    const wanted = String(Math.max(1, Number(config.ticketNumber) || 1));
    const option = Array.from(select.options).find(function (item) {
      return String(item.value) === wanted;
    });

    if (!option) {
      setStatus('Performance：票數 ' + wanted + ' 不可選', 'error');
      return false;
    }

    select.value = option.value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    state.ticketAssigned = true;
    setStatus('Performance：票數已設為 ' + wanted, 'ok');
    pause(250);
    return false;
  }

  function getPurchaseButton() {
    const selectors = [
      '#expressPurchaseBtn',
      'button.btn-express-purchase',
      'button.purchase-btn.btn-express-purchase',
      'button.btn-normal-purchase',
      'button[onclick*="expressPurchaseCallBack"]',
      'button.btn-next'
    ];

    for (const selector of selectors) {
      const btn = document.querySelector(selector);
      if (isClickable(btn)) return btn;
    }

    return null;
  }

  function scheduleRetry(reason) {
    if (!state.armed || !config.autoRetry) {
      state.retryDueAt = 0;
      return;
    }

    const delay = randomBetween(
      Math.max(250, Number(config.retryMinMs) || 1000),
      Math.max(250, Number(config.retryMaxMs) || 3000)
    );

    state.retryDueAt = Date.now() + delay;
    setStatus(
      (reason || '已送出') + '；下一次 retry 約 ' + (delay / 1000).toFixed(2) + 's 後',
      'warn'
    );
  }

  function runRetryIfDue() {
    if (!state.armed || !config.autoRetry || !state.retryDueAt) return false;

    const remaining = state.retryDueAt - Date.now();
    if (remaining > 0) {
      const statusEl = document.getElementById('tmThStatusText');
      if (statusEl) {
        statusEl.textContent = 'Retry #' + (state.retryCount + 1) + ' 倒數 ' + (remaining / 1000).toFixed(1) + 's';
        statusEl.style.color = '#b45309';
      }
      return true;
    }

    const btn = getPurchaseButton();
    if (!btn) {
      state.retryDueAt = 0;
      setStatus('Retry：按鈕暫時不存在，交回主流程', 'info');
      return false;
    }

    state.retryCount += 1;
    btn.click();
    scheduleRetry('Retry #' + state.retryCount + ' 已點擊');
    return true;
  }

  function handlePerformance() {
    if (!state.armed) return;

    // After the first purchase click, this is the only mechanism allowed
    // to perform repeated retry clicks.
    if (state.performanceSubmitted) {
      runRetryIfDue();
      return;
    }

    if (!chooseDate()) return;
    if (!chooseArea()) return;
    if (!assignTicketNumber()) return;

    const btn = getPurchaseButton();
    if (!btn) {
      setStatus('Performance：等待 Purchase / Next', 'info');
      return;
    }

    state.performanceSubmitted = true;
    btn.click();
    setStatus('Performance：已送出購票', 'warn');
    scheduleRetry('首次購票已送出');
  }

  function handleBasket() {
    if (state.basketDetected) return;
    state.basketDetected = true;
    state.retryDueAt = 0;
    setStatus('SUCCESS：已進入 Shopping Basket，已停止 retry', 'ok');

    try {
      document.title = '✅ ' + document.title;
    } catch (error) {
      // Best effort only.
    }
  }

  function resetTransientFlow() {
    state.presaleSubmitted = false;
    state.loginSubmitted = false;
    state.loginModalSubmitted = false;
    state.buyTicketSubmitted = false;
    state.continueSubmitted = false;
    state.dateAssigned = false;
    state.areaAssigned = false;
    state.ticketAssigned = false;
    state.performanceSubmitted = false;
    state.retryDueAt = 0;
    state.retryCount = 0;
    state.basketDetected = false;
  }

  async function tick() {
    if (state.busy || Date.now() < state.blockUntil) return;
    state.busy = true;

    try {
      fillSavedFields();
      acceptCookieIfPresent();

      const pageType = getPageType();

      if (pageType === 'basket') {
        handleBasket();
      } else if (pageType === 'presales') {
        handlePresales();
      } else if (pageType === 'shows') {
        handleShows();
      } else if (pageType === 'login') {
        handleLogin();
      } else if (pageType === 'eventDetail') {
        handleEventDetail();
      } else if (pageType === 'performance') {
        handlePerformance();
      } else if (state.armed) {
        setStatus('等待 Cityline 購票流程頁面', 'info');
      }
    } catch (error) {
      console.error('[TM-TH] Tick error:', error);
      setStatus('Controller error：請睇 console', 'error');
    } finally {
      state.busy = false;
    }
  }

  function createPanel() {
    if (document.getElementById('tmThPanel')) return;

    const style = document.createElement('style');
    style.textContent = [
      '#tmThPanel{position:fixed;top:18px;right:18px;z-index:2147483647;width:min(330px,calc(100vw - 24px));box-sizing:border-box;background:rgba(255,255,255,.97);border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 12px 34px rgba(15,23,42,.25);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0f172a;overflow:hidden}',
      '#tmThPanel *{box-sizing:border-box}',
      '#tmThHeader{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#0f172a;color:#fff;cursor:move;touch-action:none;user-select:none}',
      '#tmThHeader strong{font-size:13px}',
      '#tmThHeader button{border:0;background:transparent;color:#cbd5e1;font-size:18px;cursor:pointer}',
      '#tmThBody{padding:10px 12px;max-height:78vh;overflow:auto}',
      '.tmThGrid{display:grid;grid-template-columns:1fr 1fr;gap:6px}',
      '.tmThFull{grid-column:1/-1}',
      '.tmThInput{width:100%;padding:7px 8px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#0f172a;font-size:12px}',
      '.tmThLabel{display:block;margin:3px 0 3px;font-size:10px;font-weight:700;color:#64748b}',
      '.tmThChecks{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0;font-size:11px;color:#475569}',
      '.tmThButtons{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}',
      '.tmThBtn{padding:8px;border:0;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer}',
      '#tmThSave{background:#334155;color:#fff}',
      '#tmThToggle{background:#2563eb;color:#fff}',
      '#tmThToggle.active{background:#dc2626}',
      '#tmThStatus{display:flex;align-items:center;gap:6px;margin-top:9px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:11px}',
      '#tmThStatusDot{width:8px;height:8px;border-radius:50%;background:#94a3b8}',
      '#tmThStatusDot.active{background:#22c55e;box-shadow:0 0 7px rgba(34,197,94,.8)}',
      '#tmThMini{display:none;position:fixed;right:14px;bottom:14px;z-index:2147483647;border:0;border-radius:999px;padding:9px 12px;background:#0f172a;color:#fff;font-size:12px;font-weight:700;box-shadow:0 7px 20px rgba(0,0,0,.25);cursor:pointer}'
    ].join('');
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'tmThPanel';
    panel.innerHTML = [
      '<div id="tmThHeader"><strong>Cityline TH Hybrid</strong><button id="tmThCollapse" type="button" title="收起">−</button></div>',
      '<div id="tmThBody">',
        '<div class="tmThGrid">',
          '<div class="tmThFull"><label class="tmThLabel">Cityline login email（可留空）</label><input id="tmThLoginEmail" class="tmThInput" type="email" autocomplete="email"></div>',
          '<div class="tmThFull"><label class="tmThLabel">Presales / 信用卡頭 6 位 / 驗證值</label><input id="tmThPresale" class="tmThInput" type="text" autocomplete="off"></div>',
          '<div><label class="tmThLabel">取票密碼</label><input id="tmThClaim" class="tmThInput" type="text" inputmode="numeric" maxlength="20"></div>',
          '<div><label class="tmThLabel">票數</label><input id="tmThTicketNum" class="tmThInput" type="number" min="1" max="20"></div>',
          '<div><label class="tmThLabel">姓名</label><input id="tmThName" class="tmThInput" type="text" autocomplete="name"></div>',
          '<div><label class="tmThLabel">電話</label><input id="tmThPhone" class="tmThInput" type="tel" autocomplete="tel"></div>',
          '<div class="tmThFull"><label class="tmThLabel">日期 keyword（逗號=OR，空格=AND）</label><input id="tmThDateKeyword" class="tmThInput" type="text" placeholder="例：25 Sep, 26 Sep"></div>',
          '<div class="tmThFull"><label class="tmThLabel">票區 keyword</label><input id="tmThAreaKeyword" class="tmThInput" type="text" placeholder="例：VIP 1299, VVIP"></div>',
          '<div class="tmThFull"><label class="tmThLabel">排除票區 keyword</label><input id="tmThExcludeKeyword" class="tmThInput" type="text" placeholder="例：Restricted View, Wheelchair"></div>',
          '<div><label class="tmThLabel">Retry min (ms)</label><input id="tmThRetryMin" class="tmThInput" type="number" min="250" step="50"></div>',
          '<div><label class="tmThLabel">Retry max (ms)</label><input id="tmThRetryMax" class="tmThInput" type="number" min="250" step="50"></div>',
        '</div>',
        '<div class="tmThChecks">',
          '<label><input id="tmThDateFallback" type="checkbox"> 日期 fallback</label>',
          '<label><input id="tmThAreaFallback" type="checkbox"> 票區 fallback</label>',
          '<label><input id="tmThAutoRetry" type="checkbox"> 隨機 retry</label>',
        '</div>',
        '<div class="tmThButtons">',
          '<button id="tmThSave" class="tmThBtn" type="button">儲存設定</button>',
          '<button id="tmThToggle" class="tmThBtn" type="button">開始自動流程</button>',
        '</div>',
        '<div id="tmThStatus"><span id="tmThStatusDot"></span><span id="tmThStatusText">已暫停</span></div>',
      '</div>'
    ].join('');

    const mini = document.createElement('button');
    mini.id = 'tmThMini';
    mini.type = 'button';
    mini.textContent = 'Cityline TH';

    document.body.appendChild(panel);
    document.body.appendChild(mini);

    const fields = {
      loginEmail: document.getElementById('tmThLoginEmail'),
      presaleValue: document.getElementById('tmThPresale'),
      claimPassword: document.getElementById('tmThClaim'),
      fullName: document.getElementById('tmThName'),
      phoneNumber: document.getElementById('tmThPhone'),
      dateKeyword: document.getElementById('tmThDateKeyword'),
      areaKeyword: document.getElementById('tmThAreaKeyword'),
      excludeKeyword: document.getElementById('tmThExcludeKeyword'),
      ticketNumber: document.getElementById('tmThTicketNum'),
      retryMinMs: document.getElementById('tmThRetryMin'),
      retryMaxMs: document.getElementById('tmThRetryMax'),
      dateFallback: document.getElementById('tmThDateFallback'),
      areaFallback: document.getElementById('tmThAreaFallback'),
      autoRetry: document.getElementById('tmThAutoRetry')
    };

    fields.loginEmail.value = config.loginEmail;
    fields.presaleValue.value = config.presaleValue;
    fields.claimPassword.value = config.claimPassword;
    fields.fullName.value = config.fullName;
    fields.phoneNumber.value = config.phoneNumber;
    fields.dateKeyword.value = config.dateKeyword;
    fields.areaKeyword.value = config.areaKeyword;
    fields.excludeKeyword.value = config.excludeKeyword;
    fields.ticketNumber.value = config.ticketNumber;
    fields.retryMinMs.value = config.retryMinMs;
    fields.retryMaxMs.value = config.retryMaxMs;
    fields.dateFallback.checked = !!config.dateFallback;
    fields.areaFallback.checked = !!config.areaFallback;
    fields.autoRetry.checked = !!config.autoRetry;

    document.getElementById('tmThSave').addEventListener('click', function () {
      const claimPassword = fields.claimPassword.value.trim();
      const retryMinMs = Math.max(250, Number(fields.retryMinMs.value) || 1000);
      const retryMaxMs = Math.max(250, Number(fields.retryMaxMs.value) || 3000);

      if (claimPassword && !/^\d{6,20}$/.test(claimPassword)) {
        setStatus('設定錯誤：取票密碼要 6-20 位數字', 'error');
        return;
      }

      saveConfig({
        loginEmail: fields.loginEmail.value.trim(),
        presaleValue: fields.presaleValue.value.trim(),
        claimPassword: claimPassword,
        fullName: fields.fullName.value.trim(),
        phoneNumber: fields.phoneNumber.value.trim(),
        dateKeyword: fields.dateKeyword.value.trim(),
        areaKeyword: fields.areaKeyword.value.trim(),
        excludeKeyword: fields.excludeKeyword.value.trim(),
        ticketNumber: Math.max(1, Number(fields.ticketNumber.value) || 1),
        dateFallback: fields.dateFallback.checked,
        areaFallback: fields.areaFallback.checked,
        autoRetry: fields.autoRetry.checked,
        retryMinMs: Math.min(retryMinMs, retryMaxMs),
        retryMaxMs: Math.max(retryMinMs, retryMaxMs)
      });

      fields.retryMinMs.value = config.retryMinMs;
      fields.retryMaxMs.value = config.retryMaxMs;
      setStatus('設定已儲存 24 小時', 'ok');
    });

    const toggle = document.getElementById('tmThToggle');
    toggle.addEventListener('click', function () {
      state.armed = !state.armed;
      state.retryDueAt = 0;

      if (state.armed) {
        resetTransientFlow();
        toggle.textContent = '暫停自動流程';
        toggle.classList.add('active');
        setStatus('自動流程已啟動', 'ok');
      } else {
        toggle.textContent = '開始自動流程';
        toggle.classList.remove('active');
        setStatus('已暫停', 'info');
      }
    });

    const collapse = document.getElementById('tmThCollapse');
    collapse.addEventListener('click', function () {
      panel.style.display = 'none';
      mini.style.display = 'block';
    });

    mini.addEventListener('click', function () {
      mini.style.display = 'none';
      panel.style.display = 'block';
    });

    makeDraggable(panel, document.getElementById('tmThHeader'));
  }

  function makeDraggable(element, handle) {
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    handle.addEventListener('pointerdown', function (event) {
      if (event.target && event.target.tagName === 'BUTTON') return;

      event.preventDefault();
      const rect = element.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;

      element.style.left = rect.left + 'px';
      element.style.top = rect.top + 'px';
      element.style.right = 'auto';

      handle.setPointerCapture(event.pointerId);
    });

    handle.addEventListener('pointermove', function (event) {
      if (!handle.hasPointerCapture(event.pointerId)) return;

      const maxLeft = Math.max(0, window.innerWidth - element.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - Math.min(element.offsetHeight, window.innerHeight));

      const left = Math.min(maxLeft, Math.max(0, startLeft + event.clientX - startX));
      const top = Math.min(maxTop, Math.max(0, startTop + event.clientY - startY));

      element.style.left = left + 'px';
      element.style.top = top + 'px';
    });

    function stop(event) {
      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
    }

    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  }

  createPanel();
  setStatus('已載入；設定不會自動開始，請手動按「開始自動流程」', 'info');
  setInterval(tick, TICK_MS);
})();
