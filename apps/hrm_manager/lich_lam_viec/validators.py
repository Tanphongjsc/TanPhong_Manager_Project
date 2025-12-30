"""
File: apps/hrm_manager/cham_cong/validators. py
Mô tả: Validators cho Ca làm việc (HRM Business Logic)
"""
from apps.hrm_manager.utils.view_helpers import parse_time_to_minutes as parse_time
from collections import defaultdict
from apps.hrm_manager.__core__.models import Calamviec


def validate_shift_details(data):
    """
    Validate ChiTietKhungGio: overlap, nghỉ trưa và GIỚI HẠN 48H (2 ngày).
    Logic mới:
    - Tính thời gian tuyệt đối (accumulated minutes) từ khung giờ đầu tiên.
    - Giới hạn tối đa cho phép là 2880 phút (2 ngày).
    """
    khung_gios = data.get('ChiTietKhungGio', [])
    nghi_trua = data.get('NghiTrua')
    loai_ca = data.get('LoaiCa')
    
    if not khung_gios:
        return False, "Phải có ít nhất một khung giờ"
    
    # Biến theo dõi trạng thái ngày (0 = Ngày 1, 1440 = Ngày 2)
    current_day_base = 0 
    previous_end_minute_in_day = -1 
    
    # Giới hạn 48 giờ (2 ngày * 1440 phút)
    MAX_ALLOWED_MINUTES = 2880 

    # Danh sách lưu khoảng thời gian tuyệt đối để check overlap
    # Format: {'start': phút_tuyệt_đối, 'end': phút_tuyệt_đối}
    absolute_intervals = []

    for i, kg in enumerate(khung_gios):
        label = f"Khung giờ {i+1}"
        
        # 1. Validate bắt buộc
        if not kg.get('GioBatDau') or not kg.get('GioKetThuc'):
            return False, f"{label}: Phải nhập đủ giờ bắt đầu và kết thúc"
        
        # Nếu nhiều khung giờ cố định, bắt buộc nhập check-in/out giới hạn
        if loai_ca == 'CO_DINH' and len(khung_gios) > 1:
            if not kg.get('CheckInSomNhat'):
                return False, f"{label}: Bắt buộc nhập 'Thời gian check-in sớm nhất'"
            if not kg.get('CheckOutMuonNhat'):
                return False, f"{label}: Bắt buộc nhập 'Thời gian check-out muộn nhất'"
        
        start = parse_time(kg['GioBatDau'])
        end = parse_time(kg['GioKetThuc'])
        
        if start is None or end is None:
            return False, f"{label}: Giờ không hợp lệ (định dạng HH:MM)"
        
        # 2. Xác định xem khung giờ này có sang ngày mới so với khung trước không
        # Logic: Nếu giờ bắt đầu nhỏ hơn giờ kết thúc của khung liền trước -> Đã sang ngày hôm sau
        if previous_end_minute_in_day != -1 and start < previous_end_minute_in_day:
            current_day_base += 1440

        # Tính phút tuyệt đối
        start_abs = current_day_base + start
        
        # Xử lý trường hợp qua đêm trong nội bộ khung giờ (ví dụ 20:00 - 02:00)
        if end <= start:
            end_abs = current_day_base + 1440 + end # Kết thúc ở ngày tiếp theo
        else:
            end_abs = current_day_base + end

        # 3. [QUAN TRỌNG] Kiểm tra giới hạn 48h
        # Bất kỳ thời điểm nào vượt quá 2880 phút đều không hợp lệ
        if start_abs >= MAX_ALLOWED_MINUTES or end_abs > MAX_ALLOWED_MINUTES:
            return False, f"{label}: Thời gian vượt quá phạm vi 2 ngày (48 giờ) tính từ khung giờ đầu tiên."
        
        # 4. Kiểm tra chồng chéo (Overlap) với các khung giờ trước
        for interval in absolute_intervals:
            # Công thức check overlap: Max(start1, start2) < Min(end1, end2)
            if max(start_abs, interval['start']) < min(end_abs, interval['end']):
                return False, f"{label}: Thời gian bị chồng chéo với khung giờ trước đó"

        # Lưu lại interval hiện tại để so sánh với các khung sau
        absolute_intervals.append({'start': start_abs, 'end': end_abs})
        
        # 5. Cập nhật mốc so sánh cho vòng lặp sau
        # Lưu ý: Lấy end_abs % 1440 để đưa về giờ trong ngày (0-1440)
        previous_end_minute_in_day = end_abs % 1440 

        # --- Validate Logic phụ (Check-in/out sớm muộn) ---
        # Check-in sớm nhất
        early_in_abs = None
        if kg.get('CheckInSomNhat'):
            early_in = parse_time(kg['CheckInSomNhat'])
            if early_in is None: return False, f"{label}: Check-in sớm nhất không hợp lệ"
            
            # Tính early_in tuyệt đối
            early_in_abs = current_day_base + early_in
            # Nếu early_in > start (vd: start 08:00, early 07:00 -> ok. start 08:00, early 23:00 -> hôm trước)
            # Logic heurictic: nếu check-in > start + 12h -> coi là hôm trước
            if early_in > start and (early_in - start) > 720: 
                 early_in_abs -= 1440 # Lùi về ngày hôm trước
            elif early_in > start:
                 # Trường hợp nhập sai (check in sau start) -> Sẽ bị chặn ở validate range bên dưới
                 pass
            elif early_in < start and (start - early_in) > 720:
                 # Trường hợp start hôm sau, check in hôm trước (rất xa) -> có thể là cùng ngày
                 pass 

        # Check-out muộn nhất
        late_out_abs = None
        if kg.get('CheckOutMuonNhat'):
            late_out = parse_time(kg['CheckOutMuonNhat'])
            if late_out is None: return False, f"{label}: Check-out muộn nhất không hợp lệ"

            temp_end_time = end_abs % 1440
            gap = 0
            if late_out < temp_end_time:
                gap = (late_out + 1440) - temp_end_time
            else:
                gap = late_out - temp_end_time
            
            if gap > 720: # Chênh lệch quá 12h
                 return False, f"{label}: Check-out muộn nhất chênh lệch quá lớn (>12h)"

            # Tính late_out tuyệt đối dựa trên end_abs
            # Cơ bản là cùng ngày với end, hoặc sang ngày hôm sau
            base_end_day = (end_abs // 1440) * 1440
            late_out_abs = base_end_day + late_out
            if late_out < temp_end_time: # Qua đêm
                late_out_abs += 1440
        
        # Validate ranges logic
        if early_in_abs is not None and early_in_abs >= start_abs:
            return False, f"{label}: Thời gian check-in sớm nhất phải nhỏ hơn Giờ bắt đầu"
        if late_out_abs is not None and late_out_abs <= end_abs:
             return False, f"{label}: Thời gian check-out muộn nhất phải lớn hơn Giờ kết thúc"
             
        # Validate Grace Period
        den_muon_cp = int(kg.get('DenMuonCP', 0) or 0)
        khong_tinh_cong_muon = int(kg.get('KhongTinhCongNeuMuonHon', 0) or 0)
        if khong_tinh_cong_muon > 0 and den_muon_cp >= khong_tinh_cong_muon:
             return False, f"{label}: Thời gian cho phép đến muộn phải nhỏ hơn Thời gian không tính công"

        ve_som_cp = int(kg.get('VeSomCP', 0) or 0)
        khong_tinh_cong_som = int(kg.get('KhongTinhCongNeuSomHon', 0) or 0)
        if khong_tinh_cong_som > 0 and ve_som_cp >= khong_tinh_cong_som:
             return False, f"{label}: Thời gian cho phép về sớm phải nhỏ hơn Thời gian không tính công"

    # 6. Validate Nghỉ trưa (Nếu có)
    if nghi_trua:
        break_start = parse_time(nghi_trua.get('BatDau'))
        break_end = parse_time(nghi_trua.get('KetThuc'))
        
        if break_start is None or break_end is None:
            return False, "Giờ nghỉ trưa không hợp lệ"
        
        # Lấy thông tin khung giờ đầu tiên (thường nghỉ trưa áp dụng cho khung 1 hoặc ca hành chính)
        kg1 = khung_gios[0]
        ws = parse_time(kg1['GioBatDau'])
        we = parse_time(kg1['GioKetThuc'])
        
        # Chuẩn hóa về phút trong ngày để so sánh
        if we <= ws: we += 1440
        
        bs = break_start
        be = break_end
        if be <= bs: be += 1440
        
        # Nếu nghỉ trưa < giờ bắt đầu -> có thể là qua đêm hoặc nhập sai
        # Logic đơn giản: Nghỉ trưa phải nằm trọn trong giờ làm việc
        if bs < ws: 
            bs += 1440
            be += 1440
            
        if bs < ws or be > we:
            return False, "Thời gian nghỉ trưa phải nằm trong khoảng thời gian làm việc của ca"
        if be <= bs:
            return False, "Giờ kết thúc nghỉ trưa phải lớn hơn giờ bắt đầu"

    return True, None

def validate_schedule_time_overlap(chi_tiet_ca):
    """
    ✅ Check overlap theo timeline tuần (cross-day), xử lý ca qua đêm.
    """
    if not chi_tiet_ca:
        return True, None

    DAY_NAMES = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']

    day_ca_map = defaultdict(list)
    for item in chi_tiet_ca:
        day = item.get('NgayTrongTuan')
        ca_id = item.get('CaID')
        if day is not None and ca_id:
            day_ca_map[day].append(ca_id)

    all_ca_ids = set()
    for ca_ids in day_ca_map.values():
        all_ca_ids.update(ca_ids)
    if not all_ca_ids:
        return True, None

    cas = Calamviec.objects.filter(id__in=all_ca_ids).prefetch_related('khunggiolamviec_set')

    ca_intervals_cache = {}
    for ca in cas:
        intervals = []
        
        # --- LOGIC MỚI: Theo dõi offset ngày trong chuỗi khung giờ ---
        current_day_offset = 0 # 0=Ngày 1, 1440=Ngày 2
        previous_end_minute = -1
        
        for kg in ca.khunggiolamviec_set.order_by('id'):
            start_str = kg.thoigianbatdau.strftime('%H:%M') if kg.thoigianbatdau else None
            end_str = kg.thoigianketthuc.strftime('%H:%M') if kg.thoigianketthuc else None
            
            start = parse_time(start_str)
            end = parse_time(end_str)
            
            if start is None or end is None:
                continue

            # 1. Logic nhảy ngày: Nếu Start < End của khung trước -> Sang ngày hôm sau
            if previous_end_minute != -1 and start < previous_end_minute:
                current_day_offset += 1440

            # 2. Tính thời gian tuyệt đối
            abs_start = current_day_offset + start
            abs_end = current_day_offset + end

            # 3. Xử lý qua đêm nội bộ (VD: 22:00 -> 02:00)
            if end <= start:
                abs_end += 1440

            intervals.append({
                'start': abs_start,
                'end': abs_end,
                'ca_name': ca.tencalamviec,
                'raw_text': f"{start_str} - {end_str}"
            })
            
            # 4. Cập nhật mốc so sánh (lấy phần dư để về giờ trong ngày 0-1440)
            previous_end_minute = abs_end % 1440
            
        ca_intervals_cache[ca.id] = intervals

    # build week timeline
    all_week = []
    for day, ca_ids in day_ca_map.items():
        day_offset = int(day) * 1440
        for ca_id in ca_ids:
            for it in ca_intervals_cache.get(ca_id, []):
                all_week.append({
                    'start': day_offset + it['start'],
                    'end': day_offset + it['end'],
                    'day': day,
                    'ca_name': it['ca_name'],
                    'raw_text': it['raw_text']
                })

    if len(all_week) < 2:
        return True, None

    all_week.sort(key=lambda x: x['start'])
    for i in range(len(all_week) - 1):
        cur = all_week[i]
        nxt = all_week[i + 1]
        if cur['end'] > nxt['start']:
            d1 = DAY_NAMES[cur['day']] if 0 <= cur['day'] < len(DAY_NAMES) else f"Ngày {cur['day']}"
            d2 = DAY_NAMES[nxt['day']] if 0 <= nxt['day'] < len(DAY_NAMES) else f"Ngày {nxt['day']}"
            return False, (
                f"Xung đột thời gian giữa {d1} và {d2}: "
                f"'{cur['ca_name']}' ({cur['raw_text']}) trùng với "
                f"'{nxt['ca_name']}' ({nxt['raw_text']})"
            )

    return True, None