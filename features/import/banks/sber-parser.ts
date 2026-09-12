import { createBankParser } from './create-parser.ts';

export const sberParser = createBankParser(
  'sber',
  [/сбер/i, /sber/i],
  {
    date: [/^дата и время операции$/, /^дата операции$/],
    postedDate: [/^дата обработки$/, /^дата проводки$/],
    amount: [/^сумма операции$/],
    expense: [/^сумма списания$/],
    income: [/^сумма зачисления$/],
    merchant: [/^получатель$/, /^место операции$/],
    description: [/^назначение платежа$/, /^описание операции$/],
    balance: [/^остаток после операции$/],
  },
);
