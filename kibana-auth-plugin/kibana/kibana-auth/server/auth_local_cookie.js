// Adapted from https://github.com/elasticfence/kibana-auth-elasticfence under MIT licence

module.exports = function (server, options) {
    const ELASTICSEARCH = require('elasticsearch');
    const UUID = require('uuid/v4');
    const INERT = require('inert');
    const HAPI_AUTH_COOKIE = require('hapi-auth-cookie');

    const TWO_HOURS_IN_MS = 2 * 60 * 60 * 1000;
    const LOGIN_PAGE = '/login_page';
    const REGULAR_ES_USER = 4;
    const DEV_APPS_STANDALONE_URL = ['/app/apm', '/app/monitoring', '/app/timelion'];
    const USER_TYPE_HEADER = 'x-es-user-type';

    // Encode cookie with symmetric key encryption using password pulled from config
    const IRON_COOKIE_PASSWORD = server.config().get('kibana-auth.cookie_password');

    ELASTICSEARCH.Client.apis.tokenApi = {
        getToken: function (username, password) {
            return this.transport.request({
                method: 'POST',
                path: '_token',
                headers: {
                    Authorization: 'Basic ' + Buffer.from(username + ':' + password).toString('base64')
                }
            });
        }
    };
    let client = new ELASTICSEARCH.Client({
        apiVersion: 'tokenApi'
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
            client.getToken(username, password).then((response) => {
                if (response.success === 1) {
                    const sid = UUID();
                    request.server.app.cache.set(sid, { jwt: response.result, type: response.user_type }, 0, (err) => {
                        if (err) {
                            return reply(err);
                        }
                        request.cookieAuth.set({ sid: sid, jwt: response.result, type: response.user_type });
                        return reply.redirect('/');
                    });
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

        const cache = server.cache({ segment: 'sessions', expiresIn: TWO_HOURS_IN_MS });
        server.app.cache = cache;

        server.auth.strategy('session', 'cookie', true, {
            password: IRON_COOKIE_PASSWORD,
            cookie: 'sid',
            redirectTo: LOGIN_PAGE,
            ttl: TWO_HOURS_IN_MS,
            //FIXME change to true once SSL is enabled
            isSecure: false,
            validateFunc: function (request, session, callback) {
                cache.get(session.sid, (err, cached) => {
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
                    file: 'plugins/kibana-auth/public/login_page.html'
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
                    file: 'plugins/cira_branding/public/assets/images/cira_logo.svg'
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
                    file: 'optimize/bundles/kibana.style.css'
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
                    file: 'optimize/bundles/commons.style.css'
                },
                config: {
                    auth: { mode: 'optional' },
                    plugins: { 'hapi-auth-cookie': { redirectTo: false } }
                }
            },
        ]);
    });
};
