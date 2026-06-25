import { useMemo, useState } from 'react'
import bank from './data/questions.json'
import './App.css'

type QuestionType = 'single' | 'multiple' | 'judge'
type Mode = 'setup' | 'practice' | 'result'

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

const questionBank = bank as BankData

const TYPE_LABEL: Record<QuestionType, string> = {
  single: '单选',
  multiple: '多选',
  judge: '判断',
}

const PLAN: Record<QuestionType, number> = {
  single: 70,
  multiple: 40,
  judge: 40,
}

const STORAGE_KEY = 'vaccine-practice-mistakes'

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[target]] = [next[target], next[index]]
  }
  return next
}

function createSession(): SessionQuestion[] {
  const selected = (Object.keys(PLAN) as QuestionType[]).flatMap((type) => {
    const pool = questionBank.questions.filter((question) => question.type === type)
    return shuffle(pool).slice(0, PLAN[type])
  })

  return shuffle(selected).map((question, index) => ({
    ...question,
    sessionNo: index + 1,
  }))
}

function normalizeAnswer(answer: string[] | undefined): string {
  return [...(answer ?? [])].sort().join('')
}

function isCorrect(question: Question, answer: string[] | undefined): boolean {
  return normalizeAnswer(answer) === normalizeAnswer(question.answer.split(''))
}

function loadMistakeIds(): number[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value ? JSON.parse(value) : []
  } catch {
    return []
  }
}

function saveMistakeIds(ids: number[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(ids)]))
}

function App() {
  const [mode, setMode] = useState<Mode>('setup')
  const [session, setSession] = useState<SessionQuestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string[]>>({})
  const [showReviewOnly, setShowReviewOnly] = useState(false)
  const [mistakeIds, setMistakeIds] = useState<number[]>(loadMistakeIds)

  const currentQuestion = session[currentIndex]
  const answeredCount = useMemo(
    () => session.filter((question) => answers[question.id]?.length).length,
    [answers, session],
  )

  const result = useMemo(() => {
    const wrong = session.filter((question) => !isCorrect(question, answers[question.id]))
    const correct = session.length - wrong.length
    const byType = (Object.keys(TYPE_LABEL) as QuestionType[]).map((type) => {
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

  function startPractice() {
    const nextSession = createSession()
    setSession(nextSession)
    setAnswers({})
    setCurrentIndex(0)
    setShowReviewOnly(false)
    setMode('practice')
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
    const wrongIds = session
      .filter((question) => !isCorrect(question, answers[question.id]))
      .map((question) => question.id)
    const nextMistakes = [...mistakeIds, ...wrongIds]
    setMistakeIds([...new Set(nextMistakes)])
    saveMistakeIds(nextMistakes)
    setMode('result')
  }

  function goReview(wrongOnly: boolean) {
    setShowReviewOnly(wrongOnly)
    const firstId = wrongOnly ? result.wrong[0]?.id : session[0]?.id
    const index = Math.max(0, session.findIndex((question) => question.id === firstId))
    setCurrentIndex(index)
    setMode('practice')
  }

  function clearMistakes() {
    setMistakeIds([])
    saveMistakeIds([])
  }

  if (mode === 'setup') {
    return (
      <main className="app-shell">
        <section className="intro">
          <div>
            <p className="eyebrow">预防接种题库</p>
            <h1>扫码就能刷题</h1>
            <p className="intro-copy">每次自动生成 150 题，覆盖单选、多选、判断，做完立即看得分和错题。</p>
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
            <p>单选 {PLAN.single} 道，多选 {PLAN.multiple} 道，判断 {PLAN.judge} 道，共 150 道。</p>
          </div>
          <div className="mistake-strip">
            <span>本机错题</span>
            <strong>{mistakeIds.length}</strong>
            <button type="button" onClick={clearMistakes} disabled={!mistakeIds.length}>
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
          <p className="eyebrow">本次成绩</p>
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
          <button type="button" onClick={() => goReview(false)}>
            回看全部
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

  return (
    <main className="practice-shell">
      <header className="practice-header">
        <div>
          <p className="eyebrow">{showReviewOnly ? '错题回看' : '练习中'}</p>
          <h1>
            {currentQuestion ? currentQuestion.sessionNo : 0}/{session.length}
          </h1>
        </div>
        <button type="button" onClick={() => setMode('setup')}>
          退出
        </button>
      </header>

      <div className="progress-track">
        <div style={{ width: `${(answeredCount / session.length) * 100}%` }} />
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
              const reveal = showReviewOnly || mode === 'practice'
              const answered = Boolean(answers[currentQuestion.id]?.length)
              const correctOption = currentQuestion.answer.includes(option.key)
              const wrongSelected = selected && answered && reveal && !correctOption
              return (
                <button
                  className={[
                    'option',
                    selected ? 'selected' : '',
                    reveal && answered && correctOption ? 'correct' : '',
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
