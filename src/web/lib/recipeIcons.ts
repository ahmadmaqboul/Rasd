import type {IconType} from '@astryxdesign/core/Icon';
import {
  BellAlertIcon,
  ChartBarSquareIcon,
  ClipboardDocumentCheckIcon,
  CubeIcon,
  GlobeAltIcon,
  MegaphoneIcon,
  PhotoIcon,
  PuzzlePieceIcon,
  ScaleIcon,
  SparklesIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';

/** أيقونة لكل نوع دراسة. نوع بلا أيقونة هنا يأخذ الأيقونة الافتراضية — فالوصفات تبقى تصريحية. */
const ICONS: Record<string, IconType> = {
  full: SparklesIcon,
  account: UserCircleIcon,
  content: PhotoIcon,
  ads: MegaphoneIcon,
  product: CubeIcon,
  market: GlobeAltIcon,
  competitors: ScaleIcon,
  strategy: PuzzlePieceIcon,
  audit: ClipboardDocumentCheckIcon,
  monitor: BellAlertIcon,
};

export function recipeIcon(id: string): IconType {
  return ICONS[id] ?? ChartBarSquareIcon;
}
