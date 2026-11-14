# Database relationships

```mermaid
erDiagram
    FAMILY ||--o{ FAMILY_MEMBER : contains
    APP_USER ||--o{ FAMILY_MEMBER : joins
    FAMILY ||--o{ CATEGORY : owns
    CATEGORY ||--o{ MONTHLY_LIMIT : plans
    CATEGORY ||--o{ EXPENSE : categorizes
    FAMILY_MEMBER ||--o{ EXPENSE : records
    FAMILY_MEMBER ||--o{ INCOME : records
    MONTHLY_LIMIT ||--o{ LIMIT_CHANGE_LOG : tracks
    APP_USER ||--o{ LIMIT_CHANGE_LOG : changes
    FAMILY ||--o{ SAVINGS_GOAL : saves_for
    FAMILY {
        int id PK
        varchar name
        char currency
        date created_date
    }
    APP_USER {
        int id PK
        varchar full_name
        varchar email UK
        varchar password_hash
    }
    FAMILY_MEMBER {
        int family_id PK,FK
        int user_id PK,FK
        varchar role
        date joined_date
    }
    CATEGORY {
        int id PK
        int family_id FK
        varchar name
        boolean is_active
    }
    MONTHLY_LIMIT {
        int id PK
        int category_id FK
        char budget_month
        int limit_kzt
    }
    EXPENSE {
        int id PK
        int family_id FK
        int user_id FK
        int category_id FK
        int amount_kzt
        date expense_date
        timestamp created_at
        varchar receipt_photo
        varchar status
        varchar client_request_id UK
        varchar note
    }
    LIMIT_CHANGE_LOG {
        int id PK
        int limit_id FK
        int changed_by FK
        int old_kzt
        int new_kzt
        timestamp changed_at
        varchar reason
    }
    INCOME {
        int id PK
        int family_id FK
        int user_id FK
        int amount_kzt
        date income_date
        varchar source
        varchar client_request_id UK
    }
    SAVINGS_GOAL {
        int id PK
        int family_id FK
        varchar name
        int target_kzt
        int saved_kzt
        date deadline
        timestamp created_at
    }
    EXCHANGE_RATE {
        date rate_date PK
        char currency PK
        numeric rate_kzt
    }
```

Expense has composite foreign keys `(family_id, user_id)` → membership and `(family_id, category_id)` → category. Income also references composite household membership. Category names are unique within a household, ignoring case. Monthly limits are unique per category and month. No balance, spending total, or remaining total is persisted.

A savings goal belongs to one household. `saved_kzt` is the source amount for the goal (individual contributions are not kept as rows), so it is stored and changed with a single `UPDATE ... SET saved_kzt = saved_kzt + amount`. Check constraints keep the target between 1 and 1,000,000,000 KZT and the saved amount between 0 and 1,000,000,000 KZT.

`exchange_rate` is a cache of official National Bank of Kazakhstan rates and is not linked to a household. One row is the tenge price of one unit of a currency on one day; the primary key `(rate_date, currency)` prevents duplicates and `rate_kzt` must be positive.
