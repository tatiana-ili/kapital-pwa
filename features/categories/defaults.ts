import type { CategoryDirection, FinanceCategory } from './types.ts';

export const expenseCategoryNames = [
  'Продукты',
  'Кафе и рестораны',
  'Доставка еды',
  'Транспорт',
  'Такси',
  'Автомобиль',
  'Жильё',
  'Коммунальные услуги',
  'Связь и интернет',
  'Подписки',
  'Маркетплейсы',
  'Одежда',
  'Красота',
  'Здоровье',
  'Развлечения',
  'Путешествия',
  'Образование',
  'Подарки',
  'Дети',
  'Переводы',
  'Налоги',
  'Финансовые услуги',
  'Наличные',
  'Прочее',
] as const;

export const incomeCategoryNames = [
  'Зарплата',
  'Дополнительный доход',
  'Возврат',
  'Проценты',
  'Кэшбэк',
  'Подарки',
  'Прочее',
] as const;

export const defaultCategories: FinanceCategory[] = [
  ...expenseCategoryNames
    .filter((name) => name !== 'Переводы' && name !== 'Прочее')
    .map((name, index) => ({
      id: `system-expense-${index}`,
      name,
      direction: 'expense' as CategoryDirection,
      isSystem: true,
    })),
  ...incomeCategoryNames
    .filter((name) => name !== 'Прочее')
    .map((name, index) => ({
      id: `system-income-${index}`,
      name,
      direction: 'income' as CategoryDirection,
      isSystem: true,
    })),
  {
    id: 'system-both-transfer',
    name: 'Переводы',
    direction: 'both',
    isSystem: true,
  },
  {
    id: 'system-both-other',
    name: 'Прочее',
    direction: 'both',
    isSystem: true,
  },
];

export function categoriesForAmount(
  categories: FinanceCategory[],
  amount: number,
) {
  const direction = amount >= 0 ? 'income' : 'expense';
  return categories.filter(
    (category) =>
      category.direction === direction || category.direction === 'both',
  );
}
