The following settings must be set in kibana.yml:

```yaml
xpack.security.enabled: false
server.xsrf.whitelist: [/login, /logout, /_token]
```