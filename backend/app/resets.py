"""One-time password reset codes and the email that carries them."""

import hashlib
import secrets
from datetime import timedelta
from html import escape
from urllib.parse import urlencode
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession
from .auth import now
from .models import PasswordReset

# Letters and digits that are hard to confuse when read aloud or retyped.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
RESET_MINUTES = 30


def code_digest(code: str) -> str:
    return hashlib.sha256(code.strip().upper().replace("-", "").encode()).hexdigest()


async def new_reset_code(db: AsyncSession, user_id: int, created_by: int) -> str:
    """Stores a new code for the account and returns it as ABCD-EFGH.

    Only a hash is stored, and older unused codes stop working.
    """
    code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
    await db.execute(
        update(PasswordReset)
        .where(PasswordReset.user_id == user_id, PasswordReset.used_at.is_(None))
        .values(used_at=now())
    )
    db.add(
        PasswordReset(
            user_id=user_id,
            created_by=created_by,
            code_hash=code_digest(code),
            expires_at=now() + timedelta(minutes=RESET_MINUTES),
        )
    )
    await db.flush()
    return f"{code[:4]}-{code[4:]}"


TEXTS = {
    "en": {
        "subject": "Your password reset code",
        "hello": "Hello, {name}!",
        "intro": "Someone asked to reset the password for your Family Budget account. Enter this code on the sign-in page:",
        "valid": f"The code works once and expires in {RESET_MINUTES} minutes.",
        "button": "Set a new password",
        "ignore": "If you did not ask for this, ignore this email. Your password stays the same.",
    },
    "ru": {
        "subject": "Код для сброса пароля",
        "hello": "Здравствуйте, {name}!",
        "intro": "Кто-то запросил сброс пароля для вашего аккаунта Family Budget. Введите этот код на странице входа:",
        "valid": f"Код работает один раз и действует {RESET_MINUTES} минут.",
        "button": "Задать новый пароль",
        "ignore": "Если вы не запрашивали сброс, просто проигнорируйте письмо. Пароль останется прежним.",
    },
    "kk": {
        "subject": "Құпиясөзді қалпына келтіру коды",
        "hello": "Сәлеметсіз бе, {name}!",
        "intro": "Family Budget аккаунтыңыздың құпиясөзін қалпына келтіру сұралды. Кіру бетінде осы кодты енгізіңіз:",
        "valid": f"Код бір рет жұмыс істейді және {RESET_MINUTES} минут жарамды.",
        "button": "Жаңа құпиясөз орнату",
        "ignore": "Егер сіз сұрамаған болсаңыз, хатты елемеңіз. Құпиясөз өзгермейді.",
    },
}


def reset_link(base: str, email: str, code: str) -> str:
    return f"{base.rstrip('/')}/?{urlencode({'reset': code, 'email': email})}"


def reset_email(
    lang: str, name: str, code: str, link: str | None
) -> tuple[str, str, str]:
    """Subject, plain text and HTML of the reset email."""
    t = TEXTS.get(lang, TEXTS["en"])
    hello = t["hello"].format(name=name)
    text = "\n\n".join(
        part
        for part in [
            hello,
            t["intro"],
            code,
            t["valid"],
            f"{t['button']}: {link}" if link else "",
            t["ignore"],
            "Family Budget",
        ]
        if part
    )
    button = (
        f'<p style="margin:24px 0"><a href="{escape(link)}" style="background:#635bff;'
        "color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;"
        f'font-weight:700;display:inline-block">{escape(t["button"])}</a></p>'
        if link
        else ""
    )
    html = f"""<!doctype html>
<html><body style="margin:0;background:#f6f8fa;font-family:Arial,Helvetica,sans-serif;color:#1a2433">
<div style="max-width:480px;margin:0 auto;padding:32px 20px">
<div style="background:#ffffff;border:1px solid #e3e8ee;border-radius:12px;padding:28px">
<p style="margin:0 0 20px;font-weight:800;color:#0a2540;font-size:18px">family<span style="color:#635bff">budget</span></p>
<p style="margin:0 0 12px;font-size:16px;font-weight:700">{escape(hello)}</p>
<p style="margin:0 0 16px;line-height:1.5">{escape(t["intro"])}</p>
<p style="margin:0 0 16px;font-size:30px;font-weight:800;letter-spacing:4px;color:#0a2540;background:#efeeff;border-radius:8px;padding:14px;text-align:center;font-family:'Courier New',monospace">{escape(code)}</p>
<p style="margin:0;color:#5b6878;line-height:1.5">{escape(t["valid"])}</p>
{button}
<p style="margin:16px 0 0;color:#5b6878;font-size:13px;line-height:1.5">{escape(t["ignore"])}</p>
</div></div></body></html>"""
    return t["subject"], text, html
