/*
 * Note that this only HIDES the apps from the nav panel. They are still accessible from a direct URL.
 * Server-side redirection is necessary for dedicated apps (Timelion, Monitoring, APM), while
 * client-side redirection is necessary for core apps (Dev Tools, Management).
 */

import chrome from 'ui/chrome';

const hiddenAppIds = chrome.getInjected('hiddenAppIds') || [];

hiddenAppIds.forEach(id => {
    if (chrome.navLinkExists(id)) {
        chrome.getNavLinkById(id).hidden = true;
    }
});
