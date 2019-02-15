// Adapted from https://github.com/elasticfence/kibana-auth-elasticfence under MIT licence
// To log (for debugging):
// server.log(['info'], 'Log message here');

module.exports = async function (server, options) {
    const ELASTICSEARCH = require('elasticsearch');
    const UUID = require('uuid/v4');
    const INERT = require('inert');
    const HAPI_AUTH_COOKIE = require('hapi-auth-cookie');
    const CATBOX = require('catbox');
    const CATBOX_MEMORY = require('catbox-memory');

    const TWO_HOURS_IN_MS = 2 * 60 * 60 * 1000;
    const LOGIN_PAGE = '/login_page';
    const REGULAR_ES_USER = 4;
    const DEV_APPS_STANDALONE_URL = [
        '/app/apm', '/app/monitoring', '/app/timelion', '/app/ml', '/app/infra'
    ];
    const USER_TYPE_HEADER = 'x-es-user-type';
    const ABS_PATH = server.config().get('kibana-auth.kibana_install_dir');
    const CACHE_NAME = 'kibana-auth';
    const ADMIN_USER = server.config().get('elasticsearch.username');
    const ADMIN_PASS = server.config().get('elasticsearch.password');

    // Encode cookie with symmetric key encryption using password pulled from config
    const IRON_COOKIE_PASSWORD = server.config().get('kibana-auth.cookie_password');

    ELASTICSEARCH.Client.apis.tokenApi = {
        getToken: function (username, password) {
            return this.transport.request({
                method: 'POST',
                path: '/_token',
                headers: {
                    Authorization: 'Basic ' + Buffer.from(username + ':' + password).toString('base64')
                }
            });
        }
    };
    let client = new ELASTICSEARCH.Client({
        apiVersion: 'tokenApi',
        host: server.config().get('elasticsearch.hosts')[0]
    });

    const login = async function (request, h) {

        if (request.auth.isAuthenticated) {
            return h.continue;
        }

        let username;
        let password;

        if (request.method === 'post') {
            username = request.payload.username;
            password = request.payload.password;
        } else if (request.method === 'get') {
            username = request.query.username;
            password = request.query.password;
        }

        if (username || password) {
            let response = await client.getToken(username, password);
            if (response.success === 1) {
                const sid = UUID();
                try {
                    await request.server.app.cache.set(sid, { jwt: response.result, type: response.user_type }, 0);
                    request.cookieAuth.set({ sid: sid, jwt: response.result, type: response.user_type });
                } catch (err) {
                    server.log(['error'], 'Failed to set JWT in cache, err: ' + err);
                }
                return h.redirect('/');
            }
            else {
                return h.redirect(LOGIN_PAGE);
            }
        }
        else {
            return h.redirect(LOGIN_PAGE);
        }
    };

    const logout = function (request, h) {
        request.cookieAuth.clear();
        return h.redirect(LOGIN_PAGE);
    };

    const adminuserSid = UUID();
    const prometheusLogin = async function (request, h) {
        try {
            request.cookieAuth.set({ sid: adminuserSid, jwt: "", type: 4 });
            return h.redirect('/api/status?extended');
        } catch (err) {
            throw err;
        }
    };
    const prometheusStats = async function (request, h) {
        let username;
        let password;

        if (
            typeof request.headers !== 'undefined' &&
            typeof request.headers['authorization'] !== 'undefined'
        ) {
            let b64 = new Buffer(request.headers['authorization'].split(" ")[1], "base64");
            let userAndPass = b64.toString().split(":");

            username = userAndPass[0];
            password = userAndPass[1];
        }

        if (username === ADMIN_USER && password === ADMIN_PASS) {
            try {
                let cached = await request.server.app.cache.get(adminuserSid);
                if (!cached) {
                    await request.server.app.cache.set(adminuserSid, { jwt: "", type: 4 }, 0);
                    prometheusLogin(request, h);
                }
                else {
                    prometheusLogin(request, h);
                }
            } catch (err) {
                throw err;
            }
        }
        else {
            return h.redirect(LOGIN_PAGE);
        }
    };

    try {
        // Inert allows for the serving of static files
        await server.register(INERT);
        await server.register(HAPI_AUTH_COOKIE);

        // Kibana team doesn't want people using internal Catbox anymore
        const catbox_client = new CATBOX.Client(CATBOX_MEMORY);
        const cache = new CATBOX.Policy({ expiresIn: TWO_HOURS_IN_MS }, catbox_client, 'sessions');
        await catbox_client.start();
        server.app.cache = cache;

        server.auth.strategy('session', 'cookie', {
            password: IRON_COOKIE_PASSWORD,
            cookie: 'sid',
            clearInvalid: true,
            redirectTo: LOGIN_PAGE,
            ttl: TWO_HOURS_IN_MS,
            //FIXME change to true once SSL is enabled (cluster wide, node to node)
            isSecure: false,
            validateFunc: async function (request, session) {
                let cached = await server.app.cache.get(session.sid);
                if (!cached) {
                    return { valid: null, credentials: null };
                }
                // This line is the linch pin of this whole operation
                // It ensures that the JWT is passed around on requests to Elasticsearch
                request.headers['authorization'] = 'Bearer ' + cached.jwt;
                // User type determines which applications show up on Kibana nav
                request.headers[USER_TYPE_HEADER] = cached.type;

                return { valid: true, credentials: cached.jwt };
            }
        });

        const isForbiddenApp = function (path) {
            for (let url of DEV_APPS_STANDALONE_URL) {
                if (path.indexOf(url) > -1) {
                    return true;
                }
            }
            return false;
        };

        // This extension does server-side redirection of standalone dev apps if the user is not a developer
        server.ext({
            type: 'onPostAuth',
            method: function (request, h) {
                if (
                    typeof request.headers !== 'undefined' &&
                    typeof request.headers[USER_TYPE_HEADER] !== 'undefined' &&
                    request.headers[USER_TYPE_HEADER] === REGULAR_ES_USER
                ) {
                    if (isForbiddenApp(request.path)) {
                        return h.redirect('/');
                    }
                }
                return h.continue;
            }
        });

        server.auth.default('session');

        server.route([
            {
                method: ['GET', 'POST'],
                path: '/login',
                options: {
                    handler: login,
                    auth: { mode: 'try' },
                    plugins: { 'hapi-auth-cookie': { redirectTo: false } }
                }
            },
            {
                method: 'GET',
                path: '/logout',
                options: { handler: logout }
            },
            // Explicitly serve the following files for the login page, to avoid automatic redirection
            {
                method: ['GET'],
                path: '/login_page',
                handler: {
                    //TODO Would be nice to have an 'invalid username/password' message on this again
                    file: ABS_PATH + '/plugins/kibana-auth/public/login_page.html'
                },
                options: {
                    auth: { mode: 'optional' },
                    plugins: { 'hapi-auth-cookie': { redirectTo: false } }
                }
            },
            {
                method: ['GET'],
                path: '/login_page/logo.svg',
                handler: {
                    file: ABS_PATH + '/plugins/cira_branding/public/assets/images/cira_logo.svg'
                },
                options: {
                    auth: { mode: 'optional' },
                    plugins: { 'hapi-auth-cookie': { redirectTo: false } }
                }
            },
            {
                method: ['GET'],
                path: '/login_page/kibana.style.css',
                handler: {
                    file: ABS_PATH + '/optimize/bundles/kibana.style.css'
                },
                options: {
                    auth: { mode: 'optional' },
                    plugins: { 'hapi-auth-cookie': { redirectTo: false } }
                }
            },
            {
                method: ['GET'],
                path: '/login_page/commons.style.css',
                handler: {
                    file: ABS_PATH + '/optimize/bundles/commons.style.css'
                },
                options: {
                    auth: { mode: 'optional' },
                    plugins: { 'hapi-auth-cookie': { redirectTo: false } }
                }
            },
            {
                method: ['GET'],
                path: '/prometheus_stats',
                handler: prometheusStats,
                options: {
                    auth: { mode: 'optional' },
                    plugins: { 'hapi-auth-cookie': { redirectTo: false } }
                }
            }
        ]);
    } catch (err) {
        throw err;
    }

};
