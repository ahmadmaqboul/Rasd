import {and, asc, desc, eq, gt} from 'drizzle-orm';
import {existsSync, readFileSync} from 'node:fs';
import {getDb, schema} from '../db/client';
import type {FindingRow, StudyRow, StudyStatus} from '../db/schema';
import {paths, resolveInside} from '../paths';
import {MODULES, type ModuleId} from '../recipes';
import {FindingInput, PackageIndex, formatZodError} from '../schemas';

/**
 * نواة الجسر: العمليات نفسها تخدم CLI (`rasd`) وخادم MCP (Phase 3) وخادم الواجهة.
 * لا شيء هنا يستدعي نموذج ذكاء اصطناعي — الجسر يقرأ ويتحقق ويخزّن فقط.
 */

export class BridgeError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'invalid' | 'no_package' | 'bad_status',
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}

const {studies, findings, events} = schema;

export function emitEvent(studyId: number | null, type: string, payload: Record<string, unknown> = {}): void {
  getDb().insert(events).values({studyId, type, payload, createdAt: new Date()}).run();
}

export function eventsAfter(lastId: number, limit = 200) {
  return getDb().select().from(events).where(gt(events.id, lastId)).orderBy(asc(events.id)).limit(limit).all();
}

export function lastEventId(): number {
  const row = getDb().select({id: events.id}).from(events).orderBy(desc(events.id)).limit(1).get();
  return row?.id ?? 0;
}

// ── الدراسات ─────────────────────────────────────────────────────────────────
export function listStudies(): StudyRow[] {
  return getDb().select().from(studies).orderBy(desc(studies.id)).all();
}

export function getStudy(id: number): StudyRow {
  const row = getDb().select().from(studies).where(eq(studies.id, id)).get();
  if (!row) throw new BridgeError(`لا توجد دراسة بالرقم ${id}. جرّب: rasd study list`, 'not_found');
  return row;
}

export interface CreateStudyInput {
  type: string;
  title: string;
  params?: Record<string, unknown>;
  modules?: string[];
  isDemo?: boolean;
  status?: StudyStatus;
}

