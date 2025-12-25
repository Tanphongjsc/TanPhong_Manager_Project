import json
from simpleeval import SimpleEval

class PayrollCalculator:
    def __init__(self, data_groups_map: dict):
        """
        :param data_groups_map: Dict { 'group_id': [member_1, member_2, ...] }
        Mỗi member cần có sẵn dict 'tham_so'.
        """
        self.data_groups_map = data_groups_map
        self.aggregation_cache = {} 
        self.current_group_id = None 
        
        # Khởi tạo SimpleEval một lần
        self.simple_eval = SimpleEval()
        self.simple_eval.functions = {
            "IF": lambda condition, true, false: true if condition else false, # Lambda cho gọn
            "SUM": self.sum_group_function,
            "COUNT": self.count_group_function,
            "AVG": self.avg_group_function,
            "MIN": self.min_group_function,
            "MAX": self.max_group_function,
            "ABS": abs,
            "ROUND": round,
            "POW": pow
        }

    # --- CORE LAZY FUNCTIONS ---

    def _get_group_values(self, key_group, field_name):
        """Helper để lấy list các giá trị hợp lệ (số) từ nhóm"""
        members = self.data_groups_map.get(key_group, [])
        values = []
        for mem in members:
            params = mem.get('tham_so') or {} 
            val = params.get(field_name)
            
            # Chỉ lấy giá trị là số thực/nguyên
            if isinstance(val, (int, float)):
                values.append(val)
        return values

    def _get_group_sum_lazy(self, key_group, field_name):
        cache_key = (key_group, field_name, 'sum')
        if cache_key in self.aggregation_cache:
            return self.aggregation_cache[cache_key]
        
        values = self._get_group_values(key_group, field_name)
        total = sum(values)
        
        self.aggregation_cache[cache_key] = total
        return total

    def _get_group_min_lazy(self, key_group, field_name):
        cache_key = (key_group, field_name, 'min')
        if cache_key in self.aggregation_cache:
            return self.aggregation_cache[cache_key]
            
        values = self._get_group_values(key_group, field_name)
        # Handle trường hợp list rỗng (không ai có tham số này)
        min_val = min(values) if values else 0 
        
        self.aggregation_cache[cache_key] = min_val
        return min_val

    def _get_group_max_lazy(self, key_group, field_name):
        cache_key = (key_group, field_name, 'max')
        if cache_key in self.aggregation_cache:
            return self.aggregation_cache[cache_key]
            
        values = self._get_group_values(key_group, field_name)
        max_val = max(values) if values else 0
        
        self.aggregation_cache[cache_key] = max_val
        return max_val

    # --- MAPPING FUNCTIONS ---

    def _check_context(self):
        if self.current_group_id is None:
             raise ValueError("Context Error: Group ID chưa được set trước khi tính toán.")

    def sum_group_function(self, field_name):
        self._check_context()
        return self._get_group_sum_lazy(self.current_group_id, field_name)

    def count_group_function(self, *args): 
        # *args để chấp nhận COUNT() hoặc COUNT('id') đều không lỗi
        self._check_context()
        return len(self.data_groups_map.get(self.current_group_id, []))

    def avg_group_function(self, field_name):
        self._check_context()
        total = self._get_group_sum_lazy(self.current_group_id, field_name)
        count = self.count_group_function()
        return total / count if count > 0 else 0

    def min_group_function(self, field_name):
        self._check_context()
        return self._get_group_min_lazy(self.current_group_id, field_name)

    def max_group_function(self, field_name):
        self._check_context()
        return self._get_group_max_lazy(self.current_group_id, field_name)

    # --- MAIN EXECUTION ---

    def calculate_for_item(self, formula_str, params, group_id):
        """Tính toán cho 1 cá nhân"""
        self.current_group_id = group_id  # SET CONTEXT QUAN TRỌNG
        self.simple_eval.names = params
        try:
            return self.simple_eval.eval(formula_str)
        except Exception as e:
            # Nên dùng logging thay vì print trong production
            # logging.error(f"Error calulating group {group_id}: {e}")
            return 0 

    def calculate_all(self, field_formula='bieu_thuc', field_params='tham_so'):
        """
        Duyệt qua toàn bộ map và tính toán.
        Trả về dict {item_id: result}
        """
        results = {}
        
        # Duyệt qua từng nhóm
        for group_id, members in self.data_groups_map.items():
            if not members: continue
            
            # Giả định: Công thức của cả nhóm giống nhau -> Lấy của người đầu tiên
            # Nếu logic của bạn cho phép mỗi người 1 công thức khác nhau dù chung nhóm,
            # hãy di chuyển dòng này vào trong vòng lặp for mem.
            group_formula = members[0].get(field_formula, '')
            
            for mem in members:
                # Lấy tham số cá nhân
                params = mem.get(field_params, {})
                
                # Logic: Nếu cá nhân có công thức riêng thì dùng, không thì dùng của nhóm
                # Điều này giúp linh hoạt hơn nữa
                formula = mem.get(field_formula) or group_formula
                
                # Tính toán
                thanhtien = self.calculate_for_item(formula, params, group_id)
                
                # Cập nhật kết quả
                mem['thanhtien_calculated'] = thanhtien # Nên dùng field khác để tránh ghi đè dữ liệu gốc nếu không muốn
                results[mem['id']] = thanhtien
                
        return results