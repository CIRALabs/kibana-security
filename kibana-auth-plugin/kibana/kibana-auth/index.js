export default function (kibana) {
    return new kibana.Plugin({
        name: 'kibana-auth',
        require: ['kibana', 'elasticsearch'],
        uiExports: {
            links: [
                {
                    id: 'elastic-auth:logout',
                    title: 'Logout',
                    order: 10000,
                    url: `/logout`,
                    description: 'Logout current user',
                    icon: 'plugins/kibana-auth/assets/padlock.svg',
                    linkToLastSubUrl: false
                }
            ]
        },

        init(server, options) {
            require('./server/auth-local-cookie')(server, options);
        }
    });
};
