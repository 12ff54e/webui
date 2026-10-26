import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNumber} from '../src/number.js';

test('accepts decimal and exponent notation without discarding precision', () => {
    for (const [text, expected] of [['1e-12', 1e-12], ['+.5', .5], ['-2.', -2], [' 3.14 ', 3.14],
        ['0.10000000000000002', .10000000000000002], ['5e-324', Number.MIN_VALUE], ['0e-999', 0]]) {
        const result = parseNumber(text);
        assert.equal(result.valid, true, text);
        assert.equal(result.value, expected, text);
    }
    assert.ok(Object.is(parseNumber('-0').value, -0));
});

test('keeps missing, unfinished, malformed, and unrepresentable input distinct from zero', () => {
    assert.deepEqual(parseNumber(''), {valid: true, value: null, message: ''});
    assert.equal(parseNumber('  ', {required: true}).valid, false);
    for (const text of ['1e-', '-', '.', '1e', '0x10', 'Infinity', 'NaN', '1,2', '12px', '1 2',
        '1e309', '1e-999', '-0.001e-999']) {
        const result = parseNumber(text);
        assert.equal(result.valid, false, text);
        assert.equal(result.value, null, text);
        assert.ok(result.message, text);
    }
});

test('checks bounds and integer constraints without clamping', () => {
    assert.equal(parseNumber('1e-8', {min: 1e-6}).valid, false);
    assert.equal(parseNumber('1e-6', {min: 1e-6}).value, 1e-6);
    assert.equal(parseNumber('55', {min: 3, max: 55, integer: true}).value, 55);
    assert.equal(parseNumber('56', {max: 55}).valid, false);
    assert.equal(parseNumber('1.5', {integer: true}).valid, false);
    assert.equal(parseNumber('9007199254740993', {integer: true}).valid, false);
    assert.equal(parseNumber('3e1', {integer: true}).value, 30);
});

test('rejects invalid parsing contracts', () => {
    assert.throws(() => parseNumber(0), TypeError);
    assert.throws(() => parseNumber('1', {min: NaN}), TypeError);
    assert.throws(() => parseNumber('1', {max: Infinity}), TypeError);
    assert.throws(() => parseNumber('1', {min: '0'}), TypeError);
    assert.throws(() => parseNumber('1', {min: 2, max: 1}), RangeError);
    assert.throws(() => parseNumber('1', {integer: 'yes'}), TypeError);
});
