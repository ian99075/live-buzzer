import { readConfig } from '../src/config.js';
import { createGoogleSheetClient } from '../src/sheets.js';

try {
  const grid = await createGoogleSheetClient(readConfig()).readGrid();
  console.log(`唯讀檢查完成：${grid.title}，題目鍵 ${grid.questions.size} 個，答案鍵 ${grid.answers.size} 個。`);
} catch (error) {
  console.error(`唯讀檢查未通過：${error.message}`);
  process.exitCode = 1;
}
