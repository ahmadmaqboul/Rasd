import {join} from 'node:path';
import {createStudy, setStudyStatus} from '../core/bridge/core';
import {buildPackage} from '../core/bridge/package';
import {closeDb} from '../core/db/client';
import {paths} from '../core/paths';
import {generateDemoDataset} from './demo-data';

/**
 * سبايك الجسر (Phase 0): ينشئ دراسة تجريبية صغيرة (5 منشورات + صور) ويبني حزمتها
 * ويتركها في حالة «جاهز للتحليل». بعدها:  /rasd-analyze <id>  في جلسة Claude Code.
 *
 *   npm run spike:bridge
 */

const study = createStudy({
  type: 'content',
  title: 'سبايك الجسر — محتوى متجر إكسسوارات (تجريبي)',
  params: {account: '@demo_accessories', period: '30d', depth: 'deep'},
  // وحدتان فقط للسبايك: واحدة نصّية/رقمية وواحدة بصرية — تكفيان لإثبات الدورة.
  modules: ['top_content', 'visual_style'],
  isDemo: true,
  status: 'collecting',
});

try {
  const dataset = await generateDemoDataset(join(paths.study(study.id), 'raw'));
  const result = await buildPackage({studyId: study.id, profiles: [dataset.profile], posts: dataset.posts, isDemo: true});
  setStudyStatus(study.id, 'ready');
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        studyId: study.id,
        status: 'ready',
        package: result.dir,
        stats: result.stats,
        next: `/rasd-analyze ${study.id}`,
        ui: `http://127.0.0.1:5173/studies/${study.id}`,
      },
      null,
      2,
    )}\n`,
  );
} catch (error) {
  setStudyStatus(study.id, 'failed');
  throw error;
} finally {
  closeDb();
}
