export default function (kibana) {
    const REGULAR_ES_USER = 4;
    /* Core plugins are ordered around 9000, so this ensures that the logout button is below them */
    const LOGOUT_ORDER = 10000;
    /* These identify the application in the navigation panel */
    const DEV_APPS_ID = ['apm', 'kibana:dev_tools', 'monitoring', 'kibana:management', 'timelion'];
    const DEV_APPS_CORE_URL = ['/dev_tools', '/management'];

    return new kibana.Plugin({
        name: 'kibana-auth',
        require: ['kibana', 'elasticsearch'],
        uiExports: {
            links: [
                {
                    id: 'kibana-auth:logout',
                    title: 'Logout',
                    order: LOGOUT_ORDER,
                    url: '/logout',
                    description: 'Logout current user',
                    icon: 'plugins/kibana-auth/assets/images/padlock.svg',
                    linkToLastSubUrl: false
                }
            ],

            replaceInjectedVars(injectedVars, request) {
                if (request.headers['x-es-user-type'] === REGULAR_ES_USER) {
                    injectedVars.hiddenAppIds = DEV_APPS_ID;
                    injectedVars.hiddenAppUrlsCore = DEV_APPS_CORE_URL;
                }

                return injectedVars;
            },

            hacks: [
                'plugins/kibana-auth/hacks/hide_nav',
                'plugins/kibana-auth/hacks/redirect_forbidden_apps'
            ]
        },

        init(server, options) {
            require('./server/auth_local_cookie')(server, options);
        }
    });
};
