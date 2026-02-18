/**
 * Expo Config Plugin for UWB (NearbyInteraction)
 * 
 * This plugin adds the necessary iOS entitlements and native module
 * for UWB functionality.
 * 
 * Usage in app.json:
 * {
 *   "plugins": ["./plugins/withUWB"]
 * }
 */

const { withInfoPlist, withEntitlementsPlist, withXcodeProject } = require('@expo/config-plugins');

const withUWB = (config) => {
  // Add Info.plist entries
  config = withInfoPlist(config, (config) => {
    config.modResults.NSNearbyInteractionUsageDescription = 
      config.modResults.NSNearbyInteractionUsageDescription || 
      'We use Ultra-Wideband to precisely locate the customer for delivery handoff';
    return config;
  });

  // Add entitlements
  config = withEntitlementsPlist(config, (config) => {
    config.modResults['com.apple.developer.nearby-interaction'] = true;
    return config;
  });

  return config;
};

module.exports = withUWB;
