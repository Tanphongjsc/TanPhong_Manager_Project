
# Sử dụng thư viện simpleeval để đánh giá biểu thức toán học và logic một cách an toàn, tránh thực thi code nguy hiểm.
from simpleeval import SimpleEval

# --- LỚP BAO ĐÓNG GIÁ TRỊ TRƯỜNG (WRAPPER CLASS) ---
# FieldProxy dùng để gắn thêm tên trường gốc cho giá trị số, giúp truy vết nguồn gốc khi tính toán phức tạp hoặc tổng hợp.
# Kế thừa float để có thể sử dụng như số thực bình thường trong các phép toán.
class FieldProxy(float):
    def __new__(cls, name, value):
        # Nếu value là None thì trả về None (giúp propagate giá trị None trong các phép toán/phụ thuộc)
        if value is None:
            return None
        return float.__new__(cls, value)
    def __init__(self, name, value):
        # Lưu tên trường gốc để phục vụ truy vết khi cần thiết
        self.original_name = name

# --- LỚP ÁNH XẠ LƯỜI (LAZY MAPPING CLASS) ---
# Cho phép truy xuất giá trị trường theo tên, tự động tính toán nếu là công thức (string),
# hỗ trợ cache giá trị đã tính và chống vòng lặp đệ quy khi các trường tham chiếu lẫn nhau.
# Điều này giúp việc tính toán các trường phụ thuộc lẫn nhau trở nên đơn giản và an toàn.
class LazyProxyMap(dict):
    def __init__(self, calculator, params, group_id):
        self.calculator = calculator  # Đối tượng PayrollCalculator quản lý logic tính toán
        self.params = params          # Tham số đầu vào của từng nhân sự (dict)
        self.group_id = group_id      # ID nhóm (dùng cho các phép tổng hợp)
        self.resolved = {}           # Cache giá trị đã tính xong cho từng key
        self.calculating = set()     # Đánh dấu các trường đang tính (chống vòng lặp đệ quy vô hạn)
        super().__init__(params)

    def __getitem__(self, key):
        # Nếu đã tính rồi thì trả về luôn (giảm lặp lại tính toán)
        if key in self.resolved:
            return self.resolved[key]

        # Lấy giá trị thô từ params (có thể là số, chuỗi công thức, hoặc kiểu khác)
        try:
            raw_val = super().__getitem__(key)
        except KeyError:
            # Nếu không tìm thấy biến, trả về None (giúp propagate None trong các phép toán/phụ thuộc)
            return None

        # Nếu trường này đang được tính ở call stack hiện tại, trả về None để tránh vòng lặp đệ quy
        if key in self.calculating:
            return None

        # Nếu là số (int, float), trả về FieldProxy để giữ tên trường gốc
        if isinstance(raw_val, (int, float)):
            proxy = FieldProxy(key, raw_val)
            self.resolved[key] = proxy
            return proxy

        # Nếu là string (công thức), tính toán đệ quy qua PayrollCalculator
        if isinstance(raw_val, str):
            self.calculating.add(key)
            try:
                res = self.calculator._internal_eval(raw_val, self)
                # Nếu kết quả là None (do công thức con bị None), giữ nguyên None
                if res is None:
                    self.resolved[key] = None
                    return None
                proxy = FieldProxy(key, res)
                self.resolved[key] = proxy
                return proxy
            except Exception:
                # Nếu có lỗi khi tính công thức, trả về None
                self.resolved[key] = None
                return None
            finally:
                self.calculating.remove(key)

        # Nếu là kiểu khác (list, dict, ...), trả về luôn
        self.resolved[key] = raw_val
        return raw_val


 
