export type User = { id: number; full_name: string; email: string };
export type Family = {
  id: number;
  name: string;
  role: "Admin" | "Member";
  currency: string;
  latest_budget_month: string | null;
  auto_approve_kzt: number | null;
};
export type Session = {
  user: User;
  families: Family[];
  session_expires_at?: string;
};
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
export type Goal = {
  id: number;
  name: string;
  target_kzt: number;
  saved_kzt: number;
  deadline: string | null;
};
export type Workspace = {
  summary: Summary;
  recent: ExpensePage;
  categories: Category[];
  members: Member[];
  income: Income[];
  goals: Goal[];
  requests: PurchaseRequest[];
};
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type PurchaseRequest = {
  id: number;
  user_id: number;
  user_name: string;
  category_id: number;
  category_name: string;
  amount_kzt: number;
  note: string;
  status: RequestStatus;
  auto: boolean;
  reason: string;
  decided_by_name: string | null;
  decided_at: string | null;
  created_at: string;
  expense_id: number | null;
  left_kzt: number | null;
  over_limit: boolean;
};
export type AppNotification = {
  id: number;
  family_id: number;
  family_name: string;
  kind:
    | "request_new"
    | "request_auto"
    | "request_approved"
    | "request_rejected"
    | "limit_warning"
    | "limit_over"
    | "goal_reached";
  payload: Record<string, string | number>;
  created_at: string;
  read: boolean;
};
