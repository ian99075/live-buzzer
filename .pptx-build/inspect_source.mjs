import fs from 'node:fs/promises';
import path from 'node:path';
import { FileBlob, PresentationFile } from 'file:///C:/Users/Ian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';

const source = 'C:/Users/Ian/Desktop/NCU/實驗室/SE_TA - 複製/deliverables/即時線上搶答系統_學生實作需求_含評分標準.pptx';
const output = 'C:/Users/Ian/Desktop/NCU/實驗室/SE_TA/.pptx-build/source';
await fs.mkdir(output, { recursive: true });
const presentation = await PresentationFile.importPptx(await FileBlob.load(source));
const result = await presentation.inspect({
  select: '$.slides[*]',
  include: ['id', 'index', 'title', 'layout', 'elements.id', 'elements.kind', 'elements.text', 'elements.alt', 'elements.position', 'notes.text'],
});
await fs.writeFile(path.join(output, 'content.ndjson'), result.ndjson, 'utf8');
const meta = {
  slideCount: presentation.slides.items.length,
  size: presentation.slideSize,
  masters: presentation.masters.items.map(master => ({ id: master.id, name: master.name })),
};
await fs.writeFile(path.join(output, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
for (const [index, slide] of presentation.slides.items.entries()) {
  const png = await presentation.export({ slide, format: 'png', scale: 1 });
  await fs.writeFile(path.join(output, `slide-${String(index + 1).padStart(2, '0')}.png`), new Uint8Array(await png.arrayBuffer()));
}
console.log(JSON.stringify(meta));
