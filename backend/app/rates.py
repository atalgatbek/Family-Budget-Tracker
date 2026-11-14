"""Official KZT exchange rates from the National Bank of Kazakhstan.

A published daily rate never changes, so each day is requested from the bank
once and then kept in the exchange_rate table.
"""

import asyncio
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from time import monotonic
from xml.etree import ElementTree
import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from .models import ExchangeRate
from .schemas import today

SOURCE = "https://nationalbank.kz/rss/get_rates.cfm"
CURRENCIES = ("USD", "EUR", "RUB", "CNY")
DAYS = 8  # today and the seven days before it
RETRY_AFTER = 600  # seconds to wait before asking the bank again

# Per-process memory of what not to ask for again yet.
retry_at: dict[date | None, float] = {}


def parse_rates(xml_text: str) -> dict[str, Decimal]:
    """Returns the KZT price of one unit for each currency we show."""
    rates = {}
    for item in ElementTree.fromstring(xml_text).iter("item"):
        code = (item.findtext("title") or "").strip().upper()
        if code not in CURRENCIES:
            continue
        try:
            # The feed quotes some currencies per 10 or 100 units.
            value = Decimal(item.findtext("description").strip()) / Decimal(
                item.findtext("quant").strip()
            )
        except (AttributeError, InvalidOperation, ZeroDivisionError):
            continue
        if value > 0:
            rates[code] = value
    return rates


async def fetch_day(client: httpx.AsyncClient, day: date) -> dict[str, Decimal]:
    response = await client.get(SOURCE, params={"fdate": f"{day:%d.%m.%Y}"})
    response.raise_for_status()
    if len(response.content) > 1_000_000:
        raise ValueError("The rates feed is unexpectedly large.")
    return parse_rates(response.text)


async def refresh(db: AsyncSession, days: list[date]):
    """Asks the bank for the days that are not stored yet."""
    now = monotonic()
    stored = set(
        await db.scalars(
            select(ExchangeRate.rate_date)
            .where(ExchangeRate.rate_date.in_(days))
            .distinct()
        )
    )
    missing = [day for day in days if day not in stored and retry_at.get(day, 0) <= now]
    if not missing or retry_at.get(None, 0) > now:
        return
    try:
        async with httpx.AsyncClient(timeout=6, follow_redirects=True) as client:
            results = await asyncio.gather(*[fetch_day(client, day) for day in missing])
    except (httpx.HTTPError, ElementTree.ParseError, ValueError):
        # The bank is unreachable: serve what is stored and try again later.
        retry_at[None] = now + RETRY_AFTER
        return
    rows = []
    for day, rates in zip(missing, results):
        if len(rates) < len(CURRENCIES):
            # Nothing is published for this day yet.
            retry_at[day] = now + RETRY_AFTER
            continue
        rows += [
            {"rate_date": day, "currency": code, "rate_kzt": value}
            for code, value in rates.items()
        ]
    if rows:
        await db.execute(insert(ExchangeRate).values(rows).on_conflict_do_nothing())
        await db.commit()


async def weekly_rates(db: AsyncSession) -> dict | None:
    end = today()
    await refresh(db, [end - timedelta(days=offset) for offset in range(DAYS)])
    # Use the latest stored days, so an outage still shows the last known rates.
    dates = sorted(
        await db.scalars(
            select(ExchangeRate.rate_date)
            .where(ExchangeRate.rate_date <= end)
            .distinct()
            .order_by(ExchangeRate.rate_date.desc())
            .limit(DAYS)
        )
    )
    if not dates:
        return None
    rows = await db.execute(
        select(ExchangeRate.currency, ExchangeRate.rate_date, ExchangeRate.rate_kzt)
        .where(ExchangeRate.rate_date.in_(dates))
        .order_by(ExchangeRate.rate_date)
    )
    history: dict[str, list[tuple[date, Decimal]]] = {code: [] for code in CURRENCIES}
    for code, day, value in rows:
        if code in history:
            history[code].append((day, value))
    result = []
    for code in CURRENCIES:
        points = history[code]
        if not points:
            continue
        rate, week_ago = points[-1][1], points[0][1]
        result.append(
            {
                "code": code,
                "rate": round(float(rate), 4),
                "week_ago": round(float(week_ago), 4),
                "change_percent": round(float((rate - week_ago) / week_ago * 100), 2),
                "history": [
                    {"date": day, "rate": round(float(value), 4)}
                    for day, value in points
                ],
            }
        )
    return {"as_of": dates[-1], "compared_with": dates[0], "rates": result}
