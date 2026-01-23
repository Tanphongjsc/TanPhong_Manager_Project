"""
File:  apps/hrm_manager/quan_ly_luong/services.py
Service Layer cho Chế độ lương - Business Rules
"""

from time import timezone
from django.db import transaction
from django.db.models import Count, Q, Exists, OuterRef
from apps.hrm_manager.__core__.models import *


class CheDoLuongService: 
    """Service xử lý Business Logic cho Chế độ lương"""
    
    DEFAULT_CODE = 'CHE_DO_MAC_DINH'
    
    @classmethod
    def get_default_che_do(cls):
        """Lấy chế độ lương mặc định"""
        return Chedoluong.objects.filter(
            machedo=cls.DEFAULT_CODE
        ).first()
    
    @classmethod
    def ensure_default_exists(cls):
        """Đảm bảo luôn có chế độ lương mặc định"""
        if not cls.get_default_che_do():
            return Chedoluong.objects.create(
                machedo=cls.DEFAULT_CODE,
                tenchedo='Chế độ lương mặc định',
                trangthai='active',
                ghichu='Chế độ lương mặc định của hệ thống (không được xóa)'
            )
        return cls.get_default_che_do()
    
    @classmethod
    def check_can_delete(cls, che_do):
        """
        Kiểm tra có thể xóa chế độ lương không
        
        Returns:
            tuple: (can_delete:  bool, reason: str, must_soft_delete: bool)
        """
        # RULE 1: Không cho xóa chế độ mặc định
        if che_do.machedo == cls.DEFAULT_CODE: 
            return (False, 'Không thể xóa chế độ lương mặc định', False)
        
        # RULE 2: Kiểm tra có bảng lương không
        has_payrolls = Bangluong.objects.filter(chedoluong=che_do).exists()
        if has_payrolls:
            return (True, 'Đã có bảng lương - chỉ có thể xóa mềm', True)
        
        # RULE 3: Kiểm tra có nhân viên/phòng ban đang dùng
        has_active_relations = (
            NhanvienChedoluong.objects.filter(
                chedoluong=che_do, 
                trangthai='active'
            ).exists() or
            PhongbanChedoluong.objects.filter(
                chedoluong=che_do, 
                trangthai='active'
            ).exists()
        )
        
        if has_active_relations:
            return (True, 'Có nhân viên/phòng ban đang sử dụng - cần chuyển về mặc định', False)
        
        return (True, 'OK', False)
    
    @classmethod
    @transaction.atomic
    def delete_che_do(cls, che_do, soft_delete=False):
        """
        Xóa chế độ lương với Business Rules
        
        Args: 
            che_do: Instance Chedoluong
            soft_delete: Có xóa mềm không
            
        Returns:
            tuple:  (success:  bool, message: str)
        """
        can_delete, reason, must_soft = cls.check_can_delete(che_do)
        
        if not can_delete:
            return (False, reason)
        
        # Nếu bắt buộc xóa mềm hoặc request soft delete
        if must_soft or soft_delete:
            che_do.trangthai = 'inactive'
            # Nếu model có trường is_deleted
            if hasattr(che_do, 'is_deleted'):
                che_do.is_deleted = True
                che_do.deleted_at = timezone.now()
            che_do.save()
            
            # Vô hiệu hóa các liên kết
            NhanvienChedoluong.objects.filter(chedoluong=che_do).update(trangthai='inactive')
            PhongbanChedoluong.objects.filter(chedoluong=che_do).update(trangthai='inactive')
            
            return (True, f'Đã xóa mềm chế độ lương "{che_do.tenchedo}"')
        
        # Chuyển nhân viên về mặc định nếu cần
        default_che_do = cls.ensure_default_exists()
        
        # Chuyển nhân viên
        nv_count = NhanvienChedoluong.objects.filter(
            chedoluong=che_do, 
            trangthai='active'
        ).update(chedoluong=default_che_do)
        
        # Chuyển phòng ban
        pb_count = PhongbanChedoluong.objects.filter(
            chedoluong=che_do, 
            trangthai='active'
        ).update(chedoluong=default_che_do)
        
        # Xóa cứng
        che_do.delete()
        
        msg = f'Đã xóa chế độ lương "{che_do.tenchedo}"'
        if nv_count > 0 or pb_count > 0:
            msg += f' và chuyển {nv_count + pb_count} đối tượng về chế độ mặc định'
        
        return (True, msg)
    
    @classmethod
    @transaction.atomic
    def toggle_status(cls, che_do, is_active):
        """
        Bật/Tắt chế độ lương với Business Rules
        
        Args: 
            che_do: Instance Chedoluong
            is_active: bool
            
        Returns:
            tuple: (success: bool, message: str)
        """
        # RULE 1: Không cho tắt chế độ mặc định
        if not is_active and che_do.machedo == cls.DEFAULT_CODE:
            return (False, 'Không thể tắt chế độ lương mặc định')
        
        # RULE 2: Nếu tắt và có nhân viên active → Chuyển về mặc định
        if not is_active: 
            default_che_do = cls.ensure_default_exists()
            
            nv_count = NhanvienChedoluong.objects.filter(
                chedoluong=che_do, 
                trangthai='active'
            ).update(chedoluong=default_che_do)
            
            pb_count = PhongbanChedoluong.objects.filter(
                chedoluong=che_do, 
                trangthai='active'
            ).update(chedoluong=default_che_do)
        
        # Cập nhật trạng thái
        che_do.trangthai = 'active' if is_active else 'inactive'
        che_do.save()
        
        action = 'kích hoạt' if is_active else 'tắt'
        msg = f'Đã {action} chế độ lương "{che_do.tenchedo}"'
        
        if not is_active and (nv_count > 0 or pb_count > 0):
            msg += f' và chuyển {nv_count + pb_count} đối tượng về chế độ mặc định'
        
        return (True, msg)
    
    @classmethod
    def validate_dates(cls, ngay_ap_dung, ngay_het_han):
        """Validate ngày áp dụng và hết hạn"""
        if ngay_ap_dung and ngay_het_han: 
            if ngay_het_han < ngay_ap_dung:
                return (False, 'Ngày hết hạn phải sau ngày áp dụng')
        return (True, '')
    
    @classmethod
    def validate_unique_code(cls, ma_che_do, exclude_id=None):
        """Validate mã chế độ lương unique"""
        queryset = Chedoluong.objects.filter(machedo=ma_che_do)
        if exclude_id:
            queryset = queryset.exclude(id=exclude_id)
        
        if queryset.exists():
            return (False, f'Mã chế độ lương "{ma_che_do}" đã tồn tại')
        return (True, '')
    
    @classmethod
    def can_modify_code(cls, che_do):
        """Kiểm tra có thể sửa mã không"""
        # RULE:  Không cho sửa mã nếu đã có bảng lương hoặc quy tắc
        has_data = (
            Bangluong.objects.filter(chedoluong=che_do).exists() or
            Quytacchedoluong.objects.filter(chedoluong=che_do).exists()
        )
        return not has_data
    
    # ============================================================
    # EMPLOYEE/DEPARTMENT ASSIGNMENT (Mới)
    # ============================================================
    
    @staticmethod
    def check_employee_conflicts(emp_ids, exclude_id=None):
        """
        Kiểm tra nhân viên đã thuộc chế độ lương khác chưa
        ✅ Tối ưu:  Dùng values() thay vì load full object
        """
        if not emp_ids:
            return []
        
        query = NhanvienChedoluong.objects.filter(
            nhanvien_id__in=emp_ids,
            trangthai='active'
        ).filter(
            Q(chedoluong__is_deleted=False) | Q(chedoluong__is_deleted__isnull=True)
        )
        
        if exclude_id:
            query = query.exclude(chedoluong_id=exclude_id)
        
        # Order và Distinct để lấy 1 record mới nhất của mỗi nhân viên
        query = query.order_by('nhanvien_id', '-created_at').distinct('nhanvien_id')
        
        # ✅ Dùng values() để fetch nhanh
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
    def check_department_conflicts(dept_ids, exclude_id=None):
        """
        Kiểm tra phòng ban đã thuộc chế độ lương khác chưa
        ✅ Tối ưu:  Dùng values()
        """
        if not dept_ids:
            return []
        
        query = PhongbanChedoluong.objects.filter(
            phongban_id__in=dept_ids,
            trangthai='active'
        ).filter(
            Q(chedoluong__is_deleted=False) | Q(chedoluong__is_deleted__isnull=True)
        )
        
        if exclude_id:
            query = query.exclude(chedoluong_id=exclude_id)
        
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
                'current_schedule_name':  item['chedoluong__tenchedo']
            })
        
        return conflicts
    
    @staticmethod
    @transaction.atomic
    def process_employee_assignment(che_do, all_dept_ids, all_emp_ids, force_transfer=False):
        """
        Xử lý gán nhân viên/phòng ban cho chế độ lương
        ✅ Tối ưu: Bulk operations, tái sử dụng logic từ LichLamViecService
        
        Returns:
            list: Danh sách nhân viên/phòng ban đã chuyển
        """
        transferred = []
        now = timezone.now()
        
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
                'from_schedule':  rel.chedoluong.tenchedo if rel.chedoluong else '',
                'from_schedule_id': rel.chedoluong_id
            })
            rel.trangthai = 'inactive'
            rel.updated_at = now
            dept_rels_to_update.append(rel)
        
        # ✅ BULK UPDATE
        if dept_rels_to_update:
            PhongbanChedoluong.objects.bulk_update(
                dept_rels_to_update,
                ['trangthai', 'updated_at'],
                batch_size=500
            )
        
        # Xử lý departments của chế độ hiện tại
        current_dept_ids = set(
            PhongbanChedoluong.objects.filter(chedoluong=che_do, trangthai='active')
            .values_list('phongban_id', flat=True)
        )
        
        depts_to_add = all_dept_ids - current_dept_ids
        depts_to_remove = current_dept_ids - all_dept_ids
        
        # ✅ BULK UPDATE cho remove
        if depts_to_remove:
            PhongbanChedoluong.objects.filter(
                chedoluong=che_do,
                phongban_id__in=depts_to_remove
            ).update(trangthai='inactive', updated_at=now)
        
        # ✅ BULK CREATE cho add
        if depts_to_add:
            new_objs = [
                PhongbanChedoluong(
                    chedoluong=che_do,
                    phongban_id=did,
                    trangthai='active',
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
                'type':  'emp',
                'emp_id': rel.nhanvien_id,
                'emp_name': rel.nhanvien.hovaten if rel.nhanvien else '',
                'from_schedule': rel.chedoluong.tenchedo if rel.chedoluong else '',
                'from_schedule_id':  rel.chedoluong_id
            })
            rel.trangthai = 'inactive'
            rel.updated_at = now
            emp_rels_to_update.append(rel)
        
        # ✅ BULK UPDATE
        if emp_rels_to_update: 
            NhanvienChedoluong.objects.bulk_update(
                emp_rels_to_update,
                ['trangthai', 'updated_at'],
                batch_size=500
            )
        
        # Xử lý employees của chế độ hiện tại
        current_emp_ids = set(
            NhanvienChedoluong.objects.filter(chedoluong=che_do, trangthai='active')
            .values_list('nhanvien_id', flat=True)
        )
        
        emps_to_add = all_emp_ids - current_emp_ids
        emps_to_remove = current_emp_ids - all_emp_ids
        
        # ✅ BULK UPDATE cho remove
        if emps_to_remove:
            NhanvienChedoluong.objects.filter(
                chedoluong=che_do,
                nhanvien_id__in=emps_to_remove
            ).update(trangthai='inactive', updated_at=now)
        
        # ✅ BULK CREATE cho add
        if emps_to_add:
            new_objs = [
                NhanvienChedoluong(
                    chedoluong=che_do,
                    nhanvien_id=eid,
                    trangthai='active',
                    created_at=now
                ) for eid in emps_to_add
            ]
            NhanvienChedoluong.objects.bulk_create(new_objs, batch_size=500)
        
        return transferred
