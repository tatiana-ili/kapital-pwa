import type { BankCode, FinanceTransaction } from '../../lib/finance-data.ts';

const transferWords =
  /перевод|transfer|сбп|между счетами|на карту|с карты|пополнение сч[её]та/i;

export function looksLikeTransfer(text: string) {
  return transferWords.test(text);
}

export function isDefiniteInternalTransfer(bank: BankCode, text: string) {
  if (
    /между своими счетами|перевод между счетами одного клиента|перевод себе|внутренний перевод/i.test(
      text,
    )
  ) {
    return true;
  }
  if (bank === 'yandex') {
    return /перенос денежных средств с эдс на банковский сч[её]т/i.test(text);
  }
  if (bank === 'sber') {
    return /sberbank onl@in (?:vklad-karta|karta-vklad)/i.test(text);
  }
  return false;
}

export function findTransferCounterpart(
  input: {
    accountId?: string;
    date: string;
    amount: number;
    merchant: string;
    description: string;
  },
  transactions: FinanceTransaction[],
) {
  if (!input.accountId || !input.date || !input.amount) return undefined;
  const matches = transactions.filter((candidate) => {
    if (
      candidate.accountId === input.accountId ||
      candidate.transferGroupId ||
      Math.sign(candidate.amount) === Math.sign(input.amount)
    ) {
      return false;
    }
    const dayDifference =
      Math.abs(
        Date.parse(`${candidate.date}T00:00:00Z`) -
          Date.parse(`${input.date}T00:00:00Z`),
      ) / 86_400_000;
    if (!Number.isFinite(dayDifference) || dayDifference > 3) return false;
    const amountDifference = Math.abs(candidate.amount + input.amount);
    if (amountDifference > Math.max(1, Math.abs(input.amount) * 0.005)) {
      return false;
    }
    return looksLikeTransfer(
      `${input.merchant} ${input.description} ${candidate.merchant} ${candidate.description}`,
    );
  });
  return matches.length === 1 ? matches[0] : undefined;
}
