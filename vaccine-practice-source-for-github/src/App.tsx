import { useMemo, useState } from 'react'
import bank from './data/questions.json'
import './App.css'

type QuestionType = 'single' | 'multiple' | 'judge'
type Mode = 'setup' | 'practice' | 'result'
type SessionKind = 'normal' | 'mistakes' | 'review'

type Option = {
  key: string
  text: string
}

type Question = {
  id: number
  type: QuestionType
  stem: string
  options: Option[]
  answer: string
}

type BankData = {
  source: string
  total: number
  counts: Record<QuestionType, number>
  questions: Question[]
}

type SessionQuestion = Question & {
  sessionNo: number
}

type MistakeRecord = {
  id: number
  wrongCount: number
  lastWrongAt: string
}

const questionBank = bank as BankData

const TYPE_ORDER: QuestionType[] = ['single', 'multiple', 'judge']
const TYPE_LABEL: Record<QuestionType, string> = {
  single: '单选',
  multiple: '多选',
  judge: '判断',
}

const SESSION_SIZE = 150
const STORAGE_KEY = 'vaccine-practice-mistakes'

const questionById = new Map(questionBank.questions.map((question) => [question.id, question]))

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[target]] = [next[target], next[index]]
  }
  return next
}

function allocateByRatio(counts: Record<QuestionType, number>, targetSize: number): Record<QuestionType, number> {
  const total = TYPE_ORDER.reduce((sum, type) => sum + counts[type], 0)
  const target = Math.min(targetSize, total)
  const allocation = Object.fromEntries(TYPE_ORDER.map((type) => [type, 0])) as Record<QuestionType, number>

  if (!total || !target) {
    return allocation
  }

  const weighted = TYPE_ORDER.map((type) => {
    const exact = (counts[type] / total) * target
    const base = Math.min(Math.floor(exact), counts[type])
    allocation[type] = base
    return { type, remainder: exact - base }
  })

  let remaining = target - TYPE_ORDER.reduce((sum, type) => sum + allocation[type], 0)
  while (remaining > 0) {
    const next = weighted
      .filter((item) => allocation[item.type] < counts[item.type])
      .sort((left, right) => right.remainder - left.remainder || counts[right.type] - counts[left.type])[0]

    if (!next) {
      break
    }

    allocation[next.type] += 1
    next.remainder = 0
    remaining -= 1
  }

  return allocation
}

const SESSION_PLAN = allocateByRatio(questionBank.counts, SESSION_SIZE)

function createSessionFromQuestions(questions: Question[], targetSize: number): SessionQuestion[] {
  const counts = TYPE_ORDER.reduce(
    (acc, type) => ({
      ...acc,
      [type]: questions.filter((question) => question.type === type).length,
    }),
    {} as Record<QuestionType, number>,
  )
  const plan = allocateByRatio(counts, targetSize)
  const selected = TYPE_ORDER.flatMap((type) => {
    const pool = questions.filter((question) => question.type === type)
    return shuffle(pool).slice(0, plan[type])
  })

  return selected.map((question, index) => ({
    ...question,
    sessionNo: index + 1,
  }))
}

function createNormalSession(): SessionQuestion[] {
  return createSessionFromQuestions(questionBank.questions, SESSION_SIZE)
}

function createMistakeSession(mistakes: Record<number, MistakeRecord>): SessionQuestion[] {
  const mistakeQuestions = Object.keys(mistakes)
    .map((id) => questionById.get(Number(id)))
    .filter((question): question is Question => Boolean(question))

  return createSessionFromQuestions(mistakeQuestions, SESSION_SIZE)
}

function normalizeAnswer(answer: string[] | undefined): string {
  return [...(answer ?? [])].sort().join('')
}

function isCorrect(question: Question, answer: string[] | undefined): boolean {
  return normalizeAnswer(answer) === normalizeAnswer(question.answer.split(''))
}

function loadMistakes(): Record<number, MistakeRecord> {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (!value) {
      return {}
    }

    const parsed = JSON.parse(value) as number[] | Record<number, MistakeRecord>
    if (Array.isArray(parsed)) {
      return Object.fromEntries(
        parsed.map((id) => [
          id,
          {
            id,
            wrongCount: 1,
            lastWrongAt: new Date().toISOString(),
          },
        ]),
      )
    }

    return parsed
  } catch {
    return {}
  }
}

