FROM node:10.15.2-alpine

ENV KIBANA_VERSION 7.4.0

RUN apk --update add bash tar curl wget && \
    mkdir -p /opt && \
    wget --no-check-certificate -qO- https://artifacts.elastic.co/downloads/kibana/kibana-${KIBANA_VERSION}-linux-x86_64.tar.gz | tar zxv -C /opt && \
    rm -rf /opt/kibana-${KIBANA_VERSION}-linux-x86_64/node && \
    mkdir -p /opt/kibana-${KIBANA_VERSION}-linux-x86_64/node/bin && \
    ln -sf /usr/local/bin/node /opt/kibana-${KIBANA_VERSION}-linux-x86_64/node/bin/node

#RUN sed -e s/\-\-max-http-header-size\=65536//g -i /opt/kibana/bin/kibana

ADD ./plugins/cira-branding-plugin*.zip /plugins/cira-branding-plugin.zip
#ADD ./plugins/kibana-prometheus-exporter*.zip /plugins/kibana-prometheus-exporter.zip
ADD ./plugins/kibana-auth-cira*.zip /plugins/kibana-auth-cira.zip

RUN ls -la /opt/kibana-${KIBANA_VERSION}-linux-x86_64/bin/

# Don't optimize during plugin install, do it on first run
RUN	 /opt/kibana-${KIBANA_VERSION}-linux-x86_64/bin/kibana-plugin install --allow-root "file:///plugins/kibana-auth-cira.zip" && \
#        /opt/kibana-${KIBANA_VERSION}-linux-x86_64/bin/kibana-plugin install --allow-root --no-optimize "file:///plugins/kibana-prometheus-exporter.zip" && \
    rm "/opt/kibana-$KIBANA_VERSION-linux-x86_64/config/kibana.yml" && \
    rm -rf /var/cache/apk/*

ENV PATH /opt/kibana-${KIBANA_VERSION}-linux-x86_64/bin:/usr/local/bin/node:$PATH
RUN mkdir -p /.backup/kibana
COPY config /.backup/kibana/config
RUN rm -f "/opt/kibana-$KIBANA_VERSION/config/kibana.yml"
RUN cp /.backup/kibana/config/kibana.yml /opt/kibana-${KIBANA_VERSION}-linux-x86_64/config/

RUN ln -s /opt/kibana-${KIBANA_VERSION}-linux-x86_64/ /opt/kibana

RUN apk add libc6-compat libuuid nss expat

ENV KIBANA_HOST="0.0.0.0" 

EXPOSE 5601

ENTRYPOINT ["kibana",  "--allow-root"]
