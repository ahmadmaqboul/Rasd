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

/** An icon for each study type. A type with no icon here gets the default icon — so the recipes stay declarative. */
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
