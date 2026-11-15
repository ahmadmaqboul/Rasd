import {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {MODULES, RECIPES, type ModuleId} from '../../core/recipes';

/**
 * Recipe and module texts from the locale files. The keys are dynamic (types.<id>.label),
 * so we check here, once, that the ID is known instead of scattering type casts across the pages.
 * An unknown ID (a recipe added with no translation yet) is shown as-is instead of breaking the page.
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
