"""Sending email over SMTP (Gmail, Brevo, Mailpit, or any other provider)."""

import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from starlette.concurrency import run_in_threadpool
from .config import deployed_on_vercel, get_settings

log = logging.getLogger(__name__)


class MailError(Exception):
    """The email could not be sent."""


def deliver(message: EmailMessage) -> None:
    settings = get_settings()
    security = settings.smtp_security
    if security == "auto":
        security = "ssl" if settings.smtp_port == 465 else "starttls"
    context = ssl.create_default_context()
    if security == "ssl":
        server = smtplib.SMTP_SSL(
            settings.smtp_host, settings.smtp_port, timeout=15, context=context
        )
    else:
        server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)
    with server:
        if security == "starttls":
            server.starttls(context=context)
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(message)


async def send_mail(to: str, subject: str, text: str, html: str) -> None:
    settings = get_settings()
    if not settings.smtp_host:
        if deployed_on_vercel():
            log.error("SMTP_HOST is not set, so email cannot be sent.")
            raise MailError
        # Local development without a mail server: show the email in the log.
        log.warning("Email is not configured. Email to %s:\n%s", to, text)
        return
    sender = settings.mail_from or settings.smtp_user
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((settings.mail_from_name, sender))
    message["To"] = to
    message["Date"] = formatdate()
    message["Message-ID"] = make_msgid(domain=sender.rpartition("@")[2] or None)
    message.set_content(text)
    message.add_alternative(html, subtype="html")
    try:
        await run_in_threadpool(deliver, message)
    except (OSError, smtplib.SMTPException) as error:
        log.exception("Could not send email through %s", settings.smtp_host)
        raise MailError from error
