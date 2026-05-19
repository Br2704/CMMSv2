import { Reporter, TestCase, TestResult, Suite } from "@playwright/test/reporter";

class E2EReporter implements Reporter {
  private results: {
    passed: { name: string; duration: number }[];
    failed: { name: string; error: string; duration: number }[];
    skipped: string[];
    startTime: number;
  } = { passed: [], failed: [], skipped: [], startTime: Date.now() };

  onTestEnd(test: TestCase, result: TestResult) {
    const name = test.titlePath().join(" > ");
    if (result.status === "passed") {
      this.results.passed.push({ name, duration: result.duration });
    } else if (result.status === "failed" || result.status === "timedOut") {
      this.results.failed.push({
        name,
        error: result.error?.message || "Unknown error",
        duration: result.duration,
      });
    } else if (result.status === "skipped") {
      this.results.skipped.push(name);
    }
  }

  async onEnd() {
    const total = this.results.passed.length + this.results.failed.length + this.results.skipped.length;
    const duration = ((Date.now() - this.results.startTime) / 1000).toFixed(1);

    const lines: string[] = [
      `# CMMS E2E Test Report`,
      ``,
      `**Generated:** ${new Date().toISOString()}`,
      `**Duration:** ${duration}s`,
      `**Total Tests:** ${total}`,
      `**Passed:** ${this.results.passed.length}`,
      `**Failed:** ${this.results.failed.length}`,
      `**Skipped:** ${this.results.skipped.length}`,
      ``,
      `## Pass Rate: ${total > 0 ? ((this.results.passed.length / total) * 100).toFixed(1) : "N/A"}%`,
      ``,
    ];

    if (this.results.failed.length > 0) {
      lines.push(`## ❌ Failed Tests`);
      lines.push(``);
      for (const f of this.results.failed) {
        lines.push(`### ${f.name}`);
        lines.push(`- **Error:** ${f.error}`);
        lines.push(`- **Duration:** ${(f.duration / 1000).toFixed(1)}s`);
        lines.push(``);
      }
    }

    if (this.results.passed.length > 0) {
      lines.push(`## ✅ Passed Tests`);
      lines.push(``);
      for (const p of this.results.passed) {
        lines.push(`- ${p.name} (${(p.duration / 1000).toFixed(1)}s)`);
      }
      lines.push(``);
    }

    const outputFile = process.env.OUTPUT_FILE || "e2e-test-report.md";
    const fs = await import("fs");
    const path = await import("path");
    const outputPath = path.resolve(outputFile);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, lines.join("\n"), "utf-8");
    console.log(`\n📄 Report written to: ${outputPath}\n`);
  }
}

export default E2EReporter;
