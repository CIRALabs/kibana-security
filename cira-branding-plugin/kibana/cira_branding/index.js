export default function (kibana) {
    return new kibana.Plugin({
     id: 'cira_branding',
     uiExports: {
       hacks: [
         'plugins/cira_branding/hack'
       ]
      }
    });
  };