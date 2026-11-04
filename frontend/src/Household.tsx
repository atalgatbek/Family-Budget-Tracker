import { Archive, BadgeCheck, Pencil, Plus, ShieldCheck } from "lucide-react";
import { dateLabel, initials } from "./api";
import { CategoryIcon } from "./components";
import type { Action } from "./ActionModal";
import type { Family, User, Workspace } from "./types";

export default function Household({
  data,
  family,
  user,
  onAction,
}: {
  data: Workspace;
  family: Family;
  user: User;
  onAction: (action: Action) => void;
}) {
  const admin = family.role === "Admin";
  return (
    <>
      <section className="household-banner">
        <div className="household-symbol">{initials(family.name)}</div>
        <div>
          <span className="eyebrow">YOUR SHARED SPACE</span>
          <h2>{family.name}</h2>
          <p>
            {data.members.length} members · KZT · A budget to build together
          </p>
        </div>
        {admin && (
          <button
            className="button secondary"
            onClick={() => onAction({ kind: "family" })}
          >
            <Pencil size={15} /> Edit name
          </button>
        )}
      </section>
      <div className="household-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>The people behind the plan</h2>
              <p>Everyone has a part to play.</p>
            </div>
            {admin && (
              <button
                className="text-button"
                onClick={() => onAction({ kind: "member" })}
              >
                <Plus size={16} /> Add member
              </button>
            )}
          </div>
          <div className="members-list">
            {data.members.map((member) => (
              <div className="member-row" key={member.id}>
                <span className="avatar">{initials(member.full_name)}</span>
                <div>
                  <strong>
                    {member.full_name}
                    {member.id === user.id && (
                      <small className="you-label">you</small>
                    )}
                  </strong>
                  <small>
                    {member.email ?? `Joined ${dateLabel(member.joined_date)}`}
                  </small>
                </div>
                <span className={`role-badge ${member.role.toLowerCase()}`}>
                  {member.role === "Admin" && <BadgeCheck size={13} />}
                  {member.role}
                </span>
              </div>
            ))}
          </div>
          <div className="privacy-note">
            <ShieldCheck size={20} />
            <div>
              <strong>Shared totals. Personal boundaries.</strong>
              <p>
                Members manage their own expenses and receipts. Admins manage
                the household’s full budget. Other households stay private.
              </p>
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Your spending categories</h2>
              <p>Organized around the way you live.</p>
            </div>
            {admin && (
              <button
                className="text-button"
                onClick={() => onAction({ kind: "category" })}
              >
                <Plus size={16} /> Add
              </button>
            )}
          </div>
          <div className="category-settings">
            {data.categories.map((category) => (
              <div
                key={category.id}
                className={!category.is_active ? "archived" : ""}
              >
                <CategoryIcon name={category.name} small />
                <span>{category.name}</span>
                {!category.is_active && (
                  <span className="archived-label">
                    <Archive size={12} /> Archived
                  </span>
                )}
                {admin && (
                  <button
                    className="icon-button"
                    aria-label={`Edit ${category.name}`}
                    onClick={() => onAction({ kind: "category", category })}
                  >
                    <Pencil size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="panel-empty-text">
            Archived categories keep their history. New expenses use active
            categories.
          </p>
        </section>
      </div>
      <div className="new-household">
        <div>
          <strong>Helping with another household?</strong>
          <p>You can belong to more than one, with a separate role in each.</p>
        </div>
        <button
          className="button secondary"
          onClick={() => onAction({ kind: "new-family" })}
        >
          <Plus size={16} /> Create household
        </button>
      </div>
    </>
  );
}
