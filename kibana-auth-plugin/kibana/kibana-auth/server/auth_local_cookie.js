// Adapted from https://github.com/elasticfence/kibana-auth-elasticfence under MIT licence
// To log (for debugging):
// server.log(['info'], 'Log message here');

module.exports = function (server, options) {
    const ELASTICSEARCH = require('elasticsearch');
    const UUID = require('uuid/v4');
    const INERT = require('inert');
    const HAPI_AUTH_COOKIE = require('hapi-auth-cookie');
    const CATBOX_MEMORY = require('catbox-memory');

    const TWO_HOURS_IN_MS = 2 * 60 * 60 * 1000;
    const LOGIN_PAGE = '/login_page';
    const REGULAR_ES_USER = 4;
    const DEV_APPS_STANDALONE_URL = [
        '/app/apm', '/app/monitoring', '/app/timelion', '/app/canvas', '/app/ml', '/app/infra'
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
        host: server.config().get('elasticsearch.url')
    });

    const login = function (request, reply) {

        if (request.auth.isAuthenticated) {
            return reply.continue();
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
            client.getToken(username, password).then(async (response) => {
                if (response.success === 1) {
                    const sid = UUID();
                    try {
                        await request.server.app.cache.set(sid, { jwt: response.result, type: response.user_type }, 0);
                    } catch (err) {
                        server.log(['error'], 'Failed to set JWT in cache, err: ' + err);
                    }
                    request.cookieAuth.set({ sid: sid, jwt: response.result, type: response.user_type });
                    return reply.redirect('/');
                }
                else {
                    return reply.redirect(LOGIN_PAGE);
                }
            }).catch(() => {
                return reply.redirect(LOGIN_PAGE);
            });
        }
        else {
            return reply.redirect(LOGIN_PAGE);
        }
    };

    const logout = function (request, reply) {
        request.cookieAuth.clear();
        return reply.redirect(LOGIN_PAGE);
    };

    const adminuserSid = UUID();
    const prometheusLogin = function (request, reply) {
        request.cookieAuth.set({ sid: adminuserSid, jwt: "", type: 4 });
        return reply.redirect('/api/status?extended');
    };
    const prometheusStats = function (request, reply) {
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
            request.server.app.cache.get(adminuserSid, (err, cached) => {
                if (err) {
                    throw err;
                }

                if (!cached) {
                    request.server.app.cache.set(adminuserSid, { jwt: "", type: 4 }, 0, (err) => {
                        if (err) {
                            throw err;
                        }
                        prometheusLogin(request, reply);
                    });
                }
                else {
                    prometheusLogin(request, reply);
                }
            });
        }
        else {
            return reply.redirect(LOGIN_PAGE);
        }
    };

    // Inert allows for the serving of static files
    server.register(INERT, (err) => {
        if (err) {
            throw err;
        }
    });
    server.register(HAPI_AUTH_COOKIE, (err) => {
        if (err) {
            throw err;
        }

        server.cache.provision({ engine: CATBOX_MEMORY, name: CACHE_NAME }, (err) => {
            if (err) {
                throw err;
            }

            const cache = server.cache({ cache: CACHE_NAME, segment: 'sessions', expiresIn: TWO_HOURS_IN_MS });
            // For some reason Kibana doesn't start caches anymore, so this accesses the internal memory
            // cache to give it a kick manually
            if (!cache.isReady()) {
                cache._cache.connection.start(() => {
                    server.log(['info'], 'Started memory cache for ' + CACHE_NAME);
                });
            }
            server.app.cache = cache;
        });

        server.auth.strategy('session', 'cookie', true, {
            password: IRON_COOKIE_PASSWORD,
            cookie: 'sid',
            clearInvalid: true,
            redirectTo: LOGIN_PAGE,
            ttl: TWO_HOURS_IN_MS,
            //FIXME change to true once SSL is enabled (cluster wide, node to node)
            isSecure: false,
            validateFunc: function (request, session, callback) {
                server.app.cache.get(session.sid, (err, cached) => {
                    if (err) {
                        return callback(err, false);
                    }

                    if (!cached) {
                        return callback(null, false);
                    }

                    // This line is the linch pin of this whole operation
                    // It ensures that the JWT is passed around on requests to Elasticsearch
                    request.headers['authorization'] = 'Bearer ' + cached.jwt;
                    // User type determines which applications show up on Kibana nav
                    request.headers[USER_TYPE_HEADER] = cached.type;

                    return callback(null, true, cached.jwt);
                });
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
            method: function (request, reply) {
                if (
                    typeof request.headers !== 'undefined' &&
                    typeof request.headers[USER_TYPE_HEADER] !== 'undefined' &&
                    request.headers[USER_TYPE_HEADER] === REGULAR_ES_USER
                ) {
                    if (isForbiddenApp(request.path)) {
                        return reply.redirect('/');
                    }
                }
                return reply.continue();
            }
        });

        server.route([
            {
                method: ['GET', 'POST'],
                path: '/login',
                config: {
                    handler: login,
                    auth: { mode: 'try' },
                    plugins: { 'hapi-auth-cookie': { redirectTo: false } }
                }
            },
            {
                method: 'GET',
                path: '/logout',
                config: { handler: logout }
            },
            // Explicitly serve the following files for the login page, to avoid automatic redirection
            {
                method: ['GET'],
                path: '/login_page',
                handler: {
                    //TODO Would be nice to have an 'invalid username/password' message on this again
                    file: ABS_PATH + '/plugins/kibana-auth/public/login_page.html'
                },
                config: {
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
                config: {
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
                config: {
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
                config: {
                    auth: { mode: 'optional' },
                    plugins: { 'hapi-auth-cookie': { redirectTo: false } }
                }
            },
            {
                method: ['GET'],
                path: '/prometheus_stats',
                handler: prometheusStats,
                config: {
                    auth: { mode: 'optional' },
                    plugins: { 'hapi-auth-cookie': { redirectTo: false } }
                }
            }
        ]);
    });
};
