// ==UserScript==
// @name         v5.5.0 Studio 1826 — Расчёт администраторов и интерфейс
// @namespace    studio1826
// @version      5.5.0
// @description  Расчёт администраторов, копирование оборудования, информация по помещениям, тема и скрытие элементов Bitrix24 (в настройках)
// @updateURL    https://raw.githubusercontent.com/zinovievilia/studio-1826-installer/main/studio1826.meta.js
// @downloadURL  https://raw.githubusercontent.com/zinovievilia/studio-1826-installer/main/studio1826.user.js
// @match        https://1826studio.bitrix24.ru/*
// @match        https://app.bitrix24.ru/app.6805e7948ac458.97401951/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const VERSION = '5.5.0';

    const WIDGET_ID = 'studio1826-widget-v3';
    const STYLE_ID = 'studio1826-style-v3';
    const TOAST_ID = 'studio1826-toast-v3';
    const BOOKING_STYLE_ID = 'studio1826-booking-style-v3';
    const PANEL_ID = 'studio1826-panel-v3';
    const MESSAGE_TYPE = 'STUDIO1826_V3_DATA';
    const REQUEST_TYPE = 'STUDIO1826_V3_REQUEST';
    const DIAG_TYPE = 'STUDIO1826_V3_DIAG';
    const MAX_DIAG_SIZE = 200000;

    /* Журнал последних ошибок JS для отчёта диагностики (без персональных данных). */
    const ERROR_LOG = [];
    let errorTrackingStarted = false;

    function trackErrors() {
        if (errorTrackingStarted) return;

        errorTrackingStarted = true;

        window.addEventListener('error', event => {
            ERROR_LOG.push(String(event.message || 'error').slice(0, 200));
            if (ERROR_LOG.length > 10) ERROR_LOG.shift();
        });
    }

    /* Форма DOM без текста: тег, классы, число детей. Для отладки вёрстки Bitrix. */
    function describeStructure(node, depth = 0, maxDepth = 3) {
        if (!node || depth > maxDepth) return null;

        return {
            tag: node.tagName ? node.tagName.toLowerCase() : '',
            class: String(node.getAttribute ? node.getAttribute('class') || '' : '').slice(0, 160),
            children: node.children ? node.children.length : 0,
            inner: node.children
                ? [...node.children].slice(0, 6).map(child => describeStructure(child, depth + 1, maxDepth))
                : []
        };
    }
    const STORE_KEY = 'studio1826.v3.settings';
    const SETTINGS_ID = 'studio1826-settings-v32';
    const ACTIONS_ID = 'studio1826-actions-v34';
    const DAY_DIALOG_ID = 'studio1826-day-dialog-v34';
    const CHIP_ID = 'studio1826-chip';
    const CHIP_SLOT_ID = 'studio1826-chip-slot';

    /* =========================================================
     * СТИЛИ (Вынесено из функций для чистоты и поддержки)
     * ========================================================= */
    const STYLES = {
        booking: `
            .deal-item-contaner { position: relative !important; }
            .deal-item-contaner[data-s26-frozen]:hover {
                width: var(--s26-w) !important;
                right: var(--s26-r) !important;
                left: var(--s26-l) !important;
                padding-bottom: var(--s26-pb) !important;
                height: var(--s26-h) !important;
                min-height: var(--s26-mh) !important;
                transition: none !important;
            }
            html.s26-compact .deal-item-contaner .reserve-phone-label {
                position: absolute !important;
                width: 1px !important;
                height: 1px !important;
                margin: -1px !important;
                padding: 0 !important;
                overflow: hidden !important;
                clip-path: inset(50%) !important;
                white-space: nowrap !important;
                pointer-events: none !important;
            }
            .deal-item-contaner .s26-badges {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 1px 6px;
                margin-top: 2px;
                font-size: 11px;
                line-height: 1.3;
            }
            .deal-item-contaner .s26-badges:empty { display: none; }
            html.s26-no-copy .deal-item-contaner .booking-copy-button {
                display: none !important;
            }
            .deal-item-contaner .s26-badge-bg,
            .deal-item-contaner .s26-badge-eq {
                padding: 0 4px;
                border-radius: 3px;
                background: rgba(255, 255, 255, .9);
                color: #d00000;
            }
            .deal-item-contaner .s26-badge-bg {
                font-weight: 700 !important;
                font-style: italic !important;
            }
            /* 5.1.0: «Оборудование N» — спокойная метка вместо красной плашки. */
            .deal-item-contaner .s26-badge-eq {
                font-weight: 600;
                background: rgba(255, 255, 255, .6) !important;
                color: #2b2f36 !important;
            }
            .s26-hall-eq {
                display: inline-block;
                margin-left: 4px;
                padding: 0 6px;
                border-radius: 8px;
                background: rgba(0, 0, 0, .07);
                color: #2b2f36;
                font-size: 11px;
                font-weight: 600;
                line-height: 16px;
                vertical-align: middle;
                cursor: help;
                white-space: nowrap;
            }
            .deal-item-contaner .s26-badge-frame {
                font-weight: 800;
                letter-spacing: .04em;
            }
            .deal-item-contaner .reserve-title-label.s26-star {
                font-weight: 700 !important;
                font-style: italic !important;
            }
            .deal-item-contaner .reserve-title-label.s26-strong {
                font-weight: 700 !important;
            }
            .deal-item-contaner .s26-badge-keep {
                flex-basis: 100%;
                max-width: 100%;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                padding: 0 4px;
                border-radius: 3px;
                background: rgba(255, 255, 255, .9);
                color: #d00000;
                font-weight: 700;
            }
            html.s26-hover-focus.s26-hovering .deal-item-contaner:not(.s26-hovered) {
                opacity: .55 !important;
            }
            html.s26-hover-focus .deal-item-contaner.s26-hovered {
                box-shadow: inset 0 0 0 2px rgba(0, 0, 0, .3), 0 8px 22px rgba(0, 0, 0, .3) !important;
            }
            .deal-item-contaner.s26-outlined {
                outline: 1px solid var(--s26-border, #000);
                outline-offset: -1px;
            }
            /* 5.5.0: брони с оборудованием, рамой или фоном видны издалека — цветная рамка и полоса слева. */
            .deal-item-contaner.s26-k-eq,
            .deal-item-contaner.s26-k-frame,
            .deal-item-contaner.s26-k-bg {
                outline: 2px solid var(--s26-k) !important;
                outline-offset: -2px;
                box-shadow: inset 6px 0 0 var(--s26-k) !important;
            }
            .deal-item-contaner.s26-k-eq { --s26-k: #2563eb; }
            .deal-item-contaner.s26-k-frame { --s26-k: #f59e0b; }
            .deal-item-contaner.s26-k-bg { --s26-k: #dc2626; }
            .deal-item-contaner.s26-k-eq .reserve-content-box,
            .deal-item-contaner.s26-k-frame .reserve-content-box,
            .deal-item-contaner.s26-k-bg .reserve-content-box { padding-left: 6px; }
            .deal-item-contaner .s26-handoff {
                position: absolute;
                left: 0;
                right: 0;
                height: 2px;
                background: var(--s26-handoff, #800020);
                pointer-events: none;
                z-index: 40;
            }
            .deal-item-contaner .s26-handoff.top { top: 0; }
            .deal-item-contaner .s26-handoff.bottom { bottom: 0; }
            .deal-item-contaner.s26-last {
                box-shadow: inset 0 0 0 2px var(--s26-last, #2563eb) !important;
            }
            html.s26-hover-focus .deal-item-contaner.s26-last.s26-hovered {
                box-shadow: inset 0 0 0 2px var(--s26-last, #2563eb), 0 8px 22px rgba(0, 0, 0, .3) !important;
            }
            html.s26-stripes .deal-item-contaner[data-s26-stage="done"] {
                background-image: repeating-linear-gradient(
                    45deg,
                    rgba(255, 255, 255, .45) 0,
                    rgba(255, 255, 255, .45) 6px,
                    rgba(255, 255, 255, 0) 6px,
                    rgba(255, 255, 255, 0) 12px
                ) !important;
            }
            .s26-arrows {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                overflow: visible;
                pointer-events: none;
                z-index: 30;
            }
            .s26-arrows .s26-arrow-path {
                fill: none;
                stroke: var(--s26-arrow, #e11d48);
                stroke-width: 1.8;
                stroke-linecap: round;
                opacity: .8;
            }
            .s26-arrows .s26-arrow-path.same { stroke-dasharray: 5 4; }
            .s26-arrows .s26-arrow-head { fill: var(--s26-arrow, #e11d48); opacity: .9; }
            .s26-arrows.s26-has-focus .s26-arrow-path,
            .s26-arrows.s26-has-focus .s26-arrow-head { opacity: .15; }
            .s26-arrows.s26-has-focus .s26-arrow-path.focus { stroke-width: 3; opacity: 1; }
            .s26-arrows.s26-has-focus .s26-arrow-head.focus { opacity: 1; }
            .s26-arrows .s26-arrow-label {
                display: none;
                fill: #111;
                stroke: #fff;
                stroke-width: 3px;
                paint-order: stroke;
                font: 700 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            }
            .s26-arrows .s26-arrow-label.focus { display: block; }
            .s26-moves {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                overflow: visible;
                pointer-events: none;
                z-index: 31;
            }
            .s26-moves .s26-move-path {
                fill: none;
                stroke: var(--s26-moveArrow, #2563eb);
                stroke-width: 2.4;
                stroke-linecap: round;
            }
            .s26-moves .s26-move-head,
            .s26-moves .s26-move-pill { fill: var(--s26-moveArrow, #2563eb); }
            .s26-moves .s26-move-text {
                fill: #fff;
                text-anchor: middle;
                font: 700 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            }
            /* 5.3.0: плашки «ЗАВТРА» в свободном времени зала и стрелки к ним. */
            .s26-tiles {
                position: absolute;
                left: 0;
                top: 0;
                width: 0;
                height: 0;
                overflow: visible;
                pointer-events: none;
                z-index: 32;
            }
            .s26-tile {
                position: absolute;
                box-sizing: border-box;
                pointer-events: auto;
                cursor: default;
                overflow: hidden;
                border: 2px dashed #7c3aed;
                border-radius: 8px;
                background: repeating-linear-gradient(135deg, #f5f0ff 0 8px, #ede4ff 8px 16px);
                box-shadow: 0 4px 14px rgba(124, 58, 237, .25);
                color: #2e1065;
                font: 11px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            }
            .s26-tile-head {
                padding: 3px 6px;
                background: #7c3aed;
                color: #fff;
                font-weight: 800;
                letter-spacing: .04em;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .s26-tile-line { padding: 2px 6px; overflow-wrap: anywhere; }
            .s26-tile-line.later { color: #4c1d95; opacity: .85; }
            .s26-tile-close {
                float: right;
                margin: -1px -2px 0 6px;
                padding: 0 4px;
                border: 0;
                background: none;
                color: #fff;
                font: 800 13px/1 -apple-system, BlinkMacSystemFont, sans-serif;
                cursor: pointer;
                pointer-events: auto;
            }
            .s26-tile-line b { font-weight: 800; }
            .s26-tile-line.missing { color: #b91c1c; font-weight: 700; }
            .s26-moves .s26-tile-path {
                fill: none;
                stroke: #7c3aed;
                stroke-width: 2.6;
                stroke-dasharray: 6 4;
                stroke-linecap: round;
            }
            .s26-moves .s26-tile-arrow { fill: #7c3aed; }
            .s26-moves .s26-tile-path.move { stroke: var(--s26-moveArrow, #2563eb); stroke-dasharray: none; stroke-width: 2.8; }
            .s26-moves .s26-tile-arrow.move { fill: var(--s26-moveArrow, #2563eb); }
            .deal-item-contaner .booking-copy-button {
                position: absolute !important;
                top: 4px !important;
                right: 4px !important;
                z-index: 50 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 20px !important;
                height: 20px !important;
                min-width: 20px !important;
                padding: 0 !important;
                border: 1px solid #d6d6d6 !important;
                border-radius: 5px !important;
                background: #fff !important;
                color: #202020 !important;
                box-shadow: 0 1px 3px rgba(0,0,0,.12) !important;
                cursor: pointer !important;
                opacity: .96 !important;
                transition: background .15s ease, opacity .15s ease !important;
            }
            .deal-item-contaner .booking-copy-button:hover {
                background: #ededed !important;
                color: #111 !important;
                opacity: 1 !important;
            }
            .deal-item-contaner .booking-copy-button svg {
                display: block;
                width: 12px;
                height: 12px;
            }
            .deal-item-contaner .booking-copy-button.copy-success {
                background: #e4f5e9 !important;
                color: #176335 !important;
                border-color: #a8d9b7 !important;
            }
            .deal-item-contaner .booking-copy-button.copy-error {
                background: #fff0f0 !important;
                color: #a32222 !important;
                border-color: #e4aaaa !important;
            }
        `,
        panel: `
            #${PANEL_ID} {
                position: fixed;
                z-index: 999998;
                width: 330px;
                max-width: calc(100vw - 24px);
                max-height: calc(100vh - 24px);
                overflow: auto;
                padding: 13px 14px;
                border: 1px solid #dedede;
                border-radius: 10px;
                background: #fff;
                color: #202020;
                box-shadow: 0 8px 30px rgba(0,0,0,.18);
                font: 12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
                pointer-events: none;
                opacity: 0;
                visibility: hidden;
                transform: translateY(4px);
                transition: opacity .12s ease, transform .12s ease, visibility .12s ease;
            }
            #${PANEL_ID}.visible {
                opacity: 1;
                visibility: visible;
                transform: translateY(0);
            }
            #${PANEL_ID} .p-title {
                margin: 0 0 8px;
                color: #777;
                font-size: 10px;
                font-weight: 750;
                letter-spacing: .08em;
                text-transform: uppercase;
            }
            #${PANEL_ID} .p-hall {
                margin-bottom: 10px;
                padding-bottom: 9px;
                border-bottom: 1px solid #e8e8e8;
                font-size: 15px;
                font-weight: 750;
            }
            #${PANEL_ID} .p-hall .p-time {
                color: #666;
                font-size: 13px;
                font-weight: 600;
                white-space: nowrap;
            }
            html.s26-hover-focus #${PANEL_ID}.visible {
                border-color: #b9b9b9;
                box-shadow: 0 0 0 2px rgba(0, 0, 0, .22), 0 8px 30px rgba(0, 0, 0, .22);
            }
            #${PANEL_ID} .p-section { margin-top: 10px; }
            #${PANEL_ID} .p-section-title {
                margin-bottom: 5px;
                color: #777;
                font-size: 10px;
                font-weight: 750;
                letter-spacing: .06em;
                text-transform: uppercase;
            }
            #${PANEL_ID} .p-item {
                display: block;
                padding: 4px 0;
                border-bottom: 1px solid #f0f0f0;
                overflow-wrap: anywhere;
            }
            #${PANEL_ID} .p-item:last-child { border-bottom: 0; }
            #${PANEL_ID} .p-item.equipment { font-weight: 700; }
            #${PANEL_ID} .p-item .p-qty {
                display: inline-block;
                font-variant-numeric: tabular-nums;
            }
            #${PANEL_ID} .p-item .p-sep { color: #999; font-weight: 400; margin: 0 .35em 0 .1em; }
            #${PANEL_ID} .p-item.frostframe { color: #d32222; }
            #${PANEL_ID} .p-item.comment { white-space: pre-line; font-weight: 400; }
            #${PANEL_ID} .p-item.bg { color: #d00000; font-weight: 700; }
            #${PANEL_ID} .p-item.keep { color: #d00000; font-weight: 700; }
            #${PANEL_ID} .p-empty {
                color: #888;
                font-style: italic;
            }
            @media (prefers-reduced-motion: reduce) {
                #${PANEL_ID} { transition: none; }
            }
        `,
        widget: `
            #${WIDGET_ID} {
                position: fixed;
                z-index: 999999;
                right: 20px;
                top: 50%;
                transform: translateY(-50%);
                width: 320px;
                color: #fff;
                background: #202020;
                border: 1px solid #444;
                border-radius: 10px;
                box-shadow: 0 5px 24px #0004;
                font: 13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
                overflow: visible;
            }
            #${WIDGET_ID} * { box-sizing: border-box; }
            #${WIDGET_ID} .s-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding: 11px 12px;
                background: #303030;
                border-bottom: 1px solid #444;
                border-radius: 9px 9px 0 0;
                font-weight: 700;
                cursor: grab;
                user-select: none;
                touch-action: none;
            }
            #${WIDGET_ID} .s-head:active { cursor: grabbing; }
            #${WIDGET_ID} .s-body { padding: 14px 15px 15px; }
            #${WIDGET_ID} .s-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                margin: 9px 0;
                min-height: 19px;
            }
            #${WIDGET_ID} .s-row span:first-child {
                color: #ddd;
                min-width: 0;
                line-height: 1.45;
            }
            #${WIDGET_ID} .s-row span:last-child {
                white-space: nowrap;
                font-variant-numeric: tabular-nums;
            }
            #${WIDGET_ID} .s-title {
                margin: 16px 0 9px;
                color: #aaa;
                font-size: 10px;
                font-weight: 750;
                letter-spacing: .08em;
                text-transform: uppercase;
                line-height: 1.4;
            }
            #${WIDGET_ID} .s-title:first-child { margin-top: 0; }
            #${WIDGET_ID} .s-input {
                width: 105px;
                min-width: 0;
                padding: 8px 9px;
                border: 1px solid #555;
                border-radius: 6px;
                background: #141414;
                color: #fff;
                text-align: right;
                font: inherit;
                font-variant-numeric: tabular-nums;
            }
            #${WIDGET_ID} .s-check {
                display: flex;
                align-items: center;
                gap: 8px;
                margin: 9px 0;
                color: #ddd;
                line-height: 1.4;
            }
            #${WIDGET_ID} input[type=checkbox],
            #${SETTINGS_ID} input[type=checkbox][data-feature],
            #${SETTINGS_ID} input[type=checkbox][data-theme-hide] {
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                margin: 0;
                opacity: 0;
                cursor: pointer;
            }
            #${WIDGET_ID} .s-check:not(.s-rate-toggle),
            #${SETTINGS_ID} .st-check {
                position: relative;
                display: block;
                padding: 8px 10px;
                border: 1px solid #444;
                border-radius: 7px;
                background: #161616;
                color: #999;
                cursor: pointer;
                user-select: none;
                -webkit-user-select: none;
            }
            #${WIDGET_ID} .s-check:not(.s-rate-toggle):has(input:checked),
            #${SETTINGS_ID} .st-check:has(input:checked) {
                background: #f2f2f2;
                border-color: #f2f2f2;
                color: #171717;
                font-weight: 700;
            }
            #${WIDGET_ID} .s-rate-controls .s-rate-toggle {
                position: relative;
                flex: 0 0 auto;
                width: auto;
                height: 36px;
                padding: 0 12px;
                border: 1px solid #444;
                border-radius: 7px;
                background: #161616;
                color: #999;
                cursor: pointer;
                font-size: 12px;
                user-select: none;
                -webkit-user-select: none;
            }
            #${WIDGET_ID} .s-rate-controls .s-rate-toggle:has(input:checked) {
                background: #f2f2f2;
                border-color: #f2f2f2;
                color: #171717;
                font-weight: 700;
            }
            #${WIDGET_ID} .s-rate-controls {
                display: flex;
                align-items: center;
                gap: 9px;
                margin: 13px 0 3px;
                min-height: 36px;
            }
            #${WIDGET_ID} .s-rate-controls .s-rate-toggle {
                display: flex;
                align-items: center;
                justify-content: center;
                flex: 0 0 auto;
                height: 36px;
                margin: 0;
                white-space: nowrap;
            }
            #${WIDGET_ID} .s-rate-label {
                color: #ddd;
                font-size: 12px;
                white-space: nowrap;
            }
            #${WIDGET_ID} .s-rate-controls .s-input {
                flex: 0 0 105px;
                width: 105px;
                margin-left: auto;
            }
            #${WIDGET_ID} .s-switch {
                display: flex;
                gap: 5px;
                margin: 9px 0 15px;
                padding: 4px;
                border: 1px solid #444;
                border-radius: 7px;
                background: #161616;
            }
            #${WIDGET_ID} button { cursor: pointer; font: inherit; }
            #${WIDGET_ID} .s-switch button {
                flex: 1;
                min-width: 0;
                padding: 8px 4px;
                border: 1px solid transparent;
                border-radius: 5px;
                background: transparent;
                color: #ccc;
                transition: background .15s ease, color .15s ease;
            }
            #${WIDGET_ID} .s-switch button[aria-pressed=true] {
                background: #f2f2f2;
                color: #171717;
                font-weight: 700;
            }
            #${WIDGET_ID} .s-divider {
                height: 1px;
                margin: 16px 0;
                background: #444;
            }
            #${WIDGET_ID} .s-payout {
                font-size: 25px;
                font-weight: 750;
                line-height: 1.3;
                font-variant-numeric: tabular-nums;
                letter-spacing: -.03em;
                margin-top: 3px;
            }
            #${WIDGET_ID} .s-muted {
                margin-top: 5px;
                color: #999;
                font-size: 11px;
                line-height: 1.5;
            }
            #${WIDGET_ID} .s-bottom-controls {
                margin-top: 14px;
                padding-top: 4px;
                border-top: 1px solid #444;
            }
            #${WIDGET_ID} .s-bottom-controls .s-title {
                margin-top: 12px;
                margin-bottom: 9px;
                padding-left: 2px;
            }
            #${WIDGET_ID} .s-bottom-controls .s-switch { margin-top: 0; margin-bottom: 14px; }
            #${WIDGET_ID} .s-footer {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 11px;
                border-top: 1px solid #444;
                background: #292929;
                border-radius: 0 0 9px 9px;
            }
            #${WIDGET_ID} .s-version {
                flex: 1;
                color: #888;
                font-size: 9px;
                line-height: 1.45;
            }
            #${WIDGET_ID} .s-credit {
                display: inline;
                color: #888;
                font-size: 9px;
                font-weight: 400;
                letter-spacing: normal;
                line-height: 1.45;
            }
            #${WIDGET_ID} button.s-copy-button,
            #${WIDGET_ID} button.s-copy-button:focus,
            #${WIDGET_ID} button.s-copy-button:active {
                padding: 8px 12px !important;
                border: 1px solid #fff !important;
                border-radius: 6px !important;
                background: #fff !important;
                color: #171717 !important;
                box-shadow: none !important;
                text-shadow: none !important;
                font-weight: 700 !important;
                white-space: nowrap;
                opacity: 1 !important;
            }
            #${WIDGET_ID} button.s-copy-button:hover {
                background: #eaeaea !important;
                color: #171717 !important;
            }
            #${WIDGET_ID} .s-icon {
                padding: 5px 8px;
                border: 1px solid #555;
                border-radius: 5px;
                background: #202020;
                color: #fff;
            }
            /* ===== 4.2.0: единая панель с вкладками вместо калькулятора
             * как корня навигации — Обзор / Выплаты / Настройки. ===== */
            #${WIDGET_ID} .s-tabs {
                display: flex;
                gap: 5px;
                margin: 0 0 14px;
                padding: 4px;
                border: 1px solid #444;
                border-radius: 7px;
                background: #161616;
            }
            #${WIDGET_ID} .s-tabs button {
                flex: 1;
                min-width: 0;
                padding: 8px 4px;
                border: 1px solid transparent;
                border-radius: 5px;
                background: transparent;
                color: #ccc;
                font: inherit;
                font-size: 12px;
                font-weight: 650;
                cursor: pointer;
                transition: background .15s ease, color .15s ease;
            }
            #${WIDGET_ID} .s-tabs button[aria-selected="true"] {
                background: #f2f2f2;
                color: #171717;
                font-weight: 700;
            }
            #${WIDGET_ID} .s-panel[hidden] { display: none !important; }
            #${WIDGET_ID} .s-debug { display: flex; align-items: center; gap: 8px; margin-top: 14px; font-size: 11px; }
            #${WIDGET_ID} .s-debug-button {
                padding: 4px 9px;
                border: 1px solid #555;
                border-radius: 5px;
                background: transparent;
                color: #aaa;
                font-size: 11px;
            }
            #${WIDGET_ID} .s-debug-button:hover { color: #fff; border-color: #888; }
            #${WIDGET_ID} .s-debug-button:disabled { opacity: .5; cursor: default; }
            #${WIDGET_ID} .s-head-copy { display: none; }
            #${WIDGET_ID}.collapsed .s-head-copy { display: inline-block; }
            #${WIDGET_ID} .s-overview-warn { margin-top: 6px; color: #ffb4b4; font-weight: 650; }
            #${WIDGET_ID} button:focus-visible,
            #${WIDGET_ID} input:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
            @media (prefers-reduced-motion: reduce) {
                #${WIDGET_ID} * { transition: none !important; }
            }
            #${WIDGET_ID} .s-panel { max-height: calc(100vh - 260px); overflow-y: auto; }
            #${WIDGET_ID} .s-overview-status {
                margin-bottom: 14px;
                padding: 10px 12px;
                border: 1px solid #444;
                border-radius: 7px;
                background: #161616;
                color: #ddd;
                font-size: 12px;
                line-height: 1.55;
            }
            #${WIDGET_ID} .s-overview-status strong { color: #fff; }
            #${WIDGET_ID} .s-overview-actions {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            #${WIDGET_ID} .da-btn {
                padding: 11px 13px;
                border: 1px solid #444;
                border-radius: 7px;
                background: #161616;
                color: #fff;
                font: inherit;
                font-size: 13px;
                font-weight: 650;
                text-align: left;
                cursor: pointer;
                transition: background .15s ease;
            }
            #${WIDGET_ID} .da-btn:hover { background: #232323; }
            #${WIDGET_ID} .s-summary {
                display: flex;
                align-items: flex-end;
                justify-content: space-between;
                gap: 10px;
                margin-top: 16px;
                padding-top: 14px;
                border-top: 1px solid #444;
            }
            #${WIDGET_ID} .s-summary-main { min-width: 0; }
            #${WIDGET_ID}.collapsed {
                width: auto;
                transform: none;
                left: 20px;
                right: auto;
                top: auto;
                bottom: 20px;
            }
            #${WIDGET_ID}.collapsed .s-body,
            #${WIDGET_ID}.collapsed .s-footer { display: none; }
            #${WIDGET_ID}.collapsed .s-head {
                border: 0;
                border-radius: 9px;
            }
            #${WIDGET_ID} .s-head-buttons { display: flex; gap: 6px; }
            #${WIDGET_ID} .s-icon {
                width: 32px;
                height: 30px;
                padding: 0;
                line-height: 1;
                text-align: center;
            }
            /* 5.0.0: вкладка «Оборудование» и ссылка в Обзоре. */
            #${WIDGET_ID} .eq-status { margin: 10px 0 8px; }
            #${WIDGET_ID} .eq-status.eq-warn { color: #f0b429; }
            #${WIDGET_ID} .eq-hall {
                margin: 14px 0 5px;
                color: #aaa;
                font-size: 10px;
                font-weight: 750;
                letter-spacing: .06em;
                text-transform: uppercase;
            }
            #${WIDGET_ID} .eq-item {
                margin: 5px 0;
                border: 1px solid #3a3a3a;
                border-radius: 7px;
                background: #161616;
            }
            #${WIDGET_ID} .eq-item > summary,
            #${WIDGET_ID} .eq-total {
                display: flex;
                justify-content: space-between;
                gap: 10px;
                padding: 8px 10px;
                color: #ddd;
                list-style: none;
                cursor: pointer;
            }
            #${WIDGET_ID} .eq-total { cursor: default; padding: 5px 2px; border-bottom: 1px solid #333; }
            #${WIDGET_ID} .eq-item > summary::-webkit-details-marker { display: none; }
            #${WIDGET_ID} .eq-item > summary > span:first-child { min-width: 0; overflow-wrap: anywhere; }
            #${WIDGET_ID} .eq-qty { flex: none; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
            #${WIDGET_ID} .eq-src { padding: 0 10px 8px; color: #999; font-size: 11px; }
            #${WIDGET_ID} .eq-src a { color: inherit; text-decoration: underline; }
            #${WIDGET_ID} .eq-note { margin-top: 10px; }
            #${WIDGET_ID} .eq-actions { display: flex; gap: 8px; margin-top: 12px; }
            #${WIDGET_ID} .eq-actions .da-btn { flex: 1; text-align: center; }
            #${WIDGET_ID} .eq-actions .da-btn:disabled { opacity: .5; cursor: default; }
            #${WIDGET_ID} .s-link {
                display: block;
                width: 100%;
                margin: 0;
                padding: 0;
                border: 0;
                background: none;
                color: inherit;
                font: inherit;
                text-align: left;
                text-decoration: underline;
                text-decoration-color: #8888;
                text-underline-offset: 2px;
                cursor: pointer;
            }
            #${WIDGET_ID} .s-tabs button { flex: 1 1 auto; padding: 8px 6px; font-size: 11.5px; white-space: nowrap; }
            #${WIDGET_ID}:not(.collapsed):not([data-mode="header"]) { width: 340px; }
            #${DAY_DIALOG_ID} .dd-source { margin: 6px 0 0; font-size: 11px; color: #999; }
            /* 4.6.0: на низком окне шапка (перетаскивание и «свернуть») уезжала за экран,
             * и панель нельзя было ни свернуть, ни сдвинуть. Теперь высота ограничена окном,
             * шапка и подвал остаются на месте, прокручивается только тело. */
            #${WIDGET_ID}:not(.collapsed) {
                display: flex;
                flex-direction: column;
                max-height: calc(100vh - 24px);
            }
            #${WIDGET_ID} .s-head,
            #${WIDGET_ID} .s-footer { flex: none; }
            #${WIDGET_ID} .s-body {
                flex: 1 1 auto;
                min-height: 0;
                overflow-y: auto;
                overscroll-behavior: contain;
            }
            #${WIDGET_ID} .s-panel { max-height: none; overflow-y: visible; }
        `,
        settings: `
            /* 4.2.0: настройки больше не отдельное плавающее окно (было
             * position:fixed со своим z-index), а содержимое вкладки
             * «Настройки» внутри ${WIDGET_ID} — позиционирование и фон
             * наследуются от .s-panel/.s-body. */
            #${SETTINGS_ID} * { box-sizing: border-box; }
            #${SETTINGS_ID} .st-title {
                margin: 14px 0 8px;
                color: #aaa;
                font-size: 10px;
                font-weight: 750;
                letter-spacing: .08em;
                text-transform: uppercase;
            }
            /* Сворачиваемые группы настроек (4.2.0): уменьшают высоту
             * панели при первом открытии и группируют функции по смыслу
             * вместо одного плоского списка из 20+ контролов подряд. */
            #${SETTINGS_ID} .st-group {
                margin: 10px 0;
                border: 1px solid #3a3a3a;
                border-radius: 8px;
                overflow: hidden;
            }
            #${SETTINGS_ID} .st-group:first-of-type { margin-top: 4px; }
            #${SETTINGS_ID} .st-group > summary {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 9px 10px;
                color: #ccc;
                font-size: 10px;
                font-weight: 750;
                letter-spacing: .06em;
                text-transform: uppercase;
                cursor: pointer;
                list-style: none;
                user-select: none;
            }
            #${SETTINGS_ID} .st-group > summary::-webkit-details-marker { display: none; }
            #${SETTINGS_ID} .st-group > summary::before {
                content: '▸';
                display: inline-block;
                color: #888;
                font-size: 9px;
                transition: transform .12s ease;
            }
            #${SETTINGS_ID} .st-group[open] > summary::before { transform: rotate(90deg); }
            #${SETTINGS_ID} .st-group > summary .st-group-count {
                margin-left: auto;
                color: #777;
                font-weight: 600;
                letter-spacing: 0;
                text-transform: none;
            }
            #${SETTINGS_ID} .st-group-body { padding: 2px 10px 10px; }
            #${SETTINGS_ID} .st-group .st-check,
            #${SETTINGS_ID} .st-group .st-color { margin: 8px 0; }
            #${SETTINGS_ID} .st-check {
                display: flex;
                align-items: flex-start;
                gap: 8px;
                margin: 9px 0;
                color: #ddd;
                line-height: 1.4;
            }
            #${SETTINGS_ID} .st-color {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                margin: 8px 0;
                color: #ddd;
            }
            #${SETTINGS_ID} .st-color input[type=color] {
                width: 48px;
                height: 28px;
                padding: 0;
                border: 1px solid #555;
                border-radius: 5px;
                background: #141414;
                cursor: pointer;
            }
            #${SETTINGS_ID} .st-hex-row { display: flex; gap: 8px; margin: 8px 0; }
            #${SETTINGS_ID} .st-hex {
                flex: 1;
                min-width: 0;
                padding: 7px 9px;
                border: 1px solid #555;
                border-radius: 6px;
                background: #141414;
                color: #fff;
                font: inherit;
                text-transform: uppercase;
            }
            #${SETTINGS_ID} .st-theme-reset {
                padding: 7px 12px;
                border: 1px solid #666;
                border-radius: 6px;
                background: transparent;
                color: #fff;
                font: inherit;
                cursor: pointer;
            }
            #${SETTINGS_ID} .st-actions { display: flex; gap: 8px; margin-top: 12px; }
            #${SETTINGS_ID} .st-actions button {
                flex: 1;
                padding: 8px 10px;
                border: 1px solid #fff;
                border-radius: 6px;
                background: #fff;
                color: #171717;
                font: inherit;
                font-weight: 700;
                cursor: pointer;
            }
            #${SETTINGS_ID} .st-actions .st-reset {
                background: transparent;
                color: #fff;
                border-color: #666;
                font-weight: 400;
            }
            #${SETTINGS_ID} .st-import {
                width: 100%;
                min-height: 60px;
                margin-top: 8px;
                padding: 8px;
                border: 1px solid #555;
                border-radius: 6px;
                background: #161616;
                color: #fff;
                font: 12px/1.4 ui-monospace, Menlo, monospace;
                resize: vertical;
            }
            #${SETTINGS_ID} .st-note {
                margin-top: 10px;
                color: #999;
                font-size: 11px;
                line-height: 1.5;
            }
        `,
        actions: `
            /* 4.2.0: отдельная плавающая панель действий дня (ACTIONS_ID)
             * и кнопки-дублёры переключателей «Стрелки»/«Синие стрелки»
             * упразднены — те же действия доступны во вкладке «Обзор»
             * (кнопки) и вкладке «Настройки» → «Перенос оборудования»
             * (единственное место переключения, без дублирования). */
            html.s26-overlay-open #${WIDGET_ID},
            html.s26-overlay-open #${DAY_DIALOG_ID},
            html.s26-overlay-open #${TOAST_ID} {
                display: none !important;
            }
        `,
        dayDialog: `
            #${DAY_DIALOG_ID} {
                position: fixed;
                z-index: 1000001;
                width: min(700px, calc(100vw - 16px));
                max-height: calc(100vh - 16px);
                overflow: auto;
                padding: 14px 15px 15px;
                color: #fff;
                background: #202020;
                border: 1px solid #444;
                border-radius: 10px;
                box-shadow: 0 5px 24px #0006;
                font: 13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
            }
            #${DAY_DIALOG_ID}[hidden] { display: none !important; }
            #${DAY_DIALOG_ID} * { box-sizing: border-box; }
            #${DAY_DIALOG_ID} .dd-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 10px;
                font-weight: 700;
                cursor: grab;
                user-select: none;
                touch-action: none;
            }
            #${DAY_DIALOG_ID} .dd-head:active { cursor: grabbing; }
            #${DAY_DIALOG_ID} .dd-close {
                width: 28px;
                height: 28px;
                padding: 0;
                border: 1px solid #555;
                border-radius: 5px;
                background: #202020;
                color: #fff;
                cursor: pointer;
            }
            #${DAY_DIALOG_ID} .dd-cols { display: flex; gap: 14px; align-items: stretch; }
            #${DAY_DIALOG_ID} .dd-col { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; }
            #${DAY_DIALOG_ID} .dd-col-in { flex: 0 0 250px; }
            #${DAY_DIALOG_ID} .dd-label-row {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 8px;
                margin-bottom: 6px;
            }
            #${DAY_DIALOG_ID} .dd-label-row .dd-label { margin: 0; padding-top: 5px; }
            #${DAY_DIALOG_ID} .dd-copy {
                flex: none;
                padding: 4px 10px;
                border: 1px solid #fff;
                border-radius: 6px;
                background: #fff;
                color: #171717;
                font: inherit;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
            }
            #${DAY_DIALOG_ID} .dd-copy:disabled {
                background: transparent;
                color: #777;
                border-color: #444;
                cursor: default;
            }
            #${DAY_DIALOG_ID} .dd-label {
                margin-bottom: 6px;
                color: #aaa;
                font-size: 10px;
                font-weight: 750;
                letter-spacing: .06em;
                text-transform: uppercase;
                line-height: 1.4;
            }
            #${DAY_DIALOG_ID} .dd-input {
                flex: 1;
                min-height: 240px;
                width: 100%;
                padding: 9px 10px;
                border: 1px solid #555;
                border-radius: 6px;
                background: #141414;
                color: #fff;
                font: 12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;
                resize: vertical;
            }
            #${DAY_DIALOG_ID} .dd-actions { display: flex; gap: 8px; margin-top: 10px; }
            #${DAY_DIALOG_ID} .dd-actions button {
                flex: 1;
                padding: 8px 10px;
                border: 1px solid #fff;
                border-radius: 6px;
                background: #fff;
                color: #171717;
                font: inherit;
                font-weight: 700;
                cursor: pointer;
            }
            #${DAY_DIALOG_ID} .dd-actions .dd-clear {
                background: transparent;
                color: #fff;
                border-color: #666;
                font-weight: 400;
            }
            #${DAY_DIALOG_ID} .dd-result {
                flex: 1;
                min-height: 240px;
                padding: 9px 10px;
                border: 1px solid #444;
                border-radius: 6px;
                background: #181818;
                column-count: 1;
                column-gap: 14px;
                column-fill: balance;
            }
            #${DAY_DIALOG_ID} .dd-empty,
            #${DAY_DIALOG_ID} .dd-warn { color: #999; font-size: 12px; column-span: all; }
            #${DAY_DIALOG_ID} .dd-warn { color: #f0b429; margin-top: 8px; }
            #${DAY_DIALOG_ID} .dd-section { margin-bottom: 12px; }
            #${DAY_DIALOG_ID} .dd-section-title {
                break-after: avoid;
                margin-bottom: 4px;
                font-size: 10px;
                font-weight: 750;
                letter-spacing: .06em;
                text-transform: uppercase;
            }
            #${DAY_DIALOG_ID} .dd-section.keep .dd-section-title { color: #7ee2a0; }
            #${DAY_DIALOG_ID} .dd-section.move .dd-section-title { color: #7fb4ff; }
            #${DAY_DIALOG_ID} .dd-section.missing .dd-section-title { color: #ff8a8a; }
            #${DAY_DIALOG_ID} .dd-line {
                padding: 3px 0;
                border-bottom: 1px solid #2c2c2c;
                overflow-wrap: anywhere;
            }
            #${DAY_DIALOG_ID} .dd-line:last-child { border-bottom: 0; }
            #${DAY_DIALOG_ID} .dd-group {
                margin: 0 0 8px;
                padding: 6px 9px 4px;
                background: #262626;
                border-radius: 7px;
            }
            #${DAY_DIALOG_ID} .dd-group {
                break-inside: avoid;
                border-left: 3px solid #555;
            }
            #${DAY_DIALOG_ID} .dd-section.keep .dd-group { border-left-color: #7ee2a0; }
            #${DAY_DIALOG_ID} .dd-section.move .dd-group { border-left-color: #7fb4ff; }
            #${DAY_DIALOG_ID} .dd-section.missing .dd-group { border-left-color: #ff8a8a; }
            #${DAY_DIALOG_ID} .dd-group-head {
                font-weight: 700;
                color: #fff;
            }
            #${DAY_DIALOG_ID} .dd-group-sub {
                margin-bottom: 2px;
                font-size: 11px;
                color: #999;
            }
            #${DAY_DIALOG_ID} .dd-group .dd-line { display: flex; gap: 10px; justify-content: space-between; }
            #${DAY_DIALOG_ID} .dd-group .dd-qty { flex: none; color: #bbb; white-space: nowrap; }
            #${DAY_DIALOG_ID} .dd-section.plan .dd-section-title { color: #c4b5fd; }
            #${DAY_DIALOG_ID} .dd-section.plan .dd-group { border-left-color: #7c3aed; }
            #${DAY_DIALOG_ID} .dd-line.keep { color: #7ee2a0; }
            #${DAY_DIALOG_ID} .dd-line.move { color: #7fb4ff; }
            #${DAY_DIALOG_ID} .dd-line.missing { color: #ff8a8a; font-weight: 700; }
        `,
        /* 4.6.0: светлое оформление в стиле Bitrix24 (белая карточка, акцент #2067b0).
         * Только перекраска: включается атрибутом data-skin="light" на корне панели,
         * без него действуют прежние тёмные стили. Диалог «Не разбирать на завтра»
         * и всплывающие подсказки остаются тёмными. */
        skin: `
            #${WIDGET_ID}[data-skin="light"] {
                /* Акцент и шрифт берём у самого Bitrix24 (ваша тема), запасные значения — если токенов нет. */
                --s-accent: var(--ui-color-primary, #2067b0);
                font-family: var(--ui-font-family-primary, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
                background: #fff;
                color: #333;
                border-color: #dfe3e8;
                box-shadow: 0 6px 24px #1f2d3d26;
            }
            #${WIDGET_ID}[data-skin="light"] .s-head { background: #f5f7f8; border-bottom-color: #e6e9ed; color: #333; }
            #${WIDGET_ID}[data-skin="light"].collapsed .s-head { border-radius: 9px; }
            #${WIDGET_ID}[data-skin="light"] .s-row span:first-child,
            #${WIDGET_ID}[data-skin="light"] .s-check,
            #${WIDGET_ID}[data-skin="light"] .s-rate-label,
            #${WIDGET_ID}[data-skin="light"] .st-check,
            #${WIDGET_ID}[data-skin="light"] .st-color { color: #4b5560; }
            #${WIDGET_ID}[data-skin="light"] .s-title,
            #${WIDGET_ID}[data-skin="light"] .st-title { color: #828b95; }
            #${WIDGET_ID}[data-skin="light"] .s-muted,
            #${WIDGET_ID}[data-skin="light"] .st-note,
            #${WIDGET_ID}[data-skin="light"] .s-version,
            #${WIDGET_ID}[data-skin="light"] .s-credit { color: #828b95; }
            #${WIDGET_ID}[data-skin="light"] .s-input,
            #${WIDGET_ID}[data-skin="light"] .st-hex,
            #${WIDGET_ID}[data-skin="light"] .st-import,
            #${WIDGET_ID}[data-skin="light"] .st-color input[type=color] {
                background: #f4f6f8;
                border-color: #d5dae0;
                color: #333;
            }
            #${WIDGET_ID}[data-skin="light"] .s-check:not(.s-rate-toggle),
            #${WIDGET_ID}[data-skin="light"] .s-rate-controls .s-rate-toggle,
            #${WIDGET_ID}[data-skin="light"] .st-check,
            #${WIDGET_ID}[data-skin="light"] .s-switch,
            #${WIDGET_ID}[data-skin="light"] .s-tabs,
            #${WIDGET_ID}[data-skin="light"] .s-overview-status,
            #${WIDGET_ID}[data-skin="light"] .da-btn {
                background: #f4f6f8;
                border-color: #e0e4e9;
                color: #4b5560;
            }
            /* Включённые переключатели списка — мягкая заливка, чтобы 10+ штук подряд не давили на глаз. */
            #${WIDGET_ID}[data-skin="light"] .s-check:not(.s-rate-toggle):has(input:checked),
            #${WIDGET_ID}[data-skin="light"] .s-rate-controls .s-rate-toggle:has(input:checked),
            #${WIDGET_ID}[data-skin="light"] .st-check:has(input:checked) {
                background: color-mix(in srgb, var(--s-accent) 10%, #fff);
                border-color: var(--s-accent);
                color: color-mix(in srgb, var(--s-accent) 72%, #000);
                font-weight: 700;
            }
            #${WIDGET_ID}[data-skin="light"] .s-switch button[aria-pressed=true],
            #${WIDGET_ID}[data-skin="light"] .s-tabs button[aria-selected="true"] {
                background: var(--s-accent);
                border-color: var(--s-accent);
                color: #fff;
                font-weight: 700;
            }
            #${WIDGET_ID}[data-skin="light"] .s-switch button,
            #${WIDGET_ID}[data-skin="light"] .s-tabs button { color: #4b5560; }
            #${WIDGET_ID}[data-skin="light"] .s-switch button[aria-pressed=true],
            #${WIDGET_ID}[data-skin="light"] .s-tabs button[aria-selected="true"] { color: #fff; }
            #${WIDGET_ID}[data-skin="light"] .s-divider,
            #${WIDGET_ID}[data-skin="light"] .s-summary,
            #${WIDGET_ID}[data-skin="light"] .s-bottom-controls { border-color: #e6e9ed; background-color: transparent; }
            #${WIDGET_ID}[data-skin="light"] .s-divider { background: #e6e9ed; }
            #${WIDGET_ID}[data-skin="light"] .s-footer { background: #f5f7f8; border-top-color: #e6e9ed; }
            #${WIDGET_ID}[data-skin="light"] .s-overview-status strong,
            #${WIDGET_ID}[data-skin="light"] .s-payout { color: #1f2933; }
            #${WIDGET_ID}[data-skin="light"] .da-btn:hover { background: #e9eef3; }
            #${WIDGET_ID}[data-skin="light"] .s-overview-warn { color: #c0392b; }
            #${WIDGET_ID}[data-skin="light"] .s-icon {
                background: #fff;
                border-color: #d5dae0;
                color: #4b5560;
            }
            #${WIDGET_ID}[data-skin="light"] .s-debug-button { border-color: #d5dae0; color: #6a737f; }
            #${WIDGET_ID}[data-skin="light"] .s-debug-button:hover { color: #1f2933; border-color: #9aa3ad; }
            #${WIDGET_ID}[data-skin="light"] button.s-copy-button,
            #${WIDGET_ID}[data-skin="light"] button.s-copy-button:focus,
            #${WIDGET_ID}[data-skin="light"] button.s-copy-button:active {
                border: 1px solid var(--s-accent) !important;
                background: var(--s-accent) !important;
                color: #fff !important;
            }
            #${WIDGET_ID}[data-skin="light"] button.s-copy-button:hover {
                background: color-mix(in srgb, var(--s-accent) 85%, #000) !important;
                color: #fff !important;
            }
            #${WIDGET_ID}[data-skin="light"] button:focus-visible,
            #${WIDGET_ID}[data-skin="light"] input:focus-visible { outline-color: var(--s-accent); }
            #${WIDGET_ID}[data-skin="light"] .st-group { border-color: #e0e4e9; }
            #${WIDGET_ID}[data-skin="light"] .st-group > summary { color: #4b5560; }
            #${WIDGET_ID}[data-skin="light"] .st-group > summary::before { color: #9aa3ad; }
            #${WIDGET_ID}[data-skin="light"] .st-group > summary .st-group-count { color: #9aa3ad; }
            #${WIDGET_ID}[data-skin="light"] .st-theme-reset,
            #${WIDGET_ID}[data-skin="light"] .st-actions .st-reset {
                background: transparent;
                border-color: #cfd5db;
                color: #4b5560;
            }
            #${WIDGET_ID}[data-skin="light"] .eq-hall { color: #828b95; }
            #${WIDGET_ID}[data-skin="light"] .eq-item { background: #f4f6f8; border-color: #e0e4e9; }
            #${WIDGET_ID}[data-skin="light"] .eq-item > summary,
            #${WIDGET_ID}[data-skin="light"] .eq-total { color: #4b5560; }
            #${WIDGET_ID}[data-skin="light"] .eq-total { border-bottom-color: #e6e9ed; }
            #${WIDGET_ID}[data-skin="light"] .eq-src { color: #6a737f; }
            #${WIDGET_ID}[data-skin="light"] .eq-status.eq-warn { color: #b5651d; }
            #${WIDGET_ID}[data-skin="light"] .st-actions button:not(.st-reset) {
                background: var(--s-accent);
                border-color: var(--s-accent);
                color: #fff;
            }
        `,
        /* 4.7.0: «встроено в шапку Bitrix24». Кнопка с суммой — в шапке, панель — всплывающее окно под ней.
         * Без шапки (или если кнопка не помещается) режим data-mode="float" — прежняя плавающая плашка. */
        native: `
            /* Внешний вид кнопки — штатные классы Bitrix (air-header__button / air-header-button),
             * как у «Пригласить» и «Мой тариф»; здесь только позиция в свободном месте шапки. */
            #${CHIP_SLOT_ID} {
                position: absolute;
                left: 0;
                top: 50%;
                transform: translateY(-50%);
                z-index: 3;
            }
            #${CHIP_SLOT_ID}[hidden] { display: none; }
            #${CHIP_SLOT_ID} { display: flex; align-items: center; gap: 6px; }
            .s26-off-toggle {
                position: relative;
                flex: none;
                width: 30px;
                height: 18px;
                margin: 0;
                padding: 0;
                border: 0;
                border-radius: 9px;
                background: #9aa3ad;
                cursor: pointer;
                transition: background .15s;
            }
            .s26-off-toggle[aria-pressed="true"] { background: var(--ui-color-primary, #2067b0); }
            .s26-off-toggle .s26-knob {
                position: absolute;
                top: 2px;
                left: 2px;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: #fff;
                transition: left .15s;
            }
            .s26-off-toggle[aria-pressed="true"] .s26-knob { left: 14px; }
            #${WIDGET_ID}[data-mode="header"] .s-head-toggle { display: none; }
            #${CHIP_ID} .s-chip-sum { font-weight: 700; font-variant-numeric: tabular-nums; }
            html.s26-overlay-open #${CHIP_SLOT_ID} { display: none; }
            #${WIDGET_ID}[data-mode="header"] {
                position: fixed;
                left: auto;
                bottom: auto;
                z-index: 1000;
                width: 380px;
                max-width: calc(100vw - 24px);
                transform: none;
                border-radius: 12px;
                box-shadow: 0 8px 28px #1f2d3d38, 0 0 0 1px #0000000a;
            }
            #${WIDGET_ID}[data-mode="header"].collapsed { display: none; }
            #${WIDGET_ID}[data-mode="header"] .s-head { cursor: default; border-radius: 11px 11px 0 0; }
            #${WIDGET_ID}[data-mode="header"] .s-footer { border-radius: 0 0 11px 11px; }
            #${WIDGET_ID}[data-mode="header"] .s-head-copy { display: none; }
        `,
        /* 5.1.0: новый вид окна — одна страница, без рамок вокруг каждой строки; настройки в две колонки. */
        v5: `
            #${WIDGET_ID} .s-view[hidden] { display: none !important; }
            #${WIDGET_ID} .s-body { padding: 14px 16px 12px; }
            #${WIDGET_ID} .s-view-home > * + * { margin-top: 14px; }
            #${WIDGET_ID} .s-summary { margin: 0; padding: 0; border: 0; align-items: center; }
            #${WIDGET_ID} .s-payout { font-size: 30px; margin: 2px 0 0; }
            #${WIDGET_ID} .s-fold { margin-top: 8px; }
            #${WIDGET_ID} .s-fold > summary {
                display: inline-block;
                font-size: 12px;
                opacity: .75;
                cursor: pointer;
                list-style: none;
                user-select: none;
            }
            #${WIDGET_ID} .s-fold > summary::-webkit-details-marker { display: none; }
            #${WIDGET_ID} .s-fold > summary::after { content: ' ›'; }
            #${WIDGET_ID} .s-fold[open] > summary::after { content: ' ‹'; }
            #${WIDGET_ID} .s-fold-body { padding: 8px 0 2px; }
            #${WIDGET_ID} .s-overview-status { margin: 0; padding: 0; border: 0; background: none !important; font-size: 12px; }
            #${WIDGET_ID} .s-overview-actions { flex-direction: row; gap: 8px; }
            #${WIDGET_ID} .s-overview-actions .da-btn { flex: 1; padding: 9px 10px; font-size: 12px; text-align: center; }
            #${WIDGET_ID} .s-debug { margin-top: 10px; justify-content: space-between; }
            #${WIDGET_ID} .s-debug-button,
            #${WIDGET_ID} .s-open-settings,
            #${WIDGET_ID} .s-back,
            #${WIDGET_ID} .s-textbtn {
                padding: 0;
                border: 0 !important;
                background: none !important;
                color: inherit;
                font: inherit;
                font-size: 12px;
                opacity: .7;
                cursor: pointer;
            }
            #${WIDGET_ID} .s-debug-button:hover,
            #${WIDGET_ID} .s-open-settings:hover,
            #${WIDGET_ID} .s-back:hover,
            #${WIDGET_ID} .s-textbtn:hover { opacity: 1; }
            #${WIDGET_ID} .s-textbtn:disabled { opacity: .35; cursor: default; }
            #${WIDGET_ID} .s-back { margin-bottom: 10px; }

            #${WIDGET_ID} .eq-section { padding-top: 12px; border-top: 1px solid #ffffff1f; }
            #${WIDGET_ID} .eq-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
            #${WIDGET_ID} .eq-title { font-size: 13px; font-weight: 700; }
            #${WIDGET_ID} .eq-days { display: inline-flex; gap: 2px; padding: 2px; border-radius: 8px; background: #ffffff14; }
            #${WIDGET_ID} .eq-days button {
                padding: 3px 9px;
                border: 0;
                border-radius: 6px;
                background: none;
                color: inherit;
                font: inherit;
                font-size: 12px;
                opacity: .7;
                cursor: pointer;
            }
            #${WIDGET_ID} .eq-days button[aria-pressed="true"] { background: #fff; color: #1f2933; opacity: 1; font-weight: 600; }
            #${WIDGET_ID} .eq-body { margin-top: 8px; }
            #${WIDGET_ID} .eq-group { display: grid; grid-template-columns: 74px 1fr; column-gap: 8px; padding: 6px 0; border-bottom: 1px solid #ffffff14; }
            #${WIDGET_ID} .eq-group:last-of-type { border-bottom: 0; }
            #${WIDGET_ID} .eq-hall {
                grid-row: span 50;
                margin: 0;
                padding-top: 1px;
                font-size: 12px;
                font-weight: 600;
                letter-spacing: 0;
                text-transform: none;
                opacity: .7;
            }
            #${WIDGET_ID} .eq-item { margin: 0; border: 0 !important; background: none !important; border-radius: 0; }
            #${WIDGET_ID} .eq-item > summary { padding: 1px 0; font-size: 12.5px; }
            #${WIDGET_ID} .eq-item > summary:hover { text-decoration: underline; text-decoration-color: #8888; }
            #${WIDGET_ID} .eq-src { padding: 0 0 4px 8px; font-size: 11px; }
            #${WIDGET_ID} .eq-totals { margin-top: 6px; font-size: 12px; }
            #${WIDGET_ID} .eq-totals > summary { cursor: pointer; list-style: none; opacity: .75; }
            #${WIDGET_ID} .eq-totals > summary::-webkit-details-marker { display: none; }
            #${WIDGET_ID} .eq-totals > summary::after { content: ' ›'; }
            #${WIDGET_ID} .eq-total { padding: 2px 0; border: 0 !important; }
            #${WIDGET_ID} .eq-note { margin-top: 6px; font-size: 11px; }
            #${WIDGET_ID} .eq-empty { font-size: 12px; padding: 4px 0; }
            #${WIDGET_ID} .eq-foot { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 12px; margin-top: 8px; }
            #${WIDGET_ID} .eq-actions .s-textbtn { white-space: nowrap; }
            #${WIDGET_ID} .eq-status { margin: 0; font-size: 11px; }
            #${WIDGET_ID} .eq-actions { display: inline-flex; gap: 10px; margin: 0; }

            #${WIDGET_ID}[data-view="settings"]:not(.collapsed) { width: 600px !important; max-width: calc(100vw - 24px); }
            /* Список за день из календаря дублирует раздел «Оборудование» (сегодня/завтра) — на главной не показываем. */
            #${WIDGET_ID} .s-view-home .da-copy { display: none; }
            #${SETTINGS_ID} { display: grid; grid-template-columns: 170px 1fr; gap: 14px; align-items: start; }
            #${SETTINGS_ID} .st-nav { display: flex; flex-direction: column; gap: 2px; }
            #${SETTINGS_ID} .st-nav-item {
                padding: 7px 10px;
                border: 0;
                border-radius: 7px;
                background: none;
                color: inherit;
                font: inherit;
                font-size: 12.5px;
                text-align: left;
                opacity: .8;
                cursor: pointer;
            }
            #${SETTINGS_ID} .st-nav-item:hover { opacity: 1; background: #ffffff10; }
            #${SETTINGS_ID} .st-nav-item[aria-selected="true"] { opacity: 1; font-weight: 700; background: #ffffff1c; }
            #${SETTINGS_ID} .st-content { min-width: 0; }
            #${SETTINGS_ID} .st-content > details.st-group { margin: 0; border: 0; }
            #${SETTINGS_ID} .st-content > details.st-group > summary { display: none; }
            #${SETTINGS_ID} .st-content > details.st-group > .st-group-body { padding: 0; }
            #${SETTINGS_ID} .st-content [hidden] { display: none !important; }

            /* 5.2.0: диалог «Не разбирать на завтра» и подсказки в светлом оформлении. */
            #${DAY_DIALOG_ID}[data-skin="light"] {
                --s-accent: var(--ui-color-primary, #2067b0);
                color: #2b2f36;
                background: #fff;
                border-color: transparent;
                box-shadow: 0 10px 32px #1f2d3d2e, 0 0 0 1px #0000000d;
                font-family: var(--ui-font-family-primary, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
            }
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-close { background: #fff; border-color: #d5dae0; color: #4b5560; }
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-label,
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-group-sub,
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-empty,
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-source { color: #6a737f; }
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-warn { color: #b5651d; }
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-input,
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-result { background: #f7f8fa; border-color: #e0e4e9; color: #2b2f36; }
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-actions button,
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-copy:not(:disabled) { background: var(--s-accent); border-color: var(--s-accent); color: #fff; }
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-actions .dd-clear,
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-actions .dd-load { background: transparent; border-color: #cfd5db; color: #4b5560; }
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-copy:disabled { border-color: #e0e4e9; color: #9aa3ad; }
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-group { background: #fff; box-shadow: 0 0 0 1px #eef1f4 inset; }
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-group-head { color: #1f2933; }
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-line { border-bottom-color: #eef1f4; }
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-group .dd-qty { color: #4b5560; }
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-section.keep .dd-section-title { color: #1e8e4e; }
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-section.move .dd-section-title { color: #2563eb; }
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-section.missing .dd-section-title { color: #c0392b; }
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-section.keep .dd-group { border-left-color: #1e8e4e; }
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-section.move .dd-group { border-left-color: #2563eb; }
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-section.missing .dd-group { border-left-color: #c0392b; }
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-section.plan .dd-section-title { color: #6d28d9; }
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-line.keep { color: #166c3b; }
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-line.move { color: #1d4ed8; }
            #${DAY_DIALOG_ID}[data-skin="light"] .dd-line.missing { color: #b91c1c; }
            #${TOAST_ID}[data-skin="light"] {
                background: #fff;
                color: #2b2f36;
                border-color: transparent;
                box-shadow: 0 10px 32px #1f2d3d2e, 0 0 0 1px #0000000d;
            }

            /* 5.4.0: сворачиваемый раздел и заметный выбор дня. */
            #${WIDGET_ID} .eq-toggle {
                display: flex;
                align-items: baseline;
                gap: 8px;
                min-width: 0;
                padding: 0;
                border: 0;
                background: none;
                color: inherit;
                font: inherit;
                text-align: left;
                cursor: pointer;
            }
            #${WIDGET_ID} .eq-toggle::after { content: '›'; opacity: .6; transition: transform .15s; }
            #${WIDGET_ID} .eq-toggle[aria-expanded="true"]::after { transform: rotate(90deg); }
            #${WIDGET_ID} .eq-count { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 12px; opacity: .7; white-space: nowrap; }
            #${WIDGET_ID} .eq-toggle { flex: 1 1 auto; overflow: hidden; }
            #${WIDGET_ID} .eq-days { flex: none; }
            #${WIDGET_ID} .eq-section[data-open="0"] .eq-body,
            #${WIDGET_ID} .eq-section[data-open="0"] .eq-foot { display: none; }
            #${WIDGET_ID} .eq-body { max-height: 360px; overflow-y: auto; overscroll-behavior: contain; }
            #${WIDGET_ID} .eq-days button[aria-pressed="true"] {
                background: var(--s-accent, #2067b0) !important;
                color: #fff !important;
                font-weight: 700;
                box-shadow: none !important;
            }
            #${WIDGET_ID}:not([data-skin="light"]) .eq-days button[aria-pressed="true"] { background: #7c3aed !important; }

            /* 5.3.0: блок «К утру» в разделе «Оборудование». */
            #${WIDGET_ID} .eq-morning { margin-bottom: 10px; padding: 8px 10px 4px; border-radius: 8px; background: #7c3aed22; border-left: 3px solid #7c3aed; }
            #${WIDGET_ID} .eq-morning-title { font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #a78bfa; }
            #${WIDGET_ID} .eq-all-title { margin: 6px 0 2px; opacity: .7; color: inherit; }
            #${WIDGET_ID} .eq-m { font-size: 12.5px; padding: 1px 0; overflow-wrap: anywhere; }
            #${WIDGET_ID} .eq-m.keep { color: #7ee2a0; }
            #${WIDGET_ID} .eq-m.move { color: #93c5fd; }
            #${WIDGET_ID} .eq-m.missing { color: #ff8a8a; font-weight: 700; }
            #${WIDGET_ID}[data-skin="light"] .eq-morning { background: #f5f0ff; }
            #${WIDGET_ID}[data-skin="light"] .eq-morning-title { color: #6d28d9; }
            #${WIDGET_ID}[data-skin="light"] .eq-all-title { color: #4b5560; }
            #${WIDGET_ID}[data-skin="light"] .eq-m.keep { color: #166c3b; }
            #${WIDGET_ID}[data-skin="light"] .eq-m.move { color: #1d4ed8; }
            #${WIDGET_ID}[data-skin="light"] .eq-m.missing { color: #b91c1c; }
            #${WIDGET_ID} .eq-morning .eq-group { border-bottom-color: #7c3aed26; }

            /* 5.2.0: замечания по данным в разделе «Оборудование». */
            #${WIDGET_ID} .eq-issues { margin-top: 8px; font-size: 12px; }
            #${WIDGET_ID} .eq-issues > summary { cursor: pointer; list-style: none; color: #f0b429; }
            #${WIDGET_ID} .eq-issues > summary::-webkit-details-marker { display: none; }
            #${WIDGET_ID} .eq-issues > summary::after { content: ' ›'; }
            #${WIDGET_ID} .eq-issue { padding: 3px 0 0 8px; font-size: 11.5px; opacity: .85; }
            #${WIDGET_ID} .eq-issue a { color: inherit; text-decoration: underline; }
            #${WIDGET_ID}[data-skin="light"] .eq-issues > summary { color: #b5651d; }
            /* светлое оформление */
            #${WIDGET_ID}[data-skin="light"] .eq-section { border-top-color: #e6e9ed; }
            #${WIDGET_ID}[data-skin="light"] .eq-days { background: #eef1f4; }
            #${WIDGET_ID}[data-skin="light"] .eq-days button[aria-pressed="true"] { background: #fff; box-shadow: 0 1px 2px #0000001f; }
            #${WIDGET_ID}[data-skin="light"] .eq-group { border-bottom-color: #eef1f4; }
            #${WIDGET_ID}[data-skin="light"] .eq-item > summary,
            #${WIDGET_ID}[data-skin="light"] .eq-total { color: #2b2f36; }
            #${WIDGET_ID}[data-skin="light"] .s-overview-actions .da-btn { background: #f4f6f8; }
            #${WIDGET_ID}[data-skin="light"] .st-nav-item:hover { background: #f1f3f6; }
            #${WIDGET_ID}[data-skin="light"] .st-nav-item[aria-selected="true"] {
                background: color-mix(in srgb, var(--s-accent) 10%, #fff);
                color: color-mix(in srgb, var(--s-accent) 72%, #000);
            }
            #${WIDGET_ID}[data-skin="light"] { box-shadow: 0 10px 32px #1f2d3d2e, 0 0 0 1px #0000000d; border-color: transparent; }
            #${WIDGET_ID}[data-skin="light"] .s-head { background: #fff; border-bottom-color: #f0f2f5; }
            #${WIDGET_ID}[data-skin="light"] .s-footer { background: #fff; border-top-color: #f0f2f5; }
        `,
        toast: `
            #${TOAST_ID} {
                position: fixed;
                z-index: 1000000;
                left: 20px;
                bottom: 20px;
                width: min(440px, calc(100vw - 40px));
                max-height: 45vh;
                overflow: auto;
                white-space: pre-wrap;
                overflow-wrap: anywhere;
                padding: 13px 15px;
                border: 1px solid #555;
                border-radius: 9px;
                background: #202020;
                color: #fff;
                box-shadow: 0 5px 24px #0005;
                font: 12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
                opacity: 0;
                transform: translateY(10px);
                transition: opacity .4s ease, transform .4s ease;
                pointer-events: none;
                display: none;
            }
            #${TOAST_ID}.visible { opacity: 1; transform: translateY(0); }
            #${TOAST_ID}.fade-out { opacity: 0; transform: translateY(8px); }
        `
    };

    const el = (tag, props = {}, children = []) => {
        const element = document.createElement(tag);
        Object.entries(props).forEach(([k, v]) => {
            if (k === 'className') element.className = v;
            else if (k === 'dataset') Object.assign(element.dataset, v);
            else element.setAttribute(k, v);
        });
        children.forEach(child => {
            if (typeof child === 'string') element.appendChild(document.createTextNode(child));
            else if (child) element.appendChild(child);
        });
        return element;
    };

    const MAIN_ORIGIN = 'https://1826studio.bitrix24.ru';
    const APP_ORIGIN = 'https://app.bitrix24.ru';
    const APP_PATH = '/app.6805e7948ac458.97401951/';

    const EQUIPMENT_PERCENT = 0.10;
    const COFFEE_PERCENT = 0.30;
    const DEFAULT_RATE = 3000;

    const SERVICES = [
        { name: 'Установка схемы света', price: 1000, short: 'С', light: true },
        { name: 'Использование фона', price: 300, short: 'Ф' },
        { name: 'Уборка', price: 1000, short: 'У' }
    ];

    const HOURS_BONUSES = {
        C: {
            name: 'Бонус часов (С)',
            thresholds: [
                { hours: 54, bonus: 500 },
                { hours: 72, bonus: 1000 },
                { hours: 90, bonus: 1500 }
            ],
            halls: [
                'Зал 140 (С)', 'Зал 115 (С)', 'Зал 110 (С)',
                'Зал 105 (С)', 'Зал 100 (С)', 'Зал 80 (С)',
                'Зал 75 (С)', 'Зал 70 (С)', 'Зал 50 (С)',
                'Зал 150 (С)', 'Зал 120 (С)'
            ]
        },
        P: {
            name: 'Бонус часов (П)',
            thresholds: [
                { hours: 20, bonus: 500 },
                { hours: 25, bonus: 1000 },
                { hours: 30, bonus: 1500 }
            ],
            halls: [
                'Зал 100 (П)', 'Зал 110 (П)', 'Зал 70 (П)',
                'Зал 45 (П)', 'Зал 75 (П)'
            ]
        }
    };

    const EQUIPMENT = [
        ['Aputure 600d Pro',3500],['Aputure 300d II',2000],
        ['Aputure Spotlight 36',1000],['Aputure Light Dome 150',800],
        ['Aputure Light Dome 90',600],['Aputure Lantern 90',600],
        ['Aputure F10 Fresnel',500],['18 Iris Leaf',200],
        ['Aputure 1200d',5000],['Aputure Lantern 65',400],
        ['Aputure 600c Pro II',4500],
        ['Шторки Aputure Barndoors F10 для 600d',300],
        ['Шторки Aputure Barndoors для 300d',200],
        ['Aputure 1200x',6000],['Aputure Light Dome Mini 60',400],
        ['Amaran 300c',1500],['Aputure 400x',2500],
        ['Smallrig octabox 120',700],['Aputure X2 Fresnel',300],
        ['Aputure CF7 Fresnel & Barn Doors (400x)',700],
        ['Smallrig softbox 60x90',400],
        ['Smallrig stripbox 30x120',400],['Aputure 700x',4000],
        ['Aputure 10 Gobo Kit',0],['Aputure CF10 Fresnel & Barn Doors',800],
        ['Aputure CF12 Fresnel & Barn Doors',2600],
        ['ARRI 2000w',1000],['Profoto D1 500 Air',1500],
        ['Profoto D2 500 Air TTL',1500],['Profoto D1 1000 Air',1500],
        ['Profoto Air remote',400],['Profoto Air sync',200],
        ['ARRI Junior 1000 PLUS',500],['ARRI 650 plus',400],
        ['ACE 2000w',1000],['ACE Junior 1000',500],['KinoFlo 4x4Ft',1200],
        ['Зонт - Umbrella 135см Deep silver',400],
        ['Зонт - Umbrella 135см Deep white',400],
        ['Зонт - Umbrella 165см Deep white',400],
        ['Зонт - Umbrella 165см Deep silver',400],
        ['Зонт - Umbrella 185см Deep silver',400],
        ['Зонт - Umbrella 185см Просветный',400],
        ['Profoto Narrowbeam',0],['Profoto Zoom 1',0],['Profoto Zoom 2',0],
        ['Стрипбокс 30х120см - Profoto 1x4ft RF',0],
        ['Стрипбокс 30х90см - Profoto 1x3ft RF',0],
        ['Софтбокс 30х40см - Profoto 1x1,3ft RF',0],
        ['Октобокс 120см - Profoto 4ft Octa',0],
        ['Октобокс 90см - Profoto 3ft Octa',0],
        ['Текстиль SDL Grid 1/2 122x122',200],
        ['Текстиль SD15 Grid 1/4 122x122',200],
        ['Текстиль Silk 122x122',200],
        ['Флаг пенка silver & white 40x40 (100x100cm)',0],
        ['Текстиль Grid Full (SD) 12x12',1000],
        ['Текстиль Silk 12x12',1000],['Текстиль MBU 12x12',1000],
        ['Текстиль MBU 8x8',700],['Текстиль Grid 1/2 (SDL) 8x8',700],
        ['Frost-frame 6x6',1500],['T-frame set',500],
        ['Frost-frame 122 set',600],['Cutter set',600],
        ['Frost-frame 12x12',3000],['Текстиль Grid 1/2 6х6',500],
        ['Текстиль Grid Full (SD) 8x8',700],['Текстиль Silk 8x8',700],
        ['Текстиль Grid 1/2 (SDL) 12х12',1000],
        ['Текстиль Grid 1/4 (SD14) 8x8',700],
        ['Текстиль Silk 1/4 8x8',700],['Текстиль SD Full Grid 122x122',200],
        ['Флаг тканевый Cutter 24x36 (60x90cm)',200],
        ['Флаг тканевый Cutter 18x24 (45x60cm)',200],
        ['Флаг тканевый Cutter 40x40 (100x100cm)',200],
        ['Флаг тканевый Floppy 24x72 (60x180cm)',300],
        ['Флаг тканевый Floppy 40x40 (100x100cm)',300],
        ['Long Double Pin 5/8',50],['Baby Pin с резьбой 3/8 (12мм)',50],
        ['Baby Pin с резьбой 1/4 (12мм)',50],
        ['Baby Pin с резьбой 1/4 (7мм)',50],
        ['Baby Pin с адаптером 1/4',50],['Адаптер 3/8 - 1/4',50],
        ['Адаптер 5/8 - Винт 3/8',50],
        ['Адаптер резьбовой 1/4 - 3/8',50],
        ['Адаптер 1/4 - М10 - 3/8',50],
        ['Kupo Runway Base Stand - Лягушка',200],['Avenger D600',400],
        ['Avenger A5043',500],['Avenger D400 Jumbo Grip Head',200],
        ['Avenger D420 Grip Head',200],['Frost-frame 8x8',2000],
        ['Avenger C-Stand A2033L',300],['Avenger grip set',200],
        ['Журавль',1000],['Фон холщовый длинный Красный',1700],
        ['Фон холщовый длинный Зелёный',1700],
        ['Фон холщовый короткий Тёмный',1200],
        ['Фон холщовый короткий Бежевый',1200],
        ['Фон холщовый короткий Желто-коричневый - Песочный',1200],
        ['Фон холщовый короткий Темно-серый - Графитовый',1200],
        ['Фон тканевый Белый - Мраморный',700],
        ['Фон тканевый Зеленый - Изумрудный',700],
        ['Фон тканевый Красный - Бархатный',700],
        ['Avenger A5036cs',500],['Отпариватель',300],
        ['Avenger Extension Arm',100],['Avenger Junior D650',500],
        ['Manfrotto 272b',300],['Avenger C-Stand A2025L',300],
        ['Manfrotto 1004BAC',200],['Manfrotto 007BU',200],
        ['Штатив Manfrotto 546GB/501HDV',1000],
        ['Штатив Manfrotto 190XPROB/496RC2',500],
        ['Avenger grip head',100],['Manfrotto Super Clamp',100],
        ['Matthellini Clamp',100],['Kupo 330M',500],['Kupo 300M',500],
        ['Baby Drop Down Pin',100],['Kupo Kcp-150 C Clamp',200],
        ['Страховочный трос 75 см',0],['Kupo Swivel Coupler',100],
        ['Монитор Asus Pro Art Display',2500],
        ['Телевизор LG 42" (42LA860V)',3500],['USB-C to USB-C',500]
    ];

    /* =========================================================
     * ОБЩИЕ УТИЛИТЫ
     * ========================================================= */

    /*
     * Нормализация: регистр, ё→е, кириллическая «х» и «×» → латинская «x»
     * (в названиях встречаются обе буквы: «6х6» и «6x6»), лишние пробелы.
     */
    const norm = value => String(value ?? '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[х×]/g, 'x')
        .replace(/\s+/g, ' ')
        .trim();

    function parseNumber(value) {
        if (typeof value === 'number') {
            return Number.isFinite(value) ? value : 0;
        }

        const n = Number.parseFloat(
            String(value ?? '').replace(/[\s\u00A0₽]/g, '').replace(',', '.')
        );

        return Number.isFinite(n) ? n : 0;
    }

    const moneyFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
    const plainFormatter = new Intl.NumberFormat('ru-RU', {
        maximumFractionDigits: 2,
        useGrouping: false
    });

    const money = value =>
        moneyFormatter.format(Number.isFinite(value) ? value : 0) + ' ₽';

    const formatAmount = value =>
        plainFormatter.format(Math.round((value + Number.EPSILON) * 100) / 100);

    const formatQuantity = value => String(value).replace('.', ',');

    const isWordChar = ch => /[a-zа-яе0-9]/i.test(ch || '');

    /* Поиск целого вхождения: перебираем все вхождения, а не только первое. */
    function containsKey(text, key) {
        if (!key) return false;

        let index = text.indexOf(key);

        while (index >= 0) {
            const before = text[index - 1];
            const after = text[index + key.length];

            if (!isWordChar(before) && !isWordChar(after)) return true;

            index = text.indexOf(key, index + 1);
        }

        return false;
    }

    /* Предвычисленные индексы: самые длинные названия проверяются первыми. */
    const EQUIPMENT_INDEX = EQUIPMENT
        .map(([name, price]) => ({ name, price, key: norm(name) }))
        .sort((a, b) => b.key.length - a.key.length);

    const SERVICE_INDEX = SERVICES.map(service => ({
        ...service,
        key: norm(service.name)
    }));

    const HALL_INDEX = {
        C: HOURS_BONUSES.C.halls.map(name => ({ name, key: norm(name) })),
        P: HOURS_BONUSES.P.halls.map(name => ({ name, key: norm(name) }))
    };

    const ALL_HALLS = [...HALL_INDEX.C, ...HALL_INDEX.P];
    const COFFEE_KEY = norm('Кофейня');

    /*
     * Единый расчёт выплат — чистая функция без обращения к DOM/localStorage,
     * вынесена из startMainUI()/compute() для переиспользования и
     * модульного тестирования (node:test, см. tests/).
     *
     * records: [{ items: string[] }]
     * options: { category: 'C'|'P', admins: 1|2|3, rateEnabled, rateValue,
     *            coffeeEnabled, lightSetupEnabled }
     */
    function computePayout(records, options = {}) {
        const category = options.category === 'P' ? 'P' : 'C';
        const admins = [1, 2, 3].includes(options.admins) ? options.admins : 1;
        const rateEnabled = !!options.rateEnabled;
        const rateValue = Number.isFinite(options.rateValue) ? options.rateValue : 0;
        const coffeeEnabled = options.coffeeEnabled !== false;
        const lightSetupEnabled = options.lightSetupEnabled !== false;

        const items = (records || []).flatMap(record => record.items || []);
        const n = Math.max(1, admins);
        const config = HOURS_BONUSES[category];
        const hallKeys = HALL_INDEX[category];

        let eq = 0;
        let coffee = 0;
        let rawHours = 0;

        const counts = {};
        SERVICES.forEach(service => { counts[service.name] = 0; });

        items.forEach(item => {
            const qty = quantity(item);
            const text = norm(item);

            const equipment = findEquipment(item);
            if (equipment) eq += equipment.price * qty;

            const service = SERVICE_INDEX.find(s => containsKey(text, s.key));
            if (service) counts[service.name] += qty;

            if (containsKey(text, COFFEE_KEY)) {
                coffee += quantity(item);
            }

            if (hallKeys.some(hall => containsKey(text, hall.key))) rawHours += qty;
        });

        const hours = Math.ceil(rawHours);
        let hoursBonus = 0;

        config.thresholds.forEach(threshold => {
            if (hours >= threshold.hours) hoursBonus = threshold.bonus;
        });

        const servicesPer = SERVICES.map(service => {
            const excluded = service.light && !lightSetupEnabled;
            const count = counts[service.name] || 0;

            return {
                ...service,
                count,
                excluded,
                perAdmin: excluded ? 0 : count * service.price / n
            };
        });

        const eqPercent = eq * EQUIPMENT_PERCENT;
        const coffeePercent = category === 'P' && coffeeEnabled
            ? coffee * COFFEE_PERCENT
            : 0;

        const rate = rateEnabled ? Math.max(0, rateValue) : 0;
        const servicesTotalPer = servicesPer.reduce((sum, s) => sum + s.perAdmin, 0);
        const equipmentPer = eqPercent / n;
        const coffeePer = coffeePercent / n;

        /* Бонус за часы и ставка не делятся между администраторами. */
        const payout = servicesTotalPer + hoursBonus + equipmentPer + coffeePer + rate;

        return {
            items,
            eq,
            coffee,
            hours,
            hoursBonus,
            servicesPer,
            eqPercent,
            coffeePercent,
            equipmentPer,
            coffeePer,
            rate,
            payout
        };
    }

    /*
     * Р-9: валидация сообщения от iframe-коллектора перед использованием.
     * Чистая функция (без window/DOM) — вынесена для модульного
     * тестирования структурной защиты postMessage-приёмника.
     *
     * Возвращает null, если сообщение не от нашего коллектора (другой
     * type/source — её нужно молча игнорировать, это НЕ наш протокол).
     * Возвращает { versionMismatch: true, version } при несовместимой
     * версии (решение, что делать дальше — у вызывающего кода).
     * Иначе — { records: [...] } с уже отфильтрованными/нормализованными
     * записями (защита от повреждённых/чужих данных в payload).
     */
    /* Лимиты на входные данные postMessage: защита от раздутых/повреждённых payload. */
    const MAX_RECORDS = 300;
    const MAX_ITEMS = 200;
    const MAX_TEXT = 500;

    function validateCollectorPayload(data, currentVersion, messageType = MESSAGE_TYPE) {
        if (!data || data.type !== messageType || data.source !== 'studio1826-collector') {
            return null;
        }

        if (data.version && data.version !== currentVersion) {
            return { versionMismatch: true, version: data.version };
        }

        if (!Array.isArray(data.records)) return null;

        const records = data.records
            .slice(0, MAX_RECORDS)
            .filter(record =>
                record &&
                (record.hall === null || (typeof record.hall === 'string' && record.hall.length <= MAX_TEXT)) &&
                Array.isArray(record.items)
            )
            .map(record => ({
                hall: record.hall,
                items: record.items
                    .slice(0, MAX_ITEMS)
                    .filter(item => typeof item === 'string' && item.length <= MAX_TEXT),
                start: Number.isFinite(record.start) ? record.start : null,
                end: Number.isFinite(record.end) ? record.end : null
            }));

        return { records };
    }

    /*
     * Запросы main → iframe передаются JSON-строкой, а не объектом: в iframe
     * приложения работает BX24 (api.bitrix24.com/api/v1), его обработчик
     * `message` принимает сообщения с того же origin и вызывает `e.data.split(':')`.
     * На объекте это давало «Uncaught TypeError: s.split is not a function»
     * при каждом опросе (раз в 3 с). Строка вида '{"type":...' BX24 молча
     * игнорирует (нет такой команды).
     */
    const MAX_REQUEST_SIZE = 512 * 1024;

    function encodeRequest(message) {
        return JSON.stringify(message);
    }

    /* Объект запроса или null, если это не наш протокол. Объект тоже принимается —
     * совместимость с main предыдущей версии, пока вкладка не перезагружена. */
    function decodeRequest(data, requestType = REQUEST_TYPE) {
        let value = data;

        if (typeof value === 'string') {
            if (value.length > MAX_REQUEST_SIZE || value.charAt(0) !== '{') return null;

            try {
                value = JSON.parse(value);
            } catch (_) {
                return null;
            }
        }

        return value && typeof value === 'object' && value.type === requestType ? value : null;
    }

    /* =========================================================
     * НАСТРОЙКИ ФУНКЦИЙ И ЦВЕТА СТАДИЙ (общие для обоих окон)
     * ========================================================= */
    const FEATURES_KEY = 'studio1826.v32.features';
    const STAGE_STYLE_ID = 'studio1826-stage-style-v32';
    const FEATURE_KEYS = [
        'compactCards', 'reuse', 'fonHighlight', 'copyButton',
        'hoverFocus', 'borders', 'handoff', 'aliases', 'arrows', 'moveArrows', 'stripes'
    ];

    /* Цвета стадий по умолчанию (как в Bitrix). */
    const STAGES = [
        { id: 'multi', name: 'Несколько броней', color: '#fff893' },
        { id: 'done', name: 'Аренда завершена', color: '#7bd500' },
        { id: 'prepaid', name: 'Предоплачено', color: '#47d1e2' },
        { id: 'checked', name: 'Проверено', color: '#a3d49b' }
    ];

    /* Цвета меток: обводка, «Пересменки», последние брони дня. */
    const MARK_COLORS = [
        { id: 'border', name: 'Обводка (фон, оборудование)', color: '#000000' },
        { id: 'handoff', name: 'Пересменки', color: '#800020' },
        { id: 'last', name: 'Последние брони дня', color: '#2563eb' },
        { id: 'arrow', name: 'Стрелки переноса оборудования', color: '#e11d48' },
        { id: 'moveArrow', name: 'Синие стрелки «не разбирать на завтра»', color: '#2563eb' }
    ];

    const COLOR_ITEMS = [...STAGES, ...MARK_COLORS];

    const hexToRgbKey = hex => [1, 3, 5]
        .map(i => parseInt(hex.slice(i, i + 2), 16))
        .join(',');

    const STAGE_BY_RGB = new Map(STAGES.map(stage => [hexToRgbKey(stage.color), stage.id]));

    function sanitizeFeatures(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const result = {};

        FEATURE_KEYS.forEach(key => {
            result[key] = typeof source[key] === 'boolean' ? source[key] : true;
        });

        result.colors = {};

        COLOR_ITEMS.forEach(stage => {
            const value = source.colors && source.colors[stage.id];

            result.colors[stage.id] = /^#[0-9a-f]{6}$/i.test(value || '')
                ? value.toLowerCase()
                : stage.color;
        });

        return result;
    }

    /* Резервная копия настроек: JSON с номером схемы (для будущих миграций). */
    const SETTINGS_SCHEMA = 1;

    function exportSettings(features) {
        return JSON.stringify({ app: 'studio1826', schema: SETTINGS_SCHEMA, features: sanitizeFeatures(features) }, null, 2);
    }

    /* Возвращает очищенные настройки или null, если текст не похож на нашу копию. */
    function parseSettingsImport(text) {
        if (typeof text !== 'string' || text.length > 20000) return null;

        try {
            const data = JSON.parse(text);

            if (!data || data.app !== 'studio1826' || !data.features || typeof data.features !== 'object') return null;
            if (typeof data.schema === 'number' && data.schema > SETTINGS_SCHEMA) return null;

            return sanitizeFeatures(data.features);
        } catch (_) {
            return null;
        }
    }

    function loadFeatures() {
        try {
            return sanitizeFeatures(JSON.parse(localStorage.getItem(FEATURES_KEY) || '{}'));
        } catch (_) {
            return sanitizeFeatures({});
        }
    }

    function saveFeatures(features) {
        try {
            localStorage.setItem(FEATURES_KEY, JSON.stringify(features));
        } catch (_) {}
    }

    /* Стадия карточки по её исходному inline-цвету фона. */
    function stageOfCard(card) {
        const match = (card.style.backgroundColor || '')
            .match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);

        return match
            ? STAGE_BY_RGB.get(`${match[1]},${match[2]},${match[3]}`) || null
            : null;
    }

    const equipmentCache = new Map();

    function findEquipment(item) {
        if (equipmentCache.has(item)) return equipmentCache.get(item);

        const text = norm(item);
        const found = EQUIPMENT_INDEX.find(entry => containsKey(text, entry.key)) || null;

        if (equipmentCache.size > 3000) equipmentCache.clear();
        equipmentCache.set(item, found);

        return found;
    }

    const isEquipmentItem = item => findEquipment(item) !== null;

    function quantity(item) {
        const text = String(item);

        const match =
            text.match(/[-–—]\s*(\d+(?:[.,]\d+)?)\s*шт\.?\s*$/i) ||
            text.match(/[-–—]\s*(\d+(?:[.,]\d+)?)\s*шт\.?/i);

        return match ? parseNumber(match[1]) : 1;
    }

    const qtyText = qty => `${formatQuantity(qty)} шт.`;
    const equipmentLine = (name, qty) => `${name} — ${qtyText(qty)}`;

    function splitItems(text) {
        return String(text || '')
            .split(/,\s+|\n+/)
            .map(s => s.trim())
            .filter(Boolean);
    }

    function isFrostframeHighlight(item) {
        const value = norm(item).replace(/[\s-]+/g, '');

        return value.includes('frostframe8x8') ||
               value.includes('frostframe12x12');
    }

    /*
     * Маркер комментария «КОМ:».
     * \b в JavaScript не работает с кириллицей, поэтому границы слова
     * задаются через lookbehind/lookahead. Слова вроде «Комплект»
     * больше не принимаются за начало комментария.
     */
    const COMMENT_START = /(?:^|,\s*|\n)\s*КОМ(?![a-zа-яё])\s*:?\s*/i;
    const COMMENT_ITEM = /^\s*КОМ(?![a-zа-яё])\s*:?/i;

    function stripBookingComment(text) {
        const value = String(text || '');
        const match = COMMENT_START.exec(value);

        return match ? value.slice(0, match.index).trim() : value.trim();
    }

    function extractBookingComment(text) {
        const value = String(text || '');
        const match = COMMENT_START.exec(value);

        if (!match) return '';

        return value
            .slice(match.index + match[0].length)
            .replace(/^[\s:;,.\-–—]+/, '')
            .trim();
    }

    function parkingHoursWord(value) {
        const number = Math.abs(Math.trunc(value));
        const lastTwo = number % 100;
        const lastOne = number % 10;

        if (lastTwo >= 11 && lastTwo <= 14) return 'часов';
        if (lastOne === 1) return 'час';
        if (lastOne >= 2 && lastOne <= 4) return 'часа';

        return 'часов';
    }

    function moscowDate(options) {
        return new Intl.DateTimeFormat('ru-RU', {
            timeZone: 'Europe/Moscow',
            ...options
        }).format(new Date());
    }

    const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

    /* Выбранный день в календаре (react-calendar): 'ДД.ММ' или '' если не найден. */
    function readSelectedDate(doc) {
        try {
            const abbr = doc.querySelector('.react-calendar__tile--active abbr[aria-label], .react-calendar__tile--rangeStart abbr[aria-label]');
            const label = abbr ? abbr.getAttribute('aria-label') : '';
            const m = /(\d{1,2})\s+([а-яё]+)/i.exec(label || '');

            if (!m) return '';

            const month = MONTHS_RU.indexOf(m[2].toLowerCase()) + 1;

            if (!month) return '';

            return String(m[1]).padStart(2, '0') + '.' + String(month).padStart(2, '0');
        } catch (_) {
            return '';
        }
    }

    /* Помещение: зал или гримёрное место («Зал 110 (П)», «Гримерное место 1 (П)»). */
    const HALL_SOURCE = 'Зал\\s+\\d+(?:\\s*\\([СП]\\))?';
    const MAKEUP_SOURCE = 'Гример(?:ное|ная)\\s+место\\s+\\d+(?:\\s*\\([СП]\\))?';
    const HALL_RE = new RegExp(HALL_SOURCE, 'i');
    const MAKEUP_RE = new RegExp(MAKEUP_SOURCE, 'i');
    const PLACE_HEADER_RE = new RegExp(`^(?:${HALL_SOURCE}|${MAKEUP_SOURCE})\\s*:?$`, 'i');

    function findHallName(text) {
        const normalized = norm(text);
        const known = ALL_HALLS.find(hall => containsKey(normalized, hall.key));

        if (known) return known.name;

        const value = String(text || '');
        const match = value.match(HALL_RE) || value.match(MAKEUP_RE);

        return match ? match[0] : null;
    }

    const hallLabel = name => name
        ? name.replace(/\s*\([СП]\)\s*$/i, '').trim()
        : null;

    /*
     * Порядок залов по этажам (для выбора, откуда ближе нести оборудование).
     * 3 этаж: 115, 100, 70, 75, 50, 80, 105, 110, 140; 1 этаж: 150, 120.
     */
    const HALL_ORDER = [
        ['115', '100', '70', '75', '50', '80', '105', '110', '140'],
        ['150', '120']
    ];

    function hallPosition(label) {
        const match = /^Зал\s+(\d+)/i.exec(label || '');

        if (!match) return null;

        for (let floor = 0; floor < HALL_ORDER.length; floor++) {
            const index = HALL_ORDER[floor].indexOf(match[1]);

            if (index >= 0) return { floor, index };
        }

        return null;
    }

    /* «Расстояние» между помещениями: 0 — тот же, по этажу — число залов, между этажами — 20. */
    function hallDistance(a, b) {
        if (a && a === b) return 0;

        const first = hallPosition(a);
        const second = hallPosition(b);

        if (!first || !second) return 50;

        return first.floor === second.floor
            ? Math.abs(first.index - second.index)
            : 20 + Math.abs(first.index - second.index);
    }

    function categoryFromHall(hall) {
        if (!hall) return null;
        if (/\(С\)\s*$/i.test(hall)) return 'C';
        if (/\(П\)\s*$/i.test(hall)) return 'P';

        return null;
    }

    /*
     * Определение филиала по переключателю.
     * Сначала дешёвая проверка текста, и только потом геометрия и стили.
     * При неоднозначности возвращает null.
     */
    function getCategoryFromBranch(root = document) {
        if (!root || !root.querySelectorAll) return null;

        const branchNames = {
            'Павелецкая': 'P',
            'Серпуховская': 'C'
        };

        const selectors = [
            '[aria-selected="true"]',
            '[aria-pressed="true"]',
            '[role="combobox"]',
            'button',
            '[role="button"]',
            '[role="option"]',
            '[role="tab"]',
            '[class*="min-w-"]',
            '[class*="rounded-"]',
            '[class*="text-center"]'
        ].join(',');

        const view = root.defaultView;
        const matches = [];

        for (const element of root.querySelectorAll(selectors)) {
            const raw = element.textContent;

            if (!raw || raw.length > 40) continue;

            const text = raw.replace(/\s+/g, ' ').trim();
            const category = branchNames[text];

            if (!category) continue;

            const rect = element.getBoundingClientRect();

            if (rect.width <= 0 || rect.height <= 0) continue;

            const style = view?.getComputedStyle ? view.getComputedStyle(element) : null;

            if (style && (style.display === 'none' || style.visibility === 'hidden')) {
                continue;
            }

            const role = element.getAttribute('role') || '';
            const tag = element.tagName.toLowerCase();

            let score = 0;

            if (element.getAttribute('aria-selected') === 'true') score += 10;
            if (element.getAttribute('aria-pressed') === 'true') score += 10;
            if (role === 'option' || role === 'tab') score += 5;
            if (tag === 'button' || role === 'button') score += 3;
            if (element.closest('[role="listbox"]')) score += 2;

            matches.push({ category, score });
        }

        if (!matches.length) return null;

        const top = Math.max(...matches.map(m => m.score));
        const categories = new Set(
            matches.filter(m => m.score === top).map(m => m.category)
        );

        return categories.size === 1 ? [...categories][0] : null;
    }

    /* ===== DAY-LOGIC-BEGIN ===== */

    /* Подписи оборудования во всплывающем окне. */
    const ALIASES = new Map([
        ['Manfrotto 272b', 'телескопичка'],
        ['Avenger Junior D650', 'бум'],
        ['Avenger D650', 'бум'],
        ['Avenger D600', 'мини-бум'],
        ['Avenger A5042 CS', 'хайроллер'],
        ['Avenger A5042CS', 'хайроллер'],
        ['Avenger A5043', 'обычный роллер'],
        ['Avenger grip set', 'рука+грипхед'],
        ['Штатив Manfrotto 190XPROB/496RC2', 'штатив для камеры'],
        ['Штатив Manfrotto 546GB/501HDV', 'большой видеоштатив'],
        ['Cutter set', 'каттер+грипхед+рука+c-стенд'],
        ['Kupo 300M', 'хайроллер'],
        ['Kupo 330M', 'обычный роллер']
    ].map(([name, alias]) => [norm(name), alias]));

    const aliasOf = name => ALIASES.get(norm(name)) || null;

    function formatClock(minutes) {
        if (!Number.isFinite(minutes)) return '';

        const hours = Math.floor(minutes / 60) % 24;

        return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    }

    const hallNumber = label => {
        const match = /\d+/.exec(label || '');

        if (!match) return 99999;

        /* Гримёрные места идут после залов. */
        return (/^зал/i.test(label) ? 0 : 1000) + Number(match[0]);
    };

    /*
     * Список оборудования за день по залам.
     * Звёздочка у позиции, которая нужна первой брони зала в этот день
     * (утром она уже должна стоять в зале).
     */
    function buildDayList(records) {
        const halls = new Map();

        (records || []).forEach(record => {
            const label = hallLabel(record.hall) || 'Зал не определён';

            if (!halls.has(label)) halls.set(label, []);

            halls.get(label).push(record);
        });

        const blocks = [];
        const unknownHalls = [];
        let starCount = 0;

        [...halls.entries()]
            .sort((a, b) => hallNumber(a[0]) - hallNumber(b[0]) || a[0].localeCompare(b[0], 'ru'))
            .forEach(([label, list]) => {
                const timed = list.filter(record => Number.isFinite(record.start));
                const allTimed = timed.length === list.length;
                /* Р-7: если timed пуст, Math.min() вернул бы Infinity —
                 * ни одна бронь не получила бы звёздочку. */
                const first = (allTimed && timed.length > 0)
                    ? Math.min(...timed.map(record => record.start))
                    : null;

                const ordered = [...list].sort((a, b) =>
                    (Number.isFinite(a.start) ? a.start : 1e9) -
                    (Number.isFinite(b.start) ? b.start : 1e9)
                );

                const known = new Map();

                ordered.forEach(record => {
                    const isFirst = first !== null && record.start === first;

                    /* Количество по каждой позиции внутри одной брони (повторы суммируем). */
                    const perRecord = new Map();

                    (record.items || []).forEach(item => {
                        const match = findEquipment(item);

                        if (!match) return;

                        const current = perRecord.get(match.key);
                        const qty = quantity(item);

                        if (current) current.qty += qty;
                        else perRecord.set(match.key, { name: match.name, qty });
                    });

                    perRecord.forEach((value, key) => {
                        const entry = known.get(key);

                        if (!entry) {
                            known.set(key, {
                                name: value.name,
                                qty: value.qty,
                                star: isFirst,
                                starQty: isFirst ? value.qty : 0
                            });

                            return;
                        }

                        /* Оборудование переезжает между бронями зала — берём максимум, а не сумму. */
                        entry.qty = Math.max(entry.qty, value.qty);

                        if (isFirst) {
                            entry.star = true;
                            entry.starQty = Math.max(entry.starQty, value.qty);
                        }
                    });
                });

                if (!known.size) return;

                if (!allTimed) unknownHalls.push(label);

                const items = [...known.values()];

                starCount += items.filter(item => item.star).length;
                blocks.push({ label, items });
            });

        const dayLine = item => {
            let line = equipmentLine(item.name, item.qty);

            /* С утра нужно меньше, чем нужно в течение дня. */
            if (item.star && item.starQty && item.starQty !== item.qty) {
                line += ` (утром ${formatQuantity(item.starQty)})`;
            }

            return item.star ? `${line} *` : line;
        };

        const text = blocks
            .map(block => [
                block.label,
                ...block.items.map(dayLine)
            ].join('\n'))
            .join('\n\n');

        return { text, blocks, unknownHalls, starCount };
    }

    /* Разбор списка, скопированного кнопкой «оборудование за день». */
    function parseDayList(text) {
        const halls = [];
        let current = null;

        String(text || '').split(/\r?\n/).forEach(raw => {
            let line = raw
                .replace(/^[\s•·▪●]+/, '')
                .replace(/^[-–—]\s+/, '')
                .trim();

            if (!line) return;

            if (PLACE_HEADER_RE.test(line)) {
                const label = hallLabel(line.replace(/\s*:$/, '')).replace(/\s+/g, ' ');

                current = { label, items: [] };
                halls.push(current);

                return;
            }

            if (!current) return;

            let star = false;

            line = line
                .replace(/^[*★⭐]+\s*/, () => { star = true; return ''; })
                .replace(/\s*[*★⭐]+$/, () => { star = true; return ''; })
                .trim();

            if (!line) return;

            /* «(утром N)» — сколько нужно к началу дня, если это меньше дневного максимума. */
            let morning = null;

            line = line
                .replace(/\s*\(\s*утром\s+(\d+(?:[.,]\d+)?)\s*\)\s*$/i, (_, value) => {
                    morning = parseNumber(value);
                    return '';
                })
                .trim();

            const qty = quantity(line);
            const match = findEquipment(line);

            current.items.push({
                name: match ? match.name : line.replace(/\s*[-–—]\s*[\d\s\u00A0.,]+\s*шт\.?\s*$/i, '').trim(),
                key: match ? match.key : norm(line),
                star,
                qty,
                needQty: morning !== null ? morning : qty,
                known: !!match
            });
        });

        return halls.filter(hall => hall.items.length);
    }

    /*
     * Сравнение сегодняшних последних броней залов с тем, что нужно
     * завтра с утра (позиции со звёздочкой).
     */
    function analyzeTomorrow(records, tomorrow) {
        const byHall = new Map();
        const incompleteHalls = new Set();

        (records || []).forEach(record => {
            const label = hallLabel(record.hall) || 'Зал не определён';

            if (!Number.isFinite(record.end)) {
                incompleteHalls.add(label);
                return;
            }

            const current = byHall.get(label);

            if (
                !current ||
                record.end > current.end ||
                (record.end === current.end && record.start > current.start)
            ) {
                byHall.set(label, record);
            }
        });

        const lasts = [...byHall.entries()].map(([label, record]) => {
            const equipment = new Map();

            (record.items || []).forEach(item => {
                const match = findEquipment(item);

                if (!match) return;

                const qty = quantity(item);
                const current = equipment.get(match.key);

                if (current) {
                    current.qty += qty;
                    current.left += qty;
                } else {
                    equipment.set(match.key, { name: match.name, qty, left: qty });
                }
            });

            return { label, record, equipment };
        });

        const needs = [];

        (tomorrow || []).forEach(hall => {
            hall.items.filter(item => item.star).forEach(item => {
                needs.push({
                    hall: hall.label,
                    key: item.key,
                    name: item.name,
                    qty: item.needQty || item.qty || 1,
                    left: item.needQty || item.qty || 1
                });
            });
        });

        const keep = [];
        const move = [];
        const missing = [];

        /* Сначала то, что уже стоит в нужном зале. */
        needs.forEach(need => {
            const source = lasts.find(last =>
                last.label === need.hall && last.equipment.has(need.key)
            );

            if (!source) return;

            const stock = source.equipment.get(need.key);
            const take = Math.min(need.left, stock.left);

            if (take <= 0) return;

            stock.left -= take;
            need.left -= take;
            keep.push({ need, from: source, qty: take });
        });

        /* Потом то, что можно перенести из других залов (нехватку добираем из нескольких). */
        needs.forEach(need => {
            if (need.left <= 0) return;

            lasts.forEach(last => {
                if (need.left <= 0) return;

                const stock = last.equipment.get(need.key);

                if (!stock || stock.left <= 0) return;

                const take = Math.min(need.left, stock.left);

                stock.left -= take;
                need.left -= take;
                move.push({ need, from: last, qty: take });
            });

            if (need.left > 0) missing.push({ need, qty: need.left });
        });

        return {
            lasts,
            keep,
            move,
            missing,
            needCount: needs.length,
            incompleteHalls: [...incompleteHalls],
            markKeys: [...new Set(lasts.map(last => `${last.record.hall}|${last.record.start}`))]
        };
    }

    /* ===== DAY-LOGIC-END ===== */

    /* =========================================================
     * ЧАСТЬ 1. КАРТОЧКИ БРОНИРОВАНИЯ (iframe)
     * ========================================================= */
    /*
     * 5.3.0: план «на утро» по залам для показа в календаре. Из результата analyzeTomorrow
     * собирает плашку на каждый зал завтрашнего утра (что оставить, что принести и откуда,
     * что собрать) и связи «последняя бронь сегодня → зал» для стрелок. Время — начало первой
     * завтрашней брони зала.
     */
    function planTomorrowTiles(analysis, tomorrowRecords) {
        const first = new Map();

        (tomorrowRecords || []).forEach(record => {
            const label = hallLabel(record.hall);

            if (!label || !Number.isFinite(record.start)) return;
            if (!first.has(label) || record.start < first.get(label)) first.set(label, record.start);
        });

        const tiles = new Map();
        const links = new Map();

        const add = (hall, name, qty, kind, from, after = null, at = null) => {
            if (!tiles.has(hall)) tiles.set(hall, { hall, start: first.has(hall) ? first.get(hall) : null, items: [] });

            const tile = tiles.get(hall);
            const existing = tile.items.find(item => item.name === name && item.kind === kind && item.from === from);

            if (existing) existing.qty += qty;
            else tile.items.push({ name, qty, kind, from, after, at });
        };

        const link = (from, hall, kind) => {
            const key = `${from.record.hall}|${from.record.start}`;

            links.set(`${key}→${hall}`, { from: key, to: hall, kind });
        };

        ((analysis && analysis.keep) || []).forEach(({ need, from, qty }) => {
            add(need.hall, need.name, qty, 'keep', from.label, from.record.end);
            link(from, need.hall, 'keep');
        });
        ((analysis && analysis.move) || []).forEach(({ need, from, qty }) => {
            add(need.hall, need.name, qty, 'move', from.label, from.record.end);
            link(from, need.hall, 'move');
        });
        ((analysis && analysis.missing) || []).forEach(({ need, qty }) => add(need.hall, need.name, qty, 'missing', ''));

        /*
         * 5.4.2: только то, что нужно к первой брони зала. Оборудование, нужное позже днём, на ночь
         * разбирают — плашки для него нет (правило студии, подтвердил Илья 24.10.2026).
         */

        return {
            tiles: [...tiles.values()].sort((a, b) => hallNumber(a.hall) - hallNumber(b.hall) || a.hall.localeCompare(b.hall, 'ru')),
            links: [...links.values()]
        };
    }

    /* =========================================================
     * ДАННЫЕ ДНЯ ИЗ BITRIX24 (5.0.0)
     * Брони и их товарные строки читаются напрямую из CRM (REST по сессии
     * пользователя, только чтение), без открытия календаря и копирования.
     * Формат записей тот же, что у сборщика календаря: { hall, start, end, items },
     * поэтому buildDayList / analyzeTomorrow / computePayout работают без изменений.
     * ========================================================= */
    const DEAL_PAGE = 50;
    const MAX_DEALS = 500;
    const HALL_ROW_RE = /^(?:Зал|Гримерное место)\s+\d+/i;
    const MOSCOW_TZ = 'Europe/Moscow';

    /* Календарный день по Москве (ГГГГ-ММ-ДД), со сдвигом в днях. Часовой пояс компьютера не используется. */
    function moscowDay(offsetDays = 0, now = new Date()) {
        const text = new Intl.DateTimeFormat('en-CA', {
            timeZone: MOSCOW_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(now);
        const [year, month, day] = text.split('-').map(Number);

        return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
    }

    /* Границы суток по Москве (UTC+3 круглый год) для фильтра CRM: [from, to). */
    function dayBounds(day) {
        const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

        return { from: `${day}T00:00:00+03:00`, to: `${next}T00:00:00+03:00` };
    }

    /* Сдвиг календарной даты ГГГГ-ММ-ДД на n дней. */
    function shiftDay(day, n) {
        return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
    }

    /*
     * 5.5.0: день, открытый в календаре («ДД.ММ» без года) → ГГГГ-ММ-ДД. Год выбирается ближайший
     * к сегодняшнему дню по Москве (декабрь ↔ январь на стыке лет). Пусто или мусор — сегодня.
     */
    function calendarDayIso(ddmm, now = new Date()) {
        const today = moscowDay(0, now);
        const m = /^(\d{2})\.(\d{2})$/.exec(String(ddmm || ''));

        if (!m) return today;

        const year = Number(today.slice(0, 4));
        const base = Date.parse(`${today}T00:00:00Z`);
        let best = today;
        let bestDiff = Infinity;

        [year - 1, year, year + 1].forEach(y => {
            const candidate = `${y}-${m[2]}-${m[1]}`;
            const time = Date.parse(`${candidate}T00:00:00Z`);

            if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== candidate) return;

            const diff = Math.abs(time - base);

            if (diff < bestDiff) {
                best = candidate;
                bestDiff = diff;
            }
        });

        return best;
    }

    /* Дата и минуты от начала суток по Москве из строки CRM; null, если строка не разбирается. */
    function moscowParts(iso) {
        const time = Date.parse(iso);

        if (!Number.isFinite(time)) return null;

        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
            timeZone: MOSCOW_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).formatToParts(new Date(time)).map(part => [part.type, part.value]));

        return {
            day: `${parts.year}-${parts.month}-${parts.day}`,
            minutes: Number(parts.hour) * 60 + Number(parts.minute)
        };
    }

    /*
     * Сделка + её товарные строки → запись брони. Зал берётся из строки «Зал N (С/П)» или
     * «Гримерное место N (С/П)». Нет такой строки — null (такие брони считаются отдельно в «Контроле»).
     * Количество в тексте позиции — как у карточки календаря: «название - N шт.».
     */
    function dealToRecord(deal, rows) {
        const list = Array.isArray(rows) ? rows : [];
        const hallRow = list.find(row => HALL_ROW_RE.test(String(row.PRODUCT_NAME || '')));

        if (!hallRow) return null;

        const start = moscowParts(deal.UF_CRM_DATETIME_START);
        const end = moscowParts(deal.UF_CRM_DATETIME_END);

        return {
            id: String(deal.ID),
            hall: String(hallRow.PRODUCT_NAME).trim(),
            start: start ? start.minutes : null,
            end: end ? end.minutes : null,
            stage: deal.STAGE_ID || '',
            items: list
                .filter(row => row && row.PRODUCT_NAME)
                .map(row => `${String(row.PRODUCT_NAME).trim()} - ${formatQuantity(Number(row.QUANTITY) || 0)} шт.`)
        };
    }

    /* Брони, не относящиеся к филиалу (по суффиксу зала), отбрасываются; category — 'C' или 'P'. */
    function recordsOfCategory(records, category) {
        return (records || []).filter(record => categoryFromHall(record.hall) === category);
    }

    /* Оборудование одной брони: ключ → { name, qty } (повторы внутри брони суммируются). */
    function recordEquipment(record) {
        const map = new Map();

        (record.items || []).forEach(item => {
            const match = findEquipment(item);

            if (!match) return;

            const current = map.get(match.key);
            const qty = quantity(item);

            if (current) current.qty += qty;
            else map.set(match.key, { name: match.name, qty });
        });

        return map;
    }

    /*
     * Сводка оборудования дня: по залам (те же правила, что у buildDayList: внутри зала берётся максимум,
     * звёздочка у позиций первой брони зала) и итог по студии (сумма по залам). У каждой позиции — список
     * броней-источников для ручной проверки.
     */
    function summarizeEquipment(records) {
        const day = buildDayList(records);
        const totals = new Map();
        const halls = day.blocks.map(block => {
            const hallRecords = (records || []).filter(record => (hallLabel(record.hall) || 'Зал не определён') === block.label);
            const items = block.items.map(item => {
                const sources = [];

                hallRecords.forEach(record => {
                    recordEquipment(record).forEach(value => {
                        if (value.name === item.name) {
                            sources.push({ id: record.id || '', start: record.start, end: record.end, qty: value.qty });
                        }
                    });
                });

                sources.sort((a, b) => (a.start ?? 1e9) - (b.start ?? 1e9));

                const total = totals.get(item.name) || { name: item.name, qty: 0, halls: 0 };

                total.qty += item.qty;
                total.halls += 1;
                totals.set(item.name, total);

                return { ...item, sources };
            });

            return { label: block.label, items };
        });

        return {
            halls,
            totals: [...totals.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
            unknownHalls: day.unknownHalls,
            starCount: day.starCount,
            text: day.text
        };
    }

    /*
     * Замечания по данным дня (5.2.0): одинаковые позиции, внесённые в одну бронь несколько раз
     * (часто это двойной ввод). Строка «Доплата за час» не считается — её повторяют намеренно.
     */
    function findDuplicateRows(records) {
        const result = [];

        (records || []).forEach(record => {
            const counts = new Map();

            (record.items || []).forEach(item => {
                const name = String(item).replace(/\s*-\s*[\d.,]+\s*шт\.?\s*$/i, '').trim();

                if (!name || /^доплата за час/i.test(name)) return;

                counts.set(name, (counts.get(name) || 0) + 1);
            });

            const names = [...counts.entries()].filter(([, count]) => count > 1).map(([name, count]) => `${name} ×${count}`);

            if (names.length) result.push({ id: record.id || '', hall: record.hall, start: record.start, names });
        });

        return result;
    }

    /* Вызов REST Bitrix24 через штатный BX.rest (сессия пользователя). */
    function restCall(method, params) {
        return new Promise((resolve, reject) => {
            const bx = typeof window !== 'undefined' ? window.BX : null;

            if (!bx || !bx.rest || typeof bx.rest.callMethod !== 'function') {
                reject(new Error('REST Bitrix24 недоступен на этой странице'));
                return;
            }

            try {
                bx.rest.callMethod(method, params, result => {
                    const error = result && result.error && result.error();

                    if (error) reject(new Error(error.error_description || error.error || 'ошибка REST'));
                    else resolve(result);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    function restBatch(commands) {
        return new Promise((resolve, reject) => {
            const bx = typeof window !== 'undefined' ? window.BX : null;

            if (!bx || !bx.rest || typeof bx.rest.callBatch !== 'function') {
                reject(new Error('REST Bitrix24 недоступен на этой странице'));
                return;
            }

            try {
                bx.rest.callBatch(commands, result => resolve(result));
            } catch (error) {
                reject(error);
            }
        });
    }

    /*
     * Брони дня из CRM. Только чтение: crm.deal.list и crm.deal.productrows.get.
     * Отменённые (семантика стадии F) исключаются и считаются. Любой сбой — исключение
     * (неполные данные не отдаём как полные).
     */
    async function fetchDayRecords(day) {
        const { from, to } = dayBounds(day);
        const filter = { '>=UF_CRM_DATETIME_START': from, '<UF_CRM_DATETIME_START': to };
        const select = ['ID', 'STAGE_ID', 'STAGE_SEMANTIC_ID', 'UF_CRM_DATETIME_START', 'UF_CRM_DATETIME_END'];
        const deals = [];

        for (let start = 0; ; start += DEAL_PAGE) {
            if (start >= MAX_DEALS) throw new Error(`за день больше ${MAX_DEALS} броней`);

            const result = await restCall('crm.deal.list', { order: { ID: 'ASC' }, filter, select, start });
            const page = result.data() || [];

            deals.push(...page);

            if (page.length < DEAL_PAGE) break;
        }

        const active = deals.filter(deal => deal.STAGE_SEMANTIC_ID !== 'F');
        const rowsById = new Map();

        for (let index = 0; index < active.length; index += DEAL_PAGE) {
            const chunk = active.slice(index, index + DEAL_PAGE);
            const commands = {};

            chunk.forEach(deal => { commands[`d${deal.ID}`] = ['crm.deal.productrows.get', { id: deal.ID }]; });

            const answers = await restBatch(commands);

            chunk.forEach(deal => {
                const answer = answers && answers[`d${deal.ID}`];

                if (!answer || (answer.error && answer.error())) throw new Error(`не загрузились товары брони ${deal.ID}`);

                rowsById.set(String(deal.ID), answer.data() || []);
            });
        }

        const records = [];
        let withoutHall = 0;

        active.forEach(deal => {
            const record = dealToRecord(deal, rowsById.get(String(deal.ID)));

            if (record) records.push(record);
            else withoutHall += 1;
        });

        return { records, total: deals.length, excluded: deals.length - active.length, withoutHall };
    }

    function startCollector() {
        if (window.__studio1826CollectorV3) return;
        trackErrors();
        window.__studio1826CollectorV3 = true;

        let features = loadFeatures();
        /* 5.4.0: тумблер «скрыть вмешательство скрипта» — календарь в исходном виде. */
        let scriptOff = false;
        const OFF_STYLE_ID = 'studio1826-off-style';

        function applyOff() {
            document.documentElement.classList.toggle('s26-off', scriptOff);

            [BOOKING_STYLE_ID, STAGE_STYLE_ID].forEach(id => {
                const node = document.getElementById(id);

                if (node) node.disabled = scriptOff;
            });

            if (!document.getElementById(OFF_STYLE_ID)) {
                const node = document.createElement('style');

                node.id = OFF_STYLE_ID;
                node.textContent = 'html.s26-off .s26-badges, html.s26-off .booking-copy-button, html.s26-off .s26-handoff,' +
                    ' html.s26-off .s26-arrows, html.s26-off .s26-moves, html.s26-off .s26-tiles, html.s26-off .s26-hall-eq,' +
                    ' html.s26-off #' + PANEL_ID + ' { display: none !important; }';
                (document.head || document.documentElement).appendChild(node);
            }
        }

        if (!document.getElementById(BOOKING_STYLE_ID)) {
            const styleNode = document.createElement('style');
            styleNode.id = BOOKING_STYLE_ID;
            styleNode.textContent = STYLES.booking + STYLES.panel;
            (document.head || document.documentElement).appendChild(styleNode);
        }


        const COPY_ICON_SVG = `
            <svg viewBox="0 0 24 24" fill="none"
                 xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <rect x="8" y="8" width="12" height="12" rx="2"
                      stroke="currentColor" stroke-width="1.7"/>
                <path d="M16 8V5.8A1.8 1.8 0 0 0 14.2 4H5.8A1.8 1.8 0 0 0 4 5.8v8.4A1.8 1.8 0 0 0 5.8 16H8"
                      stroke="currentColor" stroke-width="1.7"/>
            </svg>
        `;

        let copyIconTemplate = null;

        const createCopyIcon = () => {
            if (!copyIconTemplate) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(COPY_ICON_SVG, 'image/svg+xml');
                copyIconTemplate = doc.documentElement;
            }

            return copyIconTemplate.cloneNode(true);
        };

        /* Исходный текст метки (метка визуально скрыта, но остаётся в DOM). */
        const labelSource = label => label.innerText || label.textContent || '';

        /* Единый разбор карточки: используется копированием, панелью и сборщиком. */
        const parseCache = new WeakMap();

        function parseCard(card) {
            const labels = [...card.querySelectorAll('.reserve-phone-label')];
            /* Включаем название зала в ключ: если изменился только зал
             * (другое поле карточки, не .reserve-phone-label), кэш сбросится
             * и info.hallFull не вернёт устаревшее значение. */
            const hallText = card.querySelector('.reserve-title-label')?.textContent || '';
            const cacheKey = labels.map(label => label.textContent).join('\u0001') + '\u0001' + hallText;
            const cached = parseCache.get(card);

            if (cached && cached.key === cacheKey) return cached.info;

            const info = parseCardUncached(card, labels);

            parseCache.set(card, { key: cacheKey, info });

            return info;
        }

        function parseCardUncached(card, labels) {
            const sources = labels.map(labelSource);
            const text = sources.join(', ');
            const cleanText = stripBookingComment(text);

            let comment = '';
            const commentElement = card.querySelector('.reserve-phone-label b');

            if (commentElement) {
                comment = (commentElement.innerText || commentElement.textContent || '')
                    .replace(/^\s*КОМ(?![a-zа-яё])\s*:?\s*/i, '')
                    .trim();
            }

            if (!comment) comment = extractBookingComment(sources.join('\n'));

            const items = splitItems(cleanText);
            const equipment = [];
            const equipmentList = [];
            const seen = new Map();

            items.forEach(item => {
                const match = findEquipment(item);

                if (!match) return;

                const qty = quantity(item);

                if (seen.has(match.key)) {
                    seen.get(match.key).qty += qty;
                    return;
                }

                const entry = { name: match.name, qty };

                seen.set(match.key, entry);
                equipment.push(match.name);
                equipmentList.push(entry);
            });

            return {
                labels,
                text,
                cleanText,
                comment,
                items,
                equipment,
                equipmentList,
                hallFull: findHallName(sources.join(' '))
            };
        }

        /* Слово «фон» (Фон, фона, фоне…), но не «телефон» или «фонарь». */
        const FON_RE = /(?<![а-яёa-z])фон(?:а|у|ом|е|ы|ов|ами|ах)?(?![а-яёa-z])/i;

        /* Название оборудования с подписью в скобках (бум, роллер…). */
        function equipmentLabel(name) {
            const alias = features.aliases ? aliasOf(name) : null;

            return alias ? `${name} (${alias})` : name;
        }

        /*
         * Оборудование, которое не нужно отслеживать на «нужно в следующих бронях».
         * Пример: REUSE_EXCLUDE = ['Avenger grip head', 'Baby Drop Down Pin'];
         */
        const REUSE_EXCLUDE = new Set([].map(norm));

        const reuseMap = new WeakMap();
        let reuseLinks = [];
        const timingMap = new WeakMap();
        let markKeys = new Set();

        /*
         * Для каждой брони ищет оборудование, которое нужно и в более поздних
         * бронях. Порядок определяется положением карточки на экране
         * (время идёт сверху вниз).
         */
        /*
         * Шкала времени: подписи часов (0:00, 9:00, …) слева от сетки.
         * Время карточки считается по её положению между подписями, поэтому
         * не зависит ни от режима сетки (часовые или получасовые ячейки),
         * ни от скрытых ночных часов. После полуночи Bitrix повторяет
         * подписи 0:00, 1:00 …: такие значения продолжают счёт (24:00, 25:00).
         */
        function getTimeAxis() {
            const groups = new Map();
            const fast = document.querySelectorAll('.time-line-container .time-line-coordinate-item');
            const candidates = fast.length
                ? fast
                : document.querySelectorAll('div, span, td, th, p, li, b');

            candidates.forEach(element => {
                if (!fast.length && element.children.length) return;

                const holder = fast.length ? (element.firstElementChild || element) : element;
                const match = /^(\d{1,2}):(\d{2})$/.exec((holder.textContent || '').trim());

                if (!match) return;
                if (holder.children.length) return;
                if (element.closest(`.deal-item-contaner, #${PANEL_ID}`)) return;

                const rect = element.getBoundingClientRect();

                if (rect.width <= 0 || rect.height <= 0) return;

                const key = Math.round(rect.left / 6);

                if (!groups.has(key)) groups.set(key, []);

                groups.get(key).push({
                    minutes: Number(match[1]) * 60 + Number(match[2]),
                    top: rect.top
                });
            });

            let labels = null;

            groups.forEach(list => {
                if (!labels || list.length > labels.length) labels = list;
            });

            if (!labels || labels.length < 3) return null;

            labels.sort((a, b) => a.top - b.top);

            let shift = 0;
            let previous = -Infinity;

            labels.forEach(label => {
                let value = label.minutes + shift;

                /* При расписании с бронями после полуночи Bitrix повторяет
                 * метки 0:00, 1:00 … — они физически ниже на экране, но
                 * числово меньше предыдущих. Добавляем ровно один сдвиг на
                 * сутки, только если метка «встретилась снова» (её значение
                 * в 1440-минутном цикле совпадает с previous), а не просто
                 * меньше или равна ему — иначе при двух последовательных
                 * одинаковых метках shift прибавлялся дважды. */
                while ((value % 1440) === (previous % 1440) && value <= previous && shift < 7 * 1440) {
                    shift += 1440;
                    value += 1440;
                }

                /* Fallback: если после цикла по модулю метка всё ещё не
                 * выше предыдущей (нестандартный порядок меток), применяем
                 * исходное поведение — продолжаем наращивать shift. */
                while (value <= previous && shift < 7 * 1440) {
                    shift += 1440;
                    value += 1440;
                }

                label.minutes = value;
                previous = value;
            });

            /* Пикселей на минуту: медиана по соседним подписям. */
            const scales = [];

            for (let i = 1; i < labels.length; i++) {
                const minutes = labels[i].minutes - labels[i - 1].minutes;

                if (minutes > 0) scales.push((labels[i].top - labels[i - 1].top) / minutes);
            }

            scales.sort((a, b) => a - b);

            const pxPerMinute = scales.length ? scales[Math.floor(scales.length / 2)] : 0;

            if (!(pxPerMinute > 0)) return null;

            return { labels, pxPerMinute };
        }

        function minutesAtY(axis, y) {
            let anchor = axis.labels[0];

            for (const label of axis.labels) {
                if (label.top <= y + 2) anchor = label;
                else break;
            }

            return anchor.minutes + (y - anchor.top) / axis.pxPerMinute;
        }

        function startMinutes(card, axis) {
            if (!axis) return null;

            const rect = card.getBoundingClientRect();

            if (rect.height <= 0) return null;

            return Math.max(0, Math.round(minutesAtY(axis, rect.top) / 30) * 30);
        }

        function formatTime(minutes) {
            if (minutes === null || minutes === undefined) return '';

            const hours = Math.floor(minutes / 60) % 24;

            return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
        }

        function computeReuse() {
            const axis = getTimeAxis();
            const entries = [];

            document.querySelectorAll('.deal-item-contaner').forEach(card => {
                if (!card.querySelector('.reserve-phone-label')) return;

                const info = parseCard(card);
                const keys = new Map();
                const qtys = new Map();

                info.items.forEach(item => {
                    const match = findEquipment(item);

                    if (!match || REUSE_EXCLUDE.has(match.key)) return;

                    keys.set(match.key, match.name);
                    qtys.set(match.key, (qtys.get(match.key) || 0) + Math.max(1, Math.round(quantity(item))));
                });

                const start = startMinutes(card, axis);

                let duration = 0;
                info.items.forEach(item => {
                    if (/^\s*Зал\s+\d+/i.test(item)) duration += quantity(item) * 60;
                });

                if (!duration && axis) {
                    duration = card.getBoundingClientRect().height / axis.pxPerMinute;
                }

                duration = Math.max(30, Math.round(duration / 30) * 30);
                const end = start === null ? null : start + duration;

                timingMap.set(card, { start, end });

                entries.push({
                    card,
                    info,
                    keys,
                    qtys,
                    start,
                    end,
                    hall: hallLabel(info.hallFull),
                    hallFull: info.hallFull
                });
            });

            const place = entry => [entry.hall, formatTime(entry.start)].filter(Boolean).join(' · ');
            const sourceText = entry => [entry.hall, `до ${formatTime(entry.end)}`].filter(Boolean).join(' · ');

            const eqMap = new Map();
            entries.forEach(entry => {
                if (entry.start === null) return;
                entry.keys.forEach((name, key) => {
                    if (!eqMap.has(key)) eqMap.set(key, []);
                    eqMap.get(key).push(entry);
                });
            });

            eqMap.forEach(list => list.sort((a, b) => a.start - b.start));

            /* Связи «бронь → следующая бронь» для стрелок. */
            const linkMap = new Map();

            const addLink = (from, to, name, units) => {
                let byTarget = linkMap.get(from.card);

                if (!byTarget) {
                    byTarget = new Map();
                    linkMap.set(from.card, byTarget);
                }

                let link = byTarget.get(to.card);

                if (!link) {
                    link = {
                        from: from.card,
                        to: to.card,
                        names: [],
                        units: new Map(),
                        same: !!from.hall && from.hall === to.hall
                    };
                    byTarget.set(to.card, link);
                }

                if (!link.names.includes(name)) link.names.push(name);

                link.units.set(name, (link.units.get(name) || 0) + units);
            };

            /*
             * Распределение: каждый прибор едет в следующую бронь только из
             * одного выбранного источника. Для каждой брони (по порядку
             * начала) берём из уже закончившихся броней с этим прибором тот
             * источник, который ближе по залам (сначала тот же зал), при
             * равенстве — закончившийся позже. Прибор, который освободился,
             * не берётся дважды, поэтому «лишние» залы стрелок не получают.
             */
            const outMap = new Map();
            const inMap = new Map();

            const pushUnique = (map, entry, name, field, text, units) => {
                if (!map.has(entry)) map.set(entry, new Map());

                const byName = map.get(entry);

                if (!byName.has(name)) byName.set(name, { name, [field]: new Set(), units: 0 });

                const item = byName.get(name);

                item[field].add(text);
                item.units += units;
            };

            eqMap.forEach((list, key) => {
                const remaining = new Map();

                list.forEach(target => {
                    const name = target.keys.get(key);
                    let need = target.qtys.get(key) || 1;

                    const candidates = list
                        .filter(other =>
                            other !== target &&
                            other.end <= target.start &&
                            (remaining.get(other) || 0) > 0)
                        .sort((a, b) =>
                            hallDistance(a.hall, target.hall) - hallDistance(b.hall, target.hall) ||
                            b.end - a.end);

                    for (const source of candidates) {
                        if (need <= 0) break;

                        const units = Math.min(need, remaining.get(source));

                        remaining.set(source, remaining.get(source) - units);
                        need -= units;

                        addLink(source, target, name, units);
                        pushUnique(outMap, source, name, 'places', place(target), units);
                        pushUnique(inMap, target, name, 'sources', sourceText(source), units);
                    }

                    /* После этой брони все её приборы освобождаются. */
                    remaining.set(target, target.qtys.get(key) || 1);
                });
            });

            entries.forEach(entry => {
                const outgoing = [...(outMap.get(entry)?.values() || [])]
                    .map(item => ({ name: item.name, places: [...item.places], units: item.units }));
                const incoming = [...(inMap.get(entry)?.values() || [])]
                    .map(item => ({ name: item.name, sources: [...item.sources], units: item.units }));

                reuseMap.set(entry.card, { outgoing, incoming });
            });

            reuseLinks = [...linkMap.values()].flatMap(byTarget => [...byTarget.values()]);

            return entries.map(entry => ({
                card: entry.card,
                info: entry.info,
                hallFull: entry.hallFull,
                start: entry.start
            }));
        }

        function badge(className, text) {
            const element = document.createElement('span');
            element.className = className;
            element.textContent = text;

            return element;
        }

        const EMPTY_REUSE = { outgoing: [], incoming: [] };

        const unitsPrefix = entry => (entry.units >= 2 ? `${entry.units} × ` : '');

        const reuseOutText = entry => entry.places.length
            ? `${unitsPrefix(entry)}${entry.name} → ${entry.places.join(', ')}`
            : entry.name;

        const reuseInText = entry => entry.sources.length
            ? `${unitsPrefix(entry)}${entry.name} ← ${entry.sources.join(', ')}`
            : entry.name;

        function renderBadges(card, info) {
            const rawFon = info.items.some(item => FON_RE.test(item));
            const rawEquipment = info.equipment.length > 0;

            card.classList.toggle('s26-outlined', features.borders && (rawFon || rawEquipment));

            /* 5.5.0: вид выделения по содержимому: рама > оборудование > фон. */
            const rawFrame = rawEquipment && info.equipment.some(isFrostframeHighlight);
            const kind = !features.borders ? '' : rawFrame ? 'frame' : rawEquipment ? 'eq' : rawFon ? 'bg' : '';

            ['frame', 'eq', 'bg'].forEach(name => card.classList.toggle(`s26-k-${name}`, kind === name));

            /* Имя клиента жирным, если есть фон или оборудование. */
            const nameElement = card.querySelector('.reserve-title-label');

            if (nameElement) {
                nameElement.classList.toggle(
                    's26-strong',
                    features.compactCards && (rawFon || rawEquipment)
                );
                nameElement.classList.toggle('s26-star', (nameElement.textContent || '').includes('*'));
            }

            const hasFon = features.compactCards && rawFon;
            const hasEquipment = features.compactCards && rawEquipment;
            const hasFrame = features.compactCards && info.equipment.some(isFrostframeHighlight);

            const reuse = features.reuse ? (reuseMap.get(card) || EMPTY_REUSE) : EMPTY_REUSE;
            const outgoing = reuse.outgoing.map(reuseOutText).join('; ');
            const incoming = reuse.incoming.map(reuseInText).join('; ');

            const signature = [hasFon, hasEquipment, info.equipment.length, hasFrame, outgoing, incoming].join('::');

            let box = card.querySelector('.s26-badges');

            if (box && box.dataset.sig === signature) return;

            if (!box) {
                box = el('div', { className: 's26-badges' });

                const host = card.querySelector('.reserve-content-box > div') ||
                    card.querySelector('.reserve-content-box') ||
                    card;

                host.appendChild(box);
            }

            box.dataset.sig = signature;
            box.replaceChildren();

            if (hasFon) box.appendChild(badge('s26-badge-bg', 'Фон'));
            if (hasEquipment) box.appendChild(badge('s26-badge-eq', `Оборуд. ${info.equipment.length}`));
            if (hasFrame) box.appendChild(badge('s26-badge-eq s26-badge-frame', 'РАМА'));
            if (outgoing) box.appendChild(badge('s26-badge-keep', outgoing));
            if (incoming) box.appendChild(badge('s26-badge-keep', incoming));
        }

        async function writeClipboard(text) {
            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(text);
                    return true;
                }
            } catch (_) {}

            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            textarea.style.top = '0';

            document.body.appendChild(textarea);
            textarea.select();

            try {
                return document.execCommand('copy');
            } catch (_) {
                return false;
            } finally {
                textarea.remove();
            }
        }

        function flashButton(button, state, title) {
            button.classList.remove('copy-success', 'copy-error');
            button.classList.add(state);
            button.title = title;

            setTimeout(() => {
                button.classList.remove(state);
                button.title = 'Копировать зал и оборудование';
            }, state === 'copy-success' ? 1200 : 1600);
        }

        async function copyBookingEquipment(card, button) {
            const info = parseCard(card);
            const hall = hallLabel(info.hallFull);

            if (!hall && info.equipment.length === 0) {
                flashButton(button, 'copy-error', 'Зал и оборудование не найдены');
                return;
            }

            const lines = [];

            if (hall) lines.push(hall);
            lines.push(...info.equipmentList.map(entry => equipmentLine(entry.name, entry.qty)));

            const ok = await writeClipboard(lines.join('\n'));

            if (ok) flashButton(button, 'copy-success', 'Скопировано');
            else flashButton(button, 'copy-error', 'Не удалось скопировать');
        }

        /* Панель при наведении */
        let panel = document.getElementById(PANEL_ID);

        if (!panel) {
            panel = document.createElement('div');
            panel.id = PANEL_ID;
            panel.setAttribute('aria-hidden', 'true');
            document.body.appendChild(panel);
        }

        let hoveredCard = null;
        let panelHideTimer = null;
        let positionFrame = 0;

        function addPanelSection(title, items, { equipment = false, itemClass = '', format = null } = {}) {
            const section = el('div', { className: 'p-section' }, [
                el('div', { className: 'p-section-title' }, [title])
            ]);

            if (!items.length) {
                section.appendChild(el('div', { className: 'p-empty' }, ['Нет позиций']));
            } else {
                items.forEach(item => {
                    const classes = ['p-item'];
                    if (equipment) classes.push('equipment');
                    if (itemClass) classes.push(itemClass);
                    if (equipment && isFrostframeHighlight(item)) classes.push('frostframe');
                    if (features.fonHighlight && FON_RE.test(item)) classes.push('bg');
                    if (itemClass === 'keep') {
                        const idx = classes.indexOf('bg');
                        if (idx !== -1) classes.splice(idx, 1);
                    }

                    section.appendChild(el(
                        'div',
                        { className: classes.join(' ') },
                        format ? format(item) : [item]
                    ));
                });
            }

            panel.appendChild(section);
        }

        function renderPanel(card) {
            const info = parseCard(card);

            panel.replaceChildren();

            panel.appendChild(el('div', { className: 'p-title' }, ['Информация о бронировании']));

            const hallElement = el('div', { className: 'p-hall' }, [hallLabel(info.hallFull) || 'Зал не определён']);

            const timing = timingMap.get(card);

            if (timing && Number.isFinite(timing.start)) {
                hallElement.appendChild(el('span', { className: 'p-time' }, [` · ${formatTime(timing.start)}–${formatTime(timing.end)}`]));
            }

            panel.appendChild(hallElement);

            /* Количество перед названием: «2 | Avenger C-Stand A2033L» (от 2 шт). */
            const qtyByName = new Map(info.equipmentList.map(entry => [entry.name, entry.qty]));

            addPanelSection('Оборудование', info.equipment, {
                equipment: true,
                format: name => {
                    const qty = qtyByName.get(name) ?? 1;

                    /* Количество показываем только когда штук две и больше. */
                    if (qty < 2) return [equipmentLabel(name)];

                    return [
                        el('span', { className: 'p-qty' }, [`${formatQuantity(qty)} шт.`]),
                        el('span', { className: 'p-sep' }, ['|']),
                        equipmentLabel(name)
                    ];
                }
            });

            const reuse = features.reuse ? (reuseMap.get(card) || EMPTY_REUSE) : EMPTY_REUSE;

            if (reuse.outgoing.length) {
                addPanelSection(
                    'Не разбирать — нужно в следующих бронях',
                    reuse.outgoing.map(reuseOutText),
                    { itemClass: 'keep' }
                );
            }

            if (reuse.incoming.length) {
                addPanelSection(
                    'Оборудование придёт из предыдущих броней',
                    reuse.incoming.map(reuseInText),
                    { itemClass: 'keep' }
                );
            }

            let parkingHours = 0;

            info.items.forEach(item => {
                if (/^\s*Парковка\s*\(\s*1\s*час\s*\)/i.test(item)) {
                    parkingHours += quantity(item);
                }
            });

            const otherItems = info.items.filter(item =>
                !isEquipmentItem(item) &&
                !COMMENT_ITEM.test(item) &&
                !/^\s*Зал\s+\d+/i.test(item) &&
                !/^\s*Кофейня/i.test(item) &&
                !/^\s*Парковка\s*\(\s*1\s*час\s*\)/i.test(item)
            );

            if (parkingHours > 0) {
                otherItems.unshift(
                    `Парковка — ${formatQuantity(parkingHours)} ${parkingHoursWord(parkingHours)}`
                );
            }

            if (otherItems.length) addPanelSection('Дополнительно', otherItems);

            if (info.comment) {
                addPanelSection('Комментарий', [info.comment], { itemClass: 'comment' });
            }
        }

        function positionPanel(card) {
            const rect = card.getBoundingClientRect();
            const panelWidth = Math.min(330, window.innerWidth - 24);
            const panelHeight = Math.min(panel.scrollHeight || 300, window.innerHeight - 24);

            let left = rect.right + 10;

            if (left + panelWidth > window.innerWidth - 12) {
                left = rect.left - panelWidth - 10;
            }

            left = Math.max(12, Math.min(left, window.innerWidth - panelWidth - 12));

            let top = rect.top;

            if (top + panelHeight > window.innerHeight - 12) {
                top = window.innerHeight - panelHeight - 12;
            }

            top = Math.max(12, top);

            panel.style.left = `${left}px`;
            panel.style.top = `${top}px`;
        }

        function showPanel(card) {
            clearTimeout(panelHideTimer);

            if (hoveredCard && hoveredCard !== card) hoveredCard.classList.remove('s26-hovered');

            hoveredCard = card;
            card.classList.add('s26-hovered');
            document.documentElement.classList.add('s26-hovering');

            renderPanel(card);
            positionPanel(card);
            focusArrows(card);

            panel.classList.add('visible');
            panel.setAttribute('aria-hidden', 'false');
        }

        function hidePanel(delay = 100) {
            clearTimeout(panelHideTimer);

            panelHideTimer = setTimeout(() => {
                if (hoveredCard) hoveredCard.classList.remove('s26-hovered');

                document.documentElement.classList.remove('s26-hovering');
                hoveredCard = null;
                focusArrows(null);
                panel.classList.remove('visible');
                panel.setAttribute('aria-hidden', 'true');
            }, delay);
        }

        /* Позиция обновляется не чаще раза за кадр и без пересборки содержимого. */
        function schedulePosition() {
            if (!hoveredCard || positionFrame) return;

            positionFrame = requestAnimationFrame(() => {
                positionFrame = 0;

                if (!hoveredCard) return;

                if (!hoveredCard.isConnected) {
                    hidePanel(0);
                    return;
                }

                positionPanel(hoveredCard);
            });
        }

        /*
         * Фиксация размеров карточки в момент входа курсора.
         * Слушатель в фазе перехвата срабатывает раньше обработчиков Bitrix,
         * поэтому читаются ещё «нормальные» размеры.
         */
        const FREEZE_PROPS = [
            ['width', '--s26-w'],
            ['right', '--s26-r'],
            ['left', '--s26-l'],
            ['paddingBottom', '--s26-pb'],
            ['height', '--s26-h'],
            ['minHeight', '--s26-mh']
        ];

        document.addEventListener('mouseover', event => {
            const card = event.target?.closest?.('.deal-item-contaner');

            if (!card || card.contains(event.relatedTarget)) return;

            const computed = getComputedStyle(card);

            FREEZE_PROPS.forEach(([prop, variable]) => {
                card.style.setProperty(variable, computed[prop]);
            });

            card.dataset.s26Frozen = '1';
        }, true);

        window.addEventListener('scroll', schedulePosition, true);
        window.addEventListener('resize', schedulePosition);

        /* Тёмный ли цвет (по воспринимаемой яркости YIQ). */
        function isDarkColor(hex) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);

            return (r * 299 + g * 587 + b * 114) / 1000 < 140;
        }

        function ensureStageStyle() {
            let node = document.getElementById(STAGE_STYLE_ID);

            if (!node) {
                node = document.createElement('style');
                node.id = STAGE_STYLE_ID;
                (document.head || document.documentElement).appendChild(node);
            }

            const stageCss = STAGES
                .filter(stage => features.colors[stage.id] !== stage.color)
                .map(stage => {
                    const color = features.colors[stage.id];
                    const selector = `.deal-item-contaner[data-s26-stage="${stage.id}"]`;

                    let rule = `${selector} { background: ${color} !important; }`;

                    if (isDarkColor(color)) {
                        rule += `\n${selector}, ${selector} .reserve-content-box :not(.s26-badge-keep):not(.s26-badge-bg):not(.s26-badge-eq) { color: #fff !important; }`;
                    }

                    return rule;
                })
                .join('\n');

            const vars = ':root { ' +
                MARK_COLORS.map(mark => `--s26-${mark.id}: ${features.colors[mark.id]};`).join(' ') +
                ' }';

            const css = `${vars}\n${stageCss}`;

            if (node.textContent !== css) node.textContent = css;

            node.disabled = scriptOff;
        }

        function applyStages(cardList = [...document.querySelectorAll('.deal-item-contaner')].map(card => ({ card }))) {
            cardList.forEach(({ card }) => {
                const stage = stageOfCard(card);

                if (stage) {
                    if (card.dataset.s26Stage !== stage) card.dataset.s26Stage = stage;
                } else if (card.dataset.s26Stage) {
                    delete card.dataset.s26Stage;
                }
            });
        }

        function applyFeatures() {
            const root = document.documentElement;

            root.classList.toggle('s26-compact', features.compactCards);
            root.classList.toggle('s26-no-copy', !features.copyButton);
            root.classList.toggle('s26-hover-focus', features.hoverFocus);
            root.classList.toggle('s26-stripes', features.stripes);

            ensureStageStyle();
            processCards();
        }

        function setStrip(card, side, on) {
            let strip = card.querySelector(`:scope > .s26-handoff.${side}`);

            if (on && !strip) {
                strip = document.createElement('div');
                strip.className = `s26-handoff ${side}`;
                card.appendChild(strip);
            } else if (!on && strip) {
                strip.remove();
            }
        }

        /*
         * Брони одного зала, идущие вплотную (без пустого часа между ними):
         * на стыке рисуется полоска цвета «Пересменки».
         */
        function renderHandoffs(list) {
            const top = new Set();
            const bottom = new Set();

            if (features.handoff) {
                const byHall = new Map();

                list.forEach(item => {
                    /* Пересменки — только у залов, у гримёрных мест их нет. */
                    if (!item.hallFull || !/^Зал/i.test(item.hallFull)) return;

                    const rect = item.card.getBoundingClientRect();

                    if (rect.width <= 0 || rect.height <= 0) return;

                    if (!byHall.has(item.hallFull)) byHall.set(item.hallFull, []);

                    byHall.get(item.hallFull).push({ card: item.card, rect });
                });

                byHall.forEach(group => {
                    group.sort((a, b) => a.rect.top - b.rect.top);

                    for (let i = 0; i < group.length - 1; i++) {
                        const a = group[i];
                        const b = group[i + 1];
                        const gap = b.rect.top - a.rect.bottom;
                        const overlap = Math.min(a.rect.right, b.rect.right) -
                            Math.max(a.rect.left, b.rect.left);

                        if (gap >= -4 && gap <= 6 && overlap > 8) {
                            bottom.add(a.card);
                            top.add(b.card);
                        }
                    }
                });
            }

            list.forEach(({ card }) => {
                setStrip(card, 'bottom', bottom.has(card));
                setStrip(card, 'top', top.has(card));
            });
        }

        /* Обводка последних броней залов (результат «не разбирать на завтра»). */
        function applyMarks(list) {
            list.forEach(({ card, hallFull, start }) => {
                const on = markKeys.size > 0 &&
                    Number.isFinite(start) &&
                    markKeys.has(`${hallFull}|${start}`);

                card.classList.toggle('s26-last', on);
            });
        }

        /*
         * Стрелки переноса: от брони, после которой оборудование нужно дальше,
         * к ближайшей следующей брони с этим оборудованием (в этом же зале
         * или в другом). Слой лежит внутри сетки расписания и прокручивается
         * вместе с ней. Сплошная стрелка — в другой зал, пунктир — остаётся.
         */
        const SVG_NS = 'http://www.w3.org/2000/svg';
        let arrowLayer = null;
        let arrowSignature = '';
        let arrowEls = [];

        function svgNode(tag, attrs = {}) {
            const node = document.createElementNS(SVG_NS, tag);

            Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));

            return node;
        }

        function getArrowHolder() {
            const root = document.querySelector('.calendar_container-content');

            if (!root) return null;

            if (!arrowLayer || arrowLayer.parentElement !== root) {
                arrowLayer = svgNode('svg', { class: 's26-arrows', 'aria-hidden': 'true' });
                root.appendChild(arrowLayer);
                arrowSignature = '';
                arrowEls = [];
            }

            return { root, layer: arrowLayer };
        }

        function focusArrows(card) {
            if (!arrowLayer) return;

            let any = false;

            arrowEls.forEach(item => {
                const on = !!card && (item.link.from === card || item.link.to === card);

                item.path.classList.toggle('focus', on);
                item.head.classList.toggle('focus', on);
                item.label.classList.toggle('focus', on);

                if (on) any = true;
            });

            arrowLayer.classList.toggle('s26-has-focus', any);
        }

        function renderArrows() {
            if (!features.arrows) {
                if (arrowLayer && arrowLayer.isConnected) arrowLayer.replaceChildren();

                arrowSignature = '';
                arrowEls = [];

                return;
            }

            const holder = getArrowHolder();

            if (!holder) return;

            const { root, layer } = holder;
            const rootRect = root.getBoundingClientRect();
            const links = reuseLinks.filter(link => link.from.isConnected && link.to.isConnected);
            const outCount = new Map();
            const inCount = new Map();

            links.forEach(link => {
                link.outIndex = outCount.get(link.from) || 0;
                outCount.set(link.from, link.outIndex + 1);
                link.inIndex = inCount.get(link.to) || 0;
                inCount.set(link.to, link.inIndex + 1);
            });

            const shapes = [];

            links.forEach(link => {
                const a = link.from.getBoundingClientRect();
                const b = link.to.getBoundingClientRect();

                if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return;

                const sx = a.left - rootRect.left + a.width * (link.outIndex + 1) / (outCount.get(link.from) + 1);
                const sy = a.bottom - rootRect.top - 6;
                const tx = b.left - rootRect.left + b.width * (link.inIndex + 1) / (inCount.get(link.to) + 1);
                const ty = b.top - rootRect.top + 4;

                shapes.push({ link, sx, sy, tx, ty });
            });

            const signature = shapes
                .map(({ link, sx, sy, tx, ty }) =>
                    [sx, sy, tx, ty].map(Math.round).join(',') + (link.same ? 's' : 'm') + link.names.join('+'))
                .join(';');

            if (signature === arrowSignature) return;

            arrowSignature = signature;
            layer.replaceChildren();
            arrowEls = [];

            shapes.forEach(({ link, sx, sy, tx, ty }) => {
                const dy = Math.min(80, Math.max(8, Math.abs(ty - sy) / 2));
                const path = svgNode('path', {
                    class: 's26-arrow-path' + (link.same ? ' same' : ''),
                    d: `M${sx} ${sy} C${sx} ${sy + dy} ${tx} ${ty - dy} ${tx} ${ty - 8}`
                });
                const head = svgNode('polygon', {
                    class: 's26-arrow-head',
                    points: `${tx},${ty} ${tx - 5},${ty - 9} ${tx + 5},${ty - 9}`
                });
                const label = svgNode('text', {
                    class: 's26-arrow-label',
                    x: (sx + tx) / 2,
                    y: (sy + ty) / 2,
                    'text-anchor': 'middle'
                });

                const named = link.names.map(name => {
                    const units = link.units.get(name) || 1;

                    return units >= 2 ? `${units} × ${name}` : name;
                });
                const shown = named.slice(0, 3).join(', ');

                label.textContent = named.length > 3
                    ? `${shown} +${named.length - 3}`
                    : shown;

                layer.append(path, head, label);
                arrowEls.push({ link, path, head, label });
            });

            focusArrows(hoveredCard);
        }

        window.addEventListener('resize', renderArrows);

        /*
         * Синие стрелки «не разбирать на завтра»: от последней брони зала-источника
         * вниз, в свободное место колонки нужного зала. На конце — номер зала.
         */
        let moveLayer = null;
        let moveSignature = '';
        let moveLinks = [];
        let lastCardList = [];
        let tomorrowTiles = [];
        let tileLinks = [];
        let tileLayer = null;
        /* Закрытые крестиком плашки: только до перезагрузки страницы. */
        const closedTiles = new Set();

        function clearMoves() {
            if (moveLayer && moveLayer.isConnected) moveLayer.replaceChildren();

            moveSignature = '';
        }

        function getMoveLayer() {
            const root = document.querySelector('.calendar_container-content');

            if (!root) return null;

            if (!moveLayer || moveLayer.parentElement !== root) {
                moveLayer = svgNode('svg', { class: 's26-moves', 'aria-hidden': 'true' });
                root.appendChild(moveLayer);
                moveSignature = '';
            }

            return { root, layer: moveLayer };
        }

        /* Колонка зала без броней: ищем заголовок с названием зала. */
        function findHallHeader(label) {
            const element = findHallHeaderElement(label);

            return element ? element.getBoundingClientRect() : null;
        }

        /* Подпись зала в шапке календаря (самая верхняя видимая). */
        function findHallHeaderElement(label) {
            const wanted = label.toLowerCase();
            let best = null;
            let bestTop = Infinity;

            document.querySelectorAll('div, span, th, td, p, li, b, a').forEach(element => {
                if (element.children.length) return;
                if (element.closest(`.deal-item-contaner, #${PANEL_ID}, .s26-arrows, .s26-moves, .s26-hall-eq`)) return;

                const text = (element.textContent || '').trim().toLowerCase();

                if (!text.startsWith(wanted) || text.length > wanted.length + 8) return;
                if (/\d/.test(text.charAt(wanted.length))) return;

                const rect = element.getBoundingClientRect();

                if (rect.width <= 0 || rect.height <= 0) return;
                if (rect.top < bestTop) {
                    best = element;
                    bestTop = rect.top;
                }
            });

            return best;
        }

        /*
         * 5.1.0: итог оборудования зала за показанный день — маленький счётчик рядом с названием зала
         * в шапке календаря, список во всплывающей подсказке. Правила те же, что в buildDayList
         * (внутри зала максимум, звёздочка у первой брони). Пересчёт только при изменении состава.
         */
        let hallEquipmentSignature = '';

        function renderHallEquipment(cardList) {
            const records = features.compactCards
                ? cardList.map(({ card, info }) => {
                    const timing = timingMap.get(card) || {};

                    return { hall: info.hallFull, items: info.items, start: timing.start, end: timing.end };
                })
                : [];
            const day = buildDayList(records);
            const signature = day.text;

            if (signature === hallEquipmentSignature && document.querySelector('.s26-hall-eq')) return;

            hallEquipmentSignature = signature;
            document.querySelectorAll('.s26-hall-eq').forEach(node => node.remove());

            day.blocks.forEach(block => {
                const header = findHallHeaderElement(block.label);

                if (!header || !header.parentElement) return;

                const title = block.items
                    .map(item => `${equipmentLine(item.name, item.qty)}${item.star ? ' *' : ''}`)
                    .join('\n');
                const pill = badge('s26-hall-eq', `⚙ ${block.items.length}`);

                pill.title = `${block.label}\n${title}`;
                header.insertAdjacentElement('afterend', pill);
            });
        }

        function pickFreeY(occupied, yMin, yMax, sy) {
            const sorted = occupied.slice().sort((a, b) => a[0] - b[0]);
            const gaps = [];
            let cursor = yMin;

            sorted.forEach(([top, bottom]) => {
                if (top > cursor) gaps.push([cursor, top]);
                cursor = Math.max(cursor, bottom);
            });

            if (yMax > cursor) gaps.push([cursor, yMax]);

            const desired = sy + 60;
            let best = null;

            gaps.forEach(([g0, g1]) => {
                const lo = g0 + 26;
                const hi = g1 - 26;

                if (lo > hi) return;

                const y = Math.min(hi, Math.max(lo, desired));
                const score = y >= sy ? Math.abs(y - desired) : 100000 + Math.abs(y - sy);

                if (!best || score < best.score) best = { y, score };
            });

            if (best) return best.y;

            /* Свободных мест нет: ставим под самой нижней бронью колонки. */
            const lowest = sorted.reduce((max, [, bottom]) => Math.max(max, bottom), yMin);

            return lowest + 30;
        }

        /* Окно «Информация» при наведении на плашку «ЗАВТРА» — тот же вид, что у броней. */
        let tilePanelOpen = false;

        function showTilePanel(tile, node) {
            tilePanelOpen = true;
            clearTimeout(panelHideTimer);
            panel.replaceChildren();
            panel.appendChild(el('div', { className: 'p-title' }, ['Завтра — подготовить зал']));
            panel.appendChild(el('div', { className: 'p-hall' }, [
                tile.hall,
                Number.isFinite(tile.start) ? el('span', { className: 'p-time' }, [` · первая бронь в ${formatClock(tile.start)}`]) : ''
            ]));

            const qtyText = item => (item.qty > 1 ? ` — ${formatQuantity(item.qty)} шт.` : '');
            const afterText = item => (Number.isFinite(item.after) ? ` (после ${formatClock(item.after)})` : '');
            const byKind = kind => tile.items.filter(item => item.kind === kind);

            if (byKind('keep').length) {
                addPanelSection('Оставить — не разбирать', byKind('keep').map(item => `${item.name}${qtyText(item)}${afterText(item)}`), { itemClass: 'keep' });
            }
            if (byKind('move').length) {
                addPanelSection('Перекатить', byKind('move').map(item => `${item.name}${qtyText(item)} — из ${item.from}${afterText(item)}`));
            }
            if (byKind('missing').length) {
                addPanelSection('Собрать с нуля', byKind('missing').map(item => `${item.name}${qtyText(item)}`), { itemClass: 'keep' });
            }

            positionPanel(node);
            panel.classList.add('visible');
            panel.setAttribute('aria-hidden', 'false');
        }

        function clearTiles() {
            if (tileLayer && tileLayer.isConnected) tileLayer.replaceChildren();
        }

        /*
         * 5.3.0: «ЗАВТРА» прямо в календаре. В колонке каждого зала, куда к утру нужно оборудование,
         * в свободном времени после последней брони — плашка (что оставить, что принести и откуда,
         * что собрать); от последних броней — пунктирные стрелки к плашке. Клики проходят сквозь.
         */
        function renderTomorrowTiles(list) {
            const holder = getMoveLayer();

            if (!holder) return;

            const { root, layer } = holder;

            if (!tileLayer || tileLayer.parentElement !== root) {
                tileLayer = document.createElement('div');
                tileLayer.className = 's26-tiles';
                tileLayer.setAttribute('aria-hidden', 'true');
                root.appendChild(tileLayer);
            }

            const rootRect = root.getBoundingClientRect();
            const sources = new Map();
            const columns = new Map();

            list.forEach(({ card, hallFull, start }) => {
                const r = card.getBoundingClientRect();

                if (r.width <= 0 || r.height <= 0) return;

                const rect = {
                    left: r.left - rootRect.left,
                    right: r.right - rootRect.left,
                    top: r.top - rootRect.top,
                    bottom: r.bottom - rootRect.top
                };

                if (Number.isFinite(start)) sources.set(`${hallFull}|${start}`, rect);

                const label = hallLabel(hallFull);

                if (!label) return;

                const col = columns.get(label) || { left: rect.left, right: rect.right, bottom: rect.bottom };

                col.left = Math.min(col.left, rect.left);
                col.right = Math.max(col.right, rect.right);
                col.bottom = Math.max(col.bottom, rect.bottom);
                columns.set(label, col);
            });

            const axis = getTimeAxis();
            const yMin = axis ? axis.labels[0].top - rootRect.top + 4 : 40;

            const signature = JSON.stringify([tomorrowTiles, tileLinks, [...columns.entries()].map(([k, c]) => [k, Math.round(c.left), Math.round(c.right), Math.round(c.bottom)])]);

            if (signature === moveSignature && tileLayer.childElementCount) return;

            moveSignature = signature;
            layer.replaceChildren();

            /* Плашку под курсором перерисовали — mouseleave не придёт, окно закрываем сами. */
            if (tilePanelOpen) {
                tilePanelOpen = false;
                hidePanel(0);
            }

            tileLayer.replaceChildren();

            const placed = new Map();

            tomorrowTiles.forEach(tile => {
                if (closedTiles.has(tile.hall)) return;

                let col = columns.get(tile.hall);

                if (!col) {
                    const header = findHallHeader(tile.hall);

                    if (!header) return;

                    col = { left: header.left - rootRect.left, right: header.right - rootRect.left, bottom: yMin };
                }

                const close = el('button', { type: 'button', className: 's26-tile-close', title: 'Скрыть плашку до обновления страницы' }, ['×']);

                close.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    closedTiles.add(tile.hall);
                    moveSignature = '';
                    renderMoves(lastCardList);
                });

                const node = el('div', { className: 's26-tile' }, [
                    el('div', { className: 's26-tile-head' }, [
                        close,
                        `ЗАВТРА${tile.date ? ' ' + tile.date : ''}${Number.isFinite(tile.start) ? ' · ' + formatClock(tile.start) : ''}`
                    ])
                ]);

                tile.items.forEach(item => {
                    const qty = item.qty > 1 ? ` ×${formatQuantity(item.qty)}` : '';
                    const what = el('b', {}, [`${item.name}${qty}`]);
                    const line = el('div', { className: `s26-tile-line ${item.kind}` });

                    if (item.kind === 'keep') line.append('✓ Оставить: ', what);
                    else if (item.kind === 'move') line.append('↻ Перекатить: ', what, ` из ${item.from}`);
                    else if (item.kind === 'missing') line.append('+ Собрать с нуля: ', what);
                    else line.append(`к ${Number.isFinite(item.at) ? formatClock(item.at) : 'днём'}: `, what);

                    node.appendChild(line);
                });

                /* Узкие колонки: плашка шире колонки, чтобы текст читался. */
                const width = Math.max(120, col.right - col.left - 6);

                node.addEventListener('mouseenter', () => showTilePanel(tile, node));
                node.addEventListener('mouseleave', () => {
                    tilePanelOpen = false;
                    hidePanel();
                });
                const top = col.bottom + 10;

                node.style.left = `${col.left + 3}px`;
                node.style.top = `${top}px`;
                node.style.width = `${width}px`;
                tileLayer.appendChild(node);
                placed.set(tile.hall, { left: col.left + 3, top, width });
            });

            tileLinks.forEach(linkItem => {
                if (closedTiles.has(linkItem.to)) return;

                const src = sources.get(linkItem.from);
                const dst = placed.get(linkItem.to);

                if (!src || !dst) return;

                const sx = (src.left + src.right) / 2;
                const sy = src.bottom - 4;
                const tx = dst.left + dst.width / 2;
                const ty = dst.top - 2;
                const dy = Math.max(10, Math.abs(ty - sy) / 2);
                const move = linkItem.kind === 'move';

                layer.append(
                    svgNode('path', {
                        class: move ? 's26-tile-path move' : 's26-tile-path',
                        d: `M${sx} ${sy} C${sx} ${sy + dy} ${tx} ${ty - dy} ${tx} ${ty - 9}`
                    }),
                    svgNode('polygon', {
                        class: move ? 's26-tile-arrow move' : 's26-tile-arrow',
                        points: `${tx},${ty} ${tx - 6},${ty - 10} ${tx + 6},${ty - 10}`
                    })
                );

                /* Синяя стрелка «перекатить»: подпись посередине пути. */
                if (move) {
                    const mx = (sx + tx) / 2;
                    const my = (sy + ty) / 2;
                    const text = 'перекатить';
                    const width = text.length * 6.4 + 14;
                    const caption = svgNode('text', { class: 's26-move-text', x: mx, y: my + 4 });

                    caption.textContent = text;
                    layer.append(
                        svgNode('rect', { class: 's26-move-pill', x: mx - width / 2, y: my - 9, width, height: 18, rx: 9 }),
                        caption
                    );
                }
            });
        }

        function renderMoves(list) {
            if (features.moveArrows && tomorrowTiles.length) {
                renderTomorrowTiles(list);
                return;
            }

            clearTiles();

            if (!features.moveArrows || !moveLinks.length) {
                clearMoves();
                return;
            }

            const holder = getMoveLayer();

            if (!holder) return;

            const { root, layer } = holder;
            const rootRect = root.getBoundingClientRect();
            const sources = new Map();
            const columns = new Map();
            const allRects = [];

            list.forEach(({ card, hallFull, start }) => {
                const r = card.getBoundingClientRect();

                if (r.width <= 0 || r.height <= 0) return;

                const rect = {
                    left: r.left - rootRect.left,
                    right: r.right - rootRect.left,
                    top: r.top - rootRect.top,
                    bottom: r.bottom - rootRect.top
                };

                allRects.push(rect);

                if (Number.isFinite(start)) sources.set(`${hallFull}|${start}`, rect);

                const label = hallLabel(hallFull);

                if (!label) return;

                const col = columns.get(label);

                if (!col) {
                    columns.set(label, { left: rect.left, right: rect.right, rects: [rect] });
                } else {
                    col.left = Math.min(col.left, rect.left);
                    col.right = Math.max(col.right, rect.right);
                    col.rects.push(rect);
                }
            });

            /* Вертикальные границы сетки: по шкале времени, иначе по броням. */
            const axis = getTimeAxis();
            let yMin;
            let yMax;

            if (axis) {
                const first = axis.labels[0];
                const last = axis.labels[axis.labels.length - 1];
                const step = (last.top - first.top) / Math.max(1, axis.labels.length - 1);

                yMin = first.top - rootRect.top + 4;
                yMax = last.top - rootRect.top + step;
            } else if (allRects.length) {
                yMin = Math.min(...allRects.map(r => r.top));
                yMax = Math.max(...allRects.map(r => r.bottom)) + 80;
            } else {
                clearMoves();
                return;
            }

            const getColumn = label => {
                if (columns.has(label)) return columns.get(label);

                const header = findHallHeader(label);

                if (!header) return null;

                const col = {
                    left: header.left - rootRect.left,
                    right: header.right - rootRect.left,
                    rects: []
                };

                columns.set(label, col);

                return col;
            };

            const valid = moveLinks
                .map(link => ({ link, src: sources.get(link.from), col: getColumn(link.to) }))
                .filter(item => item.src && item.col)
                .sort((a, b) => a.src.bottom - b.src.bottom || a.src.left - b.src.left);

            const outTotal = new Map();

            valid.forEach(item => outTotal.set(item.src, (outTotal.get(item.src) || 0) + 1));

            const outSeen = new Map();
            const occupied = new Map();
            const shapes = [];

            valid.forEach(({ link, src, col }) => {
                if (!occupied.has(col)) {
                    occupied.set(col, col.rects.map(r => [r.top - 2, r.bottom + 2]));
                }

                const taken = occupied.get(col);
                const index = outSeen.get(src) || 0;

                outSeen.set(src, index + 1);

                const sx = src.left + (src.right - src.left) * (index + 1) / (outTotal.get(src) + 1);
                const ty = pickFreeY(taken, yMin, yMax, src.bottom);
                const up = ty < src.bottom - 4;
                const sy = up ? src.top + 6 : src.bottom - 6;
                const tx = (col.left + col.right) / 2;

                taken.push([ty - 26, ty + 26]);
                shapes.push({ label: link.to, sx, sy, tx, ty, up });
            });

            const signature = shapes
                .map(({ label, sx, sy, tx, ty }) => [sx, sy, tx, ty].map(Math.round).join(',') + label)
                .join(';');

            if (signature === moveSignature) return;

            moveSignature = signature;
            layer.replaceChildren();

            shapes.forEach(({ label, sx, sy, tx, ty, up }) => {
                const dy = Math.min(80, Math.max(8, Math.abs(ty - sy) / 2));
                const dir = up ? -1 : 1;
                const text = label;
                const width = Math.max(40, text.length * 7 + 14);
                const pillTop = up ? ty - 21 : ty + 3;

                const path = svgNode('path', {
                    class: 's26-move-path',
                    d: `M${sx} ${sy} C${sx} ${sy + dir * dy} ${tx} ${ty - dir * (8 + dy)} ${tx} ${ty - dir * 8}`
                });
                const head = svgNode('polygon', {
                    class: 's26-move-head',
                    points: `${tx},${ty} ${tx - 5},${ty - dir * 9} ${tx + 5},${ty - dir * 9}`
                });
                const pill = svgNode('rect', {
                    class: 's26-move-pill',
                    x: tx - width / 2,
                    y: pillTop,
                    width,
                    height: 18,
                    rx: 9
                });
                const caption = svgNode('text', {
                    class: 's26-move-text',
                    x: tx,
                    y: pillTop + 13
                });

                caption.textContent = text;
                layer.append(path, head, pill, caption);
            });
        }

        window.addEventListener('resize', () => renderMoves(lastCardList));

        function processCards() {
            const cardList = computeReuse();

            cardList.forEach(({ card, info }) => {
                renderBadges(card, info);

                const oldCopy = card.querySelector('.booking-copy-button');

                if (oldCopy && info.equipment.length === 0) oldCopy.remove();

                if (info.equipment.length > 0 && !card.querySelector('.booking-copy-button')) {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'booking-copy-button';
                    button.appendChild(createCopyIcon());
                    button.title = 'Копировать зал и оборудование';
                    button.setAttribute('aria-label', 'Копировать зал и оборудование');

                    button.addEventListener('click', event => {
                        event.preventDefault();
                        event.stopPropagation();
                        copyBookingEquipment(card, button);
                    });

                    card.appendChild(button);
                }

                if (card.dataset.s26HoverBound !== 'true') {
                    card.dataset.s26HoverBound = 'true';
                    card.addEventListener('mouseenter', () => showPanel(card));
                    card.addEventListener('mouseleave', () => hidePanel());
                }
            });

            renderHallEquipment(cardList);
            renderHandoffs(cardList);
            applyMarks(cardList);
            applyStages(cardList);
            renderArrows();

            lastCardList = cardList;
            renderMoves(cardList);

            return cardList.map(e => e.card);
        }

        /* Сбор данных для основного окна */
        let lastSerialized = '';

        function collect(providedCards) {
            const cards = providedCards || document.querySelectorAll('.deal-item-contaner');
            const records = [];

            cards.forEach(card => {
                const info = parseCard(card);

                if (!info.items.length) return;

                const timing = timingMap.get(card) || {};

                records.push({
                    hall: info.hallFull,
                    items: info.items,
                    start: Number.isFinite(timing.start) ? timing.start : null,
                    end: Number.isFinite(timing.end) ? timing.end : null
                });
            });

            return {
                type: MESSAGE_TYPE,
                version: VERSION,
                source: 'studio1826-collector',
                cardCount: cards.length,
                category: getCategoryFromBranch(document),
                selectedDate: readSelectedDate(document),
                records
            };
        }

        function send(force = false, providedCards = null) {
            if (document.hidden && !force) return;

            const payload = collect(providedCards);

            /* Сравниваем без временных меток, иначе дедупликация не работает. */
            const serialized = JSON.stringify(payload);

            if (!force && serialized === lastSerialized) return;

            lastSerialized = serialized;

            try {
                window.top.postMessage(payload, MAIN_ORIGIN);
            } catch (_) {}
        }

        /* Диагностика для отладки (кнопка «Диагностика» в «Обзоре»). Без текстов броней. */
        function sendDiagnostics() {
            const started = performance.now();
            const cards = [...document.querySelectorAll('.deal-item-contaner')];
            const count = selector => document.querySelectorAll(selector).length;
            let axisInfo = null;
            let axisMs = null;

            try {
                const t0 = performance.now();
                const axis = getTimeAxis();

                axisMs = Math.round(performance.now() - t0);
                axisInfo = axis
                    ? {
                        labels: axis.labels.length,
                        firstMinutes: axis.labels[0].minutes,
                        lastMinutes: axis.labels[axis.labels.length - 1].minutes,
                        pxPerMinute: Math.round(axis.pxPerMinute * 1000) / 1000
                    }
                    : null;
            } catch (error) {
                axisInfo = { error: String(error && error.message).slice(0, 200) };
            }

            let parsed = 0;
            let withEquipment = 0;
            const halls = new Set();

            cards.forEach(card => {
                try {
                    const info = parseCard(card);

                    if (info.items.length) parsed += 1;
                    if (info.equipment.length) withEquipment += 1;
                    if (info.hallFull) halls.add(info.hallFull);
                } catch (_) {}
            });

            const diag = {
                runtime: 'collector',
                url: location.origin + location.pathname,
                selectors: {
                    cards: cards.length,
                    timeLineContainer: count('.time-line-container'),
                    timeLabelsFast: count('.time-line-container .time-line-coordinate-item'),
                    hallLabels: count('.reserve-title-label')
                },
                timeAxis: axisInfo,
                timeAxisMs: axisMs,
                cardsParsedWithItems: parsed,
                cardsWithEquipment: withEquipment,
                halls: [...halls].slice(0, 40),
                category: getCategoryFromBranch(document),
                selectedDate: readSelectedDate(document),
                features,
                sampleCardStructure: describeStructure(cards[0], 0, 4),
                errors: ERROR_LOG.slice(),
                collectMs: Math.round(performance.now() - started)
            };

            try {
                window.top.postMessage({
                    type: DIAG_TYPE,
                    source: 'studio1826-collector',
                    version: VERSION,
                    diag
                }, MAIN_ORIGIN);
            } catch (_) {}
        }

        /* Один общий наблюдатель вместо двух. */
        let workTimer = null;

        function isOwnNode(node) {
            const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;

            return !!element?.closest?.(`#${PANEL_ID}, .booking-copy-button, .s26-badges, .s26-handoff, .s26-arrows, .s26-moves, .s26-hall-eq, .s26-tiles`);
        }

        const observer = new MutationObserver(mutations => {
            if (mutations.every(m => isOwnNode(m.target))) return;

            clearTimeout(workTimer);

            workTimer = setTimeout(() => {
                const cards = processCards();
                send(false, cards);
            }, 300);
        });

        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true
            });
        }

        applyFeatures();
        send(true);

        setInterval(() => {
            if (document.hidden) return;

            applyStages();
            send();
        }, 3000);

        window.addEventListener('message', event => {
            if (event.origin !== MAIN_ORIGIN) return;

            const request = decodeRequest(event.data);

            if (request) {
                let marksChanged = false;
                let settingsChanged = false;

                if (request.diag === true) sendDiagnostics();

                if (request.settings) {
                    const next = sanitizeFeatures(request.settings);

                    if (JSON.stringify(next) !== JSON.stringify(features)) {
                        features = next;
                        settingsChanged = true;
                        saveFeatures(features);
                        applyFeatures();
                    }
                }

                if (Array.isArray(request.mark)) {
                    const next = new Set(request.mark
                        .slice(0, 500)
                        .filter(key => typeof key === 'string' && key.length <= 200));
                    const same = next.size === markKeys.size &&
                        [...next].every(key => markKeys.has(key));

                    if (!same) {
                        markKeys = next;
                        marksChanged = true;
                    }
                }

                if (Array.isArray(request.moves)) {
                    const next = request.moves
                        .slice(0, 200)
                        .filter(link => link && typeof link.from === 'string' && typeof link.to === 'string' &&
                            link.from.length <= 200 && link.to.length <= 200)
                        .map(link => ({ from: link.from, to: link.to }));

                    if (JSON.stringify(next) !== JSON.stringify(moveLinks)) {
                        moveLinks = next;
                        marksChanged = true;
                    }
                }

                if (typeof request.off === 'boolean' && request.off !== scriptOff) {
                    scriptOff = request.off;
                    applyOff();
                }

                /* 5.3.0: плашки «на утро» (санитизация: длины и количество ограничены). */
                if (Array.isArray(request.tiles)) {
                    const KINDS = ['keep', 'move', 'missing', 'later'];
                    const str = (value, max) => typeof value === 'string' && value.length <= max;
                    const nextTiles = request.tiles
                        .slice(0, 40)
                        .filter(tile => tile && str(tile.hall, 60) && Array.isArray(tile.items))
                        .map(tile => ({
                            hall: tile.hall,
                            date: str(tile.date, 10) ? tile.date : '',
                            start: Number.isFinite(tile.start) ? tile.start : null,
                            items: tile.items
                                .slice(0, 30)
                                .filter(item => item && str(item.name, 160) && KINDS.includes(item.kind) && Number.isFinite(item.qty) && (item.from === '' || str(item.from, 60)))
                                .map(item => ({ name: item.name, qty: item.qty, kind: item.kind, from: item.from, at: Number.isFinite(item.at) ? item.at : null }))
                        }))
                        .filter(tile => tile.items.length);
                    const nextLinks = (Array.isArray(request.tileLinks) ? request.tileLinks : [])
                        .slice(0, 120)
                        .filter(item => item && str(item.from, 200) && str(item.to, 60) && KINDS.includes(item.kind))
                        .map(item => ({ from: item.from, to: item.to, kind: item.kind }));

                    if (JSON.stringify([nextTiles, nextLinks]) !== JSON.stringify([tomorrowTiles, tileLinks])) {
                        tomorrowTiles = nextTiles;
                        tileLinks = nextLinks;
                        marksChanged = true;
                    }
                }

                if (marksChanged) processCards();

                /* Принудительная отправка — только если страница просит «полные» данные
                 * (первый запрос после загрузки/возврата на вкладку) или что-то изменилось;
                 * иначе обычная отправка с дедупликацией. */
                send(request.full === true || settingsChanged || marksChanged);
            }
        });
    }

    /* =========================================================
     * ЧАСТЬ 2. ИНТЕРФЕЙС КАЛЬКУЛЯТОРА (основное окно)
     * ========================================================= */
    function startMainUI() {
        if (window !== window.top) return;
        if (location.origin !== MAIN_ORIGIN) return;
        if (!/^\/marketplace\/app\/129\/?/.test(location.pathname)) return;
        if (window.__studio1826MainUIV3) return;

        window.__studio1826MainUIV3 = true;
        trackErrors();

        let records = [];
        let category = 'C';
        let categorySource = 'default'; // branch | halls | default
        let selectedDate = '';
        let healthNote = ''; // сообщение о проблеме (например, разные версии скрипта)
        let admins = 2;
        let rateEnabled = false;
        let rateValue = DEFAULT_RATE;
        let coffeeEnabled = true;
        let lightSetupEnabled = true;
        let collapsed = true;
        let cardsMissing = false;
        let toastTimer = null;
        let toastFadeTimer = null;
        let closeDayDialog = () => {};
        let activateTab = () => {};
        let fillSettingsControls = () => {};

        /*
         * Данные дней из CRM (5.0.0). Кэш по дате (по Москве); запрос не чаще раза в минуту,
         * один запрос на дату одновременно. Ошибка сохраняется в записи, прежние данные
         * при ошибке не выдаются за актуальные (интерфейс помечает их устаревшими).
         */
        /* 5.4.0: «вмешательство скрипта» в календаре можно скрыть тумблером возле кнопки «Выплата». */
        let scriptOff = false; // читается из studio1826.v4.ui в create(): UI_KEY объявлен ниже

        function setScriptOff(value) {
            scriptOff = !!value;
            writeUi({ off: scriptOff });
            document.querySelectorAll('.s26-off-toggle').forEach(button => {
                button.setAttribute('aria-pressed', String(!scriptOff));
                button.title = scriptOff ? 'Скрипт скрыт в календаре — нажмите, чтобы показать' : 'Скрыть всё, что скрипт рисует в календаре';
            });
            requestData(true);
        }

        const DAY_TTL_MS = 60000;
        const DAY_STALE_MS = 5 * 60000;
        const dayStore = new Map();
        let eqDay = 'tomorrow';
        let activeTab = 'overview';
        let renderEquipment = () => {};
        let eqRenderedCategory = null;
        const refreshOverviewLine = () => {
            if (document.getElementById(WIDGET_ID)) update();
        };

        /* 5.5.0: «сегодня/завтра» считаются от дня, открытого в календаре (27 → завтра = 28). */
        const baseDayIso = () => calendarDayIso(selectedDate);
        const dayIso = which => (which === 'tomorrow' ? shiftDay(baseDayIso(), 1) : baseDayIso());
        const isRealToday = () => baseDayIso() === moscowDay(0);
        const dayLabel = iso => iso.slice(8, 10) + '.' + iso.slice(5, 7);
        const clockOf = time => new Intl.DateTimeFormat('ru-RU', {
            timeZone: MOSCOW_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).format(new Date(time));

        function notifyDays() {
            renderEquipment();
            refreshOverviewLine();
        }

        function loadDay(iso, force = false) {
            const current = dayStore.get(iso);

            if (current && current.promise) return current.promise;

            if (!force && current && current.fetchedAt && !current.error && Date.now() - current.fetchedAt < DAY_TTL_MS) {
                return Promise.resolve(current);
            }

            const entry = current || {};

            entry.loading = true;
            dayStore.set(iso, entry);

            entry.promise = fetchDayRecords(iso)
                .then(result => {
                    Object.assign(entry, result, { fetchedAt: Date.now(), error: null });
                })
                .catch(error => {
                    entry.error = String((error && error.message) || error).slice(0, 160);
                })
                .finally(() => {
                    entry.loading = false;
                    entry.promise = null;
                    notifyDays();
                })
                .then(() => entry);

            notifyDays();

            return entry.promise;
        }
        let markKeys = [];
        let moveLinks = [];
        let markSignature = '';

        const recordsSignature = list =>
            list.map(record => `${record.hall}|${record.start}|${record.end}`).join(';');

        /*
         * 5.4.0: число админов запоминается отдельно по филиалу. По умолчанию Серпуховская — 3,
         * Павелецкая — 2 (больше двух там не бывает). Прежнее общее значение переносится только на Павелецкую.
         */
        const adminsBy = { C: 3, P: 2 };

        /* Сохранение настроек между перезагрузками. */
        function loadSettings() {
            try {
                const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');

                if ([1, 2, 3].includes(saved.adminsC)) adminsBy.C = saved.adminsC;
                if ([1, 2].includes(saved.adminsP)) adminsBy.P = saved.adminsP;
                else if ([1, 2].includes(saved.admins)) adminsBy.P = saved.admins;
                admins = adminsBy[category] || 3;
                if (typeof saved.rateEnabled === 'boolean') rateEnabled = saved.rateEnabled;
                if (Number.isFinite(saved.rateValue)) rateValue = Math.max(0, saved.rateValue);
                if (typeof saved.coffeeEnabled === 'boolean') coffeeEnabled = saved.coffeeEnabled;
                if (typeof saved.lightSetupEnabled === 'boolean') {
                    lightSetupEnabled = saved.lightSetupEnabled;
                }
            } catch (_) {}
        }

        function saveSettings() {
            try {
                localStorage.setItem(STORE_KEY, JSON.stringify({
                    admins,
                    adminsC: adminsBy.C,
                    adminsP: adminsBy.P,
                    rateEnabled,
                    rateValue,
                    coffeeEnabled,
                    lightSetupEnabled
                }));
            } catch (_) {}
        }

        loadSettings();

        let features = loadFeatures();

        function setCategory(value, source) {
            category = value;
            categorySource = source;
            admins = adminsBy[value] || admins;
        }

        /* Филиал по суффиксам залов в карточках: запасной способ. */
        function inferCategoryFromRecords() {
            const found = new Set();

            records.forEach(record => {
                const value = categoryFromHall(record.hall);

                if (value) found.add(value);
            });

            return found.size === 1 ? [...found][0] : null;
        }

        function normalizeAdmins() {
            if (category === 'P' && admins > 2) admins = 2;
            if (![1, 2, 3].includes(admins)) admins = category === 'P' ? 2 : 3;
        }

        function syncAdminButtons(root) {
            root.querySelectorAll('[data-admin]').forEach(button => {
                const value = Number(button.dataset.admin);
                const unavailable = category === 'P' && value === 3;

                button.hidden = unavailable;
                button.disabled = unavailable;
                button.setAttribute('aria-pressed', String(value === admins));
            });
        }

        /* Единый расчёт: все суммы (и виджет, и копирование) берутся отсюда.
         * Сама арифметика — в чистой функции computePayout() (вынесена для
         * модульного тестирования, см. tests/). */
        function compute() {
            return computePayout(records, {
                category, admins, rateEnabled, rateValue,
                coffeeEnabled, lightSetupEnabled
            });
        }

        function copySummary() {
            const s = compute();

            const components = [
                ...s.servicesPer.map(service => ({
                    value: service.perAdmin,
                    label: service.short
                })),
                { value: s.hoursBonus, label: 'Ч' },
                { value: s.equipmentPer, label: 'О' },
                { value: s.coffeePer, label: 'К' }
            ];

            const bonuses = components.reduce((sum, c) => sum + c.value, 0);

            const breakdown = components
                .filter(c => Math.abs(c.value) > 0.000001)
                .map(c => `${formatAmount(c.value)}${c.label}`)
                .join('+');

            const bonusText = breakdown
                ? `${formatAmount(bonuses)} (${breakdown})`
                : formatAmount(bonuses);

            const dayMonth = readSelectedDate(document) || selectedDate || moscowDate({ day: '2-digit', month: '2-digit' });
            const categoryLabel = category === 'P' ? 'П' : 'С';

            return `${dayMonth} | ${categoryLabel} | ${formatAmount(s.rate)} + ${bonusText} | ИТОГО ${formatAmount(s.rate + bonuses)}₽`;
        }

        async function copyText(text) {
            if (navigator.clipboard?.writeText) {
                try {
                    await navigator.clipboard.writeText(text);
                    return true;
                } catch (_) {}
            }

            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';

            document.body.appendChild(textarea);
            textarea.select();

            try {
                return document.execCommand('copy');
            } catch (_) {
                return false;
            } finally {
                textarea.remove();
            }
        }

        function showCopyToast(text, success, note = '') {
            const toast = document.getElementById(TOAST_ID);

            if (!toast) return;

            clearTimeout(toastTimer);
            clearTimeout(toastFadeTimer);

            toast.textContent = success
                ? `Скопировано:\n${text}${note ? `\n\n${note}` : ''}`
                : (note || 'Не удалось скопировать отчёт.');

            toast.classList.remove('visible', 'fade-out');
            toast.style.display = 'block';

            requestAnimationFrame(() => toast.classList.add('visible'));

            toastTimer = setTimeout(() => {
                toast.classList.add('fade-out');

                toastFadeTimer = setTimeout(() => {
                    toast.classList.remove('visible', 'fade-out');
                    toast.style.display = 'none';
                }, 450);
            }, 4500);
        }

        function injectStyle() {
            if (document.getElementById(STYLE_ID)) return;

            const node = document.createElement('style');
            node.id = STYLE_ID;

            node.textContent = [
                STYLES.widget,
                STYLES.settings,
                STYLES.actions,
                STYLES.dayDialog,
                STYLES.skin,
                STYLES.native,
                STYLES.v5,
                STYLES.toast
            ].join('\n');

            document.head.appendChild(node);
        }

        /* Закрыть все наши окна поверх страницы (когда открыта бронь или боковая панель). */
        function closeOverlays() {
            const root = document.getElementById(WIDGET_ID);

            if (root) setCollapsed(root, true);

            closeDayDialog();
            activateTab('overview');
        }

        /*
         * Боковая панель Bitrix (#a11y-slider-container .side-panel) — это
         * открытая карточка брони: наши окна поверх неё закрываем.
         */
        const SIDE_PANEL_SELECTOR = '#a11y-slider-container .side-panel.side-panel-container';
        let sidePanelWasOpen = false;

        function sidePanelOpen() {
            const node = document.querySelector(SIDE_PANEL_SELECTOR);

            return !!node && node.getClientRects().length > 0;
        }

        /* Окно чата Bitrix (мессенджер поверх страницы). */
        const CHAT_SELECTORS = [
            '.bx-im-messenger__slider',
            '.bx-im-content-chat__container',
            '.bx-im-messenger__layout',
            '.bx-im-messenger__content',
            '.bx-messenger-box',
            '.bx-im-popup',
            '.bx-im-chat-opener__container'
        ].join(',');

        function chatOpen() {
            return [...document.querySelectorAll(CHAT_SELECTORS)].some(node => {
                if (node.closest('#bx-im-external-recent-list')) return false;

                const rect = node.getBoundingClientRect();

                return rect.width > 120 && rect.height > 120;
            });
        }

        /* Пока открыта бронь или чат — наши кнопки и окна полностью скрыты. */
        function updateOverlayVisibility() {
            const hide = cardsMissing || sidePanelOpen() || chatOpen();

            document.documentElement.classList.toggle('s26-overlay-open', hide);
        }

        /* Окно под кнопкой в шапке: правый край — по кнопке, высота — до низа экрана. */
        function positionPopup(root) {
            const chip = document.getElementById(CHIP_ID);

            if (!chip) return;

            const rect = chip.getBoundingClientRect();
            const top = Math.round(rect.bottom + 8);

            root.style.left = 'auto';
            root.style.bottom = 'auto';
            root.style.transform = 'none';
            root.style.top = top + 'px';
            root.style.right = Math.max(12, Math.round(window.innerWidth - rect.right)) + 'px';
            root.style.maxHeight = `calc(100vh - ${top + 12}px)`;
        }

        function resetWidgetPosition(root) {
            if (root.dataset.mode === 'header') {
                positionPopup(root);
                return;
            }

            root.style.maxHeight = '';
            root.style.left = '20px';
            root.style.right = 'auto';
            root.style.top = 'auto';
            root.style.bottom = '20px';
            root.style.transform = 'none';
        }

        let lastPayoutText = '';

        /*
         * Кнопка в шапке Bitrix24 (#header.air-header). Позиционируется абсолютно в свободной части
         * шапки и не участвует в раскладке меню Bitrix (его расчёт ширины и «Еще» не меняется).
         * Цвета берутся у соседних пунктов меню. Нет шапки или кнопка налезает на меню — режим
         * «float» (плавающая плашка, как до 4.7.0). Вызывается при создании, при смене размера
         * окна и из редкого таймера: Bitrix может перерисовать шапку.
         */
        function setMode(root, mode) {
            if (root.dataset.mode === mode) return;

            root.dataset.mode = mode;
            resetWidgetPosition(root);
        }

        function ensureChip(root) {
            const header = document.querySelector('#header.air-header');
            let slot = document.getElementById(CHIP_SLOT_ID);

            if (!header) {
                if (slot) slot.remove();
                setMode(root, 'float');
                return;
            }

            if (!slot) {
                const button = el('button', {
                    id: CHIP_ID,
                    type: 'button',
                    className: 'air-header-button',
                    'aria-haspopup': 'dialog',
                    'aria-expanded': String(!collapsed),
                    title: 'Выплаты администраторов'
                }, [
                    el('span', { className: 'air-header-button__text' }, [
                        'Выплата ',
                        el('span', { className: 's-chip-sum' }, [lastPayoutText || '—'])
                    ])
                ]);

                button.addEventListener('click', () => setCollapsed(root, !collapsed));

                const offToggle = el('button', {
                    type: 'button',
                    className: 's26-off-toggle',
                    role: 'switch',
                    'aria-pressed': String(!scriptOff),
                    'aria-label': 'Показывать скрипт в календаре'
                }, [el('span', { className: 's26-knob' })]);

                offToggle.addEventListener('click', () => setScriptOff(!scriptOff));
                slot = el('div', { id: CHIP_SLOT_ID, className: 'air-header__button', 'data-id': 'studio1826' }, [button, offToggle]);
            }

            if (slot.parentElement !== header) header.appendChild(slot);

            /* Пока окна скрыты (бронь, чат, перезагрузка календаря), кнопку не измерить — режим не трогаем. */
            if (document.documentElement.classList.contains('s26-overlay-open')) return;

            /* Свободное место — между последним пунктом меню и ближайшим занятым блоком справа
             * (поиск, «Пригласить», «Мой тариф» и т.п. показываются не всегда; справа остаётся поле под аватар).
             * Слот абсолютный, раскладку шапки и расчёт пункта «Еще» не меняет. Не помещается — плавающая плашка. */
            const items = [...header.querySelectorAll('#air-header-menu .main-buttons-item')];

            slot.hidden = false;

            const headerRect = header.getBoundingClientRect();
            const menuRight = Math.max(0, ...items.map(item => item.getBoundingClientRect().right));
            const rightBlockers = [...header.querySelectorAll('.air-header__personal-info > *')]
                .map(node => node.getBoundingClientRect())
                .filter(rect => rect.width > 0 && rect.height > 0 && rect.left >= menuRight);
            const limit = Math.min(headerRect.right - 152, ...rightBlockers.map(rect => rect.left));
            const start = menuRight + 16;
            const width = slot.getBoundingClientRect().width;
            const fits = items.length > 0 && width > 0 && start + width + 8 <= limit;

            slot.style.left = Math.round(start - headerRect.left) + 'px';
            slot.hidden = !fits;
            setMode(root, fits ? 'header' : 'float');
            if (fits && !collapsed) positionPopup(root);
        }
        /* В свёрнутом виде в заголовке видна сумма выплаты. */
        function refreshHeadTitle(root, payout) {
            if (typeof payout === 'number') lastPayoutText = money(payout);

            const title = root.querySelector('#s-head-title');

            if (title) title.textContent = collapsed && lastPayoutText ? `STUDIO 1826 · ${lastPayoutText}` : 'STUDIO 1826';

            const chipSum = document.querySelector(`#${CHIP_ID} .s-chip-sum`);

            if (chipSum) chipSum.textContent = lastPayoutText || '—';
        }

        function setCollapsed(root, value) {
            collapsed = value;
            refreshHeadTitle(root);
            root.classList.toggle('collapsed', collapsed);

            const chip = document.getElementById(CHIP_ID);

            if (chip) chip.setAttribute('aria-expanded', String(!collapsed));

            if (!collapsed) loadDay(dayIso(eqDay));

            const button = root.querySelector('.s-collapse');

            if (button) {
                button.textContent = collapsed ? '☰' : '−';
                button.title = collapsed ? 'Развернуть' : 'Свернуть';
            }

            resetWidgetPosition(root);
        }

        /*
         * Вкладка «Настройки» (4.2.0: раньше — отдельное всплывающее окно
         * по шестерёнке, теперь — содержимое вкладки внутри единой панели).
         * Строится в контейнер #s-panel-settings, который уже существует
         * в DOM к моменту вызова (создан в create()).
         */
        function setupSettings(root) {
            const panel = document.getElementById(SETTINGS_ID);

            /*
             * Группа настроек как сворачиваемый <details>: не меняет ни
             * одного data-атрибута контролов (вся логика ниже опирается на
             * querySelectorAll('[data-feature]') и т.п., а не на структуру
             * DOM), только группирует визуально. open=true держит группу
             * развёрнутой по умолчанию — для часто используемых функций;
             * цветовые группы (трогаются редко) свёрнуты по умолчанию.
             */
            function group(title, count, rows, { open = true } = {}) {
                const details = el('details', { className: 'st-group' });

                if (open) details.open = true;

                details.appendChild(el('summary', {}, [
                    title,
                    el('span', { className: 'st-group-count' }, [String(count)])
                ]));

                const body = el('div', { className: 'st-group-body' }, rows);

                details.appendChild(body);
                panel.appendChild(details);

                return details;
            }

            const FEATURE_LABELS = {
                compactCards: 'Компактные карточки',
                reuse: 'Не разбирать (куда и откуда)',
                fonHighlight: '«Фон» красным в окне',
                copyButton: 'Кнопка копирования в брони',
                hoverFocus: 'Выделять бронь при наведении',
                borders: 'Обводка броней с фоном/оборудованием',
                handoff: 'Полоска «Пересменки»',
                aliases: 'Подписи оборудования (бум, роллер…)',
                arrows: 'Стрелки переноса оборудования',
                moveArrows: '«Завтра» в календаре: плашки и стрелки',
                stripes: 'Завершённые брони — диагональные полоски'
            };

            const featureCheck = key => el('label', { className: 'st-check' }, [
                el('input', { type: 'checkbox', 'data-feature': key }),
                el('span', {}, [FEATURE_LABELS[key]])
            ]);

            /* Карточки брони: визуальное отображение и подсветка. */
            const CARD_DISPLAY_KEYS = [
                'compactCards', 'fonHighlight', 'copyButton',
                'hoverFocus', 'borders', 'handoff', 'stripes'
            ];

            /* Перенос оборудования между бронями: связанная группа функций. */
            const REUSE_KEYS = ['reuse', 'aliases', 'arrows', 'moveArrows'];

            group('Оформление панели', 1, [
                el('div', { className: 's-switch', role: 'group', 'aria-label': 'Оформление панели' }, [
                    el('button', { type: 'button', 'data-skin-choice': 'light' }, ['Светлое']),
                    el('button', { type: 'button', 'data-skin-choice': 'dark' }, ['Тёмное'])
                ])
            ]);

            panel.querySelectorAll('[data-skin-choice]').forEach(button => {
                button.addEventListener('click', () => {
                    writeUi({ skin: applySkin(root, button.dataset.skinChoice), skinV: 2 });
                });
            });
            applySkin(root, root.dataset.skin);

            group('Карточки брони', CARD_DISPLAY_KEYS.length,
                CARD_DISPLAY_KEYS.map(featureCheck));

            group('Перенос оборудования', REUSE_KEYS.length,
                REUSE_KEYS.map(featureCheck));

            group('Интерфейс Bitrix24', 2, [
                el('label', { className: 'st-check' }, [
                    el('input', { type: 'checkbox', 'data-theme-hide': '1' }),
                    el('span', {}, ['Скрывать лишнее (Маркет, Copilot, футер…)'])
                ]),
                el('label', { className: 'st-color' }, [
                    el('span', {}, ['Основной цвет']),
                    el('input', { type: 'color', 'data-theme-color': '1' })
                ]),
                el('div', { className: 'st-hex-row' }, [
                    el('input', {
                        type: 'text',
                        className: 'st-hex',
                        maxlength: '7',
                        spellcheck: 'false',
                        placeholder: '#8F263F',
                        'aria-label': 'HEX-код основного цвета'
                    }),
                    el('button', { type: 'button', className: 'st-theme-reset' }, ['Сбросить'])
                ]),
                el('div', { className: 'st-note' }, [
                    'Цвет и скрытие применяются сразу и сохраняются. ',
                    'Цвета, заданные в компонентах Bitrix напрямую, могут не измениться.'
                ])
            ]);

            group('Цвета стадий', STAGES.length,
                STAGES.map(stage => el('label', { className: 'st-color' }, [
                    el('span', {}, [stage.name]),
                    el('input', { type: 'color', 'data-stage': stage.id })
                ])),
                { open: false });

            group('Цвета меток', MARK_COLORS.length,
                MARK_COLORS.map(mark => el('label', { className: 'st-color' }, [
                    el('span', {}, [mark.name]),
                    el('input', { type: 'color', 'data-stage': mark.id })
                ])),
                { open: false });

            group('Резервная копия', 2, [
                el('div', { className: 'st-note' }, ['Перенос настроек на другой компьютер: скопируйте текст и вставьте его там.']),
                el('div', { className: 'st-actions' }, [
                    el('button', { type: 'button', className: 'st-export' }, ['Скопировать настройки'])
                ]),
                el('textarea', { className: 'st-import', spellcheck: 'false', placeholder: 'Вставьте скопированные настройки' }),
                el('div', { className: 'st-actions' }, [
                    el('button', { type: 'button', className: 'st-apply' }, ['Применить'])
                ]),
                el('div', { className: 'st-note st-import-status', 'aria-live': 'polite' })
            ], { open: false });

            panel.appendChild(el('div', { className: 'st-actions' }, [
                el('button', { type: 'button', className: 'st-save' }, ['Сохранить']),
                el('button', { type: 'button', className: 'st-reset' }, ['Сбросить цвета'])
            ]));

            panel.appendChild(el('div', { className: 'st-note' }, [
                'Переключатели действуют сразу. Цвета применяются после «Сохранить».',
                ' «Сбросить цвета» возвращает исходные цвета Bitrix сразу.'
            ]));

            let draft = { ...features.colors };

            const themeHide = panel.querySelector('[data-theme-hide]');
            const themeColor = panel.querySelector('[data-theme-color]');
            const themeHex = panel.querySelector('.st-hex');

            function syncTheme() {
                themeHide.checked = THEME.getHide();
                themeColor.value = THEME.getColor();

                if (document.activeElement !== themeHex) {
                    themeHex.value = THEME.getColor().toUpperCase();
                }
            }

            THEME.subscribe(syncTheme);

            function fillControls() {
                syncTheme();

                panel.querySelectorAll('[data-feature]').forEach(input => {
                    input.checked = !!features[input.dataset.feature];
                });

                panel.querySelectorAll('[data-stage]').forEach(input => {
                    input.value = draft[input.dataset.stage];
                });
            }

            /* 4.2.0: настройки — вкладка, а не всплывающее окно, поэтому
             * «место» и «закрытие» ей не нужны. Контролы синхронизируются
             * с сохранённым состоянием каждый раз при переходе на вкладку
             * (см. activateTab() в create()), а не по клику шестерёнки. */
            fillSettingsControls = () => {
                draft = { ...features.colors };
                fillControls();
            };

            panel.querySelectorAll('[data-feature]').forEach(input => {
                input.addEventListener('change', () => {
                    features = sanitizeFeatures({
                        ...features,
                        [input.dataset.feature]: input.checked
                    });

                    saveFeatures(features);
                    requestData();
                });
            });

            themeHide.addEventListener('change', () => THEME.setHide(themeHide.checked));

            themeColor.addEventListener('input', () => THEME.setColor(themeColor.value));

            themeHex.addEventListener('input', () => {
                const value = themeHex.value.trim();

                if (THEME.isValid(value)) THEME.setColor(value);
            });

            themeHex.addEventListener('blur', syncTheme);

            panel.querySelector('.st-theme-reset').addEventListener('click', () => {
                THEME.setColor(THEME.DEFAULT_COLOR);
            });

            panel.querySelectorAll('[data-stage]').forEach(input => {
                input.addEventListener('input', () => {
                    draft[input.dataset.stage] = input.value;
                });
            });

            const saveButton = panel.querySelector('.st-save');

            saveButton.addEventListener('click', () => {
                features = sanitizeFeatures({ ...features, colors: draft });
                draft = { ...features.colors };

                saveFeatures(features);
                requestData();

                saveButton.textContent = 'Сохранено ✓';
                setTimeout(() => { saveButton.textContent = 'Сохранить'; }, 1200);
            });

            const importStatus = panel.querySelector('.st-import-status');

            panel.querySelector('.st-export').addEventListener('click', async () => {
                const ok = await copyText(exportSettings(features));

                importStatus.textContent = ok ? 'Настройки скопированы.' : 'Не удалось скопировать.';
            });

            panel.querySelector('.st-apply').addEventListener('click', () => {
                const imported = parseSettingsImport(panel.querySelector('.st-import').value);

                if (!imported) {
                    importStatus.textContent = 'Не похоже на настройки Studio 1826.';
                    return;
                }

                features = imported;
                saveFeatures(features);
                fillSettingsControls();
                requestData();

                panel.querySelector('.st-import').value = '';
                importStatus.textContent = 'Настройки применены.';
            });

            panel.querySelector('.st-reset').addEventListener('click', () => {
                draft = Object.fromEntries(COLOR_ITEMS.map(item => [item.id, item.color]));

                features = sanitizeFeatures({ ...features, colors: draft });

                saveFeatures(features);
                fillControls();
                requestData();
            });
        }

        /*
         * Действия дня во вкладке «Обзор» (4.2.0: раньше — отдельная
         * плавающая панель справа от плашки): список оборудования за день
         * и окно «не разбирать на завтра». Кнопки-дублёры переключателей
         * стрелок удалены — они дублировали чекбоксы в «Настройки».
         */
        function setupDayTools(root) {
            const bar = root.querySelector('#s-actions');

            bar.appendChild(el('button', {
                type: 'button',
                className: 'da-btn da-copy',
                title: 'Копировать список оборудования за день. Звёздочкой отмечено то, что нужно первой брони зала.'
            }, ['Скопировать оборудование за день']));

            bar.appendChild(el('button', {
                type: 'button',
                className: 'da-btn da-plan',
                title: 'Посчитать, что не нужно разбирать на завтра'
            }, ['Не разбирать на завтра…']));

            const dialog = document.createElement('div');
            dialog.id = DAY_DIALOG_ID;
            dialog.hidden = true;

            dialog.appendChild(el('div', { className: 'dd-head' }, [
                el('span', {}, ['Что не разбирать на завтра']),
                el('button', { type: 'button', className: 'dd-close', 'aria-label': 'Закрыть' }, ['✕'])
            ]));

            dialog.appendChild(el('div', { className: 'dd-cols' }, [
                el('div', { className: 'dd-col dd-col-in' }, [
                    el('div', { className: 'dd-label' }, ['Список за завтра (подставляется из Bitrix24, можно править)']),
                    el('textarea', {
                        className: 'dd-input',
                        spellcheck: 'false',
                        placeholder: 'Зал 75\nAputure 600d Pro *\nManfrotto 272b'
                    }),
                    el('div', { className: 'dd-source s-muted', 'aria-live': 'polite' }),
                    el('div', { className: 'dd-actions' }, [
                        el('button', { type: 'button', className: 'dd-run' }, ['Посчитать']),
                        el('button', { type: 'button', className: 'dd-load', title: 'Заново взять завтрашние брони из Bitrix24' }, ['Из Bitrix24']),
                        el('button', { type: 'button', className: 'dd-clear' }, ['Снять обводку'])
                    ])
                ]),
                el('div', { className: 'dd-col' }, [
                    el('div', { className: 'dd-label-row' }, [
                        el('div', { className: 'dd-label' }, ['Результат']),
                        el('button', {
                            type: 'button',
                            className: 'dd-copy',
                            disabled: 'disabled',
                            title: 'Скопировать результат текстом, чтобы отправить в чат'
                        }, ['Копировать'])
                    ]),
                    el('div', { className: 'dd-result' }, [
                        el('div', { className: 'dd-empty' }, ['Откройте на странице сегодняшний день: завтрашний список подставится из Bitrix24 сам. Затем нажмите «Посчитать».'])
                    ])
                ])
            ]));

            document.body.appendChild(dialog);

            const result = dialog.querySelector('.dd-result');

            let dialogMoved = false;
            let lastSections = [];

            /* Подгонка окна под содержимое: добавляем колонки в результате, пока всё не влезет по высоте. */
            const FIT_INPUT_W = 250;
            const FIT_COL_W = 260;
            const FIT_GAP = 14;
            const FIT_CHROME = 68; /* поля окна + зазор между колонками + поля результата */

            function applyCols(n, avail) {
                result.style.columnCount = String(n);
                dialog.style.width = Math.min(
                    FIT_INPUT_W + FIT_CHROME + n * FIT_COL_W + (n - 1) * FIT_GAP,
                    avail
                ) + 'px';
            }

            function fitDialog() {
                if (dialog.hidden) return;

                const availW = window.innerWidth - 16;
                const availH = window.innerHeight - 16;
                const maxCols = Math.max(1, Math.floor(
                    (availW - FIT_INPUT_W - FIT_CHROME + FIT_GAP) / (FIT_COL_W + FIT_GAP)
                ));

                dialog.style.maxHeight = 'none';

                let cols = 1;

                for (; cols <= maxCols; cols++) {
                    applyCols(cols, availW);
                    if (dialog.scrollHeight <= availH) break;
                }

                if (cols > maxCols) applyCols(maxCols, availW);

                dialog.style.maxHeight = '';

                placeDialog();
            }

            function placeDialog() {
                /* Если окно перетащили, оставляем его там, где оно стоит. */
                if (dialogMoved) {
                    const rect = dialog.getBoundingClientRect();

                    dialog.style.left = Math.max(0, Math.min(rect.left, window.innerWidth - rect.width)) + 'px';
                    dialog.style.top = Math.max(0, Math.min(rect.top, window.innerHeight - rect.height)) + 'px';
                    return;
                }

                /* Якорь — сама панель: окно открывается рядом с ней, слева или справа. */
                const anchor = root.getBoundingClientRect();

                dialog.style.visibility = 'hidden';

                const width = dialog.offsetWidth;
                const height = dialog.offsetHeight;

                let left = anchor.right + 8;

                if (left + width > window.innerWidth - 8) left = anchor.left - 8 - width;

                left = Math.max(8, Math.min(left, window.innerWidth - width - 8));

                const top = Math.max(8, Math.min(anchor.bottom - height, window.innerHeight - height - 8));

                dialog.style.left = left + 'px';
                dialog.style.top = top + 'px';
                dialog.style.visibility = '';
            }

            closeDayDialog = () => { dialog.hidden = true; };

            document.addEventListener('keydown', event => {
                if (event.key === 'Escape' && !dialog.hidden) dialog.hidden = true;
            });

            /* Перетаскивание окна за заголовок. */
            const dialogHead = dialog.querySelector('.dd-head');
            let dialogDrag = null;

            dialogHead.addEventListener('pointerdown', event => {
                if (event.target.closest('button') || event.button !== 0) return;

                const rect = dialog.getBoundingClientRect();

                dialogDrag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
                dialog.style.left = rect.left + 'px';
                dialog.style.top = rect.top + 'px';

                try { dialogHead.setPointerCapture(event.pointerId); } catch (_) {}

                event.preventDefault();
            });

            dialogHead.addEventListener('pointermove', event => {
                if (!dialogDrag) return;

                const maxLeft = Math.max(0, window.innerWidth - dialog.offsetWidth);
                const maxTop = Math.max(0, window.innerHeight - dialog.offsetHeight);

                dialog.style.left = Math.max(0, Math.min(maxLeft, dialogDrag.left + event.clientX - dialogDrag.x)) + 'px';
                dialog.style.top = Math.max(0, Math.min(maxTop, dialogDrag.top + event.clientY - dialogDrag.y)) + 'px';
                dialogMoved = true;
            });

            const stopDialogDrag = () => { dialogDrag = null; };

            dialogHead.addEventListener('pointerup', stopDialogDrag);
            dialogHead.addEventListener('pointercancel', stopDialogDrag);
            dialogHead.addEventListener('lostpointercapture', stopDialogDrag);

            /* Кнопка 1: копирование списка оборудования за день. */
            bar.querySelector('.da-copy').addEventListener('click', async () => {
                const day = buildDayList(records);

                if (!day.text) {
                    showCopyToast('', false, 'Оборудование за день не найдено: на странице нет броней с оборудованием.');
                    return;
                }

                const ok = await copyText(day.text);
                const notes = [];

                if (day.unknownHalls.length) {
                    notes.push(
                        `Время начала определено не у всех броней в залах: ${day.unknownHalls.join(', ')}. ` +
                        'Звёздочки там не поставлены.'
                    );
                }

                showCopyToast(day.text, ok, notes.join('\n'));
            });

            /*
             * Завтрашний список берётся из Bitrix24 (5.0.0): подставляется в поле и сразу считается.
             * Текст, введённый вручную, не затирается, пока не нажата «Из Bitrix24». При сбое —
             * понятное сообщение и прежний путь: вставить список, скопированный на завтрашнем дне.
             */
            const dialogInput = dialog.querySelector('.dd-input');
            const dialogSource = dialog.querySelector('.dd-source');

            dialogInput.addEventListener('input', () => { dialogInput.dataset.auto = ''; });

            async function fillTomorrow(force) {
                const iso = dayIso('tomorrow');

                dialogSource.textContent = `Загружаю брони на ${dayLabel(iso)} из Bitrix24…`;

                const entry = await loadDay(iso, force);

                if (!entry || !entry.records) {
                    dialogSource.textContent = `Не удалось загрузить завтра из Bitrix24 (${(entry && entry.error) || 'нет данных'}). Вставьте список вручную.`;
                    return;
                }

                if (dialogInput.value.trim() && dialogInput.dataset.auto !== '1' && !force) {
                    dialogSource.textContent = 'В поле ваш текст, из Bitrix24 он не заменён. Нажмите «Из Bitrix24», чтобы заменить.';
                    return;
                }

                const day = buildDayList(recordsOfCategory(entry.records, category));

                dialogInput.value = day.text;
                dialogInput.dataset.auto = '1';
                dialogSource.textContent = day.text
                    ? `Завтра (${dayLabel(iso)}) из Bitrix24 в ${clockOf(entry.fetchedAt)}, можно править.`
                    : `На ${dayLabel(iso)} в Bitrix24 нет броней с оборудованием.`;

                if (day.text) dialog.querySelector('.dd-run').click();
            }

            dialog.querySelector('.dd-load').addEventListener('click', () => { fillTomorrow(true); });

            /* Кнопка 2: окно «не разбирать на завтра». */
            bar.querySelector('.da-plan').addEventListener('click', () => {
                if (!dialog.hidden) {
                    dialog.hidden = true;
                    return;
                }

                dialog.hidden = false;
                fitDialog();
                fillTomorrow(false);
            });

            dialog.querySelector('.dd-close').addEventListener('click', () => {
                dialog.hidden = true;
            });

            document.addEventListener('keydown', event => {
                if (event.key === 'Escape' && !dialog.hidden) dialog.hidden = true;
            });

            function addNote(text, className) {
                const element = document.createElement('div');

                element.className = className;
                element.textContent = text;
                result.appendChild(element);
            }

            /* Раздел с группами: заголовок группы, подпись и строки «название — количество». */
            function addGroups(kind, title, groups) {
                if (!groups.length) return;

                lastSections.push({ title, groups });

                const section = document.createElement('div');
                section.className = `dd-section ${kind}`;

                const heading = document.createElement('div');
                heading.className = 'dd-section-title';
                heading.textContent = title;
                section.appendChild(heading);

                groups.forEach(group => {
                    const box = document.createElement('div');
                    box.className = 'dd-group';

                    const head = document.createElement('div');
                    head.className = 'dd-group-head';
                    head.textContent = group.head;
                    box.appendChild(head);

                    if (group.sub) {
                        const sub = document.createElement('div');
                        sub.className = 'dd-group-sub';
                        sub.textContent = group.sub;
                        box.appendChild(sub);
                    }

                    group.lines.forEach(({ name, qty, kind: lineKind }) => {
                        const line = document.createElement('div');
                        line.className = lineKind ? `dd-line ${lineKind}` : 'dd-line';

                        const nameNode = document.createElement('span');
                        nameNode.textContent = name;

                        const qtyNode = document.createElement('span');
                        qtyNode.className = 'dd-qty';
                        qtyNode.textContent = qtyText(qty);

                        line.append(nameNode, qtyNode);
                        box.appendChild(line);
                    });

                    section.appendChild(box);
                });

                result.appendChild(section);
            }

            /* Складывает одинаковое оборудование внутри группы. */
            function addLine(group, name, qty) {
                const existing = group.lines.find(line => line.name === name);

                if (existing) existing.qty += qty;
                else group.lines.push({ name, qty });
            }

            const byHallOrder = (a, b) =>
                hallNumber(a) - hallNumber(b) || a.localeCompare(b, 'ru');

            /*
             * 5.3.0: результат по залам завтрашнего утра — что сделать в каждом зале
             * (не разбирать, принести и откуда, собрать), а не три списка по типам действий.
             */
            function renderPlan(analysis, tomorrow) {
                result.replaceChildren();
                lastSections = [];

                const entry = dayStore.get(dayIso('tomorrow'));
                const plan = planTomorrowTiles(analysis, entry && entry.records ? recordsOfCategory(entry.records, category) : []);
                /* 5.4.0: три раздела, как раньше — Оставить / Перекатить / Собрать с нуля; внутри — по залам утра. */
                const SECTIONS = [
                    ['keep', 'Оставить — не разбирать в этом зале'],
                    ['move', 'Перекатить из другого зала'],
                    ['missing', 'Собрать с нуля']
                ];

                SECTIONS.forEach(([kind, title]) => {
                    const groups = plan.tiles
                        .map(tile => ({
                            head: Number.isFinite(tile.start) ? `${tile.hall} · завтра с ${formatClock(tile.start)}` : tile.hall,
                            sub: '',
                            lines: tile.items
                                .filter(item => item.kind === kind)
                                .map(item => {
                                    const after = Number.isFinite(item.after) ? ` (после ${formatClock(item.after)})` : '';

                                    if (kind === 'move') return { name: `${item.name} — из ${item.from}${after}`, qty: item.qty };
                                    if (kind === 'keep') return { name: `${item.name}${after}`, qty: item.qty };

                                    return { name: item.name, qty: item.qty };
                                })
                        }))
                        .filter(group => group.lines.length);

                    addGroups(kind, title, groups);
                });

                if (!analysis.needCount) {
                    addNote('В списке нет позиций со звёздочкой, поэтому сравнивать нечего.', 'dd-warn');
                } else if (!analysis.missing.length) {
                    addNote('Всё нужное к утру уже стоит в залах или переносится.', 'dd-empty');
                }

                if (analysis.markKeys.length) {
                    addNote(
                        `Последние брони залов (${analysis.markKeys.length}) обведены на странице.` +
                        (moveLinks.length ? ` Синие стрелки (${moveLinks.length}) показывают, в какой зал переносить.` : ''),
                        'dd-empty'
                    );
                } else {
                    addNote('Не удалось определить последние брони: нет времени окончания.', 'dd-warn');
                }

                if (analysis.incompleteHalls.length) {
                    addNote(
                        `Время окончания определено не у всех броней в залах: ${analysis.incompleteHalls.join(', ')}.`,
                        'dd-warn'
                    );
                }

                const unknown = tomorrow.reduce(
                    (sum, hall) => sum + hall.items.filter(item => !item.known).length,
                    0
                );

                if (unknown) {
                    addNote(`Позиций, которых нет в базе оборудования: ${unknown}. Они учтены по тексту.`, 'dd-warn');
                }
            }

            /* Текст результата для чата. */
            function planToText() {
                if (!lastSections.length) return '';

                const out = ['Не разбирать на завтра'];

                lastSections.forEach(section => {
                    out.push('', section.title.toUpperCase());

                    section.groups.forEach(group => {
                        out.push('', group.head);
                        if (group.sub) out.push(group.sub);
                        group.lines.forEach(({ name, qty }) => out.push(`• ${name} — ${qtyText(qty)}`));
                    });
                });

                return out.join('\n');
            }

            const copyButton = dialog.querySelector('.dd-copy');
            let copyTimer = 0;

            copyButton.addEventListener('click', async () => {
                const text = planToText();

                if (!text) return;

                const ok = await copyText(text);

                copyButton.textContent = ok ? 'Скопировано ✓' : 'Не удалось';
                clearTimeout(copyTimer);
                copyTimer = setTimeout(() => { copyButton.textContent = 'Копировать'; }, 1500);
            });

            /* При любом изменении результата подгоняем размер окна и обновляем кнопку копирования. */
            let fitQueued = false;

            new MutationObserver(() => {
                copyButton.disabled = !lastSections.length;

                if (fitQueued) return;

                fitQueued = true;

                queueMicrotask(() => {
                    fitQueued = false;
                    fitDialog();
                });
            }).observe(result, { childList: true });

            window.addEventListener('resize', fitDialog);

            dialog.querySelector('.dd-run').addEventListener('click', () => {
                const tomorrow = parseDayList(dialog.querySelector('.dd-input').value);

                result.replaceChildren();
                lastSections = [];

                if (!tomorrow.length) {
                    addNote('Не удалось распознать список. Нажмите «Из Bitrix24» или вставьте текст, скопированный на завтрашнем дне.', 'dd-warn');
                    return;
                }

                if (!records.length) {
                    addNote('На странице нет броней сегодняшнего дня.', 'dd-warn');
                    return;
                }

                const analysis = analyzeTomorrow(records, tomorrow);

                markKeys = analysis.markKeys;
                markSignature = recordsSignature(records);

                /* Переносы между залами для синих стрелок (по одной на пару «бронь → зал»). */
                const links = new Map();

                analysis.move.forEach(({ need, from }) => {
                    if (from.label === need.hall) return;

                    const fromKey = `${from.record.hall}|${from.record.start}`;

                    links.set(`${fromKey}→${need.hall}`, { from: fromKey, to: need.hall });
                });

                moveLinks = [...links.values()];

                renderPlan(analysis, tomorrow);
                requestData();
            });

            dialog.querySelector('.dd-clear').addEventListener('click', () => {
                markKeys = [];
                moveLinks = [];
                markSignature = '';

                requestData();
            });
        }

        /* Вкладка «Оборудование»: итоги дня по залам и по студии, раскрытие броней-источников. */
        function buildEquipmentPanel() {
            const panel = el('div', { id: 's-panel-equipment', className: 's-section eq-section' });
            const switcher = el('div', { className: 'eq-days', role: 'group', 'aria-label': 'День' }, [
                el('button', { type: 'button', 'data-eq-day': 'today' }, ['Сегодня']),
                el('button', { type: 'button', 'data-eq-day': 'tomorrow' }, ['Завтра'])
            ]);
            const status = el('div', { className: 's-muted eq-status', 'aria-live': 'polite' });
            const body = el('div', { className: 'eq-body' });
            const copyButton = el('button', { type: 'button', className: 's-textbtn eq-copy' }, ['Скопировать']);
            const refreshButton = el('button', { type: 'button', className: 's-textbtn eq-refresh' }, ['Обновить']);

            /* 5.4.0: раздел сворачивается (по умолчанию свёрнут, состояние запоминается) — окно не растёт в длину. */
            const toggle = el('button', { type: 'button', className: 'eq-toggle', 'aria-expanded': 'false' }, [
                el('span', { className: 'eq-title' }, ['Оборудование']),
                el('span', { className: 'eq-count' })
            ]);
            const foot = el('div', { className: 'eq-foot' }, [status, el('span', { className: 'eq-actions' }, [copyButton, refreshButton])]);

            panel.append(el('div', { className: 'eq-head' }, [toggle, switcher]), body, foot);

            const setOpen = open => {
                panel.dataset.open = open ? '1' : '0';
                toggle.setAttribute('aria-expanded', String(open));
            };

            setOpen(readUi().eqOpen === true);

            toggle.addEventListener('click', () => {
                const open = panel.dataset.open !== '1';

                setOpen(open);
                writeUi({ eqOpen: open });
            });

            const rangeText = source => (Number.isFinite(source.start) && Number.isFinite(source.end))
                ? `${formatClock(source.start)}–${formatClock(source.end)}`
                : 'время не указано';

            let lastText = '';

            renderEquipment = () => {
                switcher.querySelectorAll('[data-eq-day]').forEach(button => {
                    button.setAttribute('aria-pressed', String(button.dataset.eqDay === eqDay));
                    button.textContent = isRealToday()
                        ? (button.dataset.eqDay === 'today' ? 'Сегодня' : 'Завтра')
                        : dayLabel(dayIso(button.dataset.eqDay));
                });

                const iso = dayIso(eqDay);
                const entry = dayStore.get(iso);
                const branchName = category === 'P' ? 'Павелецкая' : 'Серпуховская';

                const openKeys = new Set([...body.querySelectorAll('details[open]')].map(node => node.getAttribute('data-key')));
                const countNode = toggle.querySelector('.eq-count');

                countNode.textContent = '';

                eqRenderedCategory = category;
                body.replaceChildren();
                status.classList.remove('eq-warn');
                lastText = '';
                copyButton.disabled = true;

                if (!entry || (entry.loading && !entry.records)) {
                    status.textContent = `Загружаю брони на ${dayLabel(iso)} из Bitrix24…`;
                    return;
                }

                if (!entry.records) {
                    status.classList.add('eq-warn');
                    status.textContent = `Не удалось получить данные Bitrix24: ${entry.error || 'нет ответа'}. Нажмите «Обновить».`;
                    return;
                }

                const stale = !!entry.error || Date.now() - entry.fetchedAt > DAY_STALE_MS;
                const filtered = recordsOfCategory(entry.records, category);
                const summary = summarizeEquipment(filtered);
                const parts = [`${dayLabel(iso)}`, `обновлено ${clockOf(entry.fetchedAt)}`];

                if (entry.loading) parts.push('обновляю…');

                status.textContent = parts.join(' · ');
                status.title = [
                    `${branchName}: броней ${filtered.length}`,
                    entry.excluded ? `отменённых не учтено ${entry.excluded} (все филиалы)` : '',
                    entry.withoutHall ? `броней без зала ${entry.withoutHall}` : ''
                ].filter(Boolean).join('\n');

                if (stale) {
                    status.classList.add('eq-warn');
                    status.textContent += entry.error
                        ? ` · последнее обновление не удалось (${entry.error}), данные могли устареть`
                        : ' · данные могли устареть, нажмите «Обновить»';
                }

                if (!summary.halls.length) {
                    countNode.textContent = 'нет';
                    body.appendChild(el('div', { className: 's-muted eq-empty' }, [`На ${dayLabel(iso)} оборудование не заказано.`]));
                    renderIssues(filtered, entry, openKeys);
                    return;
                }

                lastText = summary.text;
                copyButton.disabled = false;
                countNode.textContent = `${summary.totals.length} поз.`;

                /* 5.3.0: на завтра сначала — что сделать к утру в каждом зале (то же, что плашки в календаре). */
                const morning = eqDay === 'tomorrow' ? computeTomorrowPlan() : { tiles: [] };

                morning.tiles = morning.tiles
                    .map(tile => ({ ...tile, items: tile.items.filter(item => item.kind !== 'later') }))
                    .filter(tile => tile.items.length);

                if (morning.tiles.length) {
                    const box = el('div', { className: 'eq-morning' }, [el('div', { className: 'eq-morning-title' }, ['К утру'])]);

                    morning.tiles.forEach(tile => {
                        const group = el('div', { className: 'eq-group' }, [
                            el('div', { className: 'eq-hall' }, [Number.isFinite(tile.start) ? `${tile.hall} · ${formatClock(tile.start)}` : tile.hall])
                        ]);

                        tile.items.forEach(item => {
                            const qty = item.qty > 1 ? ` ×${formatQuantity(item.qty)}` : '';
                            const text = item.kind === 'keep'
                                ? `✓ Оставить: ${item.name}${qty}`
                                : item.kind === 'move'
                                    ? `↻ Перекатить: ${item.name}${qty} из ${item.from}${Number.isFinite(item.after) ? ' после ' + formatClock(item.after) : ''}`
                                    : item.kind === 'missing'
                                        ? `+ Собрать с нуля: ${item.name}${qty}`
                                        : `к ${Number.isFinite(item.at) ? formatClock(item.at) : 'днём'}: ${item.name}${qty}`;

                            group.appendChild(el('div', { className: `eq-m ${item.kind}` }, [text]));
                        });

                        box.appendChild(group);
                    });

                    body.appendChild(box);
                    body.appendChild(el('div', { className: 'eq-morning-title eq-all-title' }, ['Всё оборудование на день']));
                }

                summary.halls.forEach(hall => {
                    const group = el('div', { className: 'eq-group' }, [el('div', { className: 'eq-hall' }, [hall.label])]);

                    body.appendChild(group);

                    hall.items.forEach(item => {
                        const line = `${item.name}${item.star ? ' *' : ''}`;
                        const details = el('details', { className: 'eq-item', 'data-key': `${hall.label}|${item.name}` }, [
                            el('summary', {}, [
                                el('span', {}, [line]),
                                el('span', { className: 'eq-qty' }, [formatQuantity(item.qty)])
                            ])
                        ]);

                        if (openKeys.has(`${hall.label}|${item.name}`)) details.open = true;

                        item.sources.forEach(source => {
                            const row = el('div', { className: 'eq-src' }, [
                                `${rangeText(source)} · ${qtyText(source.qty)} · `
                            ]);

                            if (source.id) {
                                const link = el('a', {
                                    href: `/crm/deal/details/${encodeURIComponent(source.id)}/`,
                                    target: '_blank',
                                    rel: 'noopener'
                                }, [`бронь ${source.id}`]);

                                row.appendChild(link);
                            }

                            details.appendChild(row);
                        });

                        group.appendChild(details);
                    });
                });

                /* Итог по студии нужен, только когда залов больше одного. */
                if (summary.halls.length > 1) {
                    const totals = el('details', { className: 'eq-totals', 'data-key': '__totals' }, [
                        el('summary', {}, [`Всего по студии: ${summary.totals.length} поз.`])
                    ]);

                    if (openKeys.has('__totals')) totals.open = true;

                    summary.totals.forEach(total => {
                        totals.appendChild(el('div', { className: 'eq-total' }, [
                            el('span', {}, [total.halls > 1 ? `${total.name} · залов ${total.halls}` : total.name]),
                            el('span', { className: 'eq-qty' }, [formatQuantity(total.qty)])
                        ]));
                    });

                    body.appendChild(totals);
                }

                if (summary.starCount) {
                    body.appendChild(el('div', { className: 's-muted eq-note' }, ['* к началу первой брони зала']));
                }

                renderIssues(filtered, entry, openKeys);
            };

            /* Замечания по данным: повторы позиций в брони и брони без зала (ссылки на сделки для проверки). */
            function renderIssues(records, entry, openKeys) {
                const duplicates = findDuplicateRows(records);
                const count = duplicates.length + (entry.withoutHall ? 1 : 0);

                if (!count) return;

                const box = el('details', { className: 'eq-issues', 'data-key': '__issues' }, [
                    el('summary', {}, [`Замечания: ${count}`])
                ]);

                if (openKeys.has('__issues')) box.open = true;

                duplicates.forEach(issue => {
                    const row = el('div', { className: 'eq-issue' }, [
                        `${hallLabel(issue.hall) || 'зал?'}${Number.isFinite(issue.start) ? ' ' + formatClock(issue.start) : ''}: повтор — ${issue.names.join(', ')} · `
                    ]);

                    if (issue.id) {
                        row.appendChild(el('a', {
                            href: `/crm/deal/details/${encodeURIComponent(issue.id)}/`,
                            target: '_blank',
                            rel: 'noopener'
                        }, [`бронь ${issue.id}`]));
                    }

                    box.appendChild(row);
                });

                if (entry.withoutHall) {
                    box.appendChild(el('div', { className: 'eq-issue' }, [
                        `Броней без зала в товарах: ${entry.withoutHall} (все филиалы) — в расчёт не попали.`
                    ]));
                }

                body.appendChild(box);
            }

            switcher.querySelectorAll('[data-eq-day]').forEach(button => {
                button.addEventListener('click', () => {
                    eqDay = button.dataset.eqDay === 'today' ? 'today' : 'tomorrow';
                    renderEquipment();
                    loadDay(dayIso(eqDay));
                });
            });

            refreshButton.addEventListener('click', () => loadDay(dayIso(eqDay), true));

            copyButton.addEventListener('click', async () => {
                if (!lastText) return;

                const ok = await copyText(lastText);

                showCopyToast(lastText, ok);
            });

            return panel;
        }

        /*
         * 5.1.0: настройки в две колонки — слева заголовки разделов, справа содержимое одного раздела;
         * выбор другого раздела заменяет показанный. Сами контролы и их обработчики не меняются.
         * «Сохранить / Сбросить цвета» и пояснение показываются только у разделов с цветами.
         */
        function layoutSettings(panel) {
            const groups = [...panel.children].filter(node => node.matches('details.st-group'));
            const rest = [...panel.children].filter(node => !groups.includes(node));
            const nav = el('div', { className: 'st-nav', role: 'tablist', 'aria-label': 'Разделы настроек' });
            const content = el('div', { className: 'st-content' });

            groups.forEach((group, index) => {
                const summary = group.querySelector('summary');
                const title = summary && summary.firstChild ? summary.firstChild.textContent : `Раздел ${index + 1}`;

                group.open = true;
                nav.appendChild(el('button', { type: 'button', role: 'tab', className: 'st-nav-item', 'data-group': String(index) }, [title]));
                content.appendChild(group);
            });

            rest.forEach(node => content.appendChild(node));
            panel.replaceChildren(nav, content);

            const show = index => {
                const target = Math.min(groups.length - 1, Math.max(0, index));
                const hasColors = !!groups[target] && !!groups[target].querySelector('[data-stage]');

                groups.forEach((group, i) => { group.hidden = i !== target; });
                rest.forEach(node => { node.hidden = !hasColors; });
                nav.querySelectorAll('.st-nav-item').forEach((button, i) => {
                    button.setAttribute('aria-selected', String(i === target));
                });
            };

            nav.addEventListener('click', event => {
                const button = event.target.closest('.st-nav-item');

                if (!button) return;

                const index = Number(button.dataset.group);

                show(index);
                writeUi({ settingsGroup: index });
            });

            /* Раздел нельзя свернуть кликом по заголовку — заголовки теперь слева. */
            groups.forEach(group => group.addEventListener('toggle', () => { if (!group.open) group.open = true; }));

            show(Number(readUi().settingsGroup) || 0);
        }

        /* Состояние интерфейса (вкладка, оформление) — один ключ, поля не затирают друг друга. */
        const UI_KEY = 'studio1826.v4.ui';
        const SKINS = ['light', 'dark'];
        const DEFAULT_SKIN = 'light';

        function readUi() {
            try {
                const saved = JSON.parse(localStorage.getItem(UI_KEY) || 'null');

                return saved && typeof saved === 'object' ? saved : {};
            } catch (_) {
                return {};
            }
        }

        function writeUi(patch) {
            try { localStorage.setItem(UI_KEY, JSON.stringify({ ...readUi(), ...patch })); } catch (_) {}
        }

        function applySkin(root, skin) {
            const value = SKINS.includes(skin) ? skin : DEFAULT_SKIN;

            root.dataset.skin = value;
            [DAY_DIALOG_ID, TOAST_ID].forEach(id => {
                const node = document.getElementById(id);

                if (node) node.dataset.skin = value;
            });
            root.querySelectorAll('[data-skin-choice]').forEach(button => {
                button.setAttribute('aria-pressed', String(button.dataset.skinChoice === value));
            });

            return value;
        }

        function create() {
            injectStyle();

            const existing = document.getElementById(WIDGET_ID);
            if (existing) return existing;

            const root = document.createElement('div');
            root.id = WIDGET_ID;
            /* 5.1.0: новый вид — светлый; прежний выбор оформления (до 5.1) сброшен один раз. */
            const savedUi = readUi();

            scriptOff = savedUi.off === true;

            root.dataset.skin = savedUi.skinV === 2 && SKINS.includes(savedUi.skin) ? savedUi.skin : DEFAULT_SKIN;

            root.appendChild(el('div', { className: 's-head' }, [
                el('span', { id: 's-head-title' }, ['STUDIO 1826']),
                el('span', { className: 's-head-buttons' }, [
                    el('button', {
                        type: 'button',
                        className: 's26-off-toggle s-head-toggle',
                        role: 'switch',
                        'aria-pressed': String(!scriptOff),
                        'aria-label': 'Показывать скрипт в календаре'
                    }, [el('span', { className: 's26-knob' })]),
                    el('button', { type: 'button', className: 's-icon s-head-copy', title: 'Копировать расчёт', 'aria-label': 'Копировать расчёт' }, ['⧉']),
                    el('button', { type: 'button', className: 's-icon s-collapse', title: 'Развернуть' }, ['☰'])
                ])
            ]));

            /*
             * 5.1.0: вместо четырёх вкладок — одна страница («Главная»: выплата, оборудование, действия)
             * и отдельный экран «Настройки». Элементы с прежними id сохранены: update() и обработчики
             * работают с ними как раньше. Имена прежних вкладок принимаются для совместимости.
             */
            const VIEWS = ['home', 'settings'];
            const viewOf = name => (name === 'settings' ? 'settings' : 'home');

            const overview = el('div', { id: 's-panel-overview', className: 's-section' }, [
                el('div', { id: 's-branch-status', className: 's-overview-status' }, ['Загрузка данных…'])
            ]);
            const actions = el('div', { id: 's-actions', className: 's-overview-actions' });
            const debugRow = el('div', { className: 's-debug' }, [
                el('button', {
                    type: 'button',
                    className: 's-debug-button',
                    title: 'Собрать технический отчёт (без имён клиентов и текстов броней): скопируется и скачается файлом'
                }, ['Диагностика']),
                el('span', { id: 's-debug-status', className: 's-muted', 'aria-live': 'polite' }),
                el('button', { type: 'button', className: 's-open-settings', title: 'Настройки' }, ['⚙ Настройки'])
            ]);

            /* Выплаты — подробный расчёт и параметры (раньше — главный экран). */
            const payoutPanel = el('div', { id: 's-panel-payout', className: 's-fold-body' }, [
                el('div', { className: 's-title' }, ['Бонусы · на одного']),
                el('label', { className: 's-check' }, [
                    el('input', { id: 's3-light-on', type: 'checkbox' }),
                    el('span', {}, ['Схема света'])
                ]),
                el('div', { id: 's3-services' }),
                el('div', { className: 's-row' }, [
                    el('span', { id: 's3-hours-label' }, ['Бонус часов (С)']),
                    el('span', { id: 's3-hours' }, ['0 ₽'])
                ]),
                el('div', { id: 's3-hours-note', className: 's-muted' }, ['Учтено: 0 ч']),
                el('div', { className: 's-row' }, [
                    el('span', {}, ['10% от оборудования']),
                    el('span', { id: 's3-equipment' }, ['0 ₽'])
                ]),
                el('div', { id: 's3-coffee-area' }, [
                    el('label', { className: 's-check' }, [
                        el('input', { id: 's3-coffee-on', type: 'checkbox' }),
                        el('span', {}, ['Процент с кофе'])
                    ]),
                    el('div', { className: 's-row' }, [
                        el('span', {}, ['Процент с кофе']),
                        el('span', { id: 's3-coffee' }, ['0 ₽'])
                    ])
                ]),
                el('div', { className: 's-divider' }),
                el('div', { className: 's-bottom-controls' }, [
                    el('div', { className: 's-title' }, ['Количество администраторов']),
                    el('div', { className: 's-switch', 'aria-label': 'Администраторы' }, [
                        el('button', { type: 'button', 'data-admin': '3' }, ['3 админа']),
                        el('button', { type: 'button', 'data-admin': '2' }, ['2 админа']),
                        el('button', { type: 'button', 'data-admin': '1' }, ['1 админ'])
                    ]),
                    el('div', { className: 's-rate-controls' }, [
                        el('label', { className: 's-check s-rate-toggle', title: 'Учитывать ставку' }, [
                            el('input', { id: 's3-rate-on', type: 'checkbox', 'aria-label': 'Учитывать ставку' }),
                            el('span', {}, ['Ставка'])
                        ]),
                        el('input', {
                            id: 's3-rate',
                            className: 's-input',
                            type: 'number',
                            min: '0',
                            step: '100',
                            'aria-label': 'Размер ставки',
                            title: 'Размер ставки'
                        })
                    ])
                ])
            ]);

            /* Настройки — отдельный экран; содержимое строит setupSettings(). */
            const settingsPanel = el('div', { id: SETTINGS_ID, className: 's-panel' });

            /* Итог выплаты виден на любой вкладке. */
            const summary = el('div', { className: 's-summary' }, [
                el('div', { className: 's-summary-main' }, [
                    el('div', { id: 's3-summary-label', className: 's-muted' }, ['К выплате на одного']),
                    el('div', { id: 's3-payout', className: 's-payout' }, ['0 ₽']),
                    el('div', { id: 's3-rate-note', className: 's-muted' }, ['Ставка не учитывается'])
                ]),
                el('button', { type: 'button', className: 's-copy-button', title: 'Копировать расчёт' }, ['Копировать'])
            ]);

            const equipmentPanel = buildEquipmentPanel();
            const payoutFold = el('details', { className: 's-fold' }, [
                el('summary', {}, ['Параметры расчёта']),
                payoutPanel
            ]);
            const homeView = el('div', { className: 's-view s-view-home' }, [
                summary, payoutFold, overview, equipmentPanel, actions, debugRow
            ]);
            const settingsView = el('div', { className: 's-view s-view-settings', hidden: 'hidden' }, [
                el('button', { type: 'button', className: 's-back' }, ['← Назад']),
                settingsPanel
            ]);

            root.appendChild(el('div', { className: 's-body' }, [homeView, settingsView]));

            root.appendChild(el('div', { className: 's-footer' }, [
                el('span', { className: 's-version' }, [
                    `v ${VERSION} · `,
                    el('span', { className: 's-credit' }, ['by ILYA ZINOVIEV'])
                ])
            ]));

            activateTab = name => {
                const target = viewOf(name);

                homeView.hidden = target !== 'home';
                settingsView.hidden = target !== 'settings';
                root.dataset.view = target;
                activeTab = target;

                if (target === 'settings') fillSettingsControls();
                else {
                    renderEquipment();
                    loadDay(dayIso(eqDay));
                }

                if (root.dataset.mode === 'header' && !collapsed) positionPopup(root);
            };

            const chooseTab = name => {
                activateTab(name);
                writeUi({ tab: name });
            };

            debugRow.querySelector('.s-open-settings').addEventListener('click', () => chooseTab('settings'));
            settingsView.querySelector('.s-back').addEventListener('click', () => chooseTab('home'));


            root.querySelector('#s3-light-on').checked = lightSetupEnabled;
            root.querySelector('#s3-coffee-on').checked = coffeeEnabled;
            root.querySelector('#s3-rate-on').checked = rateEnabled;
            root.querySelector('#s3-rate').value = rateValue;

            root.classList.add('collapsed');
            resetWidgetPosition(root);

            document.body.appendChild(root);
            ensureChip(root);

            /* Окно-«попап» под кнопкой: закрывается кликом снаружи и Esc. Диалог дня — часть панели. */
            document.addEventListener('pointerdown', event => {
                if (root.dataset.mode !== 'header' || collapsed) return;
                if (root.contains(event.target) || event.target.closest(`#${CHIP_ID}, #${DAY_DIALOG_ID}`)) return;

                setCollapsed(root, true);
            }, true);

            document.addEventListener('keydown', event => {
                if (event.key !== 'Escape' || root.dataset.mode !== 'header' || collapsed) return;

                setCollapsed(root, true);
                document.getElementById(CHIP_ID)?.focus();
            });

            window.addEventListener('resize', () => ensureChip(root));

            /* Автообновление данных дня: только пока окно открыто и вкладка браузера видна. */
            setInterval(() => {
                if (collapsed || document.hidden) return;

                loadDay(dayIso(eqDay));
            }, 120000);

            /* 5.0.1: клик в календаре (iframe) окно не закрывает — с ним работают, переключая дни. */

            const toast = document.createElement('div');
            toast.id = TOAST_ID;
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            document.body.appendChild(toast);

            root.querySelectorAll('[data-admin]').forEach(button => {
                button.addEventListener('click', () => {
                    const requested = Number(button.dataset.admin);

                    if (![1, 2, 3].includes(requested)) return;
                    if (category === 'P' && requested === 3) return;

                    admins = requested;
                    adminsBy[category] = requested;
                    saveSettings();
                    update();
                });
            });

            setupSettings(root);
            layoutSettings(settingsPanel);
            setupDayTools(root);
            applySkin(root, root.dataset.skin);

            activateTab(readUi().tab);

            root.querySelector('#s3-rate').addEventListener('input', event => {
                rateValue = parseNumber(event.target.value);
                saveSettings();
                update();
            });

            root.querySelector('#s3-rate-on').addEventListener('change', event => {
                rateEnabled = event.target.checked;
                saveSettings();
                update();
            });

            root.querySelector('#s3-coffee-on').addEventListener('change', event => {
                coffeeEnabled = event.target.checked;
                saveSettings();
                update();
            });

            root.querySelector('#s3-light-on').addEventListener('change', event => {
                lightSetupEnabled = event.target.checked;
                saveSettings();
                update();
            });

            root.querySelector('.s-head-toggle').addEventListener('click', () => setScriptOff(!scriptOff));
            setScriptOff(scriptOff);

            root.querySelector('.s-collapse').addEventListener('click', () => {
                setCollapsed(root, !collapsed);
            });

            const debugButton = root.querySelector('.s-debug-button');
            const debugStatus = root.querySelector('#s-debug-status');

            debugButton.addEventListener('click', async () => {
                debugButton.disabled = true;
                debugStatus.textContent = 'Собираю…';

                const result = await runDiagnostics();

                debugButton.disabled = false;
                debugStatus.textContent = (result.copied || result.saved
                    ? `Готово: ${result.copied ? 'скопировано' : ''}${result.copied && result.saved ? ', ' : ''}${result.saved ? 'файл studio1826-debug.json' : ''}.`
                    : 'Не удалось сохранить отчёт.') +
                    (result.answered ? '' : ' Календарь не ответил.');
            });

            root.querySelectorAll('.s-copy-button, .s-head-copy').forEach(button => {
                button.addEventListener('click', async () => {
                    const text = copySummary();
                    const ok = await copyText(text);
                    showCopyToast(text, ok);
                });
            });

            /* Перетаскивание */
            const header = root.querySelector('.s-head');
            let drag = null;

            header.addEventListener('pointerdown', event => {
                if (root.dataset.mode === 'header') return;
                if (event.target.closest('button') || event.button !== 0) return;

                const rect = root.getBoundingClientRect();

                drag = {
                    x: event.clientX,
                    y: event.clientY,
                    left: rect.left,
                    top: rect.top
                };

                root.style.left = rect.left + 'px';
                root.style.top = rect.top + 'px';
                root.style.right = 'auto';
                root.style.bottom = 'auto';
                root.style.transform = 'none';

                try { header.setPointerCapture(event.pointerId); } catch (_) {}

                event.preventDefault();
            });

            header.addEventListener('pointermove', event => {
                if (!drag) return;

                const rect = root.getBoundingClientRect();
                const maxLeft = Math.max(0, window.innerWidth - rect.width);
                const maxTop = Math.max(0, window.innerHeight - rect.height);

                root.style.left = Math.max(0, Math.min(maxLeft, drag.left + event.clientX - drag.x)) + 'px';
                root.style.top = Math.max(0, Math.min(maxTop, drag.top + event.clientY - drag.y)) + 'px';
            });

            const stopDragging = () => { drag = null; };

            header.addEventListener('pointerup', stopDragging);
            header.addEventListener('pointercancel', stopDragging);
            header.addEventListener('lostpointercapture', stopDragging);

            /* Окно не должно уезжать за экран при изменении размера. */
            window.addEventListener('resize', () => {
                if (!root.style.left || root.style.left === 'auto') return;

                const rect = root.getBoundingClientRect();
                const left = Math.max(0, Math.min(rect.left, window.innerWidth - rect.width));
                const top = Math.max(0, Math.min(rect.top, window.innerHeight - rect.height));

                if (root.style.top !== 'auto') {
                    root.style.left = left + 'px';
                    root.style.top = top + 'px';
                }
            });

            update();

            return root;
        }

        function update() {
            const root = document.getElementById(WIDGET_ID);
            if (!root) return;

            const detected = getCategoryFromBranch(document);

            if (detected === 'C' || detected === 'P') {
                setCategory(detected, 'branch');
            } else if (categorySource === 'default') {
                /* aria-атрибуты недоступны или дали ничью (score=0 у обоих
                 * пунктов) — пробуем определить филиал по суффиксам залов
                 * в уже загруженных записях, чтобы не оставаться на 'C'
                 * по умолчанию при работе с Павелецкой. */
                const inferred = inferCategoryFromRecords();
                if (inferred) setCategory(inferred, 'halls');
            }

            normalizeAdmins();
            syncAdminButtons(root);

            const s = compute();

            const servicesContainer = root.querySelector('#s3-services');
            servicesContainer.replaceChildren();
            s.servicesPer.forEach(service => {
                servicesContainer.appendChild(el('div', { className: 's-row' }, [
                    el('span', {}, [`${service.name}${service.excluded ? ' · исключена' : ''}`]),
                    el('span', {}, [money(service.perAdmin)])
                ]));
            });

            root.querySelector('#s3-hours-label').textContent = HOURS_BONUSES[category].name;
            root.querySelector('#s3-hours').textContent = money(s.hoursBonus);

            const sourceNote =
                categorySource === 'default' ? ' · филиал не определён, принята Серпуховская' :
                categorySource === 'halls' ? ' · филиал определён по залам' : '';

            root.querySelector('#s3-hours-note').textContent = `Учтено: ${s.hours} ч${sourceNote}`;
            root.querySelector('#s3-equipment').textContent = money(s.equipmentPer);
            root.querySelector('#s3-coffee-area').style.display = category === 'P' ? '' : 'none';
            root.querySelector('#s3-coffee').textContent = money(s.coffeePer);
            root.querySelector('#s3-payout').textContent = money(s.payout);

            root.querySelector('#s3-rate-note').textContent = rateEnabled
                ? `Ставка ${money(s.rate)} добавлена каждому без деления`
                : 'Ставка не учитывается';

            root.querySelector('#s3-summary-label').textContent = `К выплате на одного · ${admins} ${admins === 1 ? 'админ' : 'админа'}`;

            const branchName = category === 'P' ? 'Павелецкая' : 'Серпуховская';
            const status = root.querySelector('#s-branch-status');

            if (eqRenderedCategory !== null && eqRenderedCategory !== category) renderEquipment();

            const lines = [
                el('div', {}, [
                    el('strong', {}, [branchName]),
                    categorySource === 'default' ? ' (по умолчанию)' : '',
                    selectedDate ? ` · ${selectedDate}` : '',
                    ` · броней ${records.length} · ${s.hours} ч`
                ])
            ];

            if (healthNote) {
                lines.push(el('div', { className: 's-overview-warn' }, [healthNote]));
            } else if (records.length === 0) {
                lines.push(el('div', { className: 's-muted' }, ['Откройте день с бронями — данные появятся автоматически.']));
            }

            status.replaceChildren(...lines);
            refreshHeadTitle(root, s.payout);
        }

        /* Приём данных от iframe */
        let pendingDiag = null;

        window.addEventListener('message', event => {
            if (event.origin !== APP_ORIGIN) return;

            if (event.data && event.data.type === DIAG_TYPE && event.data.source === 'studio1826-collector') {
                if (pendingDiag) {
                    let size = 0;

                    try { size = JSON.stringify(event.data.diag).length; } catch (_) {}

                    if (size > 0 && size <= MAX_DIAG_SIZE) pendingDiag.push(event.data.diag);
                }

                return;
            }

            /*
             * 5.0.1: данные принимаем только от iframe самой страницы (календарь). Приложение встроено и
             * в карточку сделки (слайдер Bitrix) — тот экземпляр сборщика шлёт пустой список, из-за чего
             * панель пряталась и после закрытия брони не возвращалась.
             */
            const fromPageFrame = [...document.querySelectorAll('iframe')].some(frame => frame.contentWindow === event.source);

            if (!fromPageFrame) return;

            const validated = validateCollectorPayload(event.data, VERSION);

            if (!validated) return;

            if (validated.versionMismatch) {
                console.warn(`[studio1826] postMessage version mismatch: iframe=${validated.version}, main=${VERSION}`);
                healthNote = `Версия скрипта в календаре (${String(validated.version).slice(0, 20)}) не совпадает с версией страницы (${VERSION}). Обновите страницу.`;
                update();
                return;
            }

            const nextRecords = validated.records;

            healthNote = '';

            if (nextRecords.length === 0 && records.length > 0) {
                if (!cardsMissing) {
                    cardsMissing = true;

                    /* Бронь открыта: наши кнопки и окна прячем, вернутся после выхода. */
                    updateOverlayVisibility();
                }

                return;
            }

            if (nextRecords.length > 0 && cardsMissing) {
                cardsMissing = false;
                updateOverlayVisibility();
            }

            records = nextRecords;

            /* Другой день или правка броней: старая обводка больше не актуальна. */
            if (markKeys.length && recordsSignature(nextRecords) !== markSignature) {
                markKeys = [];
                moveLinks = [];
                requestData();
            }

            if (typeof event.data.selectedDate === 'string' && event.data.selectedDate && event.data.selectedDate.length <= 40) {
                if (selectedDate !== event.data.selectedDate) {
                    selectedDate = event.data.selectedDate;
                    loadDay(dayIso('tomorrow'));
                    renderEquipment();
                }
            }

            if (event.data.category === 'C' || event.data.category === 'P') {
                setCategory(event.data.category, 'branch');
            } else {
                const inferred = inferCategoryFromRecords();

                if (inferred) setCategory(inferred, 'halls');
            }

            normalizeAdmins();
            update();
        });

        create();

        function downloadText(name, text) {
            try {
                const blob = new Blob([text], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');

                link.href = url;
                link.download = name;
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);

                return true;
            } catch (_) {
                return false;
            }
        }

        /*
         * Отчёт для отладки: состояние страницы + ответ сборщика из iframe.
         * Не содержит имён клиентов, комментариев и текстов броней, ставку тоже не включает.
         */
        async function runDiagnostics() {
            pendingDiag = [];

            document.querySelectorAll('iframe').forEach(frame => {
                try {
                    frame.contentWindow?.postMessage(encodeRequest({ type: REQUEST_TYPE, diag: true }), APP_ORIGIN);
                } catch (_) {}
            });

            await new Promise(resolve => setTimeout(resolve, 2500));

            const collectorReports = pendingDiag;
            pendingDiag = null;

            const report = {
                generatedAt: new Date().toISOString(),
                version: VERSION,
                userAgent: navigator.userAgent,
                viewport: { width: window.innerWidth, height: window.innerHeight },
                main: {
                    runtime: 'main',
                    url: location.origin + location.pathname,
                    category,
                    categorySource,
                    admins,
                    recordsCount: records.length,
                    selectedDate,
                    healthNote,
                    collapsed,
                    iframes: [...document.querySelectorAll('iframe')].slice(0, 10).map(frame => {
                        try {
                            const url = new URL(frame.src, location.href);

                            return url.origin + url.pathname;
                        } catch (_) {
                            return '';
                        }
                    }),
                    branchDetected: getCategoryFromBranch(document),
                    errors: ERROR_LOG.slice()
                },
                collector: collectorReports.length ? collectorReports : 'нет ответа от календаря (iframe не отвечает или версии скриптов разные)'
            };

            const text = JSON.stringify(report, null, 2);
            const copied = await copyText(text);
            const saved = downloadText('studio1826-debug.json', text);

            return { copied, saved, answered: collectorReports.length > 0 };
        }

        /*
         * 5.3.0: план «на утро» для календаря. Считается сам, когда календарь показывает сегодняшний день
         * и завтрашние брони уже загружены из Bitrix24; в другие дни плашек нет.
         */
        function computeTomorrowPlan() {
            const entry = dayStore.get(dayIso('tomorrow'));
            if (!features.moveArrows || !entry || !entry.records || !records.length) {
                return { tiles: [], links: [] };
            }

            const tomorrowRecords = recordsOfCategory(entry.records, category);
            const analysis = analyzeTomorrow(records, parseDayList(buildDayList(tomorrowRecords).text));
            const plan = planTomorrowTiles(analysis, tomorrowRecords);
            const date = isRealToday() ? '' : dayLabel(dayIso('tomorrow'));

            plan.tiles.forEach(tile => { tile.date = date; });

            return plan;
        }

        function requestData(full = false) {
            if (document.hidden) return;

            const plan = computeTomorrowPlan();

            document.querySelectorAll('iframe').forEach(frame => {
                try {
                    frame.contentWindow?.postMessage(
                        encodeRequest({
                            type: REQUEST_TYPE,
                            settings: features,
                            mark: markKeys,
                            moves: moveLinks,
                            tiles: plan.tiles,
                            tileLinks: plan.links,
                            off: scriptOff,
                            full: full === true
                        }),
                        APP_ORIGIN
                    );
                } catch (_) {}
            });

            const detected = getCategoryFromBranch(document);

            if ((detected === 'C' || detected === 'P') && detected !== category) {
                setCategory(detected, 'branch');
                normalizeAdmins();
                update();
            }
        }

        requestData(true);

        /* Завтрашние брони нужны календарю и при закрытом окне: подгружаем раз в 5 минут. */
        loadDay(dayIso('tomorrow'));
        setInterval(() => {
            if (!document.hidden) loadDay(dayIso('tomorrow'));
        }, 300000);
        setInterval(() => requestData(records.length === 0 || cardsMissing), 3000);

        /* Р-6: при возврате на вкладку iframe мог работать со старыми
         * settings до следующего тика setInterval(3000). Немедленно
         * запрашиваем свежие данные. */
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) requestData(true);
        });

        /* Видимость окон: наблюдатель вместо опроса каждые 250 мс; редкий опрос — страховка. */
        let overlayTimer = null;

        new MutationObserver(mutations => {
            const widget = document.getElementById(WIDGET_ID);

            if (widget && mutations.every(m => widget.contains(m.target))) return;

            clearTimeout(overlayTimer);
            overlayTimer = setTimeout(updateOverlayVisibility, 120);
        }).observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style']
        });

        setInterval(() => {
            updateOverlayVisibility();

            const widget = document.getElementById(WIDGET_ID);

            if (widget) ensureChip(widget);
        }, 1500);
    }

    /* =========================================================
     * ТЕМА BITRIX24: основной цвет и скрытие лишних элементов.
     * Перенесено из отдельного скрипта «Interface & Theme 2.1.2».
     * Управление — в меню настроек (⚙). Ключи localStorage те же,
     * поэтому ранее выбранный цвет сохраняется.
     * ========================================================= */
    const THEME = (() => {
        const THEME_STYLE_ID = 'studio1826-custom-theme-style';
        const HIDE_CLASS = 'studio1826-hide-ui-enabled';
        const STORAGE_COLOR = 'studio1826-theme-primary-color';
        const STORAGE_HIDE = 'studio1826-hide-ui-state';
        const DEFAULT_COLOR = '#8f263f';

            // Элементы, скрываемые переключателем.
            // Уведомления и открытые линии не скрываем.
            const HIDE_SELECTORS = [
            '.bx-im-list-recent-compact__scroll-container',
                '#bx-im-external-recent-list > div.bx-im-messenger__scope.bx-im-list-recent-compact__container > div.bx-im-messenger__scope.bx-im-list-recent-compact__scroll-container.--hidden-scroll:last-child > div.bx-im-list-recent-compact__general_container',

                '#menu-items-block > div.menu-items-footer:last-child > div.menu-items-footer-inner > div.menu-license-all-wrapper:last-child > button.ui-btn.--air.menu-license-all-button.ui-btn-sm.--with-icon.--wide.--style-filled-boost.ui-btn-no-caps',

                'div.root.js-app:nth-child(7) > button.aiassistant-marta:nth-child(2) > div.aiassistant-marta__avatar-wrapper',

                '#chat-menu_market',

                '#pagetitle',

                '#air-footer > div.air-footer',

                'div.root.js-app:nth-child(6) > button.aiassistant-marta:nth-child(2) > div.aiassistant-marta__avatar-wrapper',

                '#bx-im-external-recent-list > div.bx-im-messenger__scope.bx-im-compact-navigation__container:first-child > div.bx-im-compact-navigation__items:first-child > div.bx-im-compact-navigation__icon.--ui-hoverable:nth-child(2) > div.ui-icon-set.--o-copilot.--hoverable-alt',

                '#header .air-header__personal-info .air-header__buttons',
                '#air-header-marta-slot',

                '#menu-items-block > div.menu-items-footer:last-child > div.menu-items-footer-inner > button.menu-item-block.menu-settings.--footer:nth-child(2) > span.menu-item-link'
            ];

            // Основные синие переменные Bitrix24.
            // Цвета ошибок, успеха, предупреждения и Copilot не включаем.
            const COLOR_VARIABLES = {
                '--ui-color-primary': '#2fc6f6',
                '--ui-color-accent-brand-blue': '#2fc6f6',
                '--ui-color-accent-main-primary': '#0075ff',
                '--ui-color-accent-main-primary-alt': '#1f86ff',
                '--ui-color-accent-main-primary-alt-2': '#58b1ff',
                '--ui-color-accent-main-link': '#0154c8',
                '--ui-color-accent-main-link-underline': '#0154c84d',
                '--ui-color-accent-light-blue': '#559be6',
                '--ui-color-accent-extra-darkblue': '#0091e3',
                '--ui-color-accent-soft-element-blue': '#0154c8',
                '--ui-color-accent-soft-border-blue': '#88c8f8',

                '--ui-color-design-filled-bg': '#0075ff',
                '--ui-color-design-filled-stroke': '#0075ff',
                '--ui-color-design-outline-a1-stroke': '#0075ff',
                '--ui-color-design-outline-a2-content': '#0075ff',
                '--ui-color-design-outline-a2-content-chevron': '#0075ff',
                '--ui-color-design-outline-a2-content-icon': '#0075ff',
                '--ui-color-design-outline-a2-focused-bg': '#edf7ff',
                '--ui-color-design-outline-a2-stroke': '#58b1ff',
                '--ui-color-design-outline-a2-stroke-alt': '#c4e6ff',
                '--ui-color-design-outline-content-icon-alt': '#0075ff',
                '--ui-color-design-outline-focused-stroke': '#0075ff',
                '--ui-color-design-plain-a-content': '#0075ff',
                '--ui-color-design-plain-a-content-chevron': '#0075ff',
                '--ui-color-design-plain-a-content-icon': '#0075ff',
                '--ui-color-design-selection-bg': '#edf7ff',
                '--ui-color-design-selection-content': '#0075ff',
                '--ui-color-design-selection-content-chevron': '#0075ff',
                '--ui-color-design-selection-content-icon': '#0075ff',
                '--ui-color-design-selection-content-icon-secondary': '#58b1ff',
                '--ui-color-design-selection-stroke': '#c4e6ff',
                '--ui-color-design-tinted-bg': '#e6f4ff',
                '--ui-color-design-tinted-bg-alt': '#e6f4ff',
                '--ui-color-design-tinted-content': '#0154c8',
                '--ui-color-design-tinted-content-alt': '#0091e3',
                '--ui-color-design-tinted-content-chevron': '#0154c8',
                '--ui-color-design-tinted-content-icon': '#0154c8',
                '--ui-color-design-tinted-content-icon-secondary': '#0154c880',
                '--ui-color-design-tinted-stroke': '#e6f4ff',
                '--ui-color-design-tinted-stroke-alt': '#c4e6ff',

                '--ui-color-focus-outline': '#4a9dff',
                '--ui-color-link-primary-base': '#2066b0',

                '--ui-color-g-content-blue-1': '#0154c8',
                '--ui-color-g-content-blue-2': '#0075ff',
                '--ui-color-g-content-blue-3': '#82c0ff',

                '--ui-color-palette-blue-10': '#f4fcfe',
                '--ui-color-palette-blue-15': '#ecfafe',
                '--ui-color-palette-blue-20': '#e5f9ff',
                '--ui-color-palette-blue-25': '#d3f4ff',
                '--ui-color-palette-blue-30': '#c3f0ff',
                '--ui-color-palette-blue-40': '#7fdefc',
                '--ui-color-palette-blue-50': '#2fc6f6',
                '--ui-color-palette-blue-60': '#11a9d9',
                '--ui-color-palette-blue-70': '#008dba',
                '--ui-color-palette-blue-80': '#00789e',
                '--ui-color-palette-blue-90': '#006484',
                '--ui-color-palette-blue-95': '#004f69',

                '--ui-color-blue-02': '#f9fcff',
                '--ui-color-blue-04': '#f8fbff',
                '--ui-color-blue-06': '#f7fbff',
                '--ui-color-blue-08': '#f5faff',
                '--ui-color-blue-09': '#f3f8ff',
                '--ui-color-blue-10': '#f3faff',
                '--ui-color-blue-15': '#f0f7ff',
                '--ui-color-blue-20': '#e7f4ff',
                '--ui-color-blue-25': '#deedff',
                '--ui-color-blue-30': '#c6e6ff',
                '--ui-color-blue-35': '#b7d7ff',
                '--ui-color-blue-40': '#a3cdff',
                '--ui-color-blue-50': '#71c0ff',
                '--ui-color-blue-55': '#58a4ff',
                '--ui-color-blue-57': '#4a9dff',
                '--ui-color-blue-60': '#3592ff',
                '--ui-color-blue-70': '#188ae6',
                '--ui-color-blue-80': '#0069e6',
                '--ui-color-blue-90': '#035ea8',
                '--ui-color-blue-95': '#004780',

                '--ui-color-accent-soft-blue-1': '#c4e6ff',
                '--ui-color-accent-soft-blue-2': '#e6f4ff',
                '--ui-color-accent-soft-blue-3': '#edf7ff',

                '--ui-color-bg-content-inapp': '#085dc1',

                '--ui-color-tag-1': '#bcedfc',
                '--ui-color-tag-2': '#00baf2',

                '--ui-counter-bg-color-primary': '#2fc6f6',
                '--ui-current-bar-bg-color': '#ccf2ff',
                '--ui-current-bar-color': '#2fc6f6',
                '--ui-current-round-color': '#2fc6f6',

                '--ui-field-color-focused': '#2fc6f6',
                '--ui-field-color-primary': '#66afe9',
                '--ui-field-color-link': '#0b66c3',

                '--ui-progressbar-bg-color-primary': '#2fc6f6',
                '--ui-progressbar-bg-track-color-primary': '#b0e8fa',
                '--ui-progressbar-color-primary': '#2fc6f6',
                '--ui-progressround-bg-track-color-primary': '#b0e8fa',
                '--ui-progressround-color-primary': '#2fc6f6',

                '--ui-typography-color-link': '#2066b0',
                '--ui-link-border-color': '#216bb6',
                '--ui-link-color': '#216bb6'
            };

            function validHex(value) {
                return typeof value === 'string' &&
                    /^#[0-9a-f]{6}$/i.test(value);
            }

            function hexToRgb(hex) {
                const n = parseInt(hex.slice(1), 16);

                return {
                    r: (n >> 16) & 255,
                    g: (n >> 8) & 255,
                    b: n & 255
                };
            }

            function rgbToHex(r, g, b) {
                return '#' + [r, g, b]
                    .map(value =>
                        Math.round(Math.max(0, Math.min(255, value)))
                            .toString(16)
                            .padStart(2, '0')
                    )
                    .join('');
            }

            function rgbToHsl(hex) {
                let { r, g, b } = hexToRgb(hex);

                r /= 255;
                g /= 255;
                b /= 255;

                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const delta = max - min;

                let h = 0;
                let s = 0;
                const l = (max + min) / 2;

                if (delta !== 0) {
                    s = delta / (1 - Math.abs(2 * l - 1));

                    if (max === r) {
                        h = 60 * (((g - b) / delta) % 6);
                    } else if (max === g) {
                        h = 60 * ((b - r) / delta + 2);
                    } else {
                        h = 60 * ((r - g) / delta + 4);
                    }
                }

                if (h < 0) h += 360;

                return { h, s, l };
            }

            function hslToHex(h, s, l) {
                const c = (1 - Math.abs(2 * l - 1)) * s;
                const x = c * (1 - Math.abs((h / 60) % 2 - 1));
                const m = l - c / 2;

                let r = 0;
                let g = 0;
                let b = 0;

                if (h < 60) {
                    r = c;
                    g = x;
                } else if (h < 120) {
                    r = x;
                    g = c;
                } else if (h < 180) {
                    g = c;
                    b = x;
                } else if (h < 240) {
                    g = x;
                    b = c;
                } else if (h < 300) {
                    r = x;
                    b = c;
                } else {
                    r = c;
                    b = x;
                }

                return rgbToHex(
                    (r + m) * 255,
                    (g + m) * 255,
                    (b + m) * 255
                );
            }

            function recolor(originalHex, newHue) {
                const hsl = rgbToHsl(originalHex);

                // Не перекрашиваем почти нейтральные серые оттенки.
                if (hsl.s < 0.035) return originalHex;

                return hslToHex(newHue, hsl.s, hsl.l);
            }

            function getSavedColor() {
                try {
                    const value = localStorage.getItem(STORAGE_COLOR);
                    return validHex(value) ? value : DEFAULT_COLOR;
                } catch {
                    return DEFAULT_COLOR;
                }
            }

            function getSavedHideState() {
                try {
                    return localStorage.getItem(STORAGE_HIDE) !== 'false';
                } catch {
                    return true;
                }
            }

            let currentColor = getSavedColor();
        let hideEnabled = getSavedHideState();

        function makeThemeCss(color) {
                const hue = rgbToHsl(color).h;
                const declarations = [];

                for (const [name, original] of Object.entries(COLOR_VARIABLES)) {
                    declarations.push(
                        `${name}: ${recolor(original, hue)} !important;`
                    );
                }

                declarations.push(`
                    --studio1826-theme-primary: ${color} !important;
                    --ui-color-primary: ${color} !important;
                    --ui-color-accent-brand-blue: ${color} !important;
                    --ui-color-accent-main-primary: ${color} !important;
                    --ui-color-counter-bg-color-primary: ${color} !important;
                `);

                const hideCss = hideEnabled
                    ? `
                        html.${HIDE_CLASS} ${HIDE_SELECTORS.join(
                            ',\nhtml.' + HIDE_CLASS + ' '
                        )} {
                            display: none !important;
                        }
                    `
                    : '';

                return `
                    :root,
                    html,
                    body {
                        ${declarations.join('\n')}
                        accent-color: ${color} !important;
                    }

                    a:focus,
                    button:focus-visible,
                    input:focus,
                    textarea:focus,
                    select:focus {
                        outline-color: ${color};
                    }

                    ::selection {
                        background: ${color}40;
                    }

                    ${hideCss}
                `;
            }

            function ensureStyle(id, content) {
                if (!document.documentElement) return null;

                let style = document.getElementById(id);

                if (!style) {
                    style = document.createElement('style');
                    style.id = id;
                    (document.head || document.documentElement).appendChild(style);
                }

                if (style.textContent !== content) {
                    style.textContent = content;
                }

                return style;
            }

            function installStyles() {
                if (!document.documentElement) return;

                ensureStyle(THEME_STYLE_ID, makeThemeCss(currentColor));

                document.documentElement.classList.toggle(
                    HIDE_CLASS,
                    hideEnabled
                );
            }

        const listeners = new Set();
        let started = false;

        function notify() {
            listeners.forEach(fn => { try { fn(); } catch (_) {} });
        }

        function setColor(color) {
            if (!validHex(color)) return false;

            currentColor = color.toLowerCase();

            try { localStorage.setItem(STORAGE_COLOR, currentColor); } catch (_) {}

            installStyles();
            notify();

            return true;
        }

        function setHide(enabled) {
            hideEnabled = !!enabled;

            try { localStorage.setItem(STORAGE_HIDE, String(hideEnabled)); } catch (_) {}

            installStyles();
            notify();
        }

        function reload() {
            currentColor = getSavedColor();
            hideEnabled = getSavedHideState();
            installStyles();
            notify();
        }

        /* Запускается сразу (document-start), чтобы тема не мигала. */
        function init() {
            if (started || !document.documentElement) return;

            started = true;
            installStyles();

            /*
             * Bitrix может заменить <head> или класс <html>: восстанавливаем
             * стиль и класс. Наблюдаем только за самим <html> и <head> без
             * subtree, иначе наблюдатель срабатывал бы на каждое изменение страницы.
             */
            let scheduled = false;

            const observer = new MutationObserver(() => {
                if (scheduled) return;

                scheduled = true;

                queueMicrotask(() => {
                    scheduled = false;

                    if (
                        !document.getElementById(THEME_STYLE_ID) ||
                        document.documentElement.classList.contains(HIDE_CLASS) !== hideEnabled
                    ) {
                        installStyles();
                    }
                });
            });

            observer.observe(document.documentElement, {
                childList: true,
                attributes: true,
                attributeFilter: ['class']
            });

            if (document.head) observer.observe(document.head, { childList: true });

            /* Другие окна и фреймы этого портала меняют те же ключи. */
            window.addEventListener('storage', event => {
                if (event.key === STORAGE_COLOR || event.key === STORAGE_HIDE) reload();
            });
        }

        return {
            init,
            DEFAULT_COLOR,
            isValid: validHex,
            getColor: () => currentColor,
            getHide: () => hideEnabled,
            setColor,
            setHide,
            subscribe: fn => { listeners.add(fn); }
        };
    })();

    /* =========================================================
     * ЗАПУСК
     * ========================================================= */
    /* В Tampermonkey/Safari UserScripts window/document/location всегда
     * определены — эта проверка не меняет поведение в браузере. Она лишь
     * позволяет require()-ить файл из node:test без браузерного окружения,
     * чтобы тестировать чистые функции (см. ниже и tests/). */
    const IS_BROWSER = typeof window !== 'undefined' &&
        typeof document !== 'undefined' &&
        typeof location !== 'undefined';

    if (IS_BROWSER) {
        if (location.hostname === '1826studio.bitrix24.ru') THEME.init();

        let launch = function () {
            if (
                location.hostname === 'app.bitrix24.ru' &&
                location.pathname.startsWith(APP_PATH) &&
                window !== window.top
            ) {
                startCollector();
                return;
            }

            if (
                location.hostname === '1826studio.bitrix24.ru' &&
                window === window.top &&
                location.pathname.startsWith('/marketplace/app/129')
            ) {
                startMainUI();
            }
        };

        /* Интерфейсу нужен готовый <body>: стартуем после разбора документа. */
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', launch, { once: true });
        } else {
            launch();
        }
    }

    /* Экспорт чистых функций для node:test (tests/*.test.js). Не влияет на
     * поведение в Tampermonkey/UserScripts: там typeof module === 'undefined'. */
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            VERSION,
            norm, parseNumber, containsKey, quantity, splitItems,
            findEquipment, formatQuantity, equipmentLine,
            hallLabel, hallNumber, hallDistance, hallPosition, categoryFromHall,
            findHallName, formatClock,
            buildDayList, parseDayList, analyzeTomorrow, computePayout,
            validateCollectorPayload, encodeRequest, decodeRequest,
            moscowDay, dayBounds, moscowParts, shiftDay, calendarDayIso, dealToRecord, recordsOfCategory, recordEquipment, summarizeEquipment, findDuplicateRows, planTomorrowTiles,
            sanitizeFeatures, exportSettings, parseSettingsImport, FEATURE_KEYS, COLOR_ITEMS,
            money, formatAmount,
            EQUIPMENT, SERVICES, HOURS_BONUSES,
            EQUIPMENT_PERCENT, COFFEE_PERCENT, DEFAULT_RATE
        };
    }
})();
