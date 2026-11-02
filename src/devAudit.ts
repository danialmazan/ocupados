// Explicit local-development diagnostic; removed entirely from production builds.
export function installAudit() {
  let started = false;
  const observer = new MutationObserver(() => { void check(); });
  const check = async () => {
    if (started || !document.querySelector('.treemap-cell')) return;
    started = true; observer.disconnect();
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const axe = (await import('axe-core')).default;
    const result = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
    const panel = document.createElement('pre');
    panel.id = 'development-accessibility-report';
    panel.style.cssText = 'white-space:pre-wrap;word-break:break-word;margin:24px;padding:24px;border:2px solid #172d43;background:#f4f7f8;font:12px monospace;color:#172d43';
    panel.textContent = JSON.stringify({ violations: result.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), passes: result.passes.length, incomplete: result.incomplete.map(v => v.id) }, null, 2);
    document.body.append(panel);
  };
  observer.observe(document.getElementById('root')!, { subtree: true, childList: true });
  void check();
}
