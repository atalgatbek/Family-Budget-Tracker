export type User = { id: number; full_name: string; email: string };
export type Family = {
  id: number;
  name: string;
  role: "Admin" | "Member";
  currency: string;
  latest_budget_month: string | null;
};
export type Session = { user: User; families: Family[] };
export type Category = { id: number; name: string; is_active: boolean };
export type BudgetCategory = Category & {
  limit_kzt: number | null;
  spent_kzt: number;
  left_kzt: number | null;
  used_percent: number | null;
};
export type Summary = {
  month: string;
  planned_kzt: number;
  spent_kzt: number;
  remaining_kzt: number;
  income_kzt: number;
  balance_kzt: number;
  review_count: number;
  unbudgeted_kzt: number;
  categories: BudgetCategory[];
  daily: { date: string; amount_kzt: number }[];
};
export type Expense = {
  id: number;
  reference: string;
  family_id: number;
  user_id: number;
  user_name: string;
  category_id: number;
  category_name: string;
  amount_kzt: number;
  expense_date: string;
  created_at: string;
  status: "Saved" | "Needs review";
  note: string;
  has_receipt: boolean;
};
export type ExpensePage = {
  items: Expense[];
  total: number;
  page: number;
  page_size: number;
};
export type Income = {
  id: number;
  user_id: number;
  user_name: string;
  source: string;
  amount_kzt: number;
  income_date: string;
};
export type Member = {
  id: number;
  full_name: string;
  email?: string;
  role: string;
  joined_date: string;
};
export type History = {
  id: number;
  category_name: string;
  changed_by: string;
  old_kzt: number | null;
  new_kzt: number;
  changed_at: string;
  reason: string;
};
export type Workspace = {
  summary: Summary;
  recent: ExpensePage;
  categories: Category[];
  members: Member[];
  income: Income[];
};
