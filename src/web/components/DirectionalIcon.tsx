import {Icon, type IconProps} from '@astryxdesign/core/Icon';
import {rtlStyles} from '@astryxdesign/core/utils';

interface DirectionalIconProps extends Omit<IconProps, 'icon' | 'xstyle'> {
  /**
   * Logical direction, not physical: forward = toward the end of the line (right in LTR, left in RTL),
   * back = toward its start. "Next" is always forward and "Previous/Back" is always back.
   */
  direction: 'forward' | 'back';
}

/**
 * An arrow icon that flips automatically with the page direction.
 * Astryx's internal components (Pagination, Calendar, SideNav…) flip their arrows themselves,
 * but an `<Icon icon="chevronRight">` that we write ourselves does not flip — so every directional arrow
 * in Rasd's code goes through here. Details in docs/rtl.md.
 */
export function DirectionalIcon({direction, ...rest}: DirectionalIconProps) {
  return <Icon icon={direction === 'forward' ? 'chevronRight' : 'chevronLeft'} xstyle={rtlStyles.mirror} {...rest} />;
}
