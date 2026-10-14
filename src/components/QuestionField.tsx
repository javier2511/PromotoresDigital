import { Check, X } from 'lucide-react'
import { yesNoOptions, type AnswerValue, type Question } from '../lib/questions'
import { normalize } from '../lib/text'
import { cn } from './ui/cn'

interface FieldProps {
  question: Question
  value: AnswerValue | undefined
  onChange: (value: AnswerValue) => void
}

const same = (a: string, b: string) => normalize(a) === normalize(b)

function YesNo({ question, value, onChange }: FieldProps) {
  const [yes, no] = yesNoOptions(question)
  const current = typeof value === 'string' ? value : ''
  const button = (label: string, kind: 'yes' | 'no') => {
    const active = current !== '' && same(current, label)
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => onChange(active ? '' : label)}
        className={cn(
          'flex h-14 flex-1 items-center justify-center gap-2 rounded-xl border-2 text-[16px] font-semibold transition active:scale-[0.98]',
          active
            ? kind === 'yes'
              ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
              : 'border-zinc-700 bg-zinc-700 text-white dark:border-zinc-500 dark:bg-zinc-600'
            : 'border-line bg-card text-fg hover:border-brand-300',
        )}
      >
        {kind === 'yes' ? <Check className="size-5" strokeWidth={2.6} /> : <X className="size-5" strokeWidth={2.6} />}
        {/* Se guarda "Si" (como en tus reglas), pero se muestra con acento. */}
        {normalize(label) === 'si' ? 'Sí' : label}
      </button>
    )
  }
  return (
    <div className="flex gap-3">
      {button(yes, 'yes')}
      {button(no, 'no')}
    </div>
  )
}

function Single({ question, value, onChange }: FieldProps) {
  const current = typeof value === 'string' ? value : ''
  if (question.options.length === 0) return <TextInput question={question} value={value} onChange={onChange} />
  if (question.options.length > 7) {
    return (
      <select
        value={question.options.find((o) => same(o, current)) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-xl border border-line bg-card px-3.5 text-[16px] text-fg outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
      >
        <option value="">Selecciona una opción…</option>
        {question.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  }
  return (
    <div role="radiogroup" className="grid gap-2">
      {question.options.map((o) => {
        const active = current !== '' && same(o, current)
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(active ? '' : o)}
            className={cn(
              'flex min-h-12 items-center gap-3 rounded-xl border-2 px-3.5 py-2.5 text-left text-[15px] font-medium transition active:scale-[0.99]',
              active ? 'border-brand-600 bg-brand-500/8' : 'border-line bg-card hover:border-brand-300',
            )}
          >
            <span
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-full border-2 transition',
                active ? 'border-brand-600' : 'border-line',
              )}
            >
              {active && <span className="size-2.5 rounded-full bg-brand-600" />}
            </span>
            {o}
          </button>
        )
      })}
    </div>
  )
}

function Multi({ question, value, onChange }: FieldProps) {
  const current = Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : []
  const toggle = (option: string) => {
    const has = current.some((v) => same(v, option))
    onChange(has ? current.filter((v) => !same(v, option)) : [...current, option])
  }
  return (
    <div className="flex flex-wrap gap-2">
      {question.options.map((o) => {
        const active = current.some((v) => same(v, o))
        return (
          <button
            key={o}
            type="button"
            role="checkbox"
            aria-checked={active}
            onClick={() => toggle(o)}
            className={cn(
              'flex min-h-11 items-center gap-2 rounded-full border-2 px-4 text-[15px] font-medium transition active:scale-[0.98]',
              active
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-line bg-card text-fg hover:border-brand-300',
            )}
          >
            {active && <Check className="size-4" strokeWidth={3} />}
            {o}
          </button>
        )
      })}
    </div>
  )
}

const inputClass =
  'w-full rounded-xl border border-line bg-card px-3.5 text-[16px] text-fg outline-none transition placeholder:text-muted/70 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15'

export function QuestionInput(props: FieldProps) {
  const { question, value, onChange } = props
  const text = typeof value === 'string' ? value : ''
  switch (question.type) {
    case 'yesno':
      return <YesNo {...props} />
    case 'single':
      return <Single {...props} />
    case 'multi':
      return question.options.length ? <Multi {...props} /> : <TextInput {...props} />
    case 'number':
      return (
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className={cn(inputClass, 'h-12 tabular-nums')}
        />
      )
    case 'date':
      return (
        <input type="date" value={text} onChange={(e) => onChange(e.target.value)} className={cn(inputClass, 'h-12')} />
      )
    case 'longtext':
      return (
        <textarea
          rows={4}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Escribe tu respuesta…"
          className={cn(inputClass, 'resize-y py-3')}
        />
      )
    default:
      return <TextInput {...props} />
  }
}

function TextInput({ value, onChange }: FieldProps) {
  return (
    <input
      type="text"
      value={typeof value === 'string' ? value : Array.isArray(value) ? value.join(', ') : ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Escribe tu respuesta…"
      className={cn(inputClass, 'h-12')}
    />
  )
}
