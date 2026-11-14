from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo
from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    field_validator,
)

Month = Annotated[str, StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]
Money = Annotated[int, Field(strict=True, ge=1, le=10_000_000)]
LimitMoney = Annotated[int, Field(strict=True, ge=1, le=1_000_000_000)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


def today() -> date:
    return datetime.now(ZoneInfo("Asia/Almaty")).date()


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Login(Input):
    email: EmailStr = Field(max_length=100)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return value.lower()


class Register(Login):
    full_name: Name = Field(max_length=60)
    password: str = Field(min_length=8, max_length=128)
    family_name: Name = Field(max_length=50)


class FamilyInput(Input):
    name: Name = Field(max_length=50)


class MemberInput(Input):
    email: EmailStr = Field(max_length=100)
    role: Literal["Admin", "Member"] = "Member"


class CategoryInput(Input):
    name: Name = Field(max_length=30)
    is_active: bool = True


class ExpenseInput(Input):
    category_id: int = Field(gt=0)
    amount_kzt: Money
    expense_date: date
    note: str = Field(default="", max_length=160)
    status: Literal["Saved", "Needs review"] = "Saved"

    @field_validator("expense_date")
    @classmethod
    def past_or_today(cls, value):
        if value > today():
            raise ValueError("The expense date cannot be in the future.")
        return value


class ExpenseCreate(ExpenseInput):
    client_request_id: UUID


class LimitInput(Input):
    category_id: int = Field(gt=0)
    budget_month: Month
    limit_kzt: LimitMoney


class TransferInput(Input):
    source_category_id: int = Field(gt=0)
    destination_category_id: int = Field(gt=0)
    budget_month: Month
    amount_kzt: Money


class IncomeInput(Input):
    source: Name = Field(max_length=80)
    amount_kzt: Money
    income_date: date
    client_request_id: UUID

    @field_validator("income_date")
    @classmethod
    def past_or_today(cls, value):
        if value > today():
            raise ValueError("The income date cannot be in the future.")
        return value


class GoalInput(Input):
    name: Name = Field(max_length=60)
    target_kzt: LimitMoney
    deadline: date | None = None


class GoalUpdate(GoalInput):
    saved_kzt: int = Field(strict=True, ge=0, le=1_000_000_000)


class GoalContribution(Input):
    amount_kzt: Money
