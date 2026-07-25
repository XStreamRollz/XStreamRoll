#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const repoRoot = process.cwd()
const appDir = path.join(repoRoot, 'app')
const staticDir = path.join(appDir, '.next', 'static')
const outDir = path.join(appDir, '.next', 'analyze')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const stat = fs.statSync(p)
    if (stat.isDirectory()) walk(p, files)
    else files.push(p)
  }
  return files
}

const jsFiles = walk(staticDir).filter((f) => f.endsWith('.js'))
let total = 0
let largest = { file: null, size: 0 }
for (const f of jsFiles) {
  const s = fs.statSync(f).size
  total += s
  if (s > largest.size) {
    largest.size = s
    largest.file = path.relative(repoRoot, f)
  }
}

const summary = {
  totalBytes: total,
  largestFile: largest.file,
  largestBytes: largest.size,
  fileCount: jsFiles.length,
  budgetTotal: Number(process.env.BUNDLE_BUDGET_TOTAL || 0),
  budgetLargest: Number(process.env.BUNDLE_BUDGET_PER_LARGEST || 0),
}

fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2))
console.log('Bundle summary:', summary)

if (summary.budgetTotal > 0 && total > summary.budgetTotal) {
  console.error(`Total bundle size ${total} exceeds budget ${summary.budgetTotal}`)
  process.exit(1)
}

if (summary.budgetLargest > 0 && largest.size > summary.budgetLargest) {
  console.error(`Largest file ${largest.size} exceeds per-file budget ${summary.budgetLargest}`)
  process.exit(1)
}

process.exit(0)
