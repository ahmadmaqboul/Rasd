/** محلّل وسائط صغير لسكربتات السبايك: --flag و --key value وقيم موضعية. */
export function parseArgs(argv: string[] = process.argv.slice(2)): {flags: Record<string, string | true>; positional: string[]} {
  const flags: Record<string, string | true> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg.startsWith('--')) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[arg.slice(2)] = next;
        i += 1;
      } else {
        flags[arg.slice(2)] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return {flags, positional};
}

export function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
