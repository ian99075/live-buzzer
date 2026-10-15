import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
const base='C:/Users/Ian/Desktop/NCU/實驗室/SE_TA';
const skill='C:/Users/Ian/.codex/plugins/cache/openai-primary-runtime/presentations/26.1011.11113/skills/presentations';
const source='C:/Users/Ian/Desktop/NCU/實驗室/SE_TA - 複製/deliverables/即時線上搶答系統_學生實作需求_含評分標準.pptx';
const candidate=path.join(base,'.pptx-build','candidate-v2.pptx');
const final=path.join(base,'deliverables','即時線上搶答系統_學生實作需求_含題組_評分標準.pptx');
process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES='C:/Users/Ian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools','artifact_tool_utils.mjs')).href);
const sha=crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex');
const result=await finalizePresentation({
  workspaceDir:base,
  candidatePath:candidate,
  finalPath:final,
  pythonExecutable:'C:/Users/Ian/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',
  integrityValidatorPath:path.join(skill,'container_tools','inspect_presentation_package_integrity.py'),
  layoutValidatorPath:path.join(skill,'container_tools','inspect_presentation_layout_geometry.py'),
  layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],
  requiredNativeTableOwnerSlides:[],
  requiredNativeChartOwnerSlides:[],
  fontPolicy:{basis:'reference',families:['Microsoft JhengHei'],referencePath:source,referenceSha256:sha},
  verifyArtifactToolImport:true,
  receiptPath:path.join(base,'.pptx-build','validation-v2.json'),
});
console.log(JSON.stringify(result));
