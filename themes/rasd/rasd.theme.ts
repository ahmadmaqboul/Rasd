// The rasd theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in rasd.settings.json and the generated rasd.settings.ts;
// change them with `astryx experimental theme editor set rasd ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {rasdSettings} from './rasd.settings';

export const rasdTheme = defineTheme({
  extends: rasdSettings,
  name: 'rasd',
});
