/*
 * Note that this only HIDES the apps from the nav panel. They are still accessible from a direct URL.
 * Server-side redirection is necessary for dedicated apps (Timelion, Monitoring, APM), while
 * client-side redirection is necessary for core apps (Dev Tools, Management).
 */

const core = require('ui/new_platform').getNewPlatform().start.core;

const hiddenAppIds = core.injectedMetadata.getInjectedVars()['hiddenAppIds'] || [];

hiddenAppIds.forEach(id => {
    if (core.chrome.navLinks.has(id)) {
        core.chrome.navLinks.update(id, { hidden: true });
    }
});