function saveMistakes(records: Record<number, MistakeRecord>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

function App() {
  const [mode, setMode] = useState<Mode>('setup')
  const [sessionKind, setSessionKind] = useState<SessionKind>('normal')
  const [session, setSession] = useState<SessionQuestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string[]>>({})
  const [showReviewOnly, setShowReviewOnly] = useState(false)
  const [mistakes, setMistakes] = useState<Record<number, MistakeRecord>>(loadMistakes)

  const currentQuestion = session[currentIndex]
  const mistakeCount = Object.keys(mistakes).length
  const answeredCount = useMemo(
    () => session.filter((question) => answers[question.id]?.length).length,
    [answers, session],
  )

  const result = useMemo(() => {
    const wrong = session.filter((question) => !isCorrect(question, answers[question.id]))
    const correct = session.length - wrong.length
    const byType = TYPE_ORDER.map((type) => {
      const typed = session.filter((question) => question.type === type)
      const typedCorrect = typed.filter((question) => isCorrect(question, answers[question.id])).length
      return {
        type,
        total: typed.length,
        correct: typedCorrect,
      }
    })
    return { correct, wrong, byType }
  }, [answers, session])

  const reviewQuestions = useMemo(() => {
    if (!showReviewOnly) {
      return session
    }
    const wrongIds = new Set(result.wrong.map((question) => question.id))
    return session.filter((question) => wrongIds.has(question.id))
  }, [result.wrong, session, showReviewOnly])

  function beginSession(nextSession: SessionQuestion[], kind: SessionKind) {
    setSession(nextSession)
    setSessionKind(kind)
    setAnswers({})
    setCurrentIndex(0)
    setShowReviewOnly(false)
    setMode('practice')
  }

  function startPractice() {
    beginSession(createNormalSession(), 'normal')
  }

  function startMistakePractice() {
    const nextSession = createMistakeSession(mistakes)
    if (nextSession.length) {
      beginSession(nextSession, 'mistakes')
    }
  }

  function toggleAnswer(question: Question, key: string) {
    setAnswers((prev) => {
      const current = prev[question.id] ?? []
      if (question.type === 'multiple') {
        const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
        return { ...prev, [question.id]: next.sort() }
      }
      return { ...prev, [question.id]: [key] }
    })
  }

  function submitPaper() {
    const now = new Date().toISOString()
    const wrong = session.filter((question) => !isCorrect(question, answers[question.id]))
    const correct = session.filter((question) => isCorrect(question, answers[question.id]))
    const nextMistakes = { ...mistakes }

    if (sessionKind === 'mistakes') {
      correct.forEach((question) => {
        delete nextMistakes[question.id]
      })
    }

    wrong.forEach((question) => {
      const previous = nextMistakes[question.id]
      nextMistakes[question.id] = {
        id: question.id,
        wrongCount: (previous?.wrongCount ?? 0) + 1,
        lastWrongAt: now,
      }
    })

    setMistakes(nextMistakes)
    saveMistakes(nextMistakes)
    setMode('result')
  }

  function goReview(wrongOnly: boolean) {
    setSessionKind('review')
    setShowReviewOnly(wrongOnly)
    const firstId = wrongOnly ? result.wrong[0]?.id : session[0]?.id
    const index = Math.max(0, session.findIndex((question) => question.id === firstId))
    setCurrentIndex(index)
    setMode('practice')
  }

  function clearMistakes() {
    setMistakes({})
    saveMistakes({})
  }

  if (mode === 'setup') {
    return (
      <main className="app-shell">
        <section className="intro">
          <div>
            <p className="eyebrow">预防接种题库</p>
            <h1>香香加油刷题</h1>
            <p className="intro-copy">
              每次自动生成 150 题，按题库总量比例抽取，顺序固定为单选、多选、判断，做完立即查看成绩和错题。
            </p>
          </div>
          <button className="primary-action" type="button" onClick={startPractice}>
            开始练习
          </button>
        </section>

        <section className="stats-grid" aria-label="题库统计">
          <StatCard label="题库总量" value={questionBank.total} />
          <StatCard label="单选题" value={questionBank.counts.single} />
          <StatCard label="多选题" value={questionBank.counts.multiple} />
          <StatCard label="判断题" value={questionBank.counts.judge} />
        </section>

        <section className="paper-plan">
          <div>
            <h2>本套抽题规则</h2>
            <p>
              单选 {SESSION_PLAN.single} 道，多选 {SESSION_PLAN.multiple} 道，判断 {SESSION_PLAN.judge} 道，共{' '}
              {SESSION_SIZE} 道。
            </p>
          </div>
          <div className="mistake-strip">
            <span>错题库</span>
            <strong>{mistakeCount}</strong>
            <button type="button" onClick={startMistakePractice} disabled={!mistakeCount}>
              练错题
            </button>
            <button type="button" onClick={clearMistakes} disabled={!mistakeCount}>
              清空
            </button>
          </div>
        </section>
      </main>
    )
  }

  if (mode === 'result') {
    const score = session.length ? Math.round((result.correct / session.length) * 100) : 0
    return (
      <main className="app-shell">
        <section className="result-hero">
          <p className="eyebrow">{sessionKind === 'mistakes' ? '错题练习成绩' : '本次成绩'}</p>
          <div className="score">{score}</div>
          <p>
            答对 {result.correct} 题，答错 {result.wrong.length} 题，共 {session.length} 题。
          </p>
        </section>

        <section className="type-results">
          {result.byType.map((item) => (
            <div className="type-result" key={item.type}>
              <span>{TYPE_LABEL[item.type]}</span>
              <strong>
                {item.correct}/{item.total}
              </strong>
            </div>
          ))}
        </section>

        <div className="result-actions">
          <button className="primary-action" type="button" onClick={startPractice}>
            再来一套
          </button>
          <button type="button" onClick={() => goReview(true)} disabled={!result.wrong.length}>
            查看错题
          </button>
          <button type="button" onClick={startMistakePractice} disabled={!mistakeCount}>
            错题库
          </button>
        </div>
      </main>
    )
  }

  const visibleQuestions = reviewQuestions
  const visibleIndex = Math.max(
    0,
    visibleQuestions.findIndex((question) => question.id === currentQuestion?.id),
  )
  const progress = session.length ? (answeredCount / session.length) * 100 : 0

  return (
    <main className="practice-shell">
      <header className="practice-header">
        <div>
          <p className="eyebrow">
            {showReviewOnly ? '错题回看' : sessionKind === 'mistakes' ? '错题库练习' : '练习中'}
          </p>
          <h1>
            {currentQuestion ? currentQuestion.sessionNo : 0}/{session.length}
          </h1>
        </div>
        <button type="button" onClick={() => setMode('setup')}>
          退出
        </button>
      </header>

      <div className="progress-track">
        <div style={{ width: `${progress}%` }} />
      </div>

      {currentQuestion && (
        <section className="question-panel">
          <div className="question-meta">
            <span>{TYPE_LABEL[currentQuestion.type]}</span>
            <span>原题号 {currentQuestion.id}</span>
          </div>
          <h2>{currentQuestion.stem}</h2>
          <div className="options">
            {currentQuestion.options.map((option) => {
              const selected = answers[currentQuestion.id]?.includes(option.key)
              const answered = Boolean(answers[currentQuestion.id]?.length)
              const correctOption = currentQuestion.answer.includes(option.key)
              const wrongSelected = selected && answered && !correctOption
              return (
                <button
                  className={[
                    'option',
                    selected ? 'selected' : '',
                    answered && correctOption ? 'correct' : '',
                    wrongSelected ? 'wrong' : '',
                  ].join(' ')}
                  key={option.key}
                  type="button"
                  onClick={() => toggleAnswer(currentQuestion, option.key)}
                >
                  <span>{option.key}</span>
                  <strong>{option.text}</strong>
                </button>
              )
            })}
          </div>

          {answers[currentQuestion.id]?.length ? (
            <div className={isCorrect(currentQuestion, answers[currentQuestion.id]) ? 'answer-note ok' : 'answer-note bad'}>
              正确答案：{currentQuestion.answer}
            </div>
          ) : null}
        </section>
      )}

      <nav className="bottom-bar">
        <button
          type="button"
          onClick={() => {
            const prev = visibleQuestions[Math.max(0, visibleIndex - 1)]
            if (prev) setCurrentIndex(session.findIndex((question) => question.id === prev.id))
          }}
          disabled={visibleIndex <= 0}
        >
          上一题
        </button>
        <button
          type="button"
          onClick={() => {
            const next = visibleQuestions[Math.min(visibleQuestions.length - 1, visibleIndex + 1)]
            if (next) setCurrentIndex(session.findIndex((question) => question.id === next.id))
          }}
          disabled={visibleIndex >= visibleQuestions.length - 1}
        >
          下一题
        </button>
        <button className="primary-action" type="button" onClick={submitPaper}>
          交卷
        </button>
      </nav>
    </main>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default App
