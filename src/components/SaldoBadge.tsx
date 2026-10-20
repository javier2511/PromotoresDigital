import { Coins } from 'lucide-react'
import { esVacio, formatValue, isNumeric } from '../lib/text'
import { Badge } from './ui/Badge'

/** "Saldo: 15,230" (saldo_premia del cliente). No se muestra si está vacío. */
export function SaldoBadge({ saldo }: { saldo: unknown }) {
  if (esVacio(saldo)) return null
  return <Badge icon={<Coins className="size-3" />}>Saldo: {formatValue(isNumeric(saldo) ? Number(saldo) : saldo)}</Badge>
}
