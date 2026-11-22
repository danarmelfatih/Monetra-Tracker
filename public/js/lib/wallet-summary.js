const total = (rows) => rows.reduce((sum, row) => sum + Number(row.balance), 0)

export const isSavingsWallet = (wallet) => wallet?.type === 'savings'

export const walletKindLabel = (type) => type === 'savings' ? 'Tabungan' : 'Dompet'

export function splitWalletBalances(wallets = [], balances = []) {
  const typeById = new Map(wallets.map((wallet) => [wallet.id, wallet.type]))
  const saldoBalances = []
  const savingsBalances = []

  for (const row of balances) {
    if (typeById.get(row.wallet_id) === 'savings') savingsBalances.push(row)
    else saldoBalances.push(row)
  }

  return {
    saldoBalances,
    savingsBalances,
    saldoCount: saldoBalances.length,
    savingsCount: savingsBalances.length,
    saldoTotal: total(saldoBalances),
    savingsTotal: total(savingsBalances)
  }
}
