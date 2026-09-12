import type {
  Budget,
  Goal,
  PlanningData,
  Subscription,
} from '../features/planning/types.ts';

const KEY = 'kapital.demo.planning.v1';
export const LOCAL_PLANNING_EVENT = 'kapital:planning-updated';

export function loadLocalPlanningData(): PlanningData {
  if (typeof window === 'undefined')
    return { budgets: [], goals: [], subscriptions: [] };
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    return {
      budgets: Array.isArray(saved?.budgets) ? saved.budgets : [],
      goals: Array.isArray(saved?.goals) ? saved.goals : [],
      subscriptions: Array.isArray(saved?.subscriptions)
        ? saved.subscriptions
        : [],
    };
  } catch {
    return { budgets: [], goals: [], subscriptions: [] };
  }
}

function write(data: PlanningData) {
  window.localStorage.setItem(KEY, JSON.stringify(data));
  window.dispatchEvent(new Event(LOCAL_PLANNING_EVENT));
}

export function saveLocalBudget(budget: Omit<Budget, 'id'>) {
  const data = loadLocalPlanningData();
  const current = data.budgets.find(
    (item) => item.category === budget.category && item.month === budget.month,
  );
  data.budgets = current
    ? data.budgets.map((item) =>
        item.id === current.id ? { ...item, ...budget } : item,
      )
    : [...data.budgets, { ...budget, id: crypto.randomUUID() }];
  write(data);
}

export function deleteLocalBudget(id: string) {
  const data = loadLocalPlanningData();
  data.budgets = data.budgets.filter((item) => item.id !== id);
  write(data);
}

export function renameLocalBudgetCategory(oldName: string, newName: string) {
  const data = loadLocalPlanningData();
  data.budgets = data.budgets.map((item) =>
    item.category === oldName ? { ...item, category: newName } : item,
  );
  write(data);
}

export function saveLocalGoal(goal: Omit<Goal, 'id'> & { id?: string }) {
  const data = loadLocalPlanningData();
  if (goal.id) {
    data.goals = data.goals.map((item) =>
      item.id === goal.id ? ({ ...item, ...goal } as Goal) : item,
    );
  } else {
    data.goals.push({ ...goal, id: crypto.randomUUID() });
  }
  write(data);
}

export function deleteLocalGoal(id: string) {
  const data = loadLocalPlanningData();
  data.goals = data.goals.filter((item) => item.id !== id);
  write(data);
}

export function saveLocalSubscription(
  subscription: Omit<Subscription, 'id'> & { id?: string },
) {
  const data = loadLocalPlanningData();
  if (subscription.id) {
    data.subscriptions = data.subscriptions.map((item) =>
      item.id === subscription.id
        ? ({ ...item, ...subscription } as Subscription)
        : item,
    );
  } else {
    data.subscriptions.push({ ...subscription, id: crypto.randomUUID() });
  }
  write(data);
}

export function deleteLocalSubscription(id: string) {
  const data = loadLocalPlanningData();
  data.subscriptions = data.subscriptions.filter((item) => item.id !== id);
  write(data);
}
