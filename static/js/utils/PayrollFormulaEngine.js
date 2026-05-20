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
        // Tối ưu hoá: Lookup O(1)
        this.datasetMap = new Map();
        this.dataset.forEach(r => this.datasetMap.set(String(r.id), r));
        
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
        
        // Tối ưu hoá: Biên dịch trước tất cả công thức một lần duy nhất
        this.compileFormulas();
    }

    /**
     * Cập nhật lại dataset khi có thay đổi từ UI
     */
    updateData(newDataset) {
        this.dataset = newDataset;
        this.datasetMap.clear();
        this.dataset.forEach(r => this.datasetMap.set(String(r.id), r));
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
        const row = this.datasetMap.get(String(rowId));
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
            let val = this.extractValue(row, colKey);
            return AppUtils.Helper.parseNumber(val);
        }

        // Nếu CÓ công thức -> Tính toán (Lazy Evaluation)
        // 1. Kiểm tra vòng lặp
        if (this.callStack.has(cacheKey)) {
            console.warn(`Phát hiện vòng lặp vô hạn tại ${colKey} dòng ${rowId}`);
            return 0;
        }

        this.callStack.add(cacheKey);
        
        const executor = this.compiledFormulas[colKey];
        if (!executor) return 0; // Nếu không có hàm đã compile, trả về 0 (nhưng đã xử lý nhánh !formula ở trên)

        try {
            let result = executor.call(this, rowId);
            
            // Tối ưu hoá & Xử lý lỗi: Bắt lỗi chia cho 0 (Infinity) hoặc 0/0 (NaN)
            if (typeof result === 'number' && !Number.isFinite(result)) {
                result = 0;
            }
            
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
     * Tối ưu hoá: Biên dịch tất cả các công thức thành các Function độc lập (Pre-compilation)
     * Thay thế hoàn toàn cho việc gọi `new Function` hàng nghìn lần mỗi khi tính toán
     */
    compileFormulas() {
        this.compiledFormulas = {};
        const funcNames = Object.keys(this.functions);
        const variableRegex = /[a-zA-Z_][a-zA-Z0-9_]*/g;
        
        Object.keys(this.formulaConfig).forEach(colKey => {
            const formulaStr = this.formulaConfig[colKey];
            const parsedFormula = formulaStr.replace(variableRegex, (match) => {
                if (funcNames.includes(match)) return `this.functions.${match}`; // Giữ nguyên hàm
                if (match === 'True') return 'true';
                if (match === 'False') return 'false';
                // Thay thế tên biến bằng hàm gọi nội suy với rowId được truyền vào Function context
                return `this.getValue(rowId, '${match}')`; 
            });

            try {
                // Tạo một function nhận tham số 'rowId' duy nhất
                this.compiledFormulas[colKey] = new Function('rowId', 'return ' + parsedFormula);
            } catch (e) {
                console.warn(`Lỗi biên dịch công thức cho phần tử ${colKey}: ${formulaStr}`, e);
            }
        });
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
        const row = this.datasetMap.get(String(rowId));
        
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

    /**
     * Cập nhật giá trị một ô thông qua O(1) map
     */
    setRowValue(rowId, colKey, val) {
        const row = this.datasetMap.get(String(rowId));
        if (row) {
            this.updateRowValue(row, colKey, val);
        }
    }
}