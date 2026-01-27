"""
File: apps/hrm_manager/quan_ly_luong/services.py
Service Layer cho Chế độ lương - Business Rules (REFACTORED)
Version: 2.0 - Không có chế độ mặc định, bổ sung ràng buộc kỳ lương
"""

from django.utils import timezone
from django.db import transaction
from django.db.models import Count, Q, Exists, OuterRef
from datetime import date, timedelta, datetime
from apps.hrm_manager.__core__.models import *


class PayrollPeriodLockException(Exception):
    """Exception khi thao tác bị block do kỳ lương chưa chốt"""
    def __init__(self, ky_luong):
        self.ky_luong = ky_luong
        month = ky_luong.thang if ky_luong else 'N/A'
        year = ky_luong.ngaybatdau.year if ky_luong and ky_luong.ngaybatdau else 'N/A'
        super().__init__(f"Chế độ đang trong kỳ lương {month}/{year}.Vui lòng chờ chốt kỳ.")


class ActiveEmployeesExistException(Exception):
    """Exception khi còn nhân viên/phòng ban đang active"""
    def __init__(self, emp_count, dept_count):
        self.emp_count = emp_count
        self.dept_count = dept_count
        total = emp_count + dept_count
        super().__init__(f"Vui lòng chuyển {total} nhân viên/phòng ban sang chế độ khác trước.")


class ConflictException(Exception):
    """Exception khi có xung đột overlap"""
    def __init__(self, conflicts):
        self.conflicts = conflicts
        emp_count = len([c for c in conflicts if c.get('type') == 'emp'])
        dept_count = len([c for c in conflicts if c.get('type') == 'dept'])
        super().__init__(f"Có {emp_count} nhân viên và {dept_count} phòng ban đang thuộc chế độ lương khác")


