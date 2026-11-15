import {Command} from 'commander';
import {readFileSync} from 'node:fs';
import {
  BridgeError,
  addFinding,
  getBrief,
  getModuleData,
  getPackageIndex,
  getStudy,
  listFindings,
  listStudies,
  setStudyStatus,
} from '../core/bridge/core';
import {closeDb} from '../core/db/client';
import {STUDY_STATUSES, type StudyStatus} from '../core/db/schema';
import {paths} from '../core/paths';

/**
 * `rasd` — the Claude session's bridge to Rasd (§6.0.2).
 * Every command prints JSON to stdout (easy for the session to read); errors go to stderr with exit code 1.
 */

const out = (value: unknown) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new BridgeError(`رقم دراسة غير صالح: «${raw}»`, 'invalid');
  return id;
}

function readJson(file: string): unknown {
  let text: string;
  try {
    text = file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8');
  } catch {
    throw new BridgeError(`تعذّر قراءة الملف: ${file}`, 'invalid');
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new BridgeError(`الملف ليس JSON صالحاً (${file}): ${(error as Error).message}`, 'invalid');
  }
}

const program = new Command('rasd').description('جسر التحليل بين جلسة Claude وتطبيق رَصد').showHelpAfterError();

const study = program.command('study').description('قراءة الدراسات وحزمها وضبط حالتها');

study
  .command('list')
  .description('كل الدراسات (الأحدث أولاً)')
  .action(() => {
    out(listStudies().map(s => ({id: s.id, type: s.type, title: s.title, status: s.status, isDemo: s.isDemo})));
  });

study
  .command('show <id>')
  .description('ملخص دراسة: الحالة، الوحدات، النتائج المكتوبة')
  .option('--brief', 'اطبع brief.md كاملاً')
  .option('--evidence', 'اطبع كل معرّفات الأدلة المتاحة في الحزمة')
  .action((rawId: string, opts: {brief?: boolean; evidence?: boolean}) => {
    const id = parseId(rawId);
    if (opts.brief) {
      process.stdout.write(`${getBrief(id)}\n`);
      return;
    }
    const s = getStudy(id);
    if (opts.evidence) {
      const index = getPackageIndex(id);
      out(Object.entries(index.items).map(([evidence, item]) => ({evidence, kind: item.kind, label: item.label, media: item.media})));
      return;
    }
    const written = listFindings(id);
    let modules: Record<string, {dataFiles: number; playbook: string | null; findings: number}> = {};
    let packageDir: string | null = null;
    try {
      const index = getPackageIndex(id);
      packageDir = paths.studyPackage(id);
      modules = Object.fromEntries(
        Object.entries(index.modules).map(([module, entry]) => [
          module,
          {dataFiles: entry.dataFiles.length, playbook: entry.playbook, findings: written.filter(f => f.module === module).length},
        ]),
      );
    } catch (error) {
      if (!(error instanceof BridgeError) || error.code !== 'no_package') throw error;
    }
    out({
      id: s.id,
      type: s.type,
      title: s.title,
      status: s.status,
      isDemo: s.isDemo,
      params: s.params,
      packageDir,
      brief: packageDir ? `${packageDir}/brief.md` : null,
      modules,
      findings: written.map(f => ({module: f.module, key: f.key, title: f.title, confidence: f.confidence})),
    });
  });

study
  .command('data <id>')
  .description('بيانات وحدة تحليل واحدة + النتائج المكتوبة لها سابقاً')
  .requiredOption('--module <module>', 'اسم الوحدة، مثل top_content')
  .option('--file <n>', 'اطبع ملف البيانات رقم n فقط (للدراسات الكبيرة: دفعة دفعة)')
  .option('--paths', 'اطبع مسارات الملفات فقط دون محتواها')
  .action((rawId: string, opts: {module: string; file?: string; paths?: boolean}) => {
    const id = parseId(rawId);
    const data = getModuleData(id, opts.module);
    let files = data.files;
    if (opts.file !== undefined) {
      const n = Number(opts.file);
      const picked = files[n - 1];
      if (!Number.isInteger(n) || !picked) {
        throw new BridgeError(`رقم ملف غير صالح «${opts.file}». المتاح: 1 إلى ${files.length}`, 'invalid');
      }
      files = [picked];
    }
    out({
      module: data.module,
      playbook: data.playbook,
      packageDir: data.packageDir,
      totalFiles: data.files.length,
      existingFindings: data.existingFindings,
      files: files.map(f => (opts.paths ? {path: f.path, absolute: f.absolute} : {path: f.path, content: f.content})),
    });
  });

study
  .command('status <id> <status>')
  .description(`ضبط حالة الدراسة من جلسة التحليل: analyzing | done | partial`)
  .action((rawId: string, status: string) => {
    const id = parseId(rawId);
    if (!STUDY_STATUSES.includes(status as StudyStatus)) {
      throw new BridgeError(`حالة غير معروفة «${status}». المتاح للجسر: analyzing, done, partial`, 'invalid');
    }
    const s = setStudyStatus(id, status as StudyStatus, {fromBridge: true});
    out({ok: true, id: s.id, status: s.status});
  });

const finding = program.command('finding').description('كتابة وقراءة النتائج');

finding
  .command('add <id>')
  .description('إضافة نتيجة (أو مصفوفة نتائج) من ملف JSON؛ يتحقق من المخطط والأدلة')
  .requiredOption('--file <path>', 'ملف JSON (أو - للقراءة من stdin)')
  .action((rawId: string, opts: {file: string}) => {
    const id = parseId(rawId);
    const raw = readJson(opts.file);
    const list = Array.isArray(raw) ? raw : [raw];
    if (!list.length) throw new BridgeError('الملف لا يحوي أي نتيجة.', 'invalid');
    const results: {module: string; key: string; action: 'created' | 'updated'}[] = [];
    const errors: {index: number; error: string}[] = [];
    list.forEach((item, i) => {
      try {
        const r = addFinding(id, item);
        results.push({module: r.finding.module, key: r.finding.key, action: r.created ? 'created' : 'updated'});
      } catch (error) {
        if (!(error instanceof BridgeError)) throw error;
        errors.push({index: i, error: error.message});
      }
    });
    out({ok: errors.length === 0, saved: results, rejected: errors});
    if (errors.length) process.exitCode = 1;
  });

finding
  .command('list <id>')
  .description('النتائج المكتوبة لدراسة')
  .option('--module <module>', 'وحدة واحدة فقط')
  .action((rawId: string, opts: {module?: string}) => {
    out(listFindings(parseId(rawId), opts.module));
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof BridgeError) {
    process.stderr.write(`خطأ: ${error.message}\n`);
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  closeDb();
}