export function createStudy(input: CreateStudyInput): StudyRow {
  const now = new Date();
  const row = getDb()
    .insert(studies)
    .values({
      type: input.type,
      title: input.title,
      params: input.params ?? {},
      modules: input.modules ?? [],
      isDemo: input.isDemo ?? false,
      status: input.status ?? 'draft',
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  emitEvent(row.id, 'study.created', {status: row.status});
  return row;
}

/** الحالات التي يحق للجسر (جلسة التحليل) ضبطها، ومن أي حالة. */
const BRIDGE_TRANSITIONS: Partial<Record<StudyStatus, StudyStatus[]>> = {
  analyzing: ['ready', 'analyzing', 'partial', 'done'],
  done: ['analyzing'],
  partial: ['analyzing'],
};

export function setStudyStatus(id: number, status: StudyStatus, opts: {fromBridge?: boolean} = {}): StudyRow {
  const study = getStudy(id);
  if (opts.fromBridge) {
    const allowedFrom = BRIDGE_TRANSITIONS[status];
    if (!allowedFrom) {
      throw new BridgeError(`جلسة التحليل تضبط فقط: analyzing أو done أو partial (طُلب: ${status})`, 'bad_status');
    }
    if (!allowedFrom.includes(study.status)) {
      throw new BridgeError(
        `لا يمكن الانتقال من «${study.status}» إلى «${status}». ` +
          (study.status === 'collecting' || study.status === 'draft'
            ? 'الجمع لم ينتهِ بعد — انتظر حتى تصبح الدراسة «ready».'
            : 'ابدأ بـ: rasd study status <id> analyzing'),
        'bad_status',
      );
    }
    if (status === 'done' && countFindings(id) === 0) {
      throw new BridgeError('لا يمكن إنهاء دراسة بلا أي نتيجة. اكتب النتائج أولاً بـ: rasd finding add', 'bad_status');
    }
  }
  const row = getDb().update(studies).set({status, updatedAt: new Date()}).where(eq(studies.id, id)).returning().get();
  emitEvent(id, 'study.status', {status, from: study.status});
  return row;
}

// ── الحزمة ───────────────────────────────────────────────────────────────────
export function getPackageIndex(id: number): PackageIndex {
  const file = resolveInside(paths.studyPackage(id), 'index.json');
  if (!existsSync(file)) {
    throw new BridgeError(`لا توجد حزمة تحليل للدراسة ${id} بعد (الجمع لم يكتمل؟).`, 'no_package');
  }
  return PackageIndex.parse(JSON.parse(readFileSync(file, 'utf8')));
}

export function getBrief(id: number): string {
  getStudy(id);
  const file = resolveInside(paths.studyPackage(id), 'brief.md');
  if (!existsSync(file)) throw new BridgeError(`لا يوجد brief.md للدراسة ${id}.`, 'no_package');
  return readFileSync(file, 'utf8');
}

export interface ModuleData {
  module: ModuleId;
  playbook: string | null;
  packageDir: string;
  files: {path: string; absolute: string; content: unknown}[];
  /** النتائج المكتوبة سابقاً لهذه الوحدة (للاستئناف بلا تكرار). */
  existingFindings: {key: string; title: string}[];
}

export function getModuleData(id: number, module: string): ModuleData {
  if (!MODULES.includes(module as ModuleId)) {
    throw new BridgeError(`وحدة غير معروفة «${module}». المتاح: ${MODULES.join(', ')}`, 'invalid');
  }
  const index = getPackageIndex(id);
  const entry = index.modules[module];
  if (!entry) {
    throw new BridgeError(
      `الوحدة «${module}» ليست ضمن هذه الدراسة. وحدات الدراسة: ${Object.keys(index.modules).join(', ') || '(لا شيء)'}`,
      'invalid',
    );
  }
  const packageDir = paths.studyPackage(id);
  const files = entry.dataFiles.map(path => {
    const absolute = resolveInside(packageDir, path);
    return {path, absolute, content: JSON.parse(readFileSync(absolute, 'utf8')) as unknown};
  });
  return {
    module: module as ModuleId,
    playbook: entry.playbook,
    packageDir,
    files,
    existingFindings: listFindings(id, module).map(f => ({key: f.key, title: f.title})),
  };
}

// ── النتائج ──────────────────────────────────────────────────────────────────
export function listFindings(id: number, module?: string): FindingRow[] {
  const where = module ? and(eq(findings.studyId, id), eq(findings.module, module)) : eq(findings.studyId, id);
  return getDb().select().from(findings).where(where).orderBy(asc(findings.id)).all();
}

export function countFindings(id: number): number {
  return listFindings(id).length;
}

export interface AddFindingResult {
  finding: FindingRow;
  created: boolean;
}

/**
 * يتحقق من النتيجة (المخطط + وجود كل دليل في فهرس الحزمة + أن الوحدة ضمن الدراسة) ثم يحفظها.
 * إعادة الكتابة بنفس (الوحدة، المفتاح) تحدّث النتيجة — فالاستئناف بعد انقطاع لا يكرّر شيئاً.
 */
export function addFinding(id: number, raw: unknown): AddFindingResult {
  const study = getStudy(id);
  const parsed = FindingInput.safeParse(raw);
  if (!parsed.success) {
    throw new BridgeError(`النتيجة مرفوضة — لا تطابق المخطط:\n${formatZodError(parsed.error)}`, 'invalid');
  }
  const input = parsed.data;
  if (study.status !== 'analyzing') {
    throw new BridgeError(
      `الدراسة ${id} في حالة «${study.status}». ابدأ التحليل أولاً: rasd study status ${id} analyzing`,
      'bad_status',
    );
  }
  const index = getPackageIndex(id);
  if (!index.modules[input.module]) {
    throw new BridgeError(
      `الوحدة «${input.module}» ليست ضمن هذه الدراسة. وحدات الدراسة: ${Object.keys(index.modules).join(', ')}`,
      'invalid',
    );
  }
  const unknown = input.evidence.filter(e => !index.items[e]);
  if (unknown.length) {
    throw new BridgeError(
      `أدلة غير موجودة في فهرس الحزمة: ${unknown.join(', ')}\n` +
        `استعمل فقط المعرّفات الواردة في index.json (rasd study show ${id} --evidence).`,
      'invalid',
    );
  }

  const db = getDb();
  const now = new Date();
  const existing = db
    .select()
    .from(findings)
    .where(and(eq(findings.studyId, id), eq(findings.module, input.module), eq(findings.key, input.key)))
    .get();

  const values = {
    title: input.title,
    claim: input.claim,
    why: input.why ?? null,
    evidence: input.evidence,
    confidence: input.confidence,
    data: input.data ?? null,
    updatedAt: now,
  };

  const finding = existing
    ? db.update(findings).set(values).where(eq(findings.id, existing.id)).returning().get()
    : db
        .insert(findings)
        .values({...values, studyId: id, module: input.module, key: input.key, createdAt: now})
        .returning()
        .get();

  emitEvent(id, existing ? 'finding.updated' : 'finding.added', {findingId: finding.id, module: finding.module, key: finding.key});
  return {finding, created: !existing};
}
