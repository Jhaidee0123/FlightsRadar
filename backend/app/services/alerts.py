import logging

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)


def send_telegram(text: str) -> bool:
    s = get_settings()
    if not (s.telegram_bot_token and s.telegram_chat_id):
        return False
    try:
        r = httpx.post(
            f"https://api.telegram.org/bot{s.telegram_bot_token}/sendMessage",
            json={"chat_id": s.telegram_chat_id, "text": text, "disable_web_page_preview": True},
            timeout=10,
        )
        r.raise_for_status()
        return True
    except httpx.HTTPError as e:
        log.warning("No se pudo enviar alerta a Telegram: %s", e)
        return False
