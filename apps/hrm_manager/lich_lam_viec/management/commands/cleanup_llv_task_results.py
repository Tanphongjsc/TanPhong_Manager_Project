from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from django_celery_results.models import TaskResult


TASK_NAME = "apps.hrm_manager.lich_lam_viec.tasks.generate_next_month_schedule_task"


class Command(BaseCommand):
    help = "Delete old LLV Celery task results to keep monitoring data manageable"

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=180, help="Keep task results for the last N days")
        parser.add_argument("--dry-run", action="store_true", help="Only report count, do not delete")

    def handle(self, *args, **options):
        keep_days = max(1, options["days"])
        cutoff = timezone.now() - timedelta(days=keep_days)

        queryset = TaskResult.objects.filter(task_name=TASK_NAME, date_done__lt=cutoff)
        count = queryset.count()

        if options["dry_run"]:
            self.stdout.write(self.style.WARNING(f"Dry-run: {count} rows will be deleted (cutoff={cutoff})."))
            return

        deleted_count, _ = queryset.delete()
        self.stdout.write(self.style.SUCCESS(f"Deleted {deleted_count} old task result rows (cutoff={cutoff})."))
