"""
File: apps/hrm_manager/cham_cong/services.py
Mô tả: Service Layer cho Ca làm việc (Tách logic CRUD ra khỏi views)
"""

from django.utils import timezone
from django. db import transaction
from django.core.exceptions import ValidationError
from django.db.models import Prefetch
from apps.hrm_manager.__core__.models import *
from .validators import validate_shift_details, validate_schedule_time_overlap
from apps.hrm_manager.to_chuc_nhan_su.views import get_all_child_department_ids

class ConflictException(Exception):
    """Exception khi có xung đột nhân viên"""
    def __init__(self, conflicts):
        emp_count = len([c for c in conflicts if c.get('type') == 'emp'])
        super().__init__(f"Có {emp_count} nhân viên đang thuộc lịch làm việc khác")
        self.conflicts = conflicts

class CaLamViecService:
    """
    Service xử lý logic CRUD cho Ca làm việc
    ✅ DRY: Tái sử dụng cho cả Create và Update
    """
    
    @staticmethod
    def create_ca(data):
        """
        Tạo mới Ca làm việc
        
        Args:
            data: Dict payload đã validate
        
        Returns:
            Calamviec instance
        """

        is_valid, error = validate_shift_details(data)
        if not is_valid:
            raise ValidationError(error)
        
        with transaction.atomic():
            ca_moi = Calamviec. objects.create(
                tencalamviec=data. get('TenCa'),
                macalamviec=data.get('MaCa', ''). strip(). upper(),
                loaichamcong=data.get('LoaiCa'),
                tongthoigianlamvieccuaca=data.get('TongThoiGian', 0),
                congcuacalamviec=float(data.get('TongCong', 0)),
                sokhunggiotrongca=data.get('SoKhungGio', 1),
                cocancheckout=not data.get('KhongCanCheckout', False),
                solanchamcongtrongngay=data.get('SoLanChamCong', 1),
                conghitrua=bool(data.get('NghiTrua')),
                trangthai='active',
                created_at=timezone.now()
            )
            
            # Lưu chi tiết khung giờ và nghỉ trưa
            CaLamViecService._save_shift_details(ca_moi, data)
            
            return ca_moi
    
    @staticmethod
    def update_ca(ca_instance, data):
        """
        Cập nhật Ca làm việc
        
        Args:
            ca_instance: Calamviec object cần update
            data: Dict payload đã validate
        
        Returns:
            Calamviec instance đã update
        """

        is_valid, error = validate_shift_details(data)
        if not is_valid:
            raise ValidationError(error)
        
        with transaction.atomic():
            # Update fields
            ca_instance.tencalamviec = data.get('TenCa')
            ca_instance.macalamviec = data.get('MaCa', '').strip(). upper()
            ca_instance. loaichamcong = data.get('LoaiCa')
            ca_instance.tongthoigianlamvieccuaca = data.get('TongThoiGian', 0)
            ca_instance.congcuacalamviec = float(data.get('TongCong', 0))
            ca_instance.sokhunggiotrongca = data.get('SoKhungGio', 1)
            ca_instance.solanchamcongtrongngay = data.get('SoLanChamCong', 1)
            ca_instance.cocancheckout = not data.get('KhongCanCheckout', False)
            ca_instance. conghitrua = bool(data.get('NghiTrua'))
            ca_instance.updated_at = timezone.now()
            ca_instance.save()

            # Xóa cũ, tạo mới (đơn giản hơn update từng record)
            ca_instance.khunggiolamviec_set.all().delete()
            ca_instance.khunggionghitrua_set.all().delete()
            
            CaLamViecService._save_shift_details(ca_instance, data)
            
            return ca_instance
    
    @staticmethod
    def _save_shift_details(ca_instance, data):
        """
        Lưu Khung giờ làm việc & Nghỉ trưa (Private helper)
        ✅ Tái sử dụng cho cả Create và Update
        """
        khung_gios = data.get('ChiTietKhungGio', [])
        nghi_trua = data.get('NghiTrua')

        for kg in khung_gios:
            Khunggiolamviec. objects.create(
                calamviec=ca_instance,
                
                # Thời gian chính
                thoigianbatdau=kg. get('GioBatDau') or None,
                thoigianketthuc=kg.get('GioKetThuc') or None,
                congcuakhunggio=kg.get('Cong', 0),
                
                # Cố định: Trường cũ
                thoigianchophepdenmuon=kg.get('DenMuonCP', 0),
                thoigianchophepvesomnhat=kg.get('VeSomCP', 0),
                
                # Linh động: Trường mới
                sophutdenmuon=kg.get('LinhDongDenMuon', 0),
                sophutdensom=kg.get('LinhDongVeSom', 0),
                
                # Trường chung
                thoigiandimuonkhongtinhchamcong=kg.get('KhongTinhCongNeuMuonHon', 0),
                thoigianvesomkhongtinhchamcong=kg.get('KhongTinhCongNeuSomHon', 0),
                thoigianchophepchamcongsomnhat=kg.get('CheckInSomNhat') or None,
                thoigianchophepvemuonnhat=kg.get('CheckOutMuonNhat') or None,
                thoigianlamviectoithieu=kg.get('MinPhutLamViec', 0),
                yeucauchamcong=kg.get('YeuCauChamCong', True),
                
                created_at=timezone.now()
            )

        if nghi_trua:
            Khunggionghitrua.objects.create(
                calamviec=ca_instance,
                giobatdau=nghi_trua.get('BatDau'),
                gioketthuc=nghi_trua.get('KetThuc'),
                created_at=timezone.now()
            )
    
    @staticmethod
    def delete_ca(ca_instance):
        """
        Xóa Ca làm việc (Kiểm tra ràng buộc)
        
        Args:
            ca_instance: Calamviec object cần xóa
        
        Returns:
            tuple: (success: bool, message: str)
        """
        # Chặn xóa CAHANHCHINH
        if ca_instance.macalamviec == 'CAHANHCHINH':
            return False, "Đây là ca làm việc mặc định của hệ thống, không được phép xóa!"
        
        try:
            with transaction.atomic():
                # Xóa dữ liệu liên quan trước
                ca_instance.khunggiolamviec_set.all().delete()
                ca_instance.khunggionghitrua_set.all(). delete()
                
                # Xóa Ca
                ca_instance.delete()
            
            return True, "Xóa thành công!"
        except Exception as e:
            return False, f"Không thể xóa: {str(e)}"
        

