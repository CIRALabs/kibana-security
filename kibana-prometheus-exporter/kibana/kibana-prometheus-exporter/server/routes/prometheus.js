const Requester = require('request-promise');
const Formatter = require('./formatter');

const makeUrl = (uri, path) =>
    //ZACH-EDIT Use custom path to automate login
    `${uri}${path}/prometheus_stats`;

export default function (server) {

    const config = server.config();
    const path = config.get('server').basePath.toString();
    const user = config.get('kibana-prometheus-exporter.user');
    const pass = config.get('kibana-prometheus-exporter.pass');
    const adminuser = config.get('elasticsearch.username');
    const adminpass = config.get('elasticsearch.password');
    const auth = 'Basic ' + new Buffer(`${adminuser}:${adminpass}`).toString('base64');
    const url = {
        uri: makeUrl(server.info.uri, path),
        headers: {'Authorization': auth},
        json: true//,
        //ZACH-EDIT Hold on to cookies for future use
        //jar: true
    };

    server.route({
        path: config.get('kibana-prometheus-exporter.path'),
        method: 'GET',
        options: {
            auth: {mode: 'optional'},
            plugins: {'hapi-auth-cookie': {redirectTo: false}}
        },
        async handler(req, h) {
            let username;
            let password;

            if (
                typeof req.headers !== 'undefined' &&
                typeof req.headers['authorization'] !== 'undefined'
            ) {
                let b64 = new Buffer(req.headers['authorization'].split(" ")[1], "base64");
                let userAndPass = b64.toString().split(":");

                username = userAndPass[0];
                password = userAndPass[1];
            }

            if (username === user && password === pass) {
                const stats = await Requester.get(url);
                const prometheusStats = Formatter(stats);

                return await h
                    .response(prometheusStats)
                    .type('text/plain')
                    .encoding('binary');
            }
            else {
                return 'Incorrect credentials';
            }
        }
    });
}
