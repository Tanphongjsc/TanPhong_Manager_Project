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


class LichLamViecServiceEmployeeScopeTests(SimpleTestCase):
	def _build_schedule_mock(self, schedule_id, direct_emp_ids, dept_ids):
		direct_qs = MagicMock()
		direct_qs.values_list.return_value = list(direct_emp_ids)

		dept_qs = MagicMock()
		dept_qs.values_list.return_value = list(dept_ids)

		schedule = MagicMock()
		schedule.id = schedule_id
		schedule.lichlamviecnhanvien_set.filter.return_value = direct_qs
		schedule.lichlamviecphongban_set.filter.return_value = dept_qs
		return schedule

	@patch("apps.hrm_manager.lich_lam_viec.services.LichLamViecService.get_employees_from_departments")
	@patch("apps.hrm_manager.lich_lam_viec.services.LichLamViecService._expand_dept_ids")
	@patch("apps.hrm_manager.lich_lam_viec.services.LichLamViecService._get_effective_direct_assignment_map")
	@patch("apps.hrm_manager.lich_lam_viec.services.LichLamViecService._apply_relation_effective_filter")
	def test_direct_assignment_overrides_department_inheritance(
		self,
		mock_apply_filter,
		mock_direct_map,
		mock_expand_dept_ids,
		mock_get_from_dept,
	):
		from apps.hrm_manager.lich_lam_viec.services import LichLamViecService

		schedule = self._build_schedule_mock(
			schedule_id=1,
			direct_emp_ids={101},
			dept_ids={10},
		)

		mock_apply_filter.side_effect = lambda qs, start_date=None, end_date=None: qs
		mock_direct_map.return_value = {
			101: 1,
			202: 2,
		}
		mock_expand_dept_ids.return_value = {10}
		mock_get_from_dept.return_value = {101, 202}

		result = LichLamViecService._get_all_employee_ids_for_schedule(
			schedule,
			start_date=date(2026, 5, 1),
			end_date=date(2026, 5, 31),
		)

		self.assertEqual(result, {101})

	@patch("apps.hrm_manager.lich_lam_viec.services.LichLamViecService.get_employees_from_departments")
	@patch("apps.hrm_manager.lich_lam_viec.services.LichLamViecService._expand_dept_ids")
	@patch("apps.hrm_manager.lich_lam_viec.services.LichLamViecService._get_effective_direct_assignment_map")
	@patch("apps.hrm_manager.lich_lam_viec.services.LichLamViecService._apply_relation_effective_filter")
	def test_multiple_fixed_schedules_keep_correct_employee_scope(
		self,
		mock_apply_filter,
		mock_direct_map,
		mock_expand_dept_ids,
		mock_get_from_dept,
	):
		from apps.hrm_manager.lich_lam_viec.services import LichLamViecService

		schedule_1 = self._build_schedule_mock(
			schedule_id=1,
			direct_emp_ids=set(),
			dept_ids={11},
		)
		schedule_2 = self._build_schedule_mock(
			schedule_id=2,
			direct_emp_ids={202},
			dept_ids=set(),
		)

		mock_apply_filter.side_effect = lambda qs, start_date=None, end_date=None: qs
		mock_direct_map.return_value = {
			202: 2,
		}
		mock_expand_dept_ids.side_effect = lambda dept_ids: set(dept_ids)

		# Lần gọi cho schedule_1 trả nhân viên từ phòng ban gồm cả người đã direct ở schedule_2
		# Lần gọi cho schedule_2 không có phòng ban
		mock_get_from_dept.side_effect = [
			{201, 202},
			set(),
		]

		result_1 = LichLamViecService._get_all_employee_ids_for_schedule(
			schedule_1,
			start_date=date(2026, 5, 1),
			end_date=date(2026, 5, 31),
		)
		result_2 = LichLamViecService._get_all_employee_ids_for_schedule(
			schedule_2,
			start_date=date(2026, 5, 1),
			end_date=date(2026, 5, 31),
		)

		self.assertEqual(result_1, {201})
		self.assertEqual(result_2, {202})
