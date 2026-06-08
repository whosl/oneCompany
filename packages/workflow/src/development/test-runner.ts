export type VitestJsonReport = {
  numFailedTests?: number;
  numPassedTests?: number;
  success?: boolean;
};

export function parseVitestJson(stdout: string): { passed: boolean; details: string } {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { passed: false, details: "empty vitest output" };
  }

  let report: VitestJsonReport;
  try {
    report = JSON.parse(trimmed) as VitestJsonReport;
  } catch {
    return { passed: false, details: "invalid vitest json output" };
  }

  const failed = report.numFailedTests ?? 0;
  const passed = report.success ?? failed === 0;
  return {
    passed,
    details: `vitest: failed=${failed}, passed=${report.numPassedTests ?? 0}`,
  };
}
