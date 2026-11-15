import type {ReactNode} from 'react';

/**
 * نص لاتيني الاتجاه داخل واجهة عربية: روابط، أسماء حسابات (@handle)، أوامر، معرّفات.
 * بدونه يعيد المتصفح ترتيب الرموز الطرفية (مثل «/» و«@») فتظهر في الجهة الخطأ:
 * «‎/rasd-analyze 1» تُعرض «rasd-analyze 1/». التفاصيل في docs/rtl.md.
 */
export function Ltr({children}: {children: ReactNode}) {
  return <bdi dir="ltr">{children}</bdi>;
}