class CheDoLuongService:
    """Service xử lý Business Logic cho Chế độ lương"""
    
    # Các trạng thái kỳ lương bị khóa
    LOCKED_PAYROLL_STATUSES = ['pending', 'processing', 'calculated', 'finalized']
    
    # ============================================================
    # VALIDATION METHODS
    # ============================================================
    
    @classmethod
    def validate_unique_code(cls, ma_che_do, exclude_id=None):
        """Validate mã chế độ lương unique"""
        if not ma_che_do or len(ma_che_do) < 3 or len(ma_che_do) > 50:
            return (False, 'Mã chế độ lương phải có độ dài từ 3 đến 50 ký tự')
        
        # Validate format: chỉ CHỮ HOA, số, gạch ngang, gạch dưới
        import re
        if not re.match(r'^[A-Z0-9_-]+$', ma_che_do):
            return (False, 'Mã chế độ lương chỉ được chứa chữ HOA, số, gạch ngang (-) và gạch dưới (_)')
        
        queryset = Chedoluong.objects.filter(machedo=ma_che_do)
        if exclude_id:
            queryset = queryset.exclude(id=exclude_id)
        
        # Bao gồm cả soft deleted để tránh trùng mã
        if queryset.exists():
            return (False, f'Mã chế độ lương "{ma_che_do}" đã tồn tại')
        return (True, '')
    
    @classmethod
    def validate_dates(cls, ngay_ap_dung, ngay_het_han=None):
        """Validate ngày áp dụng và hết hạn"""
        today = date.today()
        
        if ngay_ap_dung:
            if isinstance(ngay_ap_dung, str):
                ngay_ap_dung = datetime.strptime(ngay_ap_dung, '%Y-%m-%d').date()
            
            if ngay_ap_dung < today:
                return (False, 'Ngày áp dụng phải lớn hơn hoặc bằng ngày hiện tại')
            
            # Kiểm tra không nằm trong kỳ lương đã chốt
            ky_luong_chot = Kyluong.objects.filter(
                ngaybatdau__lte=ngay_ap_dung,
                ngayketthuc__gte=ngay_ap_dung,
                trangthai='finalized'
            ).first()
            
            if ky_luong_chot:
                return (False, f'Ngày áp dụng nằm trong kỳ lương đã chốt (tháng {ky_luong_chot.thang})')
        
        if ngay_het_han:
            if isinstance(ngay_het_han, str):
                ngay_het_han = datetime.strptime(ngay_het_han, '%Y-%m-%d').date()
            
            if ngay_ap_dung and ngay_het_han <= ngay_ap_dung:
                return (False, 'Ngày hết hạn phải lớn hơn ngày áp dụng')
        
        return (True, '')
    
    @classmethod
    def can_modify_code(cls, che_do):
        """
        Kiểm tra có thể sửa mã không
        RULE: Không cho sửa mã nếu đã có bảng lương hoặc quy tắc
        """
        has_data = (
            Bangluong.objects.filter(chedoluong=che_do).exists() or
            Quytacchedoluong.objects.filter(chedoluong=che_do).exists()
        )
        return not has_data
    
    # ============================================================
    # KỲ LƯƠNG LOCK CHECK
    # ============================================================
    
    @classmethod
    def check_payroll_period_lock(cls, che_do):
        """
        Kiểm tra chế độ lương có đang trong kỳ lương chưa chốt không
        
        Returns:
            tuple: (is_locked: bool, ky_luong: Kyluong | None)
        """
        today = date.today()
        
        # Tìm kỳ lương đang chạy (ngày hiện tại nằm trong khoảng)
        current_ky_luong = Kyluong.objects.filter(
            ngaybatdau__lte=today,
            ngayketthuc__gte=today
        ).first()
        
        if not current_ky_luong:
            return (False, None)
        
        # Kiểm tra có bảng lương của chế độ này trong kỳ đang pending/processing
        has_active_payroll = Bangluong.objects.filter(
            chedoluong=che_do,
            kyluong=current_ky_luong,
            trangthai__in=['pending', 'processing', 'calculated']
        ).exists()
        
        if has_active_payroll:
            return (True, current_ky_luong)
        
        return (False, None)
    
    @classmethod
    def assert_not_in_locked_period(cls, che_do):
        """
        Assert chế độ không trong kỳ lương chưa chốt
        Raise exception nếu vi phạm
        """
        is_locked, ky_luong = cls.check_payroll_period_lock(che_do)
        if is_locked:
            raise PayrollPeriodLockException(ky_luong)
    
    # ============================================================
    # CONFLICT CHECK (Tái sử dụng từ LichLamViecService)
    # ============================================================
    
    @staticmethod
    def get_employees_from_departments(dept_ids):
        """Lấy nhân viên từ danh sách phòng ban"""
        if not dept_ids:
            return set()
        return set(Nhanvien.objects.filter(
            lichsucongtac__phongban_id__in=dept_ids,
            lichsucongtac__trangthai='active',
            lichsucongtac__ketthuc__isnull=True,
            trangthai='active'
        ).values_list('id', flat=True))
    
    @staticmethod
    def resolve_all_employees(dept_ids, direct_emp_ids):
        """Gộp nhân viên từ phòng ban và nhân viên trực tiếp"""
        dept_emp_ids = CheDoLuongService.get_employees_from_departments(dept_ids)
        all_ids = dept_emp_ids.union(set(direct_emp_ids or []))
        return all_ids
    
    @staticmethod
    def check_employee_conflicts(emp_ids, exclude_id=None, effective_date=None):
        """
        Kiểm tra nhân viên đã thuộc chế độ lương khác đang active chưa
        
        Args:
            emp_ids: Set ID nhân viên
            exclude_id: ID chế độ lương cần loại trừ (khi update)
            effective_date: Ngày áp dụng để check overlap
        """
        if not emp_ids:
            return []
        
        query = NhanvienChedoluong.objects.filter(
            nhanvien_id__in=emp_ids,
            trangthai='active'
        ).filter(
            Q(chedoluong__is_deleted=False) | Q(chedoluong__is_deleted__isnull=True)
        ).filter(
            chedoluong__trangthai='active'
        )
        
        if exclude_id:
            query = query.exclude(chedoluong_id=exclude_id)
        
        # Check overlap time nếu có effective_date
        if effective_date:
            # Lọc những bản ghi có khoảng thời gian overlap
            query = query.filter(
                Q(ngayketthuc__isnull=True) | Q(ngayketthuc__gte=effective_date)
            )
        
        query = query.order_by('nhanvien_id', '-created_at').distinct('nhanvien_id')
        
        data = query.values(
            'nhanvien__id',
            'nhanvien__hovaten',
            'chedoluong__id',
            'chedoluong__tenchedo'
        )
        
        conflicts = []
        for item in data:
            conflicts.append({
                'type': 'emp',
                'id': item['nhanvien__id'],
                'emp_id': item['nhanvien__id'],
                'emp_name': item['nhanvien__hovaten'],
                'current_schedule_id': item['chedoluong__id'],
                'current_schedule_name': item['chedoluong__tenchedo']
            })
        
        return conflicts
    
    @staticmethod
    def check_department_conflicts(dept_ids, exclude_id=None, effective_date=None):
        """Kiểm tra phòng ban đã thuộc chế độ lương khác đang active chưa"""
        if not dept_ids:
            return []
        
        query = PhongbanChedoluong.objects.filter(
            phongban_id__in=dept_ids,
            trangthai='active'
        ).filter(
            Q(chedoluong__is_deleted=False) | Q(chedoluong__is_deleted__isnull=True)
        ).filter(
            chedoluong__trangthai='active'
        )
        
        if exclude_id:
            query = query.exclude(chedoluong_id=exclude_id)
        
        if effective_date:
            query = query.filter(
                Q(ngayketthuc__isnull=True) | Q(ngayketthuc__gte=effective_date)
            )
        
        query = query.order_by('phongban_id', '-created_at').distinct('phongban_id')
        
        data = query.values(
            'phongban__id',
            'phongban__tenphongban',
            'chedoluong__id',
            'chedoluong__tenchedo'
        )
        
        conflicts = []
        for item in data:
            conflicts.append({
                'type': 'dept',
                'dept_id': item['phongban__id'],
                'dept_name': item['phongban__tenphongban'],
                'current_schedule_id': item['chedoluong__id'],
                'current_schedule_name': item['chedoluong__tenchedo']
            })
        
        return conflicts
    
    # ============================================================
    # EXPAND DEPARTMENT IDS (Tái sử dụng logic từ LichLamViec)
    # ============================================================
    
    @staticmethod
    def _expand_dept_ids(dept_ids):
        """Mở rộng danh sách phòng ban bao gồm cả phòng ban con"""
        if not dept_ids:
            return set()
        
        from apps.hrm_manager.to_chuc_nhan_su.views import get_all_child_department_ids
        
        final_ids = set()
        for root_id in dept_ids:
            children = get_all_child_department_ids(root_id, isnclude_root=True)
            final_ids.update(children)
        
        return final_ids
    
    @staticmethod
    def get_consolidated_dept_ids(all_dept_ids):
        """Lấy danh sách phòng ban đã hợp nhất (loại bỏ con nếu cha đã chọn)"""
        if not all_dept_ids:
            return []
        
        all_dept_ids = set(map(int, all_dept_ids))
        
        all_depts = Phongban.objects.filter(trangthai='active').values('id', 'phongbancha_id')
        
        children_map = {}
        for d in all_depts:
            pid = d['phongbancha_id']
            if pid:
                if pid not in children_map:
                    children_map[pid] = []
                children_map[pid].append(d['id'])
        
        dept_map = {}
        for d in all_depts:
            dept_map[d['id']] = {'parent_id': d['phongbancha_id']}
        
        result = set()
        
        def is_ancestor_selected(dept_id):
            current = dept_id
            while current:
                info = dept_map.get(current)
                if not info:
                    break
                parent_id = info.get('parent_id')
                if parent_id and parent_id in all_dept_ids:
                    return True
                current = parent_id
            return False
        
        for dept_id in all_dept_ids:
            if not is_ancestor_selected(dept_id):
                result.add(dept_id)
        
        return list(result)
    
    # ============================================================
    # ACTIVE COUNTS
    # ============================================================
    
    @classmethod
    def get_active_counts(cls, che_do):
        """Lấy số lượng nhân viên và phòng ban đang active"""
        emp_count = NhanvienChedoluong.objects.filter(
            chedoluong=che_do,
            trangthai='active'
        ).count()
        
        dept_count = PhongbanChedoluong.objects.filter(
            chedoluong=che_do,
            trangthai='active'
        ).count()
        
        return emp_count, dept_count
    
    @classmethod
    def has_payroll_history(cls, che_do):
        """Kiểm tra có bảng lương lịch sử không"""
        return Bangluong.objects.filter(chedoluong=che_do).exists()
    
    @classmethod
    def has_salary_rules(cls, che_do):
        """Kiểm tra có công thức tính lương không"""
        return Quytacchedoluong.objects.filter(chedoluong=che_do).exists()
    
    # ============================================================
    # DELETE OPERATIONS
    # ============================================================
    
    @classmethod
    def check_can_delete(cls, che_do):
        """
        Kiểm tra có thể xóa chế độ lương không
        
        Returns:
            dict: {
                'can_delete': bool,
                'reason': str,
                'delete_type': 'hard' | 'soft' | 'blocked',
                'details': dict (emp_count, dept_count, rule_count, etc.)
            }
        """
        result = {
            'can_delete': False,
            'reason': '',
            'delete_type': 'blocked',
            'details': {}
        }
        
        # STEP 1: Kiểm tra kỳ lương chưa chốt
        is_locked, ky_luong = cls.check_payroll_period_lock(che_do)
        if is_locked:
            result['reason'] = f"Chế độ đang trong kỳ lương {ky_luong.thang}/{ky_luong.ngaybatdau.year}.Vui lòng chờ chốt kỳ."
            return result
        
        # STEP 2: Kiểm tra có bảng lương không
        has_payrolls = cls.has_payroll_history(che_do)
        if has_payrolls:
            result['can_delete'] = True
            result['delete_type'] = 'soft'
            result['reason'] = 'Đã có bảng lương lịch sử - chỉ có thể xóa mềm'
            return result
        
        # STEP 3: Kiểm tra có nhân viên/phòng ban đang dùng
        emp_count, dept_count = cls.get_active_counts(che_do)
        total_active = emp_count + dept_count
        
        if total_active > 0:
            result['reason'] = f'Vui lòng chuyển {total_active} nhân viên/phòng ban sang chế độ khác trước khi xóa'
            result['details'] = {'emp_count': emp_count, 'dept_count': dept_count}
            return result
        
        # STEP 4: Kiểm tra có công thức không
        rule_count = Quytacchedoluong.objects.filter(chedoluong=che_do).count()
        if rule_count > 0:
            result['can_delete'] = True
            result['delete_type'] = 'hard_with_rules'
            result['reason'] = f'Có {rule_count} công thức sẽ bị xóa theo.Tiếp tục?'
            result['details'] = {'rule_count': rule_count}
            return result
        
        # STEP 5: Có thể xóa cứng
        result['can_delete'] = True
        result['delete_type'] = 'hard'
        result['reason'] = 'OK'
        return result
    
    @classmethod
    @transaction.atomic
    def delete_che_do(cls, che_do, force_soft_delete=False):
        """
        Xóa chế độ lương với Business Rules
        
        Args:
            che_do: Instance Chedoluong
            force_soft_delete: Bắt buộc xóa mềm (từ frontend confirm)
        
        Returns:
            tuple: (success: bool, message: str)
        """
        check_result = cls.check_can_delete(che_do)
        
        if not check_result['can_delete']:
            return (False, check_result['reason'])
        
        now = timezone.now()
        
        # Soft delete
        if check_result['delete_type'] == 'soft' or force_soft_delete:
            che_do.trangthai = 'inactive'
            if hasattr(che_do, 'is_deleted'):
                che_do.is_deleted = True
                che_do.deleted_at = now
            che_do.save()
            
            # Vô hiệu hóa các liên kết
            NhanvienChedoluong.objects.filter(chedoluong=che_do).update(
                trangthai='inactive',
                updated_at=now
            )
            PhongbanChedoluong.objects.filter(chedoluong=che_do).update(
                trangthai='inactive',
                updated_at=now
            )
            Quytacchedoluong.objects.filter(chedoluong=che_do).update(
                trangthai='inactive',
                updated_at=now
            )
            
            return (True, f'Đã xóa mềm chế độ lương "{che_do.tenchedo}"')
        
        # Hard delete (có thể có rules)
        rule_count = check_result.get('details', {}).get('rule_count', 0)
        
        # Xóa cascade
        Quytacchedoluong.objects.filter(chedoluong=che_do).delete()
        NhanvienChedoluong.objects.filter(chedoluong=che_do).delete()
        PhongbanChedoluong.objects.filter(chedoluong=che_do).delete()
        
        ten_che_do = che_do.tenchedo
        che_do.delete()
        
        if rule_count > 0:
            return (True, f'Đã xóa chế độ lương "{ten_che_do}" cùng {rule_count} công thức')
        return (True, f'Đã xóa chế độ lương "{ten_che_do}"')
    
    # ============================================================
    # TOGGLE STATUS
    # ============================================================
    
    @classmethod
    def check_can_toggle_off(cls, che_do):
        """
        Kiểm tra có thể tắt chế độ lương không
        
        Returns:
            dict: {
                'can_toggle': bool,
                'reason': str,
                'warning': str | None,
                'details': dict
            }
        """
        result = {
            'can_toggle': False,
            'reason': '',
            'warning': None,
            'details': {}
        }
        
        # STEP 1: Kiểm tra kỳ lương chưa chốt
        is_locked, ky_luong = cls.check_payroll_period_lock(che_do)
        if is_locked:
            result['reason'] = f"Không thể tắt khi đang trong kỳ lương {ky_luong.thang}/{ky_luong.ngaybatdau.year}.Vui lòng chờ chốt kỳ."
            return result
        
        # STEP 2: Kiểm tra có nhân viên/phòng ban đang active
        emp_count, dept_count = cls.get_active_counts(che_do)
        total_active = emp_count + dept_count
        
        if total_active > 0:
            result['reason'] = f'Vui lòng chuyển {total_active} nhân viên/phòng ban sang chế độ khác trước khi tắt'
            result['details'] = {'emp_count': emp_count, 'dept_count': dept_count}
            return result
        
        # STEP 3: Cảnh báo nếu có bảng lương lịch sử
        has_payrolls = cls.has_payroll_history(che_do)
        if has_payrolls:
            result['can_toggle'] = True
            result['warning'] = 'Chế độ đã có bảng lương lịch sử.Tắt sẽ ảnh hưởng đến báo cáo.Bạn vẫn muốn tiếp tục?'
            return result
        
        # STEP 4: Có thể tắt
        result['can_toggle'] = True
        return result
    
    @classmethod
    @transaction.atomic
    def toggle_status(cls, che_do, is_active, force=False):
        """
        Bật/Tắt chế độ lương với Business Rules
        
        Args:
            che_do: Instance Chedoluong
            is_active: bool
            force: Bỏ qua cảnh báo (từ frontend confirm)
        
        Returns:
            dict: {
                'success': bool,
                'message': str,
                'require_confirm': bool,
                'warning': str | None
            }
        """
        result = {
            'success': False,
            'message': '',
            'require_confirm': False,
            'warning': None
        }
        
        # Bật (activate)
        if is_active:
            # Kiểm tra overlap nếu có nhân viên/phòng ban
            emp_count, dept_count = cls.get_active_counts(che_do)
            
            if emp_count > 0 or dept_count > 0:
                # Lấy danh sách nhân viên và phòng ban
                emp_ids = set(
                    NhanvienChedoluong.objects.filter(
                        chedoluong=che_do,
                        trangthai='active'
                    ).values_list('nhanvien_id', flat=True)
                )
                dept_ids = set(
                    PhongbanChedoluong.objects.filter(
                        chedoluong=che_do,
                        trangthai='active'
                    ).values_list('phongban_id', flat=True)
                )
                
                # Check conflicts
                emp_conflicts = cls.check_employee_conflicts(emp_ids, exclude_id=che_do.id)
                dept_conflicts = cls.check_department_conflicts(dept_ids, exclude_id=che_do.id)
                
                if emp_conflicts or dept_conflicts:
                    result['message'] = 'Có xung đột với chế độ lương đang active khác'
                    return result
            
            che_do.trangthai = 'active'
            che_do.save()
            result['success'] = True
            result['message'] = f'Đã kích hoạt chế độ lương "{che_do.tenchedo}"'
            return result
        
        # Tắt (deactivate)
        check_result = cls.check_can_toggle_off(che_do)
        
        if not check_result['can_toggle']:
            result['message'] = check_result['reason']
            return result
        
        # Có cảnh báo nhưng chưa confirm
        if check_result.get('warning') and not force:
            result['require_confirm'] = True
            result['warning'] = check_result['warning']
            return result
        
        # Thực hiện tắt
        che_do.trangthai = 'inactive'
        che_do.save()
        
        result['success'] = True
        result['message'] = f'Đã tắt chế độ lương "{che_do.tenchedo}"'
        return result
    
    # ============================================================
    # EMPLOYEE/DEPARTMENT ASSIGNMENT
    # ============================================================
    
    @staticmethod
    @transaction.atomic
    def process_employee_assignment(che_do, all_dept_ids, all_emp_ids, 
                                     force_transfer=False, effective_date=None):
        """
        Xử lý gán nhân viên/phòng ban cho chế độ lương
        Tái sử dụng pattern từ LichLamViecService
        
        Returns:
            list: Danh sách nhân viên/phòng ban đã chuyển
        """
        transferred = []
        now = timezone.now()
        today = now.date()
        
        if effective_date is None:
            effective_date = today
        elif effective_date < today:
            effective_date = today
        
        end_date_for_old = effective_date - timedelta(days=1)
        
        # Helper tạo datetime đúng timezone
        current_tz = timezone.get_current_timezone()
        
        def to_aware_datetime(d):
            if d is None:
                return None
            return timezone.make_aware(
                datetime.combine(d, datetime.min.time().replace(hour=12)),
                current_tz
            )
        
        aware_end_date_for_old = to_aware_datetime(end_date_for_old)
        aware_effective_date = to_aware_datetime(effective_date)
        
        # ---------------------------------------------------------
        # 1.XỬ LÝ BỘ PHẬN
        # ---------------------------------------------------------
        existing_dept_rels = list(PhongbanChedoluong.objects.filter(
            phongban_id__in=all_dept_ids,
            trangthai='active'
        ).exclude(chedoluong=che_do).select_related('chedoluong', 'phongban'))
        
        dept_rels_to_update = []
        for rel in existing_dept_rels:
            transferred.append({
                'type': 'dept',
                'dept_id': rel.phongban_id,
                'dept_name': rel.phongban.tenphongban if rel.phongban else '',
                'from_schedule': rel.chedoluong.tenchedo if rel.chedoluong else '',
                'from_schedule_id': rel.chedoluong_id
            })
            
            old_start = rel.ngayapdung.date() if rel.ngayapdung else None
            if old_start and end_date_for_old < old_start:
                rel.ngayketthuc = to_aware_datetime(old_start)
            else:
                rel.ngayketthuc = aware_end_date_for_old
            rel.trangthai = 'inactive'
            rel.updated_at = now
            dept_rels_to_update.append(rel)
        
        if dept_rels_to_update:
            PhongbanChedoluong.objects.bulk_update(
                dept_rels_to_update,
                ['ngayketthuc', 'trangthai', 'updated_at'],
                batch_size=500
            )
        
        # Xử lý departments của chế độ hiện tại
        current_dept_ids = set(
            PhongbanChedoluong.objects.filter(chedoluong=che_do, trangthai='active')
            .values_list('phongban_id', flat=True)
        )
        
        depts_to_add = all_dept_ids - current_dept_ids
        depts_to_remove = current_dept_ids - all_dept_ids
        
        # BULK UPDATE cho remove
        if depts_to_remove:
            rels_to_deactivate = list(PhongbanChedoluong.objects.filter(
                chedoluong=che_do,
                phongban_id__in=depts_to_remove
            ))
            for rel in rels_to_deactivate:
                old_start = rel.ngayapdung.date() if rel.ngayapdung else None
                if old_start and end_date_for_old < old_start:
                    rel.ngayketthuc = to_aware_datetime(old_start)
                else:
                    rel.ngayketthuc = aware_end_date_for_old
                rel.trangthai = 'inactive'
                rel.updated_at = now
            
            PhongbanChedoluong.objects.bulk_update(
                rels_to_deactivate,
                ['ngayketthuc', 'trangthai', 'updated_at'],
                batch_size=500
            )
        
        # BULK CREATE cho add
        if depts_to_add:
            new_objs = [
                PhongbanChedoluong(
                    chedoluong=che_do,
                    phongban_id=did,
                    trangthai='active',
                    ngayapdung=aware_effective_date,
                    ngayketthuc=None,
                    created_at=now
                ) for did in depts_to_add
            ]
            PhongbanChedoluong.objects.bulk_create(new_objs, batch_size=500)
        
        # ---------------------------------------------------------
        # 2.XỬ LÝ NHÂN VIÊN
        # ---------------------------------------------------------
        existing_emp_rels = list(NhanvienChedoluong.objects.filter(
            nhanvien_id__in=all_emp_ids,
            trangthai='active'
        ).exclude(chedoluong=che_do).select_related('chedoluong', 'nhanvien'))
        
        emp_rels_to_update = []
        for rel in existing_emp_rels:
            transferred.append({
                'type': 'emp',
                'emp_id': rel.nhanvien_id,
                'emp_name': rel.nhanvien.hovaten if rel.nhanvien else '',
                'from_schedule': rel.chedoluong.tenchedo if rel.chedoluong else '',
                'from_schedule_id': rel.chedoluong_id
            })
            
            old_start = rel.ngayapdung.date() if rel.ngayapdung else None
            if old_start and end_date_for_old < old_start:
                rel.ngayketthuc = to_aware_datetime(old_start)
            else:
                rel.ngayketthuc = aware_end_date_for_old
            rel.trangthai = 'inactive'
            rel.updated_at = now
            emp_rels_to_update.append(rel)
        
        if emp_rels_to_update:
            NhanvienChedoluong.objects.bulk_update(
                emp_rels_to_update,
                ['ngayketthuc', 'trangthai', 'updated_at'],
                batch_size=500
            )
        
        # Xử lý employees của chế độ hiện tại
        current_emp_ids = set(
            NhanvienChedoluong.objects.filter(chedoluong=che_do, trangthai='active')
            .values_list('nhanvien_id', flat=True)
        )
        
        emps_to_add = all_emp_ids - current_emp_ids
        emps_to_remove = current_emp_ids - all_emp_ids
        
        # BULK UPDATE cho remove
        if emps_to_remove:
            emp_rels_to_deactivate = list(NhanvienChedoluong.objects.filter(
                chedoluong=che_do,
                nhanvien_id__in=emps_to_remove
            ))
            for rel in emp_rels_to_deactivate:
                old_start = rel.ngayapdung.date() if rel.ngayapdung else None
                if old_start and end_date_for_old < old_start:
                    rel.ngayketthuc = to_aware_datetime(old_start)
                else:
                    rel.ngayketthuc = aware_end_date_for_old
                rel.trangthai = 'inactive'
                rel.updated_at = now
            
            NhanvienChedoluong.objects.bulk_update(
                emp_rels_to_deactivate,
                ['ngayketthuc', 'trangthai', 'updated_at'],
                batch_size=500
            )
        
        # BULK CREATE cho add
        if emps_to_add:
            new_objs = [
                NhanvienChedoluong(
                    chedoluong=che_do,
                    nhanvien_id=eid,
                    trangthai='active',
                    ngayapdung=aware_effective_date,
                    ngayketthuc=None,
                    created_at=now
                ) for eid in emps_to_add
            ]
            NhanvienChedoluong.objects.bulk_create(new_objs, batch_size=500)
        
        return transferred
    
    # ============================================================
    # TRANSFER OPERATIONS
    # ============================================================
    
    @classmethod
    @transaction.atomic
    def transfer_employees(cls, from_che_do, to_che_do, emp_ids=None, dept_ids=None, 
                           effective_date=None):
        """
        Chuyển nhân viên/phòng ban từ chế độ này sang chế độ khác
        
        Args:
            from_che_do: Chế độ nguồn
            to_che_do: Chế độ đích
            emp_ids: List ID nhân viên cần chuyển (None = tất cả)
            dept_ids: List ID phòng ban cần chuyển (None = tất cả)
            effective_date: Ngày bắt đầu áp dụng chế độ mới
        
        Returns:
            dict: {
                'success': bool,
                'message': str,
                'transferred_count': int,
                'failed': list
            }
        """
        result = {
            'success': False,
            'message': '',
            'transferred_count': 0,
            'failed': []
        }
        
        # Validate
        if from_che_do.id == to_che_do.id:
            result['message'] = 'Chế độ nguồn và đích phải khác nhau'
            return result
        
        if to_che_do.trangthai != 'active':
            result['message'] = 'Chế độ đích phải đang active'
            return result
        
        # Kiểm tra kỳ lương lock cho cả 2 chế độ
        is_locked_from, ky_from = cls.check_payroll_period_lock(from_che_do)
        is_locked_to, ky_to = cls.check_payroll_period_lock(to_che_do)
        
        if is_locked_from:
            result['message'] = f"Chế độ nguồn đang trong kỳ lương {ky_from.thang}/{ky_from.ngaybatdau.year}"
            return result
        
        if is_locked_to:
            result['message'] = f"Chế độ đích đang trong kỳ lương {ky_to.thang}/{ky_to.ngaybatdau.year}"
            return result
        
        now = timezone.now()
        today = now.date()
        
        if effective_date is None:
            effective_date = today
        elif effective_date < today:
            effective_date = today
        
        end_date_for_old = effective_date - timedelta(days=1)
        
        current_tz = timezone.get_current_timezone()
        
        def to_aware_datetime(d):
            if d is None:
                return None
            return timezone.make_aware(
                datetime.combine(d, datetime.min.time().replace(hour=12)),
                current_tz
            )
        
        aware_end_date = to_aware_datetime(end_date_for_old)
        aware_effective = to_aware_datetime(effective_date)
        
        transferred_count = 0
        
        # Chuyển nhân viên
        if emp_ids is None:
            # Lấy tất cả nhân viên active
            emp_rels = NhanvienChedoluong.objects.filter(
                chedoluong=from_che_do,
                trangthai='active'
            )
        else:
            emp_rels = NhanvienChedoluong.objects.filter(
                chedoluong=from_che_do,
                nhanvien_id__in=emp_ids,
                trangthai='active'
            )
        
        emp_rels_list = list(emp_rels.select_related('nhanvien'))
        new_emp_records = []
        
        for rel in emp_rels_list:
            # Kết thúc bản ghi cũ
            old_start = rel.ngayapdung.date() if rel.ngayapdung else None
            if old_start and end_date_for_old < old_start:
                rel.ngayketthuc = to_aware_datetime(old_start)
            else:
                rel.ngayketthuc = aware_end_date
            rel.trangthai = 'inactive'
            rel.updated_at = now
            
            # Chuẩn bị bản ghi mới
            new_emp_records.append(NhanvienChedoluong(
                chedoluong=to_che_do,
                nhanvien_id=rel.nhanvien_id,
                trangthai='active',
                ngayapdung=aware_effective,
                ngayketthuc=None,
                created_at=now
            ))
            transferred_count += 1
        
        # Bulk update và create
        if emp_rels_list:
            NhanvienChedoluong.objects.bulk_update(
                emp_rels_list,
                ['ngayketthuc', 'trangthai', 'updated_at'],
                batch_size=500
            )
        
        if new_emp_records:
            NhanvienChedoluong.objects.bulk_create(new_emp_records, batch_size=500)
        
        # Chuyển phòng ban (tương tự)
        if dept_ids is None:
            dept_rels = PhongbanChedoluong.objects.filter(
                chedoluong=from_che_do,
                trangthai='active'
            )
        else:
            dept_rels = PhongbanChedoluong.objects.filter(
                chedoluong=from_che_do,
                phongban_id__in=dept_ids,
                trangthai='active'
            )
        
        dept_rels_list = list(dept_rels.select_related('phongban'))
        new_dept_records = []
        
        for rel in dept_rels_list:
            old_start = rel.ngayapdung.date() if rel.ngayapdung else None
            if old_start and end_date_for_old < old_start:
                rel.ngayketthuc = to_aware_datetime(old_start)
            else:
                rel.ngayketthuc = aware_end_date
            rel.trangthai = 'inactive'
            rel.updated_at = now
            
            new_dept_records.append(PhongbanChedoluong(
                chedoluong=to_che_do,
                phongban_id=rel.phongban_id,
                trangthai='active',
                ngayapdung=aware_effective,
                ngayketthuc=None,
                created_at=now
            ))
            transferred_count += 1
        
        if dept_rels_list:
            PhongbanChedoluong.objects.bulk_update(
                dept_rels_list,
                ['ngayketthuc', 'trangthai', 'updated_at'],
                batch_size=500
            )
        
        if new_dept_records:
            PhongbanChedoluong.objects.bulk_create(new_dept_records, batch_size=500)
        
        result['success'] = True
        result['transferred_count'] = transferred_count
        result['message'] = f"Đã chuyển {transferred_count} nhân viên/phòng ban từ '{from_che_do.tenchedo}' sang '{to_che_do.tenchedo}'"
        
        return result