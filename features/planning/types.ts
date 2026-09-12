export type Budget = {
  id: string;
  category: string;
  month: string;
  amount: number;
};

export type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
};

export type SubscriptionCadence =
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'unknown';

export type Subscription = {
  id: string;
  merchant: string;
  amount: number;
  cadence: SubscriptionCadence;
  lastPaidAt: string | null;
  nextExpectedAt: string | null;
  confidence: number | null;
  isActive: boolean;
};

export type PlanningData = {
  budgets: Budget[];
  goals: Goal[];
  subscriptions: Subscription[];
};
