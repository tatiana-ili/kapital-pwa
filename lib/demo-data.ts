import type {
  BankName,
  FinanceAccount,
  FinanceTransaction,
} from '@/lib/finance-data';

export type DemoTransaction = FinanceTransaction;

export const demoAccounts: FinanceAccount[] = [
  {
    id: 'tbank-black',
    bank: 'Т-Банк',
    name: 'Black',
    currentBalance: 210000,
    currency: 'RUB',
  },
  {
    id: 'sber-main',
    bank: 'Сбер',
    name: 'Основной',
    currentBalance: 350000,
    currency: 'RUB',
  },
  {
    id: 'yandex-plus',
    bank: 'Яндекс Банк',
    name: 'Плюс',
    currentBalance: 75400,
    currency: 'RUB',
  },
  {
    id: 'ozon-card',
    bank: 'Ozon Банк',
    name: 'Ozon Карта',
    currentBalance: 200000,
    currency: 'RUB',
  },
];

const bankAccounts: Array<{ bank: BankName; accountId: string }> =
  demoAccounts.map((account) => ({
    bank: account.bank,
    accountId: account.id,
  }));

const currentExpenses = [
  ['2026-09-11', 'ВкусВилл', 'Продукты', 3420, 0],
  ['2026-09-11', 'Перекрёсток', 'Продукты', 6120, 1],
  ['2026-09-11', 'Яндекс Такси', 'Такси', 1890, 2],
  ['2026-09-10', 'Кофемания', 'Кафе и рестораны', 2450, 0],
  ['2026-09-10', 'Ozon', 'Маркетплейсы', 12990, 3],
  ['2026-09-09', 'Яндекс Еда', 'Доставка еды', 4760, 2],
  ['2026-09-09', 'Самокат', 'Доставка еды', 3200, 1],
  ['2026-09-08', 'Лента', 'Продукты', 6800, 0],
  ['2026-09-08', 'Аптека 36,6', 'Здоровье', 1280, 1],
  ['2026-09-07', 'АЗС Лукойл', 'Автомобиль', 2890, 0],
  ['2026-09-07', 'Wildberries', 'Маркетплейсы', 7320, 3],
  ['2026-09-06', 'Surf Coffee', 'Кафе и рестораны', 1460, 0],
  ['2026-09-06', 'Ozon', 'Маркетплейсы', 24990, 3],
  ['2026-09-05', 'Яндекс Плюс', 'Подписки', 1990, 2],
  ['2026-09-05', 'ВкусВилл', 'Продукты', 5480, 0],
  ['2026-09-04', 'Тануки', 'Кафе и рестораны', 3400, 1],
  ['2026-09-03', 'Аренда квартиры', 'Жильё', 65000, 1],
  ['2026-09-03', 'Мосэнергосбыт', 'Коммунальные услуги', 890, 0],
  ['2026-09-02', 'МТС', 'Связь и интернет', 2400, 0],
  ['2026-09-02', 'Аэрофлот', 'Путешествия', 7500, 1],
  ['2026-09-01', 'АЗС Газпромнефть', 'Автомобиль', 3780, 0],
] as const;

const septemberExpenses: DemoTransaction[] = currentExpenses.map(
  ([date, merchant, category, amount, bankIndex], index) => ({
    id: `sep-exp-${index + 1}`,
    date,
    merchant,
    description: `Оплата: ${merchant}`,
    category,
    bank: bankAccounts[bankIndex].bank,
    accountId: bankAccounts[bankIndex].accountId,
    amount: -amount,
    currency: 'RUB',
    transactionType: 'expense',
    isTransfer: false,
    isRecurring: ['Яндекс Плюс', 'МТС', 'Аренда квартиры'].includes(merchant),
    excludedFromAnalytics: false,
  }),
);

const septemberIncome: DemoTransaction[] = [
  ['sep-income-1', '2026-09-10', 'Зарплата', 'Зарплата', 235000, 1],
  [
    'sep-income-2',
    '2026-09-08',
    'Проектная работа',
    'Дополнительный доход',
    10000,
    0,
  ],
  ['sep-income-3', '2026-09-06', 'Кэшбэк Т-Банк', 'Кэшбэк', 3250, 0],
  ['sep-income-4', '2026-09-01', 'Проценты на остаток', 'Проценты', 1750, 3],
].map(([id, date, merchant, category, amount, bankIndex]) => ({
  id: String(id),
  date: String(date),
  merchant: String(merchant),
  description: String(merchant),
  category: String(category),
  bank: bankAccounts[Number(bankIndex)].bank,
  accountId: bankAccounts[Number(bankIndex)].accountId,
  amount: Number(amount),
  currency: 'RUB' as const,
  transactionType: 'income' as const,
  isTransfer: false,
  isRecurring: merchant === 'Зарплата',
  excludedFromAnalytics: false,
}));

