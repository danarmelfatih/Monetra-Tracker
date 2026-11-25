const total = (rows) => rows.reduce((sum, row) => sum + Number(row.balance ?? 0), 0)

export const isSavingsWallet = (wallet) => wallet?.type === 'savings' || wallet?.scope === 'family_savings' || /tabungan/i.test(wallet?.name || '')

export const walletKindLabel = (type) => type === 'savings' ? 'Tabungan' : 'Dompet'

export const isFamilyMainWallet = (wallet) => wallet?.scope === 'family_main'

export const isFamilySavingsWallet = (wallet) => wallet?.scope === 'family_savings'

export const isLegacyPersonalWallet = (wallet) => !wallet?.scope || wallet.scope === 'legacy_personal'

export const walletScopeLabel = (wallet) => {
  if (isFamilyMainWallet(wallet)) return 'Dompet Utama Keluarga'
  if (isFamilySavingsWallet(wallet)) return 'Tabungan Keluarga'
  return 'Dompet Lama'
}

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

export function summarizeFamilyBalances(wallets = [], balances = []) {
  const byId = new Map(balances.map((row) => [row.wallet_id, Number(row.balance ?? 0)]))
  const balanceOf = (wallet) => Number(byId.get(wallet.id) ?? wallet.initial_balance ?? 0)
  const mainWallet = wallets.find((wallet) => isFamilyMainWallet(wallet) && !wallet.is_archived) ?? null
  const savingsWallet = wallets.find((wallet) => isFamilySavingsWallet(wallet) && !wallet.is_archived) ?? null
  const legacyWallets = wallets.filter((wallet) => isLegacyPersonalWallet(wallet) && !wallet.is_archived)
  const main = mainWallet ? { ...mainWallet, balance: balanceOf(mainWallet) } : null
  const savings = savingsWallet ? { ...savingsWallet, balance: balanceOf(savingsWallet) } : null
  const legacy = legacyWallets.map((wallet) => ({ ...wallet, balance: balanceOf(wallet) }))

  const mainBalance = main?.balance ?? 0
  const savingsBalance = savings?.balance ?? 0
  const legacyTotal = legacy.reduce((sum, wallet) => sum + wallet.balance, 0)
  return {
    main,
    savings,
    legacy,
    mainBalance,
    savingsBalance,
    legacyTotal,
    legacyCount: legacy.length,
    total: mainBalance + savingsBalance + legacyTotal
  }
}


export function summarizeWalletBalances(wallets = [], balances = []) {
  const balanceMap = new Map(balances.map((r) => [r.wallet_id, Number(r.balance)]))
  const active = wallets.filter((w) => !w.is_archived)
  const savings = active.filter(isSavingsWallet)
  const ready = active.filter((w) => !isSavingsWallet(w))
  const sum = (list) => list.reduce((acc, w) => acc + (balanceMap.get(w.id) ?? Number(w.initial_balance ?? 0)), 0)
  return { ready: sum(ready), savings: sum(savings), total: sum(active), savingsCount: savings.length }
}
