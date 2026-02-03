/**
 * FormulaEngine - Bộ máy tính toán công thức Client-side
 * Hỗ trợ:
 * 1. Tính toán phụ thuộc (Dependency Resolution): A = B + 1 (Tự động tính B trước)
 * 2. Hàm tổng hợp (Aggregation): SUM, AVG, MAX, MIN trên toàn bộ dataset
 * 3. Cú pháp Python-like: IF, OR, AND (mô phỏng)
 */
class FormulaEngine {
    constructor(dataset, formulaConfig) {
        // dataset: Mảng chứa toàn bộ dữ liệu (Flat data)
        // formulaConfig: Map { colKey: "formula_string" }
        this.dataset = dataset || [];
        this.formulaConfig = formulaConfig || {};
        
        // Cache kết quả tính toán trong 1 chu kỳ để tránh tính lại
        this.sessionCache = new Map(); 
        // Stack để phát hiện vòng lặp vô hạn (A -> B -> A)
        this.callStack = new Set();
        
        // Map các hàm hỗ trợ (giống Python Backend)
        this.functions = {
            IF: (cond, t, f) => (cond ? t : f),
            int: (v) => parseInt(v) || 0,
            float: (v) => parseFloat(v) || 0,
            ROUND: (v, n) => {
                const m = Math.pow(10, n || 0);
                return Math.round(Number(v) * m) / m;
            },
            ABS: Math.abs,
            MAX: (...args) => Math.max(...args),
            MIN: (...args) => Math.min(...args),
            
            // Hàm tổng hợp cột (Context-aware)
            SUM: (colKey) => this.aggregate(colKey, 'sum'),
            AVG: (colKey) => this.aggregate(colKey, 'avg'),
            COUNT: (colKey) => this.aggregate(colKey, 'count'),
            MAX_COL: (colKey) => this.aggregate(colKey, 'max'),
            MIN_COL: (colKey) => this.aggregate(colKey, 'min'),
        };
    }

    /**
     * Cập nhật lại dataset khi có thay đổi từ UI
     */
    updateData(newDataset) {
        this.dataset = newDataset;
        this.clearCache();
    }

    clearCache() {
        this.sessionCache.clear();
    }

    /**
     * Hàm chính: Lấy giá trị của 1 trường cho 1 dòng cụ thể
     * Tự động quyết định xem nên lấy giá trị có sẵn hay phải tính toán
     */
    getValue(rowId, colKey) {
        const row = this.dataset.find(r => String(r.id) === String(rowId));
        if (!row) return 0;

        // Tạo khóa cache duy nhất: rowId_colKey
        const cacheKey = `${rowId}_${colKey}`;
        if (this.sessionCache.has(cacheKey)) {
            return this.sessionCache.get(cacheKey);
        }

        // Kiểm tra xem cột này có công thức không
        const formula = this.formulaConfig[colKey];
        
        // Nếu KHÔNG có công thức -> Trả về giá trị thô (User nhập hoặc Data có sẵn)
        if (!formula) {
            // Lưu ý: Cần truy cập đúng path object (vd: salary_values.10)
            // Ở đây giả định data đã được flat hoặc có helper truy xuất
            let val = this.extractValue(row, colKey);
            return Number(val) || 0;
        }

        // Nếu CÓ công thức -> Tính toán (Lazy Evaluation)
        // 1. Kiểm tra vòng lặp
        if (this.callStack.has(cacheKey)) {
            console.warn(`Phát hiện vòng lặp vô hạn tại ${colKey} dòng ${rowId}`);
            return 0;
        }

        this.callStack.add(cacheKey);
        
        try {
            const result = this.executeFormula(formula, row);
            this.sessionCache.set(cacheKey, result);
            return result;
        } catch (e) {
            console.error(`Lỗi tính toán ${colKey}:`, e);
            return 0;
        } finally {
            this.callStack.delete(cacheKey);
        }
    }

