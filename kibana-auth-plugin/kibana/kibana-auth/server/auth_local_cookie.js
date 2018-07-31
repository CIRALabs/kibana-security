// Adapted from https://github.com/elasticfence/kibana-auth-elasticfence under MIT licence

module.exports = function (server, options) {
    const ELASTICSEARCH = require('elasticsearch');
    const UUID = require('uuid/v4');
    const INERT = require('inert');
    const HAPI_AUTH_COOKIE = require('hapi-auth-cookie');
    const IRON_COOKIE_PASSWORD = 'SykQVCoKX1JNji0CLrQrQ13YO3F5YRuF';
    const TWO_HOURS_IN_MS = 2 * 60 * 60 * 1000;

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
                            reply(err);
                        }
                        request.cookieAuth.set({ sid: sid, jwt: response.result, type: response.user_type });
                        return reply.redirect('/');
                    });
                } else {
                    //FIXME refactor all of these calls, code duplication
                    return reply.redirect('/login_page');
                }
            }).catch(() => {
                return reply.redirect('/login_page');
            });
        } else {
            return reply.redirect('/login_page');
        }
    };

    const logout = function (request, reply) {
        request.cookieAuth.clear();
        return reply.redirect('/');
    };

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
            redirectTo: '/login_page',
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
                    request.headers['x-es-user-type'] = cached.type;

                    return callback(null, true, cached.jwt);
                });
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
            { method: 'GET', path: '/logout', config: { handler: logout } }
        ]);
    });
};
