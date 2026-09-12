import { createBankParser } from './create-parser.ts';

export const ozonParser = createBankParser(
  'ozon',
  [/ozon[ -]?банк/i, /озон[ -]?банк/i, /ozon/i],
  {
    date: [/^дата и время операции$/, /^дата операции$/],
    postedDate: [/^дата обработки$/],
    amount: [/^сумма операции$/],
    expense: [/^расход ₽$/, /^списание$/],
    income: [/^приход ₽$/, /^пополнение$/],
    merchant: [/^получатель$/, /^магазин$/],
    description: [/^назначение платежа$/, /^описание операции$/],
    balance: [/^остаток после операции$/],
  },
);
