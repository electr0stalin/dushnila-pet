// ==UserScript==
// @name         Душнила — метка вкладки Google Chat
// @namespace    dushnila.desktop.local
// @version      1.0
// @match        https://chat.google.com/*
// @grant        none
// @noframes
// ==/UserScript==
(() => {
    const mark = () => {
        if (!document.title.startsWith('Google Chat | '))
            document.title = 'Google Chat | ' + document.title;
    };
    new MutationObserver(mark).observe(document.head, {subtree:true, childList:true, characterData:true});
    mark();
})();
