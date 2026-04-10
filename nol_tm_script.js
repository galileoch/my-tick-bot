// ==UserScript==
// @name         NOL Seat Auto Clicker
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Auto click available seats for NOL World
// @author       You
// @match        https://tickets.interpark.com/onestop/*
// @match        https://tickets.interpark.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=interpark.com
// @grant        none
// @run-at       document-end
// @require      https://html2canvas.hertzen.com/dist/html2canvas.min.js
// ==/UserScript==

(function () {
    'use strict';

    console.log('[NOL Bot] Seat Auto Clicker started. Monitoring for available seats...');

    // 請求桌面通知權限，用嚟彈出提醒同埋 Bring to front
    if (window.Notification && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    // 防止重複點擊同一座位
    let isSeatClicked = false;

    // 建立浮動按鈕控制 AutoSelect 狀態
    const resumeBtn = document.createElement('button');
    resumeBtn.style.position = 'fixed';
    resumeBtn.style.top = '20px';
    resumeBtn.style.right = '20px';
    resumeBtn.style.zIndex = '999999';
    resumeBtn.style.padding = '12px 20px';
    resumeBtn.style.fontSize = '16px';
    resumeBtn.style.fontWeight = 'bold';
    resumeBtn.style.color = '#fff';
    resumeBtn.style.border = 'none';
    resumeBtn.style.borderRadius = '8px';
    resumeBtn.style.cursor = 'pointer';
    resumeBtn.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';

    // =========================================
    // 浮動日誌視窗 (Log Dialog) 設定
    // =========================================
    const logContainer = document.createElement('div');
    Object.assign(logContainer.style, {
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        width: '400px',
        height: '300px',
        backgroundColor: 'rgba(20, 20, 20, 0.95)',
        color: '#00ff00',
        fontFamily: 'consolas, monospace',
        fontSize: '12px',
        zIndex: '999998',
        borderRadius: '8px',
        border: '1px solid #555',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        resize: 'both',
        opacity: '0.1',
        transition: 'opacity 0.3s ease',
        boxShadow: '0 4px 6px rgba(0,0,0,0.5)'
    });

    logContainer.addEventListener('mouseenter', () => logContainer.style.opacity = '0.6');
    logContainer.addEventListener('mouseleave', () => logContainer.style.opacity = '0.1');

    const logHeader = document.createElement('div');
    Object.assign(logHeader.style, {
        backgroundColor: '#333',
        color: '#fff',
        padding: '6px 12px',
        cursor: 'move',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        userSelect: 'none',
        fontWeight: 'bold',
        borderBottom: '1px solid #555'
    });
    logHeader.innerText = '📜 NOL 日誌';

    const minBtn = document.createElement('button');
    minBtn.innerText = '−';
    Object.assign(minBtn.style, {
        background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '18px', padding: '0', lineHeight: '1'
    });

    let isMinimized = false;
    let preMinHeight = '300px';
    minBtn.onclick = (e) => {
        e.stopPropagation();
        isMinimized = !isMinimized;
        if (isMinimized) {
            preMinHeight = logContainer.style.height;
            logContainer.style.height = '30px';
            logContainer.style.resize = 'none';
            logContent.style.display = 'none';
        } else {
            logContainer.style.height = preMinHeight;
            logContainer.style.resize = 'both';
            logContent.style.display = 'block';
        }
    };
    logHeader.appendChild(minBtn);
    logContainer.appendChild(logHeader);

    const logContent = document.createElement('div');
    Object.assign(logContent.style, {
        flex: '1',
        overflowY: 'auto',
        padding: '10px',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        lineHeight: '1.4'
    });
    logContainer.appendChild(logContent);

    // 拖曳功能
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialX = 0, initialY = 0;

    logHeader.addEventListener('mousedown', (e) => {
        if (e.target === minBtn) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = logContainer.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        logContainer.style.left = `${initialX + dx}px`;
        logContainer.style.top = `${initialY + dy}px`;
        logContainer.style.bottom = 'auto';
        logContainer.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    // 追加日誌功能
    let logLines = 0;
    const maxLogs = 200;
    let isFollowing = true;

    logContent.addEventListener('scroll', () => {
        const atBottom = logContent.scrollHeight - logContent.scrollTop <= logContent.clientHeight + 10;
        isFollowing = atBottom;
    });

    function addLogToUI(text, type) {
        const line = document.createElement('div');
        line.innerText = text;
        line.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
        line.style.paddingBottom = '3px';
        line.style.marginBottom = '3px';
        if (type === 'warn') {
            line.style.color = '#ffcc00';
        }

        logContent.appendChild(line);
        logLines++;

        while (logLines > maxLogs) {
            if (logContent.firstChild) {
                logContent.removeChild(logContent.firstChild);
                logLines--;
            }
        }

        if (isFollowing) {
            logContent.scrollTop = logContent.scrollHeight;
        }
    }

    const originalLog = console.log;
    const originalWarn = console.warn;

    function formatArgs(args) {
        return args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return arg instanceof Error ? arg.toString() : JSON.stringify(arg);
                } catch (e) {
                    return '[Unserializable Object]';
                }
            }
            return String(arg);
        }).join(' ');
    }

    console.log = function (...args) {
        originalLog.apply(console, args);
        const text = formatArgs(args);
        if (text.includes('[NOL Bot]')) addLogToUI(text, 'log');
    };

    console.warn = function (...args) {
        originalWarn.apply(console, args);
        const text = formatArgs(args);
        if (text.includes('[NOL Bot]')) addLogToUI(text, 'warn');
    };
    // =========================================

    // 自動截圖功能
    function autoCapture() {
        console.log('[NOL Bot] 正在執行自動截圖...');
        if (typeof html2canvas === 'undefined') {
            console.error('[NOL Bot] 找不到 html2canvas Library，截圖失敗。');
            return;
        }

        html2canvas(document.body).then(canvas => {
            const now = new Date();
            const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
            const link = document.createElement('a');
            link.download = `NOL_Success_${timestamp}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            console.log('[NOL Bot] 截圖已儲存並觸發下載。');
        }).catch(err => {
            console.error('[NOL Bot] 截圖出錯:', err);
        });
    }

    // 將按鈕同視窗加入畫面
    const addBtnInterval = setInterval(() => {
        if (document.body) {
            document.body.appendChild(resumeBtn);
            document.body.appendChild(logContainer);
            clearInterval(addBtnInterval);
        }
    }, 100);

    const updateBtnState = () => {
        if (isSeatClicked) {
            resumeBtn.innerText = '▶ 恢復 AutoSelect (已暫停)';
            resumeBtn.style.backgroundColor = '#f44336';
        } else {
            resumeBtn.innerText = '⏸ 暫停 AutoSelect (運行中)';
            resumeBtn.style.backgroundColor = '#4CAF50';
        }
    };

    resumeBtn.onclick = () => {
        isSeatClicked = !isSeatClicked;
        updateBtnState();
        if (!isSeatClicked) {
            console.log('[NOL Bot] 手動重啟 AutoSelect 流程！');
        } else {
            console.log('[NOL Bot] 手動暫停 AutoSelect 流程！');
        }
    };

    // 監聽網頁上的「全部删除」按鈕
    document.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('[class*="InfoSelected_headerRemoveButton"]') ||
            (e.target.closest('button') && e.target.closest('button').innerText.includes('全部删除'));

        if (removeBtn && isSeatClicked) {
            isSeatClicked = false;
            updateBtnState();
            console.log('[NOL Bot] 偵測到「全部删除」被點擊，重啟 AutoSelect 流程！');
        }
    });

    // 初始化按鈕狀態
    updateBtnState();

    // 聲音提示冷卻時間紀錄
    let lastAlertTime = 0;

    // 播放提示音效 (利用 AudioContext 無需載入外部資源)
    function playCharmSound() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            const now = ctx.currentTime;

            const playTone = (freq, time, duration) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0, time);
                gain.gain.linearRampToValueAtTime(0.5, time + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
                osc.start(time);
                osc.stop(time + duration);
            };

            playTone(659.25, now, 0.3); // E5
            playTone(1046.50, now + 0.15, 0.5); // C6
        } catch (e) {
            console.warn("[NOL Bot] 無法播放提示音", e);
        }
    }

    const checkAvailableSeats = setInterval(() => {
        // 檢查是否有按鈕出現，並且確保佢係 parent 嘅唯一 child (only child) 先點擊
        const targetConfirmBtn = document.querySelector('button.ModalConfirm_button__qDjC3:only-child');
        if (targetConfirmBtn) {
            console.log('[NOL Bot] 發現單一 Modal 按鈕，執行點擊！');
            targetConfirmBtn.click();
        }

        if (isSeatClicked) return;

        // 確保名單係空嘅先開始新一輪，避免異步導致新舊位溝埋一齊
        const currentItems = document.querySelectorAll('.InfoSelected_contentItem__ITT5p');
        if (currentItems.length > 0) return;

        // 根據 HTML 結構，不能選擇的座位會有 SeatMap_disabled__AZO_T class
        // 已經選擇的座位會有 SeatMap_selected___WJrH class
        // 因此尋找沒有 disabled 也沒有 selected 的 SVG circle
        const availableSeats = document.querySelectorAll('circle.SeatMap_seatSvg__POQjD:not(.SeatMap_disabled__AZO_T):not(.SeatMap_selected___WJrH)');

        if (availableSeats.length > 0) {
            // 提取 Block 數字嘅 Helper，應對 "Zone:31" 或 "Area31" 等格式
            const getBlockNum = (g) => {
                const matches = g.match(/\d+/g);
                return matches ? parseInt(matches[matches.length - 1], 10) : NaN;
            };

            // 統計每個 gId (區塊) 有幾多個座位
            const groupCounts = {};

            availableSeats.forEach(seat => {
                const parentG = seat.closest('g');
                const gId = parentG ? (parentG.id || '無ID') : '找不到<g>';
                groupCounts[gId] = (groupCounts[gId] || 0) + 1;
            });

            // 將結果分開組合，小於 27 放一堆，大於等於 27 放一堆
            const now = new Date();
            const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

            let warnLog = `[NOL Bot ${timeString}] 三樓以下嘅座位分佈：`;
            let normLog = `[NOL Bot ${timeString}] 三樓嘅座位分佈：`;
            let hasWarn = false;
            let hasNorm = false;

            for (const [gId, count] of Object.entries(groupCounts)) {
                let isLessThan27 = true;
                let blockStr = gId; // 預設用原來的 ID 做備用

                const num = getBlockNum(gId);
                if (!isNaN(num)) {
                    blockStr = String(num); // 有數字就用提取出嚟嘅數字
                    if (num >= 27) {
                        isLessThan27 = false;
                    }
                }

                if (isLessThan27) {
                    warnLog += `\n  - BLOCK ${blockStr}: ${count} 個`;
                    hasWarn = true;
                } else {
                    normLog += `\n  - BLOCK ${blockStr}: ${count} 個`;
                    hasNorm = true;
                }
            }

            // < 27 嘅用 WARN 打印
            if (hasWarn) {
                console.warn(warnLog);
            }

            // >= 27 嘅用 LOG 打印
            if (hasNorm) {
                console.log(normLog);
            }

            // Block 1 或 2 有任何吉位即時提示
            for (const [gId, count] of Object.entries(groupCounts)) {
                const bn = getBlockNum(gId);
                if (bn === 1 || bn === 2) {
                    console.warn(`[NOL Bot] ⚠️ BLOCK ${bn} 發現 ${count} 個吉位！`);
                    playCharmSound();
                    break; // 響一次就夠
                }
            }

            // 定義 Block 優先次序
            const priorityList = [1, 2, 13, 14, 15, 12, 11, 16, 10, 17, 9, 18, 31, 32, 33, 30];

            // 搵出所有大於 1 個吉位嘅 block ID
            let multiSeatGroupIds = Object.keys(groupCounts).filter(gId => groupCounts[gId] > 1);
            let targetGroupId = null;

            if (multiSeatGroupIds.length > 0) {
                // 優先根據 priorityList 尋找
                for (let i = 0; i < priorityList.length; i++) {
                    const priorityBlock = priorityList[i]; // priorityList 係 Number
                    let foundHit = multiSeatGroupIds.find(gId => {
                        return getBlockNum(gId) === priorityBlock;
                    });

                    if (foundHit) {
                        targetGroupId = foundHit;
                        break;
                    }
                }

                // 如果 priorityList 入面冇中，不處理（非優先區一律跳過）
            }

            if (targetGroupId) {
                let blockValue = targetGroupId;
                const num = getBlockNum(targetGroupId);
                if (!isNaN(num)) {
                    blockValue = String(num);
                }

                let targetSeats = [];
                for (let i = 0; i < availableSeats.length; i++) {
                    const seat = availableSeats[i];
                    const parentG = seat.closest('g');
                    const gId = parentG ? (parentG.id || '') : '';
                    if (gId === targetGroupId) {
                        targetSeats.push(seat);
                        if (targetSeats.length === 4) break; // 最多 4 個
                    }
                }

                if (targetSeats.length > 0) {
                    console.log(`[NOL Bot] 準備 Click 區塊 ${blockValue} 嘅 ${targetSeats.length} 個吉位...`);

                    targetSeats.forEach((targetSeat, index) => {
                        setTimeout(() => {
                            console.log(`[NOL Bot] (${index + 1}/${targetSeats.length}) 點擊吉位 (ID: ${targetSeat.id || '無ID'})`);

                            // 使用原生 Pointer/Mouse 事件模擬點擊
                            const rect = targetSeat.getBoundingClientRect();
                            const realX = rect.left + rect.width / 2;
                            const realY = rect.top + rect.height / 2;

                            const eventOptions = {
                                view: window,
                                bubbles: true,
                                cancelable: true,
                                clientX: realX,
                                clientY: realY,
                                screenX: realX,
                                screenY: realY
                            };

                            targetSeat.dispatchEvent(new PointerEvent('pointerdown', eventOptions));
                            targetSeat.dispatchEvent(new MouseEvent('mousedown', eventOptions));
                            targetSeat.dispatchEvent(new PointerEvent('pointerup', eventOptions));
                            targetSeat.dispatchEvent(new MouseEvent('mouseup', eventOptions));
                            targetSeat.dispatchEvent(new MouseEvent('click', eventOptions));
                        }, index * 300); // 每次點擊相隔 300 毫秒
                    });

                    // 觸發冷卻機制，避免不停洗畫面
                    isSeatClicked = true;
                    updateBtnState();

                    console.log('[NOL Bot] AutoSelect 已暫停，等待驗證連位...');

                    // 等待點擊完成並讓 React 渲染後，檢查是否真係連位
                    const waitTime = (targetSeats.length * 300) + 1200;
                    setTimeout(() => {
                        checkSeatAdjacency();
                    }, waitTime);
                }
            }
        }
    }, 100); // 每 100 毫秒檢查一次

    // 檢查已選座位是否為連位
    function checkSeatAdjacency() {
        const itemNodes = document.querySelectorAll('.InfoSelected_contentItem__ITT5p');
        if (itemNodes.length === 0) {
            console.log('[NOL Bot] 找不到已選座位清單，可能被其他人搶先，重啟 AutoSelect...');
            isSeatClicked = false;
            updateBtnState();
            return;
        }

        let seats = [];
        itemNodes.forEach((node) => {
            const nameSpan = node.querySelector('.InfoSelected_contentSeatName__lFWtC');
            if (!nameSpan) return;
            const text = nameSpan.innerText;
            console.log(`[NOL Bot] 讀取到已選座位字串: "${text}"`);

            // 提取區塊資訊 (支援 "31區", "31区", "Block 31" 等)
            const blockMatch = text.match(/([\d]+)(?:區|区|块|塊|Block)/i);
            const rowMatch = text.match(/([\d]+)排/);
            const numMatch = text.match(/([\d]+)号/);

            if (rowMatch && numMatch) {
                seats.push({
                    node: node,
                    text: text,
                    removeBtn: node.querySelector('[class*="InfoSelected_contentRemoveButton"]'),
                    block: blockMatch ? blockMatch[1] : 'unknown',
                    row: parseInt(rowMatch[1], 10),
                    num: parseInt(numMatch[1], 10),
                    keep: false
                });
            }
        });

        if (seats.length <= 1) {
            triggerRemoveAll();
            return;
        }

        // === Row 篩選規則 ===
        const specialBlocks = new Set([1, 2, 11, 12, 13, 14, 15, 16, 31, 32, 30, 33, 9, 10, 17, 18]);
        const blockNum = seats[0].block !== 'unknown' ? parseInt(seats[0].block, 10) : NaN;

        // 非 Special Block → 只接受第 1-3 排
        if (!specialBlocks.has(blockNum)) {
            const allowedRows = new Set([1, 2, 3]);
            const badRows = seats.filter(s => !allowedRows.has(s.row));
            if (badRows.length === seats.length) {
                console.warn(`[NOL Bot] Block ${blockNum} 非特選區且無第 1-3 排座位，全部刪除並重試...`);
                triggerRemoveAll();
                return;
            }
            badRows.forEach(s => {
                console.log(`[NOL Bot] Block ${blockNum} 非特選區，移除非第 1-3 排座位: ${s.text}`);
                if (s.removeBtn) s.removeBtn.click();
            });
            seats = seats.filter(s => allowedRows.has(s.row));
            if (seats.length <= 1) {
                console.warn(`[NOL Bot] Block ${blockNum} 第 1-3 排位不足 2 個，全部刪除並重試...`);
                triggerRemoveAll();
                return;
            }
        }
        // Rule 2: Special Block → 有連位就得，唔洗理排數

        // 判斷連位：必須同一區 + (同排且連號，或同號且連排)
        for (let i = 0; i < seats.length; i++) {
            for (let j = i + 1; j < seats.length; j++) {
                let s1 = seats[i];
                let s2 = seats[j];

                if (s1.block !== s2.block) continue; // 不同區不視為連位

                let isRowConsecutive = s1.num === s2.num && Math.abs(s1.row - s2.row) === 1;

                let numDiff = Math.abs(s1.num - s2.num);
                let isNumConsecutive = s1.row === s2.row && numDiff === 1;

                if (isRowConsecutive || isNumConsecutive) {
                    s1.keep = true;
                    s2.keep = true;
                }
            }
        }

        // 最多只保留 2 個連位
        let keptSeats = seats.filter(s => s.keep);
        if (keptSeats.length > 2) {
            // 將超過 2 個嘅連位標記為移除
            for (let i = 2; i < keptSeats.length; i++) {
                keptSeats[i].keep = false;
            }
        }

        let keptCount = seats.filter(s => s.keep).length;

        if (keptCount <= 1) {
            triggerRemoveAll();
            return;
        }

        // 移除不符合條件的位或多出嘅連位
        seats.forEach(s => {
            if (!s.keep && s.removeBtn) {
                console.log(`[NOL Bot] 移除多出或不符合條件的座位: ${s.text}`);
                s.removeBtn.click();
            }
        });

        console.log(`[NOL Bot] 成功篩選並保留 2 個連位。準備點擊「完成選擇」...`);

        // 稍微延遲等 React 更新畫面，再點擊「完成選擇」
        setTimeout(() => {
            // 在點擊「完成選擇」同播放提示音前，作最後檢查以防座位被系統清空（例如已被人捷足先登）
            const currentItems = document.querySelectorAll('.InfoSelected_contentItem__ITT5p');
            if (currentItems.length < 2) {
                console.warn(`[NOL Bot] 點擊確認前發現系統已清空部分或全部座位！放棄確認並重啟...`);
                triggerRemoveAll();
                return;
            }

            // 優先搵特定 class 嘅按鈕，或者靠文字配對
            let finishBtn = document.querySelector('button[class*="EntButton_primary"], button.entButtonGlobal');
            if (!finishBtn) {
                finishBtn = Array.from(document.querySelectorAll('button')).find(el => el.innerText && (el.innerText.trim() === '完成選擇' || el.innerText.includes('完成選擇')));
            }

            // 檢查按鈕是否被禁用
            if (finishBtn && !finishBtn.disabled && !finishBtn.className.toLowerCase().includes('disabled')) {
                console.log(`[NOL Bot] 搵到「完成選擇」按鈕，執行點擊！`);
                finishBtn.click();

                // 點擊完成選擇後，觸發聲音同桌面通知
                const nowMs = Date.now();
                if (nowMs - lastAlertTime > 3000) {
                    playCharmSound();
                    lastAlertTime = nowMs;
                    console.log(`[NOL Bot] 成功鎖定連位並完成選擇，觸發聲音提示！`);

                    window.focus();

                    if (window.Notification && Notification.permission === 'granted') {
                        const noti = new Notification('🎟️ 成功鎖定連位！', {
                            body: '已經點擊「完成選擇」，請盡快前往結帳！',
                            requireInteraction: true
                        });
                        noti.onclick = () => {
                            window.focus();
                            noti.close();
                        };
                    }

                    // 成功點擊後，延遲 10 秒執行自動截圖 (確保頁面跳轉完成)
                    setTimeout(() => {
                        autoCapture();
                    }, 10000);
                }
            } else {
                console.log(`[NOL Bot] 「完成選擇」按鈕未準備好或已被禁用，請留意畫面狀態。`);
            }
        }, 1000);
    }

    function triggerRemoveAll() {
        const removeAllBtn = document.querySelector('[class*="InfoSelected_headerRemoveButton"]');
        if (removeAllBtn) {
            console.log('[NOL Bot] 只得 1 個位或無連位，全部刪除並重啟...');
            removeAllBtn.click(); // 這會觸發之前加過的全域 click 監聽，令到 isSeatClicked 變 false
        } else {
            console.log('[NOL Bot] 無法找到「全部刪除」按鈕，手動重啟...');
            isSeatClicked = false;
            updateBtnState();
        }
    }
})();
