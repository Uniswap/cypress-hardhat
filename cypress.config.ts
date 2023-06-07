/* eslint-disable import/no-unused-modules */
import { defineConfig } from 'cypress'

import { setupHardhatEvents } from './src/plugin'

export default defineConfig({
  video: false,
  e2e: {
    async setupNodeEvents(on, config) {
      await setupHardhatEvents(on, config)
    },
  },
})
