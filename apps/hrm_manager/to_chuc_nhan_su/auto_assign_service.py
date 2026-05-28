"""
File: auto_assign_service.py
Service: Tự động gán lịch làm việc & chế độ lương cho nhân viên theo phòng ban.
Author: ThanhTrung
Created: 2026-05-25

Nguyên tắc:
- Chỉ xử lý 1 nhân viên tại 1 thời điểm
- Không raise exception cho business warnings → collect vào list
- Không tạo LichlamviecNhanvien (NV inherit lịch qua department path trong cron job)
- Không sử dụng CheDoLuongService.process_employee_assignment (bulk sync)
- Tương thích với transaction.atomic của caller
"""

import logging
from datetime import date, timedelta
from calendar import monthrange

from django.utils import timezone
from django.db.models import Q

from apps.hrm_manager.__core__.models import (
    Nhanvien, Phongban, Lichlamviecthucte,
    LichlamviecNhanvien, LichlamviecPhongban,
    NhanvienChedoluong, PhongbanChedoluong,
    Thietlapsolieucodinh,
)

logger = logging.getLogger(__name__)

# Trạng thái NV được phép auto-assign
_ACTIVE_EMPLOYEE_STATUSES = frozenset({'Đang làm việc', 'Thử việc'})


class EmployeeAutoAssignService:
    """
    Service auto-assign lịch làm việc & chế độ lương cho 1 nhân viên
    khi thêm mới hoặc chuyển phòng ban.
    """

    # ------------------------------------------------------------------
    # PUBLIC: Entry point
    # ------------------------------------------------------------------

    @staticmethod
    def auto_assign_for_employee(nhanvien_id, phongban_id, effective_date=None, old_phongban_id=None):
        """
        Tự động gán lịch + lương cho 1 nhân viên.
        Gọi sau khi tạo Lichsucongtac mới thành công.

        Args:
            nhanvien_id: ID nhân viên
            phongban_id: ID phòng ban mới
            effective_date: Ngày hiệu lực (date hoặc str 'YYYY-MM-DD')
            old_phongban_id: ID phòng ban cũ (nếu chuyển công tác)

        Returns:
            dict: {
                'warnings': list[str],
                'schedule_assigned': bool,
                'salary_assigned': bool,
            }
        """
        result = {'warnings': [], 'schedule_assigned': False, 'salary_assigned': False}

        # Guard: phòng ban bắt buộc
        if not phongban_id:
            return result

        # Guard: kiểm tra trạng thái NV
        try:
            trangthainv = Nhanvien.objects.filter(id=nhanvien_id).values_list(
                'trangthainv', flat=True
            ).first()
        except Exception:
            return result

        if not trangthainv or trangthainv not in _ACTIVE_EMPLOYEE_STATUSES:
            return result

        # Chuẩn hóa effective_date → đảm bảo kiểu date (không phải datetime/str)
        today = date.today()
        if effective_date is None:
            effective_date = today
        elif hasattr(effective_date, 'date') and callable(effective_date.date):
            # datetime object → extract date (xảy ra khi lich_su_new.batdau là datetime)
            effective_date = effective_date.date()
        elif isinstance(effective_date, str):
            try:
                effective_date = date.fromisoformat(effective_date)
            except (ValueError, TypeError):
                effective_date = today

        # --- Auto-assign lịch làm việc ---
        try:
            s_warnings, s_assigned = EmployeeAutoAssignService._assign_schedule(
                nhanvien_id, phongban_id, effective_date
            )
            result['warnings'].extend(s_warnings)
            result['schedule_assigned'] = s_assigned
        except Exception as e:
            logger.error(
                "Auto-assign schedule failed for nhanvien_id=%s: %s",
                nhanvien_id, e, exc_info=True,
            )
            result['warnings'].append(
                "Không thể tự động gán lịch làm việc. Vui lòng kiểm tra cấu hình phòng ban."
            )

        # --- Auto-assign chế độ lương ---
        try:
            r_warnings, r_assigned = EmployeeAutoAssignService._assign_salary_regime(
                nhanvien_id, phongban_id, effective_date, old_phongban_id
            )
            result['warnings'].extend(r_warnings)
            result['salary_assigned'] = r_assigned
        except Exception as e:
            logger.error(
                "Auto-assign salary failed for nhanvien_id=%s: %s",
                nhanvien_id, e, exc_info=True,
            )
            result['warnings'].append(
                "Không thể tự động gán chế độ lương. Vui lòng kiểm tra cấu hình phòng ban."
            )

        return result

    # ------------------------------------------------------------------
    # PUBLIC: Deactivate lịch phòng ban cũ khi chuyển phòng ban
    # ------------------------------------------------------------------

    @staticmethod
    def deactivate_old_schedule(nhanvien_id, old_phongban_id, new_phongban_id):
        """
        Khi chuyển phòng ban: xóa lịch thực tế tương lai thuộc lịch phòng ban CŨ.
        Chỉ xóa nếu PB mới có lịch KHÁC PB cũ (tránh xóa nhầm khi chuyển giữa PB con cùng cha).
        """
        if not old_phongban_id or not new_phongban_id:
            return
        if int(old_phongban_id) == int(new_phongban_id):
            return

        old_schedules = EmployeeAutoAssignService._find_department_schedule(old_phongban_id)
        new_schedules = EmployeeAutoAssignService._find_department_schedule(new_phongban_id)

        old_lich_ids = {s.id for s in old_schedules}
        new_lich_ids = {s.id for s in new_schedules}

        # Cùng lịch (PB con cùng cha inherit chung) → không cần xóa
        if old_lich_ids == new_lich_ids:
            return

        # Xóa lịch tương lai thuộc lịch cũ
        if old_lich_ids:
            today = date.today()
            Lichlamviecthucte.objects.filter(
                nhanvien_id=nhanvien_id,
                lichlamviec_id__in=old_lich_ids,
                ngaylamviec__gte=today,
                chophepghide=False,
            ).delete()

    # ------------------------------------------------------------------
    # PUBLIC: Cleanup khi NV nghỉ việc
    # ------------------------------------------------------------------

    @staticmethod
    def cleanup_on_termination(nhanvien_id):
        """
        Cleanup khi NV nghỉ việc / bị xóa:
        - Soft-delete Lichlamviecthucte tương lai
        - Deactivate LichlamviecNhanvien
        - Deactivate NhanvienChedoluong
        - Deactivate Thietlapsolieucodinh
        """
        today = date.today()
        now = timezone.now()

        # 1. Soft-delete lịch thực tế tương lai (giữ nguyên lịch quá khứ)
        Lichlamviecthucte.objects.filter(
            nhanvien_id=nhanvien_id,
            ngaylamviec__gte=today,
        ).filter(
            Q(is_deleted=False) | Q(is_deleted__isnull=True)
        ).update(is_deleted=True)

        # 2. Deactivate LichlamviecNhanvien active
        LichlamviecNhanvien.objects.filter(
            nhanvien_id=nhanvien_id,
            trangthai='active',
        ).update(trangthai='inactive', ngayketthuc=now, updated_at=now)

        # 3. Deactivate NhanvienChedoluong active
        NhanvienChedoluong.objects.filter(
            nhanvien_id=nhanvien_id,
            trangthai='active',
        ).update(trangthai='inactive', ngayketthuc=now, updated_at=now)

        # 4. Deactivate Thietlapsolieucodinh
        Thietlapsolieucodinh.objects.filter(
            nhanvien_id=nhanvien_id,
            trangthai='active',
        ).update(trangthai='inactive', updated_at=now)

    # ------------------------------------------------------------------
    # PUBLIC: Restore fixed setup on rehire
    # ------------------------------------------------------------------

    @staticmethod
    def restore_fixed_setup_on_rehire(nhanvien_id):
        """
        Khôi phục thiết lập số liệu cố định gần nhất khi NV quay lại làm việc.
        Chỉ kích hoạt nếu hiện tại chưa có bản ghi active.
        Returns: int số bản ghi được khôi phục.
        """
        if Thietlapsolieucodinh.objects.filter(
            nhanvien_id=nhanvien_id,
            trangthai='active',
        ).exists():
            return 0

        qs = Thietlapsolieucodinh.objects.filter(
            nhanvien_id=nhanvien_id,
            trangthai='inactive',
        ).order_by('phantuluong_id', '-updated_at', '-created_at', '-id')

        seen = set()
        to_restore_ids = []
        for item in qs:
            if item.phantuluong_id in seen:
                continue
            seen.add(item.phantuluong_id)
            to_restore_ids.append(item.id)

        if not to_restore_ids:
            return 0

        now = timezone.now()
        Thietlapsolieucodinh.objects.filter(id__in=to_restore_ids).update(
            trangthai='active',
            updated_at=now,
        )

        return len(to_restore_ids)

    # ------------------------------------------------------------------
    # PRIVATE: Assign lịch làm việc
    # ------------------------------------------------------------------

    @staticmethod
    def _assign_schedule(nhanvien_id, phongban_id, effective_date):
        """
        Returns: (warnings: list[str], assigned: bool)
        """
        warnings = []

        # Guard: NV đã có direct assignment (LichlamviecNhanvien)
        has_direct = LichlamviecNhanvien.objects.filter(
            nhanvien_id=nhanvien_id,
            trangthai='active',
        ).filter(
            Q(lichlamviec__is_deleted=False) | Q(lichlamviec__is_deleted__isnull=True),
            lichlamviec__trangthai='active',
        )

        if has_direct.exists():
            # Chuyển phòng ban -> Vô hiệu hóa lịch làm việc riêng (ngoại lệ) cũ
            now = timezone.now()
            has_direct.update(trangthai='inactive', ngayketthuc=now, updated_at=now)
            warnings.append(
                "Nhân viên có lịch làm việc riêng ở phòng ban cũ. "
                "Hệ thống đã tự động gỡ lịch cũ và áp dụng lịch của phòng ban mới."
            )
            # Không return False nữa, tiếp tục chạy xuống dưới để lấy lịch phòng ban mới

        # Tìm lịch phòng ban (bao gồm PB cha)
        dept_schedules = EmployeeAutoAssignService._find_department_schedule(phongban_id)

        if not dept_schedules:
            # PB chưa cấu hình lịch → silent skip
            return warnings, False

        if len(dept_schedules) > 1:
            warnings.append(
                "Phòng ban đang có nhiều lịch làm việc active. "
                "Vui lòng kiểm tra cấu hình lịch làm việc."
            )
            return warnings, False

        lich = dept_schedules[0]

        # LICH_TRINH: Cần user tạo thủ công
        if lich.loaikichbanlamviec == 'LICH_TRINH':
            warnings.append(
                f'Phòng ban đang áp dụng lịch trình "{lich.tenlichlamviec}". '
                f'Vui lòng vào mục Lịch làm việc để tạo lịch trình thủ công cho nhân viên mới.'
            )
            return warnings, False

        # CO_DINH: Sinh Lichlamviecthucte
        if lich.loaikichbanlamviec != 'CO_DINH':
            return warnings, False

        today = date.today()
        start_date = max(effective_date, today)
        
        # Luôn sinh lịch dự phòng thêm 1 tháng tiếp theo.
        # Điều này đảm bảo nhân viên mới không bao giờ bị rơi vào khoảng trống (lọt khe cron job)
        # nếu họ gia nhập vào thời điểm cron job của tháng sau đã chạy xong (sau ngày 25).
        next_month_date = start_date.replace(day=28) + timedelta(days=4)
        _, next_month_last_day = monthrange(next_month_date.year, next_month_date.month)
        end_date = date(next_month_date.year, next_month_date.month, next_month_last_day)

        EmployeeAutoAssignService._generate_fixed_schedule_for_single_employee(
            lich, nhanvien_id, start_date, end_date
        )

        return warnings, True

    # ------------------------------------------------------------------
    # PRIVATE: Sinh lịch CO_DINH cho 1 NV
    # ------------------------------------------------------------------

    @staticmethod
    def _generate_fixed_schedule_for_single_employee(lich, nhanvien_id, start_date, end_date):
        """
        Sinh Lichlamviecthucte cho 1 nhân viên.
        Logic tái sử dụng từ LichLamViecService.generate_actual_schedule_for_fixed
        nhưng chỉ cho 1 NV.
        """
        # Build day_shifts_map: {weekday: [ca_id, ...]}
        day_shifts_map = {}
        days_with_shifts = set()
        for ngay, ca_id in lich.lichlamvieccodinh_set.values_list('ngaytrongtuan', 'calamviec_id'):
            if ca_id:
                day_shifts_map.setdefault(ngay, []).append(ca_id)
                days_with_shifts.add(ngay)

        # Xóa lịch cũ tương lai của NV này thuộc lịch này (không cho phép ghi đè)
        Lichlamviecthucte.objects.filter(
            lichlamviec=lich,
            nhanvien_id=nhanvien_id,
            ngaylamviec__gte=start_date,
            ngaylamviec__lte=end_date,
            chophepghide=False,
        ).delete()

        # Sinh records
        records = []
        created_at = timezone.now()
        delta = (end_date - start_date).days + 1

        for i in range(delta):
            current_date = start_date + timedelta(days=i)
            weekday = current_date.weekday()

            base_kwargs = {
                'ngaylamviec': current_date,
                'chophepghide': False,
                'lichlamviec': lich,
                'nguongoc': 'CO_DINH',
                'created_at': created_at,
                'nhanvien_id': nhanvien_id,
            }

            if weekday in days_with_shifts:
                for ca_id in day_shifts_map[weekday]:
                    records.append(Lichlamviecthucte(
                        calamviec_id=ca_id,
                        cophaingaynghi=False,
                        **base_kwargs,
                    ))
            else:
                records.append(Lichlamviecthucte(
                    calamviec_id=None,
                    cophaingaynghi=True,
                    **base_kwargs,
                ))

        if records:
            Lichlamviecthucte.objects.bulk_create(records, batch_size=500)

    # ------------------------------------------------------------------
    # PRIVATE: Assign chế độ lương
    # ------------------------------------------------------------------

    @staticmethod
    def _assign_salary_regime(nhanvien_id, phongban_id, effective_date, old_phongban_id=None):
        """
        Returns: (warnings: list[str], assigned: bool)
        """
        warnings = []

        # Tìm chế độ lương phòng ban (bao gồm PB cha)
        dept_regimes = EmployeeAutoAssignService._find_department_salary_regime(phongban_id)

        if not dept_regimes:
            # PB chưa cấu hình chế độ lương → silent skip
            return warnings, False

        if len(dept_regimes) > 1:
            warnings.append(
                "Phòng ban đang có nhiều chế độ lương active. "
                "Vui lòng kiểm tra cấu hình chế độ lương."
            )
            return warnings, False

        target_chedoluong = dept_regimes[0]

        # Check NV đã có NhanvienChedoluong active
        existing = NhanvienChedoluong.objects.filter(
            nhanvien_id=nhanvien_id,
            trangthai='active',
        ).select_related('chedoluong').first()

        if existing:
            if existing.chedoluong_id == target_chedoluong.id:
                # Đã gán đúng chế độ → skip
                return warnings, False
            
            # Kiểm tra xem chế độ hiện tại có phải được inherit từ phòng ban CŨ không
            is_from_old_dept = False
            if old_phongban_id:
                old_dept_regimes = EmployeeAutoAssignService._find_department_salary_regime(old_phongban_id)
                if old_dept_regimes and existing.chedoluong_id == old_dept_regimes[0].id:
                    is_from_old_dept = True

            if not is_from_old_dept:
                # Có chế độ khác (direct/custom) → giữ nguyên + warning
                ten_chedo = getattr(existing.chedoluong, 'tenchedo', '') or ''
                warnings.append(
                    f'Nhân viên đã có chế độ lương riêng "{ten_chedo}". '
                    f'Giữ nguyên chế độ hiện tại, không tự động chuyển sang chế độ phòng ban mới.'
                )
                return warnings, False
            else:
                # Chế độ cũ là của phòng ban cũ → Deactivate nó để lát sau gán chế độ mới
                now = timezone.now()
                NhanvienChedoluong.objects.filter(id=existing.id).update(
                    trangthai='inactive',
                    ngayketthuc=now,
                    updated_at=now
                )

        # Tạo NhanvienChedoluong mới
        now = timezone.now()
        NhanvienChedoluong.objects.create(
            nhanvien_id=nhanvien_id,
            chedoluong=target_chedoluong,
            trangthai='active',
            ngayapdung=now,
            ngayketthuc=None,
            created_at=now,
        )

        return warnings, True

    # ------------------------------------------------------------------
    # PRIVATE: Lookup lịch/chế độ lương phòng ban (traverse lên PB cha)
    # ------------------------------------------------------------------

    @staticmethod
    def _find_department_schedule(phongban_id):
        """
        Tìm lịch làm việc active cho phòng ban.
        Nếu PB con không có lịch riêng → tìm từ PB cha (đệ quy lên).

        Returns: list[Lichlamviec]
        """
        current_pb_id = phongban_id
        visited = set()

        while current_pb_id and current_pb_id not in visited:
            visited.add(int(current_pb_id))

            pb_schedules = LichlamviecPhongban.objects.filter(
                phongban_id=current_pb_id,
                trangthai='active',
            ).filter(
                Q(lichlamviec__is_deleted=False) | Q(lichlamviec__is_deleted__isnull=True),
                lichlamviec__trangthai='active',
            ).select_related('lichlamviec')

            schedules = [rel.lichlamviec for rel in pb_schedules]
            if schedules:
                return schedules

            # Traverse lên PB cha
            parent_id = Phongban.objects.filter(
                id=current_pb_id
            ).values_list('phongbancha_id', flat=True).first()

            current_pb_id = parent_id

        return []

    @staticmethod
    def _find_department_salary_regime(phongban_id):
        """
        Tìm chế độ lương active cho phòng ban.
        Nếu PB con không có chế độ riêng → tìm từ PB cha (đệ quy lên).

        Returns: list[Chedoluong]
        """
        current_pb_id = phongban_id
        visited = set()

        while current_pb_id and current_pb_id not in visited:
            visited.add(int(current_pb_id))

            pb_regimes = PhongbanChedoluong.objects.filter(
                phongban_id=current_pb_id,
                trangthai='active',
            ).filter(
                Q(chedoluong__is_deleted=False) | Q(chedoluong__is_deleted__isnull=True),
                chedoluong__trangthai='active',
            ).select_related('chedoluong')

            regimes = [rel.chedoluong for rel in pb_regimes]
            if regimes:
                return regimes

            # Traverse lên PB cha
            parent_id = Phongban.objects.filter(
                id=current_pb_id
            ).values_list('phongbancha_id', flat=True).first()

            current_pb_id = parent_id

        return []
