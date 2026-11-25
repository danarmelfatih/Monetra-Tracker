import { GUEST_FAMILY_ID, GUEST_USER_ID } from './guest.js'
import { makeGuestId, nowIso } from './guest-db.js'

export function defaultGuestCategories(now = nowIso()) {
  return [
    { id: makeGuestId('cat'), family_id: GUEST_FAMILY_ID, name: 'Gaji', type: 'income', icon: null, color: '#16A36A', is_default: true, is_archived: false, created_at: now, updated_at: now },
    { id: makeGuestId('cat'), family_id: GUEST_FAMILY_ID, name: 'Bonus', type: 'income', icon: null, color: '#087F5B', is_default: true, is_archived: false, created_at: now, updated_at: now },
    { id: makeGuestId('cat'), family_id: GUEST_FAMILY_ID, name: 'Hadiah', type: 'income', icon: null, color: '#db2777', is_default: true, is_archived: false, created_at: now, updated_at: now },
    { id: makeGuestId('cat'), family_id: GUEST_FAMILY_ID, name: 'Makanan', type: 'expense', icon: null, color: '#E45D62', is_default: true, is_archived: false, created_at: now, updated_at: now },
    { id: makeGuestId('cat'), family_id: GUEST_FAMILY_ID, name: 'Transportasi', type: 'expense', icon: null, color: '#E9A23B', is_default: true, is_archived: false, created_at: now, updated_at: now },
    { id: makeGuestId('cat'), family_id: GUEST_FAMILY_ID, name: 'Tagihan', type: 'expense', icon: null, color: '#5C6B65', is_default: true, is_archived: false, created_at: now, updated_at: now },
    { id: makeGuestId('cat'), family_id: GUEST_FAMILY_ID, name: 'Belanja', type: 'expense', icon: null, color: '#086B4D', is_default: true, is_archived: false, created_at: now, updated_at: now }
  ]
}

export function defaultGuestWallet(now = nowIso()) {
  return {
    id: makeGuestId('wallet'),
    family_id: GUEST_FAMILY_ID,
    owner_id: null,
    name: 'Dompet Utama Keluarga',
    type: 'cash',
    scope: 'family_main',
    initial_balance: 0,
    is_archived: false,
    version: 1,
    created_at: now,
    updated_at: now
  }
}

export function defaultGuestSavingsWallet(now = nowIso()) {
  return {
    id: makeGuestId('wallet'),
    family_id: GUEST_FAMILY_ID,
    owner_id: null,
    name: 'Tabungan Keluarga',
    type: 'savings',
    scope: 'family_savings',
    initial_balance: 0,
    is_archived: false,
    version: 1,
    created_at: now,
    updated_at: now
  }
}

export function defaultGuestLegacyWallet(now = nowIso()) {
  return {
    id: makeGuestId('wallet'),
    family_id: GUEST_FAMILY_ID,
    owner_id: GUEST_USER_ID,
    name: 'Dompet Lama',
    type: 'cash',
    scope: 'legacy_personal',
    initial_balance: 0,
    is_archived: true,
    version: 1,
    created_at: now,
    updated_at: now
  }
}
