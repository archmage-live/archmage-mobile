/* eslint-env node */
const { withNativeWind } = require('nativewind/metro')
const { getSentryExpoConfig } = require('@sentry/react-native/metro')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname)

config.resolver.sourceExts.push('sql')
config.resolver.assetExts.push('pem', 'p12')

module.exports = withNativeWind(config, { input: './global.css' })
