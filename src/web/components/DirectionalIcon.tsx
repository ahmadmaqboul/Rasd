import {Icon, type IconProps} from '@astryxdesign/core/Icon';
import {rtlStyles} from '@astryxdesign/core/utils';

interface DirectionalIconProps extends Omit<IconProps, 'icon' | 'xstyle'> {
  /**
   * اتجاه منطقي لا فيزيائي: forward = نحو نهاية السطر (يمين في LTR، يسار في RTL)،
   * back = نحو بدايته. «التالي» دائماً forward و«السابق/رجوع» دائماً back.
   */
  direction: 'forward' | 'back';
}

/**
 * أيقونة سهم تنعكس تلقائياً مع اتجاه الصفحة.
 * مكوّنات Astryx الداخلية (Pagination, Calendar, SideNav…) تعكس أسهمها بنفسها،
 * لكن `<Icon icon="chevronRight">` الذي نكتبه نحن لا ينعكس — لذلك كل سهم اتجاهي
 * في كود رَصد يمرّ من هنا. التفاصيل في docs/rtl.md.
 */
export function DirectionalIcon({direction, ...rest}: DirectionalIconProps) {
  return <Icon icon={direction === 'forward' ? 'chevronRight' : 'chevronLeft'} xstyle={rtlStyles.mirror} {...rest} />;
}
