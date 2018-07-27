// Adapted from https://github.com/elasticfence/kibana-auth-elasticfence under MIT licence
const elasticsearch = require('elasticsearch');

module.exports = function (server, options) {

    const tokenApi = {
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

    const login = function (request, reply) {

        if (request.auth.isAuthenticated) {
            return reply.continue();
        }

        let message;
        let username;
        let password;
        let checked = false;
        let processing = true;

        let loginForm = function(reply){
            return reply('<!DOCTYPE html>' +
                '<html>' +
                    '<head>' +
                        '<title>Login Required</title>' +
                        '<link rel="stylesheet" href="/optimize/bundles/commons.style.css">' +
                        '<link rel="stylesheet" href="/optimize/bundles/kibana.style.css">' +
                    '</head>' +
                    '<body>' +
                        '<center>' +
                            '<div class="container" style="width: 20%;margin-left: auto;margin-right:auto;margin-top: 10%;">' +
                                '<h1 style="background-color: #e8488b"><img width="60%" src="/src/ui/public/images/kibana.svg"></h1>' +
                                (message ? '<h3>' + message + '</h3><br/>' : '') +
                                '<form id="login-form" method="post" action="/login">' +
                                    '<div class="form-group inner-addon left-addon">' +
                                    '<input type="text" style="margin-bottom:8px;font-size: 1.25em;height: auto;" name="username" placeholder="Username" class="form-control">' +
                                    '<input type="password" style="font-size: 1.25em;height: auto;" name="password" placeholder="Password" class="form-control">' +
                                    '</div><div style="width:200px;margin-left:auto;margin-right:auto;">' +
                                    '<input type="submit" value="Login" class="btn btn-default login" style="width: 80%;font-size: 1.5em;">' +
                                    '</div>' +
                                '</form>' +
                            '</div>' +
                        '</center>' +
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

        if (!username && !password) {
            processing = false;
        }

        if (username || password) {
            elasticsearch.Client.apis.tokenApi = tokenApi;
            let client = new elasticsearch.Client({
               apiVersion: 'tokenApi'
            });
            client.getToken(username, password).then((response) => {
                if (response.success === 1) {
                    checked = true;
                    let uuid = 1;
                    const sid = String(++uuid);
                    request.server.app.cache.set(sid, { username: username }, 0, (err) => {
                        if (err) {
                            reply(err);
                        }

                        request.cookieAuth.set({ sid: sid });
                        return reply.redirect("/");
                    });
                } else {
                    message = 'Invalid username or password';
                    loginForm(reply);
                }
            }).catch(() => {
                message = 'Invalid username or password';
                loginForm(reply);
            });
        } else if (request.method === 'post') {
            processing = false;
            message = 'Missing username or password';
        }

        if (!checked && !processing) {
            loginForm(reply);
        }
    };

    const logout = function (request, reply) {
        request.cookieAuth.clear();
        return reply.redirect('/');
    };

    server.register(require('hapi-auth-cookie'), (err) => {
        //FIXME put something good here
        const authHash = 'SykQVCoKX1JNji0CLrQrQ13YO3F5YRuF';

        if (err) {
            throw err;
        }

        // 2 hours
        const cache = server.cache({ segment: 'sessions', expiresIn: 2 * 60 * 60 * 1000 });
        server.app.cache = cache;

        server.auth.strategy('session', 'cookie', true, {
            password: authHash,
            cookie: 'sid',
            redirectTo: '/login',
            isSecure: false,
            validateFunc: function (request, session, callback) {
                cache.get(session.sid, (err, cached) => {
                    if (err) {
                        return callback(err, false);
                    }

                    if (!cached) {
                        return callback(null, false);
                    }

                    return callback(null, true, cached.username);
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
            { method: 'GET', path: '/logout', config: { handler: logout } }
        ]);
    });
};
