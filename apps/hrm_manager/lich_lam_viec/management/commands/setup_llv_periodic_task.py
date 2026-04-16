import json

from django.conf import settings
from django.core.management.base import BaseCommand

from django_celery_beat.models import CrontabSchedule, PeriodicTask


TASK_PATH = "apps.hrm_manager.lich_lam_viec.tasks.generate_next_month_schedule_task"
TASK_NAME = "LLV - Auto Generate Next Month"


class Command(BaseCommand):
    help = "Create or update Celery Beat periodic task for monthly schedule generation"

    def add_arguments(self, parser):
        parser.add_argument("--hour", default="0", help="Cron hour field")
        parser.add_argument("--minute", default="15", help="Cron minute field")
        parser.add_argument("--day-of-month", default="25-31", help="Cron day_of_month field")
        parser.add_argument("--disable", action="store_true", help="Create/update task but disable it")

    def handle(self, *args, **options):
        hour = str(options["hour"]).strip()
        minute = str(options["minute"]).strip()
        day_of_month = str(options["day_of_month"]).strip()
        enabled = not options["disable"]

        crontab, _ = CrontabSchedule.objects.get_or_create(
            minute=minute,
            hour=hour,
            day_of_week="*",
            day_of_month=day_of_month,
            month_of_year="*",
            timezone=settings.TIME_ZONE,
        )

        task, created = PeriodicTask.objects.update_or_create(
            name=TASK_NAME,
            defaults={
                "task": TASK_PATH,
                "crontab": crontab,
                "kwargs": json.dumps({"force_run": False}),
                "enabled": enabled,
                "one_off": False,
                "description": "Auto-generate next month work schedules in month-end window",
            },
        )

        status = "created" if created else "updated"
        self.stdout.write(self.style.SUCCESS(f"Periodic task {status}: {task.name}"))
        self.stdout.write(
            f"Schedule: minute={minute} hour={hour} day_of_month={day_of_month} timezone={settings.TIME_ZONE}"
        )
        self.stdout.write(f"Enabled: {task.enabled}")
