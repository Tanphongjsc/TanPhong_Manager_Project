import json
from simpleeval import SimpleEval

# --- LỚP BAO ĐÓNG (WRAPPER CLASS) ---
class FieldProxy(float):
    """
    Class đặc biệt kế thừa từ float.
    Mục đích: Giúp biến vừa tham gia tính toán như số, vừa lưu giữ tên biến gốc.
    Ví dụ: Khi gặp MAX(so_luong), hệ thống nhận được object FieldProxy(12.0) có tên "so_luong".
    """
    def __new__(cls, name, value):
        return float.__new__(cls, value) # Khởi tạo giá trị float

    def __init__(self, name, value):
        self.original_name = name # Lưu tên biến gốc (VD: 'so_luong')

# --- CLASS TÍNH LƯƠNG ---
class PayrollCalculator:
    def __init__(self, data_groups_map: dict):
        """
        :param data_groups_map: Dict chứa dữ liệu nhóm { 'group_key': [member_1, member_2...] }
        """
        self.data_groups_map = data_groups_map
        self.aggregation_cache = {} # Cache kết quả tính toán nhóm để tối ưu tốc độ
        self.current_group_id = None 
        
        # Cấu hình SimpleEval
        self.simple_eval = SimpleEval()
        self.simple_eval.functions = {
            "IF": lambda condition, true, false: true if condition else false,
            "SUM": self.sum_group_function,
            "COUNT": self.count_group_function,
            "AVG": self.avg_group_function,
            "MIN": self.min_group_function,
            "MAX": self.max_group_function,
            "ABS": abs,
            "ROUND": round,
            "POW": pow
        }

    # --- 1. CÁC HÀM HỖ TRỢ CORE (INTERNAL) ---

    def _extract_field_name(self, field_input):
        """
        Trích xuất tên trường dữ liệu từ đầu vào.
        - Nếu là FieldProxy (do MAX(so_luong) truyền vào) -> Lấy tên gốc.
        - Nếu là string (do MAX('so_luong') truyền vào) -> Giữ nguyên.
        - Các trường hợp khác -> None.
        """
        if isinstance(field_input, FieldProxy):
            return field_input.original_name
        if isinstance(field_input, str):
            return field_input
        return None

    def _get_group_values_list(self, group_id, field_name):
        """
        Lấy danh sách giá trị của 1 trường (field_name) từ tất cả thành viên trong nhóm.
        """
        members = self.data_groups_map.get(group_id, [])
        values = []
        for mem in members:
            params = mem.get('tham_so') or {}
            val = params.get(field_name)
            if isinstance(val, (int, float)): # Chỉ lấy giá trị số
                values.append(val)
        return values

    def _calculate_aggregate(self, group_id, field_input, func_type):
        """
        Hàm xử lý logic chung cho SUM, MAX, MIN, AVG.
        """
        # 1. Xác định tên trường cần tính
        field_name = self._extract_field_name(field_input)
        
        # Fallback: Nếu không tìm thấy tên field (VD người dùng nhập MAX(100)), trả về chính giá trị đó
        if field_name is None:
            return field_input if isinstance(field_input, (int, float)) else 0

        # 2. Kiểm tra Cache
        cache_key = (group_id, field_name, func_type)
        if cache_key in self.aggregation_cache:
            return self.aggregation_cache[cache_key]
        
        # 3. Lấy dữ liệu và tính toán
        values = self._get_group_values_list(group_id, field_name)
        
        if func_type == 'sum':
            result = sum(values)
        elif func_type == 'max':
            result = max(values) if values else 0
        elif func_type == 'min':
            result = min(values) if values else 0
        elif func_type == 'avg':
            total = sum(values)
            count = len(self.data_groups_map.get(group_id, []))
            result = total / count if count > 0 else 0
        else:
            result = 0

        # 4. Lưu cache và trả kết quả
        self.aggregation_cache[cache_key] = result
        return result

    # --- 2. CÁC HÀM MAPPING VÀO SIMPLE EVAL ---

    def _ensure_context(self):
        """Đảm bảo rằng code đang chạy trong ngữ cảnh của 1 nhóm cụ thể"""
        if self.current_group_id is None:
             raise ValueError("Lỗi Context: Chưa xác định Group ID.")

    def sum_group_function(self, field_name):
        """Hàm SUM: Tính tổng giá trị của field trong nhóm"""
        self._ensure_context()
        return self._calculate_aggregate(self.current_group_id, field_name, 'sum')

    def max_group_function(self, field_name):
        """Hàm MAX: Tìm giá trị lớn nhất của field trong nhóm"""
        self._ensure_context()
        return self._calculate_aggregate(self.current_group_id, field_name, 'max')

    def min_group_function(self, field_name):
        """Hàm MIN: Tìm giá trị nhỏ nhất của field trong nhóm"""
        self._ensure_context()
        return self._calculate_aggregate(self.current_group_id, field_name, 'min')

    def avg_group_function(self, field_name):
        """Hàm AVG: Tính trung bình cộng của field trong nhóm"""
        self._ensure_context()
        return self._calculate_aggregate(self.current_group_id, field_name, 'avg')

    def count_group_function(self, *args): 
        """Hàm COUNT: Đếm số thành viên trong nhóm (Không quan tâm field name)"""
        self._ensure_context()
        return len(self.data_groups_map.get(self.current_group_id, []))

    # --- 3. LUỒNG XỬ LÝ CHÍNH (MAIN FLOW) ---

    def calculate_single_item(self, formula_str, params, group_id):
        """
        Tính toán công thức cho 1 cá nhân cụ thể.
        Quan trọng: Chuyển đổi tham số đầu vào thành FieldProxy.
        """
        self.current_group_id = group_id
        
        # Bọc các tham số số học vào FieldProxy
        # Để khi vào công thức, nó vừa tính toán được, vừa giữ được tên biến
        proxy_params = {}
        for k, v in params.items():
            if isinstance(v, (int, float)):
                proxy_params[k] = FieldProxy(name=k, value=v)
            else:
                proxy_params[k] = v
                
        self.simple_eval.names = proxy_params
        
        try:
            return self.simple_eval.eval(formula_str)
        except Exception as e:
            # Ghi log lỗi nếu cần thiết
            return 0 

    def calculate_all(self, field_formula='bieu_thuc', field_params='tham_so', field_id='id'):
        """
        Duyệt qua toàn bộ danh sách và tính lương.
        """
        results = {}
        self.aggregation_cache = {} # Reset cache cho đợt tính mới
        
        for group_id, members in self.data_groups_map.items():
            if not members: continue
            
            # Lấy công thức chung của nhóm (giả định dùng chung)
            group_formula = members[0].get(field_formula, '')
            
            for mem in members:
                params = mem.get(field_params, {})
                # Ưu tiên công thức riêng, nếu không có thì dùng công thức nhóm
                formula = mem.get(field_formula) or group_formula
                
                # Thực hiện tính toán
                thanhtien = self.calculate_single_item(formula, params, group_id)
                
                # Cập nhật kết quả
                mem['thanhtien_calculated'] = thanhtien
                results[mem[field_id]] = results.get(mem[field_id], 0) + thanhtien
                
        return results