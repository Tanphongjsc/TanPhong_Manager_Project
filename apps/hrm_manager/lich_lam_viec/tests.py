from datetime import date
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase


class LichLamViecCeleryTaskTests(SimpleTestCase):
	@patch("apps.hrm_manager.lich_lam_viec.tasks.LichLamViecService.generate_next_month_schedules")
	@patch("apps.hrm_manager.lich_lam_viec.tasks.timezone.localdate", return_value=date(2026, 4, 10))
	def test_task_skips_before_month_end_window(self, mock_today, mock_generate):
		from apps.hrm_manager.lich_lam_viec.tasks import generate_next_month_schedule_task

		result = generate_next_month_schedule_task.run(force_run=False)

		self.assertTrue(result["success"])
		self.assertTrue(result["skipped"])
		self.assertEqual(result["reason"], "before-window")
		mock_generate.assert_not_called()

	@patch("apps.hrm_manager.lich_lam_viec.tasks.timezone.localdate", return_value=date(2026, 4, 25))
	@patch("apps.hrm_manager.lich_lam_viec.tasks.cache")
	def test_task_skips_when_lock_is_held(self, mock_cache, mock_today):
		from apps.hrm_manager.lich_lam_viec.tasks import generate_next_month_schedule_task

		lock = MagicMock()
		lock.acquire.return_value = False
		mock_cache.lock.return_value = lock

		result = generate_next_month_schedule_task.run(force_run=False)

		self.assertTrue(result["success"])
		self.assertTrue(result["skipped"])
		self.assertEqual(result["reason"], "locked")

	@patch("apps.hrm_manager.lich_lam_viec.tasks.timezone.localdate", return_value=date(2026, 4, 25))
	@patch("apps.hrm_manager.lich_lam_viec.tasks.timezone.now")
	@patch("apps.hrm_manager.lich_lam_viec.tasks.LichLamViecService.generate_next_month_schedules")
	@patch("apps.hrm_manager.lich_lam_viec.tasks.cache")
	def test_task_runs_success_and_marks_done(
		self,
		mock_cache,
		mock_generate,
		mock_now,
		mock_today,
	):
		from apps.hrm_manager.lich_lam_viec.tasks import generate_next_month_schedule_task

		lock = MagicMock()
		lock.acquire.return_value = True
		mock_cache.lock.return_value = lock
		mock_cache.get.return_value = None
		mock_now.return_value.isoformat.return_value = "2026-04-25T00:15:00+07:00"

		mock_generate.return_value = {
			"success": True,
			"generated": 3,
			"errors": 0,
			"period": "2026-05-01 -> 2026-05-31",
		}

		result = generate_next_month_schedule_task.run(force_run=False)

		self.assertTrue(result["success"])
		self.assertFalse(result["skipped"])
		self.assertEqual(result["period_key"], "2026-05")
		mock_cache.set.assert_called_once()
		lock.release.assert_called_once()
