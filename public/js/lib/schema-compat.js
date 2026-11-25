export function isMissingFamilyFinanceSchema(error) {
  const msg = String(error?.message || error || '')
  const code = String(error?.code || '')
  return code === '42703' && msg.includes('wallets.scope')
    || code === 'PGRST205' && /family_main_balances|family_savings_balances|savings_ledger|family_income_report_entries/.test(msg)
    || msg.includes('column wallets.scope does not exist')
    || msg.includes('Could not find the table') && /family_main_balances|family_savings_balances|savings_ledger|family_income_report_entries/.test(msg)
}
