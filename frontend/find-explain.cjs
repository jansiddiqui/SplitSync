const fs = require('fs');
const content = fs.readFileSync('d:\\Project\\SpreeTail\\SplitSync\\frontend\\src\\components\\GroupDetail.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('explain')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
