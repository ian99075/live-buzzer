import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const workspaceDir=path.resolve('.');
process.env.RUNTIME_NODE_MODULES='C:/Users/Ian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
process.env.RUNTIME_NODE='C:/Users/Ian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe';
const skillDir='C:/Users/Ian/.codex/plugins/cache/openai-primary-runtime/presentations/26.1011.11113/skills/presentations';
const {finalizePresentation}=await import(pathToFileURL(path.join(skillDir,'container_tools/artifact_tool_utils.mjs')).href);
const candidatePath=path.join(workspaceDir,'.pptx-build/feature-deck/candidate.pptx');
const finalPath=path.join(workspaceDir,'deliverables/課堂即時搶答系統_完整功能介紹_實際操作截圖.pptx');
await fs.mkdir(path.dirname(finalPath),{recursive:true});
const result=await finalizePresentation({
  workspaceDir,candidatePath,finalPath,
  pythonExecutable:'C:/Users/Ian/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',
  integrityValidatorPath:path.join(skillDir,'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath:path.join(skillDir,'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],
  requiredNativeTableOwnerSlides:[],
  requiredNativeChartOwnerSlides:[],
  fontPolicy:{basis:'design',families:['Aptos']},
  verifyArtifactToolImport:true,
  receiptPath:path.join(workspaceDir,'.pptx-build/feature-deck/validation.json'),
});
console.log(JSON.stringify(result));
