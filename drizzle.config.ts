import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './lib/schema',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'expo'
})
