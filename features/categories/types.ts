export type CategoryDirection = 'expense' | 'income' | 'both';

export type FinanceCategory = {
  id: string;
  name: string;
  direction: CategoryDirection;
  isSystem: boolean;
};

export type CategoryRule = {
  id: string;
  name: string;
  priority: number;
  field: 'merchant' | 'description';
  operator: 'contains';
  value: string;
  direction: CategoryDirection;
  targetCategory: string;
  isActive: boolean;
};

export type CategoryData = {
  categories: FinanceCategory[];
  rules: CategoryRule[];
};
