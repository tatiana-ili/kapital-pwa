import type { CategoryRule } from './types.ts';
import {
  categoryRuleKeywords,
  categoryRuleName,
  compareCategoryRules,
} from './rules.ts';

export type CategoryRuleAuditPlan = {
  rules: CategoryRule[];
  updates: Array<{ id: string; name: string; value: string }>;
  deleteIds: string[];
  duplicatesRemoved: number;
  mergedRules: number;
  mergedGroups: number;
};

export type CategoryRuleAuditReport = {
  checkedTransactions: number;
  recategorized: number;
  duplicatesRemoved: number;
  mergedRules: number;
  mergedGroups: number;
};

function conditionKey(rule: CategoryRule) {
  const value =
    rule.field === 'all'
      ? [...new Set(categoryRuleKeywords(rule.value))].sort().join('\u0000')
      : rule.value.trim().toLocaleLowerCase('ru');
  return JSON.stringify([
    rule.field,
    rule.operator,
    rule.direction,
    rule.targetCategory,
    value,
  ]);
}

function uniqueKeywords(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase('ru');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function planCategoryRuleAudit(
  rules: CategoryRule[],
): CategoryRuleAuditPlan {
  const sorted = [...rules].sort(compareCategoryRules);
  const byCondition = new Map<string, CategoryRule[]>();
  for (const rule of sorted) {
    const key = conditionKey(rule);
    byCondition.set(key, [...(byCondition.get(key) ?? []), rule]);
  }

  const duplicates = new Set<string>();
  for (const group of byCondition.values()) {
    const keeper = group.find((rule) => rule.isActive) ?? group[0];
    for (const rule of group) {
      if (rule.id !== keeper.id) duplicates.add(rule.id);
    }
  }

  const distinct = sorted.filter((rule) => !duplicates.has(rule.id));
  const merged = new Set<string>();
  const updates: CategoryRuleAuditPlan['updates'] = [];
  const result: CategoryRule[] = [];
  let mergedGroups = 0;

  for (let index = 0; index < distinct.length;) {
    const first = distinct[index];
    if (first.field !== 'all') {
      result.push(first);
      index += 1;
      continue;
    }
    let keywords = uniqueKeywords(
      first.value.split(',').map((part) => part.trim()),
    );
    let end = index + 1;
    while (end < distinct.length) {
      const next = distinct[end];
      if (
        next.field !== 'all' ||
        next.direction !== first.direction ||
        next.targetCategory !== first.targetCategory ||
        next.isActive !== first.isActive
      ) {
        break;
      }
      const joined = uniqueKeywords([
        ...keywords,
        ...next.value.split(',').map((part) => part.trim()),
      ]);
      if (joined.join(', ').length > 120) break;
      keywords = joined;
      merged.add(next.id);
      end += 1;
    }
    if (end > index + 1) {
      mergedGroups += 1;
      const value = keywords.join(', ');
      const name = categoryRuleName('all', value);
      result.push({ ...first, value, name });
      updates.push({ id: first.id, value, name });
    } else {
      result.push(first);
    }
    index = end;
  }

  return {
    rules: result,
    updates,
    deleteIds: [...duplicates, ...merged],
    duplicatesRemoved: duplicates.size,
    mergedRules: merged.size,
    mergedGroups,
  };
}
