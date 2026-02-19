import baseConfig from './playwright.config'

export default {
  ...baseConfig,
  use: {
    ...baseConfig.use,
    baseURL: 'http://localhost:5176',
  },
  webServer: {
    url: 'http://localhost:5176',
    reuseExistingServer: true,
  },
}
