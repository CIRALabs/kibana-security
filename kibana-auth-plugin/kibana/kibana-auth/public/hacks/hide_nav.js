/*
 * Note that this only HIDES the apps from the nav panel. They are still accessible from a direct URL.
 * Server-side redirection is necessary for dedicated apps (Timelion, Monitoring, APM), while
 * client-side redirection is necessary for core apps (Dev Tools, Management).
 */

import chrome from 'ui/chrome';

const hiddenAppIds = chrome.getInjected('hiddenAppIds') || [];
// const hiddenK7Apps = chrome.getInjected('hiddenK7Apps') || [];

hiddenAppIds.forEach(id => {
    console.log(chrome.getNavLinks())
    if (chrome.navLinkExists(id)) {
        console.log(chrome.getNavLinkById(id));
        chrome.getNavLinkById(id).hidden = true;
    }
});

// hiddenK7Apps.forEach(app => {
//     var keyPad = top.document.querySelector('#keyPadMenu');
//     console.log(keyPad);
//     if(typeof(keyPad) != 'undefined' && keyPad != null) {
//         var menuItem = keyPad.querySelector('a[href*="' + app + '"]');
//         if(typeof(menuItem) != 'undefined' && menuItem != null) {
//             keyPad.removeChild(menuItem);
//         }
//     }
// })