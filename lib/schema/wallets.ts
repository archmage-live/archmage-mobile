import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const wallets = sqliteTable(
  'wallets',
  {
    id: integer('id').primaryKey(),
    sortId: integer('sortId').unique().notNull(),
    type: text('type').notNull(),
    name: text('name').unique().notNull(),
    hash: text('hash').unique().notNull(),
    info: text('info', { mode: 'json' }).notNull(),
    createdAt: integer('createdAt').notNull()
  },
  (wallets) => ({
    typeIdx: uniqueIndex('typeIdx').on(wallets.type)
  })
)

export type Wallet = typeof wallets.$inferSelect
export type InsertWallet = typeof wallets.$inferInsert
