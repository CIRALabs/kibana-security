import chrome from 'ui/chrome';
import uiRoutes from 'ui/routes';
import { notify } from 'ui/notify';

const hiddenAppUrlsCore = chrome.getInjected('hiddenAppUrlsCore') || [];

uiRoutes.addSetupWork(function ($location, kbnUrl) {
    for (let url of hiddenAppUrlsCore) {
        if ($location.url().indexOf(url) > -1) {
            notify.error("This application is disabled because of your user level.");
            kbnUrl.redirect('/');
        }
    }
});