# --- LỚP TÍNH LƯƠNG TỔNG HỢP (PAYROLL CALCULATOR) ---
# Quản lý dữ liệu nhóm nhân sự, đánh giá công thức động, tổng hợp số liệu, và tính toán hàng loạt cho từng thành viên.
# Hỗ trợ các hàm tổng hợp như SUM, AVG, COUNT, MIN, MAX dùng trực tiếp trong công thức lương.
class PayrollCalculator:
    def __init__(self, data_groups_map: dict):
        # data_groups_map: dict[group_id, list[dict]]
        #   - group_id: mã nhóm (ví dụ: phòng ban, tổ, ...)
        #   - mỗi dict trong list là một nhân sự, có thể chứa 'tham_so', 'bieu_thuc', ...
        self.data_groups_map = data_groups_map if data_groups_map else {}
        self.aggregation_cache = {}    # Cache kết quả tổng hợp (giảm lặp lại phép tổng hợp)
        self.current_group_id = None   # ID nhóm hiện tại khi tính toán (dùng cho các hàm tổng hợp)

        # Cấu hình SimpleEval với các hàm hỗ trợ trong công thức lương động
        self.simple_eval = SimpleEval()
        self.simple_eval.functions = {
            "IF": lambda condition, true, false: true if condition else false,
            "SUM": self.sum_group_function,
            "COUNT": self.count_group_function,
            "AVG": self.avg_group_function,
            "MIN": self.min_group_function,
            "MAX": self.max_group_function,
            # Các hàm toán học cơ bản
            "ABS": abs, "ROUND": round, "POW": pow, "int": int, "float": float
        }

    # --- HÀM HỖ TRỢ TỔNG HỢP ---
    def _extract_field_name(self, field_input):
        # Lấy tên trường từ FieldProxy (giá trị đã được wrap) hoặc từ string
        # Trả về None nếu không hợp lệ (giúp kiểm soát lỗi khi tổng hợp)
        if isinstance(field_input, FieldProxy):
            return field_input.original_name
        if isinstance(field_input, str):
            return field_input
        return None

    def _get_group_values_list(self, group_id, field_name):
        # Lấy danh sách giá trị số của một trường trong cả nhóm (dùng cho tổng hợp)
        # Chỉ lấy các giá trị đã có sẵn trong params, không tính công thức phụ thuộc để tránh vòng lặp phức tạp
        members = self.data_groups_map.get(group_id, [])
        values = []
        for mem in members:
            params = mem.get('tham_so') or {}
            val = params.get(field_name)
            if isinstance(val, (int, float)):
                values.append(val)
        return values

    def _calculate_aggregate(self, group_id, field_input, func_type):
        # Tổng hợp (sum, max, min, avg) cho một trường trong nhóm
        # Nếu field_input là FieldProxy thì lấy tên trường gốc, nếu là số thì trả về luôn
        field_name = self._extract_field_name(field_input)
        if field_name is None:
            # Nếu không xác định được tên trường, chỉ trả về giá trị nếu là số, ngược lại trả về 0
            return field_input if isinstance(field_input, (int, float)) else 0

        # Sử dụng cache để tránh tính lại cùng một phép tổng hợp nhiều lần
        cache_key = (group_id, field_name, func_type)
        if cache_key in self.aggregation_cache:
            return self.aggregation_cache[cache_key]

        values = self._get_group_values_list(group_id, field_name)

        # Thực hiện phép tổng hợp tương ứng
        if func_type == 'sum':
            result = sum(values)
        elif func_type == 'max':
            result = max(values) if values else 0
        elif func_type == 'min':
            result = min(values) if values else 0
        elif func_type == 'avg':
            result = sum(values) / len(values) if values else 0
        else:
            result = 0

        self.aggregation_cache[cache_key] = result
        return result

    def _ensure_context(self):
        # Đảm bảo đã thiết lập group_id khi gọi hàm tổng hợp (bắt buộc khi dùng các hàm SUM, AVG, ...)
        if self.current_group_id is None:
            raise ValueError("Context Error: group_id chưa được thiết lập khi gọi hàm tổng hợp")

    # Các hàm tổng hợp cho SimpleEval (dùng trong công thức lương động)
    def sum_group_function(self, field_name):
        self._ensure_context()
        return self._calculate_aggregate(self.current_group_id, field_name, 'sum')

    def max_group_function(self, field_name):
        self._ensure_context()
        return self._calculate_aggregate(self.current_group_id, field_name, 'max')

    def min_group_function(self, field_name):
        self._ensure_context()
        return self._calculate_aggregate(self.current_group_id, field_name, 'min')

    def avg_group_function(self, field_name):
        self._ensure_context()
        return self._calculate_aggregate(self.current_group_id, field_name, 'avg')

    def count_group_function(self, *args):
        self._ensure_context()
        # Đếm số thành viên trong nhóm hiện tại
        return len(self.data_groups_map.get(self.current_group_id, []))

    # --- MÁY TÍNH LÕI ---
    def _internal_eval(self, expr, lazy_names):
        """
        Đánh giá một biểu thức công thức với context là lazy_names (LazyProxyMap).
        Dùng cho cả LazyProxyMap và các hàm tính toán động.
        Nếu có lỗi hoặc biến phụ thuộc bị None, trả về None.
        """
        evaluator = SimpleEval(functions=self.simple_eval.functions)
        evaluator.names = lazy_names
        return evaluator.eval(expr)

    def _core_evaluate(self, formula_str, params, group_id):
        """
        Hàm lõi: Tạo LazyProxyMap và tính toán một công thức bất kỳ cho một nhân sự.
        Tự động thiết lập context group_id cho các hàm tổng hợp.
        Nếu có lỗi hoặc biến phụ thuộc bị None, trả về None.
        """
        old_group_id = self.current_group_id
        self.current_group_id = group_id
        try:
            # Luôn tạo LazyProxyMap để tự động giải quyết phụ thuộc giữa các trường
            lazy_map = LazyProxyMap(self, params, group_id)
            return self._internal_eval(formula_str, lazy_map)
        except Exception:
            return None
        finally:
            self.current_group_id = old_group_id

    # --- PHƯƠNG THỨC PUBLIC (API) ---

    def calculate_single_item(self, formula_str, params, group_id):
        """
        Tính một công thức cho một nhân sự, tự động giải quyết các biến phụ thuộc (có thể lồng nhau/phức tạp).
        Trả về None nếu có lỗi hoặc biến phụ thuộc bị None.
        """
        return self._core_evaluate(formula_str, params, group_id)

    def calculate_batch_fields(self, field_keys, params, group_id):
        """
        Tính hàng loạt các trường (field_keys) cho một nhân sự.
        Trả về dict {field: value}, value có thể là float hoặc None nếu lỗi hoặc phụ thuộc bị None.
        """
        old_group_id = self.current_group_id
        self.current_group_id = group_id
        results = {}
        try:
            lazy_map = LazyProxyMap(self, params, group_id)
            for key in field_keys:
                try:
                    val = lazy_map[key]
                    if isinstance(val, FieldProxy):
                        results[key] = float(val)
                    elif val is None:
                        results[key] = None
                    else:
                        results[key] = val
                except Exception:
                    # Nếu lỗi khi tính trường này, trả về None
                    results[key] = None
        finally:
            self.current_group_id = old_group_id
        return results

    def calculate_all(self, field_formula='bieu_thuc', field_params='tham_so', field_id='id'):
        """
        Tính toàn bộ các thành viên trong tất cả các nhóm.
        - Lưu kết quả vào từng member (mem['thanhtien_calculated'])
        - Trả về dict tổng hợp {id: tổng_thanhtien}
        Nếu member không có công thức riêng thì dùng công thức mặc định của nhóm.
        """
        results = {}
        self.aggregation_cache = {}  # Reset cache tổng hợp mỗi lần tính mới

        for group_id, members in self.data_groups_map.items():
            if not members:
                continue

            # Lấy công thức mặc định của nhóm (nếu member không có riêng)
            group_formula = members[0].get(field_formula, '')

            for mem in members:
                params = mem.get(field_params, {})
                formula = mem.get(field_formula) or group_formula

                # Tính toán giá trị thành tiền cho từng member
                thanhtien = self._core_evaluate(formula, params, group_id)
                mem['thanhtien_calculated'] = thanhtien
                key_val = mem.get(field_id)
                if key_val:
                    # Nếu một id xuất hiện nhiều lần, cộng dồn kết quả
                    results[key_val] = results.get(key_val, 0) + (thanhtien if thanhtien is not None else 0)

        return results