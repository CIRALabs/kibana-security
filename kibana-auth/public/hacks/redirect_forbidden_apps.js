import uiRoutes from 'ui/routes';
import {toastNotifications} from 'ui/notify';

const core = require('ui/new_platform').npStart.core;

const hiddenAppUrlsCore = core.injectedMetadata.getInjectedVars()['hiddenAppUrlsCore'] || [];

uiRoutes.addSetupWork(function ($location, kbnUrl) {
    for (let url of hiddenAppUrlsCore) {
        if ($location.url().indexOf(url) > -1) {
            toastNotifications.addDanger("This application is disabled because of your user level.");
            kbnUrl.change('/');
        }
    }
});
