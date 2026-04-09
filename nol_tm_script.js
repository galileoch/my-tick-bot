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

    const checkAvailableSeats = setInterval(() => {
        // 如果已經點擊了，就暫時不動作（若需要選多個座位，可修改此邏輯）
        if (isSeatClicked) return;

        // 根據 HTML 結構，不能選擇的座位會有 SeatMap_disabled__AZO_T class
        // 已經選擇的座位會有 SeatMap_selected___WJrH class
        // 因此尋找沒有 disabled 也沒有 selected 的 SVG circle
        const availableSeats = document.querySelectorAll('circle.SeatMap_seatSvg__POQjD:not(.SeatMap_disabled__AZO_T):not(.SeatMap_selected___WJrH)');

        if (availableSeats.length > 0) {
            console.log(`[NOL Bot] 發現 ${availableSeats.length} 個可用座位！正嘗試點擊...`);

            const targetSeat = availableSeats[0];

            // SVG 元素有時用原生的 .click() 會無效，因此改用 dispatchEvent 觸發
            const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            });

            targetSeat.dispatchEvent(clickEvent);
            // 如果需要備用的點擊方式，也可以觸發 mousedown/mouseup
            // targetSeat.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            // targetSeat.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

            isSeatClicked = true;
            console.log('[NOL Bot] 座位點擊完成。');

            // 隨意設定一個冷卻時間，避免無窮狂點。如果需要它持續點其他位，可以將定時器清除或調整邏輯。
            setTimeout(() => {
                isSeatClicked = false;
            }, 3000);
        }
    }, 100); // 每 100 毫秒檢查一次
})();
