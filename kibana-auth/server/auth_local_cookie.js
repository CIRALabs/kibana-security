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
    const {first} = require('rxjs/operators');
    const Boom = require('boom');

    const TWO_HOURS_IN_MS = 2 * 60 * 60 * 1000;
    const LOGIN_PAGE = '/login_page';
    const LOGIN_PAGE_INVALID = '/login_page_invalid';
    const USER_INFO_PAGE = '/user_info_page';
    const DEVELOPER = 6;
    const OLD_PASSWORD = 1;
    const DEV_APPS_STANDALONE_URL = [
        '/app/apm', '/app/monitoring', '/app/ml', '/app/infra', '/app/graph', '/app/uptime', '/app/timelion', '/app/siem'
    ];

    const legacyEsConfig = await server.newPlatform.setup.core.elasticsearch.legacy.config$.pipe(first()).toPromise();

    const USER_TYPE_HEADER = 'x-es-user-type';
    const ABS_PATH = server.config().get('kibana-auth.kibana_install_dir');
    const ADMIN_USER = legacyEsConfig.username;
    const ADMIN_PASS = legacyEsConfig.password;

    // Encode cookie with symmetric key encryption using password pulled from config
    const IRON_COOKIE_PASSWORD = server.config().get('kibana-auth.cookie_password');

    const DISABLE_PASSWORD_CHANGE_FORM = server.config().get('kibana-auth.disable_password_change_form');

    ELASTICSEARCH.Client.apis.tokenApi = {
        getToken: function (username, password) {
            return this.transport.request({
                method: 'POST',
                path: '/_token',
                headers: {
                    Authorization: 'Basic ' + Buffer.from(username + ':' + password).toString('base64')
                }
            });
        },
        getUserInfo: function (authorization) {
            return this.transport.request({
                method: 'GET',
                path: '/user_info',
                headers: {
                    Authorization: authorization
                }
            })
        },
        changePassword: function (authorization, password, newPassword) {
            return this.transport.request({
                method: 'POST',
                path: '/change_password',
                body: {
                    password: password,
                    newPassword: newPassword
                },
                headers: {
                    Authorization: authorization
                }
            })
        }
    };
    let client = new ELASTICSEARCH.Client({
        apiVersion: 'tokenApi',
        host: legacyEsConfig.hosts[0]
    });

    const userInfo = async function (request, h) {
        let response;
        try {
            response = await client.getUserInfo(h.request.headers.authorization);
        } catch (err) {
            response = {success: 0};
        }
        if (response.success === 1) {
            return response
        } else {
            return h.redirect(USER_INFO_PAGE)
        }
    };

    const changePassword = async function (request, h) {
        let password;
        let newPassword;
        let retypeNewPassword;

        if (request.method === 'post') {
            password = request.payload.password;
            newPassword = request.payload.newPassword;
            retypeNewPassword = request.payload.retypeNewPassword;
        }

        let response;
        if (!DISABLE_PASSWORD_CHANGE_FORM) {
            if (password || newPassword || retypeNewPassword) {
                if (newPassword === retypeNewPassword) {
                    try {
                        response = await client.changePassword(h.request.headers.authorization, password, newPassword);
                    } catch (err) {
                        response = {success: 0};
                    }
                    if (response.success === 1) {
                        return '/';
                    } else {
                        throw Boom.forbidden('Incorrect authentication credentials');
                    }
                }else {
                    return Boom.forbidden('Passwords do not match');
                }
            } else {
                return Boom.forbidden('All form inputs are required');
            }
        } else {
            return Boom.forbidden('Password change form is disable');
        }
    };

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
            let response;
            try {
                response = await client.getToken(username, password);
            } catch (err) {
                response = { success: 0 };
            }
            if (response.success === 1) {
                const sid = UUID();
                try {
                    await request.server.app.cache.set(sid, { jwt: response.result, type: response.user_type }, 0);
                    request.cookieAuth.set({ sid: sid, jwt: response.result, type: response.user_type });
                } catch (err) {
                    server.log(['error'], 'Failed to set JWT in cache, err: ' + err);
                }
              if (response.user_type === OLD_PASSWORD) {
                  return USER_INFO_PAGE;
              } else {
                  return '/';
              }
            }
            else {
                return Boom.forbidden('Incorrect authentication credentials');
            }
        }
        else {
            return Boom.forbidden('No username or password provided');
        }
    };

    const logout = function (request, h) {
        request.cookieAuth.clear();
        return h.redirect(LOGIN_PAGE);
    };

    const adminuserSid = UUID();
    const prometheusStats = async function (request, h) {
        let username;
        let password;

        if (
            typeof request.headers !== 'undefined' &&
            typeof request.headers['authorization'] !== 'undefined'
        ) {
            let b64 = new Buffer(request.headers['authorization'].split(' ')[1], 'base64');
            let userAndPass = b64.toString().split(':');

            username = userAndPass[0];
            password = userAndPass[1];
        }

        //TODO Switch to retrieving a token using ES API à la login function
        if (username === ADMIN_USER && password === ADMIN_PASS) {
            try {
                let cached = await request.server.app.cache.get(adminuserSid);
                if (!cached) {
                    await request.server.app.cache.set(adminuserSid, { jwt: '', type: 4 }, 0);
                }

                /* FIXME This call is necessary to avoid the authentication framework.
                If you follow the execution in a debugger, the actual stats are successfully retrieved.
                The problem arises in the marshalling of the response to JSON (circular error). There's
                not a way I can see to address this, because it's all handled internally by Kibana/Hapi...
                 */
                return await server.inject({
                    url: '/api/status?extended',
                    credentials: { sid: adminuserSid, jwt: '', type: 4 }
                });
            } catch (err) {
                throw err;
            }
        }
        return h.redirect(LOGIN_PAGE);
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
                    request.headers[USER_TYPE_HEADER] < DEVELOPER
                ) {
                    if (isForbiddenApp(request.path)) {
                        return h
                            .redirect('/')
                            .takeover();
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
                    file: ABS_PATH + '/plugins/kibana-auth/public/login_page.html'
                },
                options: {
                    auth: { mode: 'optional' },
                    plugins: { 'hapi-auth-cookie': { redirectTo: false } }
                }
            },
            {
                method: ['GET'],
                path: '/user_info_page',
                handler: {
                    file: ABS_PATH + '/plugins/kibana-auth/public/user_info_page.html'
                },
                options: {
                    auth: { mode: 'required' },
                    plugins: { 'hapi-auth-cookie': { redirectTo: false } }
                }
            },
            {
                method: ['GET'],
                path: '/user_info',
                options: {
                    handler: userInfo,
                    auth: { mode: 'required' },
                    plugins: { 'hapi-auth-cookie': { redirectTo: false } }
                }
            },
            {
                method: ['POST'],
                path: '/change_password',
                options: {
                    handler: changePassword,
                    auth: { mode: 'required' },
                    plugins: { 'hapi-auth-cookie': { redirectTo: false } }
                }
            },
            {
                method: ['GET'],
                path: '/logo.svg',
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
                path: '/kibana.style.css',
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
                path: '/commons.style.css',
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
                path: '/cira_labs.style.css',
                handler: {
                    file: ABS_PATH + '/plugins/kibana-auth/public/cira_labs.style.css'
                },
                options: {
                    auth: { mode: 'optional' },
                    plugins: { 'hapi-auth-cookie': { redirectTo: false } }
                }
            },
            {
                method: ['GET'],
                path: '/fetch_form.js',
                handler: {
                    file: ABS_PATH + '/plugins/kibana-auth/public/fetch_form.js'
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