    /**
     * Thực thi biểu thức công thức
     */
    executeFormula(formulaStr, currentRow) {
        // 1. Phân tích biến: Tìm các từ khóa dạng chữ cái (VD: LUONG_CO_BAN, KPI)
        // Regex này bỏ qua số, chuỗi trong ngoặc kép, và các tên hàm đã đăng ký
        const funcNames = Object.keys(this.functions);
        
        // Tạo context để thay thế biến bằng this.getValue()
        // Kỹ thuật: Sử dụng Function constructor với Proxy hoặc Replace chuỗi
        // Ở đây dùng Replace chuỗi để an toàn và kiểm soát tốt hơn
        
        // Regex tìm biến: Bắt đầu bằng chữ cái, theo sau là chữ hoặc số hoặc gạch dưới
        // Loại bỏ các từ khóa là tên hàm
        const variableRegex = /[a-zA-Z_][a-zA-Z0-9_]*/g;
        
        // Parse formula để thay thế biến thành hàm gọi getValue
        const parsedFormula = formulaStr.replace(variableRegex, (match) => {
            if (funcNames.includes(match)) return `this.functions.${match}`; // Giữ nguyên hàm
            if (match === 'True') return 'true';
            if (match === 'False') return 'false';
            // Biến số -> Gọi đệ quy lấy giá trị
            return `this.getValue('${currentRow.id}', '${match}')`; 
        });

        // 2. Thực thi an toàn
        try {
            // Tạo hàm thực thi với scope là 'this' (instance của FormulaEngine)
            const executor = new Function('return ' + parsedFormula);
            return executor.call(this); 
        } catch (e) {
            console.warn(`Lỗi cú pháp công thức: ${formulaStr}`, e);
            return 0;
        }
    }

    /**
     * Helper: Lấy giá trị từ object row (hỗ trợ nested key nếu cần)
     */
    extractValue(row, key) {
        // Tuỳ cấu trúc data của bạn. 
        // Ví dụ data dạng { salary_values: { "LUONG_CO_BAN": 100 } }
        if (row.salary_values && row.salary_values.hasOwnProperty(key)) {
            return row.salary_values[key];
        }
        return row[key];
    }

    /**
     * Tính toán tổng hợp (Aggregation)
     * Hàm này duyệt qua toàn bộ dataset
     */
    aggregate(colKey, type) {
        const values = this.dataset.map(row => {
            // Lưu ý: Khi aggregate, ta cũng phải gọi getValue để đảm bảo
            // lấy được giá trị mới nhất (kể cả nó là một trường công thức)
            return this.getValue(row.id, colKey);
        });

        const validValues = values.filter(v => typeof v === 'number' && !isNaN(v));
        
        switch (type) {
            case 'sum': return validValues.reduce((a, b) => a + b, 0);
            case 'max': return Math.max(...validValues);
            case 'min': return Math.min(...validValues);
            case 'count': return validValues.length;
            case 'avg': return validValues.length ? (validValues.reduce((a, b) => a + b, 0) / validValues.length) : 0;
            default: return 0;
        }
    }

    /**
     * Tính toán lại toàn bộ 1 dòng và trả về các thay đổi
     * Dùng để update UI
     */
    recalculateRow(rowId) {
        this.clearCache(); // Reset cache phiên làm việc cũ
        const changes = {};
        const row = this.dataset.find(r => String(r.id) === String(rowId));
        
        if (!row) return changes;

        // Duyệt qua tất cả các cột có công thức để tính lại
        Object.keys(this.formulaConfig).forEach(colKey => {
            const newVal = this.getValue(rowId, colKey);
            // So sánh với giá trị cũ trong row để xem có cần update UI không
            const oldVal = this.extractValue(row, colKey);
            
            // Cập nhật vào dataset chính (để các tính toán sau dùng số mới)
            this.updateRowValue(row, colKey, newVal);
            changes[colKey] = newVal;
        });

        return changes;
    }

    updateRowValue(row, colKey, val) {
        if (!row.salary_values) row.salary_values = {};
        row.salary_values[colKey] = val;
    }
}