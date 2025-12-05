"""
File: apps/hrm_manager/cham_cong/services.py
Mô tả: Service Layer cho Ca làm việc (Tách logic CRUD ra khỏi views)
"""

from django.utils import timezone
from django. db import transaction
from django.core.exceptions import ValidationError
from apps.hrm_manager.__core__.models import Calamviec, Khunggiolamviec, Khunggionghitrua
from .validators import validate_shift_details

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