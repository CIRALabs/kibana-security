The following settings must be set in kibana.yml:

```yaml
elasticsearch.username: ""
elasticsearch.password: ""
xpack.security.enabled: false
server.xsrf.whitelist: [/login, /logout, /_token]
kibana-auth.cookie_password: "some_32+_character_password"
kibana-auth.kibana_install_dir: "/opt/kibana"
```
