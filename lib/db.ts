import { drizzle } from 'drizzle-orm/expo-sqlite'
import { openDatabaseSync } from 'expo-sqlite'

export const expoDb = openDatabaseSync('archmage.db', { enableChangeListener: true })
export const drizzleDb = drizzle(expoDb)

export default drizzleDb
