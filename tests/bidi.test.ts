import {describe, expect, it} from 'vitest';
import {isolateNumberRuns} from '../src/web/lib/bidi';

const LRI = '⁦';
const PDI = '⁩';

describe('isolateNumberRuns', () => {
  it('isolates number expressions so their order survives inside Arabic text', () => {
    expect(isolateNumberRuns('عرض «2+1» بمهلة 48 ساعة')).toBe(`عرض «${LRI}2+1${PDI}» بمهلة 48 ساعة`);
    expect(isolateNumberRuns('خصم 10-15 شيكل')).toBe(`خصم ${LRI}10-15${PDI} شيكل`);
    expect(isolateNumberRuns('618 = 530 + 88')).toBe(`${LRI}618 = 530 + 88${PDI}`);
    expect(isolateNumberRuns('نسبة 4.2×3')).toBe(`نسبة ${LRI}4.2×3${PDI}`);
  });

  it('leaves plain numbers, percentages and words alone', () => {
    for (const text of ['618 تفاعلاً مقابل وسيط 147', 'من 0 لـ 50% بـ 20 دقيقة', 'سعر 89.5 شيكل', 'بدون أرقام']) {
      expect(isolateNumberRuns(text)).toBe(text);
    }
  });
});
