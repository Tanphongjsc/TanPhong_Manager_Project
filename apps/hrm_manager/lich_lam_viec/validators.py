"""
File: apps/hrm_manager/cham_cong/validators. py
Mô tả: Validators cho Ca làm việc (HRM Business Logic)
"""
from apps.hrm_manager.utils.view_helpers import parse_time_to_minutes as parse_time


def validate_shift_details(data):
    """
    Validate ChiTietKhungGio: overlap, nghỉ trưa trong giờ làm. 
    
    Args:
        data: Dict payload từ request (TenCa, MaCa, ChiTietKhungGio, NghiTrua...)
    
    Returns:
        tuple: (is_valid: bool, error_message: str hoặc None)
    """
    khung_gios = data.get('ChiTietKhungGio', [])
    nghi_trua = data.get('NghiTrua')
    loai_ca = data.get('LoaiCa')
    
    if not khung_gios:
        return False, "Phải có ít nhất một khung giờ"
    
    previous_slot_latest_out_abs = -1
    current_day_offset = 0
    
    for i, kg in enumerate(khung_gios):
        label = f"Khung giờ {i+1}" if len(khung_gios) > 1 else "Khung giờ"
        
        # Required fields
        if not kg.get('GioBatDau') or not kg.get('GioKetThuc'):
            return False, f"{label}: Phải nhập đủ giờ bắt đầu và kết thúc"
        
        # Nếu nhiều khung giờ cố định, bắt buộc check-in/out sớm/muộn nhất
        if loai_ca == 'CO_DINH' and len(khung_gios) > 1:
            if not kg.get('CheckInSomNhat'):
                return False, f"{label}: Bắt buộc nhập 'Thời gian check-in sớm nhất'"
            if not kg.get('CheckOutMuonNhat'):
                return False, f"{label}: Bắt buộc nhập 'Thời gian check-out muộn nhất'"
        
        start = parse_time(kg['GioBatDau'])
        end = parse_time(kg['GioKetThuc'])
        if start is None or end is None:
            return False, f"{label}: Giờ không hợp lệ (định dạng HH:MM)"
        
        # Tính absolute minutes (xử lý qua đêm)
        start_abs = start + (current_day_offset * 1440)
        
        # Nếu giờ bắt đầu nhỏ hơn giờ kết thúc của slot trước -> Đã sang ngày hôm sau
        if previous_slot_latest_out_abs != -1 and start < (previous_slot_latest_out_abs % 1440):
            current_day_offset += 1
            start_abs = start + (current_day_offset * 1440)
        
        end_abs = end + (current_day_offset * 1440)
        if end <= start: # Ca qua đêm
            end_abs += 1440
        
        # Check-in sớm nhất
        early_in_abs = None
        if kg.get('CheckInSomNhat'):
            early_in = parse_time(kg['CheckInSomNhat'])
            if early_in is None:
                return False, f"{label}: Thời gian check-in sớm nhất không hợp lệ"
            early_in_abs = early_in + (current_day_offset * 1440)
            if early_in > start and (start + 1440 - early_in) < (early_in - start):
                early_in_abs -= 1440
        
        # Check-out muộn nhất
        late_out_abs = None
        if kg.get('CheckOutMuonNhat'):
            late_out = parse_time(kg['CheckOutMuonNhat'])
            if late_out is None:
                return False, f"{label}: Thời gian check-out muộn nhất không hợp lệ"
            
            temp_end_time = end_abs % 1440
            gap = 0
            
            if late_out < temp_end_time:
                gap = (late_out + 1440) - temp_end_time
            else:
                gap = late_out - temp_end_time
            
            # Nếu chênh lệch quá 12 tiếng -> Coi là nhập sai thay vì tự động hiểu là hôm sau
            if gap > 720: 
                return False, f"{label}: Check-out muộn nhất chênh lệch quá lớn (>12h) so với giờ kết thúc"

            late_out_abs = late_out + ((end_abs // 1440) * 1440)
            if late_out < temp_end_time:
                late_out_abs += 1440
        
        # Validate ranges
        if early_in_abs is not None and early_in_abs >= start_abs:
            return False, f"{label}: Thời gian check-in sớm nhất phải nhỏ hơn Giờ bắt đầu"
        if late_out_abs is not None and late_out_abs <= end_abs:
            return False, f"{label}: Thời gian check-out muộn nhất phải lớn hơn Giờ kết thúc"
        
        # ✅ Check overlap với khung trước (QUAN TRỌNG - Ngăn chồng chéo)
        if previous_slot_latest_out_abs != -1:
            current_slot_start_point = early_in_abs if early_in_abs is not None else start_abs
            if current_slot_start_point <= previous_slot_latest_out_abs:
                return False, f"{label}: Thời gian bắt đầu bị chồng chéo với khung giờ trước"
        
        # Validate grace/cutoff
        den_muon_cp = kg.get('DenMuonCP', 0)
        khong_tinh_cong_muon = kg.get('KhongTinhCongNeuMuonHon', 0)
        if khong_tinh_cong_muon > 0 and den_muon_cp >= khong_tinh_cong_muon:
            return False, f"{label}: Thời gian cho phép đến muộn phải nhỏ hơn Thời gian không tính công"
        
        ve_som_cp = kg.get('VeSomCP', 0)
        khong_tinh_cong_som = kg.get('KhongTinhCongNeuSomHon', 0)
        if khong_tinh_cong_som > 0 and ve_som_cp >= khong_tinh_cong_som:
            return False, f"{label}: Thời gian cho phép về sớm phải nhỏ hơn Thời gian không tính công"
        
        previous_slot_latest_out_abs = late_out_abs if late_out_abs is not None else end_abs
        current_day_offset = end_abs // 1440
    
    # ✅ Validate nghỉ trưa (QUAN TRỌNG - Phải nằm trong giờ làm)
    if nghi_trua:
        break_start = parse_time(nghi_trua. get('BatDau'))
        break_end = parse_time(nghi_trua.get('KetThuc'))
        if break_start is None or break_end is None:
            return False, "Giờ nghỉ trưa không hợp lệ"
        
        # Nghỉ trưa phải trong khung đầu tiên
        kg = khung_gios[0]
        work_start = parse_time(kg['GioBatDau'])
        work_end = parse_time(kg['GioKetThuc'])
        if work_end <= work_start:
            work_end += 1440
        
        bs = break_start
        be = break_end
        if be <= bs:
            be += 1440
        if bs < work_start:
            bs += 1440
            be += 1440
        
        if bs < work_start or be > work_end:
            return False, "Thời gian nghỉ trưa phải nằm trong khoảng thời gian làm việc của ca"
        if be <= bs:
            return False, "Giờ kết thúc nghỉ trưa phải lớn hơn giờ bắt đầu"
    
    return True, None  # Valid