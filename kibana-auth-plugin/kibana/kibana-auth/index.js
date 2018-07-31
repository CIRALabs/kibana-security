export default function (kibana) {
    return new kibana.Plugin({
        name: 'kibana-auth',
        require: ['kibana', 'elasticsearch'],
        uiExports: {
            links: [
                {
                    id: 'elastic-auth:logout',
                    title: 'Logout',
                    // Core plugins are ordered around 9000, so this ensures that the logout button is below them
                    //FIXME extract to constant
                    order: 10000,
                    url: `/logout`,
                    description: 'Logout current user',
                    icon: 'plugins/kibana-auth/assets/images/padlock.svg',
                    linkToLastSubUrl: false
                }
            ],

            replaceInjectedVars(injectedVars, request) {
                //FIXME extract to constant (regular user is 4)
                if (request.headers['x-es-user-type'] === 4) {
                    injectedVars.hiddenAppIds = ['apm', 'kibana:dev_tools', "monitoring", "kibana:management"];
                }

                return injectedVars;
            },

            hacks: [
                'plugins/kibana-auth/hacks/hide_nav'
            ]
        },

        init(server, options) {
            require('./server/auth_local_cookie')(server, options);
        }
    });
};
