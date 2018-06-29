export default function (kibana) {
    return new kibana.Plugin({
     uiExports: {
       app: {
          title: 'cira_branding',
          order: -100,
          description: 'CIRA Corporate Branding Style',
          main: 'plugins/cira_branding/index.js',
          hidden: true
       }
      }
    });
  };