import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const wallets = sqliteTable(
  'wallets',
  {
    id: integer('id').primaryKey(),
    sortId: integer('id').unique().notNull(),
    name: text('name').unique().notNull()
  },
  (wallets) => ({
    nameIdx: uniqueIndex('nameIdx').on(wallets.name)
  })
)

export type Wallet = typeof wallets.$inferSelect
export type InsertWallet = typeof wallets.$inferInsert

const a = {} as Wallet
a.name