const transferPair: DemoTransaction[] = [
  {
    id: 'transfer-out',
    date: '2026-09-04',
    merchant: 'Перевод на свой счёт',
    description: 'Т-Банк → Сбер',
    category: 'Переводы',
    bank: 'Т-Банк',
    accountId: 'tbank-black',
    amount: -50000,
    currency: 'RUB',
    transactionType: 'transfer',
    isTransfer: true,
    isRecurring: false,
    excludedFromAnalytics: true,
  },
  {
    id: 'transfer-in',
    date: '2026-09-04',
    merchant: 'Пополнение со своего счёта',
    description: 'Т-Банк → Сбер',
    category: 'Переводы',
    bank: 'Сбер',
    accountId: 'sber-main',
    amount: 50000,
    currency: 'RUB',
    transactionType: 'transfer',
    isTransfer: true,
    isRecurring: false,
    excludedFromAnalytics: true,
  },
];

const merchantTemplates = [
  ['Пятёрочка', 'Продукты', 1840],
  ['Перекрёсток', 'Продукты', 4260],
  ['ВкусВилл', 'Продукты', 3180],
  ['Ozon', 'Маркетплейсы', 5990],
  ['Wildberries', 'Маркетплейсы', 3790],
  ['Яндекс Такси', 'Такси', 970],
  ['Яндекс Еда', 'Доставка еды', 2360],
  ['Самокат', 'Доставка еды', 1780],
  ['Лента', 'Продукты', 5120],
  ['Аптека Ригла', 'Здоровье', 1430],
  ['АЗС Лукойл', 'Автомобиль', 2860],
  ['Surf Coffee', 'Кафе и рестораны', 520],
  ['Тануки', 'Кафе и рестораны', 3650],
  ['YouTube Premium', 'Подписки', 399],
  ['Telegram Premium', 'Подписки', 299],
  ['МТС', 'Связь и интернет', 950],
  ['Мосэнергосбыт', 'Коммунальные услуги', 3180],
  ['Кинопоиск', 'Подписки', 399],
  ['Спортмастер', 'Одежда', 4290],
  ['Золотое яблоко', 'Красота', 2650],
  ['РЖД', 'Путешествия', 6820],
  ['Читай-город', 'Образование', 1590],
  ['Детский мир', 'Дети', 2470],
  ['Вкусно — и точка', 'Кафе и рестораны', 890],
] as const;

const historicTransactions: DemoTransaction[] = Array.from(
  { length: 112 },
  (_, index) => {
    const template = merchantTemplates[index % merchantTemplates.length];
    const bank = bankAccounts[index % bankAccounts.length];
    const month = 7 - Math.floor(index / 28);
    const day = (index % 28) + 1;
    const date = new Date(Date.UTC(2026, month, day))
      .toISOString()
      .slice(0, 10);
    const isIncome = index % 29 === 0;
    const merchant = isIncome ? 'Зарплата' : template[0];
    const category = isIncome ? 'Зарплата' : template[1];
    const amount = isIncome
      ? 220000 + (index % 3) * 5000
      : -(template[2] + (index % 7) * 110);
    return {
      id: `history-${index + 1}`,
      date,
      merchant,
      description: isIncome
        ? 'Зачисление заработной платы'
        : `Оплата: ${merchant}`,
      category,
      bank: bank.bank,
      accountId: bank.accountId,
      amount,
      currency: 'RUB',
      transactionType: isIncome ? 'income' : 'expense',
      isTransfer: false,
      isRecurring: [
        'Зарплата',
        'YouTube Premium',
        'Telegram Premium',
        'МТС',
        'Кинопоиск',
      ].includes(merchant),
      excludedFromAnalytics: false,
    };
  },
);

export const demoTransactions = [
  ...septemberExpenses,
  ...septemberIncome,
  ...transferPair,
  ...historicTransactions,
].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

export const demoTransactionCount = demoTransactions.length;
