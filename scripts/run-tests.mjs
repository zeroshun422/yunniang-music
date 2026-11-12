// 单元测试运行器：用本地 esbuild 把 TS 编译为 ESM 后交给 node:test 执行
// 不使用 npx（项目约定），直接调用 node_modules 下的二进制 / Node API
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outdir = path.join(root, 'dist-test')

fs.rmSync(outdir, { recursive: true, force: true })

// 编译源码与测试
await build({
  entryPoints: [
    path.join(root, 'electron/quality.ts'),
    path.join(root, 'tests/quality.test.ts'),
    path.join(root, 'tests/player.test.ts'),
  ],
  bundle: false,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outdir,
  outExtension: { '.js': '.js' },
  logLevel: 'error',
})

// dist-test 必须是 ESM 作用域，否则 node 会按 CJS 解析
fs.writeFileSync(path.join(outdir, 'package.json'), JSON.stringify({ type: 'module' }))

// 测试文件 import 的是 '../electron/quality.js'，
// 编译后目录结构变为 dist-test/tests/*.js 与 dist-test/electron/*.js，相对路径仍然成立
const testFiles = ['quality.test.js', 'player.test.js']
  .map((f) => path.join(outdir, 'tests', f))
  .filter((f) => fs.existsSync(f))

if (!testFiles.length) {
  console.error('未找到编译后的测试文件')
  process.exit(1)
}

const child = spawn(process.execPath, ['--test', ...testFiles], {
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: '' },
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})
