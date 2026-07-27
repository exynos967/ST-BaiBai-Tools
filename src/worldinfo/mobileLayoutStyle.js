import { WORLD_INFO_EDITOR_SELECT_DROPDOWN_CLASS, WORLD_INFO_GLOBAL_SELECTOR_DROPDOWN_CLASS, WORLD_INFO_MOBILE_HEADER_LAYOUT_STYLE_ID, WORLD_INFO_SEARCH_REPLACE_PANEL_CLASS } from './constants.js';

function installWorldInfoMobileHeaderLayoutStyle() {
    if (document.getElementById(WORLD_INFO_MOBILE_HEADER_LAYOUT_STYLE_ID)) {
        return;
    }

    const style = document.createElement('style');
    style.id = WORLD_INFO_MOBILE_HEADER_LAYOUT_STYLE_ID;
    style.textContent = `
#world_popup {
    overflow-x: hidden;
}

#WIMultiSelector .bai-bai-wi-global-selector-display {
    align-items: center;
    background-color: var(--SmartThemeBlurTintColor);
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 5px;
    box-sizing: border-box;
    color: var(--SmartThemeBodyColor);
    cursor: pointer;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    min-height: 2.35em;
    max-height: 7.6em;
    min-width: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 4px 6px;
    width: 100%;
}

#WIMultiSelector .bai-bai-wi-global-selector-display.bai-bai-wi-global-selector-open,
#WIMultiSelector .bai-bai-wi-global-selector-display:focus-visible {
    outline: 1px solid color-mix(in srgb, var(--SmartThemeBodyColor) 45%, transparent);
    outline-offset: 1px;
}

#WIMultiSelector .bai-bai-wi-global-selector-placeholder {
    color: var(--SmartThemeBodyColor);
    opacity: 0.62;
    padding: 2px 0;
}

#WIMultiSelector .bai-bai-wi-global-selector-chip {
    align-items: center;
    background-color: color-mix(in srgb, var(--SmartThemeBodyColor) 13%, transparent);
    border: 1px solid color-mix(in srgb, var(--SmartThemeBodyColor) 18%, transparent);
    border-radius: 6px;
    box-sizing: border-box;
    color: var(--SmartThemeBodyColor);
    display: inline-flex;
    gap: 4px;
    line-height: 1.25;
    max-width: 100%;
    min-height: 24px;
    overflow: hidden;
    padding: 3px 5px 3px 8px;
}

#WIMultiSelector .bai-bai-wi-global-selector-chip-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

#WIMultiSelector .bai-bai-wi-global-selector-chip-remove {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 50%;
    color: inherit;
    cursor: pointer;
    display: inline-flex;
    flex: 0 0 auto;
    font-size: 16px;
    height: 20px;
    justify-content: center;
    line-height: 1;
    margin: 0;
    opacity: 0.72;
    padding: 0;
    width: 20px;
}

#WIMultiSelector .bai-bai-wi-global-selector-chip-remove:hover {
    background-color: color-mix(in srgb, var(--SmartThemeBodyColor) 12%, transparent);
    opacity: 1;
}

.${WORLD_INFO_GLOBAL_SELECTOR_DROPDOWN_CLASS} {
    background-color: var(--SmartThemeBlurTintColor);
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 5px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.26);
    box-sizing: border-box;
    color: var(--SmartThemeBodyColor);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: absolute;
    z-index: 30000;
}

.${WORLD_INFO_GLOBAL_SELECTOR_DROPDOWN_CLASS} .bai-bai-wi-global-selector-search-box {
    border-bottom: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor) 75%, transparent);
    box-sizing: border-box;
    flex: 0 0 auto;
    padding: 6px 8px;
    position: relative;
}

.${WORLD_INFO_GLOBAL_SELECTOR_DROPDOWN_CLASS} .bai-bai-wi-global-selector-search {
    background-color: var(--SmartThemeBlurTintColor) !important;
    border: 1px solid var(--SmartThemeBorderColor) !important;
    border-radius: 4px !important;
    box-sizing: border-box !important;
    color: var(--SmartThemeBodyColor) !important;
    display: block !important;
    font: inherit !important;
    margin: 0 !important;
    min-height: 2.3em !important;
    padding: 4px 34px 4px 8px !important;
    width: 100% !important;
}

.${WORLD_INFO_GLOBAL_SELECTOR_DROPDOWN_CLASS} .bai-bai-wi-global-selector-search::-webkit-search-cancel-button {
    display: none !important;
}

.${WORLD_INFO_GLOBAL_SELECTOR_DROPDOWN_CLASS} .bai-bai-wi-global-selector-search-clear {
    align-items: center !important;
    background: transparent !important;
    border: 0 !important;
    border-radius: 50% !important;
    box-shadow: none !important;
    box-sizing: border-box !important;
    color: var(--SmartThemeBodyColor) !important;
    cursor: pointer !important;
    display: flex !important;
    flex: 0 0 auto !important;
    font-size: 18px !important;
    height: 28px !important;
    justify-content: center !important;
    line-height: 1 !important;
    margin: 0 !important;
    max-width: none !important;
    min-width: 0 !important;
    opacity: 0.7 !important;
    padding: 0 !important;
    position: absolute !important;
    right: 11px !important;
    top: 50% !important;
    transform: translateY(-50%) !important;
    width: 28px !important;
}

.${WORLD_INFO_GLOBAL_SELECTOR_DROPDOWN_CLASS} .bai-bai-wi-global-selector-search-clear:focus,
.${WORLD_INFO_GLOBAL_SELECTOR_DROPDOWN_CLASS} .bai-bai-wi-global-selector-search-clear:focus-visible,
.${WORLD_INFO_GLOBAL_SELECTOR_DROPDOWN_CLASS} .bai-bai-wi-global-selector-search-clear:active {
    background-color: transparent !important;
    box-shadow: none !important;
    outline: none !important;
}

@media (hover: hover) {
    .${WORLD_INFO_GLOBAL_SELECTOR_DROPDOWN_CLASS} .bai-bai-wi-global-selector-search-clear:hover {
        background-color: color-mix(in srgb, var(--SmartThemeBodyColor) 12%, transparent) !important;
        opacity: 1 !important;
    }
}

.bai-bai-wi-global-selector-options {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 0;
    touch-action: pan-y;
}

.bai-bai-wi-global-selector-option {
    color: var(--SmartThemeBodyColor);
    cursor: pointer;
    line-height: 1.25;
    min-height: 34px;
    padding: 8px 10px;
    touch-action: pan-y;
    user-select: none;
}

.bai-bai-wi-global-selector-option.selected {
    background-color: color-mix(in srgb, var(--SmartThemeBodyColor) 14%, transparent);
    font-weight: 600;
}

.bai-bai-wi-global-selector-option:hover {
    background-color: color-mix(in srgb, var(--SmartThemeBodyColor) 18%, transparent);
}

.bai-bai-wi-global-selector-empty {
    color: var(--SmartThemeBodyColor);
    opacity: 0.62;
    padding: 24px 12px;
    text-align: center;
}

.${WORLD_INFO_SEARCH_REPLACE_PANEL_CLASS} {
    box-sizing: border-box;
    width: 100%;
}

.${WORLD_INFO_SEARCH_REPLACE_PANEL_CLASS} .bai-bai-wi-search-replace-header {
    align-items: center;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 8px;
    margin-top: 15px !important;
}

.${WORLD_INFO_SEARCH_REPLACE_PANEL_CLASS} .bai-bai-wi-search-replace-title {
    font-weight: 700;
    white-space: nowrap;
}

.${WORLD_INFO_SEARCH_REPLACE_PANEL_CLASS} .bai-bai-wi-search-replace-summary {
    min-width: 0;
    opacity: 0.72;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.${WORLD_INFO_SEARCH_REPLACE_PANEL_CLASS} .bai-bai-wi-search-replace-body {
    box-sizing: border-box;
    padding: 8px;
}

.${WORLD_INFO_SEARCH_REPLACE_PANEL_CLASS} .bai-bai-wi-search-replace-form {
    align-items: center;
    display: grid;
    grid-template-columns: minmax(120px, 1fr) minmax(120px, 1fr) auto auto auto auto;
    gap: 8px;
    min-width: 0;
    width: 100%;
}

.${WORLD_INFO_SEARCH_REPLACE_PANEL_CLASS} .bai-bai-wi-search-replace-find,
.${WORLD_INFO_SEARCH_REPLACE_PANEL_CLASS} .bai-bai-wi-search-replace-replace {
    box-sizing: border-box;
    margin: 0 !important;
    min-width: 0;
    width: 100%;
}

.${WORLD_INFO_SEARCH_REPLACE_PANEL_CLASS} .bai-bai-wi-search-replace-case,
.${WORLD_INFO_SEARCH_REPLACE_PANEL_CLASS} .bai-bai-wi-search-replace-comment {
    align-items: center;
    display: inline-flex;
    gap: 4px;
    margin: 0 !important;
    min-width: max-content;
    white-space: nowrap;
}

.${WORLD_INFO_SEARCH_REPLACE_PANEL_CLASS} .bai-bai-wi-search-replace-count,
.${WORLD_INFO_SEARCH_REPLACE_PANEL_CLASS} .bai-bai-wi-search-replace-apply {
    box-sizing: border-box;
    margin: 0 !important;
    min-height: 30px;
    white-space: nowrap;
}

@media (max-width: 600px) {
    #wiTopBlock,
    #wiTopBlock > .range-block,
    #WIMultiSelector,
    #WIMultiSelector .range-block-range {
        box-sizing: border-box;
        max-width: 100%;
        min-width: 0;
        width: 100%;
    }

    #WIMultiSelector {
        align-items: stretch;
        flex-direction: column;
    }

    #WIMultiSelector > .range-block-title,
    #WIMultiSelector > .range-block-range {
        flex: 0 0 auto;
    }

    #WIMultiSelector .bai-bai-wi-global-selector-display {
        max-width: 100%;
        width: 100%;
    }

    #WIMultiSelector .bai-bai-wi-global-selector-chip {
        flex: 0 1 auto;
        min-width: 0;
    }

    #WIMultiSelector .bai-bai-wi-global-selector-chip-label {
        flex: 1 1 auto;
        min-width: 0;
    }

    .${WORLD_INFO_SEARCH_REPLACE_PANEL_CLASS} {
        margin: 0;
    }

    .${WORLD_INFO_SEARCH_REPLACE_PANEL_CLASS} .bai-bai-wi-search-replace-form {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }

    .${WORLD_INFO_SEARCH_REPLACE_PANEL_CLASS} .bai-bai-wi-search-replace-case,
    .${WORLD_INFO_SEARCH_REPLACE_PANEL_CLASS} .bai-bai-wi-search-replace-comment {
        min-height: 28px;
    }

    .${WORLD_INFO_SEARCH_REPLACE_PANEL_CLASS} .bai-bai-wi-search-replace-count,
    .${WORLD_INFO_SEARCH_REPLACE_PANEL_CLASS} .bai-bai-wi-search-replace-apply {
        min-width: 0;
        width: 100%;
    }

    #WIMultiSelector .bai-bai-wi-global-selector-display {
        max-height: 6.8em;
        min-height: 2.5em;
    }

    #WIMultiSelector .bai-bai-wi-global-selector-chip {
        min-height: 28px;
        padding: 4px 5px 4px 8px;
    }

    .bai-bai-wi-global-selector-option {
        min-height: 40px;
        padding: 10px 12px;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header {
        box-sizing: border-box;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        column-gap: 8px;
        justify-content: space-between;
        row-gap: 7px;
        margin-top: 20px;
        max-width: 100%;
        overflow: hidden;
        width: 100%;
        min-width: 0;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > * {
        margin-top: 0 !important;
        margin-bottom: 0 !important;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > .bai-bai-wi-popup-source-stash {
        display: none !important;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > #world_editor_select:not(.select2-hidden-accessible),
    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > .select2-container {
        flex: 0 0 100%;
        max-width: 100%;
        width: 100% !important;
        min-width: 0;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > .select2-container .select2-selection--single {
        align-items: center !important;
        background-color: var(--SmartThemeBlurTintColor);
        border-color: var(--SmartThemeBorderColor);
        color: var(--SmartThemeBodyColor);
        display: flex !important;
        min-height: 2.25em;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > .select2-container .select2-selection__rendered {
        align-items: center;
        color: var(--SmartThemeBodyColor);
        display: flex !important;
        flex: 1 1 auto;
        line-height: normal !important;
        min-width: 0;
        overflow: hidden;
        padding-bottom: 2px !important;
        padding-right: 28px !important;
        padding-top: 2px !important;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > .select2-container .select2-selection__placeholder {
        color: var(--SmartThemeBodyColor);
        opacity: 0.65;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > .select2-container .select2-selection__clear {
        display: none !important;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > .select2-container .select2-selection__arrow {
        align-items: center !important;
        color: var(--SmartThemeBodyColor);
        display: flex !important;
        height: 100% !important;
        justify-content: center !important;
        opacity: 0.62;
        right: 8px !important;
        top: 0 !important;
        width: 18px !important;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > .select2-container .select2-selection__arrow b {
        border-color: currentColor transparent transparent transparent !important;
        border-style: solid !important;
        border-width: 6px 5px 0 5px !important;
        height: 0 !important;
        left: auto !important;
        margin: 0 !important;
        position: static !important;
        top: auto !important;
        width: 0 !important;
    }

    .${WORLD_INFO_EDITOR_SELECT_DROPDOWN_CLASS} .select2-search--dropdown {
        padding: 6px 8px;
    }

    .${WORLD_INFO_EDITOR_SELECT_DROPDOWN_CLASS} .select2-search--dropdown .select2-search__field {
        background-color: var(--SmartThemeBlurTintColor);
        border-color: var(--SmartThemeBorderColor);
        color: var(--SmartThemeBodyColor);
        min-height: 2.25em;
        opacity: 1 !important;
        width: 100%;
    }

    .${WORLD_INFO_EDITOR_SELECT_DROPDOWN_CLASS} .select2-results__group {
        color: var(--SmartThemeBodyColor);
        font-weight: 700;
        padding: 10px 6px 6px;
    }

    .${WORLD_INFO_EDITOR_SELECT_DROPDOWN_CLASS} .select2-results__option {
        padding-left: 6px !important;
    }

    .${WORLD_INFO_EDITOR_SELECT_DROPDOWN_CLASS} .select2-results__option::before,
    .${WORLD_INFO_EDITOR_SELECT_DROPDOWN_CLASS} .select2-results__option::after {
        content: none !important;
        display: none !important;
    }

    .${WORLD_INFO_EDITOR_SELECT_DROPDOWN_CLASS} .select2-results__option input[type="checkbox"],
    .${WORLD_INFO_EDITOR_SELECT_DROPDOWN_CLASS} .select2-results__option .checkbox {
        display: none !important;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > #world_info_pagination {
        display: flex;
        flex: 1 1 100%;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        line-height: 1;
        max-width: 100%;
        min-width: 0;
        width: 100%;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] #world_info_pagination > .paginationjs {
        box-sizing: border-box;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        max-width: 100%;
        min-width: 0;
        width: 100%;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] #world_info_pagination .paginationjs-nav {
        box-sizing: border-box;
        flex: 1 1 100%;
        min-width: 0;
        width: 100%;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] #world_info_pagination .paginationjs-pages {
        flex: 1 1 auto;
        min-width: 0;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] #world_info_pagination .paginationjs-size-changer {
        flex: 0 0 auto;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] > .world_entry_form > .inline-drawer > .inline-drawer-header {
        display: block;
        padding: 0;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] {
        margin-top: 15px;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] > .world_entry_form.wi-card-entry {
        padding-top: 10px;
        padding-bottom: 10px;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-header {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 0;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-header-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 46px 20px;
        grid-template-rows: auto auto auto;
        column-gap: 8px;
        row-gap: 0;
        align-items: center;
        width: 100%;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-header textarea,
    #world_popup_entries_list .bai-bai-wi-mobile-header select,
    #world_popup_entries_list .bai-bai-wi-mobile-header input,
    #world_popup_entries_list .bai-bai-wi-mobile-header .menu_button,
    #world_popup_entries_list .bai-bai-wi-mobile-header .inline-drawer-toggle {
        margin: 0 !important;
        box-sizing: border-box;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-title-cell,
    #world_popup_entries_list .bai-bai-wi-mobile-position-cell {
        min-width: 0;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-title-cell .WIEntryTitleAndStatus,
    #world_popup_entries_list .bai-bai-wi-mobile-title-cell .WIEntryTitleAndStatus > .flex-container,
    #world_popup_entries_list .bai-bai-wi-mobile-position-cell [name="PositionBlock"] {
        width: 100%;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-title-cell textarea[name="comment"],
    #world_popup_entries_list .bai-bai-wi-mobile-state-cell select[name="entryStateSelector"] {
        height: 34px !important;
        min-height: 34px !important;
        box-sizing: border-box;
        padding: 3px 6px !important;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-title-cell textarea[name="comment"] {
        font-size: 14px;
        line-height: 20px !important;
        margin: 0 !important;
        padding-top: 6px !important;
        padding-bottom: 6px !important;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-state-cell select[name="entryStateSelector"] {
        font-size: 0.88em;
        margin: 0 !important;
        padding: 0 !important;
        text-align: left;
        text-align-last: left;
        text-indent: 7px;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-position-cell select[name="position"],
    #world_popup_entries_list .bai-bai-wi-mobile-depth-cell input[name="depth"] {
        height: 28px !important;
        min-height: 28px !important;
        box-sizing: border-box;
        padding: 2px 6px !important;
        font-size: 12px !important;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-title-cell textarea[name="comment"],
    #world_popup_entries_list .bai-bai-wi-mobile-position-cell select[name="position"] {
        width: 100%;
        min-width: 0;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-state-cell select[name="entryStateSelector"],
    #world_popup_entries_list .bai-bai-wi-mobile-depth-cell input[name="depth"] {
        width: 46px !important;
        min-width: 46px !important;
        max-width: 46px !important;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-position-label-cell,
    #world_popup_entries_list .bai-bai-wi-mobile-depth-label-cell {
        font-size: 11px;
        line-height: 11px;
        opacity: 0.72;
        margin: 10px 0 3px 0;
        min-height: 11px;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-position-label-cell label,
    #world_popup_entries_list .bai-bai-wi-mobile-depth-label-cell label {
        display: block;
        margin: 0;
        padding: 0;
        line-height: 11px;
        pointer-events: none;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-position-cell,
    #world_popup_entries_list .bai-bai-wi-mobile-depth-cell {
        display: flex;
        flex-direction: column;
        justify-content: center;
        margin-top: 0;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-menu-cell,
    #world_popup_entries_list .bai-bai-wi-mobile-enabled-cell {
        display: flex;
        justify-content: center;
        align-items: center;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-enabled-cell {
        align-self: center;
        min-height: 28px;
        padding-bottom: 0;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-menu-cell .drag-handle {
        min-width: 20px;
        text-align: center;
        cursor: grab;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-footer {
        display: flex;
        align-items: end;
        flex-wrap: wrap;
        gap: 8px;
        box-sizing: border-box;
        max-width: 100%;
        width: 100%;
        margin-top: 10px;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-number-group,
    #world_popup_entries_list .bai-bai-wi-mobile-action-group {
        display: flex;
        align-items: end;
        gap: 6px;
        min-width: 0;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-action-group {
        padding-top: 14px;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-number-group input[name="order"],
    #world_popup_entries_list .bai-bai-wi-mobile-number-group input[name="probability"] {
        height: 28px !important;
        min-height: 28px !important;
        box-sizing: border-box;
        padding: 2px 6px !important;
        font-size: 12px !important;
        min-width: 0 !important;
        width: 66px !important;
        max-width: 66px !important;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-number-group label {
        font-size: 11px;
        line-height: 11px;
        opacity: 0.72;
        display: block;
        margin: 0 0 3px 0;
        padding: 0;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-action-group .menu_button {
        width: 28px !important;
        min-width: 28px !important;
        max-width: 28px !important;
        height: 28px !important;
        min-height: 28px !important;
        max-height: 28px !important;
        aspect-ratio: 1 / 1;
        box-sizing: border-box;
        flex: 0 0 28px;
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 !important;
        margin: 0 !important;
        line-height: 1 !important;
        overflow: hidden;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expand-slot {
        margin-left: auto;
        display: flex;
        align-items: flex-end;
        justify-content: flex-end;
        align-self: flex-end;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expand-slot .inline-drawer-toggle {
        width: 28px !important;
        min-width: 28px !important;
        max-width: 28px !important;
        height: 28px !important;
        min-height: 28px !important;
        max-height: 28px !important;
        aspect-ratio: 1 / 1;
        box-sizing: border-box;
        flex: 0 0 28px;
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 !important;
        margin: 0 !important;
        font-size: 21px;
        line-height: 1 !important;
        overflow: hidden;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expand-slot .inline-drawer-toggle::before {
        position: static !important;
        inset: auto !important;
        display: block !important;
        width: auto !important;
        height: auto !important;
        margin: 0 !important;
        line-height: 1 !important;
        transform: none !important;
        text-align: center !important;
    }

    #world_popup_entries_list .world_entry_edit[data-bai-bai-world-info-mobile-expanded-layout="true"] {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-main {
        width: 100%;
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 8px;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-main [name="keywordsAndLogicBlock"] {
        width: 100%;
        display: block;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-main [name="keywordsAndLogicBlock"] .keyprimary {
        min-width: 0;
        width: 100%;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-main [name="keywordsAndLogicBlock"] .keyprimary > small {
        text-align: left !important;
        align-self: flex-start;
        margin: 15px 0 2px 2px;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-main .switch_input_type_icon {
        display: none !important;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-advanced {
        width: 100%;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-advanced .keysecondary,
    #world_popup_entries_list .bai-bai-wi-mobile-expanded-advanced .world_entry_form_control {
        width: 100%;
        min-width: 0;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-advanced select[name="entryLogicType"] {
        width: 100%;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-main [name="contentAndCharFilterBlock"] {
        width: 100%;
        display: flex;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-content-header {
        display: flex !important;
        align-items: center;
        gap: 6px;
        width: 100%;
        margin-top: 6px;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-content-title-group {
        justify-content: flex-start;
        min-width: 0;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-content-meta {
        text-align: left;
        opacity: 0.85;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-content-maximize {
        margin-left: auto;
        flex: 0 0 auto;
        margin-top: 0;
        margin-right: 0;
        margin-bottom: 0;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-main textarea[name="content"] {
        width: 100%;
        min-height: 292px;
        min-height: calc(14lh + 12px);
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-extra {
        width: 100%;
        border-top: 1px solid var(--SmartThemeBorderColor);
        padding-top: 4px;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-extra-toggle {
        min-height: 30px;
        padding: 4px 0;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-extra-content {
        width: 100%;
        gap: 8px;
    }

    #world_popup_entries_list .bai-bai-wi-mobile-expanded-extra-content > .flex-container,
    #world_popup_entries_list .bai-bai-wi-mobile-expanded-extra-content [name="perEntryOverridesBlock"] {
        width: 100%;
        flex-flow: column;
        align-items: stretch;
        gap: 6px;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] {
        box-sizing: border-box !important;
        display: block !important;
        flex-direction: initial !important;
        flex-wrap: initial !important;
        align-items: initial !important;
        justify-content: initial !important;
        gap: initial !important;
        row-gap: initial !important;
        max-width: 100% !important;
        min-width: 0 !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
        width: 100% !important;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header {
        display: flex !important;
        order: initial !important;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > * {
        order: initial !important;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > .bai-bai-wi-popup-header > .bai-bai-wi-popup-source-stash {
        display: none !important;
    }

    #world_popup[data-bai-bai-world-info-popup-layout="true"] > #world_popup_entries_list {
        display: block !important;
        order: initial !important;
        width: 100% !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] {
        min-height: 0 !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] > .world_entry_form.wi-card-entry {
        position: relative !important;
        padding-top: 10px !important;
        padding-bottom: 10px !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-hidden-stash {
        display: none !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-header,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-header-grid,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-footer,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-title-cell,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-state-cell,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-menu-cell,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-position-cell,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-depth-cell,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-enabled-cell,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-number-group,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-action-group,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-expand-slot {
        position: static !important;
        inset: auto !important;
        top: auto !important;
        right: auto !important;
        bottom: auto !important;
        left: auto !important;
        z-index: auto !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-header .drag-handle,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-header .killSwitch,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-header .move_entry_button,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-header .duplicate_entry_button,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-header .delete_entry_button,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-header .inline-drawer-toggle {
        position: static !important;
        inset: auto !important;
        top: auto !important;
        right: auto !important;
        bottom: auto !important;
        left: auto !important;
        z-index: auto !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-expand-slot .inline-drawer-toggle::before {
        position: static !important;
        inset: auto !important;
        display: block !important;
        width: auto !important;
        height: auto !important;
        margin: 0 !important;
        line-height: 1 !important;
        transform: none !important;
        text-align: center !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-title-cell .WIEntryTitleAndStatus.flex-container.flex1.alignitemscenter,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-title-cell .WIEntryTitleAndStatus > .flex-container,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-position-cell [name="PositionBlock"],
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-depth-cell .world_entry_form_control,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-number-group .world_entry_form_control,
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-number-group .probabilityContainer {
        min-height: 0 !important;
        min-width: 0 !important;
        margin-right: 0 !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-position-cell .world_entry_form_control[name="PositionBlock"] {
        width: 100% !important;
        min-width: 0 !important;
        max-width: none !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .world_entry_edit[data-bai-bai-world-info-mobile-expanded-layout="true"] {
        display: flex !important;
        flex-direction: column !important;
        gap: 8px !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .world_entry_edit[data-bai-bai-world-info-mobile-expanded-layout="true"] > .bai-bai-wi-mobile-expanded-main {
        display: flex !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .world_entry_edit[data-bai-bai-world-info-mobile-expanded-layout="true"] > .bai-bai-wi-mobile-expanded-extra {
        display: flex !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-expanded-main [name="keywordsAndLogicBlock"] {
        display: block !important;
    }

    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-expanded-main [name="contentAndCharFilterBlock"],
    #world_popup_entries_list > .world_entry[data-bai-bai-world-info-mobile-header-layout="true"] .bai-bai-wi-mobile-expanded-main [name="contentAndCharFilterBlock"] .world_entry_form_control {
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
    }
}
`;
    document.head.append(style);
}

function removeWorldInfoMobileHeaderLayoutStyle() {
    document.getElementById(WORLD_INFO_MOBILE_HEADER_LAYOUT_STYLE_ID)?.remove();
}

export {
    installWorldInfoMobileHeaderLayoutStyle,
    removeWorldInfoMobileHeaderLayoutStyle,
};
