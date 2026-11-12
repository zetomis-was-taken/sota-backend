import { pgSequence } from 'drizzle-orm/pg-core';

/** Shared sequence for globally unique `TKT-` and `SHP-` invoice numbers. */
export const invoiceSeq = pgSequence('invoice_seq', {
  startWith: 1,
  increment: 1,
});
