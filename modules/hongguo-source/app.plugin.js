const { withAndroidManifest, withInfoPlist } = require('expo/config-plugins');

module.exports = function withHongguoLocalMedia(config) {
  config = withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (application) {
      application.$ = application.$ || {};
      application.$['android:networkSecurityConfig'] = '@xml/hongguo_network_security';
    }
    return config;
  });
  return withInfoPlist(config, (config) => {
    config.modResults.NSAppTransportSecurity = {
      ...(config.modResults.NSAppTransportSecurity || {}),
      NSAllowsLocalNetworking: true,
    };
    return config;
  });
};
