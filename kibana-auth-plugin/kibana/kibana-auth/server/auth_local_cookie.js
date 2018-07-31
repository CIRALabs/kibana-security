// Adapted from https://github.com/elasticfence/kibana-auth-elasticfence under MIT licence

module.exports = function (server, options) {
    const ELASTICSEARCH = require('elasticsearch');
    const UUID = require('uuid/v4');
    const INERT = require('inert');
    const HAPI_AUTH_COOKIE = require('hapi-auth-cookie');
    const ERROR_MESSAGE = 'Invalid username or password';
    const IRON_COOKIE_PASSWORD = 'SykQVCoKX1JNji0CLrQrQ13YO3F5YRuF';
    const TWO_HOURS_IN_MS = 2 * 60 * 60 * 1000;
    const PUBLIC_ELEMENTS = ['/optimize/bundles/commons.style.css', '/optimize/bundles/kibana.style.css', '/src/ui/public/images/kibana.svg'];

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

        let message;
        let username;
        let password;

        //FIXME this shouldn't be embedded in JS...
        let loginForm = function(reply){
            return reply('<!DOCTYPE html>' +
                '<html>' +
                    '<head>' +
                        '<title>Login Required</title>' +
                        '<link rel="stylesheet" href="/login/commons.style.css">' +
                        '<link rel="stylesheet" href="/login/kibana.style.css">' +
                    '</head>' +
                    '<body>' +
                            '<div class="container" style="width: 20%;margin-left: auto;margin-right:auto;margin-top: 10%;text-align: center;">' +
                                '<h1><img width="60%" src="/login/logo.svg"></h1>' +
                                (message ? '<h3>' + message + '</h3><br/>' : '') +
                                '<form id="login-form" method="post" action="/login">' +
                                    '<div class="form-group inner-addon left-addon">' +
                                    '<input type="text" style="margin-bottom:8px;font-size: 1.25em;height: auto;text-align: center;"' +
                                    ' name="username" placeholder="Username" class="form-control">' +
                                    '<input type="password" style="margin-bottom:8px;font-size: 1.25em;height: auto;text-align: center;"' +
                                    ' name="password" placeholder="Password" class="form-control">' +
                                    '</div><div>' +
                                    '<input type="submit" value="Login" class="btn btn-default login" style="width: 60%;font-size: 1.5em;">' +
                                    '</div>' +
                                '</form>' +
                            '</div>' +
                    '</body>' +
                '</html>');
        };

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
                    message = ERROR_MESSAGE;
                    loginForm(reply);
                }
            }).catch(() => {
                message = ERROR_MESSAGE;
                loginForm(reply);
            });
        } else {
            loginForm(reply);
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
            redirectTo: '/login',
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
                path: '/login/logo.svg',
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
                path: '/login/kibana.style.css',
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
                path: '/login/commons.style.css',
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
