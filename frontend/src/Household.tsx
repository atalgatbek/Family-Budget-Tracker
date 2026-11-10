import { Archive, BadgeCheck, Pencil, Plus, ShieldCheck } from "lucide-react";
import { dateLabel, initials } from "./api";
import { CategoryIcon } from "./components";
import { useI18n } from "./i18n";
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
  const { t, tn, ts } = useI18n();
  const admin = family.role === "Admin";
  return (
    <>
      <section className="household-banner">
        <div className="household-symbol">{initials(family.name)}</div>
        <div>
          <span className="eyebrow">{t("house.eyebrow")}</span>
          <h2>{family.name}</h2>
          <p>
            {tn("house.members", data.members.length)} · KZT ·{" "}
            {t("house.tagline")}
          </p>
        </div>
        {admin && (
          <button
            className="button secondary"
            onClick={() => onAction({ kind: "family" })}
          >
            <Pencil size={15} /> {t("house.editName")}
          </button>
        )}
      </section>
      <div className="household-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{t("house.peopleTitle")}</h2>
              <p>{t("house.peopleSub")}</p>
            </div>
            {admin && (
              <button
                className="text-button"
                onClick={() => onAction({ kind: "member" })}
              >
                <Plus size={16} /> {t("house.addMember")}
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
                      <small className="you-label">{t("house.you")}</small>
                    )}
                  </strong>
                  <small>
                    {member.email ??
                      t("house.joined", {
                        date: dateLabel(member.joined_date),
                      })}
                  </small>
                </div>
                <span className={`role-badge ${member.role.toLowerCase()}`}>
                  {member.role === "Admin" && <BadgeCheck size={13} />}
                  {ts(member.role)}
                </span>
              </div>
            ))}
          </div>
          <div className="privacy-note">
            <ShieldCheck size={20} />
            <div>
              <strong>{t("house.privacyTitle")}</strong>
              <p>{t("house.privacyText")}</p>
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{t("house.categoriesTitle")}</h2>
              <p>{t("house.categoriesSub")}</p>
            </div>
            {admin && (
              <button
                className="text-button"
                onClick={() => onAction({ kind: "category" })}
              >
                <Plus size={16} /> {t("common.add")}
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
                <span>{ts(category.name)}</span>
                {!category.is_active && (
                  <span className="archived-label">
                    <Archive size={12} /> {t("house.archived")}
                  </span>
                )}
                {admin && (
                  <button
                    className="icon-button"
                    aria-label={t("house.editAria", {
                      name: ts(category.name),
                    })}
                    onClick={() => onAction({ kind: "category", category })}
                  >
                    <Pencil size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="panel-empty-text">{t("house.archiveNote")}</p>
        </section>
      </div>
      <div className="new-household">
        <div>
          <strong>{t("house.anotherTitle")}</strong>
          <p>{t("house.anotherText")}</p>
        </div>
        <button
          className="button secondary"
          onClick={() => onAction({ kind: "new-family" })}
        >
          <Plus size={16} /> {t("house.create")}
        </button>
      </div>
    </>
  );
}
