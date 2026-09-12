import { createBankParser } from './create-parser.ts';

export const tbankParser = createBankParser(
  'tbank',
  [/т[ -]?банк/i, /тинькофф/i, /tinkoff/i, /tbank/i],
  {
    date: [/^дата и время операции$/, /^дата операции$/],
    postedDate: [/^дата обработки$/],
    amount: [/^сумма операции$/],
    merchant: [/^название операции$/, /^магазин$/],
    description: [/^описание$/, /^категория и описание$/],
    balance: [/^остаток после операции$/],
  },
);
