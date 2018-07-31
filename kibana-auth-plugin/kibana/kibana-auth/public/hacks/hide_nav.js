import chrome from 'ui/chrome';

const hiddenAppIds = chrome.getInjected('hiddenAppIds') || [];

hiddenAppIds.forEach(id => {
    if (chrome.navLinkExists(id)) {
        chrome.getNavLinkById(id).hidden = true;
    }
});
