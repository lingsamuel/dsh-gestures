import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const command = promisify(execFile)

/** 在验收用的 DSH_HOME 中写入三页原生会话历史，返回可加入工作区的会话 ID。 */
export async function seedHistory(dsh, home, cwd) {
  const { stdout } = await command('which', [dsh])
  const requireFromDsh = createRequire(await realpath(stdout.trim()))
  const [cordis, sessions, persistence, llm] = await Promise.all(
    ['cordis', 'dsh-session', 'dsh-session-persistence-jsonl', 'dsh-llm'].map(name => (
      import(pathToFileURL(requireFromDsh.resolve(`@deepseek-ai/${name}`)))
    )),
  )
  const ctx = new cordis.Context()
  try {
    await ctx.plugin(sessions.default)
    // 与 Web profile 共用原生持久化后端的默认压缩设置。
    await ctx.plugin(persistence, { root: join(home, 'sessions') })
    const session = ctx.sessions.create(`session-${randomUUID()}`, { meta: { cwd } })
    const writer = await ctx.sessionPersistence.create(session.header)
    try {
      session.append('session/title', { title: 'Gesture history', messageSeqs: [], source: { kind: 'user' } })
      for (let turn = 1; turn <= 125; turn++) {
        session.append('turn/start', { turn })
        session.append('user/message', llm.createUserMessage({
          content: [{ type: 'text', text: `Gesture fixture message ${turn}` }],
          source: { kind: 'user' },
        }), { surfaceOp: 'append' })
        session.append('turn/end', { turn, reason: { kind: 'completed' } })
      }
      await ctx.sessions.flush(session)
    } finally {
      await writer.close()
    }
    return session.id
  } finally {
    await ctx.fiber.dispose()
  }
}
