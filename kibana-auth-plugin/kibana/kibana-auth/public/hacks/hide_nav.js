/*
 * Note that this only HIDES the apps from the nav bar. They are still accessible from a direct URL.
 * More discussion on this matter can be found here: https://github.com/elastic/kibana/issues/10286
 */

import chrome from 'ui/chrome';

const hiddenAppIds = chrome.getInjected('hiddenAppIds') || [];

hiddenAppIds.forEach(id => {
    if (chrome.navLinkExists(id)) {
        chrome.getNavLinkById(id).hidden = true;
    }
});
