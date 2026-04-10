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
// ==/UserScript==

(function () {
    'use strict';

    console.log('[NOL Bot] Seat Auto Clicker started. Monitoring for available seats...');

    // 防止重複點擊同一座位
    let isSeatClicked = false;

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

        // 如果已經點擊了，就暫時不動作（若需要選多個座位，可修改此邏輯）
        if (isSeatClicked) return;

        // 根據 HTML 結構，不能選擇的座位會有 SeatMap_disabled__AZO_T class
        // 已經選擇的座位會有 SeatMap_selected___WJrH class
        // 因此尋找沒有 disabled 也沒有 selected 的 SVG circle
        const availableSeats = document.querySelectorAll('circle.SeatMap_seatSvg__POQjD:not(.SeatMap_disabled__AZO_T):not(.SeatMap_selected___WJrH)');

        if (availableSeats.length > 0) {
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

                if (gId.includes(':')) {
                    const num = parseInt(gId.split(':')[1], 10);
                    if (!isNaN(num)) {
                        blockStr = String(num); // 有數字就用提取出嚟嘅數字
                        if (num >= 27) {
                            isLessThan27 = false;
                        }
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

            // 如果有細過 27 嘅吉位，就搵第一個出嚟 click
            if (hasWarn) {
                let targetSeat = null;
                for (let i = 0; i < availableSeats.length; i++) {
                    const seat = availableSeats[i];
                    const parentG = seat.closest('g');
                    const gId = parentG ? (parentG.id || '') : '';
                    let isLessThan27 = true;
                    if (gId.includes(':')) {
                        const num = parseInt(gId.split(':')[1], 10);
                        if (!isNaN(num) && num >= 27) {
                            isLessThan27 = false;
                        }
                    }
                    if (isLessThan27) {
                        targetSeat = seat;
                        break;
                    }
                }

                if (targetSeat) {
                    playCharmSound();
                    console.log(`[NOL Bot] 準備 Click 第一個吉位 (ID: ${targetSeat.id || '無ID'})`);

                    // 方法一：嘗試用 React 內部 onClick 直接觸發 (大部份 Next.js / React 網頁適用)
                    // 呢個方法可以完美跳過 Event Listener 嘅 `isTrusted` (防外掛) 檢查
                    let reactClicked = false;
                    for (let key in targetSeat) {
                        if (key.startsWith('__reactProps$') || key.startsWith('__reactEventHandlers$')) {
                            if (targetSeat[key] && targetSeat[key].onClick) {
                                console.log('[NOL Bot] 成功搵到 React 事件，用隱藏方法直接觸發...');
                                targetSeat[key].onClick({
                                    target: targetSeat,
                                    currentTarget: targetSeat,
                                    preventDefault: () => { },
                                    stopPropagation: () => { },
                                    isTrusted: true // 欺騙 React 呢個係真實點擊
                                });
                                reactClicked = true;
                                break;
                            }
                        }
                    }

                    // 方法二：如果上面個方法唔work，就用真實螢幕座標模擬一整套滑鼠動作
                    if (!reactClicked) {
                        console.log('[NOL Bot] 改用完整 Pointer/Mouse 事件模擬點擊...');

                        // 用 getBoundingClientRect 攞真實螢幕座標，唔用 cx/cy，因為 cx/cy 唔係螢幕真實座標，容易被 detect 到係外掛
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

                        // 模擬由㩒低到放手嘅全過程
                        targetSeat.dispatchEvent(new PointerEvent('pointerdown', eventOptions));
                        targetSeat.dispatchEvent(new MouseEvent('mousedown', eventOptions));
                        targetSeat.dispatchEvent(new PointerEvent('pointerup', eventOptions));
                        targetSeat.dispatchEvent(new MouseEvent('mouseup', eventOptions));
                        targetSeat.dispatchEvent(new MouseEvent('click', eventOptions));
                    }
                }
            }

            // 觸發冷卻機制，避免不停洗畫面
            isSeatClicked = true;

            // 隨意設定一個冷卻時間，避免無窮狂點。如果需要它持續點其他位，可以將定時器清除或調整邏輯。
            setTimeout(() => {
                isSeatClicked = false;
            }, 3000);
        }
    }, 100); // 每 100 毫秒檢查一次
})();
