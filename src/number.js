// Numeric fields use JavaScript's finite IEEE-754 binary64 values. Keep parsing
// independent of the DOM so scientific input edge cases have direct tests.
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export function validateNumberConstraints({min, max, integer = false} = {}) {
    for (const [name, value] of [['min', min], ['max', max]]) {
        if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value)))
            throw new TypeError(`${name} must be a finite number or undefined.`);
    }
    if (min !== undefined && max !== undefined && min > max)
        throw new RangeError('min must not exceed max.');
    if (typeof integer !== 'boolean') throw new TypeError('integer must be a boolean.');
}

export function parseNumber(text, constraints = {}) {
    validateNumberConstraints(constraints);
    if (typeof text !== 'string') throw new TypeError('Numeric draft must be a string.');
    const {required = false, min, max, integer = false} = constraints;
    const draft = text.trim();
    const invalid = message => ({valid: false, value: null, message});
    if (!draft) return required ? invalid('Enter a number.') : {valid: true, value: null, message: ''};
    if (!decimal.test(draft)) return invalid('Enter a decimal number, such as 1e-6.');
    const value = Number(draft);
    if (!Number.isFinite(value)) return invalid('Enter a finite number.');
    // Number() rounds tiny nonzero values to zero. Reject that loss rather than
    // silently changing a scientific input into an exact zero.
    if (value === 0 && /[1-9]/.test(draft.split(/[eE]/)[0]))
        return invalid('This number is too small to represent.');
    if (integer && !Number.isSafeInteger(value)) return invalid('Enter a safe integer.');
    if (min !== undefined && value < min) return invalid(`Enter a number of at least ${min}.`);
    if (max !== undefined && value > max) return invalid(`Enter a number of at most ${max}.`);
    return {valid: true, value, message: ''};
}