class LichLamViecService: 
    
    @staticmethod
    def get_employees_from_departments(dept_ids):
        if not dept_ids: return set()
        return set(Nhanvien.objects.filter(
            lichsucongtac__phongban_id__in=dept_ids,
            lichsucongtac__trangthai='active',
            lichsucongtac__ketthuc__isnull=True,
            trangthai='active'
        ).values_list('id', flat=True))

    @staticmethod
    def resolve_all_employees(dept_ids, direct_emp_ids):
        dept_emp_ids = LichLamViecService.get_employees_from_departments(dept_ids)
        all_ids = dept_emp_ids.union(set(direct_emp_ids))
        return all_ids

    @staticmethod
    def check_employee_conflicts(emp_ids, exclude_schedule_id=None):
        """
        TỐI ƯU HÓA: Dùng distinct() để loại bỏ bản ghi trùng, sửa lỗi đếm sai số lượng
        """
        if not emp_ids: return []
        
        query = LichlamviecNhanvien.objects.filter(
            nhanvien_id__in=emp_ids,
            trangthai='active'
        ).select_related('nhanvien', 'lichlamviec')
        
        if exclude_schedule_id:
            query = query.exclude(lichlamviec_id=exclude_schedule_id)
        
        # FIX lỗi đếm sai: Chỉ lấy mỗi nhân viên 1 bản ghi xung đột mới nhất
        # (Trong trường hợp data rác có 1 nhân viên active ở 2 lịch)
        query = query.order_by('nhanvien_id', '-created_at').distinct('nhanvien_id')
        
        conflicts = []
        for record in query:
            conflicts.append({
                'type': 'emp',
                'id': record.nhanvien.id,      # Giữ lại để tương thích
                'emp_id': record.nhanvien.id,  # Key mới bạn đã thêm
                'emp_name': record.nhanvien.hovaten,
                'current_schedule_id': record.lichlamviec.id,
                'current_schedule_name': record.lichlamviec.tenlichlamviec
            })
        
        return conflicts

    @staticmethod
    def check_department_conflicts(dept_ids, exclude_schedule_id=None):
        if not dept_ids: return []
        
        query = LichlamviecPhongban.objects.filter(
            phongban_id__in=dept_ids,
            trangthai='active'
        ).select_related('phongban', 'lichlamviec')
        
        if exclude_schedule_id:
            query = query.exclude(lichlamviec_id=exclude_schedule_id)
        
        # Tương tự, distinct theo phongban_id
        query = query.order_by('phongban_id', '-created_at').distinct('phongban_id')
        
        conflicts = []
        for record in query:
            conflicts.append({
                'type': 'dept',
                'dept_id': record.phongban.id,
                'dept_name': record.phongban.tenphongban,
                'current_schedule_id': record.lichlamviec.id,
                'current_schedule_name': record.lichlamviec.tenlichlamviec
            })
        
        return conflicts

    @staticmethod
    def _expand_dept_ids(dept_ids):
        """Mở rộng danh sách bộ phận sử dụng Helper có sẵn từ View"""
        if not dept_ids: return set()
        
        final_ids = set()
        # dept_ids có thể là list string hoặc int
        for root_id in dept_ids:
            # Tái sử dụng hàm logic có sẵn, không viết lại đệ quy
            children = get_all_child_department_ids(root_id, isnclude_root=True)
            final_ids.update(children)
            
        return final_ids

    @staticmethod
    def get_consolidated_dept_ids(all_dept_ids):
        """Lấy danh sách bộ phận đã được hợp nhất (loại bỏ con nếu cha đã được chọn)"""
        if not all_dept_ids: return []
        all_dept_ids = set(map(int, all_dept_ids))
        
        dept_map = {}
        all_depts = Phongban.objects.filter(trangthai='active').values('id', 'phongbancha_id')
        
        children_map = {}
        for d in all_depts:
            pid = d['phongbancha_id']
            if pid: 
                if pid not in children_map: children_map[pid] = []
                children_map[pid].append(d['id'])
        
        for d in all_depts: 
            dept_map[d['id']] = {'parent_id': d['phongbancha_id'], 'children_ids': children_map.get(d['id'], [])}
        
        result = set()
        def is_ancestor_selected(dept_id):
            current = dept_id
            while current: 
                info = dept_map.get(current)
                if not info: break
                parent_id = info.get('parent_id')
                if parent_id and parent_id in all_dept_ids: return True
                current = parent_id
            return False
        
        for dept_id in all_dept_ids:
            if not is_ancestor_selected(dept_id):
                result.add(dept_id)
        return list(result)

    @staticmethod
    def get_detail_for_form(lich):
        """Lấy chi tiết lịch làm việc để fill vào form Edit"""
        all_dept_ids = list(lich.lichlamviecphongban_set.filter(trangthai='active').values_list('phongban_id', flat=True))
        consolidated_dept_ids = LichLamViecService.get_consolidated_dept_ids(all_dept_ids)
        
        depts = []
        if consolidated_dept_ids:
            depts = [{'id': d.id, 'name': d.tenphongban} for d in Phongban.objects.filter(id__in=consolidated_dept_ids)]
        
        dept_emp_ids = LichLamViecService.get_employees_from_departments(all_dept_ids)
        
        all_emp_records = lich.lichlamviecnhanvien_set.filter(trangthai='active').select_related('nhanvien')
        emps = []
        emp_ids = []
        for rec in all_emp_records:
            if rec.nhanvien and rec.nhanvien.id not in dept_emp_ids: 
                emps.append({'id': rec.nhanvien.id, 'name': rec.nhanvien.hovaten, 'dept': ''})
                emp_ids.append(rec.nhanvien.id)
        
        details = []
        if lich.loaikichbanlamviec == 'CO_DINH':
            # Tối ưu query khung giờ
            codinh_list = lich.lichlamvieccodinh_set.select_related('calamviec').prefetch_related(
                Prefetch('calamviec__khunggiolamviec_set', queryset=Khunggiolamviec.objects.order_by('id'))
            ).order_by('ngaytrongtuan', 'id')

            for cd in codinh_list:
                ca = cd.calamviec
                if ca: 
                    khung_gios = [
                        f"{kg.thoigianbatdau.strftime('%H:%M')} - {kg.thoigianketthuc.strftime('%H:%M')}"
                        for kg in ca.khunggiolamviec_set.all()
                    ]
                    details.append({'Ngay': cd.ngaytrongtuan, 'CaID': ca.id, 'TenCa': ca.tencalamviec, 'KhungGio': khung_gios})
        
        return {
            'id': lich.id,
            'TenNhom': lich.tenlichlamviec,
            'MaNhom': lich.malichlamviec,
            'LoaiKichBan': lich.loaikichbanlamviec,
            'Depts': depts,
            'Emps': emps,
            'ApDung_PhongBan': consolidated_dept_ids,
            'ApDung_NhanVien': emp_ids,
            'ChiTietCa': details
        }

    # =========================================================================
    # LOGIC CORE: CREATE & UPDATE (TỐI ƯU BULK UPDATE/CREATE)
    # =========================================================================
    
    @staticmethod
    def _bulk_process_assignments(lich, all_dept_ids, all_emp_ids):
        """
        Xử lý gán Bộ phận và Nhân viên sử dụng Bulk Operations để tối ưu tốc độ.
        Trả về danh sách nhân viên/bộ phận bị chuyển từ lịch cũ.
        """
        transferred = []
        now = timezone.now()

        # ---------------------------------------------------------
        # 1. XỬ LY BỘ PHẬN (Departments)
        # ---------------------------------------------------------
        # Tìm những bộ phận đang active ở lịch khác để đánh dấu inactive
        existing_dept_rels = LichlamviecPhongban.objects.filter(
            phongban_id__in=all_dept_ids,
            trangthai='active'
        ).exclude(lichlamviec=lich).select_related('lichlamviec')

        # Lưu log chuyển đổi
        for rel in existing_dept_rels:
            transferred.append({
                'type': 'dept',
                'dept_id': rel.phongban_id,
                'from_schedule': rel.lichlamviec.tenlichlamviec
            })
        
        # Bulk Update Inactive cho các lịch cũ
        if existing_dept_rels.exists():
            LichlamviecPhongban.objects.filter(
                id__in=existing_dept_rels.values_list('id', flat=True)
            ).update(trangthai='inactive', updated_at=now)

        # Lấy danh sách bộ phận ĐANG active trong chính lịch này (để tránh tạo trùng)
        current_dept_ids = set(
            LichlamviecPhongban.objects.filter(lichlamviec=lich, trangthai='active')
            .values_list('phongban_id', flat=True)
        )

        # Xác định cần thêm mới và cần xóa
        depts_to_add = all_dept_ids - current_dept_ids
        depts_to_remove = current_dept_ids - all_dept_ids

        # Bulk Remove (Inactive) những cái không còn được chọn
        if depts_to_remove:
            LichlamviecPhongban.objects.filter(
                lichlamviec=lich, 
                phongban_id__in=depts_to_remove
            ).update(trangthai='inactive', updated_at=now)

        # Bulk Create những cái mới
        new_dept_objs = [
            LichlamviecPhongban(
                lichlamviec=lich,
                phongban_id=did,
                trangthai='active',
                created_at=now
            ) for did in depts_to_add
        ]
        if new_dept_objs:
            LichlamviecPhongban.objects.bulk_create(new_dept_objs)

        # ---------------------------------------------------------
        # 2. XỬ LÝ NHÂN VIÊN (Employees)
        # ---------------------------------------------------------
        # Tìm nhân viên đang active ở lịch khác
        existing_emp_rels = LichlamviecNhanvien.objects.filter(
            nhanvien_id__in=all_emp_ids,
            trangthai='active'
        ).exclude(lichlamviec=lich).select_related('lichlamviec')

        for rel in existing_emp_rels:
            transferred.append({
                'type': 'emp',
                'emp_id': rel.nhanvien_id,
                'from_schedule': rel.lichlamviec.tenlichlamviec
            })

        # Bulk Update Inactive lịch cũ
        if existing_emp_rels.exists():
            LichlamviecNhanvien.objects.filter(
                id__in=existing_emp_rels.values_list('id', flat=True)
            ).update(trangthai='inactive', updated_at=now)

        # Lấy nhân viên hiện tại của lịch này
        current_emp_ids = set(
            LichlamviecNhanvien.objects.filter(lichlamviec=lich, trangthai='active')
            .values_list('nhanvien_id', flat=True)
        )

        emps_to_add = all_emp_ids - current_emp_ids
        emps_to_remove = current_emp_ids - all_emp_ids

        # Bulk Remove
        if emps_to_remove:
            LichlamviecNhanvien.objects.filter(
                lichlamviec=lich,
                nhanvien_id__in=emps_to_remove
            ).update(trangthai='inactive', updated_at=now)

        # Bulk Create
        new_emp_objs = [
            LichlamviecNhanvien(
                lichlamviec=lich,
                nhanvien_id=eid,
                trangthai='active',
                ngayapdung=now,
                created_at=now
            ) for eid in emps_to_add
        ]
        if new_emp_objs:
            LichlamviecNhanvien.objects.bulk_create(new_emp_objs)

        return transferred

    @staticmethod
    def format_lich_list_data(page_obj):
        """
        Helper method để format dữ liệu danh sách lịch làm việc.
        Giúp View gọn nhẹ hơn.
        """
        items_list = []
        from collections import OrderedDict # Move import vào đây hoặc đầu file

        for item in page_obj.object_list:
            details = []
            
            if item.loaikichbanlamviec in ['Cố định', 'CO_DINH']:
                day_shifts_map = OrderedDict()
                
                # Dữ liệu đã được prefetch ở View, chỉ việc loop
                for setup in item.lichlamvieccodinh_set.all():
                    ca = setup.calamviec
                    if ca:  
                        day_idx = setup.ngaytrongtuan
                        if day_idx not in day_shifts_map:
                            day_shifts_map[day_idx] = []
                        
                        time_slots = []
                        for kg in ca.khunggiolamviec_set.all():
                            s = kg.thoigianbatdau.strftime('%H:%M') if kg.thoigianbatdau else ''
                            e = kg.thoigianketthuc.strftime('%H:%M') if kg.thoigianketthuc else ''
                            if s and e:
                                time_slots.append(f"{s} - {e}")
                
                        day_shifts_map[day_idx].append({
                            'TenCa': ca.tencalamviec,
                            'KhungGio': time_slots
                        })
                
                for day_idx, shifts in day_shifts_map.items():
                    details.append({
                        'Ngay': day_idx,
                        'DanhSachCa': shifts
                    })
            
            items_list.append({
                'id': item.id,
                'TenNhom': item.tenlichlamviec,
                'MaNhom': item.malichlamviec,
                'LoaiCa': item.loaikichbanlamviec,
                'ChiTietCa': details,
                'SoNhanVien': item.num_employees or 0,
                'IsDefault': item.malichlamviec == 'NHOM_MAC_DINH'
            })
        return items_list
    
    @staticmethod
    def create_lich(data, force_transfer=False):
        dept_ids = data.get('ApDung_PhongBan', [])
        direct_emp_ids = data.get('ApDung_NhanVien', [])
        
        # Validation
        if data.get('LoaiKichBan') == 'CO_DINH':
            is_valid, msg = validate_schedule_time_overlap(data.get('ChiTietCa', []))
            if not is_valid: raise ValueError(msg)
        
        all_dept_ids = LichLamViecService._expand_dept_ids(dept_ids)
        all_emp_ids = LichLamViecService.resolve_all_employees(all_dept_ids, direct_emp_ids)
        
        # Conflict Check
        if not force_transfer: 
            dept_conflicts = LichLamViecService.check_department_conflicts(all_dept_ids)
            emp_conflicts = LichLamViecService.check_employee_conflicts(all_emp_ids)
            
            if dept_conflicts or emp_conflicts:
                raise ConflictException(dept_conflicts + emp_conflicts)
        
        with transaction.atomic():
            lich = Lichlamviec.objects.create(
                tenlichlamviec=data.get('TenNhom'),
                malichlamviec=data.get('MaNhom', '').strip().upper(),
                loaikichbanlamviec=data.get('LoaiKichBan'),
                trangthai='active',
                created_at=timezone.now()
            )

            if lich.loaikichbanlamviec == 'CO_DINH':
                objs_cd = [
                    LichlamviecCodinh(
                        lichlamviec=lich,
                        ngaytrongtuan=item.get('NgayTrongTuan'),
                        calamviec_id=item.get('CaID'),
                        created_at=timezone.now()
                    ) for item in data.get('ChiTietCa', [])
                ]
                LichlamviecCodinh.objects.bulk_create(objs_cd)

            # Tối ưu bằng hàm xử lý Bulk
            transferred = LichLamViecService._bulk_process_assignments(lich, all_dept_ids, all_emp_ids)
            
            return lich, transferred

    @staticmethod
    def update_lich(lich, data, force_transfer=False):
        dept_ids = data.get('ApDung_PhongBan', [])
        direct_emp_ids = data.get('ApDung_NhanVien', [])
        
        if data.get('LoaiKichBan') == 'CO_DINH': 
            is_valid, msg = validate_schedule_time_overlap(data.get('ChiTietCa', []))
            if not is_valid: raise ValueError(msg)
        
        all_dept_ids = LichLamViecService._expand_dept_ids(dept_ids)
        all_emp_ids = LichLamViecService.resolve_all_employees(all_dept_ids, direct_emp_ids)
        
        if not force_transfer:
            dept_conflicts = LichLamViecService.check_department_conflicts(all_dept_ids, exclude_schedule_id=lich.id)
            emp_conflicts = LichLamViecService.check_employee_conflicts(all_emp_ids, exclude_schedule_id=lich.id)
            
            if dept_conflicts or emp_conflicts:
                raise ConflictException(dept_conflicts + emp_conflicts)
        
        with transaction.atomic():
            lich.tenlichlamviec = data.get('TenNhom')
            lich.malichlamviec = data.get('MaNhom', '').strip().upper()
            lich.loaikichbanlamviec = data.get('LoaiKichBan')
            lich.updated_at = timezone.now()
            lich.save()

            lich.lichlamvieccodinh_set.all().delete()
            if lich.loaikichbanlamviec == 'CO_DINH': 
                objs_cd = [
                    LichlamviecCodinh(
                        lichlamviec=lich,
                        ngaytrongtuan=item.get('NgayTrongTuan'),
                        calamviec_id=item.get('CaID'),
                        created_at=timezone.now()
                    ) for item in data.get('ChiTietCa', [])
                ]
                LichlamviecCodinh.objects.bulk_create(objs_cd)

            # Tối ưu bằng hàm xử lý Bulk
            transferred = LichLamViecService._bulk_process_assignments(lich, all_dept_ids, all_emp_ids)
            
            return lich, transferred

    @staticmethod
    def delete_lich(lich_instance):
        if lich_instance.malichlamviec == 'NHOMMACDINH':
            return False, "Không thể xóa nhóm lịch làm việc mặc định."
        try:
            with transaction.atomic():
                lich_instance.lichlamvieccodinh_set.all().delete()
                lich_instance.lichlamviecphongban_set.all().delete()
                lich_instance.lichlamviecnhanvien_set.all().delete()
                lich_instance.delete()
            return True, "Xóa thành công."
        except Exception as e:
            return False, f"Lỗi khi xóa: {str(e)}"


