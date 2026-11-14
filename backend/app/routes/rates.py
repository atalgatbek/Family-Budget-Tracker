from fastapi import APIRouter, HTTPException
from ..auth import DB, CurrentUser
from ..rates import weekly_rates

router = APIRouter(prefix="/rates", tags=["Exchange rates"])


@router.get("")
async def exchange_rates(db: DB, user: CurrentUser):
    result = await weekly_rates(db)
    if result is None:
        raise HTTPException(503, "Exchange rates are unavailable right now.")
    return result
