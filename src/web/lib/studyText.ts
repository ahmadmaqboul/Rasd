import {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {MODULES, RECIPES, type ModuleId} from '../../core/recipes';

/**
 * نصوص الوصفات والوحدات من ملفات اللغة. المفاتيح ديناميكية (types.<id>.label)،
 * فنتحقق هنا مرة واحدة من أن المعرّف معروف بدل تشتيت التحويلات في الصفحات.
 * معرّف غير معروف (وصفة أضيفت بلا ترجمة بعد) يُعرض كما هو بدل أن يكسر الصفحة.
 */
type RecipeId = 'full' | 'account' | 'content' | 'ads' | 'product' | 'market' | 'competitors' | 'strategy' | 'audit' | 'monitor';

const KNOWN = new Set(RECIPES.map(r => r.id));

export function isRecipeId(id: string): id is RecipeId {
  return KNOWN.has(id);
}

export function useStudyText() {
  const {t} = useTranslation('studies');
  return useMemo(
    () => ({
      recipeLabel: (id: string): string => (isRecipeId(id) ? t(`types.${id}.label`) : id),
      recipeDescription: (id: string): string => (isRecipeId(id) ? t(`types.${id}.description`) : ''),
      recipeInput: (id: string): string => (isRecipeId(id) ? t(`types.${id}.input`) : ''),
      moduleLabel: (id: string): string =>
        (MODULES as readonly string[]).includes(id) ? t(`modules.${id as ModuleId}`) : id,
    }),
    [t],
  );
}
