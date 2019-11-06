export default function (kibana) {
    const POWERUSER = 5;
    /* Core plugins are ordered around 9000, so this ensures that the logout button is below them */
    const LOGOUT_ORDER = 10000;
    /* These identify the application in the navigation panel */
    const DEV_APPS_ID = ['apm','kibana:dev_tools', 'monitoring', 'kibana:management', 'timelion', 'ml', 'infra', 'kibana-prometheus-exporter', 'uptime', 'siem'];
    const POWERUSER_APPS_ID = ['kibana-auth:console'];
    /* These identify core applications in the URL */
    const DEV_APPS_CORE_URL = ['/dev_tools/searchprofiler', '/dev_tools/grokdebugger', '/management', '/uptime', '/monitoring', '/graph', '/apm', '/siem'];
    const POWERUSER_APPS_CORE_URL = ['/dev_tools/console'];

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
                    icon: 'plugins/kibana-auth/assets/images/logout7.svg',
                    linkToLastSubUrl: false
                },
                {
                    id: 'kibana-auth:console',
                    title: 'Dev Tools',
                    order: LOGOUT_ORDER-2,
                    url: '/app/kibana#/dev_tools/console',
                    description: 'dev console',
                    icon: 'plugins/kibana-auth/assets/images/console.svg',
                    linkToLastSubUrl: false
                },
                {
                    id: 'kibana-auth:user_info',
                    title: 'User Info',
                    order: LOGOUT_ORDER-1,
                    url: '/user_info_page',
                    description: 'user info and change LDAP password',
                    icon: 'plugins/kibana-auth/assets/images/profile_icon.svg',
                    linkToLastSubUrl: false
                }
            ],

            replaceInjectedVars(injectedVars, request) {
                if (request.headers['x-es-user-type'] === POWERUSER) {
                    injectedVars.hiddenAppIds = DEV_APPS_ID;
                    injectedVars.hiddenAppUrlsCore = DEV_APPS_CORE_URL;
                }else if (request.headers['x-es-user-type'] < POWERUSER) {
                    injectedVars.hiddenAppIds = DEV_APPS_ID.concat(POWERUSER_APPS_ID);
                    injectedVars.hiddenAppUrlsCore = DEV_APPS_CORE_URL.concat(POWERUSER_APPS_CORE_URL);
                } else if (request.headers['x-es-user-type'] > POWERUSER){
                    injectedVars.hiddenAppIds = POWERUSER_APPS_ID;
                }

                return injectedVars;
            },

            hacks: [
                'plugins/kibana-auth/hacks/hide_nav',
                'plugins/kibana-auth/hacks/redirect_forbidden_apps'
            ]
        },

        config(Joi) {
            return Joi.object({
                enabled: Joi.boolean().default(true),
                cookie_password: Joi.string().min(32),
                kibana_install_dir: Joi.string(),
                disable_password_change_form: Joi.boolean().default(false)
            }).default();
        },

        init(server, options) {
            require('./server/auth_local_cookie')(server, options);
        }
    });
};
