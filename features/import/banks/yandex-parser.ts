import { createBankParser } from './create-parser.ts';

export const yandexParser = createBankParser(
  'yandex',
  [/яндекс[ -]?банк/i, /yandex[ -]?bank/i, /ya[ -]?bank/i],
  {
    date: [/^дата и время$/, /^дата операции$/],
    postedDate: [/^дата проведения$/],
    amount: [/^сумма операции$/],
    expense: [/^списано$/],
    income: [/^зачислено$/],
    merchant: [/^название$/, /^получатель$/],
    description: [/^детали операции$/, /^назначение платежа$/],
    balance: [/^остаток после операции$/],
  },
);
