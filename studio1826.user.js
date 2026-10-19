// ==UserScript==
// @name         v3.7.0 Studio 1826 — Расчёт администраторов и интерфейс
// @namespace    studio1826
// @version      3.7.0
// @updateURL    https://raw.githubusercontent.com/zinovievilia/studio-1826-installer/main/studio1826.meta.js
// @downloadURL  https://raw.githubusercontent.com/zinovievilia/studio-1826-installer/main/studio1826.user.js
// @description  Расчёт администраторов, копирование оборудования, информация по помещениям, тема и скрытие элементов Bitrix24 (в настройках)
// @match        https://1826studio.bitrix24.ru/*
// @match        https://app.bitrix24.ru/app.6805e7948ac458.97401951/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const VERSION = '3.7.0';

    const WIDGET_ID = 'studio1826-widget-v3';
    const STYLE_ID = 'studio1826-style-v3';
    const TOAST_ID = 'studio1826-toast-v3';
    const BOOKING_STYLE_ID = 'studio1826-booking-style-v3';
    const PANEL_ID = 'studio1826-panel-v3';
    const MESSAGE_TYPE = 'STUDIO1826_V3_DATA';
    const REQUEST_TYPE = 'STUDIO1826_V3_REQUEST';
    const STORE_KEY = 'studio1826.v3.settings';
    const SETTINGS_ID = 'studio1826-settings-v32';
    const ACTIONS_ID = 'studio1826-actions-v34';
    const DAY_DIALOG_ID = 'studio1826-day-dialog-v34';

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
            .deal-item-contaner .s26-badge-eq { font-weight: 600; }
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
        `,
        settings: `
            #${SETTINGS_ID} {
                position: fixed;
                z-index: 1000001;
                width: 310px;
                max-width: calc(100vw - 16px);
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
            #${SETTINGS_ID}[hidden] { display: none !important; }
            #${SETTINGS_ID} * { box-sizing: border-box; }
            #${SETTINGS_ID} .st-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 4px;
                font-weight: 700;
            }
            #${SETTINGS_ID} .st-close {
                width: 28px;
                height: 28px;
                padding: 0;
                border: 1px solid #555;
                border-radius: 5px;
                background: #202020;
                color: #fff;
                cursor: pointer;
            }
            #${SETTINGS_ID} .st-title {
                margin: 14px 0 8px;
                color: #aaa;
                font-size: 10px;
                font-weight: 750;
                letter-spacing: .08em;
                text-transform: uppercase;
            }
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
            #${SETTINGS_ID} .st-note {
                margin-top: 10px;
                color: #999;
                font-size: 11px;
                line-height: 1.5;
            }
        `,
        actions: `
            #${ACTIONS_ID} {
                position: fixed;
                z-index: 999999;
                display: flex;
                align-items: stretch;
                gap: 8px;
                font: 12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
            }
            #${ACTIONS_ID} .da-btn {
                padding: 0 13px;
                border: 1px solid #444;
                border-radius: 9px;
                background: #202020;
                color: #fff;
                box-shadow: 0 5px 24px #0004;
                font: inherit;
                font-weight: 650;
                white-space: nowrap;
                cursor: pointer;
                transition: background .15s ease;
            }
            #${ACTIONS_ID} .da-btn:hover { background: #303030; }
            #${ACTIONS_ID} .da-arrows[aria-pressed="false"] { color: #999; background: #161616; }
            #${ACTIONS_ID} .da-arrows[aria-pressed="true"] { border-color: #e11d48; }
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
                max-height: 420px;
                overflow: auto;
                padding: 9px 10px;
                border: 1px solid #444;
                border-radius: 6px;
                background: #181818;
            }
            #${DAY_DIALOG_ID} .dd-empty,
            #${DAY_DIALOG_ID} .dd-warn { color: #999; font-size: 12px; }
            #${DAY_DIALOG_ID} .dd-warn { color: #f0b429; margin-top: 8px; }
            #${DAY_DIALOG_ID} .dd-section { margin-bottom: 12px; }
            #${DAY_DIALOG_ID} .dd-section-title {
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

    /* =========================================================
     * НАСТРОЙКИ ФУНКЦИЙ И ЦВЕТА СТАДИЙ (общие для обоих окон)
     * ========================================================= */
    const FEATURES_KEY = 'studio1826.v32.features';
    const STAGE_STYLE_ID = 'studio1826-stage-style-v32';
    const FEATURE_KEYS = [
        'compactCards', 'reuse', 'fonHighlight', 'copyButton',
        'hoverFocus', 'borders', 'handoff', 'aliases', 'arrows'
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
        { id: 'arrow', name: 'Стрелки переноса оборудования', color: '#e11d48' }
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
                const first = allTimed ? Math.min(...timed.map(record => record.start)) : null;

                const ordered = [...list].sort((a, b) =>
                    (Number.isFinite(a.start) ? a.start : 1e9) -
                    (Number.isFinite(b.start) ? b.start : 1e9)
                );

                const known = new Map();

                ordered.forEach(record => {
                    const isFirst = first !== null && record.start === first;

                    (record.items || []).forEach(item => {
                        const match = findEquipment(item);

                        if (!match) return;

                        const entry = known.get(match.key);

                        if (entry) {
                            if (isFirst) entry.star = true;
                        } else {
                            known.set(match.key, { name: match.name, star: isFirst });
                        }
                    });
                });

                if (!known.size) return;

                if (!allTimed) unknownHalls.push(label);

                const items = [...known.values()];

                starCount += items.filter(item => item.star).length;
                blocks.push({ label, items });
            });

        const text = blocks
            .map(block => [
                block.label,
                ...block.items.map(item => item.star ? `${item.name} *` : item.name)
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

            const match = findEquipment(line);

            current.items.push({
                name: match ? match.name : line,
                key: match ? match.key : norm(line),
                star,
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

                if (match && !equipment.has(match.key)) equipment.set(match.key, match.name);
            });

            return { label, record, equipment, used: new Set() };
        });

        const needs = [];

        (tomorrow || []).forEach(hall => {
            hall.items.filter(item => item.star).forEach(item => {
                needs.push({ hall: hall.label, key: item.key, name: item.name });
            });
        });

        const keep = [];
        const move = [];
        const missing = [];
        const rest = [];

        /* Сначала то, что уже стоит в нужном зале. */
        needs.forEach(need => {
            const source = lasts.find(last =>
                last.label === need.hall &&
                last.equipment.has(need.key) &&
                !last.used.has(need.key)
            );

            if (source) {
                source.used.add(need.key);
                keep.push({ need, from: source });
            } else {
                rest.push(need);
            }
        });

        /* Потом то, что можно перенести из другого зала. */
        rest.forEach(need => {
            const source = lasts.find(last =>
                last.equipment.has(need.key) && !last.used.has(need.key)
            );

            if (source) {
                source.used.add(need.key);
                move.push({ need, from: source });
            } else {
                missing.push(need);
            }
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
    function startCollector() {
        if (window.__studio1826CollectorV3) return;
        window.__studio1826CollectorV3 = true;

        let features = loadFeatures();

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

        const createCopyIcon = () => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(COPY_ICON_SVG, 'image/svg+xml');
            return doc.documentElement;
        };

        /* Исходный текст метки (метка визуально скрыта, но остаётся в DOM). */
        const labelSource = label => label.innerText || label.textContent || '';

        /* Единый разбор карточки: используется копированием, панелью и сборщиком. */
        const parseCache = new WeakMap();

        function parseCard(card) {
            const labels = [...card.querySelectorAll('.reserve-phone-label')];
            const cacheKey = labels.map(label => label.textContent).join('\u0001');
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

                info.items.forEach(item => {
                    const match = findEquipment(item);

                    if (match && !REUSE_EXCLUDE.has(match.key)) keys.set(match.key, match.name);
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
                    start,
                    end,
                    hall: hallLabel(info.hallFull),
                    hallFull: info.hallFull
                });
            });

            const place = entry => [entry.hall, formatTime(entry.start)].filter(Boolean).join(' · ');
            const source = entry => [entry.hall, `до ${formatTime(entry.end)}`].filter(Boolean).join(' · ');

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

            const addLink = (from, to, name) => {
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
                        same: !!from.hall && from.hall === to.hall
                    };
                    byTarget.set(to.card, link);
                }

                if (!link.names.includes(name)) link.names.push(name);
            };

            entries.forEach(entry => {
                const outgoing = [];
                const incoming = [];

                if (entry.start !== null) {
                    entry.keys.forEach((name, key) => {
                        const list = eqMap.get(key) || [];

                        const next = list.filter(other => other !== entry && other.start >= entry.end);
                        if (next.length) {
                            const first = next[0].start;
                            const targets = next.filter(o => o.start === first);

                            targets.forEach(target => addLink(entry, target, name));

                            outgoing.push({
                                name,
                                places: [...new Set(targets.map(place))]
                            });
                        }

                        const previous = list.filter(other => other !== entry && other.end <= entry.start);
                        if (previous.length) {
                            const last = previous[previous.length - 1].end;
                            incoming.push({
                                name,
                                sources: [...new Set(previous.filter(o => o.end === last).map(source))]
                            });
                        }
                    });
                }

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

        const reuseOutText = entry => entry.places.length
            ? `${entry.name} → ${entry.places.join(', ')}`
            : entry.name;

        const reuseInText = entry => entry.sources.length
            ? `${entry.name} ← ${entry.sources.join(', ')}`
            : entry.name;

        function renderBadges(card, info) {
            const rawFon = info.items.some(item => FON_RE.test(item));
            const rawEquipment = info.equipment.length > 0;

            card.classList.toggle('s26-outlined', features.borders && (rawFon || rawEquipment));

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

            const reuse = features.reuse ? (reuseMap.get(card) || EMPTY_REUSE) : EMPTY_REUSE;
            const outgoing = reuse.outgoing.map(reuseOutText).join('; ');
            const incoming = reuse.incoming.map(reuseInText).join('; ');

            const signature = [hasFon, hasEquipment, outgoing, incoming].join('::');

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
            if (hasEquipment) box.appendChild(badge('s26-badge-eq', 'Оборудование'));
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
            lines.push(...info.equipment);

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
                        el('span', { className: 'p-qty' }, [formatQuantity(qty)]),
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

                const shown = link.names.slice(0, 3).join(', ');

                label.textContent = link.names.length > 3
                    ? `${shown} +${link.names.length - 3}`
                    : shown;

                layer.append(path, head, label);
                arrowEls.push({ link, path, head, label });
            });

            focusArrows(hoveredCard);
        }

        window.addEventListener('resize', renderArrows);

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

            renderHandoffs(cardList);
            applyMarks(cardList);
            applyStages(cardList);
            renderArrows();

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

        /* Один общий наблюдатель вместо двух. */
        let workTimer = null;

        function isOwnNode(node) {
            const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;

            return !!element?.closest?.(`#${PANEL_ID}, .booking-copy-button, .s26-badges, .s26-handoff, .s26-arrows`);
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

            if (event.data?.type === REQUEST_TYPE) {
                if (event.data.settings) {
                    const next = sanitizeFeatures(event.data.settings);

                    if (JSON.stringify(next) !== JSON.stringify(features)) {
                        features = next;
                        saveFeatures(features);
                        applyFeatures();
                    }
                }

                if (Array.isArray(event.data.mark)) {
                    const next = new Set(event.data.mark.filter(key => typeof key === 'string'));
                    const same = next.size === markKeys.size &&
                        [...next].every(key => markKeys.has(key));

                    if (!same) {
                        markKeys = next;
                        processCards();
                    }
                }

                send(true);
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

        let records = [];
        let category = 'C';
        let categorySource = 'default'; // branch | halls | default
        let selectedDate = '';
        let admins = 2;
        let rateEnabled = false;
        let rateValue = DEFAULT_RATE;
        let coffeeEnabled = true;
        let lightSetupEnabled = true;
        let collapsed = true;
        let cardsMissing = false;
        let toastTimer = null;
        let toastFadeTimer = null;
        let placeActions = () => {};
        let refreshArrowButton = () => {};
        let closeDayDialog = () => {};
        let closeSettings = () => {};
        let markKeys = [];
        let markSignature = '';

        const recordsSignature = list =>
            list.map(record => `${record.hall}|${record.start}|${record.end}`).join(';');

        /* Сохранение настроек между перезагрузками. */
        function loadSettings() {
            try {
                const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');

                if ([1, 2, 3].includes(saved.admins)) admins = saved.admins;
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

        /* Единый расчёт: все суммы (и виджет, и копирование) берутся отсюда. */
        function compute() {
            const items = records.flatMap(record => record.items || []);
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
                    const match = item.match(/[-–—]\s*([\d\s\u00A0.,]+?)\s*шт\.?/i);
                    if (match) coffee += parseNumber(match[1]);
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
                STYLES.toast
            ].join('\n');

            document.head.appendChild(node);
        }

        /* Закрыть все наши окна поверх страницы (когда открыта бронь или боковая панель). */
        function closeOverlays() {
            const root = document.getElementById(WIDGET_ID);

            if (root) setCollapsed(root, true);

            closeDayDialog();
            closeSettings();
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

        function resetWidgetPosition(root) {
            root.style.left = '20px';
            root.style.right = 'auto';
            root.style.top = 'auto';
            root.style.bottom = '20px';
            root.style.transform = 'none';
        }

        function setCollapsed(root, value) {
            collapsed = value;
            root.classList.toggle('collapsed', collapsed);

            const button = root.querySelector('.s-collapse');

            if (button) {
                button.textContent = collapsed ? '☰' : '−';
                button.title = collapsed ? 'Развернуть' : 'Свернуть';
            }

            resetWidgetPosition(root);
            placeActions();
        }

        /* Меню настроек (шестерёнка в заголовке). */
        function setupSettings(root) {
            const panel = document.createElement('div');
            panel.id = SETTINGS_ID;
            panel.hidden = true;

            panel.appendChild(el('div', { className: 'st-head' }, [
                el('span', {}, ['Настройки']),
                el('button', { type: 'button', className: 'st-close', 'aria-label': 'Закрыть' }, ['✕'])
            ]));

            panel.appendChild(el('div', { className: 'st-title' }, ['Функции']));

            FEATURE_KEYS.forEach(key => {
                const labelText = {
                    compactCards: 'Компактные карточки',
                    reuse: 'Не разбирать (куда и откуда)',
                    fonHighlight: '«Фон» красным в окне',
                    copyButton: 'Кнопка копирования в брони',
                    hoverFocus: 'Выделять бронь при наведении',
                    borders: 'Обводка броней с фоном/оборудованием',
                    handoff: 'Полоска «Пересменки»',
                    aliases: 'Подписи оборудования (бум, роллер…)',
                    arrows: 'Стрелки переноса оборудования'
                }[key];

                panel.appendChild(el('label', { className: 'st-check' }, [
                    el('input', { type: 'checkbox', 'data-feature': key }),
                    el('span', {}, [labelText])
                ]));
            });

            panel.appendChild(el('div', { className: 'st-title' }, ['Интерфейс Bitrix24']));

            panel.appendChild(el('label', { className: 'st-check' }, [
                el('input', { type: 'checkbox', 'data-theme-hide': '1' }),
                el('span', {}, ['Скрывать лишнее (Маркет, Copilot, футер…)'])
            ]));

            panel.appendChild(el('label', { className: 'st-color' }, [
                el('span', {}, ['Основной цвет']),
                el('input', { type: 'color', 'data-theme-color': '1' })
            ]));

            panel.appendChild(el('div', { className: 'st-hex-row' }, [
                el('input', {
                    type: 'text',
                    className: 'st-hex',
                    maxlength: '7',
                    spellcheck: 'false',
                    placeholder: '#8F263F',
                    'aria-label': 'HEX-код основного цвета'
                }),
                el('button', { type: 'button', className: 'st-theme-reset' }, ['Сбросить'])
            ]));

            panel.appendChild(el('div', { className: 'st-note' }, [
                'Цвет и скрытие применяются сразу и сохраняются. ',
                'Цвета, заданные в компонентах Bitrix напрямую, могут не измениться.'
            ]));

            panel.appendChild(el('div', { className: 'st-title' }, ['Цвета стадий']));

            STAGES.forEach(stage => {
                panel.appendChild(el('label', { className: 'st-color' }, [
                    el('span', {}, [stage.name]),
                    el('input', { type: 'color', 'data-stage': stage.id })
                ]));
            });

            panel.appendChild(el('div', { className: 'st-title' }, ['Цвета меток']));

            MARK_COLORS.forEach(mark => {
                panel.appendChild(el('label', { className: 'st-color' }, [
                    el('span', {}, [mark.name]),
                    el('input', { type: 'color', 'data-stage': mark.id })
                ]));
            });

            panel.appendChild(el('div', { className: 'st-actions' }, [
                el('button', { type: 'button', className: 'st-save' }, ['Сохранить']),
                el('button', { type: 'button', className: 'st-reset' }, ['Сбросить цвета'])
            ]));

            panel.appendChild(el('div', { className: 'st-note' }, [
                'Переключатели действуют сразу. Цвета применяются после «Сохранить».',
                ' «Сбросить цвета» возвращает исходные цвета Bitrix сразу.'
            ]));

            document.body.appendChild(panel);

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

            function place() {
                const rect = root.getBoundingClientRect();

                panel.style.visibility = 'hidden';
                panel.hidden = false;

                const width = panel.offsetWidth;
                const height = panel.offsetHeight;

                const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));

                let top = rect.top - height - 8;

                if (top < 8) top = Math.min(rect.bottom + 8, window.innerHeight - height - 8);

                panel.style.left = left + 'px';
                panel.style.top = Math.max(8, top) + 'px';
                panel.style.visibility = '';
            }

            function close() { panel.hidden = true; }

            closeSettings = close;

            root.querySelector('.s-gear').addEventListener('click', () => {
                if (!panel.hidden) {
                    close();
                    return;
                }

                draft = { ...features.colors };
                fillControls();
                place();
            });

            panel.querySelector('.st-close').addEventListener('click', close);

            document.addEventListener('keydown', event => {
                if (event.key === 'Escape' && !panel.hidden) close();
            });

            panel.querySelectorAll('[data-feature]').forEach(input => {
                input.addEventListener('change', () => {
                    features = sanitizeFeatures({
                        ...features,
                        [input.dataset.feature]: input.checked
                    });

                    saveFeatures(features);
                    requestData();
                    refreshArrowButton();
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

            panel.querySelector('.st-reset').addEventListener('click', () => {
                draft = Object.fromEntries(COLOR_ITEMS.map(item => [item.id, item.color]));

                features = sanitizeFeatures({ ...features, colors: draft });

                saveFeatures(features);
                fillControls();
                requestData();
            });
        }

        /* Две кнопки справа от плашки: список за день и «не разбирать на завтра». */
        function setupDayTools(root) {
            const bar = document.createElement('div');
            bar.id = ACTIONS_ID;

            bar.appendChild(el('button', {
                type: 'button',
                className: 'da-btn da-copy',
                title: 'Копировать список оборудования за день. Звёздочкой отмечено то, что нужно первой брони зала.'
            }, ['Копировать оборудование за день']));

            bar.appendChild(el('button', {
                type: 'button',
                className: 'da-btn da-plan',
                title: 'Посчитать, что не нужно разбирать на завтра'
            }, ['Не разбирать на завтра']));

            bar.appendChild(el('button', {
                type: 'button',
                className: 'da-btn da-arrows',
                'aria-pressed': 'true',
                title: 'Стрелки: куда и откуда поедет оборудование между бронями'
            }, ['Стрелки: вкл']));

            document.body.appendChild(bar);

            const dialog = document.createElement('div');
            dialog.id = DAY_DIALOG_ID;
            dialog.hidden = true;

            dialog.appendChild(el('div', { className: 'dd-head' }, [
                el('span', {}, ['Что не разбирать на завтра']),
                el('button', { type: 'button', className: 'dd-close', 'aria-label': 'Закрыть' }, ['✕'])
            ]));

            dialog.appendChild(el('div', { className: 'dd-cols' }, [
                el('div', { className: 'dd-col' }, [
                    el('div', { className: 'dd-label' }, ['Список за завтра (скопирован первой кнопкой на завтрашнем дне)']),
                    el('textarea', {
                        className: 'dd-input',
                        spellcheck: 'false',
                        placeholder: 'Зал 75\nAputure 600d Pro *\nManfrotto 272b'
                    }),
                    el('div', { className: 'dd-actions' }, [
                        el('button', { type: 'button', className: 'dd-run' }, ['Посчитать']),
                        el('button', { type: 'button', className: 'dd-clear' }, ['Снять обводку'])
                    ])
                ]),
                el('div', { className: 'dd-col' }, [
                    el('div', { className: 'dd-label' }, ['Результат']),
                    el('div', { className: 'dd-result' }, [
                        el('div', { className: 'dd-empty' }, ['Откройте на странице сегодняшний день, вставьте список и нажмите «Посчитать».'])
                    ])
                ])
            ]));

            document.body.appendChild(dialog);

            const result = dialog.querySelector('.dd-result');

            let dialogMoved = false;

            function placeDialog() {
                /* Если окно перетащили, оставляем его там, где оно стоит. */
                if (dialogMoved) {
                    const rect = dialog.getBoundingClientRect();

                    dialog.style.left = Math.max(0, Math.min(rect.left, window.innerWidth - rect.width)) + 'px';
                    dialog.style.top = Math.max(0, Math.min(rect.top, window.innerHeight - rect.height)) + 'px';
                    return;
                }

                const barRect = bar.getBoundingClientRect();

                dialog.style.visibility = 'hidden';

                const width = dialog.offsetWidth;
                const height = dialog.offsetHeight;
                const left = Math.max(8, Math.min(barRect.left, window.innerWidth - width - 8));

                let top = barRect.top - height - 8;

                if (top < 8) top = Math.min(barRect.bottom + 8, window.innerHeight - height - 8);

                dialog.style.left = left + 'px';
                dialog.style.top = Math.max(8, top) + 'px';
                dialog.style.visibility = '';
            }

            function placeBar() {
                const headRect = root.querySelector('.s-head').getBoundingClientRect();
                const rootRect = root.getBoundingClientRect();

                /* Нижний край кнопок совпадает с нижним краем плашки: при раскрытии меню они не поднимаются. */
                bar.style.height = headRect.height + 'px';
                bar.style.top = (rootRect.bottom - headRect.height) + 'px';
                bar.style.left = (rootRect.right + 8) + 'px';

                const width = bar.offsetWidth;

                if (rootRect.right + 8 + width > window.innerWidth - 8) {
                    bar.style.left = Math.max(8, rootRect.left - 8 - width) + 'px';
                }

                if (!dialog.hidden) placeDialog();
            }

            placeActions = placeBar;
            closeDayDialog = () => { dialog.hidden = true; };

            const arrowsButton = bar.querySelector('.da-arrows');

            refreshArrowButton = () => {
                arrowsButton.setAttribute('aria-pressed', String(!!features.arrows));
                arrowsButton.textContent = features.arrows ? 'Стрелки: вкл' : 'Стрелки: выкл';
                placeBar();
            };

            arrowsButton.addEventListener('click', () => {
                features = sanitizeFeatures({ ...features, arrows: !features.arrows });
                saveFeatures(features);
                requestData();
                refreshArrowButton();
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

            window.addEventListener('resize', placeBar);

            if (typeof ResizeObserver === 'function') {
                new ResizeObserver(placeBar).observe(root);
            }

            refreshArrowButton();

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

            /* Кнопка 2: окно «не разбирать на завтра». */
            bar.querySelector('.da-plan').addEventListener('click', () => {
                if (!dialog.hidden) {
                    dialog.hidden = true;
                    return;
                }

                dialog.hidden = false;
                placeDialog();
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

            function addSection(kind, title, lines) {
                if (!lines.length) return;

                const section = document.createElement('div');
                section.className = `dd-section ${kind}`;

                const heading = document.createElement('div');
                heading.className = 'dd-section-title';
                heading.textContent = title;
                section.appendChild(heading);

                lines.forEach(text => {
                    const line = document.createElement('div');

                    line.className = 'dd-line';
                    line.textContent = text;
                    section.appendChild(line);
                });

                result.appendChild(section);
            }

            function renderPlan(analysis, tomorrow) {
                result.replaceChildren();

                addSection(
                    'keep',
                    'Не разбирать — оставить в этом же зале',
                    analysis.keep.map(({ need, from }) =>
                        `${need.name} → остаётся в ${need.hall} (до ${formatClock(from.record.end)})`)
                );

                addSection(
                    'move',
                    'Не разбирать — перенести в другой зал',
                    analysis.move.map(({ need, from }) =>
                        `${need.name}: ${from.label} (до ${formatClock(from.record.end)}) → ${need.hall}`)
                );

                addSection(
                    'missing',
                    'Не хватает — собрать на завтра',
                    analysis.missing.map(need => `${need.name} → ${need.hall}`)
                );

                if (!analysis.needCount) {
                    addNote('В списке нет позиций со звёздочкой, поэтому сравнивать нечего.', 'dd-warn');
                } else if (!analysis.missing.length) {
                    addNote('Всё нужное к утру уже стоит в залах или переносится.', 'dd-empty');
                }

                if (analysis.markKeys.length) {
                    addNote(
                        `Последние брони залов (${analysis.markKeys.length}) обведены на странице.`,
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

            dialog.querySelector('.dd-run').addEventListener('click', () => {
                const tomorrow = parseDayList(dialog.querySelector('.dd-input').value);

                result.replaceChildren();

                if (!tomorrow.length) {
                    addNote('Не удалось распознать список. Вставьте текст, скопированный первой кнопкой.', 'dd-warn');
                    return;
                }

                if (!records.length) {
                    addNote('На странице нет броней сегодняшнего дня.', 'dd-warn');
                    return;
                }

                const analysis = analyzeTomorrow(records, tomorrow);

                markKeys = analysis.markKeys;
                markSignature = recordsSignature(records);

                renderPlan(analysis, tomorrow);
                requestData();
            });

            dialog.querySelector('.dd-clear').addEventListener('click', () => {
                markKeys = [];
                markSignature = '';

                requestData();
            });
        }

        function create() {
            injectStyle();

            const existing = document.getElementById(WIDGET_ID);
            if (existing) return existing;

            const root = document.createElement('div');
            root.id = WIDGET_ID;

            root.appendChild(el('div', { className: 's-head' }, [
                el('span', {}, ['STUDIO 1826 · РАСЧЁТ']),
                el('span', { className: 's-head-buttons' }, [
                    el('button', { type: 'button', className: 's-icon s-gear', title: 'Настройки' }, ['⚙']),
                    el('button', { type: 'button', className: 's-icon s-collapse', title: 'Развернуть' }, ['☰'])
                ])
            ]));

            root.appendChild(el('div', { className: 's-body' }, [
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
                el('div', { className: 's-title' }, ['Выплата']),
                el('div', { className: 's-muted' }, ['К выплате на одного']),
                el('div', { id: 's3-payout', className: 's-payout' }, ['0 ₽']),
                el('div', { id: 's3-rate-note', className: 's-muted' }, ['Ставка не учитывается']),
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
            ]));

            root.appendChild(el('div', { className: 's-footer' }, [
                el('span', { className: 's-version' }, [
                    `BETA v ${VERSION} · `,
                    el('span', { className: 's-credit' }, ['by ILYA ZINOVIEV'])
                ]),
                el('button', { type: 'button', className: 's-copy-button', title: 'Копировать расчёт' }, ['Копировать'])
            ]));

            root.querySelector('#s3-light-on').checked = lightSetupEnabled;
            root.querySelector('#s3-coffee-on').checked = coffeeEnabled;
            root.querySelector('#s3-rate-on').checked = rateEnabled;
            root.querySelector('#s3-rate').value = rateValue;

            root.classList.add('collapsed');
            resetWidgetPosition(root);

            document.body.appendChild(root);

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
                    saveSettings();
                    update();
                });
            });

            setupSettings(root);
            setupDayTools(root);

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

            root.querySelector('.s-collapse').addEventListener('click', () => {
                setCollapsed(root, !collapsed);
            });

            root.querySelector('.s-copy-button').addEventListener('click', async () => {
                const text = copySummary();
                const ok = await copyText(text);
                showCopyToast(text, ok);
            });

            /* Перетаскивание */
            const header = root.querySelector('.s-head');
            let drag = null;

            header.addEventListener('pointerdown', event => {
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
                placeActions();
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

            if (detected === 'C' || detected === 'P') setCategory(detected, 'branch');

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
        }

        /* Приём данных от iframe */
        window.addEventListener('message', event => {
            if (event.origin !== APP_ORIGIN) return;

            const data = event.data;

            if (!data || data.type !== MESSAGE_TYPE || data.source !== 'studio1826-collector') {
                return;
            }

            if (!Array.isArray(data.records)) return;

            const nextRecords = data.records
                .filter(record =>
                    record &&
                    (record.hall === null || typeof record.hall === 'string') &&
                    Array.isArray(record.items)
                )
                .map(record => ({
                    hall: record.hall,
                    items: record.items.filter(item => typeof item === 'string'),
                    start: Number.isFinite(record.start) ? record.start : null,
                    end: Number.isFinite(record.end) ? record.end : null
                }));

            if (nextRecords.length === 0 && records.length > 0) {
                if (!cardsMissing) {
                    cardsMissing = true;

                    /* Бронь открыта: окна поверх страницы закрываем, иначе она зависает. */
                    closeOverlays();
                }

                return;
            }

            if (nextRecords.length > 0) cardsMissing = false;

            records = nextRecords;

            /* Другой день или правка броней: старая обводка больше не актуальна. */
            if (markKeys.length && recordsSignature(nextRecords) !== markSignature) {
                markKeys = [];
                requestData();
            }

            if (typeof data.selectedDate === 'string' && data.selectedDate) selectedDate = data.selectedDate;

            if (data.category === 'C' || data.category === 'P') {
                setCategory(data.category, 'branch');
            } else {
                const inferred = inferCategoryFromRecords();

                if (inferred) setCategory(inferred, 'halls');
            }

            normalizeAdmins();
            update();
        });

        create();

        function requestData() {
            if (document.hidden) return;

            document.querySelectorAll('iframe').forEach(frame => {
                try {
                    frame.contentWindow?.postMessage(
                        { type: REQUEST_TYPE, settings: features, mark: markKeys },
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

        requestData();
        setInterval(requestData, 3000);

        setInterval(() => {
            const open = sidePanelOpen();

            if (open && !sidePanelWasOpen) closeOverlays();

            sidePanelWasOpen = open;
        }, 300);
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

                '#header > div.air-header__personal-info:last-child > div.air-header__buttons:last-child',

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
    if (location.hostname === '1826studio.bitrix24.ru') THEME.init();

    function launch() {
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
    }

    /* Интерфейсу нужен готовый <body>: стартуем после разбора документа. */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', launch, { once: true });
    } else {
        launch();
    }
})();
