"""
File: apps/hrm_manager/cham_cong/services.py
Mô tả: Service Layer cho Ca làm việc (Tách logic CRUD ra khỏi views)
"""
from django.db.models import Q
from calendar import monthrange
from datetime import date, timedelta, datetime
from collections import OrderedDict, defaultdict
import logging
import json
from django.utils import timezone
from django.db import transaction
from django.core.exceptions import ValidationError
from django.db.models import Prefetch
from apps.hrm_manager.__core__.models import *
from .validators import validate_shift_details, validate_schedule_time_overlap
from apps.hrm_manager.to_chuc_nhan_su.views import get_all_child_department_ids


logger = logging.getLogger(__name__)

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
    def check_ca_has_attendance_data(ca_id):
        """
        ✅ NEW:  Kiểm tra Ca làm việc đã có dữ liệu chấm công chưa
        """
        
        # Kiểm tra trong lịch thực tế đã qua
        past_schedule_count = Lichlamviecthucte.objects.filter(
            calamviec_id=ca_id,
            ngaylamviec__lt=date.today(),
            is_deleted=False
        ).count()
        
        if past_schedule_count > 0:
            return True, f"Ca này đã được sử dụng trong {past_schedule_count} ngày làm việc"
        
        return False, ""

    @staticmethod
    def validate_ca_update(ca_instance, new_data):
        """
        ✅ NEW:  Validate trước khi update Ca
        Chặn sửa thông tin cốt lõi nếu đã có dữ liệu chấm công
        """
        has_data, msg = CaLamViecService.check_ca_has_attendance_data(ca_instance.id)
        
        if not has_data:
            return True, ""
        
        # Lấy khung giờ hiện tại
        current_frames = list(ca_instance.khunggiolamviec_set.order_by('id').values(
            'thoigianbatdau', 'thoigianketthuc'
        ))
        
        new_frames = new_data.get('ChiTietKhungGio', [])
        
        # So sánh số lượng khung giờ
        if len(current_frames) != len(new_frames):
            return False, "Không thể thay đổi số lượng khung giờ vì ca này đã có dữ liệu lịch làm việc.Vui lòng tạo ca mới."
        
        # So sánh từng khung giờ
        for i, (current, new) in enumerate(zip(current_frames, new_frames)):
            current_start = current['thoigianbatdau'].strftime('%H:%M') if current['thoigianbatdau'] else None
            current_end = current['thoigianketthuc'].strftime('%H:%M') if current['thoigianketthuc'] else None
            
            new_start = new.get('GioBatDau')
            new_end = new.get('GioKetThuc')
            
            if current_start != new_start or current_end != new_end:
                return False, f"Không thể thay đổi giờ vào/ra của khung giờ {i+1} vì ca này đã có dữ liệu lịch làm việc.Vui lòng tạo ca mới."
        
        return True, ""
    
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
            ca_moi = Calamviec.objects.create(
                tencalamviec=data.get('TenCa'),
                macalamviec=data.get('MaCa', '').strip().upper(),
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
        ✅ FIX: Thêm validate chặn sửa thông tin cốt lõi nếu đã có lịch làm việc
        """
        # Kiểm tra xem ca đã có dữ liệu trong bảng Lichlamviecthucte chưa 
        has_data = Lichlamviecthucte.objects.filter(
            calamviec_id=ca_instance.id,
        ).exists()

        if has_data:
            # Nếu đã có dữ liệu -> Không cho sửa, return lỗi hoặc raise Exception
            # Ở đây tôi dùng raise ValidationError để tương thích với cách handle cũ
            raise ValidationError("Ca làm việc này đã phát sinh dữ liệu lịch làm việc thực tế.Không được phép chỉnh sửa!")
        
        is_valid, error = validate_shift_details(data)
        if not is_valid:
            raise ValidationError(error)
        
        with transaction.atomic():
            ca_instance.tencalamviec = data.get('TenCa')
            ca_instance.macalamviec = data.get('MaCa', '').strip().upper()
            ca_instance.loaichamcong = data.get('LoaiCa')
            ca_instance.tongthoigianlamvieccuaca = data.get('TongThoiGian', 0)
            ca_instance.congcuacalamviec = float(data.get('TongCong', 0))
            ca_instance.sokhunggiotrongca = data.get('SoKhungGio', 1)
            ca_instance.solanchamcongtrongngay = data.get('SoLanChamCong', 1)
            ca_instance.cocancheckout = not data.get('KhongCanCheckout', False)
            ca_instance.conghitrua = bool(data.get('NghiTrua'))
            ca_instance.updated_at = timezone.now()
            ca_instance.save()

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
            Khunggiolamviec.objects.create(
                calamviec=ca_instance,
                
                # Thời gian chính
                thoigianbatdau=kg.get('GioBatDau') or None,
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
        
        # 1.Kiểm tra ràng buộc Lịch làm việc
        # Check bảng LichlamviecCodinh .
        # Lưu ý: Bảng này KHÔNG có trạng thái, phải check qua bảng cha Lichlamviec
        in_fixed = LichlamviecCodinh.objects.filter(
            calamviec=ca_instance,
            lichlamviec__trangthai='active'
        ).filter(
            Q(lichlamviec__is_deleted=False) | Q(lichlamviec__is_deleted__isnull=True)
        ).exists()

        # Check bảng CtlichlamviecLichtrinh -> LichlamviecLichtrinh -> Lichlamviec
        in_flexible = CtlichlamviecLichtrinh.objects.filter(
            calamviec=ca_instance,
            lichlamviec_lichtrinh__lichlamviec__trangthai='active'
        ).filter(
            Q(lichlamviec_lichtrinh__lichlamviec__is_deleted=False) | 
            Q(lichlamviec_lichtrinh__lichlamviec__is_deleted__isnull=True)
        ).exists()

        if in_fixed or in_flexible:
            return False, "Ca làm việc đang thuộc một lịch làm việc đang hoạt động.Không thể xóa!"

        # 2.Kiểm tra dữ liệu thực tế để quyết định Xóa mềm hay Xóa cứng
        # Lichlamviecthucte
        has_actual_data = Lichlamviecthucte.objects.filter(
            calamviec=ca_instance
        ).exists()

        try:
            with transaction.atomic():
                if has_actual_data:
                    # Case: Xóa mềm
                    if hasattr(ca_instance, 'is_deleted'):
                        ca_instance.is_deleted = True
                        ca_instance.deleted_at = timezone.now()
                        ca_instance.trangthai = 'inactive' # Set inactive để ẩn khỏi các select box
                        ca_instance.save()
                        return True, "Ca làm việc đã được chuyển sang trạng thái lưu trữ do có dữ liệu lịch làm việc thực tế."
                    else:
                        return False, "Lỗi khi xử lý."
                else:
                    # Case: Xóa cứng (Chưa từng phát sinh dữ liệu)
                    # Xóa các bảng con trước (Khung giờ, Nghỉ trưa)
                    ca_instance.khunggiolamviec_set.all().delete()
                    ca_instance.khunggionghitrua_set.all().delete()
                    ca_instance.delete()
                    return True, "Đã xóa vĩnh viễn ca làm việc."
        except Exception as e:
            return False, f"Không thể xóa: {str(e)}"
        

class LichLamViecService: 

    @staticmethod
    def _normalize_period_bounds(start_date=None, end_date=None):
        if start_date is None and end_date is None:
            return None, None

        if start_date is None:
            start_date = end_date
        if end_date is None:
            end_date = start_date
        if end_date < start_date:
            start_date, end_date = end_date, start_date

        return start_date, end_date

    @staticmethod
    def _apply_relation_effective_filter(queryset, start_date=None, end_date=None):
        start_date, end_date = LichLamViecService._normalize_period_bounds(start_date, end_date)
        if start_date is None:
            return queryset

        return queryset.filter(
            Q(ngayapdung__isnull=True) | Q(ngayapdung__date__lte=end_date)
        ).filter(
            Q(ngayketthuc__isnull=True) | Q(ngayketthuc__date__gte=start_date)
        )

    @staticmethod
    def _dt_rank(value):
        if value is None:
            return float('-inf')
        return value.timestamp()

    @staticmethod
    def _get_effective_direct_assignment_map(start_date=None, end_date=None):
        """
        Trả về map {nhanvien_id: lichlamviec_id} cho direct assignment hiệu lực trong kỳ.
        Nếu dữ liệu bị chồng direct assignment, ưu tiên record có ngayapdung/created_at mới hơn.
        """
        query = LichlamviecNhanvien.objects.filter(
            trangthai='active'
        ).filter(
            Q(lichlamviec__is_deleted=False) | Q(lichlamviec__is_deleted__isnull=True),
            lichlamviec__trangthai='active'
        )
        query = LichLamViecService._apply_relation_effective_filter(query, start_date, end_date)

        winners = {}
        for row in query.values('id', 'nhanvien_id', 'lichlamviec_id', 'ngayapdung', 'created_at'):
            nhanvien_id = row.get('nhanvien_id')
            if not nhanvien_id:
                continue

            rank = (
                LichLamViecService._dt_rank(row.get('ngayapdung')),
                LichLamViecService._dt_rank(row.get('created_at')),
                row.get('id') or 0,
            )
            current = winners.get(nhanvien_id)
            if current is None or rank > current[0]:
                winners[nhanvien_id] = (rank, row.get('lichlamviec_id'))

        return {nhanvien_id: item[1] for nhanvien_id, item in winners.items()}
    
    @staticmethod
    def get_employees_from_departments(dept_ids, start_date=None, end_date=None):
        if not dept_ids:
            return set()

        start_date, end_date = LichLamViecService._normalize_period_bounds(start_date, end_date)

        query = Nhanvien.objects.filter(
            lichsucongtac__phongban_id__in=dept_ids,
            lichsucongtac__trangthai='active',
            trangthai='active'
        )

        if start_date is None:
            query = query.filter(lichsucongtac__ketthuc__isnull=True)
        else:
            query = query.filter(
                Q(lichsucongtac__batdau__isnull=True) | Q(lichsucongtac__batdau__lte=end_date)
            ).filter(
                Q(lichsucongtac__ketthuc__isnull=True) | Q(lichsucongtac__ketthuc__gte=start_date)
            )

        return set(query.values_list('id', flat=True))

    @staticmethod
    def resolve_all_employees(dept_ids, direct_emp_ids):
        dept_emp_ids = LichLamViecService.get_employees_from_departments(dept_ids)
        all_ids = dept_emp_ids.union(set(direct_emp_ids))
        return all_ids

    @staticmethod
    def check_employee_conflicts(emp_ids, exclude_schedule_id=None, effective_date=None):
        """
        TỐI ƯU: Sử dụng .values() để chỉ lấy dữ liệu cần thiết, giảm overhead của ORM.
        """
        if not emp_ids: return []
        
        # Chỉ lấy các cột cần thiết, không load cả object Model
        query = LichlamviecNhanvien.objects.filter(
            nhanvien_id__in=emp_ids,
            trangthai='active'
        ).filter(
            Q(lichlamviec__is_deleted=False) | Q(lichlamviec__is_deleted__isnull=True)
        )

        if effective_date:
            query = query.filter(
                Q(ngayapdung__isnull=True) | Q(ngayapdung__date__lte=effective_date)
            ).filter(
                Q(ngayketthuc__isnull=True) | Q(ngayketthuc__date__gte=effective_date)
            )

        if exclude_schedule_id:
            query = query.exclude(lichlamviec_id=exclude_schedule_id)
        
        # Order và Distinct ID
        query = query.order_by('nhanvien_id', '-created_at').distinct('nhanvien_id')
        
        # Dùng values() để fetch nhanh hơn
        data = query.values(
            'nhanvien__id', 
            'nhanvien__hovaten', 
            'lichlamviec__id', 
            'lichlamviec__tenlichlamviec'
        )
        
        conflicts = []
        for item in data:
            conflicts.append({
                'type': 'emp',
                'id': item['nhanvien__id'],
                'emp_id': item['nhanvien__id'],
                'emp_name': item['nhanvien__hovaten'],
                'current_schedule_id': item['lichlamviec__id'],
                'current_schedule_name': item['lichlamviec__tenlichlamviec']
            })
        
        return conflicts

    @staticmethod
    def check_department_conflicts(dept_ids, exclude_schedule_id=None, effective_date=None):
        """
        TỐI ƯU: Tương tự như check nhân viên, dùng .values()
        """
        if not dept_ids: return []
        
        query = LichlamviecPhongban.objects.filter(
            phongban_id__in=dept_ids,
            trangthai='active'
        ).filter(
            Q(lichlamviec__is_deleted=False) | Q(lichlamviec__is_deleted__isnull=True)
        )

        if effective_date:
            query = query.filter(
                Q(ngayapdung__isnull=True) | Q(ngayapdung__date__lte=effective_date)
            ).filter(
                Q(ngayketthuc__isnull=True) | Q(ngayketthuc__date__gte=effective_date)
            )

        if exclude_schedule_id:
            query = query.exclude(lichlamviec_id=exclude_schedule_id)
        
        query = query.order_by('phongban_id', '-created_at').distinct('phongban_id')
        
        data = query.values(
            'phongban__id',
            'phongban__tenphongban',
            'lichlamviec__id',
            'lichlamviec__tenlichlamviec'
        )
        
        conflicts = []
        for item in data:
            conflicts.append({
                'type': 'dept',
                'dept_id': item['phongban__id'],
                'dept_name': item['phongban__tenphongban'],
                'current_schedule_id': item['lichlamviec__id'],
                'current_schedule_name': item['lichlamviec__tenlichlamviec']
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
        # 1.Lọc ra các nhân viên lẻ (không thuộc phòng ban đã chọn)
        direct_emp_records = [
            rec for rec in all_emp_records 
            if rec.nhanvien and rec.nhanvien.id not in dept_emp_ids
        ]
        
        # 2.Lấy danh sách ID để query phòng ban 1 lần (tránh N+1 query)
        direct_emp_ids = [r.nhanvien.id for r in direct_emp_records]
        
        # 3.Tạo map {nhanvien_id: ten_phong_ban} từ Lịch sử công tác active
        emp_dept_map = {}
        if direct_emp_ids:
            # Tìm phòng ban hiện tại của các nhân viên này
            active_assignments = Lichsucongtac.objects.filter(
                nhanvien_id__in=direct_emp_ids,
                trangthai='active',
                ketthuc__isnull=True
            ).select_related('phongban')
            
            for assign in active_assignments:
                if assign.phongban:
                    emp_dept_map[assign.nhanvien_id] = assign.phongban.tenphongban

        emps = []
        emp_ids = []
        for rec in direct_emp_records:
            # Lấy tên phòng ban từ map, nếu không có thì để trống
            dept_name = emp_dept_map.get(rec.nhanvien.id, '')
            
            emps.append({
                'id': rec.nhanvien.id, 
                'name': rec.nhanvien.hovaten, 
                'dept': dept_name  # <-- ĐÃ SỬA: Gán tên phòng ban thực tế
            })
            emp_ids.append(rec.nhanvien.id)
        
        details = []
        master_shifts = []
        danh_sach_ca_ap_dung = []

        # ✅ FIX: Xử lý caidatca - có thể là list (PostgreSQL json) hoặc string JSON
        raw_caidatca = lich.caidatca
        
        parsed_data = None
        
        if raw_caidatca: 
            # ✅ Trường hợp 1: Đã là list (PostgreSQL json type tự động parse)
            if isinstance(raw_caidatca, list):
                parsed_data = raw_caidatca
            # ✅ Trường hợp 2: Là string JSON -> cần parse
            elif isinstance(raw_caidatca, str):
                try:
                    parsed_data = json.loads(raw_caidatca)
                except json.JSONDecodeError as e:
                    parsed_data = []
            # ✅ Trường hợp 3: Là dict đơn lẻ -> wrap thành list
            elif isinstance(raw_caidatca, dict):
                parsed_data = [raw_caidatca]
            else:
                parsed_data = []
        
        
        # ✅ Xử lý parsed_data
        if parsed_data and isinstance(parsed_data, list):
            for item in parsed_data:
                if isinstance(item, dict) and item.get('id'):
                    ca_id = item.get('id')
                    ten_ca = item.get('TenCa', '')
                    khung_gios = item.get('KhungGio', [])
                    
                    # Nếu thiếu thông tin, query từ DB
                    if not khung_gios or not ten_ca: 
                        ca_obj = Calamviec.objects.filter(id=ca_id).prefetch_related('khunggiolamviec_set').first()
                        if ca_obj:
                            if not ten_ca: 
                                ten_ca = ca_obj.tencalamviec
                            if not khung_gios:
                                khung_gios = [
                                    f"{kg.thoigianbatdau.strftime('%H:%M')} - {kg.thoigianketthuc.strftime('%H:%M')}"
                                    for kg in ca_obj.khunggiolamviec_set.order_by('id')
                                ]
                    
                    ca_data = {
                        'id': ca_id,
                        'TenCa': ten_ca,
                        'KhungGio':  khung_gios
                    }
                    
                    danh_sach_ca_ap_dung.append(ca_data)
                    master_shifts.append(ca_data)
        

        # Xử lý chi tiết ca theo ngày (CỐ ĐỊNH)
        if lich.loaikichbanlamviec == 'CO_DINH':
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
                    details.append({
                        'Ngay': cd.ngaytrongtuan,
                        'CaID': ca.id,
                        'TenCa': ca.tencalamviec,
                        'KhungGio': khung_gios
                    })
        
        result = {
            'id': lich.id,
            'TenNhom': lich.tenlichlamviec,
            'MaNhom': lich.malichlamviec,
            'LoaiKichBan': lich.loaikichbanlamviec,
            'Depts':  depts,
            'Emps':  emps,
            'ApDung_PhongBan':  consolidated_dept_ids,
            'ApDung_NhanVien': emp_ids,
            'ChiTietCa': details,
            'MasterShifts': master_shifts,
            'DanhSachCaApDung': danh_sach_ca_ap_dung
        }
        
        return result

    # =========================================================================
    # LOGIC CORE: CREATE & UPDATE (TỐI ƯU BULK UPDATE/CREATE)
    # =========================================================================
    
    @staticmethod
    def _bulk_process_assignments(lich, all_dept_ids, all_emp_ids, effective_date=None):
        """
        Xử lý gán Bộ phận và Nhân viên sử dụng Bulk Operations.
        ✅ FIX: Sửa logic timezone
        """
        transferred = []
        now = timezone.now()
        today = now.date()
        
        if effective_date is None:
            effective_date = today
        elif effective_date < today:
            effective_date = today
        
        end_date_for_old = effective_date - timedelta(days=1)
        
        # ✅ FIX:  Helper tạo datetime đúng timezone
        current_tz = timezone.get_current_timezone()
        def to_aware_datetime(d):
            if d is None: 
                return None
            return timezone.make_aware(
                datetime.combine(d, datetime.min.time().replace(hour=12)),
                current_tz
            )
        # Tính toán trước mốc thời gian chung cho tất cả records
        aware_end_date_for_old = to_aware_datetime(end_date_for_old)
        aware_effective_date = to_aware_datetime(effective_date)

        # ---------------------------------------------------------
        # 1.XỬ LÝ BỘ PHẬN (Departments)
        # ---------------------------------------------------------
        existing_dept_rels = LichlamviecPhongban.objects.filter(
            phongban_id__in=all_dept_ids,
            trangthai='active'
        ).exclude(lichlamviec=lich).select_related('lichlamviec', 'phongban')

        old_schedule_ids = set()
        rels_to_update = []

        for rel in existing_dept_rels: 
            old_schedule_ids.add(rel.lichlamviec_id)
            transferred.append({
                'type': 'dept',
                'dept_id': rel.phongban_id,
                'dept_name': rel.phongban.tenphongban if rel.phongban else '',
                'from_schedule': rel.lichlamviec.tenlichlamviec if rel.lichlamviec else '',
                'from_schedule_id': rel.lichlamviec_id
            })
            
            old_start = rel.ngayapdung.date() if rel.ngayapdung else None
            if old_start and end_date_for_old < old_start:
                rel.ngayketthuc = to_aware_datetime(old_start)
            else:
                rel.ngayketthuc = aware_end_date_for_old
            rel.trangthai = 'inactive'
            rel.updated_at = now
            rels_to_update.append(rel)
        
        # ✅ BULK UPDATE thay vì loop save()
        if rels_to_update: 
            LichlamviecPhongban.objects.bulk_update(
                rels_to_update, 
                ['ngayketthuc', 'trangthai', 'updated_at'],
                batch_size=500
            )

        # Xử lý departments của lịch hiện tại
        current_dept_ids = set(
            LichlamviecPhongban.objects.filter(lichlamviec=lich, trangthai='active')
            .values_list('phongban_id', flat=True)
        )

        depts_to_add = all_dept_ids - current_dept_ids
        depts_to_remove = current_dept_ids - all_dept_ids

        # ✅ BULK UPDATE cho việc remove
        if depts_to_remove:
            rels_to_deactivate = list(LichlamviecPhongban.objects.filter(
                lichlamviec=lich, 
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
            
            LichlamviecPhongban.objects.bulk_update(
                rels_to_deactivate,
                ['ngayketthuc', 'trangthai', 'updated_at'],
                batch_size=500
            )

        # ✅ BULK CREATE cho việc add
        if depts_to_add:
            new_dept_objs = [
                LichlamviecPhongban(
                    lichlamviec=lich,
                    phongban_id=did,
                    trangthai='active',
                    ngayapdung=aware_effective_date,
                    ngayketthuc=None,
                    created_at=now
                ) for did in depts_to_add
            ]
            LichlamviecPhongban.objects.bulk_create(new_dept_objs, batch_size=500)

        # ---------------------------------------------------------
        # 2.XỬ LÝ NHÂN VIÊN (Employees) - BULK UPDATE
        # ---------------------------------------------------------
        existing_emp_rels = list(LichlamviecNhanvien.objects.filter(
            nhanvien_id__in=all_emp_ids,
            trangthai='active'
        ).exclude(lichlamviec=lich).select_related('lichlamviec', 'nhanvien'))

        emp_rels_to_update = []
        for rel in existing_emp_rels:
            old_schedule_ids.add(rel.lichlamviec_id)
            transferred.append({
                'type': 'emp',
                'emp_id': rel.nhanvien_id,
                'emp_name': rel.nhanvien.hovaten if rel.nhanvien else '',
                'from_schedule': rel.lichlamviec.tenlichlamviec if rel.lichlamviec else '',
                'from_schedule_id': rel.lichlamviec_id
            })
            
            old_start = rel.ngayapdung.date() if rel.ngayapdung else None
            if old_start and end_date_for_old < old_start:
                rel.ngayketthuc = to_aware_datetime(old_start)
            else:
                rel.ngayketthuc = aware_end_date_for_old
            rel.trangthai = 'inactive'
            rel.updated_at = now
            emp_rels_to_update.append(rel)

        # ✅ BULK UPDATE
        if emp_rels_to_update:
            LichlamviecNhanvien.objects.bulk_update(
                emp_rels_to_update,
                ['ngayketthuc', 'trangthai', 'updated_at'],
                batch_size=500
            )

        # Xử lý employees của lịch hiện tại
        current_emp_ids = set(
            LichlamviecNhanvien.objects.filter(lichlamviec=lich, trangthai='active')
            .values_list('nhanvien_id', flat=True)
        )

        emps_to_add = all_emp_ids - current_emp_ids
        emps_to_remove = current_emp_ids - all_emp_ids

        # ✅ BULK UPDATE cho việc remove
        if emps_to_remove:
            emp_rels_to_deactivate = list(LichlamviecNhanvien.objects.filter(
                lichlamviec=lich,
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
            
            LichlamviecNhanvien.objects.bulk_update(
                emp_rels_to_deactivate,
                ['ngayketthuc', 'trangthai', 'updated_at'],
                batch_size=500
            )

        # ✅ BULK CREATE cho việc add
        if emps_to_add:
            new_emp_objs = [
                LichlamviecNhanvien(
                    lichlamviec=lich,
                    nhanvien_id=eid,
                    trangthai='active',
                    ngayapdung=aware_effective_date,
                    ngayketthuc=None,
                    created_at=now
                ) for eid in emps_to_add
            ]
            LichlamviecNhanvien.objects.bulk_create(new_emp_objs, batch_size=500)

        # ---------------------------------------------------------
        # 3.XÓA LỊCH THỰC TẾ TƯƠNG LAI CỦA LỊCH CŨ
        # ✅ FIX: Không phụ thuộc old_schedule_ids (có thể thiếu khi 
        #    nhân viên được gán qua phòng ban ở lịch cũ nhưng gán trực tiếp ở lịch mới).
        #    Thay vào đó, xóa TẤT CẢ lịch thực tế tương lai, exclude lịch mới.
        # ---------------------------------------------------------
        if all_emp_ids:
            Lichlamviecthucte.objects.filter(
                nhanvien_id__in=all_emp_ids,
                ngaylamviec__gte=effective_date,
                chophepghide=False
            ).exclude(
                lichlamviec=lich
            ).delete()

        return transferred

    @staticmethod
    def format_lich_list_data(page_obj):
        """
        Helper method để format dữ liệu danh sách lịch làm việc.
        Giúp View gọn nhẹ hơn.
        """
        items_list = []

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
    def _save_fixed_schedule_details_only(lich, data):
        """
        ✅ NEW: Chỉ lưu chi tiết ca theo ngày, KHÔNG lưu caidatca
        """
        chi_tiet_ca = data.get('ChiTietCa', [])
        if not chi_tiet_ca:
            return
        
        now = timezone.now()
        records_to_create = []

        for ct in chi_tiet_ca:
            ngay_trong_tuan = ct.get('NgayTrongTuan')
            ca_id = ct.get('CaID')
            
            if ngay_trong_tuan is not None and ca_id: 
                records_to_create.append(LichlamviecCodinh(
                    lichlamviec=lich,
                    ngaytrongtuan=ngay_trong_tuan,
                    calamviec_id=ca_id,
                    created_at=now
                ))
        
        if records_to_create: 
            LichlamviecCodinh.objects.bulk_create(records_to_create)


    @staticmethod
    def _save_lich_trinh_details_only(lich, data):
        """
        ✅ NEW:  Chỉ lưu chu kỳ và chi tiết, KHÔNG lưu caidatca
        """
        now = timezone.now()
        danh_sach_chu_ky = data.get('DanhSachChuKy', [])
        
        for chu_ky_data in danh_sach_chu_ky:
            chu_ky = LichlamviecLichtrinh.objects.create(
                lichlamviec=lich,
                tenchuky=chu_ky_data.get('TenChuKy'),
                machuky=chu_ky_data.get('MaChuKy', '').strip().upper(),
                songaylap=chu_ky_data.get('SoNgayLap', 1),
                ngaybatdauchuky=None,
                created_at=now
            )
            
            chi_tiet_ngay = chu_ky_data.get('ChiTietNgay', [])
            ct_objs = []
            
            for ct in chi_tiet_ngay:
                ngay_trong_chu_ky = ct.get('NgayTrongChuKy')
                ca_id = ct.get('CaID')
                
                ct_objs.append(CtlichlamviecLichtrinh(
                    lichlamviec_lichtrinh=chu_ky,
                    calamviectungngay=str(ngay_trong_chu_ky),
                    calamviec_id=ca_id if ca_id else None,
                    created_at=now
                ))
            
            if ct_objs:
                CtlichlamviecLichtrinh.objects.bulk_create(ct_objs)

    @staticmethod
    def generate_actual_schedule_for_fixed(lich, start_date=None, end_date=None):
        """
        ✅ TỐI ƯU: Giảm memory footprint, batch insert
        """
        if lich.loaikichbanlamviec != 'CO_DINH':
            return
        
        now = timezone.now().date()
        if start_date is None:
            start_date = now
        if start_date < now:
            start_date = now
        if end_date is None:
            _, last_day = monthrange(start_date.year, start_date.month)
            end_date = date(start_date.year, start_date.month, last_day)

        all_emp_ids = LichLamViecService._get_all_employee_ids_for_schedule(
            lich,
            start_date=start_date,
            end_date=end_date,
        )
        if not all_emp_ids: 
            return
        
        # ✅ TỐI ƯU:  Chỉ lấy fields cần thiết
        day_shifts_map = {}
        days_with_shifts = set()
        codinh_list = lich.lichlamvieccodinh_set.values_list('ngaytrongtuan', 'calamviec_id')
        for ngay, ca_id in codinh_list:
            if ca_id: 
                if ngay not in day_shifts_map:
                    day_shifts_map[ngay] = []
                day_shifts_map[ngay].append(ca_id)
                days_with_shifts.add(ngay)
        
        # ✅ XÓA lịch cũ TRƯỚC khi tạo mới (1 query)
        Lichlamviecthucte.objects.filter(
            lichlamviec=lich,
            nhanvien_id__in=all_emp_ids,
            ngaylamviec__gte=start_date,
            ngaylamviec__lte=end_date,
            chophepghide=False
        ).delete()
        
        # ✅ TỐI ƯU: Batch insert với generator để giảm memory
        BATCH_SIZE = 2000
        records_batch = []
        created_at = timezone.now()
        
        # Tối ưu vòng lặp: Tính trước số ngày
        delta = (end_date - start_date).days + 1

        for i in range(delta):
            current_date = start_date + timedelta(days=i)
            weekday = current_date.weekday()
            
            # Pre-create object mẫu để copy nhanh (micro-optimization)
            base_kwargs = {
                'ngaylamviec': current_date,
                'chophepghide': False,
                'lichlamviec': lich,
                'nguongoc': 'CO_DINH',
                'created_at': created_at
            }

            if weekday in days_with_shifts:
                # Có ca làm việc
                ca_ids = day_shifts_map[weekday]
                # Sử dụng itertools.product để flat loop nếu cần, nhưng ở đây logic đơn giản
                for emp_id in all_emp_ids:
                    for ca_id in ca_ids:
                        records_batch.append(Lichlamviecthucte(
                            calamviec_id=ca_id,
                            cophaingaynghi=False,
                            nhanvien_id=emp_id,
                            **base_kwargs
                        ))
            else:
                # Ngày nghỉ
                for emp_id in all_emp_ids:
                    records_batch.append(Lichlamviecthucte(
                        calamviec_id=None,
                        cophaingaynghi=True,
                        nhanvien_id=emp_id,
                        **base_kwargs
                    ))
            
            # Check batch size bên ngoài loop nhân viên để giảm số lần check
            if len(records_batch) >= BATCH_SIZE:
                Lichlamviecthucte.objects.bulk_create(records_batch, batch_size=BATCH_SIZE)
                records_batch = [] # Reset list mới nhanh hơn clear()
        
        if records_batch:
            Lichlamviecthucte.objects.bulk_create(records_batch, batch_size=BATCH_SIZE)

    @staticmethod
    def generate_actual_schedule_for_lichtrinh(lich, schedule_data, start_date=None, end_date=None):
        """
        Generate lịch làm việc thực tế cho kịch bản LỊCH TRÌNH
        ✅ FIX:  Thêm trường lichlamviec và nguongoc, chỉ trong tháng
        """
        if lich.loaikichbanlamviec != 'LICH_TRINH': 
            return
        
        now = timezone.now().date()
        if start_date is None:
            start_date = now

        # Không generate cho quá khứ
        if start_date < now: 
            start_date = now
            
        all_emp_ids = LichLamViecService._get_all_employee_ids_for_schedule(
            lich,
            start_date=start_date,
            end_date=end_date,
        )
        if not all_emp_ids:
            return
        
        records_to_create = []
        map_emp_dates_to_clear = defaultdict(list)
        
        for key, shifts in schedule_data.items():
            parts = key.split('_')
            if len(parts) != 4:
                continue
            
            try:
                emp_id = int(parts[0])
                year = int(parts[1])
                month = int(parts[2])
                day = int(parts[3])
            except (ValueError, IndexError):
                continue
            
            if emp_id not in all_emp_ids: 
                continue
            
            try:
                schedule_date = date(year, month, day)
            except ValueError:
                continue
            
            if schedule_date < start_date:
                continue
            
            # Gom lại để xóa sau
            map_emp_dates_to_clear[emp_id].append(schedule_date)

            # Logic tạo object (Giữ nguyên logic nghiệp vụ)
            base_kwargs = {
                'ngaylamviec': schedule_date,
                'chophepghide': False,
                'lichlamviec': lich,
                'nguongoc': 'LICH_TRINH',
                'created_at': timezone.now()
            }

            if shifts and len(shifts) > 0:
                has_valid_shift = False
                for shift in shifts: 
                    ca_id = shift.get('id')
                    if ca_id and ca_id != 0:
                        has_valid_shift = True
                        records_to_create.append(Lichlamviecthucte(
                            nhanvien_id=emp_id,
                            cophaingaynghi=False,
                            calamviec_id=ca_id,
                            **base_kwargs
                        ))
                
                if not has_valid_shift:
                    records_to_create.append(Lichlamviecthucte(
                        nhanvien_id=emp_id,
                        cophaingaynghi=True,
                        calamviec_id=None,
                        **base_kwargs
                    ))
            else:
                records_to_create.append(Lichlamviecthucte(
                    nhanvien_id=emp_id,
                    cophaingaynghi=True,
                    calamviec_id=None,
                    **base_kwargs
                ))
        
        # === TỐI ƯU ĐOẠN XÓA (Fix N+1) ===
        # Thay vì loop và delete từng dòng, ta delete theo từng nhân viên (Giảm từ N*D query xuống N query)
        # Nếu DB hỗ trợ cú pháp tuple IN (Postgres, MySQL mới) thì có thể gom 1 query, nhưng Django ORM chuẩn an toàn nhất là loop emp
        if map_emp_dates_to_clear:
            with transaction.atomic():
                for emp_id, dates in map_emp_dates_to_clear.items():
                    Lichlamviecthucte.objects.filter(
                        lichlamviec=lich,
                        nhanvien_id=emp_id,
                        ngaylamviec__in=dates, # Xóa 1 lần cho nhiều ngày của 1 nhân viên
                        chophepghide=False
                    ).delete()
        
        if records_to_create: 
            Lichlamviecthucte.objects.bulk_create(records_to_create, batch_size=1000)

    @staticmethod
    def _get_all_employee_ids_for_schedule(lich, start_date=None, end_date=None):
        """
        Lấy tất cả ID nhân viên áp dụng cho 1 lịch làm việc
        (Bao gồm cả nhân viên trực tiếp và nhân viên thuộc phòng ban)

        Quy tắc ưu tiên nghiệp vụ:
        - Direct assignment luôn ưu tiên hơn department assignment.
        - Nếu nhân viên có direct assignment ở lịch khác trong cùng kỳ,
          sẽ không lấy từ department assignment của lịch hiện tại.
        """
        start_date, end_date = LichLamViecService._normalize_period_bounds(start_date, end_date)

        direct_assignment_map = LichLamViecService._get_effective_direct_assignment_map(
            start_date=start_date,
            end_date=end_date,
        )

        # Lấy nhân viên trực tiếp
        direct_relations = lich.lichlamviecnhanvien_set.filter(trangthai='active')
        direct_relations = LichLamViecService._apply_relation_effective_filter(
            direct_relations,
            start_date=start_date,
            end_date=end_date,
        )
        direct_emp_ids = set(direct_relations.values_list('nhanvien_id', flat=True))
        direct_emp_ids = {
            emp_id
            for emp_id in direct_emp_ids
            if direct_assignment_map.get(emp_id) == lich.id
        }
        
        # Lấy phòng ban
        dept_relations = lich.lichlamviecphongban_set.filter(trangthai='active')
        dept_relations = LichLamViecService._apply_relation_effective_filter(
            dept_relations,
            start_date=start_date,
            end_date=end_date,
        )
        dept_ids = list(dept_relations.values_list('phongban_id', flat=True))
        
        # Expand phòng ban và lấy nhân viên
        all_dept_ids = LichLamViecService._expand_dept_ids(dept_ids)
        dept_emp_ids = LichLamViecService.get_employees_from_departments(
            all_dept_ids,
            start_date=start_date,
            end_date=end_date,
        )

        direct_assigned_emp_ids = set(direct_assignment_map.keys())
        overridden_count = len(dept_emp_ids.intersection(direct_assigned_emp_ids))
        dept_emp_ids -= direct_assigned_emp_ids
        if overridden_count > 0:
            logger.info(
                "Excluded %s employees from department inheritance for schedule_id=%s due to direct assignments.",
                overridden_count,
                lich.id,
            )
        
        return direct_emp_ids.union(dept_emp_ids)
    
    @staticmethod
    def generate_next_month_schedules():
        """
        ✅ NEW: Cron job - Generate lịch làm việc cho tháng tiếp theo
        CHỈ ÁP DỤNG CHO KỊCH BẢN CỐ ĐỊNH (LỊCH TRÌNH do user tự setup)
        Chạy vào cuối tháng (ví dụ: ngày 25-28)
        """
        
        today = date.today()
        
        # Tính ngày đầu tháng sau
        if today.month == 12:
            next_month_start = date(today.year + 1, 1, 1)
        else: 
            next_month_start = date(today.year, today.month + 1, 1)
        
        # Tính ngày cuối tháng sau
        if next_month_start.month == 12:
            next_month_end = date(next_month_start.year + 1, 1, 1) - timedelta(days=1)
        else: 
            next_month_end = date(next_month_start.year, next_month_start.month + 1, 1) - timedelta(days=1)
        
        # ✅ CHỈ lấy lịch CỐ ĐỊNH đang active
        active_fixed_schedules = Lichlamviec.objects.filter(
            Q(is_deleted=False) | Q(is_deleted__isnull=True),
            trangthai='active',
            loaikichbanlamviec='CO_DINH'
        )
        
        generated_count = 0
        error_count = 0
        
        for lich in active_fixed_schedules: 
            try:
                LichLamViecService.generate_actual_schedule_for_fixed(
                    lich,
                    start_date=next_month_start,
                    end_date=next_month_end
                )
                generated_count += 1
            except Exception as e:
                error_count += 1
                print(f"Error generating schedule for {lich.id}: {str(e)}")
        
        return {
            'success': True,
            'generated':  generated_count,
            'errors': error_count,
            'period': f"{next_month_start} -> {next_month_end}"
        }

    @staticmethod
    def create_lich(data, force_transfer=False, effective_date=None):
        dept_ids = data.get('ApDung_PhongBan', [])
        direct_emp_ids = data.get('ApDung_NhanVien', [])
        
        if data.get('LoaiKichBan') == 'CO_DINH':
            is_valid, msg = validate_schedule_time_overlap(data.get('ChiTietCa', []))
            if not is_valid: 
                raise ValueError(msg)
        
        all_dept_ids = LichLamViecService._expand_dept_ids(dept_ids)
        all_emp_ids = LichLamViecService.resolve_all_employees(all_dept_ids, direct_emp_ids)

        # Xác định ngày áp dụng
        if effective_date is None:
            effective_date = date.today()
        
        if not force_transfer:  
            dept_conflicts = LichLamViecService.check_department_conflicts(
                all_dept_ids,
                effective_date=effective_date,
            )
            emp_conflicts = LichLamViecService.check_employee_conflicts(
                all_emp_ids,
                effective_date=effective_date,
            )
            
            if dept_conflicts or emp_conflicts: 
                raise ConflictException(dept_conflicts + emp_conflicts)

        with transaction.atomic():
            # ✅ FIX: Chuẩn bị caidatca TRƯỚC khi tạo
            caidatca_value = None
            if data.get('LoaiKichBan') == 'CO_DINH':
                master_shifts = data.get('MasterShifts', [])
                if master_shifts:
                    caidatca_value = json.dumps(master_shifts, ensure_ascii=False)
            elif data.get('LoaiKichBan') == 'LICH_TRINH':
                danh_sach_ca = data.get('DanhSachCaApDung', [])
                if danh_sach_ca: 
                    normalized = []
                    for ca in danh_sach_ca: 
                        if isinstance(ca, dict) and ca.get('id'):
                            normalized.append({
                                'id':  ca.get('id'),
                                'TenCa':  ca.get('TenCa', ''),
                                'KhungGio': ca.get('KhungGio', [])
                            })
                    if normalized:
                        caidatca_value = json.dumps(normalized, ensure_ascii=False)
            
            lich = Lichlamviec.objects.create(
                tenlichlamviec=data.get('TenNhom'),
                malichlamviec=data.get('MaNhom', '').strip().upper(),
                loaikichbanlamviec=data.get('LoaiKichBan'),
                caidatca=caidatca_value,  # ✅ Lưu JSON string ngay khi tạo
                trangthai='active',
                created_at=timezone.now()
            )

            # ✅ Lưu chi tiết (KHÔNG lưu caidatca)
            if lich.loaikichbanlamviec == 'CO_DINH':
                LichLamViecService._save_fixed_schedule_details_only(lich, data)
            elif lich.loaikichbanlamviec == 'LICH_TRINH':
                LichLamViecService._save_lich_trinh_details_only(lich, data)

            transferred = LichLamViecService._bulk_process_assignments(lich, all_dept_ids, all_emp_ids, effective_date)
            
            if lich.loaikichbanlamviec == 'CO_DINH': 
                LichLamViecService.generate_actual_schedule_for_fixed(lich, start_date=effective_date)
            elif lich.loaikichbanlamviec == 'LICH_TRINH':
                schedule_data = data.get('ScheduleData', {})
                if schedule_data:  
                    LichLamViecService.generate_actual_schedule_for_lichtrinh(lich, schedule_data, start_date=effective_date)
                    
            return lich, transferred

    @staticmethod
    def update_lich(lich, data, force_transfer=False, effective_date=None):
        dept_ids = data.get('ApDung_PhongBan', [])
        direct_emp_ids = data.get('ApDung_NhanVien', [])
        
        if data.get('LoaiKichBan') == 'CO_DINH':
            is_valid, msg = validate_schedule_time_overlap(data.get('ChiTietCa', []))
            if not is_valid:  
                raise ValueError(msg)
            
        # ✅ BỔ SUNG #8: Chặn đổi loại kịch bản nếu có dữ liệu lịch thực tế quá khứ
        new_loai = data.get('LoaiKichBan')
        if new_loai and new_loai != lich.loaikichbanlamviec:
            has_past_data = Lichlamviecthucte.objects.filter(
                lichlamviec=lich,
                ngaylamviec__lt=date.today(),
                is_deleted=False
            ).exists()
            if has_past_data:
                raise ValueError(
                    "Không thể thay đổi loại kịch bản vì lịch làm việc đã có dữ liệu thực tế trong quá khứ. "
                    "Vui lòng tạo lịch làm việc mới."
                )
            
        all_dept_ids = LichLamViecService._expand_dept_ids(dept_ids)
        all_emp_ids = LichLamViecService.resolve_all_employees(all_dept_ids, direct_emp_ids)

        # Xác định ngày áp dụng
        if effective_date is None:
            effective_date = date.today()
        
        if not force_transfer: 
            dept_conflicts = LichLamViecService.check_department_conflicts(
                all_dept_ids,
                exclude_schedule_id=lich.id,
                effective_date=effective_date,
            )
            emp_conflicts = LichLamViecService.check_employee_conflicts(
                all_emp_ids,
                exclude_schedule_id=lich.id,
                effective_date=effective_date,
            )
            
            if dept_conflicts or emp_conflicts:  
                raise ConflictException(dept_conflicts + emp_conflicts)

        with transaction.atomic():
            # ✅ FIX:  Chuẩn bị caidatca TRƯỚC khi save
            caidatca_value = None
            if data.get('LoaiKichBan') == 'CO_DINH':
                master_shifts = data.get('MasterShifts', [])
                if master_shifts:
                    caidatca_value = json.dumps(master_shifts, ensure_ascii=False)
            elif data.get('LoaiKichBan') == 'LICH_TRINH':
                danh_sach_ca = data.get('DanhSachCaApDung', [])
                if danh_sach_ca: 
                    # ✅ Chuẩn hóa data trước khi dumps
                    normalized = []
                    for ca in danh_sach_ca: 
                        if isinstance(ca, dict) and ca.get('id'):
                            normalized.append({
                                'id': ca.get('id'),
                                'TenCa': ca.get('TenCa', ''),
                                'KhungGio': ca.get('KhungGio', [])
                            })
                    if normalized:
                        caidatca_value = json.dumps(normalized, ensure_ascii=False)
            
            # ✅ Update tất cả fields cùng lúc
            lich.tenlichlamviec = data.get('TenNhom')
            lich.malichlamviec = data.get('MaNhom', '').strip().upper()
            lich.loaikichbanlamviec = data.get('LoaiKichBan')
            lich.caidatca = caidatca_value  # ✅ Gán JSON string
            lich.updated_at = timezone.now()
            lich.save()  # ✅ Save 1 lần duy nhất

            # Xóa dữ liệu cũ
            lich.lichlamvieccodinh_set.all().delete()
            
            for lt in lich.lichlamvieclichtrinh_set.all():
                lt.ctlichlamvieclichtrinh_set.all().delete()
            lich.lichlamvieclichtrinh_set.all().delete()

            # ✅ Lưu chi tiết (KHÔNG lưu caidatca trong các hàm này nữa)
            if lich.loaikichbanlamviec == 'CO_DINH': 
                LichLamViecService._save_fixed_schedule_details_only(lich, data)
            elif lich.loaikichbanlamviec == 'LICH_TRINH':
                LichLamViecService._save_lich_trinh_details_only(lich, data)
                    
            transferred = LichLamViecService._bulk_process_assignments(lich, all_dept_ids, all_emp_ids, effective_date)
            
            if lich.loaikichbanlamviec == 'CO_DINH':  
                LichLamViecService.generate_actual_schedule_for_fixed(lich, start_date=effective_date)
            elif lich.loaikichbanlamviec == 'LICH_TRINH':
                schedule_data = data.get('ScheduleData', {})
                if schedule_data: 
                    LichLamViecService.generate_actual_schedule_for_lichtrinh(lich, schedule_data, start_date=effective_date)
            
            return lich, transferred

    @staticmethod
    def delete_lich(lich_instance):
        """
        Xóa Lịch làm việc
        ✅ FIX: Thêm xóa dữ liệu Lịch làm việc thực tế
        """
        if lich_instance.malichlamviec == 'NHOM_MAC_DINH':
            return False, "Không thể xóa nhóm lịch làm việc mặc định."
        
        has_emp = LichlamviecNhanvien.objects.filter(
            lichlamviec=lich_instance,
            trangthai='active'
        ).exists()
        
        has_dept = LichlamviecPhongban.objects.filter(
            lichlamviec=lich_instance,
            trangthai='active'
        ).exists()

        if has_emp or has_dept:
            return False, "Vẫn còn nhân viên/phòng ban thuộc lịch làm việc này.Vui lòng chuyển nhân viên sang lịch khác trước khi xóa."
        
        try:
            with transaction.atomic():
                now = timezone.now()
                today = now.date()
                # 1.Xử lý Lịch làm việc thực tế (Lichlamviecthucte)
                # CHỈ XÓA/SOFT DELETE CÁC NGÀY TƯƠNG LAI.Giữ lại quá khứ để tính lương.
                Lichlamviecthucte.objects.filter(
                    lichlamviec=lich_instance,
                ).update(
                    is_deleted=True,
                    updated_at=now
                )
                
                # Xóa chi tiết Lịch trình (nếu có)
                for lt in lich_instance.lichlamvieclichtrinh_set.all():
                    lt.ctlichlamvieclichtrinh_set.all().delete()
                lich_instance.lichlamvieclichtrinh_set.all().delete()
                
                # Xóa chi tiết Cố định
                lich_instance.lichlamvieccodinh_set.all().delete()
                
                # Xóa quan hệ Phòng ban/Nhân viên
                # 2.Ngắt quan hệ Phòng ban/Nhân viên (Set inactive)
                lich_instance.lichlamviecphongban_set.filter(trangthai='active').update(
                    trangthai='inactive',
                    ngayketthuc=now,
                    updated_at=now
                )
                lich_instance.lichlamviecnhanvien_set.filter(trangthai='active').update(
                    trangthai='inactive',
                    ngayketthuc=now,
                    updated_at=now
                )
                
                # Xóa Lịch làm việc
                lich_instance.trangthai = 'inactive'
                lich_instance.is_deleted = True
                lich_instance.deleted_at = now
                lich_instance.save(update_fields=['is_deleted', 'deleted_at', 'trangthai'])
                
            return True, "Xóa thành công."
        except Exception as e:
            return False, f"Lỗi khi xóa:  {str(e)}"
    


