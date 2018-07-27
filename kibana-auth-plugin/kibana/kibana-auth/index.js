export default function (kibana) {
    return new kibana.Plugin({
        name: 'kibana-auth',
        require: ['kibana', 'elasticsearch'],
        // uiExports: {
        //     app: {
        //         title: 'Kibana Auth',
        //         description: 'What do you think',
        //         main: 'plugins/kibana-auth/logout/logout'
        //         // icon: '/plugins/kibana/assets/logout.svg'
        //     }
        // },

        init(server, options) {
            require('./server/auth-local-cookie')(server, options);
        }
    });
};
