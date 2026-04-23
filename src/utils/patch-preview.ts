import { html, type TemplateResult } from 'lit';

function unwrapCodeFence(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  const fenceMatch = /^```[^\n]*\n([\s\S]*?)\n```$/.exec(normalized);
  return fenceMatch?.[1] ?? text;
}

function extractPatchCandidate(text: string): string {
  const normalized = unwrapCodeFence(text).replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const patchStartIndex = lines.findIndex(
    line =>
      line === '*** Begin Patch' || line === '@@' || line.startsWith('@@ ')
  );

  if (patchStartIndex >= 0) {
    return lines.slice(patchStartIndex).join('\n');
  }

  return normalized;
}

function isPatchPreviewable(text: string): boolean {
  const candidate = extractPatchCandidate(text).trim();

  if (
    candidate.startsWith('*** Begin Patch') &&
    candidate.includes('*** End Patch')
  ) {
    return true;
  }

  return candidate.startsWith('@@');
}

function getPatchLineClass(line: string): string {
  if (line.startsWith('+') && !line.startsWith('+++')) {
    return 'patch-line-add';
  }

  if (line.startsWith('-') && !line.startsWith('---')) {
    return 'patch-line-delete';
  }

  return 'patch-line';
}

export function renderPatchPreview(text: string): TemplateResult | null {
  if (!isPatchPreviewable(text)) {
    return null;
  }

  const lines = extractPatchCandidate(text).replace(/\r\n/g, '\n').split('\n');
  // Keep this template densely packed so <pre> does not preserve indentation
  // whitespace between rendered patch lines.
  // prettier-ignore
  return html`<pre class="message-pre patch-pre"><code>${lines.map(line => html`<div class=${getPatchLineClass(line)}><span class="patch-text">${line}</span></div>`)}</code></pre>`; // eslint-disable-line max-len
}
