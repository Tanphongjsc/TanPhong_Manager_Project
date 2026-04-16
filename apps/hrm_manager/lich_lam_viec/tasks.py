import logging

from celery import shared_task
from django.core.cache import cache
from django.utils import timezone

from .services import LichLamViecService

logger = logging.getLogger(__name__)


def _next_month_period_key(today):
    if today.month == 12:
        y, m = today.year + 1, 1
    else:
        y, m = today.year, today.month + 1
    return f"{y:04d}-{m:02d}"


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 3},
)
def generate_next_month_schedule_task(self, force_run=False):
    today = timezone.localdate()
    logger.info("LLV task started. force_run=%s today=%s", force_run, today)

    # Chỉ chạy cuối tháng, trừ khi force để test
    if not force_run and today.day < 25:
        logger.info("LLV task skipped: before-window. today=%s", today)
        return {
            "success": True,
            "skipped": True,
            "reason": "before-window",
            "today": str(today),
        }

    period_key = _next_month_period_key(today)
    lock_key = f"llv:auto:lock:{period_key}"
    done_key = f"llv:auto:done:{period_key}"

    lock = cache.lock(lock_key, timeout=1800, blocking_timeout=0)
    acquired = lock.acquire(blocking=False)
    if not acquired:
        logger.warning("LLV task skipped: lock not acquired. period_key=%s", period_key)
        return {
            "success": True,
            "skipped": True,
            "reason": "locked",
            "period_key": period_key,
        }

    try:
        if cache.get(done_key):
            logger.info("LLV task skipped: already done for period_key=%s", period_key)
            return {
                "success": True,
                "skipped": True,
                "reason": "already-done",
                "period_key": period_key,
            }

        result = LichLamViecService.generate_next_month_schedules()

        # Đánh dấu đã chạy thành công cho kỳ này để chống duplicate
        if result.get("errors", 0) == 0:
            cache.set(done_key, timezone.now().isoformat(), timeout=120 * 24 * 3600)

        result["period_key"] = period_key
        result["skipped"] = False
        logger.info(
            "LLV task finished. period_key=%s generated=%s errors=%s",
            period_key,
            result.get("generated", 0),
            result.get("errors", 0),
        )
        return result
    except Exception:
        logger.exception("LLV task failed. period_key=%s", period_key)
        raise
    finally:
        try:
            lock.release()
        except Exception:
            logger.warning("LLV task lock release warning. period_key=%s", period_key)