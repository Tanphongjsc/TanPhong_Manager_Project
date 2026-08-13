/**
 * HolidayRuleGenerator
 * Pure business logic module. Does NOT touch the DOM.
 *
 * Responsibilities:
 *   - Expand weekday + interval pattern into a list of specific dates
 *   - Apply date range filter
 *   - Apply year filter
 *   - Exclude past dates
 *   - Return deterministic results (sorted)
 */
const HolidayRuleGenerator = (() => {

    /**
     * Pad a number to 2 digits.
     */
    function _pad(n) {
        return String(n).padStart(2, '0');
    }

    /**
     * Convert Date to 'YYYY-MM-DD' ISO string.
     */
    function _toISO(date) {
        return `${date.getFullYear()}-${_pad(date.getMonth() + 1)}-${_pad(date.getDate())}`;
    }

    /**
     * Parse 'DD/MM/YYYY' or 'YYYY-MM-DD' to Date.
     * Returns null if invalid.
     */
    function _parseDate(str) {
        if (!str) return null;
        str = str.trim();
        let parts = null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
            const [y, m, d] = str.split('-').map(Number);
            parts = { y, m, d };
        } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
            const [d, m, y] = str.split('/').map(Number);
            parts = { y, m, d };
        }
        if (!parts) return null;
        const parsed = new Date(parts.y, parts.m - 1, parts.d);
        return parsed.getFullYear() === parts.y
            && parsed.getMonth() === parts.m - 1
            && parsed.getDate() === parts.d
            ? parsed
            : null;
    }

    /**
     * Get ISO weekday index for a Date.
     * Monday=0, Tuesday=1, ..., Saturday=5, Sunday=6
     */
    function _getISOWeekday(date) {
        return (date.getDay() + 6) % 7;
    }

    /**
     * Get the Monday of the week containing `date`.
     * Week starts on Monday (ISO).
     */
    function _getMondayOfWeek(date) {
        const d = new Date(date);
        const dow = _getISOWeekday(d);
        d.setDate(d.getDate() - dow);
        return d;
    }

    /**
     * Generate dates matching weekday pattern with given interval.
     *
     * @param {object} rule
     * @param {number[]} rule.weekdays       — ISO weekdays [0..6], 0=Mon 6=Sun
     * @param {number}   rule.interval       — week interval (1=weekly, 2=bi-weekly, etc.)
     * @param {string}   rule.startDate      — 'YYYY-MM-DD' or 'DD/MM/YYYY'
     * @param {string}   rule.endDate        — 'YYYY-MM-DD' or 'DD/MM/YYYY'
     * @param {number}   [rule.year]         — filter to this year only (optional)
     * @param {string}   [rule.minDate]      — 'YYYY-MM-DD', exclude past (optional)
     *
     * @returns {string[]} sorted array of 'YYYY-MM-DD' date strings
     */
    function generate(rule) {
        const {
            weekdays,
            interval,
            startDate: startStr,
            endDate: endStr,
            year,
            minDate: minStr,
        } = rule;

        if (!weekdays || weekdays.length === 0) return [];
        if (!interval || interval < 1) return [];

        const startDate = _parseDate(startStr);
        const endDate = _parseDate(endStr);
        if (!startDate || !endDate) return [];
        if (startDate > endDate) return [];

        const minDate = minStr ? _parseDate(minStr) : null;

        const results = [];
        const weekdaySet = new Set(weekdays.map(Number));

        // Anchor: Monday of the week that contains startDate
        let anchorMonday = _getMondayOfWeek(startDate);

        const MAX_ITERATIONS = 400; // Safety limit (~8 years of weekly)
        let iterations = 0;

        while (iterations < MAX_ITERATIONS) {
            iterations++;

            // For each weekday in this anchor week
            for (let dow = 0; dow <= 6; dow++) {
                if (!weekdaySet.has(dow)) continue;

                const candidate = new Date(anchorMonday);
                candidate.setDate(candidate.getDate() + dow);

                const isoStr = _toISO(candidate);

                // Must be within startDate–endDate
                if (candidate < startDate || candidate > endDate) continue;

                // Filter by year if specified
                if (year && candidate.getFullYear() !== year) continue;

                // Filter past dates if minDate given
                if (minDate && candidate < minDate) continue;

                results.push(isoStr);
            }

            // Advance anchor by `interval` weeks
            anchorMonday = new Date(anchorMonday);
            anchorMonday.setDate(anchorMonday.getDate() + interval * 7);

            if (anchorMonday > endDate) break;
        }

        // Sort and deduplicate
        return [...new Set(results)].sort();
    }

    /**
     * Generate a simple date list from a contiguous range.
     * Used for holiday ranges (Thêm nghỉ lễ thủ công, từ ngày–đến ngày).
     *
     * @param {string} startStr   'YYYY-MM-DD' or 'DD/MM/YYYY'
     * @param {string} endStr     'YYYY-MM-DD' or 'DD/MM/YYYY'
     * @param {object} [options]
     * @param {number} [options.year]     filter to year
     * @param {string} [options.minDate]  exclude past
     *
     * @returns {string[]} sorted array of 'YYYY-MM-DD'
     */
    function generateRange(startStr, endStr, options = {}) {
        const start = _parseDate(startStr);
        const end = _parseDate(endStr);
        if (!start || !end || start > end) return [];

        const minDate = options.minDate ? _parseDate(options.minDate) : null;
        const results = [];

        const cur = new Date(start);
        while (cur <= end) {
            if (options.year && cur.getFullYear() !== options.year) {
                cur.setDate(cur.getDate() + 1);
                continue;
            }
            if (minDate && cur < minDate) {
                cur.setDate(cur.getDate() + 1);
                continue;
            }
            results.push(_toISO(cur));
            cur.setDate(cur.getDate() + 1);
        }

        return results;
    }

    return { generate, generateRange };
})();
